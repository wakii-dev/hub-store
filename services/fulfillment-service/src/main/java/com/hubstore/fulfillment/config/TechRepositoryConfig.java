package com.hubstore.fulfillment.config;

import com.hubstore.fulfillment.seed.TechSeedLoader;
import com.hubstore.fulfillment.store.InMemoryTechOrderRepository;
import com.hubstore.fulfillment.store.PostgresTechOrderRepository;
import com.hubstore.fulfillment.store.TechOrderRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Chọn impl TechOrderRepository lúc boot (SF-19, FI-264) — pattern
 * OrderRepositoryConfig:
 * <ul>
 *   <li>fulfillment.store=postgres (default, matchIfMissing=true):
 *       PostgresTechOrderRepository qua JdbcTemplate (Flyway V6 tạo 4 bảng tech;
 *       runtime thiếu datasource → Spring Boot FAIL-LOUD, không fallback âm thầm).</li>
 *   <li>fulfillment.store=inmemory: chỉ dùng trong unit test context — seed qua
 *       TechSeedLoader (TECH_SEED_PATH env/property, fallback path chuẩn).</li>
 * </ul>
 */
@Configuration
public class TechRepositoryConfig {

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "postgres", matchIfMissing = true)
    public TechOrderRepository postgresTechOrderRepository(JdbcTemplate jdbcTemplate) {
        return new PostgresTechOrderRepository(jdbcTemplate);
    }

    @Bean
    @ConditionalOnProperty(name = "fulfillment.store", havingValue = "inmemory")
    public TechOrderRepository inMemoryTechOrderRepository(
            @Value("${fulfillment.tech-seed-path:}") String seedPathEnv) {
        // TechSeedLoader.resolve: seedPathEnv (TECH_SEED_PATH) trước, fallback path chuẩn.
        return new InMemoryTechOrderRepository(TechSeedLoader.load(TechSeedLoader.resolve(seedPathEnv)));
    }
}
