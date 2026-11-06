import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-client.js";

const SHOP_VERSION = "nightshop-room3d-2";

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
loadPublishedExterior();

// The bathroom door: a private question to the owner (members only).
const questionForm = document.querySelector("#question-form");
questionForm?.addEventListener("submit", async event => {
  event.preventDefault();
  const status = document.querySelector("#question-status");
  const text = questionForm.elements.message.value.trim();
  if (!text) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    status.textContent = "Sign in through the front door first, then send your question.";
    return;
  }
  const { error } = await supabase.from("messages").insert({ customer_id: session.user.id, message: text });
  if (error) {
    console.error("Private question failed:", error);
    status.textContent = "Message could not be sent.";
    return;
  }
  status.textContent = "Sent privately.";
  questionForm.reset();
});

// Red sign = closed. Members can still sign in (profile + bathroom only); ordering is switched off inside.
function showClosedDoor(closed, message) {
  const hint = document.querySelector("#tap-hint");
  const lock = document.querySelector("#entry-lock");
  const scene = document.querySelector("#street-scene");
  if (scene) { scene.classList.toggle("door-closed", Boolean(closed)); scene.classList.toggle("door-open", !closed); }
  if (hint) hint.textContent = closed ? "🔒 CLOSED · MEMBERS CAN STILL SIGN IN" : "TAP THE DOORS TO ENTER";
  if (lock) {
    lock.hidden = !closed;
    lock.textContent = message || "🔒 The shop is closed. Members can still sign in to check orders and message the shadow.";
  }
}
async function checkDoor() {
  try {
    const { data, error } = await supabase.from("shop_status").select("is_open").eq("id", 1).maybeSingle();
    if (error || !data) return; // unknown: don't claim it's closed
    showClosedDoor(data.is_open === false);
  } catch (e) { /* ignore */ }
}
checkDoor();
window.addEventListener("nightshop-entry-open", checkDoor);

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
