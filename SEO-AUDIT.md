# thegrounds.ae SEO audit (26 November 2026)

Baseline audit of the new site, run without Search Console or GA4 data (the domain is new). It follows the offplanproject.ae playbook (`offplanproject.ae/.cursor/rules/seo-playbook.mdc` and `document-campaign-keyword-silo.mdc`).

No search volumes are given. None are invented. Once Search Console has 4 to 6 weeks of impressions, re-rank the secondary keywords below with real query data.

## How to work on this site

- `python3 scripts/seo_build.py` owns every `<head>`, the header and nav, the footer, breadcrumbs, JSON-LD, image dimensions, table labels, `sitemap.xml`, `sitemap-images.xml` and `images-map.json`. Change titles, descriptions and OG images in its `PAGES` dict, never in the HTML.
- Run it after every content change. It prints an audit table and must end with `0 audit flag(s)`.
- After a deploy, run `bash scripts/submit-indexnow.sh`.
- Update `llms.txt` and `llms-full.txt` by hand when facts change.

## Keyword map (one primary cluster per URL)

| URL | Primary keyword | Secondary keywords | Intent |
|---|---|---|---|
| `/` (pillar) | the grounds by aldar | the grounds aldar, the grounds dubai, the grounds dubai silicon oasis, aldar dubai silicon oasis, aldar dubai holding new launch, vitality community dubai | Entity / navigational |
| `/townhouses/` | the grounds townhouses | aldar townhouses dubai silicon oasis, 3 bedroom townhouse dubai silicon oasis, 4 bedroom townhouse the grounds | Commercial |
| `/villas/` | the grounds villas | aldar villas dubai, twin villa dubai silicon oasis, 4 bedroom villa dubai silicon oasis | Commercial |
| `/location/` | the grounds location | where is the grounds by aldar, the grounds dubai silicon oasis location, dubai silicon oasis metro station | Informational |
| `/price-list/` | the grounds aldar price list | the grounds by aldar price, the grounds starting price, the grounds price per sq ft | Commercial |
| `/payment-plan/` | the grounds payment plan | the grounds aldar payment plan, 5/45/50 payment plan, the grounds booking amount | Commercial |
| `/brochure/` | the grounds aldar brochure | the grounds brochure pdf | Document (gated) |
| `/floor-plans/` | the grounds floor plans | the grounds townhouse floor plan, the grounds villa sizes | Document (gated) |

Silo rules:

- The pillar title never contains brochure, floor plans, payment plan or price list. The build script checks this.
- Each spoke title leads with its own keyword. No two titles or H1s are the same. The build script checks this too.
- Pillar schema: Residence, WebSite and FAQPage. Spoke schema: BreadcrumbList and FAQPage only, with no duplicate entity.
- The price table lives on `/price-list/`. The schedule, fees, escrow and steps live on `/payment-plan/`. Other pages carry one line on each and a link.

