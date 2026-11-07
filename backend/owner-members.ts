// @ts-nocheck
// Supabase Edge Function: owner-members   (deploy with "Verify JWT" OFF; it checks the caller itself)
// Owner-only. Two actions:
//   { action: "invite" }                              -> one-time code + PIN (valid 7 days, one use). The person redeems it on the join screen.
//   { action: "create", username, password }          -> makes the account right now (owner picks the username and a temporary password).
// Needs the same secrets the other functions already use: NIGHTSHOP_BOOTSTRAP_SECRET (+ the built-in SUPABASE_* ones).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const respond = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function digest(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
  return Array.from(sig, b => b.toString(16).padStart(2, "0")).join("");
}
const randomFrom = (alphabet, n) => Array.from(crypto.getRandomValues(new Uint32Array(n)), v => alphabet[v % alphabet.length]).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });

  const secret = Deno.env.get("NIGHTSHOP_BOOTSTRAP_SECRET") ?? "";
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!secret || !url || !serviceKey) return respond(500, { error: "Server setup incomplete" });

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: who, error: whoError } = await admin.auth.getUser(token);
  if (whoError || !who?.user) return respond(401, { error: "Please sign in again." });
  const { data: me } = await admin.from("profiles").select("is_owner").eq("id", who.user.id).maybeSingle();
  if (!me?.is_owner) return respond(403, { error: "Owner only." });

  let body;
  try { body = await req.json(); } catch { return respond(400, { error: "Invalid request" }); }

  if (body.action === "invite") {
    const code = randomFrom("ABCDEFGHJKMNPQRSTUVWXYZ23456789", 10);
    const pin = randomFrom("0123456789", 6);
    const { error } = await admin.from("invitations").insert({
      code_hash: await digest(code, secret), pin_hash: await digest(pin, secret),
      created_by: who.user.id, max_uses: 1, expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    });
    if (error) return respond(500, { error: "Could not make an invite." });
    return respond(200, { success: true, code, pin });
  }

  if (body.action === "create") {
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!/^[A-Za-z0-9_.-]{3,24}$/.test(username)) return respond(400, { error: "Username must be 3–24 letters, numbers, dots, dashes, or underscores." });
    if (password.length < 12 || password.length > 128) return respond(400, { error: "Password must be 12–128 characters." });
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: username.toLowerCase() + "@accounts.thenightshop.invalid", password, email_confirm: true, user_metadata: { display_name: username },
    });
    if (createError || !created?.user) return respond(400, { error: "Could not create that account. Try a different username." });
    const { error: profileError } = await admin.from("profiles").insert({ id: created.user.id, username, display_name: username, is_owner: false, access_enabled: true });
    if (profileError) { await admin.auth.admin.deleteUser(created.user.id); return respond(500, { error: "Account setup failed." }); }
    return respond(200, { success: true, message: "Account created for " + username + "." });
  }

  return respond(400, { error: "Unknown action" });
});
