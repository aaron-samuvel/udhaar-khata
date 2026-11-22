package com.udhaarkhata.backend.transfer;

import com.udhaarkhata.backend.audit.AuditRepository;
import com.udhaarkhata.backend.ledger.Customer;
import com.udhaarkhata.backend.ledger.CustomerRepository;
import com.udhaarkhata.backend.ledger.KhataPure;
import com.udhaarkhata.backend.ledger.KhataService;
import com.udhaarkhata.backend.ledger.Transaction;
import com.udhaarkhata.backend.ledger.TransactionRepository;
import com.udhaarkhata.backend.ledger.dto.CustomerPublic;
import com.udhaarkhata.backend.ledger.dto.SettingsPublic;
import com.udhaarkhata.backend.ledger.dto.TxnPublic;
import com.udhaarkhata.backend.reminder.Reminder;
import com.udhaarkhata.backend.reminder.ReminderRepository;
import com.udhaarkhata.backend.ledger.dto.ReminderPublic;
import com.udhaarkhata.backend.user.ShopSettings;
import com.udhaarkhata.backend.user.ShopSettingsRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Backup/restore and CSV exports — Java port of the export/import logic in
 * src/lib/khata.ts. The backup format is byte-compatible with the Next.js
 * backend ("udhaar-khata-backup", version 2) so a ledger can move between
 * backends freely. Balances are ALWAYS recomputed from the imported ledger
 * lines — numbers in the file are never trusted.
 */
@Service
public class TransferService {

    private static final int MAX_BACKUP_CUSTOMERS = 1000;
    private static final int MAX_BACKUP_TRANSACTIONS = 5000;

    private final CustomerRepository customers;
    private final TransactionRepository transactions;
    private final ReminderRepository reminderRepo;
    private final AuditRepository auditRepo;
    private final ShopSettingsRepository settingsRepo;
    private final KhataService khata;

    public TransferService(CustomerRepository customers, TransactionRepository transactions,
                           ReminderRepository reminderRepo, AuditRepository auditRepo,
                           ShopSettingsRepository settingsRepo, KhataService khata) {
        this.customers = customers;
        this.transactions = transactions;
        this.reminderRepo = reminderRepo;
        this.auditRepo = auditRepo;
        this.settingsRepo = settingsRepo;
        this.khata = khata;
    }

    /* ---------------- backup ---------------- */

