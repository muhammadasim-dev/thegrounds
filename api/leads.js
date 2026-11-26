// POST /api/leads — Vercel serverless function (no dependencies).
//
// Direct port of offplanproject.ae's lead pipeline so leads land in the same places
// with the same shape:
//   app/api/leads/route.ts, lib/leads/{pipeline,salesforce,email,config,
//   request-context,traffic,rate-limit}.ts
// Only the site branding, project name and slug differ. If the offplanproject.ae
// pipeline changes (Salesforce fields, email layout), mirror it here.
//
// Channels, same as offplanproject.ae:
//   1. Salesforce Web-to-Lead (always; org 00D8d000003VHZr)
//   2. Resend notify email (needs RESEND_API_KEY and LEAD_TO_EMAIL on Vercel)
//   3. Supabase `leads` row (only when SUPABASE_URL + SUPABASE_SECRET_KEY are set)

const crypto = require("crypto");

// ---------------------------------------------------------------- config (lib/leads/config.ts)
const SITE_HOST = "thegrounds.ae";
const SITE_URL = (process.env.SITE_URL || "https://thegrounds.ae").replace(/\/$/, "");
const PROJECT = { slug: "the-grounds-by-aldar", name: "The Grounds by Aldar" };
const DEFAULT_FROM = "The Grounds by Aldar <onboarding@resend.dev>";

function env(name, fallback = "") {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

function looksLikeFromAddress(value) {
  return /<[^@\s]+@[^@\s]+\.[^@\s>]+>/.test(value) || /[^@\s]+@[^@\s]+\.[^@\s]+/.test(value);
}

function isWrongResendFrom(value) {
  if (!looksLikeFromAddress(value)) return true;
  if (/your-verified-domain|example\.com|noreply@your\b/i.test(value)) return true;
  // Unverified project domain: send from Resend's default instead.
  if (/@thegrounds\.ae\b/i.test(value)) return true;
  return false;
}

// Inbox comes from Vercel env only (same variable names as offplanproject.ae).
// With Resend's sandbox From, it must be the Resend account login email.
function leadInbox() {
  return env("LEAD_TO_EMAIL") || env("LEAD_FORWARD_EMAIL") || env("CONTACT_INBOX");
}

function resendFrom() {
  const raw = env("RESEND_FROM") || env("RESEND_FROM_EMAIL");
  if (!raw || /@resend\.dev\b/i.test(raw) || isWrongResendFrom(raw)) return DEFAULT_FROM;
  return raw;
}

function resendFromKind() {
  return /@resend\.dev\b/i.test(resendFrom()) ? "sandbox" : "custom";
}

function supabaseUrl() {
  return env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL");
}

function supabaseSecret() {
  return env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
}

function isProdLike() {
  return process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "production";
}

// ---------------------------------------------------------------- rate limit + honeypot (lib/leads/rate-limit.ts)
const buckets = new Map();

function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { ok: true };
}

function isAnyHoneypotFilled(...values) {
  return values.some((v) => typeof v === "string" && v.trim().length > 0);
}

// ---------------------------------------------------------------- request context (lib/leads/request-context.ts)
const INVALID_GEO = new Set(["XX", "T1", "EU", "A1", "A2", "O1"]);
const IP_HASH_SALT = "villasuae.ae"; // same salt as offplanproject.ae so hashes are comparable

function header(req, name) {
  const v = req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v || null;
}

function firstForwardedIp(raw) {
  if (!raw) return null;
  const part = (raw.split(",")[0] || "").trim();
  if (!part || part === "unknown" || part === "local") return null;
  const bracket = part.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracket && bracket[1]) return bracket[1].slice(0, 64);
  return part.slice(0, 64);
}

function geoCode(raw) {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  if (!code || INVALID_GEO.has(code) || !/^[A-Z]{2}$/.test(code)) return null;
  return code;
}

