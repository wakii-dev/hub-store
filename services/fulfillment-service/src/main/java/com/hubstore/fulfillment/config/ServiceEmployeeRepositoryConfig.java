package com.hubstore.fulfillment.config;

import com.hubstore.fulfillment.store.PostgresServiceEmployeeRepository;
import com.hubstore.fulfillment.store.ServiceEmployeeRepository;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Wiring ServiceEmployeeRepository (SF-17) — pattern OrderRepositoryConfig:
 * plain Postgres impl duy nhất (area-staff là model mới, không có in-memory
 * predecessor). matchIfMissing=true — thiếu property vẫn postgres (fail-loud
 * datasource thiếu do Spring Boot auto-config, khớp hành vi SF-2).
 */
@Configuration
public class ServiceEmployeeRepositoryConfig {

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "postgres", matchIfMissing = true)
    public ServiceEmployeeRepository postgresServiceEmployeeRepository(JdbcTemplate jdbcTemplate) {
        return new PostgresServiceEmployeeRepository(jdbcTemplate);
    }
}
