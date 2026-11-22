package com.udhaarkhata.backend.user;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ShopSettingsRepository extends JpaRepository<ShopSettings, UUID> {
    Optional<ShopSettings> findByUserId(UUID userId);
}
