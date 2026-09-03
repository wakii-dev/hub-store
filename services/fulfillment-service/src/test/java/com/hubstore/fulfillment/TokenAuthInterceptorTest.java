package com.hubstore.fulfillment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.Map;

import com.hubstore.fulfillment.service.TokenAuthInterceptor;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.crypto.RSASSAVerifier;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import io.grpc.Metadata;
import io.grpc.MethodDescriptor;
import io.grpc.ServerCall;
import io.grpc.ServerCallHandler;
import io.grpc.ServerInterceptor;
import io.grpc.Status;

/**
 * SF-12 (FI-257) — TokenAuthInterceptor unit test: RSA testkey + JWKS fixture
 * qua com.sun.net.httpserver. Matrix theo spec §3.1 CONTRACT: valid / expired /
 * wrong-iss / no-known-role / forged-sig / internal-ok / internal-wrong /
 * no-credentials / allowlist health+reflection / fail-closed config.
 */
class TokenAuthInterceptorTest {

    static final String ISSUER = "http://test-issuer";
    static final String KID = "sf12-test-key";
    static final String INTERNAL = "test-internal-secret";
    static final String METHOD = "/hubstore.fulfillment.v1.FulfillmentService/FilterOrders";

    static KeyPair keyPair;
    static com.sun.net.httpserver.HttpServer jwksServer;
    static String jwksUrl;

    @BeforeAll
    static void setUp() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        keyPair = gen.generateKeyPair();

        RSAPublicKey pub = (RSAPublicKey) keyPair.getPublic();
        String n = Base64.getUrlEncoder().withoutPadding().encodeToString(pub.getModulus().toByteArray());
        String e = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(pub.getPublicExponent().toByteArray());
        String json = "{\"keys\":[{\"kty\":\"RSA\",\"kid\":\"" + KID + "\",\"alg\":\"RS256\","
                + "\"use\":\"sig\",\"n\":\"" + n + "\",\"e\":\"" + e + "\"}]}";

