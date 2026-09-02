#!/usr/bin/env python3
"""SF-15 — mint storageState JSON cho 05-nvc-api qua Keycloak Authorization
Code + PKCE (curl-free, stdlib only). KHÔNG cần shell :3000 — redirect_uri
chỉ phải khớp realm client (localhost:3000/*), code đọc từ Location header.

Output: file storageState shape {origins:[{origin, localStorage:[{name,value}]}]}
với key `oidc.user:<issuer>:hubstore-web` — trùng shape auth.setup.ts để
readToken() trong 05-nvc-api.spec.ts parse được.

Usage: mint_nvc_auth.py <username> <password> <out.json>
"""
import base64
import hashlib
import json
import re
import secrets
import sys
import urllib.parse
import urllib.request
import http.cookiejar

ISSUER = "http://localhost:8081/realms/hubstore"
CLIENT_ID = "hubstore-web"
REDIRECT_URI = "http://localhost:3000/callback"  # không cần listener — chỉ khớp realm

def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def main() -> None:
    username, password, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
    verifier = b64url(secrets.token_bytes(48))
    challenge = b64url(hashlib.sha256(verifier.encode()).digest())

    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(cj),
        # KHÔNG follow ra ngoài host 8081 (redirect cuối về :3000 không sống)
        NoFollow3000(),
    )

    auth_url = (f"{ISSUER}/protocol/openid-connect/auth?"
                + urllib.parse.urlencode({
                    "client_id": CLIENT_ID,
                    "response_type": "code",
                    "scope": "openid",
                    "redirect_uri": REDIRECT_URI,
                    "code_challenge": challenge,
                    "code_challenge_method": "S256",
                  }))
    html = opener.open(auth_url, timeout=15).read().decode()
    # Keycloak compose set cookie Secure=true dù chạy http → urllib không gửi
    # lại → "Cookie not found". Force thường hoá cookie trong jar.
    for c in cj:
        c.secure = False
    m = re.search(r'action="([^"]+)"', html)
    if not m:
        print("FATAL: không tìm thấy login form action", file=sys.stderr)
        sys.exit(1)
    action = m.group(1).replace("&amp;", "&")
    if action.startswith("/"):
        action = "http://localhost:8081" + action

    body = urllib.parse.urlencode({
        "username": username,
        "password": password,
        "credentialId": "",
    }).encode()
    try:
        opener.open(action, body, timeout=15)
        print("FATAL: login submit không redirect ra :3000", file=sys.stderr)
        sys.exit(1)
    except CodeRedirect as e:
        callback = e.location

    q = urllib.parse.parse_qs(urllib.parse.urlparse(callback).query)
    code = q["code"][0]

    tok_req = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": CLIENT_ID,
        "code_verifier": verifier,
    }).encode()
    tok = json.loads(urllib.request.urlopen(
        f"{ISSUER}/protocol/openid-connect/token", tok_req, timeout=15).read())
    if "access_token" not in tok:
        print(f"FATAL: token exchange fail: {tok}", file=sys.stderr)
        sys.exit(1)

    state = {
        "cookies": [],
        "origins": [{
            "origin": "http://localhost:3000",
            "localStorage": [{
                "name": f"oidc.user:{ISSUER}:{CLIENT_ID}",
                "value": json.dumps(tok),
            }],
        }],
    }
    with open(out_path, "w") as f:
        json.dump(state, f)
    print(f"mint OK -> {out_path}")

class NoFollow3000(urllib.request.HTTPRedirectHandler):
    """Bắt redirect cuối (Location :3000/callback?code=...) thay vì follow."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if "localhost:3000" in newurl:
            raise CodeRedirect(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

class CodeRedirect(Exception):
    def __init__(self, location: str):
        self.location = location

if __name__ == "__main__":
    main()
