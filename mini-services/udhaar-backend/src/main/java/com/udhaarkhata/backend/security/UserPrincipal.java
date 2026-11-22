package com.udhaarkhata.backend.security;

import java.util.UUID;

/** Authenticated caller attached to the SecurityContext. */
public record UserPrincipal(UUID id, String email, String shopName) {}