function parseUserAgent(ua) {
  if (!ua) return { browser: null, os: null, device: null, deviceName: null };
  let device = "desktop";
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) device = "tablet";
  else if (/Mobi|iPhone|iPod|Android.+Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) device = "mobile";

  let os = null;
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/CrOS/i.test(ua)) os = "Chrome OS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = null;
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung Internet";
  else if (/Firefox|FxiOS/i.test(ua)) browser = "Firefox";
  else if (/Chrome|CriOS|Chromium/i.test(ua)) browser = "Chrome";
  else if (/Safari/i.test(ua)) browser = "Safari";

  let deviceName = null;
  if (/iPhone/i.test(ua)) deviceName = "iPhone";
  else if (/iPad/i.test(ua)) deviceName = "iPad";
  else if (/Macintosh|Mac OS X/i.test(ua)) deviceName = "Mac";

  return { browser, os, device, deviceName };
}

function parseRequestContext(req) {
  const ip =
    firstForwardedIp(header(req, "cf-connecting-ip")) ||
    firstForwardedIp(header(req, "x-real-ip")) ||
    firstForwardedIp(header(req, "x-vercel-forwarded-for")) ||
    firstForwardedIp(header(req, "x-forwarded-for"));
  const country = geoCode(header(req, "cf-ipcountry") || header(req, "x-vercel-ip-country") || header(req, "x-country-code"));
  const uaRaw = header(req, "user-agent");
  const parsed = parseUserAgent(uaRaw);
  return {
    ip,
    country,
    region: (header(req, "x-vercel-ip-country-region") || "").slice(0, 64) || null,
    city: (header(req, "x-vercel-ip-city") || "").slice(0, 80) || null,
    timezone: (header(req, "x-vercel-ip-timezone") || "").slice(0, 64) || null,
    browser: parsed.browser,
    os: parsed.os,
    device: parsed.device,
    device_name: parsed.deviceName,
    user_agent: uaRaw ? uaRaw.slice(0, 300) : null,
  };
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(`${IP_HASH_SALT}|${ip || "unknown"}`).digest("hex").slice(0, 16);
}