## Findings and fixes

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | `/price-payment-plan/` duplicated the price table and 5/45/50 plan from `/price-list/` and `/payment-plan/`. It had no canonical and was still in the sitemap and llms.txt. | High (cannibalisation) | Page deleted. A 301 to `/price-list/` is in `vercel.json`. Its unique content (fees, steps, escrow, finance, Golden Visa FAQs) moved to the spoke that owns each intent. |
| 2 | No canonical on 5 of 9 pages, including the home page. | High | Self-referencing canonical with a trailing slash on every page. `vercel.json` sets `trailingSlash: true` and redirects `index.html` URLs. |
| 3 | H1s had no keyword: "The compact family home", "More ground, more quiet", "Dubai Silicon Oasis", "Floor plans & layouts". | High | H1s now carry the page keyword: "Townhouses at The Grounds by Aldar", "The Grounds location: Dubai Silicon Oasis", and so on. The old taglines moved into the lede. |
| 4 | No JSON-LD on 6 pages. No FAQPage or BreadcrumbList anywhere. | High | Generated from page content. FAQPage is built from the visible FAQ, so schema always matches the page. |
| 5 | Price list (118 words), payment plan (116), floor plans (220) and brochure (316) were thin, with no FAQ. | High | All pages are now 410 to 1,229 words, with 4 to 6 FAQs each, question-style H2s and register CTAs. Payment plan has a worked 5/45/50 table for every home. |
| 6 | 13 real renders were listed in the image sitemap but shown on no page. Google ignores sitemap images that are not on the page. | Medium | Renders placed on pages: four pillar images and a six-image amenities gallery on home, plus interiors on townhouses, villas, brochure and floor plans. The image sitemap and `images-map.json` are now generated from what the pages really show. |
| 7 | The hero image declared 1000×1240 but is 2880×1990, causing layout shift (CLS). Other images also had wrong sizes. | Medium | Every `.webp` gets its real width and height, read from the file. The hero image is preloaded with `fetchpriority="high"`. |
| 8 | The home page never linked to `/brochure/` or `/floor-plans/`. The footer nav differed on every page. Payment plan had a broken header (no logo, no menu bars). | Medium | Added a "Launch documents" section on home. One standard header, and a footer linking all 8 pages, on every page. Descriptive anchors replace "See villas". |
| 9 | Open Graph and Twitter tags were missing or partial on 7 pages. | Medium | Full OG and Twitter tags on every page, with image size and alt. |
| 10 | Em and en dashes in visible copy, against the house style. | Low | Removed. The build audit flags any that come back. |
| 11 | On mobile, the table labels were hardcoded, so the floor-plans "Plans" column showed as "Guide price". | Low | Labels now come from each table's header (`data-label`). |
| 12 | No 404 page. robots.txt had no AI-crawler groups and listed child sitemaps twice. | Low | Added a `404.html` with `noindex`. robots.txt now allows AI crawlers and points at the sitemap index. Sitemaps carry `lastmod`. |
| 13 | No visible statement that this is an independent site. Real estate is a YMYL topic. | Medium (E-E-A-T) | The footer now says "Independent marketing site" and gives a "Last reviewed" date. |

## Fixed in the follow-up pass (26 November 2026)

- **Lead capture:** The form now POSTs to `/api/leads` (`api/leads.js`, a Vercel function with no dependencies). Leads go to Salesforce Web-to-Lead with the same org and fields as offplanproject.ae (project "The Grounds by Aldar", inquiry type SEO). A Resend email goes out when `RESEND_API_KEY` is set, and a Supabase row is saved when `SUPABASE_URL` and `SUPABASE_SECRET_KEY` are set. The function has a hidden bot-trap field, a rate limit and server-side validation.
- **Analytics:** No name, email or phone goes to the dataLayer. A successful lead fires `generate_lead`, plus the legacy `enquire_submit` without the phone number.
- **Privacy:** Added `/privacy-policy/` (`noindex`, kept out of the sitemap). The footer and the form link to it.
- **Hero image:** `home_banner-960.webp` (130 KB) and `home_banner-1600.webp` (294 KB) are served with `srcset` and a matching preload. The 2880 px original is kept for OG and Google Images.

## Still open

1. **Vercel environment variables** for the thegrounds project: set `RESEND_API_KEY` (and optionally `LEAD_TO_EMAIL`, plus `SUPABASE_URL` and `SUPABASE_SECRET_KEY`) to get inbox emails and a database copy. Until then, leads go to Salesforce only.
2. **Privacy policy entity:** add the operating company name, RERA ORN and a contact email once confirmed.
3. **After the launch documents are out** (first week of December 2026), replace guide prices with the official price list, add villa areas, the site plan and drive times. Then rerun the build and IndexNow.
4. **Search Console and Bing Webmaster Tools:** verify the domain, submit `sitemap-index.xml` and request indexing for the 8 URLs.
5. **GTM:** if any tag used the `enquire_phone` variable, update it. Point conversion tags at `generate_lead`.
