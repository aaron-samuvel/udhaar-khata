package com.udhaarkhata.backend.report;

import com.udhaarkhata.backend.ledger.dto.ReportsResponse;
import com.udhaarkhata.backend.security.UserPrincipal;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@Tag(name = "Reports")
public class ReportController {

    private final ReportService reports;

    public ReportController(ReportService reports) {
        this.reports = reports;
    }

    @GetMapping("/api/reports")
    @Operation(summary = "Aggregated reports (today | 7d | 30d | all | custom)")
    public Map<String, Object> getReport(@AuthenticationPrincipal UserPrincipal user,
                                         @RequestParam(defaultValue = "30d") String range,
                                         @RequestParam(required = false) String from,
                                         @RequestParam(required = false) String to) {
        ReportsResponse report = reports.getReports(user.id(), range, from, to);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("ok", true);
        body.put("range", report.range());
        body.put("totals", report.totals());
        body.put("series", report.series());
        body.put("customerOutstanding", report.customerOutstanding());
        body.put("recent", report.recent());
        body.put("meta", report.meta());
        return body;
    }
}
