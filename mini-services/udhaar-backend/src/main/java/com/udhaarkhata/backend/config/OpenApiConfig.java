package com.udhaarkhata.backend.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.Components;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Swagger UI at /swagger-ui.html — "Authorize" button accepts Bearer JWTs. */
@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI openAPI() {
        final String scheme = "bearerAuth";
        return new OpenAPI()
            .info(new Info()
                .title("Udhaar Khata API")
                .version("1.0.0")
                .description("Production backend for the kirana credit ledger: "
                    + "customers, ledger transactions, WhatsApp/UPI reminders, "
                    + "reports, audit trail, backup/restore. "
                    + "Money is integer paise everywhere."))
            .addSecurityItem(new SecurityRequirement().addList(scheme))
            .components(new Components().addSecuritySchemes(scheme,
                new SecurityScheme()
                    .name(scheme)
                    .type(SecurityScheme.Type.HTTP)
                    .scheme("bearer")
                    .bearerFormat("JWT")));
    }
}
