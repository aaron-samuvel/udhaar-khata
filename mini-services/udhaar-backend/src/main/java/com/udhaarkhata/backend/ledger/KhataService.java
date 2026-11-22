package com.udhaarkhata.backend.ledger;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.udhaarkhata.backend.audit.AuditEvent;
import com.udhaarkhata.backend.audit.AuditRepository;
import com.udhaarkhata.backend.ledger.dto.CustomerPublic;
import com.udhaarkhata.backend.ledger.dto.SettingsPublic;
import com.udhaarkhata.backend.ledger.dto.TxnPublic;
import com.udhaarkhata.backend.reminder.Reminder;
import com.udhaarkhata.backend.reminder.ReminderRepository;
import com.udhaarkhata.backend.security.UserPrincipal;
import com.udhaarkhata.backend.user.ShopSettings;
import com.udhaarkhata.backend.user.ShopSettingsRepository;
import com.udhaarkhata.backend.web.NotFoundException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * The ledger core — Java port of src/lib/khata.ts. Every query is scoped by
 * userId (multi-shop isolation); every financially significant action lands
 * in the append-only audit trail; all money is integer paise.
 */
@Service
public class KhataService {

    private final CustomerRepository customers;
    private final TransactionRepository transactions;
    private final ShopSettingsRepository settingsRepo;
    private final ReminderRepository reminders;
    private final AuditRepository audit;
    private final ObjectMapper json;

    public KhataService(CustomerRepository customers, TransactionRepository transactions,
                        ShopSettingsRepository settingsRepo, ReminderRepository reminders,
                        AuditRepository audit, ObjectMapper json) {
        this.customers = customers;
        this.transactions = transactions;
        this.settingsRepo = settingsRepo;
        this.reminders = reminders;
        this.audit = audit;
        this.json = json;
    }

    /* ================= settings ================= */

    public ShopSettings getSettings(UUID userId) {
        return settingsRepo.findByUserId(userId).orElseGet(() -> {
            ShopSettings s = new ShopSettings();
            s.setUserId(userId);
            return settingsRepo.save(s);
        });
    }

    public SettingsPublic settingsPublic(UUID userId) {
        return KhataPure.publicSettings(getSettings(userId));
    }

    public record SettingsPatch(String shopName, Integer overdueDays, String reminderTemplate,
                                String upiId, Boolean demoData) {}

    @Transactional
    public SettingsPublic updateSettings(UUID userId, SettingsPatch patch) {
        // Same validation contract as the Next.js zod schema.
        if (patch.upiId() != null && !patch.upiId().trim().isEmpty()
                && !KhataPure.isValidUpiId(patch.upiId())) {
            throw new IllegalArgumentException("UPI ID must look like yourname@bank (e.g. shop@okicici).");
        }
        if (patch.shopName() != null && patch.shopName().trim().isEmpty()) {
            throw new IllegalArgumentException("Shop name is required.");
        }
        if (patch.overdueDays() != null && (patch.overdueDays() < 0 || patch.overdueDays() > 365)) {
            throw new IllegalArgumentException("Invalid settings.");
        }
        if (patch.reminderTemplate() != null && patch.reminderTemplate().length() < 10) {
            throw new IllegalArgumentException("Invalid settings.");
        }

        ShopSettings settings = getSettings(userId);
        if (patch.shopName() != null) settings.setShopName(patch.shopName().trim());
        if (patch.overdueDays() != null) settings.setOverdueDays(patch.overdueDays());
        if (patch.reminderTemplate() != null) settings.setReminderTemplate(patch.reminderTemplate());
        if (patch.upiId() != null) {
            settings.setUpiId(patch.upiId().trim().isEmpty() ? null : patch.upiId().trim());
        }
        if (patch.demoData() != null) settings.setDemoData(patch.demoData());

        pushAudit(userId, "settings_update", "settings", "singleton",
            Map.of("patch", patchKeys(patch)));
        return KhataPure.publicSettings(settings);
    }

    private static List<String> patchKeys(SettingsPatch patch) {
        List<String> keys = new ArrayList<>();
        if (patch.shopName() != null) keys.add("shopName");
        if (patch.overdueDays() != null) keys.add("overdueDays");
        if (patch.reminderTemplate() != null) keys.add("reminderTemplate");
        if (patch.upiId() != null) keys.add("upiId");
        if (patch.demoData() != null) keys.add("demoData");
        return keys;
    }

