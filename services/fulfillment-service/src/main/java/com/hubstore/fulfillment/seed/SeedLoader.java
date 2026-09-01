package com.hubstore.fulfillment.seed;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * Nạp + deserialize canonical-seed.json (SF-2 authored — KHÔNG tự seed riêng).
 * Path resolution (plan Task 2): env SEED_PATH > ../../api/seed (chạy từ module)
 * > ../api/seed (chạy từ services/) > api/seed (chạy từ repo root).
 */
public final class SeedLoader {

    private SeedLoader() {
    }

    /** Trả path seed hợp lệ đầu tiên; không thấy → fail fast với danh sách đã thử. */
    public static Path resolve(String seedPathEnv) {
        List<Path> candidates = new ArrayList<>();
        if (seedPathEnv != null && !seedPathEnv.isBlank()) {
            candidates.add(Path.of(seedPathEnv));
        }
        candidates.add(Path.of("../../api/seed/canonical-seed.json"));
        candidates.add(Path.of("../api/seed/canonical-seed.json"));
        candidates.add(Path.of("api/seed/canonical-seed.json"));
        return candidates.stream()
                .filter(p -> Files.isRegularFile(p))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(
                        "canonical-seed.json không tìm thấy. Đã thử: " + candidates
                                + " — đặt env SEED_PATH trỏ thẳng vào file."));
    }

    public static SeedModels.SeedFile load(Path seedPath) {
        ObjectMapper mapper = new ObjectMapper();
        try {
            SeedModels.SeedFile seed = mapper.readValue(seedPath.toFile(), SeedModels.SeedFile.class);
            SeedValidator.assertValid(seed);
            return seed;
        } catch (IOException e) {
            throw new IllegalStateException("Không đọc được seed " + seedPath + ": " + e.getMessage(), e);
        }
    }
}
