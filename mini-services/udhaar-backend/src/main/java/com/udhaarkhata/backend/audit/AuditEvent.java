package com.udhaarkhata.backend.audit;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** Append-only audit trail for financially significant actions. */
@Entity
@Table(name = "audit_events",
       indexes = @Index(name = "idx_audit_created", columnList = "user_id, created_at"))
public class AuditEvent {

    @Id
    @Column(length = 36)
    private UUID id;

    @Column(name = "user_id", nullable = false, length = 36)
    private UUID userId;

    @Column(nullable = false, length = 40)
    private String action;

    @Column(nullable = false, length = 20)
    private String entity;

    @Column(name = "entity_id", length = 36)
    private String entityId;

    @Column(nullable = false, length = 2000)
    private String data;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (id == null) id = UUID.randomUUID();
        if (createdAt == null) createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getEntity() { return entity; }
    public void setEntity(String entity) { this.entity = entity; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public String getData() { return data; }
    public void setData(String data) { this.data = data; }
    public Instant getCreatedAt() { return createdAt; }
}
