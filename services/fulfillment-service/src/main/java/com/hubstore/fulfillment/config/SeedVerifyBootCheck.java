package com.hubstore.fulfillment.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Seed-verify boot check (SF-2, FI-245) — CHỈ chạy khi store=postgres
 * (in-memory tự có seed trong RAM, không cần check).
 *
 * Đơn rỗng lúc boot → KHÔNG BAO GIỜ tự seed (pipeline seed thuộc SF-1 —
 * scripts/seed-db.sh). Chỉ báo:
 * - STRICT_SEED=1 → throw IllegalStateException → boot FAIL-LOUD (CI/k8s
 *   không lên service trỏ DB rỗng).
 * - mặc định → log WARN hướng dẫn chạy seed pipeline SF-1.
 */
@Component
@ConditionalOnProperty(name = "fulfillment.store", havingValue = "postgres", matchIfMissing = true)
public class SeedVerifyBootCheck implements ApplicationRunner {

    private static final Logger LOG = LoggerFactory.getLogger(SeedVerifyBootCheck.class);

    private final JdbcTemplate jdbc;

    private final String strictSeed;

    public SeedVerifyBootCheck(JdbcTemplate jdbc, @Value("${STRICT_SEED:0}") String strictSeed) {
        this.jdbc = jdbc;
        this.strictSeed = strictSeed;
    }

    @Override
    public void run(ApplicationArguments args) {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM orders", Long.class);
        if (count != null && count > 0) {
            LOG.info("Seed-verify OK: bảng orders có {} dòng.", count);
            return;
        }
        if ("1".equals(strictSeed.trim())) {
            throw new IllegalStateException(
                    "STRICT_SEED=1 nhưng DB orders RỖNG — fail-loud. "
                            + "Chạy seed pipeline SF-1: bash scripts/seed-db.sh rồi boot lại.");
        }
        LOG.warn("DB orders RỖNG — chạy seed pipeline SF-1: bash scripts/seed-db.sh "
                + "(service KHÔNG tự seed). Đơn hàng sẽ không có cho đến khi seed xong.");
    }
}
