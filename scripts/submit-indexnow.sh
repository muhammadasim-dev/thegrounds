#!/usr/bin/env bash
set -euo pipefail
KEY="95e171fb8d6144fe8e148624938d73c3"
HOST="${INDEXNOW_HOST:-thegrounds.ae}"
BASE="https://${HOST}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

python3 - <<PY
import json
import pathlib
import urllib.request
import xml.etree.ElementTree as ET

key = "$KEY"
host = "$HOST"
base = "$BASE"
root = pathlib.Path("""$ROOT""")

ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
img_ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9", "image": "http://www.google.com/schemas/sitemap-image/1.1"}

urls: list[str] = []

def add(u: str) -> None:
    if u and u not in urls:
        urls.append(u)

for name in ("sitemap-index.xml", "sitemap.xml", "sitemap-images.xml", "llms.txt", "llms-full.txt", "images-map.json", "robots.txt"):
    add(f"{base}/{name}")

for sitemap in ("sitemap.xml", "sitemap-images.xml"):
    path = root / sitemap
    if not path.is_file():
        continue
    tree = ET.parse(path)
    root_el = tree.getroot()
    for loc in root_el.findall(".//sm:loc", ns):
        add((loc.text or "").strip())
    for img in root_el.findall(".//image:loc", img_ns):
        add((img.text or "").strip())

# Removed URLs: let engines recrawl and see the 301
for gone in ("price-payment-plan/",):
    add(f"{base}/{gone}")

# Hero video for discovery
add(f"{base}/assets/hero-banner.mp4")

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
with urllib.request.urlopen(req, timeout=60) as res:
    print("IndexNow status:", res.status, res.reason)
print(f"Submitted {len(urls)} URLs for {host}")
PY