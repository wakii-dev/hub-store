package com.hubstore.fulfillment;

import com.hubstore.fulfillment.payment.MockPaymentAccountVerifier;
import com.hubstore.fulfillment.payment.PaymentAccountVerifier.VerifyResult;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test MockPaymentAccountVerifier (SF-17 task 3): valid 9-16 digits →
 * valid=true + source=MOCK + message chứa tag [MOCK]; invalid → valid=false.
 */
class MockPaymentAccountVerifierTest {

    private final MockPaymentAccountVerifier verifier = new MockPaymentAccountVerifier();

    @Test
    void validTenDigitsAccepted() {
        VerifyResult r = verifier.verify("0123456789");
        assertThat(r.valid()).isTrue();
        assertThat(r.source()).isEqualTo("MOCK");
        assertThat(r.message()).contains("[MOCK]");
    }

    @Test
    void boundaryLengthsAccepted() {
        assertThat(verifier.verify("123456789").valid()).isTrue();   // 9
        assertThat(verifier.verify("1234567890123456").valid()).isTrue(); // 16
    }

    @Test
    void invalidInputRejected() {
        for (String bad : new String[]{"abc", "", "12345678", "12345678901234567", "0123-456", null}) {
            VerifyResult r = verifier.verify(bad);
            assertThat(r.valid()).as("account='" + bad + "' phải invalid").isFalse();
            assertThat(r.source()).isEqualTo("MOCK");
            assertThat(r.message()).contains("[MOCK]");
        }
    }
}
