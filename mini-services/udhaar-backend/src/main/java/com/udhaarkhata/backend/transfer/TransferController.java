package com.udhaarkhata.backend.transfer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.udhaarkhata.backend.security.UserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Map;

/**
 * Backup/restore + CSV exports. File names and content match the Next.js API
 * exactly (JSON pretty-printed backup; CSVs carry a UTF-8 BOM so Excel opens
 * them correctly) — a backup exported from one backend restores into the
 * other unchanged.
 */
@RestController
@Tag(name = "Backup & Export")
public class TransferController {

    private final TransferService transfer;
    private final ObjectMapper json;

    public TransferController(TransferService transfer, ObjectMapper json) {
        this.transfer = transfer;
        this.json = json;
    }

    public record ImportRequest(String mode, Map<String, Object> backup) {}

    private static String stamp() {
        return Instant.now().toString().substring(0, 10); // YYYY-MM-DD, like the Next.js CSVs
    }

    @GetMapping("/api/export/backup.json")
    @Operation(summary = "Full backup (JSON, format udhaar-khata-backup v2)")
    public ResponseEntity<String> backup(@AuthenticationPrincipal UserPrincipal user) {
        try {
            Map<String, Object> backup = transfer.backupJson(user.id());
            String body = json.writerWithDefaultPrettyPrinter().writeValueAsString(backup);
            String stamp = Instant.now().toString().substring(0, 19).replace(":", "-").replace("T", "-");
            return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                    "attachment; filename=\"udhaar-khata-backup-" + stamp + ".json\"")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body);
        } catch (Exception e) {
            return ResponseEntity.internalServerError()
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"ok\":false,\"error\":\"Backup failed.\"}");
        }
    }

    @GetMapping("/api/export/transactions.csv")
    @Operation(summary = "All ledger lines as CSV")
    public ResponseEntity<String> transactionsCsv(@AuthenticationPrincipal UserPrincipal user) {
        String csv = transfer.transactionsCsv(user.id());
        return csvResponse(csv, "udhaar-transactions-" + stamp() + ".csv");
    }

    @GetMapping("/api/export/outstanding.csv")
    @Operation(summary = "Outstanding balances as CSV")
    public ResponseEntity<String> outstandingCsv(@AuthenticationPrincipal UserPrincipal user) {
        String csv = transfer.outstandingCsv(user.id());
        return csvResponse(csv, "udhaar-outstanding-" + stamp() + ".csv");
    }

    private static ResponseEntity<String> csvResponse(String csv, String filename) {
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
            .contentType(MediaType.parseMediaType("text/csv; charset=utf-8"))
            .body("\ufeff" + csv);
    }

    @PostMapping("/api/import")
    @Operation(summary = "Restore a backup (mode: merge | replace)")
    public ResponseEntity<Map<String, Object>> importBackup(@AuthenticationPrincipal UserPrincipal user,
                                                            @RequestBody(required = false) ImportRequest body) {
        if (body == null) {
            throw new IllegalArgumentException("Invalid request body.");
        }
        TransferService.RestoreResult result = transfer.restore(user.id(), body.backup(), body.mode());
        return ResponseEntity.status(201)
            .body(Map.of("ok", true, "result", result));
    }

    @PostMapping("/api/demo/reset")
    @Operation(summary = "Reset the ledger to the labeled demo dataset")
    public Map<String, Object> resetDemo(@AuthenticationPrincipal UserPrincipal user) {
        Map<String, Integer> counts = transfer.resetDemo(user.id());
        return Map.of("ok", true, "customers", counts.get("customers"),
            "transactions", counts.get("transactions"));
    }
}
