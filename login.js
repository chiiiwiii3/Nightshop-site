import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-client.js";

const SHOP_VERSION = "nightshop-hall-33";

const form = document.querySelector("#login-form");
const note = document.querySelector("#status-note");
const strikeNote = document.querySelector("#strike-note");
const button = document.querySelector("#login-button");

// Everyone (signed in or not) sees the exterior. The built-in picture is the default;
// if the owner has published a replacement from the uploader, that one is used instead.
function loadPublishedExterior() {
  const image = document.querySelector("#exterior-artwork");
  if (!image) return;
  const { data } = supabase.storage.from("nightshop-artwork").getPublicUrl("exterior/current");
  const url = data.publicUrl + "?v=" + Math.floor(Date.now() / 60000);
  const probe = new Image();
  probe.onload = () => { image.src = url; };
  probe.src = url; // a 404 simply keeps the built-in picture
}

// The shadowman in the outside window: anyone (even locked out) can leave the owner a note.
const questionForm = document.querySelector("#question-form");
questionForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const status = document.querySelector("#question-status");
  const f = questionForm.elements, submit = questionForm.querySelector("button[type=submit]");
  submit.disabled = true; status.textContent = "Sending…";
  let error = null;
  try {
    const response = await fetch(SUPABASE_URL + "/functions/v1/help-request", {
      method: "POST", headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ name: f.name.value, contact: f.contact.value, message: f.message.value })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) error = { message: result.error || "" };
  } catch (e) { error = { message: "" }; }
  submit.disabled = false;
  if (error) {
    console.error("Help request failed:", error);
    status.textContent = /too many|fill in|too long/i.test(error.message || "") ? error.message : "Could not send that right now. Please try again later.";
    return;
  }
  status.textContent = "Sent. The owner will get back to you.";
  questionForm.reset();
});

// Join with an invite code + PIN (the owner makes these in Controls).
const joinSheet = document.querySelector("#join-sheet"), joinForm = document.querySelector("#join-form");
document.querySelector("#join-open")?.addEventListener("click", () => { joinSheet.hidden = false; });
document.querySelector("#join-close")?.addEventListener("click", () => { joinSheet.hidden = true; });
joinForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const status = document.querySelector("#join-status"), btn = document.querySelector("#join-button"), f = joinForm.elements;
  btn.disabled = true; status.textContent = "Creating your account…";
  try {
    const response = await fetch(SUPABASE_URL + "/functions/v1/redeem-invitation", {
      method: "POST", headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY },
      body: JSON.stringify({ code: f.code.value.trim(), pin: f.pin.value.trim(), username: f.username.value.trim(), password: f.password.value })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) { status.textContent = result.error || "That didn’t work. Check the code and PIN."; return; }
    const name = f.username.value.trim();
    joinForm.reset(); joinSheet.hidden = true;
    if (form) { form.elements.username.value = name; form.elements.password.focus(); }
    if (note) note.textContent = "Account created. Enter your password to come in.";
  } catch (e) { status.textContent = "Couldn’t reach the shop. Check your connection and try again."; }
  finally { btn.disabled = false; }
});

// signed out for being idle: say so once, in the hallway
try { if (sessionStorage.getItem("ns-idle")) { sessionStorage.removeItem("ns-idle"); if (note) note.textContent = "You were signed out after 5 minutes of inactivity. Sign in again."; } } catch { /* storage blocked */ }

