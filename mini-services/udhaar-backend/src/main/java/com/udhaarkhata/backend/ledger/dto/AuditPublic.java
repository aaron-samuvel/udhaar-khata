package com.udhaarkhata.backend.ledger.dto;

/** Audit trail projection (mirrors AuditPublic in types.ts). */
public record AuditPublic(
        String id,
        String action,
        String entity,
        String entityId,
        String data,
        String createdAt
) {}