        jwksServer = com.sun.net.httpserver.HttpServer.create(new InetSocketAddress(0), 0);
        jwksServer.createContext("/", ex -> {
            byte[] body = json.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().set("Content-Type", "application/json");
            ex.sendResponseHeaders(200, body.length);
            try (OutputStream os = ex.getResponseBody()) {
                os.write(body);
            }
        });
        jwksServer.start();
        jwksUrl = "http://localhost:" + jwksServer.getAddress().getPort() + "/";
    }

    @AfterAll
    static void tearDown() {
        jwksServer.stop(0);
    }

    static TokenAuthInterceptor interceptor() {
        return new TokenAuthInterceptor(ISSUER, jwksUrl, INTERNAL);
    }

    static String sign(JWTClaimsSet claims) throws Exception {
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(KID).build(), claims);
        jwt.sign(new RSASSASigner(keyPair.getPrivate()));
        if (!jwt.verify(new RSASSAVerifier((java.security.interfaces.RSAPublicKey) keyPair.getPublic()))) {
            throw new IllegalStateException("test keypair không verify được");
        }
        return jwt.serialize();
    }

    static JWTClaimsSet baseClaims() {
        return new JWTClaimsSet.Builder()
                .issuer(ISSUER)
                .expirationTime(new Date(System.currentTimeMillis() + 300_000))
                .subject("user-1")
                .claim("realm_access", Map.of("roles", List.of("Coordinator")))
                .build();
    }

    static Metadata bearerMeta(String token) {
        Metadata md = new Metadata();
        md.put(TokenAuthInterceptor.AUTHORIZATION_METADATA, "Bearer " + token);
        return md;
    }

    /** Kết quả 1 lần interceptCall: close-status (null = pass) + headers next nhận. */
    record Outcome(Status closedStatus, Metadata nextHeaders) { }

    @SuppressWarnings("unchecked")
    static Outcome intercept(ServerInterceptor icpt, Metadata headers, String fullMethod) {
        final Status[] closed = { null };
        final Metadata[] nextHeaders = { null };
        MethodDescriptor.Marshaller<Object> marshaller = new MethodDescriptor.Marshaller<>() {
            @Override public java.io.InputStream stream(Object value) { return null; }
            @Override public Object parse(java.io.InputStream stream) { return null; }
        };
        ServerCall<Object, Object> call = new ServerCall<>() {
            @Override public void sendHeaders(Metadata headers2) { }
            @Override public void sendMessage(Object message) { }
            @Override public void close(Status status, Metadata trailers) { closed[0] = status; }
            @Override public void request(int numMessages) { }
            @Override public boolean isCancelled() { return false; }
            @Override public MethodDescriptor<Object, Object> getMethodDescriptor() {
                return MethodDescriptor.<Object, Object>newBuilder()
                        .setType(MethodDescriptor.MethodType.UNARY)
                        .setFullMethodName(fullMethod)
                        .setRequestMarshaller(marshaller)
                        .setResponseMarshaller(marshaller)
                        .build();
            }
        };
        ServerCallHandler<Object, Object> next = (reqCall, nextMd) -> {
            nextHeaders[0] = nextMd; // headers bản interceptor pass cho next (rewritten nếu Bearer)
            return new ServerCall.Listener<Object>() { };
        };
        icpt.interceptCall(call, headers, next);
        return new Outcome(closed[0], nextHeaders[0]);
    }

    static void assertDenied(Outcome o) {
        assertEquals(Status.PERMISSION_DENIED.getCode(), o.closedStatus().getCode());
    }

    // --- Matrix (spec §3.1 CONTRACT) ---

    @Test
    void validBearerIsAllowed() throws Exception {
        assertNull(intercept(interceptor(), bearerMeta(sign(baseClaims())), METHOD).closedStatus());
    }

    @Test
    void validBearerRewritesRoleMetadataFromClaim() throws Exception {
        Metadata md = bearerMeta(sign(baseClaims()));
        md.put(TokenAuthInterceptor.USER_ROLE_METADATA, "Forged"); // cố tình giả role
        Outcome o = intercept(interceptor(), md, METHOD);
        assertNull(o.closedStatus());
        assertEquals("Coordinator", o.nextHeaders().get(TokenAuthInterceptor.USER_ROLE_METADATA),
                "claim wins — x-user-role phải bị override");
    }

    @Test
    void expiredBearerIsDenied() throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder(baseClaims())
                .expirationTime(new Date(System.currentTimeMillis() - 60_000)).build();
        assertDenied(intercept(interceptor(), bearerMeta(sign(claims)), METHOD));
    }

    @Test
    void wrongIssuerIsDenied() throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder(baseClaims()).issuer("http://evil").build();
        assertDenied(intercept(interceptor(), bearerMeta(sign(claims)), METHOD));
    }

    @Test
    void noKnownRealmRoleIsDenied() throws Exception {
        JWTClaimsSet claims = new JWTClaimsSet.Builder(baseClaims())
                .claim("realm_access", Map.of("roles", List.of("SuperAdmin"))).build();
        assertDenied(intercept(interceptor(), bearerMeta(sign(claims)), METHOD));
    }

    @Test
    void forgedSignatureIsDenied() throws Exception {
        KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
        gen.initialize(2048);
        KeyPair rogue = gen.generateKeyPair();
        SignedJWT jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(KID).build(), baseClaims());
        jwt.sign(new RSASSASigner(rogue.getPrivate()));
        assertDenied(intercept(interceptor(), bearerMeta(jwt.serialize()), METHOD));
    }

    @Test
    void internalTokenIsAllowed() {
        Metadata md = new Metadata();
        md.put(TokenAuthInterceptor.INTERNAL_TOKEN_METADATA, INTERNAL);
        md.put(TokenAuthInterceptor.USER_ROLE_METADATA, "WarehouseOps");
        assertNull(intercept(interceptor(), md, METHOD).closedStatus(),
                "internal token khớp phải ALLOW (tin x-user-role metadata)");
    }

    @Test
    void wrongInternalTokenIsDenied() {
        Metadata md = new Metadata();
        md.put(TokenAuthInterceptor.INTERNAL_TOKEN_METADATA, "wrong");
        assertDenied(intercept(interceptor(), md, METHOD));
    }

    @Test
    void noCredentialsIsDenied() {
        assertDenied(intercept(interceptor(), new Metadata(), METHOD));
    }

    @Test
    void healthAndReflectionAreAllowlisted() {
        TokenAuthInterceptor icpt = interceptor();
        for (String method : new String[] {
                "/grpc.health.v1.Health/Check",
                "/grpc.health.v1.Health/Watch",
                "/grpc.reflection.v1.ServerReflection/ServerReflectionInfo",
                "/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo"}) {
            assertNull(intercept(icpt, new Metadata(), method).closedStatus(),
                    method + " không token phải pass (allowlist)");
        }
    }

    @Test
    void failClosedWhenConfigMissing() throws Exception {
        // issuer/jwks rỗng → Bearer verify fail-closed (không NPE, không bypass).
        TokenAuthInterceptor icpt = new TokenAuthInterceptor("", "", "");
        assertDenied(intercept(icpt, bearerMeta(sign(baseClaims())), METHOD));
    }
}
