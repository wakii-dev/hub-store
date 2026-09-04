package com.hubstore.fulfillment.service;

import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.annotation.Order;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.RemoteJWKSet;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;

import io.grpc.Context;
import io.grpc.Contexts;
import io.grpc.Metadata;
import io.grpc.ServerCall;
import io.grpc.ServerCallHandler;
import io.grpc.ServerInterceptor;
import io.grpc.Status;
import net.devh.boot.grpc.server.interceptor.GrpcGlobalServerInterceptor;

/**
 * SF-12 (FI-257) — s2s auth interceptor: token passthrough (spec §3.1 CONTRACT).
 *
 * <p>Auth matrix (KHÔNG tự ý đổi):
 * <ol>
 *   <li>{@code authorization: Bearer <JWT>} hợp lệ (RS256, iss={@code oidc.issuer},
 *       exp ok, JWKS khớp kid qua nimbus {@link RemoteJWKSet} — tự refetch unknown
 *       kid) → ALLOW; role DERIVE từ claim {@code realm_access.roles} — metadata
 *       {@code x-user-role} KHÔNG được tin, override bằng claim (warn nếu lệch).</li>
 *   <li>{@code x-internal-token} == {@code auth.internal-service-token} → ALLOW;
 *       tin {@code x-user-role}/{@code x-user-name} metadata (actor qua
 *       {@link ActorInterceptor}).</li>
 *   <li>thiếu / sai → {@link Status#PERMISSION_DENIED}. Fail-closed.</li>
 * </ol>
 *
 * <p>Allowlist (pass-through): {@code /grpc.health.v1.Health/} +
 * {@code /grpc.reflection.v1.ServerReflection/} (cả v1alpha).
 *
 * <p>{@code AUTH_DISABLED=1}: CHỈ unit-test harness — bypass + WARN loud mỗi 60s;
 * compose KHÔNG được định nghĩa biến này.
 *
 * <p>Wiring: {@code @GrpcGlobalServerInterceptor} (devh auto-register, cùng cơ chế
 * {@link ActorInterceptor}); {@code @Order(0)} để chạy TRƯỚC ActorInterceptor
 * (auth derive role → downstream chỉ đọc).
 */
