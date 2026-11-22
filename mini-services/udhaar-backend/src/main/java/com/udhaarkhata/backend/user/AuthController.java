package com.udhaarkhata.backend.user;

import com.udhaarkhata.backend.security.UserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    public record SignupRequest(String email, String password, String shopName) {}
    public record LoginRequest(String email, String password) {}

    @PostMapping("/signup")
    @Operation(summary = "Create an account, get a JWT")
    public ResponseEntity<AuthService.AuthResponse> signup(@RequestBody SignupRequest body) {
        AuthService.AuthResponse res = auth.signup(body.email(), body.password(), body.shopName());
        auth.ensureSettings(res.user().id());
        return ResponseEntity.ok(res);
    }

    @PostMapping("/login")
    @Operation(summary = "Log in, get a JWT")
    public ResponseEntity<AuthService.AuthResponse> login(@RequestBody LoginRequest body) {
        return ResponseEntity.ok(auth.login(body.email(), body.password()));
    }

    @GetMapping("/me")
    @Operation(summary = "Current account")
    public Map<String, Object> me(@AuthenticationPrincipal UserPrincipal principal) {
        AuthService.UserView view = auth.me(principal.id());
        return Map.of("ok", true, "user", view);
    }

    @GetMapping("/profile")
    @Operation(summary = "Profile id sanity endpoint (also used by health probes)")
    public Map<String, Object> profile(@AuthenticationPrincipal UserPrincipal principal) {
        UUID id = principal.id();
        return Map.of("ok", true, "userId", id.toString());
    }
}
