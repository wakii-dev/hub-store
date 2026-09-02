package com.hubstore.fulfillment.payment;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

/**
 * Mock verifier (default — matchIfMissing=true): KHÔNG gọi ra ngoài, chỉ match
 * shape số TK ^\d{9,16}$ (cùng rule validate BE). Message LUÔN chứa tag [MOCK]
 * — FE badge nguồn verify. Real Zalopay bật qua PAYMENT_VERIFY_PROVIDER=zalopay.
 */
@Component
@ConditionalOnProperty(name = "payment.verify.provider", havingValue = "mock", matchIfMissing = true)
public class MockPaymentAccountVerifier implements PaymentAccountVerifier {

    static final Pattern ACCOUNT_PATTERN = Pattern.compile("^\\d{9,16}$");

    @Override
    public VerifyResult verify(String account) {
        boolean valid = account != null && ACCOUNT_PATTERN.matcher(account).matches();
        return new VerifyResult(valid, "MOCK", valid
                ? "[MOCK] Số TK hợp lệ (9-16 chữ số)."
                : "[MOCK] Số TK không hợp lệ — phải có 9-16 chữ số.");
    }
}
