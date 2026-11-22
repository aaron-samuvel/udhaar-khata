package com.udhaarkhata.backend.user;

import com.udhaarkhata.backend.security.JwtService;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.UUID;

/** Signup / login / me — BCrypt hashes, JWT issue. */
@Service
public class AuthService {

    private final UserRepository users;
    private final ShopSettingsRepository settings;
    private final PasswordEncoder encoder;
    private final JwtService jwt;

    public AuthService(UserRepository users, ShopSettingsRepository settings,
                       PasswordEncoder encoder, JwtService jwt) {
        this.users = users;
        this.settings = settings;
        this.encoder = encoder;
        this.jwt = jwt;
    }

    public record UserView(UUID id, String email, String shopName) {}
    public record AuthResponse(boolean ok, String token, UserView user) {}

    public AuthResponse signup(String emailRaw, String password, String shopName) {
        String email = emailRaw == null ? "" : emailRaw.trim().toLowerCase();
        if (!email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new IllegalArgumentException("Enter a valid email address.");
        }
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("Password must be at least 8 characters.");
        }
        if (users.existsByEmailIgnoreCase(email)) {
            throw new IllegalArgumentException("An account with this email already exists.");
        }
        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(encoder.encode(password));
        user.setShopName(shopName == null || shopName.isBlank() ? "My Shop" : shopName.trim());
        users.save(user);
        return new AuthResponse(true, jwt.issue(user.getId(), user.getEmail(), user.getShopName()),
            new UserView(user.getId(), user.getEmail(), user.getShopName()));
    }

    public AuthResponse login(String emailRaw, String password) {
        String email = emailRaw == null ? "" : emailRaw.trim().toLowerCase();
        User user = users.findByEmailIgnoreCase(email).orElse(null);
        if (user == null || password == null || !encoder.matches(password, user.getPasswordHash())) {
            throw new org.springframework.security.access.AccessDeniedException("Invalid email or password.");
        }
        return new AuthResponse(true, jwt.issue(user.getId(), user.getEmail(), user.getShopName()),
            new UserView(user.getId(), user.getEmail(), user.getShopName()));
    }

    public UserView me(UUID userId) {
        User user = users.findById(userId)
            .orElseThrow(() -> new com.udhaarkhata.backend.web.NotFoundException("No such account."));
        return new UserView(user.getId(), user.getEmail(), user.getShopName());
    }

    /** Default settings for a fresh account. */
    public void ensureSettings(UUID userId) {
        if (settings.findByUserId(userId).isEmpty()) {
            ShopSettings s = new ShopSettings();
            s.setUserId(userId);
            settings.save(s);
        }
    }
}
