import { supabase } from "./supabase-client.js";

const root = document.querySelector("#shop-app");
const { data: { user } } = await supabase.auth.getUser();
if (!user || !root) throw new Error("Member session unavailable");

const { data: profile, error: profileError } = await supabase.from("profiles")
  .select("display_name,is_owner,access_enabled").eq("id", user.id).single();
if (profileError || !profile) {
  console.error("Profile load failed:", profileError);
  throw new Error("Could not load your member profile. Ask the owner to check your account.");
}
if (!profile.access_enabled) {
  await supabase.auth.signOut();
  throw new Error("Your membership is not active. Please contact the owner.");
}
const isOwner = Boolean(profile.is_owner);

/* ---------- helpers ---------- */
const $ = selector => root.querySelector(selector);
const $$ = selector => [...root.querySelectorAll(selector)];
const safe = value => { const el = document.createElement("span"); el.textContent = value ?? ""; return el.innerHTML; };
const money = value => "$" + Number(value || 0).toFixed(2);
const when = value => new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const cls = value => String(value || "").replace(/[^a-z]/gi, "").toLowerCase();
const STATUS_LABEL = { pending: "Waiting", confirmed: "Confirmed ✅", denied: "Denied", waitlisted: "Waitlist ⏳" };
const statusLabel = status => STATUS_LABEL[cls(status)] || safe(status);

function toast(text, kind = "info") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = text;
  $("#toasts")?.append(el);
  try { navigator.vibrate?.(kind === "alert" ? [120, 60, 120] : 50); } catch { /* not supported */ }
  setTimeout(() => el.remove(), 7000);
}

/* ---------- the menu: three floating holograms ---------- */
const ITEMS = [
  { id: "ice",  icon: "❄️", name: "Honeydrippers", detail: "Frozen Kool-Aid ice cups with candy and/or fruit", kind: "amount", color: "blue",   art: "./art/holo-ice.jpg",  spot: { l: 61.5, t: 28, w: 10, h: 29 } },
  { id: "tea",  icon: "🌴", name: "Herbal teas",   detail: "Small or Big · choose a bundle",                    kind: "tea",    color: "green",  art: "./art/holo-tea.jpg",  spot: { l: 73.0, t: 28, w: 10, h: 29 } },
  { id: "shot", icon: "⚕️", name: "Herbal shots",  detail: "Small or Medium · priced per shot glass",           kind: "shot",   color: "purple", art: "./art/holo-shot.jpg", spot: { l: 84.5, t: 26, w: 11.5, h: 31 } }
];
const COLORS = { blue: "#3ec6ff", green: "#38ff7a", purple: "#b36bff" };

const ownerMarkup = isOwner ? `
  <section class="panel owner-panel" id="owner-panel">
    <h2>OWNER CONTROLS</h2>
    <button id="toggle-shop" class="lights-btn" type="button">💡 LIGHTS</button>
    <p class="muted small">Blue lights = shop open. Red lights = shop closed. Members see the change within seconds.</p>
    <h3>INCOMING ORDERS</h3>
    <div id="owner-orders" class="stack">Loading…</div>
    <h3>CUSTOMER MESSAGES</h3>
    <div id="owner-messages" class="stack">Loading…</div>
    <h3>EXTERIOR ARTWORK</h3>
    <p class="muted small">Replace the storefront picture from your phone Gallery. JPG, PNG, or WebP · up to 15 MB.</p>
    <input id="exterior-upload" type="file" accept="image/jpeg,image/png,image/webp">
    <p id="exterior-upload-status" aria-live="polite"></p>
  </section>` : "";

