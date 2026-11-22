package com.udhaarkhata.backend.web;

/** 404 with the contract's human message. */
public class NotFoundException extends RuntimeException {
    public NotFoundException(String message) { super(message); }
}
