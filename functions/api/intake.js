/* ============================================================
 * functions/api/intake.js
 * ------------------------------------------------------------
 * Cloudflare Pages Function. Handles form POST from the
 * contact section, writes to D1, sends an email to Stephen.
 *
 * Bindings (configured in wrangler.jsonc + Cloudflare dashboard):
 *   env.DB                 - D1 database (integritybuilds-intakes)
 *   env.INTAKE_TO_EMAIL    - destination for the notification email
 *   env.INTAKE_FROM_EMAIL  - sender (must be a verified Resend domain)
 *   env.INTAKE_FROM_NAME   - friendly sender name
 *   env.RESEND_API_KEY     - Resend API key (secret, dashboard only)
 *   env.INTAKE_IP_SALT     - salt for SHA-256 hashing visitor IPs
 *
 * Bot protection: honeypot field (`website`) in the form. Bots fill
 * every input they find; humans never see the hidden field. Any POST
 * with a non-empty `website` value gets silently dropped (200 fake
 * success so the bot moves on, no D1 write, no email). Combined with
 * the Cloudflare WAF rate-limit rule on /api/intake, this catches the
 * volume of automated spam an intake form like this actually attracts.
 *
 * Email transport: Resend (resend.com). Higher deliverability than
 * MailChannels and shares the same account that powers acmeridian.co.
 * The sender domain (integritybuilds.dev) must be verified in the
 * Resend dashboard before sends will succeed.
 * ============================================================ */

