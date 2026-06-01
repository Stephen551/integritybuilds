/* ============================================================
 * functions/api/admin/backup.js
 * ------------------------------------------------------------
 * Manual / cron-triggered backup of the D1 intakes table to R2.
 *
 * Auth: requires `Authorization: Bearer ${env.BACKUP_TOKEN}`.
 * The token is set in the Cloudflare dashboard (Pages → Settings
 * → Environment variables → Production). Without the token, the
 * endpoint returns 401. No anonymous access ever.
 *
 * Bindings required (set in dashboard):
 *   env.DB             - the D1 database (already bound)
 *   env.BACKUPS        - R2 bucket (create + bind as `BACKUPS`)
 *   env.BACKUP_TOKEN   - shared secret for the cron call
 *
 * Usage:
 *   curl -H "Authorization: Bearer $TOKEN" https://integritybuilds.dev/api/admin/backup
 *
 * Schedule it however you like:
 *   - Cloudflare Worker Cron Trigger (a tiny separate Worker that
 *     fetches this URL with the token, runs weekly)
 *   - GitHub Actions schedule
 *   - cron-job.org or similar
 *   - Manually, occasionally, by hand
 * ============================================================ */

export async function onRequestGet({ request, env }) {
  // Auth gate. Constant-time compare so a timing attack can't probe.
  const auth = request.headers.get("Authorization") || "";
  const expected = `Bearer ${env.BACKUP_TOKEN || ""}`;
  if (!env.BACKUP_TOKEN || !timingSafeEqual(auth, expected)) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  if (!env.BACKUPS) {
    return json({ ok: false, error: "R2 bucket not bound. Bind BACKUPS in the Pages dashboard." }, 500);
  }

  let rows;
  try {
    const res = await env.DB.prepare(
      "SELECT id, created_at, name, email, project_type, project_brief, slot_1, slot_2, timezone, referrer, ip, user_agent, status, notes FROM intakes ORDER BY id ASC"
    ).all();
    rows = res?.results || [];
  } catch (err) {
    return json({ ok: false, error: `D1 read failed: ${String(err?.message || err)}` }, 500);
  }

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const key = `intakes/${now.getUTCFullYear()}/${stamp}.jsonl`;

  // Newline-delimited JSON. Each row on its own line so partial reads
  // are still usable and grep/jq works without a parse over everything.
  const body = rows.map((r) => JSON.stringify(r)).join("\n") + "\n";

  try {
    await env.BACKUPS.put(key, body, {
      httpMetadata: { contentType: "application/x-ndjson" },
      customMetadata: { rowCount: String(rows.length), generatedAt: now.toISOString() },
    });
  } catch (err) {
    return json({ ok: false, error: `R2 write failed: ${String(err?.message || err)}` }, 500);
  }

  return json({ ok: true, key, rowCount: rows.length, generatedAt: now.toISOString() });
}

/* ---------- helpers ---------- */

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// Constant-time string compare. Prevents timing-based discovery of the
// shared secret. Both sides are padded to the longer length so the
// comparison loop always runs the same number of iterations.
function timingSafeEqual(a, b) {
  const aBuf = new TextEncoder().encode(String(a));
  const bBuf = new TextEncoder().encode(String(b));
  const len = Math.max(aBuf.length, bBuf.length);
  let mismatch = aBuf.length ^ bBuf.length;
  for (let i = 0; i < len; i++) {
    mismatch |= (aBuf[i] ?? 0) ^ (bBuf[i] ?? 0);
  }
  return mismatch === 0;
}