// Red sign = closed. Members can still sign in (profile + bathroom only); ordering is switched off inside.
const artworkEl = document.querySelector("#exterior-artwork"), backdropEl = document.querySelector("#exterior-backdrop");
if (artworkEl && backdropEl) new MutationObserver(() => { backdropEl.src = artworkEl.src; }).observe(artworkEl, { attributes: true, attributeFilter: ["src"] });   // the blurred fill behind the picture follows it
function showClosedDoor(closed, message) {
  document.querySelector("#entry")?.classList.toggle("is-closed", Boolean(closed));   // red tint in the hallway too
  const hint = document.querySelector("#tap-hint");
  const lock = document.querySelector("#entry-lock");
  const scene = document.querySelector("#street-scene");
  if (scene) { scene.classList.toggle("door-closed", Boolean(closed)); scene.classList.toggle("door-open", !closed); }
  // the neon crown: blue when the lounge is open, red when it is closed
  const picture = document.querySelector("#exterior-artwork");
  if (picture) {
    const next = closed ? "./exterior-closed.jpg" : "./exterior-open.jpg";
    const probe = new Image();
    probe.onload = () => { picture.src = next; };
    probe.src = next;
  }
  if (hint) hint.textContent = closed ? "🔒 CLOSED · MEMBERS CAN STILL SIGN IN" : "TAP THE DOORS TO ENTER";
  if (lock) {
    lock.hidden = !closed;
    lock.textContent = message || "🔒 The shop is closed. Members can still sign in to check orders and message the shadow.";
  }
}
async function checkDoor() {
  try {
    // ask the server (it also applies the auto-close schedule); it can read the status even when signed out
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 5000);
      const response = await fetch(SUPABASE_URL + "/functions/v1/shop-clock", { method: "POST", headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY }, body: "{}", signal: ctl.signal });
      clearTimeout(timer);
      const result = await response.json().catch(() => ({}));
      if (response.ok && typeof result.is_open === "boolean") { showClosedDoor(!result.is_open); return; }
    } catch { /* fall back to a direct read */ }
    const { data, error } = await supabase.from("shop_status").select("is_open").eq("id", 1).maybeSingle();
    if (error || !data) return; // unknown: don't claim it's closed
    showClosedDoor(data.is_open === false);
  } catch (e) { /* ignore */ }
}
checkDoor();
window.addEventListener("nightshop-entry-open", checkDoor);
// keep the outside lights true while the app sits open: re-check every few seconds and whenever the app comes back to the screen
setInterval(() => { if (!document.hidden) checkDoor(); }, 8000);
for (const ev of ["visibilitychange", "focus", "pageshow", "online"]) window.addEventListener(ev, () => { if (!document.hidden) checkDoor(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) checkDoor(); });

let shopAttempts = 0;
async function enterShop() {
  const root = document.querySelector("#shop-app");
  if (!root) throw new Error("Shop container #shop-app is missing from the page.");
  // Load the shop FIRST. If it fails, the login box (and its message line) is still on screen,
  // so the person actually sees what went wrong instead of a blank page.
  const retry = shopAttempts++ ? "&retry=" + shopAttempts : "";
  await import("./shop.js?v=" + SHOP_VERSION + retry);
  document.body.classList.remove("entry-open");
  ["#entry", "#street-scene", ".crest", "header h1", ".subtitle"]
    .forEach(selector => document.querySelector(selector)?.classList.add("hidden"));
  root.style.display = "block";
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  button.disabled = true;
  note.textContent = "Checking credentials...";
  let stage = "sending login request";
  try {
    const response = await fetch(SUPABASE_URL + "/functions/v1/member-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        username: form.elements.username.value.trim(),
        password: form.elements.password.value
      })
    });

    stage = "reading login response";
    const result = await response.json();
    if (response.ok && result.session) {
      stage = "saving your login session";
      const { error } = await supabase.auth.setSession(result.session);
      if (error) throw error;
      strikeNote.textContent = "Strikes: 0 / 3";
      note.textContent = "Access granted. Opening the shop...";
      stage = "opening the shop";
      await enterShop();
      return;
    }

    strikeNote.textContent = "Strikes: " + Number(result.strikes || 0) + " / 3";
    if (result.locked) {
      note.textContent = "Locked out. Try again in about " +
        Math.ceil(Number(result.retry_after || 0) / 60) + " minute(s).";
    } else {
      note.textContent = result.error || "Sign-in failed.";
    }
  } catch (error) {
    if (error?.locked) {
      showClosedDoor(true, "🔒 " + error.message);
      note.textContent = "🔒 " + error.message;
      return;
    }
    console.error("Lu’s Lounge login error during " + stage + ":", error);
    note.textContent = stage === "opening the shop"
      ? "Your login worked, but the shop could not load. " + (error?.message || "")
      : "Problem while " + stage + ". " + (error?.message || "Please try again.");
  } finally {
    button.disabled = false;
  }
});

const { data: { session } } = await supabase.auth.getSession();
if (session) {
  try {
    await enterShop();
  } catch (error) {
    if (error?.locked) { showClosedDoor(true, "🔒 " + error.message); }
    else console.error("Lu’s Lounge session restore error:", error);
    if (!error?.locked && note) note.textContent = "Your session is saved, but the shop could not load. " + (error?.message || "");
  }
}
