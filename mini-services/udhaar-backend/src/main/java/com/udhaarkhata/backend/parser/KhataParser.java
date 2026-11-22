package com.udhaarkhata.backend.parser;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.MatchResult;
import java.util.regex.Pattern;

/**
 * Parse plain English / Hinglish shop sentences into a credit-ledger entry —
 * exact Java port of the TypeScript parser (src/lib/parser.ts) so both
 * backends classify identically:
 *
 *   Ramesh took 2 kg rice for 120 rupees  -> Ramesh, Rs 120, UDHAAR
 *   Ramesh paid 50                        -> Ramesh, Rs 50,  PAYMENT
 *   Amit ne 200 ka udhaar liya            -> Amit,   Rs 200, UDHAAR
 */
public final class KhataParser {

    public record ParseResult(
            boolean ok,
            String customer,
            Double amount,
            String txnType,
            String rawText,
            String error
    ) {
        public static ParseResult fail(String rawText, String error) {
            return new ParseResult(false, null, null, null, rawText, error);
        }
        public static ParseResult fail(String rawText, String customer, Double amount, String error) {
            return new ParseResult(false, customer, amount, null, rawText, error);
        }
    }

    private static final Set<String> PAYMENT_WORDS = Set.of(
        "paid", "payment", "pay", "pays", "paying",
        "diya", "diye", "dia", "deya", "diyaa", "jama", "jamah",
        "settled", "settle", "settlement", "wapas", "waapas",
        "return", "returned", "repay", "repaid",
        "clear", "cleared", "clearing", "deposit", "deposited",
        // money the customer GAVE to the shop ("Ramesh gave 50", "collected 50
        // from Ramesh", "Ramesh se 50 mila" must not be new credit).
        "gave", "gaye", "gae", "collect", "collects", "collected",
        "received", "receive", "mila", "milaa", "mile", "milgaya", "milgayi",
        "vasool", "vasoole", "vasoolee");

    private static final Set<String> UDHAAR_WORDS = Set.of(
        "took", "take", "takes", "taken", "udhaar", "udhar", "udhari",
        "liya", "liye", "lia", "liyaa", "lene", "credit",
        "kharid", "kharida", "kharidi", "kharide",
        "bought", "buy", "buys", "purchase", "purchased",
        "loan", "due", "borrowed", "borrow");

    private static final Set<String> HONORIFICS = Set.of("ji", "sir", "madam", "madame", "bhai", "ben", "anna");

    public static final Set<String> QUANTITY_UNITS = Set.of(
        "kg", "kilo", "kilos", "kilogram", "kilograms",
        "g", "gm", "gram", "grams",
        "ltr", "liter", "litre", "liters", "litres", "ml",
        "packet", "packets", "pkt", "pkts",
        "piece", "pieces", "pc", "pcs", "item", "items",
        "dozen", "darjan", "bag", "bags", "box", "boxes",
        "bottle", "bottles", "tin", "tins");

    private static final Set<String> NAME_STOP;

    static {
        Set<String> stop = new java.util.HashSet<>(Arrays.asList(
            "ne", "ko", "se", "ke", "ki", "ka", "a", "an", "the", "for", "from", "to", "of", "and",
            "rs", "rupee", "rupees", "inr", "on", "in", "with", "by", "as",
            "has", "have", "had", "his", "her", "their", "my", "our"));
        stop.addAll(PAYMENT_WORDS);
        stop.addAll(UDHAAR_WORDS);
        stop.addAll(QUANTITY_UNITS);
        NAME_STOP = Set.copyOf(stop);
    }

    private static final List<Pattern> AMOUNT_PATTERNS = List.of(
        Pattern.compile("₹\\s*(\\d+(?:\\.\\d{1,2})?)"),
        Pattern.compile("(?:rs\\.?|rupees?|inr)\\s*(\\d+(?:\\.\\d{1,2})?)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(\\d+(?:\\.\\d{1,2})?)\\s*(?:rs\\.?|rupees?|inr|₹|/-)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(?:for|ka|ki|ke)\\s+(\\d+(?:\\.\\d{1,2})?)\\b", Pattern.CASE_INSENSITIVE));

    private static final Pattern TOKEN_PATTERN = Pattern.compile("[A-Za-z]+|\\d+(?:\\.\\d{1,2})?");
    private static final Pattern WORD_PATTERN = Pattern.compile("[A-Za-z][A-Za-z'.]*");

    private KhataParser() {}

    private static double round2(double n) {
        return Math.round(n * 100) / 100.0;
    }

    private static String txnTypeOf(List<String> tokensLower) {
        boolean hasPayment = tokensLower.stream().anyMatch(PAYMENT_WORDS::contains);
        boolean hasUdhaar = tokensLower.stream().anyMatch(UDHAAR_WORDS::contains);
        // "paid his udhaar" / "udhaar settled" is a payment.
        if (hasPayment) return "PAYMENT";
        if (hasUdhaar) return "UDHAAR";
        return null;
    }

