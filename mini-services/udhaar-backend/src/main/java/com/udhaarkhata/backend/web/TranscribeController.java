package com.udhaarkhata.backend.web;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Recorded-voice transcription is a sandbox/AI-SDK feature of the Next.js
 * full-stack service. The Spring backend answers with the same contract so
 * the frontend recorder fallback degrades gracefully (browsers with the Web
 * Speech API never reach this route).
 */
@RestController
@Tag(name = "Voice")
public class TranscribeController {

    @PostMapping("/api/transcribe")
    @Operation(summary = "Not available on this backend (browser Web Speech API covers voice input)")
    public ResponseEntity<Map<String, Object>> transcribe() {
        return ResponseEntity.status(501).body(Map.of(
            "ok", false,
            "error", "Recorded-voice transcription is not available on this backend. "
                + "Browsers with speech recognition use it automatically; otherwise type the entry."));
    }
}