    /* ================= WhatsApp links ================= */

    public record WhatsAppLink(String url, String message, String upiLink) {}

    public WhatsAppLink whatsappLink(UUID userId, String name, long balancePaise, String phone, int days) {
        ShopSettings s = getSettings(userId);
        List<String> parts = new ArrayList<>();
        parts.add(KhataPure.renderTemplate(
            s.getReminderTemplate(), name,
            KhataPure.paiseToRupees(balancePaise) + "",
            s.getShopName(), days));
        parts.addAll(KhataPure.reminderExtras(s, name, balancePaise));
        String message = String.join("\n", parts);
        String encoded = urlEncode(message);
        String digits = KhataPure.normalizePhone(phone);
        String url = digits != null
            ? "https://wa.me/91" + digits + "?text=" + encoded
            : "https://wa.me/?text=" + encoded;
        String upiLink = s.getUpiId() != null && KhataPure.isValidUpiId(s.getUpiId())
            ? KhataPure.upiCollectLink(s.getUpiId(), s.getShopName(), balancePaise, "Udhaar " + name)
            : null;
        return new WhatsAppLink(url, message, upiLink);
    }

    /**
     * JS encodeURIComponent keeps RFC-2396 unreserved + a few literal chars;
     * Java URLEncoder differs on some characters, so encode like JS by
     * post-replacing the known divergences. Wa.me only needs a valid query —
     * this keeps messages byte-identical for the common Hinglish/English text.
     */
    private static String urlEncode(String s) {
        StringBuilder sb = new StringBuilder();
        for (byte b : s.getBytes(StandardCharsets.UTF_8)) {
            char c = (char) (b & 0xff);
            if (Character.isLetterOrDigit(c) || "-_.~".indexOf(c) >= 0) {
                sb.append(c);
            } else if (c == ' ') {
                sb.append("%20");
            } else {
                sb.append('%');
                sb.append(String.format("%02X", b));
            }
        }
        return sb.toString();
    }

    /* ================= ledger core ================= */

    public record AddTxnInput(
            String customer,
            long amountPaise,
            String txnType,
            String rawText,
            String note,
            String phone,
            boolean force,
            boolean isReversal,
            UUID reversedById) {}

    public record OverLimit(long creditLimitPaise, long balanceAfterPaise) {}

    public record AddTxnResult(TxnPublic transaction, CustomerPublic customer,
                               TxnPublic duplicate, OverLimit overLimit) {}

