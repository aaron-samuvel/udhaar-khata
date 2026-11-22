package com.udhaarkhata.backend.web;

import com.udhaarkhata.backend.ledger.dto.TxnPublic;

/** 409 possible-duplicate — carries the offending transaction for the UI. */
public class DuplicateTransactionException extends RuntimeException {
    private final TxnPublic duplicate;

    public DuplicateTransactionException(String message, TxnPublic duplicate) {
        super(message);
        this.duplicate = duplicate;
    }

    public TxnPublic getDuplicate() { return duplicate; }
}
