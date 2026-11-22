package com.udhaarkhata.backend.config;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Typed application properties (udhaar.* in application.yml). */
@ConfigurationProperties(prefix = "udhaar")
public record AppProperties(
        boolean legacyAnonymous,
        Cors cors,
        Jwt jwt
) {

    public record Cors(List<String> allowedOrigins) {}

    public record Jwt(String secret, int ttlDays) {}
}