    public Map<String, Object> backupJson(UUID userId) {
        List<CustomerPublic> customerRows = customers.findByUserId(userId)
            .stream().map(KhataPure::publicCustomer).toList();
        List<TxnPublic> txnRows = transactions
            .findByUserIdOrderByCreatedAtAsc(userId, PageRequest.of(0, MAX_BACKUP_TRANSACTIONS))
            .stream().map(KhataPure::publicTxn).toList();
        List<ReminderPublic> reminderRows = reminderRepo
            .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 200))
            .stream().map(KhataPure::publicReminder).toList();
        List<Map<String, Object>> auditRows = auditRepo
            .findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 500))
            .stream().map(e -> {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", e.getId().toString());
                row.put("action", e.getAction());
                row.put("entity", e.getEntity());
                row.put("entityId", e.getEntityId());
                row.put("data", e.getData());
                row.put("createdAt", e.getCreatedAt().toString());
                return row;
            }).toList();

        SettingsPublic settings = KhataPure.publicSettings(khata.getSettings(userId));
        Instant exportedAt = Instant.now();

        Map<String, Object> backup = new LinkedHashMap<>();
        backup.put("format", "udhaar-khata-backup");
        backup.put("version", 2);
        backup.put("exportedAt", exportedAt.toString());
        Map<String, Integer> counts = new LinkedHashMap<>();
        counts.put("customers", customerRows.size());
        counts.put("transactions", txnRows.size());
        counts.put("reminders", reminderRows.size());
        counts.put("auditEvents", auditRows.size());
        backup.put("counts", counts);
        backup.put("settings", settings);
        backup.put("customers", customerRows);
        backup.put("transactions", txnRows);
        backup.put("reminders", reminderRows);
        backup.put("auditEvents", auditRows);
        return backup;
    }

    /* ---------------- CSVs ---------------- */

    public String transactionsCsv(UUID userId) {
        List<Transaction> txns = transactions.findByUserIdOrderByCreatedAtAsc(
            userId, PageRequest.of(0, MAX_BACKUP_TRANSACTIONS));
        List<String> lines = new ArrayList<>();
        lines.add("Date (IST),Customer,Type,Amount (INR),Entry Text,Note,Status");
        for (Transaction t : txns) {
            String status = t.isReversed() ? "REVERSED" : t.isReversal() ? "REVERSAL ENTRY" : "OK";
            lines.add(String.join(",",
                List.of(
                    KhataPure.csvEscape(KhataPure.istDayKey(t.getCreatedAt()) + " "
                        + istTimeOfDay(t.getCreatedAt())),
                    KhataPure.csvEscape(t.getName()),
                    KhataPure.csvEscape(t.getTxnType()),
                    KhataPure.csvEscape(String.format(java.util.Locale.ROOT, "%.2f",
                        KhataPure.paiseToRupees(t.getAmountPaise()))),
                    KhataPure.csvEscape(t.getRawText()),
                    KhataPure.csvEscape(t.getNote() == null ? "" : t.getNote()),
                    KhataPure.csvEscape(status))));
        }
        return String.join("\n", lines);
    }

    public String outstandingCsv(UUID userId) {
        List<String> lines = new ArrayList<>();
        lines.add("Customer,Phone,Balance (INR),Days Due,Credit Limit (INR),Over Limit,Archived,Notes");
        for (Customer c : customers.findByUserId(userId).stream()
                .sorted((a, b) -> Long.compare(b.getBalancePaise(), a.getBalancePaise())).toList()) {
            String overLimit = c.getCreditLimitPaise() != null
                && c.getBalancePaise() > c.getCreditLimitPaise() ? "YES" : "NO";
            lines.add(String.join(",", List.of(
                KhataPure.csvEscape(c.getName()),
                KhataPure.csvEscape(c.getPhone() == null ? "" : c.getPhone()),
                KhataPure.csvEscape(String.format(java.util.Locale.ROOT, "%.2f",
                    KhataPure.paiseToRupees(c.getBalancePaise()))),
                KhataPure.csvEscape(c.getBalancePaise() > 0
                    ? String.valueOf(KhataPure.daysSince(
                        c.getFirstDueAt() != null ? c.getFirstDueAt() : c.getLastTxnAt()))
                    : "0"),
                KhataPure.csvEscape(c.getCreditLimitPaise() != null
                    ? String.format(java.util.Locale.ROOT, "%.2f", KhataPure.paiseToRupees(c.getCreditLimitPaise()))
                    : ""),
                KhataPure.csvEscape(overLimit),
                KhataPure.csvEscape(c.isArchived() ? "YES" : "NO"),
                KhataPure.csvEscape(c.getNotes() == null ? "" : c.getNotes()))));
        }
        return String.join("\n", lines);
    }

    /** HH:mm of the instant in IST (matches the Next.js CSV date cell). */
    private static String istTimeOfDay(Instant t) {
        return java.time.format.DateTimeFormatter.ofPattern("HH:mm")
            .withLocale(java.util.Locale.ROOT)
            .format(t.atOffset(KhataPure.IST));
    }

    /* ---------------- restore ---------------- */

    public record RestoreResult(String mode, int importedCustomers, int importedTransactions,
                                int skippedTransactions, String exportedAt) {}

    @SuppressWarnings("unchecked")
    @Transactional
    public RestoreResult restore(UUID userId, Map<String, Object> backup, String mode) {
        if (!"replace".equals(mode) && !"merge".equals(mode)) {
            throw new IllegalArgumentException("Choose a restore mode: \"merge\" or \"replace\".");
        }
        if (backup == null) {
            throw new IllegalArgumentException("No backup content was provided.");
        }
        if (!"udhaar-khata-backup".equals(backup.get("format"))) {
            throw new IllegalArgumentException(
                "This file is not a Udhaar Khata backup (missing the format marker). Use the 'Full backup (JSON)' export.");
        }
        Object rawCustomers = backup.get("customers");
        Object rawTxns = backup.get("transactions");
        if (!(rawCustomers instanceof List<?>) || !(rawTxns instanceof List<?>)) {
            throw new IllegalArgumentException("The backup is missing its customers or transactions list.");
        }
        List<Map<String, Object>> backupCustomers = (List<Map<String, Object>>) (List<?>) rawCustomers;
        List<Map<String, Object>> backupTxns = (List<Map<String, Object>>) (List<?>) rawTxns;
        if (backupCustomers.size() > MAX_BACKUP_CUSTOMERS) {
            throw new IllegalArgumentException("Too many customers in the backup (max " + MAX_BACKUP_CUSTOMERS + ").");
        }
        if (backupTxns.size() > MAX_BACKUP_TRANSACTIONS) {
            throw new IllegalArgumentException("Too many transactions in the backup (max " + MAX_BACKUP_TRANSACTIONS + ").");
        }

        // ---- validate every row before touching the database ----
        List<Map<String, Object>> customersIn = new ArrayList<>();
        for (int i = 0; i < backupCustomers.size(); i++) {
            Map<String, Object> c = backupCustomers.get(i);
            String key = str(c.get("nameKey")).trim().toUpperCase();
            String name = str(c.get("name")).trim();
            if (key.isEmpty() || name.isEmpty()) {
                throw new IllegalArgumentException("Customer row " + (i + 1) + " is missing a name.");
            }
            Map<String, Object> row = new HashMap<>();
            row.put("nameKey", key);
            row.put("name", name);
            row.put("phone", KhataPure.normalizePhone(str(c.get("phone"))));
            row.put("notes", c.get("notes") instanceof String ? c.get("notes") : null);
            row.put("creditLimitPaise", validPaise(c.get("creditLimitPaise")));
            row.put("archived", Boolean.TRUE.equals(c.get("archived")));
            customersIn.add(row);
        }

        List<Map<String, Object>> txnsIn = new ArrayList<>();
        for (int i = 0; i < backupTxns.size(); i++) {
            Map<String, Object> t = backupTxns.get(i);
            String key = str(t.get("nameKey")).trim().toUpperCase();
            Long paise = validPaise(t.get("amountPaise"));
            String type = str(t.get("txnType"));
            String createdAt = str(t.get("createdAt"));
            if (key.isEmpty()) {
                throw new IllegalArgumentException("Transaction row " + (i + 1) + " is missing the customer.");
            }
            if (paise == null) {
                throw new IllegalArgumentException("Transaction row " + (i + 1) + " has an invalid amount.");
            }
            if (!"UDHAAR".equals(type) && !"PAYMENT".equals(type)) {
                throw new IllegalArgumentException("Transaction row " + (i + 1) + " has an unknown entry type.");
            }
            Instant at;
            try {
                at = Instant.parse(createdAt);
            } catch (Exception e) {
                throw new IllegalArgumentException("Transaction row " + (i + 1) + " has an invalid date.");
            }
            Map<String, Object> row = new HashMap<>();
            row.put("id", t.get("id") instanceof String s && !s.isEmpty() ? s : null);
            row.put("nameKey", key);
            row.put("name", t.get("name") instanceof String s && !s.trim().isEmpty() ? s.trim() : key);
            row.put("amountPaise", paise);
            row.put("txnType", type);
            row.put("rawText", t.get("rawText") instanceof String s && !s.trim().isEmpty()
                ? s : "Restored from backup");
            row.put("note", t.get("note") instanceof String s ? s : null);
            row.put("reversed", Boolean.TRUE.equals(t.get("reversed")));
            row.put("isReversal", Boolean.TRUE.equals(t.get("isReversal")));
            row.put("createdAt", at);
            txnsIn.add(row);
        }

        // Customer stubs keep ledger lines whose customer row is missing.
        java.util.Set<String> known = new java.util.HashSet<>();
        for (Map<String, Object> c : customersIn) known.add((String) c.get("nameKey"));
        for (Map<String, Object> t : txnsIn) {
            String key = (String) t.get("nameKey");
            if (!known.contains(key)) {
                Map<String, Object> stub = new HashMap<>();
                stub.put("nameKey", key);
                stub.put("name", t.get("name"));
                stub.put("phone", null);
                stub.put("notes", null);
                stub.put("creditLimitPaise", null);
                stub.put("archived", false);
                customersIn.add(stub);
                known.add(key);
            }
        }

        String exportedAt = backup.get("exportedAt") instanceof String s ? s : null;
        int skipped = 0;

        if ("replace".equals(mode)) {
            // Bulk deletes execute immediately — see KhataService.resetDemoData.
            reminderRepo.deleteAllForUser(userId);
            transactions.deleteAllForUser(userId);
            customers.deleteAllForUser(userId);
        }

        // ---- customers (merge never overwrites existing profile edits) ----
        Map<String, Customer> byKey = new LinkedHashMap<>();
        for (Map<String, Object> c : customersIn) {
            String key = (String) c.get("nameKey");
            Customer existing = customers.findByUserIdAndNameKey(userId, key).orElse(null);
            if ("merge".equals(mode) && existing != null) {
                byKey.put(key, existing);
                continue;
            }
            if (existing == null) {
                Customer created = new Customer();
                created.setUserId(userId);
                created.setName((String) c.get("name"));
                created.setNameKey(key);
                created.setPhone((String) c.get("phone"));
                created.setNotes((String) c.get("notes"));
                created.setCreditLimitPaise((Long) c.get("creditLimitPaise"));
                created.setArchived((Boolean) c.get("archived"));
                byKey.put(key, customers.save(created));
            } else {
                existing.setName((String) c.get("name"));
                existing.setPhone((String) c.get("phone"));
                existing.setNotes((String) c.get("notes"));
                existing.setCreditLimitPaise((Long) c.get("creditLimitPaise"));
                existing.setArchived((Boolean) c.get("archived"));
                byKey.put(key, existing);
            }
        }

        // ---- transactions (dedupe by id in merge mode) ----
        int toImport = txnsIn.size();
        for (Map<String, Object> t : txnsIn) {
            String idStr = (String) t.get("id");
            if ("merge".equals(mode) && idStr != null
                && transactions.findById(UUID.fromString(idStr)).isPresent()) {
                skipped++;
                continue;
            }
            Customer customer = byKey.get(t.get("nameKey"));
            if (customer == null) continue;
            Transaction row = new Transaction();
            if (idStr != null) {
                try { row.setId(UUID.fromString(idStr)); } catch (IllegalArgumentException ignored) { /* new id */ }
            }
            row.setUserId(userId);
            row.setCustomerId(customer.getId());
            row.setName((String) t.get("name"));
            row.setNameKey((String) t.get("nameKey"));
            row.setAmountPaise((Long) t.get("amountPaise"));
            row.setTxnType((String) t.get("txnType"));
            row.setRawText((String) t.get("rawText"));
            row.setNote((String) t.get("note"));
            row.setReversed((Boolean) t.get("reversed"));
            row.setReversal((Boolean) t.get("isReversal"));
            row.setCreatedAt((Instant) t.get("createdAt"));
            transactions.save(row);
        }

        // ---- recompute every imported customer's balance FROM the ledger ----
        for (String key : known) {
            Customer c = byKey.get(key);
            if (c == null) continue;
            List<Transaction> own = transactions.findByUserIdAndCustomerId(userId, c.getId());
            long balance = 0;
            Instant last = null;
            Instant firstDue = null;
            for (Transaction t : own) {
                if (t.isReversed() || t.isReversal()) continue;
                balance += "UDHAAR".equals(t.getTxnType()) ? t.getAmountPaise() : -t.getAmountPaise();
                if (last == null || t.getCreatedAt().isAfter(last)) last = t.getCreatedAt();
                if ("UDHAAR".equals(t.getTxnType())
                    && (firstDue == null || t.getCreatedAt().isBefore(firstDue))) {
                    firstDue = t.getCreatedAt();
                }
            }
            c.setBalancePaise(balance);
            c.setLastTxnAt(last);
            c.setFirstDueAt(balance > 0 ? firstDue : null);
        }

        // A restore of real data means the ledger is no longer "demo".
        if ("replace".equals(mode)) {
            ShopSettings settings = khata.getSettings(userId);
            settings.setDemoData(false);
        }

        khata.pushAudit(userId, "import_backup", "settings", "singleton", Map.of(
            "mode", mode,
            "importedCustomers", customersIn.size(),
            "importedTransactions", toImport - skipped,
            "skippedTransactions", skipped,
            "exportedAt", exportedAt));

        return new RestoreResult(mode, customersIn.size(), toImport - skipped, skipped, exportedAt);
    }

    private static String str(Object v) {
        return v instanceof String s ? s : v == null ? "" : String.valueOf(v);
    }

    /** Valid integer-paise amount (0 < paise <= RUPEE_MAX * 100) or null. */
    private static Long validPaise(Object v) {
        if (v instanceof Number n) {
            long p = n.longValue();
            if (p > 0 && p <= KhataPure.RUPEE_MAX * 100) return p;
        }
        return null;
    }

    /* ---------------- demo reset ---------------- */

    @Transactional
    public Map<String, Integer> resetDemo(UUID userId) {
        return khata.resetDemoData(userId);
    }
}
