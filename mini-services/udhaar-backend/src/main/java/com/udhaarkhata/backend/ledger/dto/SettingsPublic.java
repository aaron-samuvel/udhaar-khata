package com.udhaarkhata.backend.ledger.dto;

/** Shop settings projection (mirrors SettingsPublic in types.ts). */
public record SettingsPublic(
        String shopName,
        int overdueDays,
        String reminderTemplate,
        String upiId,
        boolean demoData
) {}