root.innerHTML = `
<div class="nsx">
  <header class="nsx-top">
    <div class="nsx-brand"><span class="nsx-crest">♛</span><div><h1>THE NIGHT SHOP</h1><p>Welcome in, ${safe(profile.display_name || "member")}</p></div></div>
    <div class="nsx-actions"><span id="shop-pill" class="pill">Checking…</span><button id="sign-out" class="ghost" type="button">Sign out</button></div>
  </header>

  <section class="lounge" aria-label="The Night Shop lounge">
    <div class="lounge-viewport" id="lounge-viewport">
      <div class="lounge-world" id="lounge-world">
        <img class="lounge-art" src="./art/lounge.jpg" alt="The private lounge: a leather couch, pool table, graffiti wall and a bar with glowing holograms" draggable="false">
        ${ITEMS.map(item => `<button type="button" class="spot spot-${item.color}" data-product="${item.id}" aria-label="Order ${item.name}" style="left:${item.spot.l}%;top:${item.spot.t}%;width:${item.spot.w}%;height:${item.spot.h}%"><span class="spot-ring"></span><span class="spot-tag">${item.icon} ${item.name}</span></button>`).join("")}
      </div>
    </div>
    <button class="look look-left" id="look-left" type="button" aria-label="Look left">‹</button>
    <button class="look look-right" id="look-right" type="button" aria-label="Look right">›</button>
    <p class="lounge-hint">DRAG TO LOOK AROUND · TAP A HOLOGRAM TO ORDER</p>
    <div class="closed-veil" id="closed-veil" hidden><b>SHOP IS CLOSED</b><span>The lights are red. Check back when they turn blue.</span></div>
  </section>

  <nav class="menu-chips" aria-label="Menu">
    ${ITEMS.map(item => `<button type="button" class="menu-chip chip-${item.color}" data-product="${item.id}">${item.icon}<span>${item.name}</span></button>`).join("")}
  </nav>

  <section class="panel bath" id="bath-panel">
    <h2>BATHROOM WINDOW</h2>
    <p class="muted small">Someone is listening behind the glass. Type a message and wait for the reply.</p>
    <div class="bath-art" aria-hidden="true"></div>
    <form id="message-form" class="msg-bar"><input id="member-message" name="message" maxlength="1000" placeholder="Tap to message…" autocomplete="off" required><button type="submit" aria-label="Send message">➤</button></form>
    <p id="message-note" aria-live="polite" class="small"></p>
    <div id="message-history" class="stack"></div>
  </section>

  <section class="panel">
    <h2>YOUR ORDERS</h2>
    <div id="order-history" class="stack">Loading…</div>
  </section>

  ${ownerMarkup}

  <div class="sheet" id="order-sheet" hidden>
    <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="order-title">
      <button type="button" class="sheet-close" id="order-close" aria-label="Close">×</button>
      <div class="sheet-holo"><img id="order-art" alt=""></div>
      <h2 id="order-title"></h2>
      <p id="order-detail" class="muted"></p>
      <div id="order-options"></div>
      <p class="order-total">TOTAL <b id="order-total">$0.00</b></p>
      <button type="button" id="place-order" class="order-go">ORDER NOW</button>
      <p id="order-note" aria-live="polite" class="small"></p>
    </div>
  </div>
  <div class="toasts" id="toasts" aria-live="polite"></div>
</div>`;

/* ---------- look around the lounge (drag, swipe, or arrow buttons) ---------- */
const RATIO = 690 / 336;
const viewport = $("#lounge-viewport");
const world = $("#lounge-world");
let pan = 0, maxPan = 0, laidOut = false, dragged = false;

function setPan(value, animate = false) {
  pan = Math.min(maxPan, Math.max(0, value));
  world.style.transition = animate ? "transform .35s ease" : "none";
  world.style.transform = "translate3d(" + (-pan) + "px,0,0)";
  $("#look-left").disabled = pan <= 1;
  $("#look-right").disabled = pan >= maxPan - 1;
}
function layout() {
  const vw = viewport.clientWidth;
  if (!vw) return;                                          // shop not on screen yet; the observer below calls us again
  const ratioPan = maxPan ? pan / maxPan : 0.85;           // start looking at the bar and holograms
  const height = Math.max(Math.min(Math.max(vw / RATIO, 320), Math.round(window.innerHeight * 0.62), 560), vw / RATIO);
  const width = height * RATIO;
  viewport.style.height = height + "px";
  world.style.width = width + "px";
  world.style.height = height + "px";
  maxPan = Math.max(0, width - vw);
  setPan(laidOut ? ratioPan * maxPan : 0.85 * maxPan);
  laidOut = true;
}
layout();
new ResizeObserver(layout).observe(viewport);               // re-fit whenever the shop appears or the window changes size
window.addEventListener("resize", layout);
window.addEventListener("orientationchange", () => setTimeout(layout, 250));

