package server

// SF-12 (FI-257) — auth interceptor unit tests: tự ký RSA test key + JWKS
// fixture server (httptest). Matrix theo spec §3.1 (CONTRACT):
// valid / expired / wrong-iss / no-known-role / internal-ok / internal-wrong /
// no-credentials / health-allowlisted / claim-wins-over-metadata.

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"hubstore/batching-service/internal/fulfillment"

	"github.com/golang-jwt/jwt/v4"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const testIssuer = "http://test-issuer"
const testKID = "sf12-test-key"

var testKey *rsa.PrivateKey

func init() {
	k, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	testKey = k
}

// jwksFixture — JWKS JSON từ testKey, serve qua httptest.
func jwksFixture(t *testing.T) *httptest.Server {
	t.Helper()
	b64 := func(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }
	doc, err := json.Marshal(map[string]interface{}{
		"keys": []map[string]string{{
			"kty": "RSA", "kid": testKID, "alg": "RS256", "use": "sig",
			"n": b64(testKey.N.Bytes()),
			"e": b64(big.NewInt(int64(testKey.E)).Bytes()),
		}},
	})
	if err != nil {
		t.Fatalf("jwks marshal: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(doc)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func mintToken(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	tok.Header["kid"] = testKID
	s, err := tok.SignedString(testKey)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return s
}

func validClaims() jwt.MapClaims {
	return jwt.MapClaims{
		"iss": testIssuer,
		"exp": time.Now().Add(5 * time.Minute).Unix(),
		"sub": "user-1",
		"realm_access": map[string]interface{}{
			"roles": []interface{}{"Coordinator"},
		},
	}
}

// callAuth — chạy AuthUnaryInterceptor với metadata cho trước; trả role handler
// nhìn thấy (qua fulfillment context) + x-user-role rewritten trong incoming md.
func callAuth(t *testing.T, ctx context.Context, fullMethod string) (string, string, error) {
	t.Helper()
	var gotRole, gotMDRole string
	handler := func(c context.Context, _ interface{}) (interface{}, error) {
		gotRole = fulfillment.RoleFromContext(c)
		if md, ok := metadata.FromIncomingContext(c); ok {
			if v := md.Get("x-user-role"); len(v) > 0 {
				gotMDRole = v[0]
			}
		}
		return nil, nil
	}
	_, err := AuthUnaryInterceptor(ctx, nil, &grpc.UnaryServerInfo{FullMethod: fullMethod}, handler)
	return gotRole, gotMDRole, err
}

func bearerCtx(token string) context.Context {
	return metadata.NewIncomingContext(context.Background(),
		metadata.Pairs("authorization", "Bearer "+token))
}

func authEnv(t *testing.T, srv *httptest.Server) {
	t.Helper()
	t.Setenv("AUTH_DISABLED", "")
	t.Setenv("OIDC_ISSUER", testIssuer)
	t.Setenv("OIDC_JWKS_URL", srv.URL)
	t.Setenv("INTERNAL_SERVICE_TOKEN", "test-internal-secret")
}

// --- Matrix cases ---

func TestAuthBearerValid_RoleDerivedAndMetadataRewritten(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	tok := mintToken(t, validClaims())

	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"authorization", "Bearer "+tok, "x-user-role", "Manager"))
	role, mdRole, err := callAuth(t, ctx, "/hubstore.batching.v1.BatchingService/CreateBatch")
	if err != nil {
		t.Fatalf("valid JWT bị deny: %v", err)
	}
	if role != "Coordinator" || mdRole != "Coordinator" {
		t.Fatalf("role=%q mdRole=%q, want Coordinator (claim wins)", role, mdRole)
	}
}