    @Transactional
    public AddTxnResult addTransaction(UUID userId, AddTxnInput input) {
        if (input.amountPaise() <= 0) {
            throw new IllegalArgumentException("Amount must be greater than zero.");
        }
        String key = KhataPure.nameKey(input.customer());
        if (key.isEmpty()) {
            throw new IllegalArgumentException("Customer name is required.");
        }
        String phone = KhataPure.normalizePhone(input.phone());
        if (input.phone() != null && !input.phone().isEmpty() && phone == null) {
            throw new IllegalArgumentException(
                "Phone must be a 10-digit Indian mobile number (with optional +91).");
        }

        Customer existing = customers.findByUserIdAndNameKey(userId, key).orElse(null);

        // Archived customers are out of active business — the shopkeeper must
        // explicitly unarchive before new entries land, otherwise money could
        // hide inside an archived khata.
        if (existing != null && existing.isArchived()) {
            throw new IllegalArgumentException(existing.getName()
                + " is archived. Unarchive them from the Customers tab before adding entries.");
        }

        if (!input.force() && !input.isReversal()) {
            var dupe = transactions
                .findFirstByUserIdAndNameKeyAndTxnTypeAndAmountPaiseAndReversedFalseAndIsReversalFalseAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(
                    userId, key, input.txnType(), input.amountPaise(),
                    Instant.ofEpochMilli(System.currentTimeMillis() - KhataPure.DUPLICATE_WINDOW_MS))
                .orElse(null);
            if (dupe != null) {
                return new AddTxnResult(
                    KhataPure.publicTxn(dupe),
                    existing != null ? KhataPure.publicCustomer(existing) : customerShellFrom(dupe),
                    KhataPure.publicTxn(dupe),
                    null);
            }
        }

        Instant now = Instant.now();
        long delta = "UDHAAR".equals(input.txnType()) ? input.amountPaise() : -input.amountPaise();
        long oldBalance = existing != null ? existing.getBalancePaise() : 0;
        long newBalance = oldBalance + delta;

        String displayName = existing != null ? existing.getName() : input.customer().trim();
        String savedPhone = phone != null ? phone : (existing != null ? existing.getPhone() : null);

        // Credit-limit advisory: fires when a udhaar pushes the balance past
        // the customer's optional cap. The entry is still saved — the
        // shopkeeper makes the final call.
        OverLimit overLimit = "UDHAAR".equals(input.txnType())
            && existing != null && existing.getCreditLimitPaise() != null
            && newBalance > existing.getCreditLimitPaise()
            ? new OverLimit(existing.getCreditLimitPaise(), newBalance)
            : null;

        UUID customerId;
        if (existing != null) {
            existing.setName(displayName);
            existing.setPhone(savedPhone);
            existing.setBalancePaise(newBalance);
            existing.setFirstDueAt(applyFirstDue(existing.getFirstDueAt(), oldBalance, newBalance, now));
            existing.setLastTxnAt(now);
            customerId = existing.getId();
        } else {
            Customer created = new Customer();
            created.setUserId(userId);
            created.setName(displayName);
            created.setNameKey(key);
            created.setBalancePaise(newBalance);
            created.setPhone(savedPhone);
            created.setFirstDueAt(newBalance > 0 ? now : null);
            created.setLastTxnAt(now);
            customerId = customers.save(created).getId();
        }

        Transaction txn = new Transaction();
        txn.setUserId(userId);
        txn.setCustomerId(customerId);
        txn.setName(displayName);
        txn.setNameKey(key);
        txn.setAmountPaise(input.amountPaise());
        txn.setTxnType(input.txnType());
        txn.setRawText(input.rawText());
        txn.setNote(input.note());
        txn.setReversal(input.isReversal());
        txn.setReversedById(input.reversedById());
        txn.setCreatedAt(now);
        transactions.save(txn);

        pushAudit(userId, "transaction_create", "transaction", txn.getId().toString(),
            Map.of("customer", displayName,
                   "txnType", input.txnType(),
                   "amountPaise", input.amountPaise(),
                   "forced", input.force(),
                   "isReversal", input.isReversal()));

        Customer after = customers.findById(customerId).orElseThrow();
        return new AddTxnResult(KhataPure.publicTxn(txn), KhataPure.publicCustomer(after), null, overLimit);
    }

    private static Instant applyFirstDue(Instant firstDueAt, long oldBalance, long newBalance, Instant now) {
        if (newBalance > 0 && (firstDueAt == null || oldBalance <= 0)) return now;
        if (newBalance <= 0) return null;
        return firstDueAt;
    }

    /** Stand-in customer projection used when a duplicate hit has no customer row. */
    private static CustomerPublic customerShellFrom(Transaction t) {
        return new CustomerPublic(t.getName(), t.getNameKey(), 0, 0, null, null,
            null, null, false, null, t.getCreatedAt().toString(), t.getCreatedAt().toString());
    }

    @Transactional
    public AddTxnResult reverseTransaction(UUID userId, String id) {
        Transaction orig;
        try {
            orig = transactions.findById(UUID.fromString(id)).orElse(null);
        } catch (IllegalArgumentException e) {
            orig = null;
        }
        if (orig == null || !orig.getUserId().equals(userId)) {
            throw new NotFoundException("Transaction not found.");
        }
        if (orig.isReversed()) {
            throw new IllegalArgumentException("This transaction has already been reversed.");
        }
        if (orig.isReversal()) {
            throw new IllegalArgumentException(
                "A reversal entry cannot be reversed. Reverse the original transaction instead.");
        }
        Customer customer = customers.findByUserIdAndNameKey(userId, orig.getNameKey())
            .orElseThrow(() -> new NotFoundException("Customer record missing for this transaction."));

        Instant now = Instant.now();
        String flip = "UDHAAR".equals(orig.getTxnType()) ? "PAYMENT" : "UDHAAR";
        long delta = "UDHAAR".equals(flip) ? orig.getAmountPaise() : -orig.getAmountPaise();
        long oldBalance = customer.getBalancePaise();
        long newBalance = oldBalance + delta;

        Transaction reversal = new Transaction();
        reversal.setUserId(userId);
        reversal.setCustomerId(customer.getId());
        reversal.setName(orig.getName());
        reversal.setNameKey(orig.getNameKey());
        reversal.setAmountPaise(orig.getAmountPaise());
        reversal.setTxnType(flip);
        reversal.setRawText("Reversal of: " + orig.getRawText());
        reversal.setNote("Reversal of transaction " + orig.getId());
        reversal.setReversal(true);
        reversal.setReversedById(orig.getId());
        reversal.setCreatedAt(now);
        transactions.save(reversal);

        orig.setReversed(true);
        orig.setReversedById(reversal.getId());

        customer.setBalancePaise(newBalance);
        customer.setFirstDueAt(applyFirstDue(customer.getFirstDueAt(), oldBalance, newBalance, now));
        customer.setLastTxnAt(now);

        pushAudit(userId, "transaction_reverse", "transaction", orig.getId().toString(),
            Map.of("reversalId", reversal.getId().toString(),
                   "customer", orig.getName(),
                   "amountPaise", orig.getAmountPaise(),
                   "originalType", orig.getTxnType()));

        return new AddTxnResult(KhataPure.publicTxn(reversal), KhataPure.publicCustomer(customer), null, null);
    }

