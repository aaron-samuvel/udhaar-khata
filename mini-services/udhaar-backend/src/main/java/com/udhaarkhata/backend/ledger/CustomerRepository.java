package com.udhaarkhata.backend.ledger;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CustomerRepository extends JpaRepository<Customer, UUID> {

    Optional<Customer> findByUserIdAndNameKey(UUID userId, String nameKey);

    List<Customer> findByUserIdAndArchivedOrderByBalancePaiseDescNameAsc(UUID userId, boolean archived);

    List<Customer> findByUserIdAndArchivedAndNameContainingIgnoreCaseOrderByBalancePaiseDescNameAsc(
            UUID userId, boolean archived, String name);

    Page<Customer> findByUserIdAndArchivedOrderByBalancePaiseDescNameAsc(UUID userId, boolean archived, Pageable pageable);

    Page<Customer> findByUserIdAndArchivedAndNameContainingIgnoreCaseOrderByBalancePaiseDescNameAsc(
            UUID userId, boolean archived, String name, Pageable pageable);

    List<Customer> findByUserId(UUID userId);

    /** Immediate bulk delete (bypasses flush ordering) — used by demo reset & restore. */
    @Modifying
    @Query("delete from Customer c where c.userId = :userId")
    int deleteAllForUser(@Param("userId") UUID userId);

    long countByUserIdAndArchivedAndBalancePaiseGreaterThan(UUID userId, boolean archived, long balancePaise);

    long countByUserIdAndArchivedAndBalancePaiseLessThanEqual(UUID userId, boolean archived, long balancePaise);
}
