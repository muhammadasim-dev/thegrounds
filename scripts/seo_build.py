#!/usr/bin/env python3
"""Central SEO build for thegrounds.ae (static HTML).

Run after any content change:  python3 scripts/seo_build.py
Then, once deployed:            bash scripts/submit-indexnow.sh

What it owns (never hand-edit these per page, change PAGES / templates here):
  - <head>: title, description, robots, canonical, Open Graph, Twitter, JSON-LD
  - site header + main nav, footer + footer nav, visible breadcrumbs
  - width/height on every .webp <img> (read from the file), table data-labels
  - sitemap.xml, sitemap-images.xml, images-map.json (built from what pages really show)
  - an audit table: title/description length, H1 count, words, FAQs, dashes, inbound links

Keyword silo (one primary cluster per URL, see SEO-AUDIT.md):
  pillar "/"      -> the entity (The Grounds by Aldar / The Grounds Dubai / DSO)
  typology pages  -> townhouses, villas
  location        -> The Grounds location / Dubai Silicon Oasis
  document spokes -> price list, payment plan, brochure, floor plans
The pillar title never carries a spoke keyword; spokes lead with their document keyword.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import pathlib
import re
import struct
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASE = "https://thegrounds.ae"
BRAND = "The Grounds by Aldar"
GTM_ID = "GTM-KSW89QM7"
INDEXNOW_KEY = "95e171fb8d6144fe8e148624938d73c3"
TODAY = dt.date.today().isoformat()

# path -> page config. Order = sitemap / nav order.
PAGES: dict[str, dict] = {
    "": {
        "title": "The Grounds by Aldar | New Launch in Dubai Silicon Oasis",
        "description": "The Grounds by Aldar is Dubai’s first vitality community in Dubai Silicon Oasis: 3 and 4 bed townhouses and villas by Aldar with Dubai Holding.",
        "og_image": "assets/home_banner.webp",
        "og_alt": "The Grounds by Aldar homes and landscaped outdoor spaces in Dubai Silicon Oasis",
        "crumb": None,
        "blurb": "Dubai’s first vitality community in Dubai Silicon Oasis. Townhouses and villas from a guide price of AED 2.85M.",
        "preload": "assets/home_banner-1600.webp",
        "preload_srcset": "assets/home_banner-960.webp 960w, assets/home_banner-1600.webp 1600w, assets/home_banner.webp 2880w",
        "preload_sizes": "(max-width: 980px) 100vw, 50vw",
    },
    "townhouses/": {
        "title": "The Grounds by Aldar Townhouses | 3 and 4 Bed in DSO",
        "description": "Townhouses at The Grounds by Aldar, Dubai Silicon Oasis: 3 bed from AED 2.85M (about 2,040 sq. ft.) and 4 bed from AED 3.5M (about 2,200 sq. ft.).",
        "og_image": "assets/res-living-dining.webp",
        "og_alt": "Living and dining room in a townhouse at The Grounds by Aldar, indicative render",
        "crumb": "Townhouses",
        "nav": "Townhouses",
        "blurb": "3 and 4 bedroom townhouses from a guide price of AED 2.85M in Dubai Silicon Oasis.",
    },
    "villas/": {
        "title": "The Grounds by Aldar Villas | Twin and Standalone Villas",
        "description": "Villas at The Grounds by Aldar, Dubai Silicon Oasis: 4 bed twin villas from AED 3.95M and 3 and 4 bed standalone villas from AED 4.1M. Register for plans.",
        "og_image": "assets/res-villa-dining-kitchen.webp",
        "og_alt": "Open kitchen and dining room in a villa at The Grounds by Aldar, indicative render",
        "crumb": "Villas",
        "nav": "Villas",
        "blurb": "Twin villas and standalone villas from a guide price of AED 3.95M in Dubai Silicon Oasis.",
    },
    "location/": {
        "title": "The Grounds by Aldar Location | Dubai Silicon Oasis",
        "description": "Where is The Grounds by Aldar? Dubai Silicon Oasis in east Dubai, beside Academic City, served by Al Ain Road, SMBZ and a Blue Line metro station due 2029.",
        "og_image": "assets/grounds-landscape-stream.webp",
        "og_alt": "Landscaped stream and green space at The Grounds by Aldar, Dubai Silicon Oasis",
        "crumb": "Location",
        "nav": "Location",
        "blurb": "Dubai Silicon Oasis, east Dubai. Drive times and the site plan follow the official launch map.",
    },
    "price-list/": {
        "title": "The Grounds by Aldar Price List | From AED 2.85M",
        "description": "The Grounds by Aldar price list: guide prices from AED 2.85M for a 3 bed townhouse up to AED 4.9M for a 4 bed villa, about AED 1,400 per sq. ft. at entry.",
        "og_image": "assets/home_banner.webp",
        "og_alt": "The Grounds by Aldar townhouses and villas in Dubai Silicon Oasis",
        "crumb": "Price list",
        "nav": "Price list",
        "blurb": "Guide prices from AED 2.85M. Indicative until Aldar issues the official price list at launch.",
    },
    "payment-plan/": {
        "title": "The Grounds by Aldar Payment Plan | 5/45/50 Explained",
        "description": "The Grounds by Aldar payment plan: 5% on booking, 45% during construction and 50% on handover, with worked amounts for each home and the 4% DLD fee.",
        "og_image": "assets/life-move-garden-walk.webp",
        "og_alt": "Garden walk at The Grounds by Aldar, indicative render",
        "crumb": "Payment plan",
        "nav": "Payment plan",
        "blurb": "Quoted plan 5% on booking, 45% during construction, 50% on handover. The sale agreement confirms it.",
    },
    "brochure/": {
        "title": "The Grounds by Aldar Brochure | Register for the PDF",
        "description": "Register for The Grounds by Aldar brochure PDF, sent when Aldar releases it at the December 2026 launch, with the masterplan, home types and amenities.",
        "og_image": "assets/lifestyle-garden-lounge.webp",
        "og_alt": "Garden lounge at The Grounds by Aldar, indicative render",
        "crumb": "Brochure",
        "blurb": "Brochure for The Grounds by Aldar in Dubai Silicon Oasis, sent when Aldar releases the launch pack.",
    },
    "floor-plans/": {
        "title": "The Grounds by Aldar Floor Plans | 3 and 4 Bed Layouts",
        "description": "Register for The Grounds by Aldar floor plans: 3 and 4 bed townhouse, twin villa and villa layouts, sent as PDFs when Aldar releases them at launch.",
        "og_image": "assets/res-kitchen-dining.webp",
        "og_alt": "Kitchen and dining layout in a home at The Grounds by Aldar, indicative render",
        "crumb": "Floor plans",
        "blurb": "Floor plans for townhouses and villas in Dubai Silicon Oasis. Sizes are indicative until launch.",
    },
    "privacy-policy/": {
        "title": "Privacy Policy | The Grounds by Aldar",
        "description": "How thegrounds.ae collects, uses and protects the details you share when you register interest in The Grounds by Aldar in Dubai Silicon Oasis.",
        "og_image": "assets/home_banner.webp",
        "og_alt": "The Grounds by Aldar homes and landscaped outdoor spaces in Dubai Silicon Oasis",
        "crumb": "Privacy policy",
        "blurb": "Independent marketing site for The Grounds by Aldar in Dubai Silicon Oasis.",
        "noindex": True,
    },
}

FOOTER_LINKS = [
    ("", "Home"), ("townhouses/", "Townhouses"), ("villas/", "Villas"), ("location/", "Location"),
    ("price-list/", "Price list"), ("payment-plan/", "Payment plan"), ("brochure/", "Brochure"),
    ("floor-plans/", "Floor plans"),
]

LOGO_SVG = """<svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
          <rect width="36" height="36" rx="10" fill="#143028"/>
          <path d="M8 24h20" stroke="#e6d3b4" stroke-width="1.4" stroke-linecap="round"/>
          <path d="M18 24c0-6 2.2-9 6-11" stroke="#c4a36a" stroke-width="1.4" fill="none" stroke-linecap="round"/>
          <circle cx="18" cy="16" r="3.2" fill="#3e6b52"/>
        </svg>"""


# ---------------------------------------------------------------- helpers

def webp_size(path: pathlib.Path) -> tuple[int, int] | None:
    data = path.read_bytes()[:40]
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    chunk = data[12:16]
    if chunk == b"VP8X":
        w = 1 + int.from_bytes(data[24:27], "little")
        h = 1 + int.from_bytes(data[27:30], "little")
        return w, h
    if chunk == b"VP8 ":
        w, h = struct.unpack("<HH", data[26:30])
        return w & 0x3FFF, h & 0x3FFF
    if chunk == b"VP8L":
        b = data[21:25]
        w = 1 + (((b[1] & 0x3F) << 8) | b[0])
        h = 1 + (((b[3] & 0x0F) << 10) | (b[2] << 2) | ((b[1] & 0xC0) >> 6))
        return w, h
    return None


def strip_tags(s: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def esc(s: str) -> str:
    return html.escape(s, quote=True)


def page_file(path: str) -> pathlib.Path:
    return ROOT / path / "index.html"


def prefix(path: str) -> str:
    return "" if path == "" else "../" * path.count("/")


def extract_faqs(body: str) -> list[tuple[str, str]]:
    out = []
    for m in re.finditer(
        r'<div class="faq-item" data-faq>\s*<button[^>]*>(.*?)<span aria-hidden="true">\+</span></button>\s*'
        r"<div data-faq-panel hidden>(.*?)</div>",
        body,
        re.S,
    ):
        out.append((strip_tags(m.group(1)), strip_tags(m.group(2))))
    return out


def ld(obj: dict) -> str:
    return '  <script type="application/ld+json">\n' + json.dumps(obj, ensure_ascii=False, indent=2) + "\n  </script>"


# ---------------------------------------------------------------- templates

def build_schema(path: str, cfg: dict, faqs: list[tuple[str, str]]) -> list[str]:
    url = f"{BASE}/{path}"
    blocks = []
    if path == "":
        blocks.append({
            "@context": "https://schema.org",
            "@type": "Residence",
            "@id": f"{BASE}/#residence",
            "name": BRAND,
            "alternateName": ["The Grounds Dubai", "The Grounds Aldar", "The Grounds Dubai Silicon Oasis"],
            "description": cfg["description"],
            "url": url,
            "image": [f"{BASE}/assets/home_banner.webp", f"{BASE}/assets/grounds-landscape-stream.webp"],
            "address": {"@type": "PostalAddress", "addressLocality": "Dubai Silicon Oasis",
                        "addressRegion": "Dubai", "addressCountry": "AE"},
            "containedInPlace": {"@type": "Place", "name": "Dubai Silicon Oasis, Dubai"},
            "additionalProperty": [
                {"@type": "PropertyValue", "name": "Developer", "value": "Aldar, in partnership with Dubai Holding"},
                {"@type": "PropertyValue", "name": "Homes planned", "value": "About 1,800 townhouses, twin villas and villas"},
                {"@type": "PropertyValue", "name": "Bedrooms", "value": "3 and 4"},
                {"@type": "PropertyValue", "name": "Guide starting price", "value": "AED 2,850,000"},
                {"@type": "PropertyValue", "name": "Expected sales launch", "value": "December 2026"},
                {"@type": "PropertyValue", "name": "Indicated completion", "value": "Q2 2030"},
                {"@type": "PropertyValue", "name": "Quoted payment plan", "value": "5% booking, 45% construction, 50% handover"},
            ],
        })
        blocks.append({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": f"{BASE}/#website",
            "name": BRAND,
            "alternateName": "The Grounds Dubai",
            "url": f"{BASE}/",
            "inLanguage": "en-AE",
            "about": {"@id": f"{BASE}/#residence"},
        })
    else:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": BRAND, "item": f"{BASE}/"},
                {"@type": "ListItem", "position": 2, "name": cfg["crumb"], "item": url},
            ],
        })
    if faqs:
        blocks.append({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
                for q, a in faqs
            ],
        })
    return [ld(b) for b in blocks]


def build_head(path: str, cfg: dict, faqs) -> str:
    p = prefix(path)
    url = f"{BASE}/{path}"
    og_img = cfg["og_image"]
    size = webp_size(ROOT / og_img) or (1200, 630)
    lines = [
        "<head>",
        '  <meta charset="utf-8">',
        '  <meta name="viewport" content="width=device-width, initial-scale=1">',
        f"  <title>{esc(cfg['title'])}</title>",
        f'  <meta name="description" content="{esc(cfg["description"])}">',
        ('  <meta name="robots" content="noindex, follow">' if cfg.get("noindex") else '  <meta name="robots" content="index, follow, max-image-preview:large">'),
        f'  <link rel="canonical" href="{url}">',
        '  <meta property="og:type" content="website">',
        '  <meta property="og:locale" content="en_AE">',
        f'  <meta property="og:site_name" content="{BRAND}">',
        f'  <meta property="og:title" content="{esc(cfg["title"])}">',
        f'  <meta property="og:description" content="{esc(cfg["description"])}">',
        f'  <meta property="og:url" content="{url}">',
        f'  <meta property="og:image" content="{BASE}/{og_img}">',
        f'  <meta property="og:image:width" content="{size[0]}">',
        f'  <meta property="og:image:height" content="{size[1]}">',
        f'  <meta property="og:image:alt" content="{esc(cfg["og_alt"])}">',
        '  <meta name="twitter:card" content="summary_large_image">',
        f'  <meta name="twitter:title" content="{esc(cfg["title"])}">',
        f'  <meta name="twitter:description" content="{esc(cfg["description"])}">',
        f'  <meta name="twitter:image" content="{BASE}/{og_img}">',
        '  <meta name="theme-color" content="#f3efe6">',
        f'  <meta name="indexnow" content="{INDEXNOW_KEY}">',
        f'  <link rel="describedby" href="{BASE}/llms.txt">',
        f'  <link rel="icon" href="{p}assets/favicon.svg" type="image/svg+xml">',
    ]
    if cfg.get("preload"):
        extra = ""
        if cfg.get("preload_srcset"):
            srcset = ", ".join(p + part.strip() for part in cfg["preload_srcset"].split(","))
            extra = f' imagesrcset="{srcset}" imagesizes="{cfg["preload_sizes"]}"'
        lines.append(f'  <link rel="preload" as="image" href="{p}{cfg["preload"]}"{extra} fetchpriority="high">')
    lines += [
        f'  <link rel="stylesheet" href="{p}css/styles.css">',
        "  <script>",
        "    window.dataLayer = window.dataLayer || [];",
        "    function gtag(){dataLayer.push(arguments);}",
        "    gtag('js', new Date());",
        "  </script>",
        f'  <script async src="https://www.googletagmanager.com/gtm.js?id={GTM_ID}"></script>',
    ]
    lines += build_schema(path, cfg, faqs)
    lines.append("</head>")
    return "\n".join(lines)


def build_header(path: str) -> str:
    p = prefix(path)
    home = p or "./"
    links = []
    for target, cfg in PAGES.items():
        if not cfg.get("nav"):
            continue
        cur = ' aria-current="page"' if target == path else ""
        links.append(f'        <a href="{p}{target}"{cur}>{cfg["nav"]}</a>')
    links.append('        <a class="btn" href="#enquire" data-open-enquire>Register interest</a>')
    return f"""<header class="site-header" data-header>
    <div class="header-inner">
      <a class="brand" href="{home}" aria-label="{BRAND} home">
        {LOGO_SVG}
        <span>
          <strong>The Grounds</strong>
          <em>by Aldar</em>
        </span>
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav" data-nav-toggle>
        <span class="bars" aria-hidden="true"><span></span><span></span><span></span></span>
        <span data-nav-label>Menu</span>
      </button>
      <nav class="site-nav" id="site-nav" aria-label="Main" data-nav>
{chr(10).join(links)}
      </nav>
    </div>
  </header>"""


def build_footer(path: str, cfg: dict) -> str:
    p = prefix(path)
    links = []
    for target, label in FOOTER_LINKS:
        href = f"{p}{target}" if (p or target) else "./"
        cur = ' aria-current="page"' if target == path else ""
        links.append(f'        <a href="{href}"{cur}>{label}</a>')
    links.append('        <a href="#enquire" data-open-enquire>Register interest</a>')
    return f"""<footer class="site-footer">
    <div class="wrap footer-inner">
      <div>
        <strong>{BRAND}</strong>
        <p>{cfg['blurb']}</p>
        <p class="footer-legal">Independent marketing site for {BRAND}. Prices, areas and the payment plan are indicative until Aldar releases the official sales documents. Last reviewed {dt.date.fromisoformat(TODAY).strftime('%-d %B %Y')}. <a href="{p}privacy-policy/">Privacy policy</a>.</p>
      </div>
      <nav class="footer-nav" aria-label="Footer">
{chr(10).join(links)}
      </nav>
    </div>
  </footer>"""


def build_crumbs(path: str, cfg: dict) -> str:
    p = prefix(path)
    return (f'<nav class="crumbs" aria-label="Breadcrumb"><a href="{p}">{BRAND}</a> '
            f'<span aria-hidden="true">/</span> <span aria-current="page">{cfg["crumb"]}</span></nav>')


def fix_images(doc: str, path: str) -> str:
    p = prefix(path)

    def repl(m: re.Match) -> str:
        tag = m.group(0)
        src = re.search(r'src="([^"]+\.webp)"', tag)
        if not src:
            return tag
        file = ROOT / path / src.group(1)
        size = webp_size(file.resolve()) if file.exists() else None
        if not size:
            print(f"  ! missing image {src.group(1)} on /{path}", file=sys.stderr)
            return tag
        tag = re.sub(r'\swidth="\d+"', "", tag)
        tag = re.sub(r'\sheight="\d+"', "", tag)
        return tag.replace("<img ", f'<img width="{size[0]}" height="{size[1]}" ', 1)

    return re.sub(r"<img\b[^>]*>", repl, doc)


def fix_tables(doc: str) -> str:
    def per_table(m: re.Match) -> str:
        t = m.group(0)
        heads = [strip_tags(h) for h in re.findall(r"<th[^>]*>(.*?)</th>", t, re.S)]
        if not heads:
            return t

        def per_row(r: re.Match) -> str:
            i = 0

            def per_td(c: re.Match) -> str:
                nonlocal i
                attrs = re.sub(r'\sdata-label="[^"]*"', "", c.group(1))
                label = heads[i] if i < len(heads) else ""
                i += 1
                return f'<td{attrs} data-label="{esc(label)}">'

            return re.sub(r"<td([^>]*)>", per_td, r.group(0))

        return re.sub(r"<tr>.*?</tr>", per_row, t, flags=re.S)

    return re.sub(r"<table>.*?</table>", per_table, doc, flags=re.S)


# ---------------------------------------------------------------- build

def build_page(path: str, cfg: dict) -> str:
    f = page_file(path)
    doc = f.read_text(encoding="utf-8")
    body = doc[doc.index("<body"):]
    faqs = extract_faqs(body)
    doc = re.sub(r"<head>.*?</head>", lambda _: build_head(path, cfg, faqs), doc, count=1, flags=re.S)
    doc = re.sub(r'<header class="site-header".*?</header>', lambda _: build_header(path), doc, count=1, flags=re.S)
    doc = re.sub(r'<footer class="site-footer">.*?</footer>', lambda _: build_footer(path, cfg), doc, count=1, flags=re.S)
    if cfg.get("crumb"):
        doc = re.sub(r'<(p|nav) class="crumbs".*?</\1>', lambda _: build_crumbs(path, cfg), doc, count=1, flags=re.S)
    doc = fix_images(doc, path)
    doc = fix_tables(doc)
    f.write_text(doc, encoding="utf-8")
    return doc


def page_images(path: str, doc: str) -> list[tuple[str, str]]:
    """(absolute url, alt) for raster images and video posters actually in <main>."""
    main = doc[doc.find("<main"):doc.find("</main>")]
    out, seen = [], set()
    for tag in re.findall(r"<(?:img|video)\b[^>]*>", main):
        src = re.search(r'(?:src|poster)="([^"]+\.(?:webp|jpg|jpeg|png))"', tag)
        if not src:
            continue
        abs_url = BASE + "/" + str((pathlib.PurePosixPath("/" + path) / src.group(1))).lstrip("/")
        abs_url = re.sub(r"/[^/]+/\.\./", "/", abs_url)
        while "/../" in abs_url:
            abs_url = re.sub(r"/[^/]+/\.\./", "/", abs_url)
        if abs_url in seen:
            continue
        seen.add(abs_url)
        alt = re.search(r'alt="([^"]*)"', tag)
        out.append((abs_url, html.unescape(alt.group(1)) if alt else ""))
    return out


def write_discovery(docs: dict[str, str]) -> None:
    urls = "\n".join(
        f"  <url><loc>{BASE}/{p}</loc><lastmod>{TODAY}</lastmod></url>" for p in PAGES if not PAGES[p].get("noindex")
    )
    (ROOT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "\n</urlset>\n",
        encoding="utf-8",
    )

    blocks, media = [], {}
    for p, doc in docs.items():
        if PAGES[p].get("noindex"):
            continue
        imgs = page_images(p, doc)
        if not imgs:
            continue
        inner = "\n".join(f"    <image:image><image:loc>{u}</image:loc></image:image>" for u, _ in imgs)
        blocks.append(f"  <url>\n    <loc>{BASE}/{p}</loc>\n{inner}\n  </url>")
        for u, alt in imgs:
            m = media.setdefault(u, {"url": u, "file": u.rsplit("/", 1)[1], "type": "image/webp", "pages": [], "alt": alt})
            m["pages"].append("/" + p)
    (ROOT / "sitemap-images.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
        '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
        + "\n".join(blocks) + "\n</urlset>\n",
        encoding="utf-8",
    )
    media_list = list(media.values())
    media_list.append({"url": f"{BASE}/assets/hero-banner.mp4", "file": "hero-banner.mp4", "type": "video/mp4",
                       "pages": ["/"], "alt": "Homepage hero video for The Grounds by Aldar"})
    (ROOT / "images-map.json").write_text(json.dumps({
        "site": BASE,
        "updated": TODAY,
        "sitemaps": {"index": f"{BASE}/sitemap-index.xml", "pages": f"{BASE}/sitemap.xml",
                     "images": f"{BASE}/sitemap-images.xml"},
        "media": media_list,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    (ROOT / "sitemap-index.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <sitemap><loc>{BASE}/sitemap.xml</loc><lastmod>{TODAY}</lastmod></sitemap>\n"
        f"  <sitemap><loc>{BASE}/sitemap-images.xml</loc><lastmod>{TODAY}</lastmod></sitemap>\n"
        "</sitemapindex>\n",
        encoding="utf-8",
    )


def audit(docs: dict[str, str]) -> int:
    inbound = {p: 0 for p in PAGES}
    for p, doc in docs.items():
        main = doc[doc.find("<main"):doc.find("</main>")]
        for href in set(re.findall(r'href="([^"#]*)"', main)):
            target = (pathlib.PurePosixPath("/" + p) / href).as_posix() if href else "/" + p
            target = re.sub(r"/[^/]+/\.\.", "", target).replace("/./", "/").lstrip("/")
            target = "" if target in ("", ".") else target.rstrip("/") + "/"
            if target in inbound and target != p:
                inbound[target] += 1
    problems = 0
    print(f"{'page':<15}{'title':>6}{'desc':>6}{'h1':>4}{'words':>7}{'faq':>5}{'dash':>6}{'in(main)':>10}")
    for p, doc in docs.items():
        cfg = PAGES[p]
        if cfg.get("noindex"):
            print(f"/{p:<14}  (noindex, skipped)")
            continue
        main = doc[doc.find("<main"):doc.find("</main>")]
        words = len(strip_tags(re.sub(r"<script.*?</script>", "", main, flags=re.S)).split())
        h1 = len(re.findall(r"<h1\b", doc))
        visible = strip_tags(re.sub(r"<(script|style|head)\b.*?</\1>", "", doc, flags=re.S))
        dashes = len(re.findall(r"[–—]", visible + cfg["title"] + cfg["description"]))
        faqs = len(extract_faqs(doc))
        t, d = len(cfg["title"]), len(cfg["description"])
        flags = []
        if t > 60: flags.append("title>60")
        if not 120 <= d <= 155: flags.append("desc!120-155")
        if h1 != 1: flags.append("h1!=1")
        if words < 400: flags.append("thin<400")
        if dashes: flags.append("dashes")
        if not faqs: flags.append("no-faq")
        if p and inbound[p] == 0: flags.append("no-body-links")
        problems += len(flags)
        print(f"/{p:<14}{t:>6}{d:>6}{h1:>4}{words:>7}{faqs:>5}{dashes:>6}{inbound[p]:>10}  {' '.join(flags)}")
    # cannibalisation: pillar title must not contain spoke keywords; no duplicate titles/H1s
    spoke_kw = ["brochure", "floor plan", "payment plan", "price list"]
    if any(k in PAGES[""]["title"].lower() for k in spoke_kw):
        print("! pillar title contains a spoke keyword"); problems += 1
    titles = [c["title"] for c in PAGES.values()]
    if len(set(titles)) != len(titles):
        print("! duplicate titles"); problems += 1
    h1s = [strip_tags(re.search(r"<h1\b.*?</h1>", d, re.S).group(0)).lower() for p, d in docs.items() if not PAGES[p].get("noindex")]
    if len(set(h1s)) != len(h1s):
        print("! duplicate H1s"); problems += 1
    return problems


def main() -> None:
    docs = {p: build_page(p, cfg) for p, cfg in PAGES.items()}
    write_discovery(docs)
    problems = audit(docs)
    print(f"\n{len(docs)} pages built, {problems} audit flag(s).")


if __name__ == "__main__":
    main()
