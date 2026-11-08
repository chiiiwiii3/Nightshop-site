// @ts-nocheck
// Supabase Edge Function: shop-clock   (Verify JWT off; it checks the owner itself where needed)
// Auto-close schedule. Stored in the owner's app_metadata.shop_schedule:
//   { enabled, tz, days: { "0".."6": { on, time:"HH:MM" } } }   (0 = Sunday)
// { action: "tick" } (anyone; the app calls it on every status check): closes the shop if a closing time has passed since the
//   shop was last switched. If the owner opens it by hand AFTER the closing time, it stays open until the next closing time.
// { action: "get" } / { action: "save", schedule } : owner only.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function parts(ms, tz) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", weekday: "short" });
  const o = {}; for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: WD[o.weekday] };
}
function zonedToUtc(y, m, d, h, mi, tz) {
  const want = Date.UTC(y, m - 1, d, h, mi); let guess = want;
  for (let i = 0; i < 3; i++) { const p = parts(guess, tz); guess += want - Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi); }
  return guess;
}
function clean(s) {
  if (!s || typeof s !== "object") return null;
  let tz = String(s.tz || "America/New_York"); try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { return null; }
  const days = {};
  for (let i = 0; i < 7; i++) {
    const d = s.days?.[i] ?? s.days?.[String(i)] ?? {};
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(d.time)) ? String(d.time) : "22:00";
    days[i] = { on: d.on === true, time };
  }
  return { enabled: s.enabled === true, tz, days };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });
  const url = Deno.env.get("SUPABASE_URL") ?? "", serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return respond(500, { error: "Server setup incomplete" });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  let body = {}; try { body = await req.json(); } catch { /* tick with no body */ }

  const { data: ownerRow } = await admin.from("profiles").select("id").eq("is_owner", true).limit(1).maybeSingle();
  const { data: ownerUser } = ownerRow ? await admin.auth.admin.getUserById(ownerRow.id) : { data: null };
  const schedule = () => clean(ownerUser?.user?.app_metadata?.shop_schedule);

  async function tick() {
    const { data: st } = await admin.from("shop_status").select("is_open,updated_at").eq("id", 1).maybeSingle();
    if (!st) return { is_open: null };
    const sch = schedule();
    if (st.is_open && sch?.enabled) {
      const now = Date.now(), upd = Date.parse(st.updated_at), t = parts(now, sch.tz);
      for (const back of [0, 1]) {
        const base = new Date(Date.UTC(t.y, t.m - 1, t.d - back));
        const day = sch.days[(t.wd - back + 7) % 7];
        if (!day.on) continue;
        const [hh, mm] = day.time.split(":").map(Number);
        const closeAt = zonedToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hh, mm, sch.tz);
        if (now >= closeAt && upd < closeAt) {
          await admin.from("shop_status").update({ is_open: false, updated_at: new Date().toISOString() }).eq("id", 1);
          return { is_open: false, closed_by_schedule: true };
        }
      }
    }
    return { is_open: st.is_open };
  }

  if (body.action === "get" || body.action === "save") {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: who } = await admin.auth.getUser(token);
    if (!who?.user || !ownerRow || who.user.id !== ownerRow.id) return respond(403, { error: "Owner only." });
    if (body.action === "save") {
      const next = clean(body.schedule);
      if (!next) return respond(400, { error: "That schedule isn’t valid." });
      const { error } = await admin.auth.admin.updateUserById(ownerRow.id, { app_metadata: { ...(ownerUser.user.app_metadata || {}), shop_schedule: next } });
      if (error) return respond(500, { error: "Could not save the schedule." });
      ownerUser.user.app_metadata = { ...(ownerUser.user.app_metadata || {}), shop_schedule: next };
      const state = await tick();
      return respond(200, { success: true, schedule: next, ...state });
    }
    return respond(200, { success: true, schedule: schedule() });
  }
  return respond(200, { success: true, ...(await tick()) });
});
