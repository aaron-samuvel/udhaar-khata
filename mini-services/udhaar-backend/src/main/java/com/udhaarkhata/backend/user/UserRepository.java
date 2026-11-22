package com.udhaarkhata.backend.user;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmailIgnoreCase(String email);

    boolean existsByEmailIgnoreCase(String email);

    /** The special demo shop used by legacy-anonymous (no-token) requests. */
    @Query("select u from User u where u.email = 'demo@udhaar.local'")
    Optional<User> findAnonymousDemoUser();
}