function formatCountryLabel(code) {
  if (!code) return "Not available";
  try {
    const name = new Intl.DisplayNames(["en-GB"], { type: "region" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

function formatDeviceLabel(client) {
  const kind = (client.device || "").trim() || null;
  const name = (client.device_name || "").trim() || null;
  if (name && kind) {
    if (name.toLowerCase() === kind.toLowerCase()) return kind;
    return `${name} · ${kind}`;
  }
  return name || kind || "Not available";
}

// ---------------------------------------------------------------- traffic (lib/leads/traffic.ts)
const INTERNAL_CHANNELS = new Set(["contact_form", "guide_download", "event_registration", "modal", "inline", "page"]);

function formatTrafficChannel(channel) {
  const trimmed = (channel || "").trim();
  if (!trimmed || trimmed === "—") return "unknown";
  if (INTERNAL_CHANNELS.has(trimmed.toLowerCase())) return "unknown";
  return trimmed.slice(0, 120);
}

// ---------------------------------------------------------------- email (lib/leads/email.ts)
function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sanitizeHeader(value, maxLen = 200) {
  return String(value).replace(/[\0\r\n]+/g, " ").trim().slice(0, maxLen);
}

function formatTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
}

function buildLeadFields(o) {
  return [
    { label: "Name", value: o.fullName },
    { label: "Email", value: o.email, href: `mailto:${o.email}` },
    { label: "Phone", value: o.phone, href: `tel:${o.phone}` },
    { label: "Client type", value: o.clientType || "" },
    { label: "Bedrooms looking", value: o.bedrooms || "" },
    { label: "Project", value: o.projectName },
    { label: "Message", value: o.message },
    { label: "Page URL", value: o.sourcePage, href: o.sourcePage.startsWith("http") ? o.sourcePage : undefined },
    { label: "Traffic channel", value: formatTrafficChannel(o.trafficChannel) },
    { label: "IP", value: hashIp(o.client.ip) },
    { label: "Country", value: formatCountryLabel(o.client.country) },
    { label: "Device", value: formatDeviceLabel(o.client) },
    { label: "Timestamp", value: formatTimestamp(o.submittedAt) },
  ];
}

function leadFieldRows(fields) {
  return fields
    .filter((f) => f.value.trim().length > 0)
    .map((f, i) => {
      const bg = i % 2 === 0 ? "#f9f6f0" : "#ffffff";
      const valueHtml = f.href
        ? `<a href="${escapeHtml(f.href)}" style="color:#0b2118;text-decoration:underline;word-break:break-all">${escapeHtml(f.value)}</a>`
        : `<span style="color:#1a2b24;word-break:break-word">${escapeHtml(f.value)}</span>`;
      return `
        <tr>
          <td style="padding:12px 16px;background:${bg};border-bottom:1px solid #ddd4c4;width:38%;vertical-align:top;font-family:Georgia,'Times New Roman',serif;font-size:13px;color:#5c6b62;letter-spacing:0.02em">
            ${escapeHtml(f.label)}
          </td>
          <td style="padding:12px 16px;background:${bg};border-bottom:1px solid #ddd4c4;vertical-align:top;font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#1a2b24">
            ${valueHtml}
          </td>
        </tr>`;
    })
    .join("");
}

function leadNotifyHtml({ headline, subhead, fields }) {
  const sub = subhead
    ? `<p style="margin:8px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.5;color:#efe6d4">${escapeHtml(subhead)}</p>`
    : "";
  const footer = "A sales advisor should follow up with this lead promptly. Do not send an automatic reply to the visitor.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(headline)}</title>
</head>
<body style="margin:0;padding:0;background:#f0ebe0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0ebe0;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #ddd4c4">
          <tr>
            <td style="background:#2d4a2d;padding:28px 28px 24px;border-bottom:3px solid #b8956a">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:500;color:#f9f6f0">${SITE_HOST}</p>
              <h1 style="margin:18px 0 0;font-family:Georgia,'Times New Roman',serif;font-weight:500;font-size:24px;line-height:1.25;color:#f9f6f0">
                ${escapeHtml(headline)}
              </h1>
              ${sub}
            </td>
          </tr>
          <tr>
            <td style="padding:0">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${leadFieldRows(fields)}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;background:#f9f6f0;border-top:1px solid #ddd4c4">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:13px;line-height:1.5;color:#5c6b62">
                ${escapeHtml(footer)}
              </p>
              <p style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:12px;color:#8b6f35">
                <a href="${escapeHtml(SITE_URL)}" style="color:#8b6f35;text-decoration:none">${escapeHtml(SITE_URL.replace(/^https?:\/\//, ""))}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function leadNotifyText(fields) {
  return fields
    .filter((f) => f.value.trim().length > 0)
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n");
}

function redactEmailPii(value) {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted]");
}

async function sendLeadNotifyEmail({ to, subject, html, text }) {
  const apiKey = env("RESEND_API_KEY");
  const from = resendFrom();
  const fromKind = resendFromKind();
  if (!apiKey || !to) {
    console.error("[thegrounds:email:leads] skipped: set RESEND_API_KEY and LEAD_TO_EMAIL on this Vercel environment; Salesforce still receives the lead", {
      hasKey: Boolean(apiKey),
      hasInbox: Boolean(to),
      subject: sanitizeHeader(subject),
    });
    return { status: "skipped_no_key" };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sanitizeHeader(from, 320),
      to: [sanitizeHeader(to, 320)],
      subject: sanitizeHeader(subject),
      html,
      text,
    }),
  });
  if (!response.ok) {
    const errBody = redactEmailPii(await response.text());
    const recipientRejected = /verify a domain|testing emails|own email address|you can only send testing emails/i.test(errBody);
    const sandboxHint =
      fromKind === "sandbox" && (response.status === 403 || recipientRejected)
        ? " Resend sandbox (onboarding@resend.dev) usually only delivers to the Resend account login email; set LEAD_TO_EMAIL to that address."
        : "";
    console.error("[thegrounds:email:leads] Resend rejected send", {
      status: response.status,
      fromKind,
      toDomain: to.split("@")[1] || "",
      body: errBody.slice(0, 400),
    });
    throw new Error((errBody.slice(0, 400) || `Resend send failed (${response.status})`) + sandboxHint);
  }
  console.info("[thegrounds:email:leads] notify sent", { fromKind });
  return { status: "sent" };
}

// ---------------------------------------------------------------- salesforce (lib/leads/salesforce.ts)
const WEB_TO_LEAD_URL = "https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8&orgId=00D8d000003VHZr";
const ORG_ID = "00D8d000003VHZr";
const RET_URL = "https://marketing.aredxb.com/thankyou.php";

function splitLeadName(fullName) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "Unknown" };
  if (parts.length === 1) return { first_name: "", last_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

async function submitSalesforceWebToLead({ fullName, email, phone, message, projectName, inquiryType }) {
  const { first_name, last_name } = splitLeadName(fullName);
  const body = new URLSearchParams({
    oid: ORG_ID,
    retURL: RET_URL,
    first_name,
    last_name,
    email,
    phone,
    inquirytype: (inquiryType || "").trim() || "SEO",
    "00N8d00000CuTOC": message,
    "00N8d00000Gasko": projectName, // form title
    "00N8d00000GYUyy": "Fresh Lead",
    "00N8d00000KNUyv": projectName, // project label
    lead_source: "Muhammad Asim",
    "00N8d00000QrrDh": "Assigned",
    "00N8d00000Qr8aK": "Primary",
    "00NTv000000P5XZ": "1",
  });
  const response = await fetch(WEB_TO_LEAD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
  // WebToLead returns HTML or a redirect; treat any non-error HTTP response as posted.
  if (response.status >= 400) throw new Error(`Salesforce WebToLead HTTP ${response.status}`);
  return true;
}

// ---------------------------------------------------------------- supabase (lib/leads/pipeline.ts)
async function supabaseInsert(table, row) {
  const response = await fetch(`${supabaseUrl().replace(/\/$/, "")}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: supabaseSecret(),
      Authorization: `Bearer ${supabaseSecret()}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(row),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text.slice(0, 400) || `Supabase ${table} insert failed`);
  }
}

// ---------------------------------------------------------------- persistLead (lib/leads/pipeline.ts)
async function persistLead(input) {
  const submittedAt = new Date().toISOString();
  const trafficChannel = formatTrafficChannel(input.trafficChannel);

  const leadMessage = [
    [
      `Project inquiry: ${PROJECT.name}`,
      `Slug: ${PROJECT.slug}`,
      `Site: ${SITE_URL}`,
      input.sourcePage ? `Page URL: ${input.sourcePage}` : "",
      input.clientType ? `Client type: ${input.clientType}` : "",
      `Traffic channel: ${trafficChannel}`,
      input.client.country ? `Country: ${input.client.country}` : "",
      `IP hash: ${hashIp(input.client.ip)}`,
    ]
      .filter(Boolean)
      .join("\n"),
    input.message,
  ].join("\n\n");

  const fields = buildLeadFields({
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    projectName: PROJECT.name,
    message: input.message,
    sourcePage: input.sourcePage,
    trafficChannel,
    clientType: input.clientType,
    client: input.client,
    submittedAt,
  });

  const via = [];

  if (supabaseUrl() && supabaseSecret()) {
    try {
      await supabaseInsert("leads", {
        email: input.email,
        full_name: input.fullName,
        phone: input.phone,
        source: "contact_form",
        message: leadMessage,
        status: "new",
      });
      via.push("supabase");
    } catch (err) {
      console.error("[thegrounds:supabase:leads]", err);
    }
  }

  const [emailResult, salesforceResult] = await Promise.allSettled([
    sendLeadNotifyEmail({
      to: leadInbox(),
      subject: `${PROJECT.name} - New Lead`,
      html: leadNotifyHtml({ headline: "New project inquiry", subhead: PROJECT.name, fields }),
      text: leadNotifyText(fields),
    }),
    submitSalesforceWebToLead({
      fullName: input.fullName,
      email: input.email,
      phone: input.phone,
      message: input.message,
      projectName: PROJECT.name,
      inquiryType: input.inquiryType,
    }),
  ]);

  let emailStatus = "failed";
  if (emailResult.status === "fulfilled") {
    emailStatus = emailResult.value.status;
    if (emailStatus === "sent") via.push("email");
  } else {
    console.error("[thegrounds:email:leads] notify failed", emailResult.reason);
  }

  if (salesforceResult.status === "fulfilled") {
    via.push("salesforce");
    console.info("[thegrounds:salesforce] web-to-lead posted");
  } else {
    console.error("[thegrounds:salesforce] web-to-lead failed", salesforceResult.reason);
  }

  console.info("[thegrounds:lead] persist complete", {
    project: PROJECT.slug,
    via: via.join("+") || "none",
    email: emailStatus,
    salesforce: salesforceResult.status === "fulfilled" ? "posted" : "failed",
  });

  if (!via.length) {
    if (!isProdLike()) return { via: "mock", email: emailStatus };
    // Same as offplanproject.ae: accept rather than fail the visitor when the only
    // remaining channel is an unconfirmed WebToLead attempt.
    console.error("[thegrounds:lead] no confirmed channel; accepted after email+Salesforce attempt", { email: emailStatus });
    return { via: "accepted", email: emailStatus };
  }
  return { via: via.join("+"), email: emailStatus };
}

// ---------------------------------------------------------------- route (app/api/leads/route.ts)
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const ip = firstForwardedIp(header(req, "x-forwarded-for")) || firstForwardedIp(header(req, "x-real-ip")) || "local";
  const limited = checkRateLimit(`thegrounds-lead:${ip}`, 8, 60_000);
  if (!limited.ok) {
    res.setHeader("Retry-After", String(limited.retryAfterSec));
    return res.status(429).json({
      ok: false,
      message: `Too many attempts. Retry in ${limited.retryAfterSec}s.`,
      retryAfterSec: limited.retryAfterSec,
    });
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = null;
    }
  }
  if (!body || typeof body !== "object") {
    return res.status(400).json({ ok: false, message: "Invalid request" });
  }

  if (isAnyHoneypotFilled(body.website, body.tu_hp_confirm)) {
    return res.status(200).json({ ok: true, message: "Thanks, we'll be in touch." });
  }

  const fullName = String(body.name ?? body.full_name ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 320);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const message = String(body.message ?? "").trim().slice(0, 5000);
  const sourcePage = String(body.source_page ?? body.page_url ?? body.page_path ?? "").trim().slice(0, 500);
  const trafficChannel = String(body.traffic_channel ?? body.channel ?? "").trim();
  const clientTypeRaw = String(body.client_type ?? body.clientType ?? "").trim();
  const clientType = ["Broker", "Buyer"].includes(clientTypeRaw) ? clientTypeRaw : null;
  const inquiryType = String(body.inquiry_type ?? body.inquiryType ?? body.inquirytype ?? "").trim();

  if (fullName.length < 2) return res.status(400).json({ ok: false, message: "Please enter your name." });
  if (!validEmail(email)) return res.status(400).json({ ok: false, message: "Please enter a valid email." });
  if (phone.replace(/\D/g, "").length < 8) {
    return res.status(400).json({ ok: false, message: "Please enter a valid phone number." });
  }

  try {
    const result = await persistLead({
      fullName,
      email,
      phone,
      message: message || `Register interest in ${PROJECT.name}.`,
      sourcePage: sourcePage || `${SITE_URL}/`,
      trafficChannel: trafficChannel || null,
      clientType,
      inquiryType: inquiryType || null,
      client: parseRequestContext(req),
    });
    return res.status(200).json({
      ok: true,
      message: "Thank you for your interest. A licensed advisor will be in touch with the details.",
      via: result.via,
      email: result.email,
    });
  } catch (err) {
    console.error("[thegrounds:api:leads]", err);
    return res.status(500).json({ ok: false, message: "Could not save your enquiry. Try again." });
  }
};
