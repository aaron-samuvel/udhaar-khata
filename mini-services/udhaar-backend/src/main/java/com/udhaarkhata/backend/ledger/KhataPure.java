package com.udhaarkhata.backend.ledger;

import com.udhaarkhata.backend.audit.AuditEvent;
import com.udhaarkhata.backend.ledger.dto.CustomerPublic;
import com.udhaarkhata.backend.ledger.dto.ReminderPublic;
import com.udhaarkhata.backend.ledger.dto.SettingsPublic;
import com.udhaarkhata.backend.ledger.dto.TxnPublic;
import com.udhaarkhata.backend.reminder.Reminder;
import com.udhaarkhata.backend.user.ShopSettings;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/**
 * Pure helpers shared by the services — Java port of src/lib/khata-pure.ts and
 * src/lib/format.ts. No Spring/DB dependencies. Money is integer paise
 * everywhere; time boundaries are computed in IST (UTC+5:30) exactly like the
 * Next.js backend, so both backends agree on "today".
 */
public final class KhataPure {

    public static final ZoneOffset IST = ZoneOffset.ofHoursMinutes(5, 30);
    private static final DateTimeFormatter IST_TIME =
        DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.ENGLISH);

    /** Maximum single-transaction amount: ₹10,00,000 (sane kirana upper bound). */
    public static final long RUPEE_MAX = 1_000_000;
    /** Window in which an identical entry triggers a duplicate warning (ms). */
    public static final long DUPLICATE_WINDOW_MS = 3 * 60 * 1000L;

    private KhataPure() {}

    /* ---------------- time ---------------- */

    /** YYYY-MM-DD key for a timestamp in IST. */
    public static String istDayKey(Instant t) {
        return LocalDate.ofInstant(t, IST).toString();
    }

    /** Midnight in IST for the IST-day containing `t`. */
    public static Instant istDayStart(Instant t) {
        return LocalDate.ofInstant(t, IST).atStartOfDay(IST).toInstant();
    }

    /** Readable IST timestamp like "21 Nov, 5:12 PM" → we use "2026-11-22 16:53 IST". */
    public static String istTimestamp(Instant t) {
        return IST_TIME.format(t.atOffset(IST)) + " IST";
    }

    /** Whole days elapsed since `t` (0 for null or future dates). */
    public static int daysSince(Instant t) {
        if (t == null) return 0;
        return (int) Math.max(0, (System.currentTimeMillis() - t.toEpochMilli()) / 86_400_000L);
    }

    /* ---------------- money ---------------- */

    public static long rupeesToPaise(double rupees) {
        return Math.round(rupees * 100);
    }

    public static double paiseToRupees(long paise) {
        return paise / 100.0;
    }

    /* ---------------- identity ---------------- */

    public static String nameKey(String name) {
        return name == null ? "" : name.trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
    }

    /** Keep only 10-digit Indian mobile numbers (strips +91 / 91 prefixes). */
    public static String normalizePhone(String phone) {
        if (phone == null) return null;
        String digits = phone.replaceAll("\\D", "");
        if (digits.startsWith("91") && digits.length() == 12) digits = digits.substring(2);
        return digits.length() == 10 ? digits : null;
    }

    /* ---------------- WhatsApp / UPI ---------------- */

    /** Basic UPI VPA shape: local@bank. */
    public static boolean isValidUpiId(String v) {
        return v != null && v.trim().matches("^[A-Za-z0-9._\\-]{2,256}@[A-Za-z]{2,64}$");
    }

    /** UPI intent URI that opens any UPI app with the amount pre-filled. */
    public static String upiCollectLink(String upiId, String payeeName, long amountPaise, String note) {
        return "upi://pay?" + formParams(
            "pa", upiId.trim(),
            "pn", cut(payeeName, 50),
            "am", BigDecimal.valueOf(amountPaise, 2).setScale(2, RoundingMode.HALF_UP).toPlainString(),
            "cu", "INR",
            "tn", cut(note, 50));
    }

    /** Render the reminder template. Placeholders: {name} {amount} {shop} {days}. */
    public static String renderTemplate(String tpl, String name, String amount, String shop, int days) {
        return tpl
            .replace("{name}", name)
            .replace("{amount}", amount)
            .replace("{shop}", shop)
            .replace("{days}", String.valueOf(days));
    }

    /**
     * Extras appended after the shopkeeper's reminder template: the amount in
     * words (standard on Indian receipts) and, when a UPI ID is configured,
     * a one-tap payment link.
     */
    public static java.util.List<String> reminderExtras(ShopSettings settings, String name, long balancePaise) {
        java.util.List<String> extras = new java.util.ArrayList<>();
        extras.add("Amount in words: " + amountInWords(balancePaise));
        if (settings.getUpiId() != null && isValidUpiId(settings.getUpiId())) {
            extras.add("Pay in one tap: "
                + upiCollectLink(settings.getUpiId(), settings.getShopName(), balancePaise, "Udhaar " + name));
        }
        return extras;
    }

    /* ---------------- amount in words (Indian numbering system) ---------------- */

    private static final String[] ONES = {
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen"};
    private static final String[] TENS = {
        "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"};

    private static String twoDigits(int n) {
        if (n < 20) return ONES[n];
        int t = n / 10, o = n % 10;
        return o == 0 ? TENS[t] : TENS[t] + " " + ONES[o];
    }

    private static String threeDigits(int n) {
        int h = n / 100, rest = n % 100;
        if (h == 0) return twoDigits(rest);
        String head = ONES[h] + " Hundred";
        return rest == 0 ? head : head + " " + twoDigits(rest);
    }

    /**
     * Integer paise → "Rupees Two Hundred Thirty Only" (Indian lakh/crore
     * system). Paise fraction appears only when non-zero. Deterministic —
     * safe for receipts and reminders.
     */
    public static String amountInWords(long paise) {
        long p = Math.max(0, paise);
        long rupees = p / 100;
        long paisa = p % 100;

        String words;
        if (rupees == 0) {
            words = "Zero";
        } else {
            java.util.List<String> parts = new java.util.ArrayList<>();
            long crore = rupees / 10_000_000;
            long lakh = (rupees % 10_000_000) / 100_000;
            long thousand = (rupees % 100_000) / 1000;
            long hundred = rupees % 1000;
            if (crore > 0) parts.add(threeDigits((int) crore) + " Crore");
            if (lakh > 0) parts.add(twoDigits((int) lakh) + " Lakh");
            if (thousand > 0) parts.add(twoDigits((int) thousand) + " Thousand");
            if (hundred > 0) parts.add(threeDigits((int) hundred));
            words = String.join(" ", parts);
        }

        if (paisa > 0) {
            return "Rupees " + words + " and " + twoDigits((int) paisa) + " Paise Only";
        }
        return "Rupees " + words + " Only";
    }

    /* ---------------- serializers ---------------- */

    public static TxnPublic publicTxn(Transaction t) {
        return new TxnPublic(
            t.getId().toString(),
            t.getName(),
            t.getNameKey(),
            paiseToRupees(t.getAmountPaise()),
            t.getAmountPaise(),
            t.getTxnType(),
            t.getRawText(),
            t.getNote(),
            t.isReversed(),
            t.isReversal(),
            t.getCreatedAt().toString());
    }

    public static CustomerPublic publicCustomer(Customer c) {
        return new CustomerPublic(
            c.getName(),
            c.getNameKey(),
            paiseToRupees(c.getBalancePaise()),
            c.getBalancePaise(),
            c.getPhone(),
            c.getNotes(),
            c.getCreditLimitPaise(),
            c.getCreditLimitPaise() != null ? paiseToRupees(c.getCreditLimitPaise()) : null,
            c.isArchived(),
            c.getFirstDueAt() == null ? null : c.getFirstDueAt().toString(),
            c.getLastTxnAt() == null ? null : c.getLastTxnAt().toString(),
            c.getCreatedAt().toString());
    }

    public static SettingsPublic publicSettings(ShopSettings s) {
        return new SettingsPublic(
            s.getShopName(),
            s.getOverdueDays(),
            s.getReminderTemplate(),
            s.getUpiId(),
            s.isDemoData());
    }

    public static ReminderPublic publicReminder(Reminder r) {
        return new ReminderPublic(
            r.getId().toString(),
            r.getName(),
            paiseToRupees(r.getBalancePaise()),
            r.getBalancePaise(),
            r.getDaysOverdue(),
            r.getPhone(),
            r.getWhatsappUrl(),
            r.getMessage(),
            r.getRunId(),
            r.getCreatedAt().toString());
    }

    public static com.udhaarkhata.backend.ledger.dto.AuditPublic publicAudit(AuditEvent e) {
        return new com.udhaarkhata.backend.ledger.dto.AuditPublic(
            e.getId().toString(),
            e.getAction(),
            e.getEntity(),
            e.getEntityId(),
            e.getData(),
            e.getCreatedAt().toString());
    }

    /* ---------------- misc ---------------- */

    public static String csvEscape(Object v) {
        String s = v == null ? "" : String.valueOf(v);
        return s.matches(".*[\",\\n].*") ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
    }

    public static String cut(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String formParams(String... kv) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < kv.length; i += 2) {
            if (i > 0) sb.append('&');
            sb.append(URLEncoder.encode(kv[i], StandardCharsets.UTF_8))
              .append('=')
              .append(URLEncoder.encode(kv[i + 1], StandardCharsets.UTF_8));
        }
        return sb.toString();
    }
}
