package com.udhaarkhata.backend.reminder;

import com.udhaarkhata.backend.ledger.Customer;
import com.udhaarkhata.backend.ledger.CustomerRepository;
import com.udhaarkhata.backend.ledger.KhataPure;
import com.udhaarkhata.backend.ledger.KhataService;
import com.udhaarkhata.backend.ledger.dto.ReminderPublic;
import com.udhaarkhata.backend.user.ShopSettings;
import com.udhaarkhata.backend.web.NotFoundException;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Reminder runs (the daily-job equivalent): find customers whose dues are
 * older than `overdueDays` (default from Settings) and write reminder records
 * with ready WhatsApp links (amount in words + UPI one-tap link appended).
 */
@Service
public class ReminderService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final CustomerRepository customers;
    private final ReminderRepository reminderRepo;
    private final KhataService khata;

    public ReminderService(CustomerRepository customers, ReminderRepository reminderRepo, KhataService khata) {
        this.customers = customers;
        this.reminderRepo = reminderRepo;
        this.khata = khata;
    }

    public List<ReminderPublic> listReminders(UUID userId) {
        return reminderRepo.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 50))
            .stream().map(KhataPure::publicReminder).toList();
    }

    @Transactional
    public List<ReminderPublic> writeReminders(UUID userId, Integer overdueDays) {
        ShopSettings settings = khata.getSettings(userId);
        int days = Math.max(0, overdueDays == null ? settings.getOverdueDays() : overdueDays);
        String runId = randomRunId();
        List<ReminderPublic> written = new ArrayList<>();

        for (Customer c : customers.findByUserId(userId)) {
            if (c.isArchived()) continue; // archived customers are out of active collection
            if (c.getBalancePaise() <= 0) continue;
            int age = KhataPure.daysSince(c.getFirstDueAt() != null ? c.getFirstDueAt() : c.getLastTxnAt());
            if (age < days) continue;

            KhataService.WhatsAppLink link = khata.whatsappLink(userId, c.getName(),
                c.getBalancePaise(), c.getPhone(), age);

            Reminder row = new Reminder();
            row.setUserId(userId);
            row.setCustomerId(c.getId());
            row.setName(c.getName());
            row.setBalancePaise(c.getBalancePaise());
            row.setDaysOverdue(age);
            row.setPhone(c.getPhone());
            row.setWhatsappUrl(link.url());
            row.setMessage(link.message());
            row.setRunId(runId);
            reminderRepo.save(row);
            written.add(KhataPure.publicReminder(row));
        }
        return written;
    }

    /** Build (and record) a reminder for one customer right now. */
    @Transactional
    public ReminderPublic customerReminder(UUID userId, String name) {
        Customer c = customers.findByUserIdAndNameKey(userId, KhataPure.nameKey(name))
            .orElseThrow(() -> new NotFoundException("No customer named " + name + "."));
        if (c.getBalancePaise() <= 0) {
            throw new IllegalArgumentException(c.getName() + " has no outstanding balance.");
        }
        int age = KhataPure.daysSince(c.getFirstDueAt() != null ? c.getFirstDueAt() : c.getLastTxnAt());
        KhataService.WhatsAppLink link = khata.whatsappLink(userId, c.getName(),
            c.getBalancePaise(), c.getPhone(), age);

        Reminder row = new Reminder();
        row.setUserId(userId);
        row.setCustomerId(c.getId());
        row.setName(c.getName());
        row.setBalancePaise(c.getBalancePaise());
        row.setDaysOverdue(age);
        row.setPhone(c.getPhone());
        row.setWhatsappUrl(link.url());
        row.setMessage(link.message());
        row.setRunId("single");
        reminderRepo.save(row);
        return KhataPure.publicReminder(row);
    }

    private static String randomRunId() {
        String alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
        StringBuilder sb = new StringBuilder(12);
        for (int i = 0; i < 12; i++) sb.append(alphabet.charAt(RANDOM.nextInt(alphabet.length())));
        return sb.toString();
    }
}
