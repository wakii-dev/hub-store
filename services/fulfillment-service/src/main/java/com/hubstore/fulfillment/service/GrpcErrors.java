package com.hubstore.fulfillment.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.grpc.Metadata;
import io.grpc.Status;
import io.grpc.StatusRuntimeException;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Lỗi gRPC của fulfillment-service — CONVENTION PIN SF-2 (contract BFF decode
 * ở services/bff-gateway/src/lib/grpc-error.ts):
 *   metadata key "x-error-details" = encodeURIComponent(JSON [{field,message}]).
 *
 * Java side: gRPC metadata chỉ nhận ASCII printable nên PHẢI percent-encode.
 * URLEncoder.encode dùng '+' cho space còn JS decodeURIComponent KHÔNG decode
 * '+' → thay '+' bằng "%20" để khớp encodeURIComponent (các ký tự !~*'() bị
 * encode thêm cũng decode ngược đúng).
 */
public final class GrpcErrors {

    public static final String METADATA_DETAILS_KEY = "x-error-details";

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private GrpcErrors() {
    }

    public record ErrorDetail(String field, String message) {
    }

    /** INVALID_ARGUMENT + x-error-details (map thành 422 details[] ở BFF). */
    public static StatusRuntimeException invalidArgument(List<ErrorDetail> details) {
        return withDetails(Status.INVALID_ARGUMENT, "Validation failed.", details);
    }

    /** NOT_FOUND + x-error-details (map thành 404 ở BFF). */
    public static StatusRuntimeException notFound(String field, String fulfillCode) {
        return withDetails(Status.NOT_FOUND, "Order " + fulfillCode + " not found.",
                List.of(new ErrorDetail(field, "Order " + fulfillCode + " không tồn tại.")));
    }

    public static StatusRuntimeException withDetails(Status status, String description,
                                                     List<ErrorDetail> details) {
        Metadata metadata = new Metadata();
        try {
            String json = MAPPER.writeValueAsString(details.stream()
                    .map(d -> Map.of("field", d.field(), "message", d.message()))
                    .toList());
            String encoded = URLEncoder.encode(json, StandardCharsets.UTF_8).replace("+", "%20");
            metadata.put(Metadata.Key.of(METADATA_DETAILS_KEY, Metadata.ASCII_STRING_MARSHALLER), encoded);
        } catch (Exception e) {
            // Không bao giờ để lỗi serialize che mất status gốc.
            metadata.put(Metadata.Key.of(METADATA_DETAILS_KEY, Metadata.ASCII_STRING_MARSHALLER),
                    URLEncoder.encode("[{\"field\":\"request\",\"message\":\"Validation failed.\"}]",
                            StandardCharsets.UTF_8));
        }
        return status.withDescription(description).asRuntimeException(metadata);
    }
}
