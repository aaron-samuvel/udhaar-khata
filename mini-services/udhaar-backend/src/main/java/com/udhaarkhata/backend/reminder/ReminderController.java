package com.udhaarkhata.backend.reminder;

import com.udhaarkhata.backend.ledger.dto.ReminderPublic;
import com.udhaarkhata.backend.security.UserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/reminders")
@Tag(name = "Reminders")
public class ReminderController {

    private final ReminderService reminders;

    public ReminderController(ReminderService reminders) {
        this.reminders = reminders;
    }

    public record SweepRequest(Object overdue_days, Object overdueDays) {}
    public record CustomerReminderRequest(String name) {}

    @GetMapping
    @Operation(summary = "Recent reminder records")
    public Map<String, Object> list(@AuthenticationPrincipal UserPrincipal user) {
        return Map.of("ok", true, "reminders", reminders.listReminders(user.id()));
    }

    @PostMapping
    @Operation(summary = "Run a dues sweep (write fresh WhatsApp links for overdue customers)")
    public Map<String, Object> sweep(@AuthenticationPrincipal UserPrincipal user,
                                     @RequestBody(required = false) SweepRequest body) {
        Integer overdueDays = null;
        if (body != null) {
            Object raw = body.overdue_days() != null ? body.overdue_days() : body.overdueDays();
            if (raw != null && !String.valueOf(raw).isEmpty()) {
                try {
                    double n = Double.parseDouble(String.valueOf(raw));
                    if (n < 0 || n > 365) {
                        throw new IllegalArgumentException("overdue_days must be between 0 and 365.");
                    }
                    overdueDays = (int) Math.floor(n);
                } catch (NumberFormatException e) {
                    throw new IllegalArgumentException("overdue_days must be between 0 and 365.");
                }
            }
        }
        List<ReminderPublic> written = reminders.writeReminders(user.id(), overdueDays);
        Map<String, Object> body2 = new LinkedHashMap<>();
        body2.put("ok", true);
        body2.put("reminders_written", written.size());
        body2.put("reminders", written);
        body2.put("status", "SUCCEEDED");
        return body2;
    }

    @PostMapping("/customer")
    @Operation(summary = "Build a WhatsApp reminder for one customer now")
    public ResponseEntity<Map<String, Object>> customerReminder(@AuthenticationPrincipal UserPrincipal user,
                                                                @RequestBody CustomerReminderRequest body) {
        if (body == null || body.name() == null || body.name().trim().isEmpty()) {
            throw new IllegalArgumentException("Invalid request.");
        }
        ReminderPublic reminder = reminders.customerReminder(user.id(), body.name().trim());
        return ResponseEntity.status(201).body(Map.of("ok", true, "reminder", reminder));
    }
}