export async function onRequestPost({ request, env }) {
  // Each request gets a stable correlation id we can grep for across
  // `wrangler pages deployment tail` lines. Logged on every emit.
  const reqId = crypto.randomUUID().slice(0, 8);
  const logCtx = { reqId, route: "intake" };

  // Parse + minimally validate the payload. Keep messages plain
  // so visitors can read them. No stack traces leaked.
  let body;
  try {
    body = await request.json();
  } catch {
    log("warn", { ...logCtx, event: "parse_failed" });
    return json({ ok: false, error: "Invalid request format." }, 400);
  }

  // Honeypot. The form ships a hidden `website` input that real users
  // never see (positioned off-screen, aria-hidden, tabindex=-1, no
  // autocomplete). Bots fill every field they parse. If we see anything
  // in this field, the request is a bot. Return a 200 fake-success so
  // the bot doesn't probe further or retry. No D1 write. No email.
  if (body.website && String(body.website).trim().length > 0) {
    log("warn", { ...logCtx, event: "honeypot_triggered", hp_len: String(body.website).length });
    return json({ ok: true, id: 0 });
  }

  const required = ["name", "email", "project_brief", "slot_1"];
  for (const key of required) {
    if (!body[key] || String(body[key]).trim().length === 0) {
      log("warn", { ...logCtx, event: "validation_failed", field: key });
      return json({ ok: false, error: `Missing required field: ${key.replace(/_/g, " ")}.` }, 400);
    }
  }
  if (!isValidEmail(body.email)) {
    log("warn", { ...logCtx, event: "validation_failed", field: "email" });
    return json({ ok: false, error: "That email doesn't look right. Double-check?" }, 400);
  }
  // Hard caps so a single submission can't dump megabytes into D1.
  if (String(body.project_brief).length > 4000) {
    log("warn", { ...logCtx, event: "validation_failed", field: "project_brief_length" });
    return json({ ok: false, error: "Project brief is too long (4000 chars max)." }, 400);
  }
  if (String(body.name).length > 200) {
    log("warn", { ...logCtx, event: "validation_failed", field: "name_length" });
    return json({ ok: false, error: "Name field is too long." }, 400);
  }

  // Pull request context for spam analysis / future admin filtering.
  // IPs are hashed (SHA-256 with a per-deploy salt) before storage so a
  // database leak does not expose visitor identities. We can still detect
  // repeat submissions from the same IP because the hash is stable for
  // a given salt; we just can't reverse it back to a real address. The
  // salt lives in env.INTAKE_IP_SALT (set in the Cloudflare dashboard).
  // Same treatment as the A&C Meridian admin uses.
  const rawIp = request.headers.get("CF-Connecting-IP") || "";
  const ip = rawIp ? await hashIp(rawIp, env.INTAKE_IP_SALT || "ib-dev-default-salt-rotate-me") : "";
  const userAgent = request.headers.get("User-Agent") || "";
  const referrer = body.referrer || request.headers.get("Referer") || "";

  // Write to D1. The default values from the schema take care of
  // created_at and status.
  let intakeId;
  try {
    const result = await env.DB.prepare(
      `INSERT INTO intakes
         (name, email, project_type, project_brief, slot_1, slot_2, timezone, referrer, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        String(body.name).trim(),
        String(body.email).trim().toLowerCase(),
        body.project_type || null,
        String(body.project_brief).trim(),
        String(body.slot_1).trim(),
        body.slot_2 ? String(body.slot_2).trim() : null,
        body.timezone || null,
        referrer || null,
        ip || null,
        userAgent || null
      )
      .run();
    intakeId = result.meta?.last_row_id;
  } catch (err) {
    // Hard fail: we can't lose a lead silently. Log structured + return
    // an honest error. The visitor sees a recovery email line in the
    // form error UX so the lead can still reach me out-of-band.
    log("error", { ...logCtx, event: "d1_insert_failed", error: String(err?.message || err) });
    return json({ ok: false, error: "Something went wrong saving your message. Please email stephenalatriste@integritybuilds.dev directly." }, 500);
  }

  log("info", { ...logCtx, event: "intake_saved", intakeId, project_type: body.project_type || "unspecified" });

  // Send the notification email. Failure here is non-blocking: the
  // row is already in D1 so the lead isn't lost even if email
  // delivery hiccups. We log the failure but still return success.
  try {
    await sendEmail({
      to: env.INTAKE_TO_EMAIL,
      fromEmail: env.INTAKE_FROM_EMAIL,
      fromName: env.INTAKE_FROM_NAME,
      apiKey: env.RESEND_API_KEY,
      replyTo: body.email,
      subject: `[IntegrityBuilds] New intake from ${body.name}`,
      text: formatIntakeEmail({ ...body, ip, userAgent, referrer, intakeId }),
    });
    log("info", { ...logCtx, event: "email_sent", intakeId });
  } catch (err) {
    log("error", { ...logCtx, event: "email_failed", intakeId, error: String(err?.message || err) });
  }

  return json({ ok: true, id: intakeId });
}

// CORS preflight scoped to integritybuilds.dev. Allowing arbitrary
// origins (`*`) lets any site embed this form and harvest submissions
// into our inbox, which is exactly what we don't want. Local dev still
// works because wrangler pages dev hits the function directly without
// triggering a cross-origin preflight.
const ALLOWED_ORIGINS = new Set([
  "https://integritybuilds.dev",
  "https://www.integritybuilds.dev",
]);

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  if (ALLOWED_ORIGINS.has(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
  }
  return { "Vary": "Origin" };
}

export function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/* ---------- helpers ---------- */

// Structured JSON log. `wrangler pages deployment tail` shows these
// inline; piping through jq makes them queryable. Cloudflare's
// observability tab also indexes them automatically. Keeps us out of
// a third-party log SaaS at this scale.
function log(level, fields) {
  const line = JSON.stringify({ level, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isValidEmail(value) {
  // Pragmatic, not RFC-perfect. Catches the common typos.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
}

// SHA-256 hex digest of `salt + ip`. Web Crypto, no deps. Stable for
// a given salt: same IP always produces the same hash, so repeat
// submissions from the same visitor can be grouped without ever
// storing the address itself.
async function hashIp(ip, salt) {
  const data = new TextEncoder().encode(String(salt) + ":" + String(ip));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function formatIntakeEmail({ name, email, project_type, project_brief, slot_1, slot_2, timezone, referrer, ip, userAgent, intakeId }) {
  // Plain-text email. No HTML, which keeps spam filters happy and
  // renders cleanly in any client including terminal-based ones.
  const lines = [
    `Intake #${intakeId} on IntegrityBuilds`,
    "",
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Project: ${project_type || "(not specified)"}`,
    "",
    "Brief:",
    String(project_brief).split("\n").map((l) => "  " + l).join("\n"),
    "",
    "Preferred times:",
    `  1. ${slot_1}${timezone ? ` (${timezone})` : ""}`,
    slot_2 ? `  2. ${slot_2}${timezone ? ` (${timezone})` : ""}` : "  (no second preference given)",
    "",
    "Context:",
    `  Referrer:  ${referrer || "(direct)"}`,
    `  IP:        ${ip || "(unknown)"}`,
    `  UA:        ${userAgent || "(unknown)"}`,
    "",
    `Reply directly. This email's reply-to is set to ${email}.`,
  ];
  return lines.join("\n");
}

// Send a transactional email via Resend. Higher deliverability than
// MailChannels and uses the same vendor that powers acmeridian.co's
// notifications, so it shares Stephen's mental model. The sender
// domain (integritybuilds.dev) must be verified in the Resend dashboard
// before sends will succeed; until then this throws and the row stays
// in D1 (which is what we want; never lose a lead silently).
async function sendEmail({ to, fromEmail, fromName, replyTo, subject, text, apiKey }) {
  if (!apiKey) {
    throw new Error("RESEND_API_KEY not configured");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      reply_to: replyTo,
      subject,
      text,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${errText.slice(0, 200)}`);
  }
}