@GrpcGlobalServerInterceptor
@Order(0)
public class TokenAuthInterceptor implements ServerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(TokenAuthInterceptor.class);

    public static final Metadata.Key<String> AUTHORIZATION_METADATA =
            Metadata.Key.of("authorization", Metadata.ASCII_STRING_MARSHALLER);
    public static final Metadata.Key<String> INTERNAL_TOKEN_METADATA =
            Metadata.Key.of("x-internal-token", Metadata.ASCII_STRING_MARSHALLER);
    public static final Metadata.Key<String> USER_ROLE_METADATA =
            Metadata.Key.of("x-user-role", Metadata.ASCII_STRING_MARSHALLER);

    private static final Context.Key<String> ROLE_CONTEXT_KEY = Context.key("x-auth-role");

    /** Role mirror KNOWN_ROLES của BFF plugins/auth.ts (claim realm_access.roles). */
    private static final Set<String> KNOWN_ROLES = Set.of(
            "Coordinator", "WarehouseOps", "Manager", "Admin",
            "WarehouseEmployee", "InsideTechnician", "OutsideTechnician");

    private static final Set<String> ALLOWLIST_PREFIXES = Set.of(
            "/grpc.health.v1.Health/",
            "/grpc.reflection.v1.ServerReflection/",
            "/grpc.reflection.v1alpha.ServerReflection/");

    private static final long CLOCK_SKEW_SECONDS = 30;
    private static final long AUTH_DISABLED_WARN_MILLIS = 60_000;

    private final String issuer;
    private final String internalToken;
    private final DefaultJWTProcessor<SecurityContext> jwtProcessor;
    private final AtomicLong lastAuthWarn = new AtomicLong();

    public TokenAuthInterceptor(
            @Value("${oidc.issuer:}") String issuer,
            @Value("${oidc.jwks-url:}") String jwksUrl,
            @Value("${auth.internal-service-token:}") String internalToken) {
        this.issuer = issuer == null ? "" : issuer.trim();
        this.internalToken = internalToken == null ? "" : internalToken.trim();
        DefaultJWTProcessor<SecurityContext> p = null;
        if (!jwksUrl.isBlank()) {
            try {
                JWKSource<SecurityContext> source =
                        new RemoteJWKSet<>(new URL(jwksUrl)); // cache default + refetch unknown kid
                p = new DefaultJWTProcessor<>();
                p.setJWSKeySelector(new JWSVerificationKeySelector<>(JWSAlgorithm.RS256, source));
            } catch (java.net.MalformedURLException e) {
                log.error("[auth] OIDC_JWKS_URL không hợp lệ: {} — mọi Bearer call sẽ DENY", jwksUrl, e);
                p = null;
            }
        }
        this.jwtProcessor = p;
        log.info("[auth] TokenAuthInterceptor khởi tạo — issuer='{}', jwks={}, internalToken={}",
                this.issuer, jwksUrl != null && !jwksUrl.isBlank() ? "set" : "EMPTY",
                !this.internalToken.isBlank() ? "set" : "EMPTY");
    }

    @Override
    public <ReqT, RespT> ServerCall.Listener<ReqT> interceptCall(
            ServerCall<ReqT, RespT> call, Metadata headers, ServerCallHandler<ReqT, RespT> next) {
        String method = call.getMethodDescriptor().getFullMethodName();
        if (isAllowlisted(method)) {
            return next.startCall(call, headers);
        }
        if ("1".equals(System.getenv("AUTH_DISABLED"))) {
            warnAuthDisabled();
            return next.startCall(call, headers);
        }

        String authz = headers.get(AUTHORIZATION_METADATA);
        if (authz != null && authz.startsWith("Bearer ")) {
            String role = verifyBearer(authz.substring("Bearer ".length()).trim());
            if (role == null) {
                call.close(Status.PERMISSION_DENIED.withDescription(
                        "Invalid or expired bearer token"), new Metadata());
                return noop();
            }
            String metaRole = headers.get(USER_ROLE_METADATA);
            if (metaRole != null && !metaRole.isBlank() && !metaRole.equals(role)) {
                log.warn("[auth] x-user-role metadata '{}' != token claim '{}' — dùng claim (token wins)",
                        metaRole, role);
            }
            Metadata rewritten = copyWithRole(headers, role);
            Context ctx = Context.current().withValue(ROLE_CONTEXT_KEY, role);
            return Contexts.interceptCall(ctx, call, rewritten, next);
        }

        String internal = headers.get(INTERNAL_TOKEN_METADATA);
        if (internal != null && !internal.isBlank() && !this.internalToken.isBlank()
                && MessageDigest.isEqual( // constant-time — chống timing attack
                        this.internalToken.getBytes(StandardCharsets.UTF_8),
                        internal.getBytes(StandardCharsets.UTF_8))) {
            return next.startCall(call, headers); // tin x-user-role / x-user-name metadata
        }

        call.close(Status.PERMISSION_DENIED.withDescription(
                "Missing or invalid credentials"), new Metadata());
        return noop();
    }

    /** Role đã derive của RPC đang chạy (Bearer path); ngoài context → null. */
    public static String currentRole() {
        String role = ROLE_CONTEXT_KEY.get();
        return role == null || role.isBlank() ? null : role;
    }

    private boolean isAllowlisted(String fullMethodName) {
        // GOTCHA (SF-12 live-verify): Java getFullMethodName() KHÔNG có leading
        // slash ("grpc.health.v1.Health/Check") trong khi allowlist prefix có
        // ("/grpc.health.v1.Health/") — không normalize thì allowlist chết,
        // health/reflection bị DENY (Go info.FullMethod có slash, không vướng).
        String name = fullMethodName.startsWith("/") ? fullMethodName.substring(1) : fullMethodName;
        for (String prefix : ALLOWLIST_PREFIXES) {
            String p = prefix.startsWith("/") ? prefix.substring(1) : prefix;
            if (name.startsWith(p)) {
                return true;
            }
        }
        return false;
    }

    /**
     * RS256 signature (nimbus processor + RemoteJWKSet) + iss + exp verify thủ công
     * (explicit — không dựa default claims verifier). Trả role đã derive, hoặc null
     * khi mọi bước fail (deny).
     */
    private String verifyBearer(String rawToken) {
        if (jwtProcessor == null || issuer.isBlank()) {
            return null; // config thiếu → fail-closed
        }
        try {
            SignedJWT signed = SignedJWT.parse(rawToken);
            JWTClaimsSet claims = jwtProcessor.process(signed, null);
            if (!issuer.equals(claims.getIssuer())) {
                log.warn("[auth] iss '{}' != expected '{}'", claims.getIssuer(), issuer);
                return null;
            }
            java.util.Date exp = claims.getExpirationTime();
            java.util.Date now = new java.util.Date();
            if (exp == null || exp.getTime() + CLOCK_SKEW_SECONDS * 1000 < now.getTime()) {
                return null; // thiếu exp / hết hạn
            }
            Object ra = claims.getClaim("realm_access");
            if (ra instanceof Map<?, ?> map && map.get("roles") instanceof List<?> roles) {
                for (Object r : roles) {
                    if (r instanceof String s && KNOWN_ROLES.contains(s)) {
                        return s;
                    }
                }
            }
            return null; // không có realm role được phép
        } catch (Exception e) {
            log.debug("[auth] bearer verify fail: {}", e.getMessage());
            return null;
        }
    }

    private static Metadata copyWithRole(Metadata headers, String role) {
        Metadata out = new Metadata();
        for (String name : headers.keys()) {
            Metadata.Key<String> key = safeKey(name);
            if (key == null) {
                continue; // binary key (-bin) — không forward
            }
            Iterable<String> values = headers.getAll(key);
            if (values != null) {
                for (String v : values) {
                    out.put(key, v);
                }
            }
        }
        out.put(USER_ROLE_METADATA, role); // override — claim wins
        return out;
    }

    private static Metadata.Key<String> safeKey(String name) {
        try {
            if (name.endsWith(Metadata.BINARY_HEADER_SUFFIX)) {
                return null;
            }
            return Metadata.Key.of(name, Metadata.ASCII_STRING_MARSHALLER);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    private void warnAuthDisabled() {
        long now = System.currentTimeMillis();
        long last = lastAuthWarn.get();
        if (now - last >= AUTH_DISABLED_WARN_MILLIS && lastAuthWarn.compareAndSet(last, now)) {
            log.warn("[auth] *** WARNING AUTH_DISABLED=1 — gRPC auth ĐANG TẮT. "
                    + "CHỈ dùng unit-test harness; KHÔNG được bật trong compose/production! ***");
        }
    }

    private static <ReqT, RespT> ServerCall.Listener<ReqT> noop() {
        return new ServerCall.Listener<>() { };
    }
}
