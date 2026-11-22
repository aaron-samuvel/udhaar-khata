package com.udhaarkhata.backend.ledger.dto;

/** Customer projection sent to the frontend (mirrors CustomerPublic in types.ts). */
public record CustomerPublic(
        String name,
        String nameKey,
        double balance,
        long balancePaise,
        String phone,
        String notes,
        Long creditLimitPaise,
        Double creditLimit,
        boolean archived,
        String firstDueAt,
        String lastTxnAt,
        String createdAt
) {}
