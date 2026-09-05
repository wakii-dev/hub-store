#!/usr/bin/env python3
"""Mint storageState cho ktv-mobile (SF-25 T8) — pattern mint_sf16_v2.py
(SF-15 PKCE secure-cookie hack, FULL oidc-client-ts User shape).

Khác SF-16: Keycloak seam riêng sf-25 :8082 (FRESH volume, realm import
hubstore-mobile client), client `hubstore-mobile`, redirect origin app :4220.
`name` claim đến từ defaultClientScopes `profile` (firstName + lastName) —
seed driverName khớp "Nguyễn Văn An" (KTV-001) / "Hoàng Văn Em" (CTV-001).

Usage:
  python3 mint_ktv_auth.py KTV-001 <out.json> [origin]
origin mặc định http://127.0.0.1:4220 (khớp VITE_OIDC_* của runner — storage
key `oidc.user:http://127.0.0.1:8082/realms/hubstore:hubstore-mobile`).
"""
import base64, hashlib, secrets, json, time, re, sys, os, urllib.parse, urllib.request, http.client, http.cookiejar

KC_PORT = 8082
BASE = f"http://127.0.0.1:{KC_PORT}/realms/hubstore"
REDIRECT_HOST = "127.0.0.1"
REDIRECT_PORT = 4220

USER = sys.argv[1] if len(sys.argv) > 1 else "KTV-001"
OUT = sys.argv[2] if len(sys.argv) > 2 else "e2e/.auth/ktv-001.json"
ORIGIN = sys.argv[3] if len(sys.argv) > 3 else f"http://{REDIRECT_HOST}:{REDIRECT_PORT}"
PASSWORD = os.environ.get("E2E_PASSWORD", "gY0pM9SO7QEmqil_lWHQ")  # SF-12 — dev-only, realm JSON (rotate đồng bộ lib/credentials)
CLIENT = "hubstore-mobile"
REDIRECT = f"{ORIGIN}/callback"

# Password theo username từ realm JSON (dev-only plaintext) — KTV-001/CTV-001
# có password KHÁC nhau; cũ hardcode 1 pass → mint CTV-001 NO_CODE (baseline
# FI-281 04/09). Fallback E2E_PASSWORD nếu realm JSON không đọc được.
def _realm_password(username: str) -> str:
    try:
        realm_path = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                  "..", "..", "docker", "keycloak", "hubstore-realm.json")
        realm = json.load(open(realm_path))
        for u in realm.get("users", []):
            if u.get("username", "").lower() == username.lower():
                return u["credentials"][0]["value"]
    except Exception:
        pass
    return os.environ.get("E2E_PASSWORD", "gY0pM9SO7QEmqil_lWHQ")

PASSWORD = _realm_password(USER)

cj = http.cookiejar.CookieJar()
verifier = base64.urlsafe_b64encode(secrets.token_bytes(48)).rstrip(b"=").decode()
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
state = secrets.token_urlsafe(16)
q = urllib.parse.urlencode({"client_id": CLIENT, "response_type": "code", "scope": "openid",
    "redirect_uri": REDIRECT, "state": state, "code_challenge": challenge, "code_challenge_method": "S256"})
html = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj)).open(f"{BASE}/protocol/openid-connect/auth?{q}", timeout=15).read().decode()
m = re.search(r'action="([^"]+)"', html)
if not m:
    print("NO_FORM"); sys.exit(1)
path = m.group(1).replace("&amp;", "&")
u = urllib.parse.urlsplit(path)
conn = http.client.HTTPConnection("127.0.0.1", KC_PORT, timeout=15)
data = urllib.parse.urlencode({"username": USER, "password": PASSWORD, "credentialId": ""}).encode()
conn.request("POST", u.path + "?" + u.query, body=data, headers={
    "Content-Type": "application/x-www-form-urlencoded",
    "Cookie": "; ".join(f"{c.name}={c.value}" for c in cj)})
resp = conn.getresponse()
resp.read()
loc = resp.getheader("Location") or ""
code = (urllib.parse.parse_qs(urllib.parse.urlsplit(loc).query).get("code") or [None])[0]
if not code:
    print("NO_CODE", resp.status, loc[:80]); sys.exit(1)
body = urllib.parse.urlencode({"grant_type": "authorization_code", "code": code, "redirect_uri": REDIRECT,
    "client_id": CLIENT, "code_verifier": verifier}).encode()
tok = json.loads(urllib.request.build_opener().open(f"{BASE}/protocol/openid-connect/token", data=body, timeout=15).read().decode())
if "access_token" not in tok:
    print("NO_TOKEN", json.dumps(tok)[:200]); sys.exit(1)
# profile PHẢI mang claims thật (realm_access.roles + name + preferred_username)
# — sessionFromUser đọc cả 3; thiếu → session null → login gate chặn.
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
print(f"OK {USER} -> {OUT} (name={profile.get('name')}, sub={profile.get('preferred_username')}, expires_in={tok.get('expires_in')})")
