// SF-12 (FI-257) — s2s auth interceptor: token passthrough (spec §3.1).
//
// Auth matrix (CONTRACT — KHÔNG tự ý đổi):
//  1. authorization: Bearer <JWT> hợp lệ (RS256, iss=OIDC_ISSUER, exp ok,
//     JWKS khớp kid) → ALLOW; role DERIVE từ claim realm_access.roles —
//     x-user-role metadata KHÔNG được tin, override bằng claim (warn nếu lệch).
//  2. x-internal-token == $INTERNAL_SERVICE_TOKEN → ALLOW; tin x-user-role /
//     x-user-name metadata (caller có secret = đã qua trust boundary).
//  3. thiếu / sai → PermissionDenied. Fail-closed.
//
// Allowlist (pass-through, không auth): /grpc.health.v1.Health/ +
// /grpc.reflection.v1.ServerReflection/ (cả v1alpha) — grpcurl + readiness.
//
// JWKS: fetch qua net/http từ OIDC_JWKS_URL (NGOÀI mutex — không serialize mọi
// request khi JWKS chậm), cache 5 phút, refetch-on-unknown-kid KỂ CẢ khi TTL còn
// tươi (Keycloak có thể vừa rotate), cooldown 1s (kể cả sau fetch FAIL — negative
// cache chống spam). golang-jwt/jwt/v4 (go 1.19 pin).
//
// AUTH_DISABLED=1: CHỈ cho unit-test harness — bypass + WARN loud mỗi 60s.
// Compose KHÔNG được định nghĩa biến này.
package server

import (
	"context"
	"crypto/rsa"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"hubstore/batching-service/internal/fulfillment"
	"hubstore/batching-service/internal/logging"

	"github.com/golang-jwt/jwt/v4"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	envJWKSURL = "OIDC_JWKS_URL"
	defJWKSURL = "http://localhost:8081/realms/hubstore/protocol/openid-connect/certs"
	envIssuer  = "OIDC_ISSUER"
	// defIssuer = GIÁ TRỊ claim `iss` trong JWT (full realm URL) — KHÔNG phải
	// issuer base như BFF env (BFF tự append /realms/hubstore). Live-verify:
	// Keycloak phát token iss=http://localhost:8081/realms/hubstore.
	defIssuer      = "http://localhost:8081/realms/hubstore"
	envInternalTok = "INTERNAL_SERVICE_TOKEN"
	envAuthOff     = "AUTH_DISABLED"

	jwksCacheTTL        = 5 * time.Minute
	jwksRefetchCooldown = time.Second

	authDisabledWarnSecs = 60
)

// knownRoles — mirror KNOWN_ROLES của BFF plugins/auth.ts (claim realm_access.roles).
var knownRoles = map[string]bool{
	"Coordinator":       true,
	"WarehouseOps":      true,
	"Manager":           true,
	"Admin":             true,
	"WarehouseEmployee": true,
	"InsideTechnician":  true, // KTV
	"OutsideTechnician": true, // CTV
}

// authAllowlist — prefix match trên FullMethod (infra methods không auth).
var authAllowlist = []string{
	"/grpc.health.v1.Health/",
	"/grpc.reflection.v1.ServerReflection/",
	"/grpc.reflection.v1alpha.ServerReflection/",
}