let dragStart = null;
viewport.addEventListener("pointerdown", event => {
  dragStart = { x: event.clientX, pan, id: event.pointerId };
  dragged = false;
});
viewport.addEventListener("pointermove", event => {
  if (!dragStart || event.pointerId !== dragStart.id) return;
  const dx = event.clientX - dragStart.x;
  if (!dragged && Math.abs(dx) > 6) { dragged = true; viewport.setPointerCapture?.(event.pointerId); }
  if (dragged) setPan(dragStart.pan - dx);
});
const endDrag = () => { dragStart = null; setTimeout(() => { dragged = false; }, 0); };
viewport.addEventListener("pointerup", endDrag);
viewport.addEventListener("pointercancel", endDrag);
$("#look-left").addEventListener("click", () => setPan(pan - viewport.clientWidth * 0.45, true));
$("#look-right").addEventListener("click", () => setPan(pan + viewport.clientWidth * 0.45, true));

/* ---------- shop open (blue lights) / closed (red lights) ---------- */
let shopOpen = false, statusKnown = false;
function applyTheme() {
  document.body.classList.toggle("theme-open", shopOpen);
  document.body.classList.toggle("theme-closed", !shopOpen);
  const pill = $("#shop-pill");
  pill.textContent = shopOpen ? "● OPEN" : "● CLOSED";
  pill.className = "pill " + (shopOpen ? "pill-open" : "pill-closed");
  $("#closed-veil").hidden = shopOpen;
  $$("[data-product]").forEach(button => { button.disabled = !shopOpen; });
  if (!shopOpen) closeOrder();
  const lights = $("#toggle-shop");
  if (lights) lights.textContent = shopOpen ? "💡 LIGHTS BLUE · SHOP OPEN — tap to close" : "💡 LIGHTS RED · SHOP CLOSED — tap to open";
}
async function refreshStatus() {
  const { data, error } = await supabase.from("shop_status").select("is_open").eq("id", 1).maybeSingle();
  const next = !error && Boolean(data?.is_open);
  if (statusKnown && next !== shopOpen && !isOwner) toast(next ? "The lights just turned blue — the shop is open." : "The lights turned red — the shop is closed.");
  shopOpen = next; statusKnown = true;
  applyTheme();
}

/* ---------- ordering ---------- */
let selected = null, opt = {};
function unitPrice() {
  if (selected.kind === "tea") return opt.size === "Small" ? 20 : 35;
  if (selected.kind === "shot") return opt.size === "Small" ? 5 : 10;
  return 0;
}
function computeOrder() {
  if (selected.kind === "amount") return { item: selected.name + " · spending amount", quantity: 1, total: opt.amount };
  if (selected.kind === "tea") return { item: selected.name + " · " + opt.size, quantity: opt.bundle, total: unitPrice() * opt.bundle };
  return { item: selected.name + " · " + opt.size, quantity: opt.qty, total: unitPrice() * opt.qty };
}
function renderOptions() {
  const seg = (act, values, current) => '<div class="seg">' + values.map(([value, label]) =>
    `<button type="button" data-act="${act}" data-v="${value}" class="${String(current) === String(value) ? "on" : ""}">${label}</button>`).join("") + "</div>";
  const stepper = (minus, text, plus) => `<div class="stepper"><button type="button" data-act="${minus}" aria-label="Less">−</button><output>${text}</output><button type="button" data-act="${plus}" aria-label="More">+</button></div>`;
  let html = "";
  if (selected.kind === "amount") {
    html = "<label>Spending amount (minimum $20, $5 steps)</label>" + stepper("amt-", money(opt.amount), "amt+");
  } else if (selected.kind === "tea") {
    html = "<label>Size</label>" + seg("size", [["Small", "Small · $20"], ["Big", "Big · $35"]], opt.size) +
           "<label>Bundle</label>" + seg("bundle", [[1, "1"], [2, "2"], [4, "4"]], opt.bundle);
  } else {
    html = "<label>Size</label>" + seg("size", [["Small", "Small · $5 each"], ["Medium", "Medium · $10 each"]], opt.size) +
           "<label>Number of shots</label>" + stepper("qty-", String(opt.qty), "qty+");
  }
  $("#order-options").innerHTML = html;
  $("#order-total").textContent = money(computeOrder().total);
}
function openOrder(item) {
  if (!shopOpen) return;
  selected = item;
  opt = { amount: 20, size: "Small", bundle: 1, qty: 1 };
  const sheet = $("#order-sheet");
  sheet.style.setProperty("--c", COLORS[item.color]);
  $("#order-art").src = item.art;
  $("#order-title").textContent = item.icon + " " + item.name;
  $("#order-detail").textContent = item.detail;
  $("#order-note").textContent = "";
  renderOptions();
  sheet.hidden = false;
}
function closeOrder() { const sheet = $("#order-sheet"); if (sheet) sheet.hidden = true; selected = null; }

