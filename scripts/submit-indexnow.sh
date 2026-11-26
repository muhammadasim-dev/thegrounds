#!/usr/bin/env bash
set -euo pipefail
KEY="95e171fb8d6144fe8e148624938d73c3"
HOST="${INDEXNOW_HOST:-thegrounds.ae}"
BASE="https://${HOST}"

python3 - <<PY
import json, urllib.request
key = "$KEY"
host = "$HOST"
base = "$BASE"
urls = [
    f"{base}/",
    f"{base}/townhouses/",
    f"{base}/villas/",
    f"{base}/location/",
    f"{base}/brochure/",
    f"{base}/floor-plans/",
    f"{base}/price-list/",
    f"{base}/payment-plan/",
]
body = json.dumps({
    "host": host,
    "key": key,
    "keyLocation": f"{base}/{key}.txt",
    "urlList": urls,
}).encode("utf-8")
req = urllib.request.Request(
    "https://api.indexnow.org/indexnow",
    data=body,
    headers={"Content-Type": "application/json; charset=utf-8"},
    method="POST",
)
with urllib.request.urlopen(req, timeout=30) as res:
    print("IndexNow status:", res.status, res.reason)
print(f"Submitted {len(urls)} URLs for {host}")
PY