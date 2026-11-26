// Vercel serverless function: POST /api/leads
// Same lead pipeline as offplanproject.ae: Salesforce Web-to-Lead (always),
// Resend notification email (when RESEND_API_KEY is set), Supabase row (when
// SUPABASE_URL + SUPABASE_SECRET_KEY are set). No dependencies.

const SITE_URL = "https://thegrounds.ae";
const PROJECT_NAME = "The Grounds by Aldar";

const SF_URL =
  "https://webto.salesforce.com/servlet/servlet.WebToLead?encoding=UTF-8&orgId=00D8d000003VHZr";
const SF_ORG_ID = "00D8d000003VHZr";
const SF_RET_URL = "https://marketing.aredxb.com/thankyou.php";

const DEFAULT_LEAD_INBOX = "muhammad.asim@allegiance.ae";
const DEFAULT_FROM = "The Grounds <onboarding@resend.dev>";

const hits = new Map(); // best-effort, per warm instance

function env(name) {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : "";
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 8;
}

function splitName(full) {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: "", last_name: "Unknown" };
  if (parts.length === 1) return { first_name: "", last_name: parts[0] };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendSalesforce(lead) {
  const { first_name, last_name } = splitName(lead.name);
  const body = new URLSearchParams({
    oid: SF_ORG_ID,
    retURL: SF_RET_URL,
    first_name,
    last_name,
    email: lead.email,
    phone: lead.phone,
    inquirytype: "SEO",
    "00N8d00000CuTOC": lead.salesforceMessage,
    "00N8d00000Gasko": PROJECT_NAME,
    "00N8d00000GYUyy": "Fresh Lead",
    "00N8d00000KNUyv": PROJECT_NAME,
    lead_source: "Muhammad Asim",
    "00N8d00000QrrDh": "Assigned",
    "00N8d00000Qr8aK": "Primary",
    "00NTv000000P5XZ": "1",
  });
  const res = await fetch(SF_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    redirect: "manual",
  });
  if (res.status >= 400) throw new Error(`Salesforce HTTP ${res.status}`);
  return true;
}

async function sendEmail(lead, fields) {
  const key = env("RESEND_API_KEY");
  if (!key) return "skipped_no_key";
  const rows = fields
    .map(
      ([k, v]) =>
        `<tr><td style="padding:8px 12px;color:#5c6b62;border-bottom:1px solid #ddd4c4">${escapeHtml(k)}</td>` +
        `<td style="padding:8px 12px;color:#1a2b24;border-bottom:1px solid #ddd4c4">${escapeHtml(v)}</td></tr>`,
    )
    .join("");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("RESEND_FROM") || DEFAULT_FROM,
      to: [env("LEAD_TO_EMAIL") || DEFAULT_LEAD_INBOX],
      reply_to: lead.email,
      subject: `${PROJECT_NAME} - New Lead`,
      html: `<h2 style="font-family:Georgia,serif">New enquiry: ${PROJECT_NAME}</h2><table style="border-collapse:collapse;font-family:Georgia,serif">${rows}</table>`,
      text: fields.map(([k, v]) => `${k}: ${v}`).join("\n"),
    }),
  });
  if (!res.ok) throw new Error(`Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return "sent";
}

async function saveSupabase(lead) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return "skipped";
  const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/leads`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      email: lead.email,
      full_name: lead.name,
      phone: lead.phone,
      source: "thegrounds.ae",
      message: lead.salesforceMessage,
      status: "new",
    }),
  });
  if (!res.ok) throw new Error(`Supabase HTTP ${res.status}`);
  return "saved";
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  const ip = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() || "local";
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, message: "Too many attempts. Try again in a minute." });
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
    return res.status(400).json({ ok: false, message: "Invalid request." });
  }

  // Honeypot: bots fill hidden fields. Pretend success, send nothing.
  if (String(body.website || "").trim()) {
    return res.status(200).json({ ok: true });
  }

  const name = String(body.name || "").trim().slice(0, 120);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 200);
  const phone = String(body.phone || "").trim().slice(0, 40);
  const role = body.role === "broker" ? "broker" : "buyer";
  const message = String(body.message || "").trim().slice(0, 3000);
  const page = String(body.page || "").trim().slice(0, 300);

  if (name.length < 2) return res.status(400).json({ ok: false, message: "Please enter your full name." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, message: "Please enter a valid email address." });
  }
  if (phone.replace(/\D/g, "").length < 8) {
    return res.status(400).json({ ok: false, message: "Please enter a valid phone number." });
  }

  const country = String(req.headers["x-vercel-ip-country"] || "");
  const submittedAt = new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" });
  const header = [
    `Project inquiry: ${PROJECT_NAME}`,
    `Site: ${SITE_URL}`,
    page ? `Page URL: ${SITE_URL}${page.startsWith("/") ? page : "/" + page}` : "",
    `Client type: ${role}`,
    country ? `Country: ${country}` : "",
  ].filter(Boolean);
  const salesforceMessage = `${header.join("\n")}\n\n${message || `Register interest in ${PROJECT_NAME}.`}`;

  const lead = { name, email, phone, role, message, page, salesforceMessage };
  const fields = [
    ["Name", name],
    ["Email", email],
    ["Phone", phone],
    ["I am a", role],
    ["Page", page || "/"],
    ["Country", country],
    ["Submitted", `${submittedAt} (Dubai)`],
    ["Message", message],
  ].filter(([, v]) => v);

  const [sf, mail, db] = await Promise.allSettled([sendSalesforce(lead), sendEmail(lead, fields), saveSupabase(lead)]);
  const via = [];
  if (sf.status === "fulfilled") via.push("salesforce");
  else console.error("[thegrounds:leads:salesforce]", sf.reason);
  if (mail.status === "fulfilled" && mail.value === "sent") via.push("email");
  else if (mail.status === "rejected") console.error("[thegrounds:leads:email]", mail.reason);
  else console.warn("[thegrounds:leads:email] RESEND_API_KEY not set; no inbox email");
  if (db.status === "fulfilled" && db.value === "saved") via.push("supabase");
  else if (db.status === "rejected") console.error("[thegrounds:leads:supabase]", db.reason);

  if (via.length === 0) {
    return res.status(502).json({ ok: false, message: "We could not save your details. Please try again." });
  }
  return res.status(200).json({ ok: true, via });
};