func TestAuthBearerValid_MetadataRoleMismatchWarnsButClaimWins(t *testing.T) {
	// Biến thể explicit: metadata nói Manager, claim nói Coordinator → Coordinator.
	srv := jwksFixture(t)
	authEnv(t, srv)
	tok := mintToken(t, validClaims())
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"authorization", "Bearer "+tok, "x-user-role", "Forged"))
	role, mdRole, err := callAuth(t, ctx, "/hubstore.batching.v1.BatchingService/CreateBatch")
	if err != nil || role != "Coordinator" || mdRole != "Coordinator" {
		t.Fatalf("err=%v role=%q mdRole=%q — claim phải override metadata", err, role, mdRole)
	}
}

func TestAuthBearerExpired_Denied(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	claims := validClaims()
	claims["exp"] = time.Now().Add(-time.Minute).Unix()
	_, _, err := callAuth(t, bearerCtx(mintToken(t, claims)), "/hubstore.batching.v1.BatchingService/CreateBatch")
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("expired → %v, want PermissionDenied", err)
	}
}

func TestAuthBearerWrongIssuer_Denied(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	claims := validClaims()
	claims["iss"] = "http://evil-issuer"
	_, _, err := callAuth(t, bearerCtx(mintToken(t, claims)), "/hubstore.batching.v1.BatchingService/CreateBatch")
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("wrong iss → %v, want PermissionDenied", err)
	}
}

func TestAuthBearerNoKnownRole_Denied(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	claims := validClaims()
	claims["realm_access"] = map[string]interface{}{"roles": []interface{}{"SuperAdmin"}}
	_, _, err := callAuth(t, bearerCtx(mintToken(t, claims)), "/hubstore.batching.v1.BatchingService/CreateBatch")
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("no known role → %v, want PermissionDenied", err)
	}
}

func TestAuthInternalToken_OK(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	ctx := metadata.NewIncomingContext(context.Background(), metadata.Pairs(
		"x-internal-token", "test-internal-secret", "x-user-role", "WarehouseOps", "x-user-name", "reconciler"))
	// Auth không đụng role — x-user-role metadata để nguyên, RoleUnaryInterceptor
	// (chạy SAU trong chain) sẽ đọc.
	role, _, err := callAuth(t, ctx, "/hubstore.batching.v1.BatchingService/CreateBatch")
	if err != nil {
		t.Fatalf("internal token hợp lệ bị deny: %v", err)
	}
	if role != "" {
		t.Fatalf("Auth không được derive role cho internal call (claim-only), got %q", role)
	}
	if md, _ := metadata.FromIncomingContext(ctx); md.Get("x-user-role")[0] != "WarehouseOps" {
		t.Fatalf("x-user-role metadata phải giữ nguyên cho internal call")
	}
}

func TestAuthInternalTokenWrong_Denied(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	ctx := metadata.NewIncomingContext(context.Background(),
		metadata.Pairs("x-internal-token", "wrong-secret"))
	_, _, err := callAuth(t, ctx, "/hubstore.batching.v1.BatchingService/CreateBatch")
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("wrong internal token → %v, want PermissionDenied", err)
	}
}

func TestAuthNoCredentials_Denied(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	_, _, err := callAuth(t, context.Background(), "/hubstore.batching.v1.BatchingService/CreateBatch")
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("no credentials → %v, want PermissionDenied", err)
	}
}

func TestAuthHealthAllowlisted_NoTokenPass(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	for _, m := range []string{
		"/grpc.health.v1.Health/Check",
		"/grpc.health.v1.Health/Watch",
		"/grpc.reflection.v1.ServerReflection/ServerReflectionInfo",
		"/grpc.reflection.v1alpha.ServerReflection/ServerReflectionInfo",
	} {
		if _, _, err := callAuth(t, context.Background(), m); err != nil {
			t.Fatalf("%s không token phải pass (allowlist): %v", m, err)
		}
	}
}

func TestAuthBearingGarbage_Denied(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	_, _, err := callAuth(t, bearerCtx("not.a.jwt"), "/hubstore.batching.v1.BatchingService/CreateBatch")
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("garbage token → %v, want PermissionDenied", err)
	}
}
