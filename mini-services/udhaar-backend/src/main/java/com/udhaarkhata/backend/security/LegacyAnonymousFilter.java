package com.udhaarkhata.backend.security;

import com.udhaarkhata.backend.user.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

/**
 * Compatibility mode for the existing Next.js frontend (which sends no
 * Authorization header): anonymous requests are mapped to the auto-seeded
 * demo shop. When udhaar.legacy-anonymous=false this filter is inert and the
 * API is strictly multi-user (anonymous → 401 from the entry point).
 */
@Component
public class LegacyAnonymousFilter extends OncePerRequestFilter {

    private final UserRepository userRepository;
    private final boolean enabled;

    public LegacyAnonymousFilter(UserRepository userRepository,
                                 @Value("${udhaar.legacy-anonymous}") boolean enabled) {
        this.userRepository = userRepository;
        this.enabled = enabled;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        // A request that PRESENTS a token expects that user's shop — never
        // silently swap it to the demo shop when the token is invalid.
        if (enabled && request.getHeader("Authorization") == null
                && SecurityContextHolder.getContext().getAuthentication() == null) {
            userRepository.findAnonymousDemoUser().ifPresent(user -> {
                UserPrincipal principal = new UserPrincipal(user.getId(), user.getEmail(), user.getShopName());
                UsernamePasswordAuthenticationToken auth =
                    new UsernamePasswordAuthenticationToken(principal, null, List.of());
                auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(auth);
            });
        }
        chain.doFilter(request, response);
    }
}
