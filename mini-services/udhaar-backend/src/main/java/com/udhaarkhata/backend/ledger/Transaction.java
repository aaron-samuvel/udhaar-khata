package com.udhaarkhata.backend.ledger;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/**
 * An immutable ledger line: UDHAAR (credit given) or PAYMENT (cash received).
 * A reversal is a NEW offsetting line (isReversal=true) — originals are never
 * deleted or mutated in place, keeping the audit history intact.
 */
@Entity
@Table(name = "transactions",
       indexes = {
           @Index(name = "idx_txn_user_created", columnList = "user_id, created_at"),
           @Index(name = "idx_txn_customer_created", columnList = "customer_id, created_at")
       })
public class Transaction {

    @Id
    @Column(length = 36)
    private UUID id;

    @Column(name = "user_id", nullable = false, length = 36)
    private UUID userId;

    @Column(name = "customer_id", nullable = false, length = 36)
    private UUID customerId;

    /** Denormalized display name at entry time (statements survive renames). */
    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "name_key", nullable = false, length = 120)
    private String nameKey;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    /** "UDHAAR" | "PAYMENT" */
    @Column(name = "txn_type", nullable = false, length = 8)
    private String txnType;

    @Column(name = "raw_text", nullable = false, length = 400)
    private String rawText;

    @Column(length = 200)
    private String note;

    @Column(nullable = false)
    private boolean reversed;

    @Column(name = "is_reversal", nullable = false)
    private boolean isReversal;

    @Column(name = "reversed_by_id", length = 36)
    private UUID reversedById;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    /** Used only by backup restore (explicit ids); normally auto-generated. */
    public void setId(UUID id) { this.id = id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getNameKey() { return nameKey; }
    public void setNameKey(String nameKey) { this.nameKey = nameKey; }
    public long getAmountPaise() { return amountPaise; }
    public void setAmountPaise(long amountPaise) { this.amountPaise = amountPaise; }
    public String getTxnType() { return txnType; }
    public void setTxnType(String txnType) { this.txnType = txnType; }
    public String getRawText() { return rawText; }
    public void setRawText(String rawText) { this.rawText = rawText; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
    public boolean isReversed() { return reversed; }
    public void setReversed(boolean reversed) { this.reversed = reversed; }
    public boolean isReversal() { return isReversal; }
    public void setReversal(boolean isReversal) { this.isReversal = isReversal; }
    public UUID getReversedById() { return reversedById; }
    public void setReversedById(UUID reversedById) { this.reversedById = reversedById; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
