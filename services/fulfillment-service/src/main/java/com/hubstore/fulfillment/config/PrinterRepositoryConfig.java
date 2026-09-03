package com.hubstore.fulfillment.config;

import com.hubstore.fulfillment.store.InMemoryPrinterRepository;
import com.hubstore.fulfillment.store.PostgresPrinterRepository;
import com.hubstore.fulfillment.store.PrinterRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Wiring PrinterRepository (SF-21) — pattern ServiceEmployeeRepositoryConfig.
 * postgres là default (matchIfMissing=true — fail-loud datasource thiếu do
 * auto-config, khớp SF-2/17); fulfillment.store=in-memory → InMemory
 * (unit/test profile dùng wiring thủ công, không đi qua config này).
 */
@Configuration
public class PrinterRepositoryConfig {

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "postgres", matchIfMissing = true)
    public PrinterRepository postgresPrinterRepository(JdbcTemplate jdbcTemplate) {
        return new PostgresPrinterRepository(jdbcTemplate);
    }

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "in-memory")
    public PrinterRepository inMemoryPrinterRepository() {
        return new InMemoryPrinterRepository();
    }
}
