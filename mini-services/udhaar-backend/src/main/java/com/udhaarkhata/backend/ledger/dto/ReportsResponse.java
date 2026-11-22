package com.udhaarkhata.backend.ledger.dto;

import java.util.List;

/** Reports response (mirrors ReportsResponse in types.ts). */
public record ReportsResponse(
        Range range,
        Totals totals,
        List<SeriesPoint> series,
        List<Outstanding> customerOutstanding,
        List<TxnPublic> recent,
        Meta meta
) {

    public record Range(String from, String to, String label) {}

    public record Totals(
            double credit,
            double payments,
            double net,
            long creditPaise,
            long paymentsPaise,
            int count
    ) {}

    public record SeriesPoint(String date, double credit, double payments) {}

    public record Outstanding(
            String name,
            String phone,
            double balance,
            long balancePaise,
            Long creditLimitPaise,
            int daysDue,
            String notes
    ) {}

    public record Meta(int customers, int withDues, int settled) {}
}
