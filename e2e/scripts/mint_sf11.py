#!/usr/bin/env python3
"""SF-11 (FI-256 Task 6) — mint storageState cho seam sf-11.

Adapt /tmp/story/fi233/mint_sf16_v2.py (FULL oidc-client-ts User shape, origin
arg2 — pattern SF-15 PKCE). Khác sf16:
  - BASE  = http://localhost:8082/realms/hubstore (keycloak container sf-11-keycloak)
  - ORIGIN= http://localhost:4010 (shell seam) — localStorage key gắn origin này
  - REDIRECT = http://localhost:3000/callback — client `hubstore-web` trong
    docker/keycloak/hubstore-realm.json (READ-ONLY) chỉ allow-list
    http://localhost:3000/* → auth request PHẢI dùng :3000; redirect chỉ là
    nơi Keycloak trả code trên Location header (script không follow), nên app
    :4010 KHÔNG cần chạy ở :3000.
  - argv[1] = role (manager|coordinator|admin — users/passwords trong realm JSON:
    <role>/Password123!), argv[2] = out path.
Chạy: python3 e2e/scripts/mint_sf11.py manager /tmp/story/fi245/sf11/auth-manager.json
"""
import base64, hashlib, secrets, json, time, re, sys, os, urllib.parse, urllib.request, http.client, http.cookiejar

KC_HOST = "localhost"
KC_PORT = 8082
BASE = f"http://localhost:{KC_PORT}/realms/hubstore"
REDIRECT = "http://localhost:3000/callback"
CLIENT = "hubstore-web"
ORIGIN = "http://localhost:4010"
PASSWORD = os.environ.get("E2E_PASSWORD", "gY0pM9SO7QEmqil_lWHQ")  # SF-12 — dev-only, realm JSON (rotate đồng bộ lib/credentials)

role = sys.argv[1] if len(sys.argv) > 1 else "manager"
OUT = sys.argv[2] if len(sys.argv) > 2 else f"/tmp/story/fi245/sf11/auth-{role}.json"

cj = http.cookiejar.CookieJar()
verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
state = secrets.token_urlsafe(16)
q = urllib.parse.urlencode({"client_id": CLIENT, "response_type": "code", "scope": "openid",
    "redirect_uri": REDIRECT, "state": state, "code_challenge": challenge, "code_challenge_method": "S256"})
html = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)).open(
    f"{BASE}/protocol/openid-connect/auth?{q}", timeout=15).read().decode()
m = re.search(r'action="([^"]+)"', html)
if not m: print("NO_FORM"); sys.exit(1)
path = m.group(1).replace("&amp;", "&")
u = urllib.parse.urlsplit(path)
conn = http.client.HTTPConnection(KC_HOST, KC_PORT, timeout=15)
data = urllib.parse.urlencode({"username": role, "password": PASSWORD, "credentialId": ""}).encode()
conn.request("POST", u.path + "?" + u.query, body=data, headers={
    "Content-Type": "application/x-www-form-urlencoded",
    "Cookie": "; ".join(f"{c.name}={c.value}" for c in cj)})
resp = conn.getresponse()
resp.read()
loc = resp.getheader("Location") or ""
code = (urllib.parse.parse_qs(urllib.parse.urlsplit(loc).query).get("code") or [None])[0]
if not code: print("NO_CODE", resp.status, loc[:80]); sys.exit(1)
body = urllib.parse.urlencode({"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT,
    "client_id": CLIENT, "code_verifier": verifier}).encode()
tok = json.loads(urllib.request.build_opener().open(f"{BASE}/protocol/openid-connect/token", data=body, timeout=15).read().decode())
if "access_token" not in tok: print("NO_TOKEN", json.dumps(tok)[:200]); sys.exit(1)
# profile PHẢI mang claims thật (realm_access.roles) — sessionFromUser mapRole
# đọc profile.realm_access; thiếu → session null → login gate chặn.
payload_b64 = tok["access_token"].split(".")[1]
payload_b64 += "=" * (-len(payload_b64) % 4)
claims = json.loads(base64.urlsafe_b64decode(payload_b64))
profile = {k: v for k, v in claims.items() if k not in ("exp", "iat", "jti", "aud", "iss", "azp", "typ", "sid")}
user = {
    "access_token": tok["access_token"], "token_type": tok.get("token_type", "Bearer"),
    "scope": tok.get("scope", ""), "profile": profile,
    "state": state, "session_state": tok.get("session_state", ""),
    "expires_at": int(time.time()) + int(tok.get("expires_in", 300)),
    "id_token": tok.get("id_token", ""), "refresh_token": tok.get("refresh_token", ""),
}
ss = {"cookies": [], "origins": [{"origin": ORIGIN, "localStorage": [
    {"name": f"oidc.user:{BASE}:{CLIENT}", "value": json.dumps(user)}]}]}
open(OUT, "w").write(json.dumps(ss))
print(f"OK {role} -> {OUT} (expires_in {tok.get('expires_in')})")
