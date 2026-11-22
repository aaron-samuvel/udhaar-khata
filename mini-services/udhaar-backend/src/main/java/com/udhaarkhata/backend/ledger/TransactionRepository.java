package com.udhaarkhata.backend.ledger;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TransactionRepository extends JpaRepository<Transaction, UUID> {

    /** Duplicate-window lookup (same customer/type/amount within 3 minutes). */
    Optional<Transaction> findFirstByUserIdAndNameKeyAndTxnTypeAndAmountPaiseAndReversedFalseAndIsReversalFalseAndCreatedAtGreaterThanEqualOrderByCreatedAtDesc(
            UUID userId, String nameKey, String txnType, long amountPaise, Instant since);

    List<Transaction> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    List<Transaction> findByUserIdAndCustomerIdOrderByCreatedAtDesc(UUID userId, UUID customerId, Pageable pageable);

    List<Transaction> findTop20ByUserIdAndCustomerIdAndReversedFalseAndIsReversalFalseOrderByCreatedAtDesc(
            UUID userId, UUID customerId);

    List<Transaction> findByUserIdAndCreatedAtBetweenOrderByCreatedAtDesc(UUID userId, Instant from, Instant to);

    List<Transaction> findByUserIdOrderByCreatedAtAsc(UUID userId, Pageable pageable);

    List<Transaction> findByUserIdAndCustomerId(UUID userId, UUID customerId);

    /** Immediate bulk delete (bypasses flush ordering) — used by demo reset & restore. */
    @Modifying
    @Query("delete from Transaction t where t.userId = :userId")
    int deleteAllForUser(@Param("userId") UUID userId);
}
