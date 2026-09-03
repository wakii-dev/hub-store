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
	"sync/atomic"
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
	srv, _ := jwksFixtureCounting(t)
	return srv
}

// jwksFixtureCounting — như jwksFixture, cộng counter số lần GET (cho test
// refetch-on-unknown-kid / negative-cache).
func jwksFixtureCounting(t *testing.T) (*httptest.Server, *int64) {
	t.Helper()
	var gets int64
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
		atomic.AddInt64(&gets, 1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(doc)
	}))
	t.Cleanup(srv.Close)
	return srv, &gets
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

// Review P1 (FI-257): JWT hợp lệ NHƯNG thiếu exp claim phải DENY
// (jwt.WithExpirationRequired) — không chỉ token exp hết hạn.
func TestAuthBearerNoExpClaim_Denied(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	claims := validClaims()
	delete(claims, "exp")
	_, _, err := callAuth(t, bearerCtx(mintToken(t, claims)), "/hubstore.batching.v1.BatchingService/CreateBatch")
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("thiếu exp claim → %v, want PermissionDenied", err)
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

// Review P1 (FI-257): env INTERNAL_SERVICE_TOKEN rỗng → internal-token path
// KHÔNG được allow (constant-time compare có guard len > 0).
func TestAuthInternalTokenEmptyEnvConfig_Denied(t *testing.T) {
	srv := jwksFixture(t)
	authEnv(t, srv)
	t.Setenv("INTERNAL_SERVICE_TOKEN", "")
	_, _, err := callAuth(t, metadata.NewIncomingContext(context.Background(),
		metadata.Pairs("x-internal-token", "whatever-attacker-sends")),
		"/hubstore.batching.v1.BatchingService/CreateBatch")
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("env rỗng + token bất kỳ → %v, want PermissionDenied", err)
	}
}

// Review P1 (FI-257): kid lạ khi cache ĐÃ có keys (TTL còn tươi) vẫn phải
// trigger JWKS refetch (key rotation không bị TTL branch chặn).
func TestJWKSCache_RefetchOnUnknownKid_AfterCachePopulated(t *testing.T) {
	srv, gets := jwksFixtureCounting(t)
	c := newJWKSCache(srv.URL)

	if _, err := c.lookup(testKID); err != nil {
		t.Fatalf("known kid lần đầu: %v", err)
	}
	if n := atomic.LoadInt64(gets); n != 1 {
		t.Fatalf("GET count sau lần đầu = %d, want 1", n)
	}
	time.Sleep(jwksRefetchCooldown + 100*time.Millisecond) // ra khỏi cooldown
	if _, err := c.lookup("rotated-kid"); err == nil {
		t.Fatal("kid lạ phải deny")
	}
	if n := atomic.LoadInt64(gets); n != 2 {
		t.Fatalf("kid lạ phải trigger refetch dù cache còn tươi: GET count = %d, want 2", n)
	}
	// Kid lạ thứ hai NGAY SAU đó → cooldown chặn, KHÔNG GET thêm.
	if _, err := c.lookup("another-kid"); err == nil {
		t.Fatal("kid lạ trong cooldown phải deny")
	}
	if n := atomic.LoadInt64(gets); n != 2 {
		t.Fatalf("cooldown phải chặn refetch: GET count = %d, want 2", n)
	}
}

// Review P1 (FI-257): JWKS fetch FAIL → negative-cache (cooldown) — request
// sau NGAY LẬP TỨC không spam Keycloak thêm.
func TestJWKSCache_FetchFail_NegativeCache_NoSpam(t *testing.T) {
	var gets int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		atomic.AddInt64(&gets, 1)
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	t.Cleanup(srv.Close)
	c := newJWKSCache(srv.URL)

	if _, err := c.lookup(testKID); err == nil {
		t.Fatal("JWKS 500 → lookup phải fail")
	}
	if _, err := c.lookup(testKID); err == nil {
		t.Fatal("lookup thứ hai (ngay sau fail) cũng phải fail")
	}
	if n := atomic.LoadInt64(&gets); n != 1 {
		t.Fatalf("fetch fail phải negative-cache: GET count = %d, want 1", n)
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
