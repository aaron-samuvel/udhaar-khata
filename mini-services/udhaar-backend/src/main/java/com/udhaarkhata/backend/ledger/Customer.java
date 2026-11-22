package com.udhaarkhata.backend.ledger;

import jakarta.persistence.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * A customer of the shop with a running udhaar (credit) balance.
 * All money is stored as INTEGER PAISE so balance arithmetic is exact.
 * Scoped to a user (multi-shop) — (userId, nameKey) is unique.
 */
@Entity
@Table(name = "customers",
       uniqueConstraints = @UniqueConstraint(name = "uq_customer_user_key", columnNames = {"user_id", "name_key"}),
       indexes = @Index(name = "idx_customer_balance", columnList = "user_id, balance_paise"))
public class Customer {

    @Id
    @Column(length = 36)
    private UUID id;

    @Column(name = "user_id", nullable = false, length = 36)
    private UUID userId;

    @Column(nullable = false, length = 120)
    private String name;

    /** Normalized uppercase name — the stable lookup key. */
    @Column(name = "name_key", nullable = false, length = 120)
    private String nameKey;

    @Column(name = "balance_paise", nullable = false)
    private long balancePaise;

    @Column(length = 20)
    private String phone;

    @Column(length = 500)
    private String notes;

    @Column(name = "credit_limit_paise")
    private Long creditLimitPaise;

    @Column(nullable = false)
    private boolean archived;

    @Column(name = "first_due_at")
    private Instant firstDueAt;

    @Column(name = "last_txn_at")
    private Instant lastTxnAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    @UpdateTimestamp
    private Instant updatedAt;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
        if (updatedAt == null) updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getNameKey() { return nameKey; }
    public void setNameKey(String nameKey) { this.nameKey = nameKey; }
    public long getBalancePaise() { return balancePaise; }
    public void setBalancePaise(long balancePaise) { this.balancePaise = balancePaise; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public Long getCreditLimitPaise() { return creditLimitPaise; }
    public void setCreditLimitPaise(Long creditLimitPaise) { this.creditLimitPaise = creditLimitPaise; }
    public boolean isArchived() { return archived; }
    public void setArchived(boolean archived) { this.archived = archived; }
    public Instant getFirstDueAt() { return firstDueAt; }
    public void setFirstDueAt(Instant firstDueAt) { this.firstDueAt = firstDueAt; }
    public Instant getLastTxnAt() { return lastTxnAt; }
    public void setLastTxnAt(Instant lastTxnAt) { this.lastTxnAt = lastTxnAt; }
    public Instant getCreatedAt() { return createdAt; }
    /** Settable for demo seeding and backup restore. */
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
