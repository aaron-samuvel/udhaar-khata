package com.udhaarkhata.backend.ledger;

import com.udhaarkhata.backend.ledger.dto.CustomerPublic;
import com.udhaarkhata.backend.ledger.dto.SettingsPublic;
import com.udhaarkhata.backend.ledger.dto.TxnPublic;
import com.udhaarkhata.backend.parser.KhataParser;
import com.udhaarkhata.backend.security.UserPrincipal;
import com.udhaarkhata.backend.web.DuplicateTransactionException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Ledger endpoints — same paths, request/response shapes and status codes as
 * the Next.js API routes so the existing frontend works against either
 * backend unchanged.
 */
@RestController
@Tag(name = "Ledger")
public class LedgerController {

    private final KhataService khata;

    public LedgerController(KhataService khata) {
        this.khata = khata;
    }

    private static final java.util.regex.Pattern NAME_REGEX =
        java.util.regex.Pattern.compile("^[A-Za-z][A-Za-z .']{0,59}$");

    /* ---------------- misc ---------------- */

    @GetMapping("/api")
    @Operation(summary = "Hello world (parity with the Next.js root route)")
    public Map<String, String> hello() {
        return Map.of("message", "Hello, world!");
    }

    @GetMapping("/api/health")
    @Operation(summary = "Health probe")
    public Map<String, Object> health() {
        return Map.of("ok", true, "service", "udhaar-khata", "shop_id", "default");
    }

    /* ---------------- customers ---------------- */

    @GetMapping("/api/customers")
    @Operation(summary = "List customers (q, archived=1, optional page/size pagination)")
    public Map<String, Object> listCustomers(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestParam(required = false) String q,
            @RequestParam(required = false, defaultValue = "0") String archived,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        boolean onlyArchived = "1".equals(archived) || "true".equals(archived);
        Map<String, Object> body = new LinkedHashMap<>();
        if (page != null || size != null) {
            var result = khata.listCustomersPaged(user.id(), q, onlyArchived,
                page == null ? 0 : page, size == null ? 20 : size);
            body.put("ok", true);
            body.put("customers", result.getContent());
            body.put("page", result.getNumber());
            body.put("size", result.getSize());
            body.put("total", result.getTotalElements());
            body.put("totalPages", result.getTotalPages());
        } else {
            body.put("ok", true);
            body.put("customers", khata.listCustomers(user.id(), q, onlyArchived));
        }
        return body;
    }

    @GetMapping("/api/customers/{name}/transactions")
    @Operation(summary = "Customer khata detail (last 200 ledger lines)")
    public Map<String, Object> customerDetail(@AuthenticationPrincipal UserPrincipal user,
                                              @PathVariable String name) {
        KhataService.CustomerDetail detail = khata.getCustomerWithTxns(user.id(), name);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("customer", detail.customer());
        body.put("transactions", detail.transactions());
        return body;
    }

    @PatchMapping("/api/customers/{name}")
    @Operation(summary = "Update customer profile (phone, notes, credit limit, archived)")
    public Map<String, Object> patchCustomer(@AuthenticationPrincipal UserPrincipal user,
                                             @PathVariable String name,
                                             @RequestBody KhataService.CustomerPatch patch) {
        CustomerPublic customer = khata.updateCustomer(user.id(), name, patch);
        return Map.of("ok", true, "customer", customer);
    }

    @PostMapping("/api/customers/{name}/statement")
    @Operation(summary = "WhatsApp-ready khata statement (doubles as a receipt)")
    public ResponseEntity<Map<String, Object>> statement(@AuthenticationPrincipal UserPrincipal user,
                                                         @PathVariable String name) {
        KhataService.Statement statement = khata.customerStatement(user.id(), name);
        return ResponseEntity.status(201).body(Map.of("ok", true, "statement", statement));
    }

    /* ---------------- transactions ---------------- */

    public record TxnRequest(String mode, String text, String customer, Double amountRupees,
                             String txnType, String phone, String note, Boolean force,
                             Boolean preview) {}

