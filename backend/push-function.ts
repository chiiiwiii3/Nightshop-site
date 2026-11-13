// @ts-nocheck
// Supabase Edge Function: push   (deploy with "Verify JWT" OFF; it checks its own secret instead)
// Sends generic lock-screen alerts to subscribed phones. Needs these function secrets:
//   PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const DONE = "✅ DONE";
const TAG = /\s*\[order:([\w-]+)\]\s*$/;
const lines = (reply) => String(reply || "").split("\n").map((l) => l.trim()).filter((l) => l && l !== DONE);
const hasDone = (reply) => String(reply || "").split("\n").some((l) => l.trim() === DONE);
const tagOf = (m) => { const h = TAG.exec(String(m?.message || "")); return h ? h[1] : null; };

// Decide who gets what. Texts are deliberately generic: lock screens can be seen by other people.
export function plan(table, type, rec, old) {
  const out = [];
  const GENERIC = "Go to the lounge";                                    // every alert says the same thing: nothing private on a lock screen
  const push = (to, body, go, tag) => out.push({ to, payload: { title: "Lu’s Lounge", body: GENERIC, go, tag } });
  if (!rec) return out;
  if (table === "orders") {
    if (type === "INSERT") push("owners", "New order 🛎️", "o-order:" + rec.id, "order-" + rec.id);
    if (type === "UPDATE" && old && old.status !== rec.status && rec.customer_id) {
      const s = String(rec.status || "").toLowerCase();
      const text = { confirmed: "Your order is confirmed ✅", denied: "Your order was declined", waitlisted: "Your order is on the waitlist ⏳", done: "Your order is complete ✅" }[s];
      if (text) push(rec.customer_id, text, (s === "denied" || s === "done" ? "history:" : "order:") + rec.id, "order-" + rec.id);
    }
  }
  if (table === "memos" && type === "INSERT") push("members", "New memo", "memo:" + rec.id, "memo-" + rec.id);   // the memo board: everyone gets the same short alert
  if (table === "messages") {
    const orderId = tagOf(rec);
    if (type === "INSERT") {
      if (orderId) { if (!String(rec.message).startsWith("🧾")) push("owners", "New note on an order", "o-order:" + orderId, "thread-" + orderId); }
      else push("owners", "New message 💬", "o-msg:" + rec.id, "msg-" + rec.id);
    }
    if (type === "UPDATE" && old && rec.customer_id) {
      const before = lines(old.reply).join("\n"), after = lines(rec.reply).join("\n");
      const newDone = hasDone(rec.reply) && !hasDone(old.reply);
      if (after && after !== before && !(newDone && !orderId)) {
        push(rec.customer_id, orderId ? "The shadow replied about your order" : "The shadow replied 💬", orderId ? "order:" + orderId : "msg:" + rec.id, "reply-" + (orderId || rec.id));
      }
      if (newDone && orderId) push(rec.customer_id, "Your order is complete ✅", "history:" + orderId, "order-" + orderId);
    }
  }
  return out;
}

export async function handle(req, env, makeClient, sender) {
  if (req.headers.get("x-push-secret") !== env.PUSH_SECRET || !env.PUSH_SECRET) return new Response("forbidden", { status: 403 });
  const body = await req.json();
  const jobs = plan(body.table, body.type, body.record, body.old_record);
  if (!jobs.length) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  const db = makeClient();
  let sent = 0;
  for (const job of jobs) {
    let ids;
    if (job.to === "owners") {
      const { data } = await db.from("profiles").select("id").eq("is_owner", true);
      ids = (data || []).map((p) => p.id);
    } else if (job.to === "members") {
      const { data } = await db.from("profiles").select("id").eq("is_owner", false).eq("access_enabled", true);
      ids = (data || []).map((p) => p.id);
    } else ids = [job.to];
    if (!ids.length) continue;
    const { data: subs } = await db.from("push_subscriptions").select("endpoint,p256dh_key,auth_key").in("user_id", ids);
    for (const s of subs || []) {
      try {
        await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh_key, auth: s.auth_key } }, JSON.stringify(job.payload));
        sent++;
      } catch (e) {
        if (e && (e.statusCode === 404 || e.statusCode === 410)) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        else console.error("push failed", e && e.statusCode, e && e.body);
      }
    }
  }
  return new Response(JSON.stringify({ sent }), { status: 200 });
}

if (typeof Deno !== "undefined" && Deno.serve && !globalThis.__NIGHTSHOP_TEST) {
  const env = { PUSH_SECRET: Deno.env.get("PUSH_SECRET") };
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:owner@example.com", Deno.env.get("VAPID_PUBLIC_KEY"), Deno.env.get("VAPID_PRIVATE_KEY"));
  Deno.serve((req) => handle(req, env,
    () => createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
    (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600, urgency: "high" })));
}
