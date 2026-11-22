package com.udhaarkhata.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Udhaar Khata production backend.
 *
 * Spring Boot service implementing the complete kirana credit-ledger API:
 * natural-language-ready ledger entries, customer khatas, WhatsApp/UPI
 * reminders, reports, audit trail, backup/restore — multi-user (JWT) with an
 * opt-in legacy anonymous mode so the existing Next.js frontend works
 * unchanged against it.
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class UdhaarKhataApplication {
    public static void main(String[] args) {
        SpringApplication.run(UdhaarKhataApplication.class, args);
    }
}
