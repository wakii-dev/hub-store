package com.hubstore.fulfillment.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HexFormat;

/**
 * Real verifier qua Zalopay account-verify open API (SF-17).
 *
 * CONTRACT INTENT — CHƯA test được khi chưa có credentials (spec SF-17 §5):
 * - Chọn qua payment.verify.provider=zalopay.
 * - Boot FAIL-LOUD nếu thiếu ZALOPAY_APP_ID/ZALOPAY_KEY1 (không âm thầm mock).
 * - Verify: POST form {appid, account, sign=HMAC-SHA256(key1, appid+account)}
 *   tới endpoint verify; response JSON error_code==1 (+ account verified) →
 *   valid=true, giữ message gốc của Zalopay; code khác → valid=false.
 * - Lỗi mạng/creds/parse → valid=false + message lỗi — KHÔNG crash (verify là
 *   tiện ích form, không chặn service).
 */
@Component
@ConditionalOnProperty(name = "payment.verify.provider", havingValue = "zalopay")
public class ZalopayPaymentAccountVerifier implements PaymentAccountVerifier {

    static final String DEFAULT_ENDPOINT = "https://payment.zalopay.vn/openapi/accinfo";

    private final String appId;
    private final String key1;
    private final RestClient restClient;
    private final ObjectMapper mapper = new ObjectMapper();

    public ZalopayPaymentAccountVerifier(
            org.springframework.core.env.Environment env) {
        this.appId = env.getProperty("payment.verify.zalopay.app-id", System.getenv("ZALOPAY_APP_ID"));
        this.key1 = env.getProperty("payment.verify.zalopay.key1", System.getenv("ZALOPAY_KEY1"));
        if (appId == null || appId.isBlank() || key1 == null || key1.isBlank()) {
            throw new IllegalStateException("payment.verify.provider=zalopay yêu cầu env "
                    + "ZALOPAY_APP_ID và ZALOPAY_KEY1 — thiếu → fail-loud lúc boot (spec SF-17 §5).");
        }
        String endpoint = env.getProperty("payment.verify.zalopay.endpoint", DEFAULT_ENDPOINT);
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(10));
        this.restClient = RestClient.builder().baseUrl(endpoint).requestFactory(factory).build();
    }

    @Override
    public VerifyResult verify(String account) {
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("appid", appId);
            form.add("account", account);
            form.add("sign", hmacSha256(key1, appId + account));
            String body = restClient.post().contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form).retrieve().body(String.class);
            JsonNode json = mapper.readTree(body == null ? "" : body);
            int code = json.path("error_code").asInt(json.path("return_code").asInt(-1));
            String message = json.path("return_message").asText(json.path("error_message").asText(""));
            boolean valid = code == 1;
            return new VerifyResult(valid, "ZALOPAY", valid
                    ? (message.isBlank() ? "Zalopay xác nhận TK hợp lệ." : message)
                    : (message.isBlank() ? "Zalopay từ chối TK (code=" + code + ")." : message));
        } catch (Exception e) {
            // Lỗi mạng/creds/parse — valid=false, KHÔNG crash (spec SF-17 §5).
            return new VerifyResult(false, "ZALOPAY",
                    "Không verify được qua Zalopay: " + e.getMessage());
        }
    }

    private static String hmacSha256(String key, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }
}
