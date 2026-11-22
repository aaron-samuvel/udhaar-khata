package com.udhaarkhata.backend.report;

import com.udhaarkhata.backend.ledger.Customer;
import com.udhaarkhata.backend.ledger.CustomerRepository;
import com.udhaarkhata.backend.ledger.KhataPure;
import com.udhaarkhata.backend.ledger.Transaction;
import com.udhaarkhata.backend.ledger.TransactionRepository;
import com.udhaarkhata.backend.ledger.dto.ReportsResponse;
import com.udhaarkhata.backend.ledger.dto.ReportsResponse.*;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Reports computed from actual stored transactions — Java port of getReports()
 * in src/lib/khata.ts. Counting rules (documented, deterministic, no
 * double-counting): reversed lines are voided → excluded; isReversal lines
 * are corrections → excluded from totals but visible in recent activity;
 * outstanding comes from Customer.balancePaise; day boundaries are IST.
 */
@Service
public class ReportService {

    private static final Set<String> VALID = Set.of("today", "7d", "30d", "all", "custom");

    private final TransactionRepository transactions;
    private final CustomerRepository customers;

    public ReportService(TransactionRepository transactions, CustomerRepository customers) {
        this.transactions = transactions;
        this.customers = customers;
    }

    public ReportsResponse getReports(UUID userId, String range, String fromStr, String toStr) {
        if (range == null || !VALID.contains(range)) {
            throw new IllegalArgumentException("range must be one of: today, 7d, 30d, all, custom.");
        }
        Instant now = Instant.now();
        Instant fromD;
        Instant toD = now;
        String label;

        switch (range) {
            case "today" -> {
                fromD = KhataPure.istDayStart(now);
                label = "Today";
            }
            case "7d" -> {
                fromD = KhataPure.istDayStart(Instant.ofEpochMilli(now.toEpochMilli() - 6 * 86_400_000L));
                label = "Last 7 days";
            }
            case "30d" -> {
                fromD = KhataPure.istDayStart(Instant.ofEpochMilli(now.toEpochMilli() - 29 * 86_400_000L));
                label = "Last 30 days";
            }
            case "custom" -> {
                if (fromStr == null || fromStr.isBlank()) {
                    throw new IllegalArgumentException("A valid 'from' date is required for a custom range.");
                }
                Instant parsed = Instant.parse(fromStr);
                fromD = parsed;
                if (toStr != null && !toStr.isBlank()) toD = Instant.parse(toStr);
                label = "Custom range";
            }
            default -> {
                fromD = Instant.EPOCH;
                label = "All time";
            }
        }

        List<Transaction> txns = transactions
            .findByUserIdAndCreatedAtBetweenOrderByCreatedAtDesc(userId, fromD, toD);
        List<Transaction> countable = txns.stream()
            .filter(t -> !t.isReversed() && !t.isReversal()).toList();

        long creditPaise = 0;
        long paymentsPaise = 0;
        Map<String, long[]> seriesMap = new LinkedHashMap<>();
        for (Transaction t : countable) {
            String key = KhataPure.istDayKey(t.getCreatedAt());
            long[] bucket = seriesMap.getOrDefault(key, new long[]{0, 0});
            if ("UDHAAR".equals(t.getTxnType())) {
                creditPaise += t.getAmountPaise();
                bucket[0] += t.getAmountPaise();
            } else {
                paymentsPaise += t.getAmountPaise();
                bucket[1] += t.getAmountPaise();
            }
            seriesMap.put(key, bucket);
        }

        // Fill day buckets for short ranges so charts show continuous days.
        List<SeriesPoint> series = new ArrayList<>();
        Instant fillFrom = Instant.ofEpochMilli(Math.max(fromD.toEpochMilli(),
            now.toEpochMilli() - 30 * 86_400_000L));
        if (!"all".equals(range)) {
            for (Instant d = KhataPure.istDayStart(fillFrom); !d.isAfter(toD);
                 d = Instant.ofEpochMilli(d.toEpochMilli() + 86_400_000L)) {
                String key = KhataPure.istDayKey(d);
                long[] b = seriesMap.getOrDefault(key, new long[]{0, 0});
                series.add(new SeriesPoint(key, b[0] / 100.0, b[1] / 100.0));
            }
        } else {
            for (String key : seriesMap.keySet()) {
                long[] b = seriesMap.get(key);
                series.add(new SeriesPoint(key, b[0] / 100.0, b[1] / 100.0));
            }
        }

        List<Customer> active = customers.findByUserId(userId).stream()
            .filter(c -> !c.isArchived()).toList();
        List<Outstanding> customerOutstanding = active.stream()
            .filter(c -> c.getBalancePaise() > 0)
            .map(c -> new Outstanding(
                c.getName(), c.getPhone(),
                KhataPure.paiseToRupees(c.getBalancePaise()), c.getBalancePaise(),
                c.getCreditLimitPaise(),
                KhataPure.daysSince(c.getFirstDueAt() != null ? c.getFirstDueAt() : c.getLastTxnAt()),
                c.getNotes()))
            .sorted((a, b) -> Long.compare(b.balancePaise(), a.balancePaise()))
            .toList();

        return new ReportsResponse(
            new Range(fromD.toString(), toD.toString(), label),
            new Totals(KhataPure.paiseToRupees(creditPaise), KhataPure.paiseToRupees(paymentsPaise),
                (creditPaise - paymentsPaise) / 100.0, creditPaise, paymentsPaise, countable.size()),
            series,
            customerOutstanding,
            txns.stream().limit(10).map(KhataPure::publicTxn).toList(),
            new Meta(active.size(),
                (int) active.stream().filter(c -> c.getBalancePaise() > 0).count(),
                (int) active.stream().filter(c -> c.getBalancePaise() <= 0).count()));
    }
}
