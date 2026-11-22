package com.udhaarkhata.backend.user;

import jakarta.persistence.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/** Single-row-per-shop settings (mirrors the Prisma Settings singleton). */
@Entity
@Table(name = "shop_settings")
public class ShopSettings {

    public static final String DEFAULT_TEMPLATE =
        "Namaste {name} ji, aapka udhaar Rs {amount} pending hai. Kripya jald payment kar dein. Dhanyavaad! — {shop}";

    @Id
    @Column(name = "user_id", length = 36)
    private UUID userId;

    @Column(name = "shop_name", nullable = false, length = 60)
    private String shopName = "My Shop";

    @Column(name = "overdue_days", nullable = false)
    private int overdueDays = 7;

    @Column(name = "reminder_template", nullable = false, length = 500)
    private String reminderTemplate = DEFAULT_TEMPLATE;

    @Column(name = "upi_id", length = 100)
    private String upiId;

    @Column(name = "demo_data", nullable = false)
    private boolean demoData = true;

    @Column(name = "updated_at")
    @UpdateTimestamp
    private Instant updatedAt;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getShopName() { return shopName; }
    public void setShopName(String shopName) { this.shopName = shopName; }
    public int getOverdueDays() { return overdueDays; }
    public void setOverdueDays(int overdueDays) { this.overdueDays = overdueDays; }
    public String getReminderTemplate() { return reminderTemplate; }
    public void setReminderTemplate(String reminderTemplate) { this.reminderTemplate = reminderTemplate; }
    public String getUpiId() { return upiId; }
    public void setUpiId(String upiId) { this.upiId = upiId; }
    public boolean isDemoData() { return demoData; }
    public void setDemoData(boolean demoData) { this.demoData = demoData; }
}