    /* ================= customers ================= */

    public List<CustomerPublic> listCustomers(UUID userId, String q, boolean onlyArchived) {
        List<Customer> rows = (q == null || q.isBlank())
            ? customers.findByUserIdAndArchivedOrderByBalancePaiseDescNameAsc(userId, onlyArchived)
            : customers.findByUserIdAndArchivedAndNameContainingIgnoreCaseOrderByBalancePaiseDescNameAsc(
                userId, onlyArchived, q);
        return rows.stream().map(KhataPure::publicCustomer).toList();
    }

    public Page<CustomerPublic> listCustomersPaged(UUID userId, String q, boolean onlyArchived, int page, int size) {
        var pageable = PageRequest.of(Math.max(0, page), Math.min(Math.max(1, size), 100));
        Page<Customer> result = (q == null || q.isBlank())
            ? customers.findByUserIdAndArchivedOrderByBalancePaiseDescNameAsc(userId, onlyArchived, pageable)
            : customers.findByUserIdAndArchivedAndNameContainingIgnoreCaseOrderByBalancePaiseDescNameAsc(
                userId, onlyArchived, q, pageable);
        return result.map(KhataPure::publicCustomer);
    }

    public record CustomerDetail(CustomerPublic customer, List<TxnPublic> transactions) {}

    public CustomerDetail getCustomerWithTxns(UUID userId, String name) {
        String key = KhataPure.nameKey(name);
        Customer customer = customers.findByUserIdAndNameKey(userId, key)
            .orElseThrow(() -> new NotFoundException("No customer named " + name + "."));
        List<TxnPublic> txns = transactions
            .findByUserIdAndCustomerIdOrderByCreatedAtDesc(userId, customer.getId(),
                PageRequest.of(0, 200))
            .stream().map(KhataPure::publicTxn).toList();
        return new CustomerDetail(KhataPure.publicCustomer(customer), txns);
    }

    public record CustomerPatch(String phone, String notes, Double creditLimitRupees, Boolean archived) {}

    @Transactional
    public CustomerPublic updateCustomer(UUID userId, String name, CustomerPatch patch) {
        String key = KhataPure.nameKey(name);
        Customer existing = customers.findByUserIdAndNameKey(userId, key)
            .orElseThrow(() -> new NotFoundException("No customer named " + name + "."));

        Map<String, Boolean> changed = new LinkedHashMap<>();
        if (patch.phone() != null) {
            if (patch.phone().isEmpty()) {
                existing.setPhone(null);
            } else {
                String p = KhataPure.normalizePhone(patch.phone());
                if (p == null) {
                    throw new IllegalArgumentException(
                        "Phone must be a 10-digit Indian mobile number (with optional +91).");
                }
                existing.setPhone(p);
            }
            changed.put("phoneChanged", true);
        }
        if (patch.notes() != null) {
            String notes = patch.notes().trim();
            existing.setNotes(notes.isEmpty() ? null : notes);
            changed.put("notesChanged", true);
        }
        if (patch.creditLimitRupees() != null) {
            double limit = patch.creditLimitRupees();
            if (!Double.isFinite(limit) || limit < 0 || limit > KhataPure.RUPEE_MAX) {
                throw new IllegalArgumentException("Credit limit must be between 0 and " + KhataPure.RUPEE_MAX + ".");
            }
            existing.setCreditLimitPaise(Math.round(limit * 100));
            changed.put("creditLimitChanged", true);
        }
        if (patch.archived() != null) {
            // Only settled (zero balance) customers can be archived so
            // outstanding money can never be archived away.
            if (patch.archived() && existing.getBalancePaise() > 0) {
                throw new IllegalArgumentException(
                    "Only customers with a settled (zero) balance can be archived.");
            }
            existing.setArchived(patch.archived());
            changed.put("archivedChanged", true);
        }

        pushAudit(userId, "update_customer", "customer", key, changed);
        return KhataPure.publicCustomer(existing);
    }