root.addEventListener("click", event => {
  const product = event.target.closest("[data-product]");
  if (product) {
    if (dragged) return;                                        // it was a swipe, not a tap
    const item = ITEMS.find(entry => entry.id === product.dataset.product);
    if (item) openOrder(item);
  }
});
$("#order-close").addEventListener("click", closeOrder);
$("#order-sheet").addEventListener("click", event => { if (event.target.id === "order-sheet") closeOrder(); });
$("#order-options").addEventListener("click", event => {
  const button = event.target.closest("[data-act]"); if (!button || !selected) return;
  const act = button.dataset.act, value = button.dataset.v;
  if (act === "amt-") opt.amount = Math.max(20, opt.amount - 5);
  if (act === "amt+") opt.amount = Math.min(10000, opt.amount + 5);
  if (act === "size") opt.size = value;
  if (act === "bundle") opt.bundle = Number(value);
  if (act === "qty-") opt.qty = Math.max(1, opt.qty - 1);
  if (act === "qty+") opt.qty = Math.min(99, opt.qty + 1);
  renderOptions();
});
$("#place-order").addEventListener("click", async () => {
  const note = $("#order-note");
  if (!shopOpen || !selected) { note.textContent = "The shop is closed."; return; }
  const order = computeOrder();
  if (selected.kind === "amount" && (!Number.isFinite(order.total) || order.total < 20 || order.total > 10000 || order.total % 5 !== 0)) { note.textContent = "Choose $20 or more in $5 steps."; return; }
  if (selected.kind === "shot" && (!Number.isInteger(order.quantity) || order.quantity < 1 || order.quantity > 99)) { note.textContent = "Choose 1–99 shots."; return; }
  const go = $("#place-order"); go.disabled = true; note.textContent = "Sending…";
  const { error } = await supabase.from("orders").insert({ customer_id: user.id, item: order.item, quantity: order.quantity, total_amount: order.total });
  go.disabled = false;
  if (error) { console.error(error); note.textContent = "Could not send the order. Please try again."; return; }
  toast("Order sent. You'll get a reply here as soon as the owner answers.");
  closeOrder();
  await loadOrders();
});

/* ---------- member: order history + replies ---------- */
const seenOrders = new Map();
let ordersLoaded = false;
async function loadOrders() {
  const { data, error } = await supabase.from("orders").select("id,item,quantity,total_amount,status,created_at")
    .eq("customer_id", user.id).order("created_at", { ascending: false }).limit(10);
  const box = $("#order-history");
  if (error) { box.textContent = "Could not load orders."; return; }
  box.innerHTML = (data || []).map(o => `<div class="row-card"><div><b>${safe(o.item)}</b><small>${safe(o.quantity)} · ${money(o.total_amount)} · ${when(o.created_at)}</small></div><span class="status status-${cls(o.status)}">${statusLabel(o.status)}</span></div>`).join("") || "No orders yet.";
  (data || []).forEach(o => {
    if (ordersLoaded && seenOrders.has(o.id) && seenOrders.get(o.id) !== o.status && cls(o.status) !== "pending") {
      toast("The Night Shop: your order — " + String(STATUS_LABEL[cls(o.status)] || o.status), "alert");
    }
    seenOrders.set(o.id, o.status);
  });
  ordersLoaded = true;
}

