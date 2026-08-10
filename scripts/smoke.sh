#!/usr/bin/env bash
# Oguaaman launch smoke test.
#
# Read-only. Hits the live estate and asserts the things that break silently:
# reachability, redirects, canonicals, SEO assets, API shape, and the store
# compliance endpoints. Exits non-zero if any check fails, so it can gate a
# deploy.
#
#   ./scripts/smoke.sh                 # production
#   BASE=http://localhost:5173 API=http://localhost:8080 ./scripts/smoke.sh
set -uo pipefail

SITE="${SITE:-https://oguaaman.com}"
CITIZEN="${CITIZEN:-https://citizen.oguaaman.com}"
API="${API:-https://api.oguaaman.com}"
CURL=(curl -sS --max-time 25)

pass=0; fail=0; warn=0
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; pass=$((pass+1)); }
bad()  { printf '  \033[31m✗\033[0m %s\n' "$1"; fail=$((fail+1)); }
note() { printf '  \033[33m!\033[0m %s\n' "$1"; warn=$((warn+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# expect_code URL EXPECTED LABEL
expect_code() {
  local got; got=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$1")
  [[ "$got" == "$2" ]] && ok "$3 ($got)" || bad "$3 — expected $2, got $got"
}

# expect_type URL SUBSTRING LABEL   (content-type contains)
expect_type() {
  local got; got=$("${CURL[@]}" -o /dev/null -w '%{content_type}' "$1")
  [[ "$got" == *"$2"* ]] && ok "$3 ($got)" || bad "$3 — expected type ~$2, got '$got'"
}

# expect_body URL SUBSTRING LABEL
expect_body() {
  "${CURL[@]}" -L "$1" | grep -q -- "$2" && ok "$3" || bad "$3 — '$2' not found at $1"
}

head_ "1 · Reachability"
expect_code "$SITE/"            200 "marketing apex"
expect_code "$CITIZEN/"         200 "citizen app"
expect_code "$API/api/stats"    200 "API /api/stats"

head_ "2 · Canonical host (www must fold into the apex)"
loc=$("${CURL[@]}" -o /dev/null -w '%{redirect_url}' "https://www.oguaaman.com/")
[[ "$loc" == "$SITE/" ]] && ok "www → apex ($loc)" || bad "www → apex — got '$loc'"
canon=$("${CURL[@]}" -L "$SITE/" | grep -o 'rel="canonical" href="[^"]*"' | head -1)
[[ "$canon" == *"$SITE/\""* ]] && ok "canonical matches serving host" || bad "canonical mismatch: $canon"

head_ "3 · SEO assets"
expect_type "$SITE/favicon.ico"    "icon"  "favicon.ico is a real icon, not the SPA shell"
expect_type "$CITIZEN/favicon.ico" "icon"  "citizen favicon.ico"
expect_type "$SITE/og-image.png"   "image/png" "og-image is a raster"
expect_code "$SITE/sitemap.xml"    200 "marketing sitemap"
expect_code "$SITE/robots.txt"     200 "marketing robots.txt"
expect_code "$CITIZEN/sitemap.xml" 200 "citizen sitemap"
expect_body "$SITE/robots.txt" "Sitemap:" "robots.txt advertises the sitemap"

head_ "4 · Every sitemap URL resolves 200 with a unique title"
"${CURL[@]}" "$SITE/sitemap.xml" -o /tmp/smoke-sitemap.xml
python3 - <<'PY'
import re, subprocess, collections, pathlib, sys
locs = re.findall(r"<loc>([^<]+)</loc>", pathlib.Path("/tmp/smoke-sitemap.xml").read_text())
titles, bad = collections.Counter(), []
for u in locs:
    html = subprocess.run(["curl","-sSL","--max-time","20",u], capture_output=True, text=True).stdout
    code = subprocess.run(["curl","-sS","-o","/dev/null","-w","%{http_code}","--max-time","20",u],
                          capture_output=True, text=True).stdout
    t = (re.search(r"<title>([^<]*)</title>", html) or [None,""])[1]
    titles[t] += 1
    if code != "200": bad.append(f"{u} -> HTTP {code}")
dupes = [t for t,n in titles.items() if n > 1]
if bad: print("  \033[31m✗\033[0m unreachable:", *bad, sep="\n      ")
else:   print(f"  \033[32m✓\033[0m all {len(locs)} sitemap URLs return 200")
if dupes: print("  \033[31m✗\033[0m duplicate <title>:", dupes)
else:     print(f"  \033[32m✓\033[0m all {len(locs)} titles unique")
sys.exit(1 if (bad or dupes) else 0)
PY
[[ $? -eq 0 ]] && pass=$((pass+2)) || fail=$((fail+1))

head_ "5 · Structured data parses"
python3 - <<PY
import json, re, subprocess, sys
html = subprocess.run(["curl","-sSL","--max-time","20","$SITE/"], capture_output=True, text=True).stdout
blocks = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S)
if not blocks:
    print("  \033[31m✗\033[0m no JSON-LD on the home page"); sys.exit(1)
for i, b in enumerate(blocks):
    try: json.loads(b)
    except Exception as e:
        print(f"  \033[31m✗\033[0m JSON-LD block {i} does not parse: {e}"); sys.exit(1)
print(f"  \033[32m✓\033[0m {len(blocks)} JSON-LD block(s) parse")
PY
[[ $? -eq 0 ]] && pass=$((pass+1)) || fail=$((fail+1))

head_ "6 · Content is actually served (an empty DB looks like a broken site)"
for ep in festivals people events businesses artists; do
  n=$("${CURL[@]}" "$API/api/$ep" | python3 -c 'import json,sys;d=json.load(sys.stdin);print(len(d) if isinstance(d,list) else len(d.get("items",[])))' 2>/dev/null || echo 0)
  [[ "${n:-0}" -gt 0 ]] && ok "/api/$ep returns $n" || bad "/api/$ep is EMPTY"
done

head_ "7 · Store compliance endpoints (App Store 1.2 / 5.1.1(v) / 3.1.1)"
# Unauthenticated calls must be refused, not silently accepted.
code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST "$API/api/members/hayford-stanley/block")
[[ "$code" == "401" || "$code" == "403" ]] && ok "block requires auth ($code)" || bad "block returned $code unauthenticated"
code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$API/api/me/blocked")
[[ "$code" == "401" || "$code" == "403" ]] && ok "blocked list requires auth ($code)" || bad "blocked list returned $code"
code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X DELETE "$API/api/me")
[[ "$code" == "401" || "$code" == "403" ]] && ok "account deletion requires auth ($code)" || bad "deletion returned $code"
code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$API/api/admin/queue")
[[ "$code" == "401" || "$code" == "403" ]] && ok "curator queue is gated ($code)" || bad "curator queue returned $code"

head_ "8 · Apple IAP"
body=$("${CURL[@]}" "$API/api/iap/apple/products")
if echo "$body" | grep -q '"enabled":true'; then
  ok "IAP enabled (APPLE_BUNDLE_ID is set)"
else
  note "IAP DISABLED — set APPLE_BUNDLE_ID on the server before store submission"
fi
echo "$body" | grep -q "gh.oguaa.app" && ok "product catalogue served" || bad "product catalogue missing"
# A junk receipt must be refused.
code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
       -d '{"purchaseToken":"not.a.receipt"}' "$API/api/iap/apple/redeem")
[[ "$code" == "400" || "$code" == "401" || "$code" == "403" || "$code" == "503" ]] \
  && ok "forged receipt refused ($code)" || bad "forged receipt returned $code"

head_ "Result"
printf '  %d passed, %d failed, %d warnings\n\n' "$pass" "$fail" "$warn"
[[ "$fail" -eq 0 ]]
