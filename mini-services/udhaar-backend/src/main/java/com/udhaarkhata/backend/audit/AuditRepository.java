package com.udhaarkhata.backend.audit;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.UUID;

public interface AuditRepository extends JpaRepository<AuditEvent, UUID> {
    List<AuditEvent> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /** Immediate bulk delete (bypasses flush ordering) — used by demo reset & restore. */
    @Modifying
    @Query("delete from AuditEvent e where e.userId = :userId")
    int deleteAllForUser(@Param("userId") UUID userId);
}
