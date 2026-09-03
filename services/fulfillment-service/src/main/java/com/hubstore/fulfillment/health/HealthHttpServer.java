package com.hubstore.fulfillment.health;

import com.sun.net.httpserver.HttpServer;
import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

/**
 * HTTP health side-port (SF-12 Task 4, spec §3.3).
 *
 * <p>App là {@code web-application-type: none} (KHÔNG thêm spring-web) → nhúng
 * {@code com.sun.net.httpserver.HttpServer} (JDK) trên :{@code ${HEALTH_PORT:8083}}
 * (8081=Keycloak, 8082=Go health). GET /health ping DataSource {@code SELECT 1}
 * qua JdbcTemplate → JSON:
 * <ul>
 *   <li>200 {@code {"status":"ok","db":"ok"}}</li>
 *   <li>503 {@code {"status":"degraded","db":"down"}}</li>
 * </ul>
 *
 * <p>Start SAU {@link ApplicationReadyEvent} (seed đã load — cùng mốc SERVING
 * của grpc.health, thấy {@link FulfillmentHealthReadiness}); stop qua @PreDestroy.
 */
@Component
public class HealthHttpServer {

    private final JdbcTemplate jdbcTemplate;
    private final int port;
    private HttpServer server;

    public HealthHttpServer(JdbcTemplate jdbcTemplate,
                            @Value("${fulfillment.health-port:8083}") int port) {
        this.jdbcTemplate = jdbcTemplate;
        this.port = port;
    }

    /** Context sẵn sàng (seed xong) → mở HTTP health port. */
    @EventListener(ApplicationReadyEvent.class)
    public void start() throws IOException {
        server = HttpServer.create(new InetSocketAddress(port), 0);
        server.createContext("/health", exchange -> {
            boolean dbOk;
            try {
                Integer one = jdbcTemplate.query("SELECT 1", rs -> rs.next() ? rs.getInt(1) : null);
                dbOk = one != null && one == 1;
            } catch (RuntimeException e) {
                dbOk = false;
            }
            byte[] body = (dbOk
                ? "{\"status\":\"ok\",\"db\":\"ok\"}"
                : "{\"status\":\"degraded\",\"db\":\"down\"}").getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(dbOk ? 200 : 503, body.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(body);
            }
        });
        server.start();
    }

    @PreDestroy
    public void stop() {
        if (server != null) {
            server.stop(0);
        }
    }
}
