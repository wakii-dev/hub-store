package com.hubstore.fulfillment.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

/**
 * SF-26 (FI-271) — idempotency store bảng webhook_events (V11), dedupe key
 * (source, external_id) UNIQUE. State machine CONTRACT (spec §3):
 * PENDING (đã claim, đang xử lý) | PROCESSED (thành công — replay trả kết quả
 * lần đầu) | FAILED (validate reject — gửi lại xử lý bình thường).
 *
 * Mọi chuyển tiếp là UPDATE CÓ ĐIỀU KIỆN (CAS) — trả rowsAffected, caller xử lý
 * 0-rows như conflict (re-select), KHÔNG bao giờ update mù. Các CAS reclaim/
 * process khóa trên received_at đã SELECT để holder stale không ghi đè row mà
 * reclaimer khác vừa lấy.
 *
 * @Repository: bean duy nhất cho IntakeServiceImpl (Postgres là store duy nhất
 * — idempotency không có đường in-memory; unit test construct thẳng bằng tay).
 */
@Repository
public class WebhookEventsDao {

    /** Trạng thái hiện tại + kết quả lần đầu + mốc claim (CAS key). */
    public record Row(String status, String fulfillCode, Instant receivedAt) {
    }

    private final JdbcTemplate jdbc;

    public WebhookEventsDao(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Claim khi CHƯA có row: INSERT status='PENDING' ON CONFLICT DO NOTHING →
     * commit ngay (tx riêng phía caller) — unique index chặn race giữa các
     * request song song. true = claim thành công; false = đã có row.
     */
    public boolean claimInsert(String source, String externalId, String payloadJson) {
        int n = jdbc.update(
                "INSERT INTO webhook_events (source, external_id, payload, status) "
                        + "VALUES (?, ?, CAST(? AS jsonb), 'PENDING') "
                        + "ON CONFLICT (source, external_id) DO NOTHING",
                source, externalId, payloadJson);
        return n == 1;
    }

    /** SELECT theo (source, external_id) — empty = chưa từng claim. */
    public Optional<Row> findStatus(String source, String externalId) {
        return jdbc.query(
                "SELECT status, fulfill_code, received_at FROM webhook_events "
                        + "WHERE source = ? AND external_id = ? LIMIT 1",
                (rs, n) -> new Row(rs.getString("status"), rs.getString("fulfill_code"),
                        rs.getObject("received_at", OffsetDateTime.class).toInstant()),
                source, externalId).stream().findFirst();
    }

    /**
     * FAILED → PENDING (caller sửa payload gửi lại): reset kết quả lần đầu +
     * REFRESH payload (contract spec §3 bước 4 — cột payload phải khớp order
     * của lần gửi ĐANG xử lý, không phải payload lần đầu bị từ chối).
     * rowsAffected=0 → đối thủ đã claim trước (re-select).
     */
    public int casReprocess(String source, String externalId, String payloadJson) {
        return jdbc.update(
                "UPDATE webhook_events SET status = 'PENDING', received_at = now(), "
                        + "payload = CAST(? AS jsonb), fulfill_code = NULL, processed_at = NULL "
                        + "WHERE source = ? AND external_id = ? AND status = 'FAILED'",
                payloadJson, source, externalId);
    }

    /**
     * PENDING STALE (crash mồ côi) → reclaim: khóa trên received_at ĐÃ SELECT
     * (rowsAffected=0 → đối thủ reclaim trước — re-select). REFRESH payload —
     * body của reclaimer có thể khác body mồ côi ban đầu.
     */
    public int casReclaim(String source, String externalId, Instant staleTs, String payloadJson) {
        return jdbc.update(
                "UPDATE webhook_events SET status = 'PENDING', received_at = now(), "
                        + "payload = CAST(? AS jsonb) "
                        + "WHERE source = ? AND external_id = ? AND status = 'PENDING' AND received_at = ?",
                payloadJson, source, externalId, toTs(staleTs));
    }

    /**
     * Validate reject: PENDING → FAILED keyed trên claimed ts (chỉ holder hiện
     * tại được mark). FAILED = lần gửi ĐÓ bị từ chối; gửi lại xử lý lại.
     */
    public int markFailed(String source, String externalId, Instant claimedTs) {
        return jdbc.update(
                "UPDATE webhook_events SET status = 'FAILED' "
                        + "WHERE source = ? AND external_id = ? AND status = 'PENDING' AND received_at = ?",
                source, externalId, toTs(claimedTs));
    }

    /**
     * CAS final TRONG tx xử lý (plan Task 3 Step 2.5): PENDING → PROCESSED +
     * fulfill_code, keyed trên claimed ts — ngăn holder stale ghi đè fulfillCode
     * của người reclaim. Caller BẮT BUỘC assert rowsAffected == 1; != 1 → throw
     * INTERNAL để TransactionTemplate rollback toàn bộ (order không tồn tại).
     */
    public int casProcess(String source, String externalId, String fulfillCode, Instant claimedTs) {
        return jdbc.update(
                "UPDATE webhook_events SET status = 'PROCESSED', fulfill_code = ?, processed_at = now() "
                        + "WHERE source = ? AND external_id = ? AND status = 'PENDING' AND received_at = ?",
                fulfillCode, source, externalId, toTs(claimedTs));
    }

    /** Instant → timestamptz param (pattern PostgresOrderRepository — UTC). */
    private static OffsetDateTime toTs(Instant at) {
        return OffsetDateTime.ofInstant(at, ZoneOffset.UTC);
    }
}
