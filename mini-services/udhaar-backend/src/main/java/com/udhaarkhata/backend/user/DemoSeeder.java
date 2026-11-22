package com.udhaarkhata.backend.user;

import com.udhaarkhata.backend.ledger.KhataService;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * First-boot seeding: creates the special anonymous demo shop used by
 * legacy-anonymous mode (no Authorization header → this shop) and seeds the
 * clearly-labeled demonstration dataset, exactly like the Next.js backend's
 * first-run state. Real accounts created via /api/auth/signup start empty.
 */
@Component
public class DemoSeeder implements ApplicationRunner {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final KhataService khata;

    public DemoSeeder(UserRepository users, PasswordEncoder encoder, KhataService khata) {
        this.users = users;
        this.encoder = encoder;
        this.khata = khata;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (users.count() > 0) return;

        User demo = new User();
        demo.setEmail("demo@udhaar.local");
        // Nobody logs in as the demo shop (anonymous requests map to it); the
        // password is random and discarded.
        demo.setPasswordHash(encoder.encode(UUID.randomUUID() + "-" + UUID.randomUUID()));
        demo.setShopName("My Shop");
        users.save(demo);

        khata.seedDemo(demo.getId());
        ShopSettings settings = khata.getSettings(demo.getId());
        settings.setDemoData(true);
    }
}