    /* ================= statements ================= */

    public record Statement(String whatsappUrl, String message, String upiLink,
                            CustomerPublic customer, int lines) {}

    public Statement customerStatement(UUID userId, String name) {
        String key = KhataPure.nameKey(name);
        Customer c = customers.findByUserIdAndNameKey(userId, key)
            .orElseThrow(() -> new NotFoundException("No customer named " + name + "."));

        List<Transaction> txns = transactions
            .findTop20ByUserIdAndCustomerIdAndReversedFalseAndIsReversalFalseOrderByCreatedAtDesc(
                userId, c.getId());
        ShopSettings settings = getSettings(userId);

        List<String> lines = txns.stream()
            .map(t -> {
                String sign = "UDHAAR".equals(t.getTxnType()) ? "+" : "−";
                return KhataPure.istTimestamp(t.getCreatedAt()) + "  " + sign
                    + "₹" + String.format(java.util.Locale.ROOT, "%.2f", t.getAmountPaise() / 100.0)
                    + " — " + t.getRawText();
            })
            .toList();

        List<String> tail = new ArrayList<>();
        tail.add(c.getBalancePaise() > 0
            ? "Udhaar pending: ₹" + String.format(java.util.Locale.ROOT, "%.2f", c.getBalancePaise() / 100.0)
            : "Khata settled: ₹" + String.format(java.util.Locale.ROOT, "%.2f", c.getBalancePaise() / 100.0));
        if (c.getBalancePaise() > 0) {
            tail.addAll(KhataPure.reminderExtras(settings, c.getName(), c.getBalancePaise()));
            tail.add("Kripya jald payment kar dein. Dhanyavaad!");
        } else {
            tail.add("Payment ke liye dhanyavaad!");
        }

        String message = String.join("\n", buildStatementMessage(settings, c, lines, tail));

        String encoded = urlEncode(message);
        String digits = KhataPure.normalizePhone(c.getPhone());
        String whatsappUrl = digits != null
            ? "https://wa.me/91" + digits + "?text=" + encoded
            : "https://wa.me/?text=" + encoded;
        String upiLink = c.getBalancePaise() > 0 && settings.getUpiId() != null
                && KhataPure.isValidUpiId(settings.getUpiId())
            ? KhataPure.upiCollectLink(settings.getUpiId(), settings.getShopName(),
                c.getBalancePaise(), "Udhaar " + c.getName())
            : null;

        return new Statement(whatsappUrl, message, upiLink, KhataPure.publicCustomer(c), lines.size());
    }

    private static List<String> buildStatementMessage(ShopSettings settings, Customer c,
                                                      List<String> lines, List<String> tail) {
        List<String> all = new ArrayList<>();
        all.add("*" + settings.getShopName() + "* — khata statement");
        all.add("Customer: " + c.getName());
        all.add("");
        all.addAll(lines.isEmpty() ? List.of("(no entries yet)") : lines);
        all.add("");
        all.addAll(tail);
        return all;
    }

    /* ================= audit ================= */

    public void pushAudit(UUID userId, String action, String entity, String entityId, Map<String, ?> data) {
        AuditEvent event = new AuditEvent();
        event.setUserId(userId);
        event.setAction(action);
        event.setEntity(entity);
        event.setEntityId(entityId);
        try {
            event.setData(json.writeValueAsString(data));
        } catch (Exception e) {
            event.setData("{}");
        }
        audit.save(event);
    }

