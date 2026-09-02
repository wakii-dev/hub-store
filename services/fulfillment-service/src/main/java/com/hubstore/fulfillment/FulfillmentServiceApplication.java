package com.hubstore.fulfillment;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Entry point — fulfillment-service (SF-3 / FI-237), spec §3.3.
 * Standalone gRPC server :50051; KHÔNG thuộc turbo (`pnpm dev` root không đụng).
 */
@SpringBootApplication
public class FulfillmentServiceApplication {

    public static void main(String[] args) {
        SpringApplication.run(FulfillmentServiceApplication.class, args);
    }
}
