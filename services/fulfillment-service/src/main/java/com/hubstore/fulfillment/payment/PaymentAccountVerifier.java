package com.hubstore.fulfillment.payment;

/**
 * SPI verify TK nhận tiền (SF-17 dual-mode). Impl được chọn qua property
 * {@code payment.verify.provider}:
 * <ul>
 *   <li>{@code mock} (default, matchIfMissing): {@link MockPaymentAccountVerifier}</li>
 *   <li>{@code zalopay}: {@link ZalopayPaymentAccountVerifier} (yêu cầu env
 *       ZALOPAY_APP_ID/ZALOPAY_KEY1 — thiếu → fail-loud lúc boot)</li>
 * </ul>
 */
public interface PaymentAccountVerifier {

    /**
     * @param account số TK nhận tiền (đã trim)
     * @return kết quả verify — KHÔNG bao giờ throw với input lạ: hợp lệ/không
     *         hợp lệ đều là {@link VerifyResult}; lỗi mạng/creds → valid=false.
     */
    VerifyResult verify(String account);

    /**
     * @param valid   TK hợp lệ hay không
     * @param source  nguồn verify — "MOCK" | "ZALOPAY" (proto VerifyPaymentAccountResponse.source)
     * @param message mô tả (mock bắt buộc chứa tag [MOCK] — FE hiển thị badge nguồn)
     */
    record VerifyResult(boolean valid, String source, String message) {
    }
}