    public List<com.udhaarkhata.backend.ledger.dto.AuditPublic> listAudit(UUID userId, int limit) {
        int clamped = Math.min(Math.max(limit, 1), 200);
        return audit.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, clamped))
            .stream().map(KhataPure::publicAudit).toList();
    }

    /* ================= demo data ================= */

    /** Wipe the shop's ledger and seed the clearly-labeled demo dataset. */
    @Transactional
    public Map<String, Integer> resetDemoData(UUID userId) {
        // Bulk deletes execute immediately (Hibernate queues inserts BEFORE
        // deletes, so entity deleteAll + re-inserting the same name keys would
        // violate the (user_id, name_key) unique index).
        reminders.deleteAllForUser(userId);
        transactions.deleteAllForUser(userId);
        customers.deleteAllForUser(userId);
        audit.deleteAllForUser(userId);

        Map<String, Integer> counts = seedDemo(userId);

        ShopSettings settings = getSettings(userId);
        settings.setDemoData(true);

        pushAudit(userId, "demo_reset", "settings", "singleton",
            Map.of("seeded", "demo dataset",
                   "customers", counts.get("customers"),
                   "transactions", counts.get("transactions")));
        return counts;
    }

    /** Same seed dataset as the Next.js backend (resetDemoData in khata.ts). */
    public Map<String, Integer> seedDemo(UUID userId) {
        Instant now = Instant.now();
        java.util.function.BiFunction<Integer, Integer, Instant> daysAgo = (n, h) ->
            java.time.ZonedDateTime.ofInstant(now, java.time.ZoneOffset.UTC)
                .minusDays(n).toLocalDate()
                .atTime(h, 0).toInstant(java.time.ZoneOffset.UTC);

        Customer amit = saveDemoCustomer(userId, "AMIT", "Amit", 20000, null,
            "Buys groceries on credit every week.", daysAgo.apply(3, 10), now, daysAgo.apply(3, 10));
        Customer ramesh = saveDemoCustomer(userId, "RAMESH", "Ramesh", 7000, null,
            "Regular customer, pays partially.", daysAgo.apply(2, 10), daysAgo.apply(1, 10), daysAgo.apply(2, 10));
        Customer sita = saveDemoCustomer(userId, "SITA", "Sita", 0, "9876543210",
            "Prefers UPI payments.", null, daysAgo.apply(1, 10), daysAgo.apply(2, 10));

        saveDemoTxn(userId, amit, "Amit", 15000, "UDHAAR", "Amit ne 150 ka udhaar liya", daysAgo.apply(3, 10));
        saveDemoTxn(userId, ramesh, "Ramesh", 12000, "UDHAAR", "Ramesh took 2 kg rice for 120 rupees", daysAgo.apply(2, 10));
        saveDemoTxn(userId, sita, "Sita", 30000, "UDHAAR", "Sita ji liya 300 ka saman", daysAgo.apply(2, 12));
        saveDemoTxn(userId, ramesh, "Ramesh", 5000, "PAYMENT", "Ramesh paid 50", daysAgo.apply(1, 10));
        saveDemoTxn(userId, sita, "Sita", 30000, "PAYMENT", "Sita paid 300", daysAgo.apply(1, 14));
        saveDemoTxn(userId, amit, "Amit", 5000, "UDHAAR", "Amit ne 50 ka udhaar liya", now);

        return Map.of("customers", 3, "transactions", 6);
    }

    private Customer saveDemoCustomer(UUID userId, String key, String name, long balancePaise,
                                      String phone, String notes, Instant firstDueAt,
                                      Instant lastTxnAt, Instant createdAt) {
        Customer c = new Customer();
        c.setUserId(userId);
        c.setName(name);
        c.setNameKey(key);
        c.setBalancePaise(balancePaise);
        c.setPhone(phone);
        c.setNotes(notes);
        c.setFirstDueAt(firstDueAt);
        c.setLastTxnAt(lastTxnAt);
        c.setCreatedAt(createdAt);
        return customers.save(c);
    }

    private void saveDemoTxn(UUID userId, Customer c, String name, long amountPaise,
                             String type, String raw, Instant at) {
        Transaction t = new Transaction();
        t.setUserId(userId);
        t.setCustomerId(c.getId());
        t.setName(name);
        t.setNameKey(c.getNameKey());
        t.setAmountPaise(amountPaise);
        t.setTxnType(type);
        t.setRawText(raw);
        t.setCreatedAt(at);
        transactions.save(t);
    }
}
