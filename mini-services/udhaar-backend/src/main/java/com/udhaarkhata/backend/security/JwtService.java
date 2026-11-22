package com.udhaarkhata.backend.security;

import com.udhaarkhata.backend.config.AppProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

/** HS256 JWT issue/verify. Secret must be >= 32 bytes (config or env). */
@Service
public class JwtService {

    private final SecretKey key;
    private final long ttlSeconds;

    public JwtService(AppProperties props) {
        byte[] bytes = props.jwt().secret().getBytes(StandardCharsets.UTF_8);
        if (bytes.length < 32) {
            throw new IllegalStateException("udhaar.jwt.secret must be at least 32 bytes long.");
        }
        this.key = Keys.hmacShaKeyFor(bytes);
        this.ttlSeconds = props.jwt().ttlDays() * 86_400L;
    }

    public String issue(UUID userId, String email, String shopName) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(userId.toString())
            .claim("email", email)
            .claim("shopName", shopName == null ? "" : shopName)
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(ttlSeconds)))
            .signWith(key)
            .compact();
    }

    /** Empty when the token is missing/expired/tampered — callers treat as anonymous. */
    public Optional<UserPrincipal> verify(String token) {
        try {
            Claims claims = Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload();
            return Optional.of(new UserPrincipal(
                UUID.fromString(claims.getSubject()),
                claims.get("email", String.class),
                claims.get("shopName", String.class)
            ));
        } catch (JwtException | IllegalArgumentException e) {
            return Optional.empty();
        }
    }
}
