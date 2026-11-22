package com.udhaarkhata.backend.ledger.dto;

/** Reminder projection (mirrors ReminderPublic in types.ts). */
public record ReminderPublic(
        String id,
        String name,
        double balance,
        long balancePaise,
        int daysOverdue,
        String phone,
        String whatsappUrl,
        String message,
        String runId,
        String createdAt
) {}
