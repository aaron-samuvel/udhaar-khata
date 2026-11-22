# Multi-stage build — reproducible, small runtime image, non-root user.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Cache dependencies separately so source edits rebuild fast.
COPY pom.xml .
RUN mvn -q -e dependency:go-offline

COPY src ./src
RUN mvn -q package -DskipTests

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 1001 khata
WORKDIR /app

COPY --from=build /app/target/udhaar-khata-backend.jar app.jar

USER khata
EXPOSE 8080

ENV JAVA_OPTS=""
# Health probe via bash /dev/tcp (no curl in the JRE image).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080 && printf "GET /api/health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r" >&3 && grep -q "\"ok\":true" <&3'

ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