const seenReplies = new Map();
let messagesLoaded = false;
async function loadMessages() {
  const { data, error } = await supabase.from("messages").select("*").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(10);
  const box = $("#message-history");
  if (error) { box.textContent = "Could not load messages."; return; }
  box.innerHTML = (data || []).map(m => `<div class="row-card msg"><div><b>You</b><small>${safe(m.message)}</small>${m.reply ? `<div class="reply">🕴️ ${safe(m.reply)}</div>` : ""}</div></div>`).join("");
  (data || []).forEach(m => {
    const key = m.id ?? m.created_at;
    if (messagesLoaded && m.reply && !seenReplies.get(key)) toast("The shadow replied to your message.", "alert");
    seenReplies.set(key, m.reply || "");
  });
  messagesLoaded = true;
}
$("#message-form").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("#member-message"), note = $("#message-note"), message = input.value.trim();
  if (!message) return;
  note.textContent = "Sending…";
  const { error } = await supabase.from("messages").insert({ customer_id: user.id, message });
  note.textContent = error ? "Message could not be sent." : "Message sent privately.";
  if (!error) { input.value = ""; await loadMessages(); }
});
$("#sign-out").addEventListener("click", async () => { await supabase.auth.signOut(); location.reload(); });

/* ---------- owner tools ---------- */
let loadOwnerOrders = async () => {}, loadOwnerMessages = async () => {};
if (isOwner) {
  const names = async ids => {
    const map = new Map();
    try {
      const unique = [...new Set(ids.filter(Boolean))];
      if (!unique.length) return map;
      const { data } = await supabase.from("profiles").select("id,display_name").in("id", unique);
      (data || []).forEach(p => map.set(p.id, p.display_name));
    } catch { /* names are optional */ }
    return map;
  };

  $("#toggle-shop").addEventListener("click", async () => {
    const button = $("#toggle-shop"); button.disabled = true;
    const { error } = await supabase.from("shop_status").update({ is_open: !shopOpen, updated_at: new Date().toISOString() }).eq("id", 1);
    button.disabled = false;
    if (error) { console.error(error); toast("Could not change the lights.", "alert"); return; }
    await refreshStatus();
  });

  const knownPending = new Set();
  let ownerOrdersLoaded = false;
  loadOwnerOrders = async () => {
    const { data, error } = await supabase.from("orders").select("id,customer_id,item,quantity,total_amount,status,created_at").order("created_at", { ascending: false }).limit(30);
    const box = $("#owner-orders");
    if (error) { box.textContent = "Could not load orders."; return; }
    const who = await names((data || []).map(o => o.customer_id));
    const sorted = [...(data || [])].sort((a, b) => (cls(b.status) === "pending") - (cls(a.status) === "pending"));
    box.innerHTML = sorted.map(o => `<div class="row-card order-card ${cls(o.status) === "pending" ? "is-new" : ""}"><div><b>${safe(o.item)}</b><small>${safe(who.get(o.customer_id) || "Member")} · ${safe(o.quantity)} · ${money(o.total_amount)} · ${when(o.created_at)}</small></div><span class="status status-${cls(o.status)}">${statusLabel(o.status)}</span><div class="decide"><button type="button" class="d-confirm" data-order="${safe(o.id)}" data-status="confirmed">Confirm</button><button type="button" class="d-deny" data-order="${safe(o.id)}" data-status="denied">Deny</button><button type="button" class="d-wait" data-order="${safe(o.id)}" data-status="waitlisted">Waitlist</button></div></div>`).join("") || "No orders yet.";
    (data || []).forEach(o => {
      if (cls(o.status) === "pending" && !knownPending.has(o.id)) {
        if (ownerOrdersLoaded) toast("New order: " + o.item + " · " + money(o.total_amount), "alert");
        knownPending.add(o.id);
      }
    });
    ownerOrdersLoaded = true;
  };
  $("#owner-orders").addEventListener("click", async event => {
    const button = event.target.closest("[data-order]"); if (!button) return;
    button.disabled = true;
    const { error } = await supabase.from("orders").update({ status: button.dataset.status }).eq("id", button.dataset.order);
    if (error) { console.error(error); toast("Could not update that order.", "alert"); } else { toast("Order marked " + button.dataset.status + "."); }
    await loadOwnerOrders();
  });

  const knownMessages = new Set();
  let ownerMessagesLoaded = false;
  loadOwnerMessages = async () => {
    const { data, error } = await supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(30);
    const box = $("#owner-messages");
    if (error) { box.textContent = "Could not load messages."; return; }
    const who = await names((data || []).map(m => m.customer_id));
    box.innerHTML = (data || []).map(m => `<form class="row-card msg reply-form" data-msg="${safe(m.id ?? "")}"><div><b>${safe(who.get(m.customer_id) || "Member")}</b><small>${safe(m.message)} · ${when(m.created_at)}</small>${m.reply ? `<div class="reply">You: ${safe(m.reply)}</div>` : ""}<div class="msg-bar small-bar"><input name="reply" maxlength="1000" placeholder="${m.reply ? "Send another reply…" : "Reply as the shadow…"}" autocomplete="off" required><button type="submit" aria-label="Send reply">➤</button></div></div></form>`).join("") || "No messages yet.";
    (data || []).forEach(m => {
      const key = m.id ?? m.created_at;
      if (!knownMessages.has(key)) {
        if (ownerMessagesLoaded && !m.reply) toast("New message: " + String(m.message).slice(0, 60), "alert");
        knownMessages.add(key);
      }
    });
    ownerMessagesLoaded = true;
  };
  $("#owner-messages").addEventListener("submit", async event => {
    event.preventDefault();
    const formEl = event.target.closest("[data-msg]"); if (!formEl || !formEl.dataset.msg) { toast("This message has no id, so it can't be answered.", "alert"); return; }
    const text = formEl.elements.reply.value.trim(); if (!text) return;
    const { error } = await supabase.from("messages").update({ reply: text }).eq("id", formEl.dataset.msg);
    if (error) { console.error(error); toast("Could not send the reply.", "alert"); return; }
    toast("Reply sent.");
    await loadOwnerMessages();
  });

  const artworkInput = $("#exterior-upload");
  const artworkStatus = $("#exterior-upload-status");
  artworkInput?.addEventListener("change", async () => {
    const file = artworkInput.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) {
      artworkStatus.textContent = "Choose a JPG, PNG, or WebP image under 15 MB.";
      artworkInput.value = "";
      return;
    }
    artworkInput.disabled = true;
    artworkStatus.textContent = "Uploading exterior artwork…";
    try {
      const { error } = await supabase.storage.from("nightshop-artwork").upload("exterior/current", file, {
        upsert: true, contentType: file.type, cacheControl: "0"
      });
      if (error) throw error;
      const { data } = supabase.storage.from("nightshop-artwork").getPublicUrl("exterior/current");
      const image = document.querySelector("#exterior-artwork");
      if (image) image.src = data.publicUrl + "?v=" + Date.now();
      artworkStatus.textContent = "Exterior artwork is live. Sign out to see it on the storefront.";
    } catch (error) {
      console.error("Exterior artwork upload failed:", error);
      artworkStatus.textContent = "Upload failed: " + (error?.message || "Please try again.");
    } finally {
      artworkInput.disabled = false;
    }
  });
}

/* ---------- first load, then check for news every 15 seconds ---------- */
await Promise.all([refreshStatus(), loadOrders(), loadMessages(), loadOwnerOrders(), loadOwnerMessages()]);
const poll = () => {
  if (document.hidden) return;
  Promise.allSettled([refreshStatus(), loadOrders(), loadMessages(), loadOwnerOrders(), loadOwnerMessages()]);
};
setInterval(poll, 15000);
document.addEventListener("visibilitychange", poll);
