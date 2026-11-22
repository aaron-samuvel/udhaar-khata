package com.udhaarkhata.backend.reminder;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** A reminder record produced by a reminder run, with a ready WhatsApp link. */
@Entity
@Table(name = "reminders",
       indexes = @Index(name = "idx_reminder_created", columnList = "user_id, created_at"))
public class Reminder {

    @Id
    @Column(length = 36)
    private UUID id;

    @Column(name = "user_id", nullable = false, length = 36)
    private UUID userId;

    @Column(name = "customer_id", nullable = false, length = 36)
    private UUID customerId;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(name = "balance_paise", nullable = false)
    private long balancePaise;

    @Column(name = "days_overdue", nullable = false)
    private int daysOverdue;

    @Column(length = 20)
    private String phone;

    @Column(name = "whatsapp_url", nullable = false, length = 1000)
    private String whatsappUrl;

    @Column(nullable = false, length = 2000)
    private String message;

    @Column(name = "run_id", nullable = false, length = 20)
    private String runId;

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
    public UUID getCustomerId() { return customerId; }
    public void setCustomerId(UUID customerId) { this.customerId = customerId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public long getBalancePaise() { return balancePaise; }
    public void setBalancePaise(long balancePaise) { this.balancePaise = balancePaise; }
    public int getDaysOverdue() { return daysOverdue; }
    public void setDaysOverdue(int daysOverdue) { this.daysOverdue = daysOverdue; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public String getWhatsappUrl() { return whatsappUrl; }
    public void setWhatsappUrl(String whatsappUrl) { this.whatsappUrl = whatsappUrl; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public String getRunId() { return runId; }
    public void setRunId(String runId) { this.runId = runId; }
    public Instant getCreatedAt() { return createdAt; }
}