    @PostMapping("/api/transactions")
    @Operation(summary = "Record an entry (mode: manual | parse; parse supports preview)")
    public ResponseEntity<Map<String, Object>> addTransaction(
            @AuthenticationPrincipal UserPrincipal user,
            @RequestBody TxnRequest body) {
        String customer;
        long amountPaise;
        String txnType;
        String rawText;

        if ("parse".equals(body.mode())) {
            // Natural-language mode: the sentence is parsed server-side; the
            // frontend ALWAYS shows a confirm step before saving.
            String text = body.text() == null ? "" : body.text();
            if (text.trim().isEmpty()) {
                throw new IllegalArgumentException("Please enter a sentence to parse.");
            }
            KhataParser.ParseResult parsed = KhataParser.parse(text);
            if (!parsed.ok()) {
                Map<String, Object> failBody = new LinkedHashMap<>();
                failBody.put("ok", false);
                failBody.put("error", parsed.error());
                failBody.put("parsed", parsed);
                return ResponseEntity.badRequest().body(failBody);
            }
            if (Boolean.TRUE.equals(body.preview())) {
                Map<String, Object> previewBody = new LinkedHashMap<>();
                previewBody.put("ok", true);
                previewBody.put("preview", Map.of(
                    "customer", parsed.customer(),
                    "amount", parsed.amount(),
                    "txnType", body.txnType() != null ? body.txnType() : parsed.txnType(),
                    "rawText", parsed.rawText()));
                return ResponseEntity.ok(previewBody);
            }
            customer = parsed.customer();
            amountPaise = KhataPure.rupeesToPaise(parsed.amount());
            txnType = body.txnType() != null ? body.txnType() : parsed.txnType();
            rawText = parsed.rawText();
        } else {
            // Manual mode: explicit structured entry — requires every field.
            String name = body.customer() == null ? "" : body.customer().trim();
            if (!NAME_REGEX.matcher(name).matches()) {
                throw new IllegalArgumentException("Enter a valid customer name (letters, spaces, dots).");
            }
            if (body.amountRupees() == null) {
                throw new IllegalArgumentException("Amount is required.");
            }
            double rupees = body.amountRupees();
            if (!Double.isFinite(rupees) || rupees <= 0) {
                throw new IllegalArgumentException("Amount must be greater than zero.");
            }
            if (rupees > KhataPure.RUPEE_MAX) {
                throw new IllegalArgumentException("Amount must be " + KhataPure.RUPEE_MAX + " or less.");
            }
            if (body.txnType() == null) {
                throw new IllegalArgumentException(
                    "Choose Udhaar (credit given) or Payment (cash received).");
            }
            customer = name;
            amountPaise = KhataPure.rupeesToPaise(rupees);
            txnType = body.txnType();
            rawText = body.note() != null && !body.note().trim().isEmpty()
                ? body.note().trim()
                : "Manual " + ("UDHAAR".equals(txnType) ? "udhaar" : "payment") + " entry";
        }

        if (amountPaise <= 0) {
            throw new IllegalArgumentException("Amount must be greater than zero.");
        }

        KhataService.AddTxnResult result = khata.addTransaction(user.id(),
            new KhataService.AddTxnInput(customer, amountPaise, txnType, rawText,
                body.note(), body.phone(),
                Boolean.TRUE.equals(body.force()), false, null));

        if (result.duplicate() != null) {
            TxnPublic d = result.duplicate();
            String kind = "UDHAAR".equals(d.txnType()) ? "udhaar" : "payment";
            throw new DuplicateTransactionException(
                "Possible duplicate: " + kind + " of ₹"
                    + String.format(java.util.Locale.ROOT, "%.2f", KhataPure.paiseToRupees(d.amountPaise()))
                    + " for " + d.name() + " was recorded a moment ago. Save anyway?",
                d);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("ok", true);
        payload.put("transaction", result.transaction());
        payload.put("customer", result.customer());
        payload.put("overLimit", result.overLimit() != null
            ? Map.of("creditLimitPaise", result.overLimit().creditLimitPaise(),
                     "balanceAfterPaise", result.overLimit().balanceAfterPaise())
            : null);
        return ResponseEntity.status(201).body(payload);
    }

    @PostMapping("/api/transactions/{id}/reverse")
    @Operation(summary = "Reverse a ledger line (offsetting correction entry)")
    public ResponseEntity<Map<String, Object>> reverse(@AuthenticationPrincipal UserPrincipal user,
                                                       @PathVariable String id) {
        KhataService.AddTxnResult result = khata.reverseTransaction(user.id(), id);
        return ResponseEntity.status(201).body(Map.of(
            "ok", true, "transaction", result.transaction(), "customer", result.customer()));
    }

    /* ---------------- settings ---------------- */

    @GetMapping("/api/settings")
    @Operation(summary = "Shop settings")
    public Map<String, Object> getSettings(@AuthenticationPrincipal UserPrincipal user) {
        return Map.of("ok", true, "settings", khata.settingsPublic(user.id()));
    }

    @PutMapping("/api/settings")
    @Operation(summary = "Update shop settings")
    public Map<String, Object> putSettings(@AuthenticationPrincipal UserPrincipal user,
                                           @RequestBody KhataService.SettingsPatch patch) {
        SettingsPublic settings = khata.updateSettings(user.id(), patch);
        return Map.of("ok", true, "settings", settings);
    }

    /* ---------------- audit ---------------- */

    @GetMapping("/api/audit")
    @Operation(summary = "Read-only activity log (append-only audit trail)")
    public Map<String, Object> audit(@AuthenticationPrincipal UserPrincipal user,
                                     @RequestParam(required = false) String limit) {
        int parsed = 50;
        if (limit != null && !limit.isBlank()) {
            try {
                parsed = Integer.parseInt(limit);
            } catch (NumberFormatException e) {
                parsed = 50;
            }
        }
        List<com.udhaarkhata.backend.ledger.dto.AuditPublic> events = khata.listAudit(user.id(), parsed);
        return Map.of("ok", true, "events", events);
    }
}