func allowlisted(fullMethod string) bool {
	for _, p := range authAllowlist {
		if strings.HasPrefix(fullMethod, p) {
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// JWKS cache — kid → *rsa.PublicKey, TTL 5 phút + refetch-on-unknown-kid.
// ---------------------------------------------------------------------------

type jwksCache struct {
	mu        sync.Mutex
	url       string
	client    *http.Client
	keys      map[string]*rsa.PublicKey
	fetchedAt time.Time // TTL window
	lastFetch time.Time // cooldown window (unknown-kid refetch)
}

func newJWKSCache(url string) *jwksCache {
	return &jwksCache{url: url, client: &http.Client{Timeout: 5 * time.Second}, keys: map[string]*rsa.PublicKey{}}
}

func (c *jwksCache) lookup(kid string) (*rsa.PublicKey, error) {
	c.mu.Lock()
	if key, ok := c.keys[kid]; ok && time.Since(c.fetchedAt) < jwksCacheTTL {
		c.mu.Unlock()
		return key, nil // cache hit + TTL tươi
	}
	// Cache miss (kid lạ — KỂ CẢ khi TTL còn tươi, Keycloak có thể vừa rotate key)
	// hoặc TTL hết (refresh định kỳ) → refetch 1 lần, cooldown chống hammer.
	if !c.lastFetch.IsZero() && time.Since(c.lastFetch) < jwksRefetchCooldown {
		c.mu.Unlock()
		if key, ok := c.keys[kid]; ok {
			return key, nil // refresh định kỳ bị cooldown → dùng key cũ
		}
		return nil, fmt.Errorf("unknown kid %q", kid)
	}
	c.lastFetch = time.Now() // negative-cache: đặt TRƯỚC fetch → fetch FAIL cũng cooldown
	c.mu.Unlock()

	if err := c.fetch(); err != nil {
		c.mu.Lock()
		key, ok := c.keys[kid] // refresh định kỳ fail mà có key cũ → dùng tạm
		c.mu.Unlock()
		if ok {
			return key, nil
		}
		return nil, fmt.Errorf("jwks fetch: %w", err)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if key, ok := c.keys[kid]; ok {
		return key, nil
	}
	return nil, fmt.Errorf("unknown kid %q (sau refetch)", kid)
}

// fetch — GET JWKS NGOÀI mutex (không serialize mọi request khi JWKS chậm/down),
// parse {keys:[{kid,kty,n,e,alg}]} → rsa.PublicKey map. Chỉ giữ lock để ghi kết
// quả. Fail không ghi keys — cooldown (lastFetch đã set trong lookup) chặn spam.
func (c *jwksCache) fetch() error {
	resp, err := c.client.Get(c.url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	var doc struct {
		Keys []struct {
			KID string `json:"kid"`
			Kty string `json:"kty"`
			Alg string `json:"alg"`
			N   string `json:"n"`
			E   string `json:"e"`
		} `json:"keys"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return fmt.Errorf("decode: %w", err)
	}
	keys := make(map[string]*rsa.PublicKey, len(doc.Keys))
	for _, k := range doc.Keys {
		if k.Kty != "RSA" || (k.Alg != "" && k.Alg != "RS256") {
			continue
		}
		n, err := b64url(k.N)
		if err != nil {
			continue
		}
		eBytes, err := b64url(k.E)
		if err != nil || len(eBytes) == 0 || len(eBytes) > 4 {
			continue
		}
		e := 0
		for _, b := range eBytes {
			e = e<<8 | int(b)
		}
		keys[k.KID] = &rsa.PublicKey{N: new(big.Int).SetBytes(n), E: e}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.keys = keys
	c.fetchedAt = time.Now()
	return nil
}

func b64url(s string) ([]byte, error) {
	if b, err := base64.RawURLEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.URLEncoding.DecodeString(s)
}

// Singleton per JWKS URL — env đổi URL (test) → cache mới.
var (
	jwksMu      sync.Mutex
	jwksInst    *jwksCache
	jwksInstURL string
)

func jwks() *jwksCache {
	jwksMu.Lock()
	defer jwksMu.Unlock()
	url := envOr(envJWKSURL, defJWKSURL)
	if jwksInst == nil || jwksInstURL != url {
		jwksInst = newJWKSCache(url)
		jwksInstURL = url
	}
	return jwksInst
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// ---------------------------------------------------------------------------
// Interceptor
// ---------------------------------------------------------------------------

// AuthUnaryInterceptor — chạy TRƯỚC RoleUnaryInterceptor trong chain (auth
// derive role → role interceptor chỉ đọc). Xem contract ở header file.
func AuthUnaryInterceptor(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
	if allowlisted(info.FullMethod) {
		return handler(ctx, req)
	}
	if os.Getenv(envAuthOff) == "1" {
		warnAuthDisabled()
		return handler(ctx, req)
	}

	md, _ := metadata.FromIncomingContext(ctx)

	// 1) Bearer JWT — verify → derive role → rewrite metadata.
	if authz := firstMD(md, "authorization"); strings.HasPrefix(authz, "Bearer ") {
		role, err := verifyBearer(strings.TrimPrefix(authz, "Bearer "))
		if err != nil {
			return nil, status.Errorf(codes.PermissionDenied, "unauthenticated: %v", err)
		}
		if metaRole := firstMD(md, "x-user-role"); metaRole != "" && metaRole != role {
			logging.Warn("x-user-role metadata lệch token claim — dùng claim (token wins)",
				"component", "auth", "meta_role", metaRole, "token_role", role)
		}
		nmd := md.Copy()
		nmd.Set("x-user-role", role)
		ctx = metadata.NewIncomingContext(ctx, nmd)
		ctx = fulfillment.NewRoleContext(ctx, role)
		return handler(ctx, req)
	}

	// 2) Internal service token — máy-máy (Go→Java ngược chiều là outbound;
	// inbound ở đây: reconciler/controller-style callers). So sánh constant-time
	// (chống timing attack); env rỗng → không bao giờ allow.
	if tok := firstMD(md, "x-internal-token"); tok != "" {
		if envTok := os.Getenv(envInternalTok); envTok != "" &&
			subtle.ConstantTimeCompare([]byte(tok), []byte(envTok)) == 1 {
			return handler(ctx, req) // tin x-user-role/x-user-name metadata
		}
	}

	// 3) Fail-closed.
	return nil, status.Error(codes.PermissionDenied, "missing or invalid credentials")
}

func firstMD(md metadata.MD, key string) string {
	if md == nil {
		return ""
	}
	if vals := md.Get(key); len(vals) > 0 {
		return vals[0]
	}
	return ""
}

// verifyBearer — RS256 + exp BẮT BUỘC (v4 parser chỉ validate exp KHI CÓ claim;
// thiếu exp phải tự check — token không exp sẽ qua validator) + iss.
// Trả role đã derive từ realm_access.roles (claim wins). Không role hợp lệ → deny.
func verifyBearer(raw string) (string, error) {
	issuer := envOr(envIssuer, defIssuer)
	parser := jwt.NewParser(jwt.WithValidMethods([]string{"RS256"}))
	tok, err := parser.Parse(raw, func(t *jwt.Token) (interface{}, error) {
		kid, _ := t.Header["kid"].(string)
		if kid == "" {
			return nil, fmt.Errorf("token thiếu kid header")
		}
		return jwks().lookup(kid)
	})
	if err != nil {
		return "", err
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok || !tok.Valid {
		return "", fmt.Errorf("token invalid")
	}
	if _, hasExp := claims["exp"]; !hasExp {
		return "", fmt.Errorf("token thiếu exp claim")
	}
	if iss, _ := claims["iss"].(string); iss != issuer {
		return "", fmt.Errorf("iss %q != expected %q", iss, issuer)
	}
	ra, _ := claims["realm_access"].(map[string]interface{})
	roles, _ := ra["roles"].([]interface{})
	for _, r := range roles {
		if s, ok := r.(string); ok && knownRoles[s] {
			return s, nil
		}
	}
	return "", fmt.Errorf("token không có realm role được phép")
}

// warnAuthDisabled — WARN loud mỗi 60s khi AUTH_DISABLED=1 (test harness only).
var lastAuthWarn int64

func warnAuthDisabled() {
	now := time.Now().Unix()
	last := atomic.LoadInt64(&lastAuthWarn)
	if now-last >= authDisabledWarnSecs && atomic.CompareAndSwapInt64(&lastAuthWarn, last, now) {
		logging.Warn("*** AUTH_DISABLED=1 — gRPC auth ĐANG TẮT. CHỈ dùng unit-test harness; KHÔNG được bật trong compose/production! ***",
			"component", "auth")
	}
}