    private static Double extractAmount(String text) {
        for (Pattern pattern : AMOUNT_PATTERNS) {
            List<String> matches = pattern.matcher(text).results().map(m -> m.group(1)).toList();
            if (!matches.isEmpty()) {
                return round2(Double.parseDouble(matches.get(matches.size() - 1)));
            }
        }

        // Fallback: numbers that are not quantities (not followed by kg, litre, ...).
        List<String> tokens = TOKEN_PATTERN.matcher(text).results().map(MatchResult::group).toList();
        Set<Integer> skip = new java.util.HashSet<>();
        for (int i = 0; i < tokens.size(); i++) {
            if (tokens.get(i).matches("\\d+(?:\\.\\d{1,2})?")) {
                String next = i + 1 < tokens.size() ? tokens.get(i + 1).toLowerCase(Locale.ROOT) : "";
                if (QUANTITY_UNITS.contains(next)) skip.add(i);
            }
        }
        List<Double> amounts = new ArrayList<>();
        for (int i = 0; i < tokens.size(); i++) {
            if (!skip.contains(i) && tokens.get(i).matches("\\d+(?:\\.\\d{1,2})?")) {
                amounts.add(Double.parseDouble(tokens.get(i)));
            }
        }
        if (amounts.isEmpty()) return null;
        return round2(amounts.get(amounts.size() - 1));
    }

    private static String titleCaseName(List<String> parts) {
        String[] words = String.join(" ", parts).trim().split("\\s+");
        for (int i = 0; i < words.length; i++) {
            String p = words[i];
            if (!p.isEmpty()) {
                words[i] = p.substring(0, 1).toUpperCase(Locale.ROOT) + p.substring(1);
            }
        }
        return String.join(" ", words);
    }

    private static String extractCustomer(String text) {
        String cleaned = text.replaceAll("[₹,]", " ");
        List<String> words = WORD_PATTERN.matcher(cleaned).results().map(MatchResult::group).toList();
        List<String> parts = new ArrayList<>();
        for (String word : words) {
            String lowered = word.toLowerCase(Locale.ROOT).replaceAll("\\.$", "");
            if (HONORIFICS.contains(lowered)) continue;
            if (NAME_STOP.contains(lowered)) break;
            parts.add(word);
        }

        // Second chance: sentences that don't START with the customer's name —
        // "₹120 udhaar Ramesh", "udhaar 200 Ramesh", "liya Ramesh ne 100".
        // Scan the whole line for the first word that is neither a stop word
        // nor an honorific, and take up to three words from there.
        if (parts.isEmpty()) {
            for (int i = 0; i < words.size(); i++) {
                String lowered = words.get(i).toLowerCase(Locale.ROOT).replaceAll("\\.$", "");
                if (HONORIFICS.contains(lowered) || NAME_STOP.contains(lowered)) continue;
                List<String> rest = new ArrayList<>();
                rest.add(words.get(i));
                for (int j = i + 1; j < words.size() && rest.size() < 3; j++) {
                    String nextLowered = words.get(j).toLowerCase(Locale.ROOT).replaceAll("\\.$", "");
                    if (HONORIFICS.contains(nextLowered)) continue;
                    if (NAME_STOP.contains(nextLowered)) break;
                    rest.add(words.get(j));
                }
                parts.addAll(rest);
                break;
            }
        }

        if (parts.isEmpty()) return null;
        // Most personal names in this context are one to three words.
        List<String> capped = parts.subList(0, Math.min(3, parts.size()));
        return titleCaseName(new ArrayList<>(capped));
    }

    public static ParseResult parse(String input) {
        if (input == null || input.trim().isEmpty()) {
            return ParseResult.fail(input == null ? "" : input,
                "Please enter a sentence, for example: 'Ramesh took 2 kg rice for 120 rupees'.");
        }

        String raw = input.trim();
        String normalized = raw.replaceAll("\\s+", " ").replace(",", "");

        List<String> tokens = TOKEN_PATTERN.matcher(normalized).results().map(MatchResult::group).toList();
        List<String> tokensLower = tokens.stream().map(t -> t.toLowerCase(Locale.ROOT)).toList();

        String txnType = txnTypeOf(tokensLower);
        Double amount = extractAmount(normalized);
        String customer = extractCustomer(normalized);

        if (customer == null) {
            return ParseResult.fail(raw,
                "Could not find the customer name. Try starting with the name, for example: 'Ramesh paid 50'.");
        }
        if (amount == null) {
            return ParseResult.fail(raw, customer, null,
                "Could not find the amount. Try 'Ramesh paid 50' or 'Ramesh took rice for 120 rupees'.");
        }
        if (amount <= 0) {
            return ParseResult.fail(raw, customer, amount, "Amount must be greater than zero.");
        }
        // A name plus an amount with no verb is treated as new credit, which is
        // how a kirana owner typically uses a one-line khata entry.
        String finalType = txnType != null ? txnType : "UDHAAR";
        return new ParseResult(true, customer, amount, finalType, raw, null);
    }
}
