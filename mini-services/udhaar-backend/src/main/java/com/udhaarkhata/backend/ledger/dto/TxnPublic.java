package com.udhaarkhata.backend.ledger.dto;

/** Ledger line projection sent to the frontend (mirrors TxnPublic in types.ts). */
public record TxnPublic(
        String id,
        String name,
        String nameKey,
        double amount,
        long amountPaise,
        String txnType,
        String rawText,
        String note,
        boolean reversed,
        boolean isReversal,
        String createdAt
) {}
