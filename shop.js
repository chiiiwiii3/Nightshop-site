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
const STATUS_LABEL = { pending: "Waiting", confirmed: "Confirmed ✅", denied: "Denied", waitlisted: "Waitlist ⏳", done: "Done ✅" };
const statusLabel = status => STATUS_LABEL[cls(status)] || safe(status);

/* pop-up notice; pass onClick to make it tappable (it jumps straight to the conversation) */
function toast(text, kind = "info", onClick) {
  const el = document.createElement("div");
  el.className = "toast " + kind + (onClick ? " tap" : "");
  const label = document.createElement("span");
  label.textContent = text;
  el.append(label);
  if (onClick) {
    const hint = document.createElement("small");
    hint.textContent = "Tap to open ›";
    el.append(hint);
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    const go = () => { el.remove(); onClick(); };
    el.addEventListener("click", go);
    el.addEventListener("keydown", event => { if (event.key === "Enter") go(); });
  }
  $("#toasts")?.append(el);
  try { navigator.vibrate?.(kind === "alert" ? [120, 60, 120] : 50); } catch { /* not supported */ }
  setTimeout(() => el.remove(), onClick ? 12000 : 7000);
}
function flash(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("flash");
  setTimeout(() => el.classList.remove("flash"), 2200);
}

/* in-app confirm box (the browser's own box would show the website address instead of "Shadowman") */
function ask(text, okLabel = "OK") {
  return new Promise(resolve => {
    const el = document.createElement("div");
    el.className = "sheet"; el.style.zIndex = 400;
    el.innerHTML = '<div class="sheet-card" role="alertdialog" aria-modal="true" style="--c:#ffd98a"><h2>🕴️ SHADOWMAN</h2><p class="ask-text"></p><div class="app-row"><button type="button" class="ghost" data-a="no">Cancel</button><button type="button" data-a="yes"></button></div></div>';
    el.querySelector(".ask-text").textContent = text;
    el.querySelector('[data-a="yes"]').textContent = okLabel;
    const done = v => { el.remove(); resolve(v); };
    el.addEventListener("click", e => { const a = e.target.closest("[data-a]"); if (a) done(a.dataset.a === "yes"); else if (e.target === el) done(false); });
    document.body.append(el);
    el.querySelector('[data-a="no"]').focus();
  });
}

/* redraw a list only when it changed, and keep whatever the person is typing in it (the app refreshes every 15 seconds) */
function patch(el, html) {
  if (!el || el.__html === html) return;
  const drafts = new Map(); let focusKey = null, caret = 0;
  el.querySelectorAll("[data-draft]").forEach(field => {
    if (field.value) drafts.set(field.dataset.draft, field.value);
    if (document.activeElement === field) { focusKey = field.dataset.draft; caret = field.selectionStart ?? field.value.length; }
  });
  el.innerHTML = html; el.__html = html;
  el.querySelectorAll("[data-draft]").forEach(field => {
    if (drafts.has(field.dataset.draft)) field.value = drafts.get(field.dataset.draft);
    if (field.dataset.draft === focusKey) { field.focus({ preventScroll: true }); try { field.setSelectionRange(caret, caret); } catch { /* not a text field */ } }
  });
}

const tabsMarkup = (id, a, b) => `<div class="tabs" id="${id}"><button type="button" data-tab="active" class="on">${a} <span class="count" id="${id}-count-active">0</span></button><button type="button" data-tab="history">${b} <span class="count" id="${id}-count-history">0</span></button></div>`;

/* ---------- the menu: three floating holograms ---------- */
const ITEMS = [
  { id: "ice",  icon: "❄️", name: "Honeydrippers", detail: "Frozen Kool-Aid ice cups with candy and/or fruit", kind: "amount", color: "mint",  spot: { l: 47.8, t: 50, w: 7.6, h: 16 } },
  { id: "tea",  icon: "🌴", name: "Herbal teas",   detail: "Small or Big · choose a bundle",                    kind: "tea",    color: "green", spot: { l: 53.0, t: 47.5, w: 7.6, h: 16 } },
  { id: "shot", icon: "⚕️", name: "Herbal shots",  detail: "Small or Medium · priced per shot glass",           kind: "shot",   color: "gold",  spot: { l: 58.2, t: 50, w: 7.6, h: 16 } }
];
const COLORS = { mint: "#8dffe6", green: "#38ff7a", gold: "#ffd36a" };

const ownerMarkup = isOwner ? `
  <section class="panel owner-panel" id="owner-panel">
    <h2>OWNER CONTROLS</h2>
    <button id="toggle-shop" class="lights-btn" type="button">💡 LIGHTS</button>
    <p class="muted small">Blue lights = shop open. Red lights = shop closed. Members see the change within seconds.</p>
    ${tabsMarkup("owner-tabs", "Active", "History")}
    <h3 id="owner-orders-title">INCOMING ORDERS</h3>
    <div id="owner-orders" class="stack">Loading…</div>
    <h3 id="owner-messages-title">CUSTOMER MESSAGES</h3>
    <div id="owner-messages" class="stack">Loading…</div>
    <h3>INVITE MEMBERS</h3>
    <p class="muted small">Show this to someone and have them scan it with their camera, or tap Share. It opens an install screen first, so they get the app on their Home Screen.</p>
    <div class="invite-box"><img id="invite-qr" src="./icons/invite-qr.svg" alt="Scan to join Lu’s Lounge" width="200" height="200"></div>
    <div class="app-row"><button type="button" id="invite-share">📤 Share invite</button><button type="button" class="ghost" id="invite-copy">Copy link</button></div>
    <p class="muted small" id="invite-note" aria-live="polite"></p>
    <h3>EXTERIOR ARTWORK</h3>
    <p class="muted small">Replace the storefront picture from your phone Gallery. JPG, PNG, or WebP · up to 15 MB.</p>
    <input id="exterior-upload" type="file" accept="image/jpeg,image/png,image/webp">
    <p id="exterior-upload-status" aria-live="polite"></p>
  </section>` : "";

root.innerHTML = `
<div class="nsx">
  <header class="nsx-top">
    <div class="nsx-brand"><span class="nsx-crest">♛</span><div><h1>LU’S LOUNGE</h1><p>Welcome in, ${safe(profile.display_name || "member")}</p></div></div>
    <div class="nsx-actions"><span id="shop-pill" class="pill">Checking…</span><button id="sign-out" class="ghost" type="button">Sign out</button></div>
  </header>

  <section class="lounge" aria-label="Lu’s Lounge lounge">
    <div class="lounge-viewport" id="lounge-viewport">
      <div class="lounge-world" id="lounge-world">
        <div class="lounge-copy">
          <img class="lounge-art" src="./art/lounge.jpg" alt="The private lounge: black leather seating, a pool table, a poker table and a glowing Lu’s Lounge sign" draggable="false">
          ${ITEMS.map(item => `<button type="button" class="spot spot-${item.color}" data-product="${item.id}" aria-label="Order ${item.name}" style="left:${item.spot.l}%;top:${item.spot.t}%;width:${item.spot.w}%;height:${item.spot.h}%"><span class="holo-glyph" aria-hidden="true">${item.icon}</span><span class="spot-ring"></span><span class="spot-tag">${item.icon} ${item.name}</span></button>`).join("")}
          <button type="button" class="spot-door" data-bath aria-label="Open the bathroom window" style="left:36%;top:36.5%;width:5%;height:22.5%"><span class="spot-ring"></span></button>
        </div>
        <div class="lounge-copy">
          <img class="lounge-art" src="./art/lounge.jpg" alt="The private lounge: black leather seating, a pool table, a poker table and a glowing Lu’s Lounge sign" draggable="false">
          ${ITEMS.map(item => `<button type="button" class="spot spot-${item.color}" data-product="${item.id}" aria-label="Order ${item.name}" style="left:${item.spot.l}%;top:${item.spot.t}%;width:${item.spot.w}%;height:${item.spot.h}%"><span class="holo-glyph" aria-hidden="true">${item.icon}</span><span class="spot-ring"></span><span class="spot-tag">${item.icon} ${item.name}</span></button>`).join("")}
          <button type="button" class="spot-door" data-bath aria-label="Open the bathroom window" style="left:36%;top:36.5%;width:5%;height:22.5%"><span class="spot-ring"></span></button>
        </div>
        <div class="lounge-copy">
          <img class="lounge-art" src="./art/lounge.jpg" alt="The private lounge: black leather seating, a pool table, a poker table and a glowing Lu’s Lounge sign" draggable="false">
          ${ITEMS.map(item => `<button type="button" class="spot spot-${item.color}" data-product="${item.id}" aria-label="Order ${item.name}" style="left:${item.spot.l}%;top:${item.spot.t}%;width:${item.spot.w}%;height:${item.spot.h}%"><span class="holo-glyph" aria-hidden="true">${item.icon}</span><span class="spot-ring"></span><span class="spot-tag">${item.icon} ${item.name}</span></button>`).join("")}
          <button type="button" class="spot-door" data-bath aria-label="Open the bathroom window" style="left:36%;top:36.5%;width:5%;height:22.5%"><span class="spot-ring"></span></button>
        </div>
      </div>
    </div>
    <button class="look look-left" id="look-left" type="button" aria-label="Look left">‹</button>
    <button class="look look-right" id="look-right" type="button" aria-label="Look right">›</button>
    <p class="lounge-hint">SPIN TO LOOK AROUND · TAP A HOLOGRAM</p>
    <div class="closed-veil" id="closed-veil" hidden><b>THE LOUNGE IS CLOSED</b><span>You can still check your orders below and message the shadow through the bathroom door.</span></div>
  </section>

  <section class="panel">
    <h2>YOUR ORDERS</h2>
    ${tabsMarkup("my-tabs", "Orders", "History")}
    <div id="order-history" class="stack">Loading…</div>
  </section>

  <section class="panel" id="app-panel" hidden></section>

  ${ownerMarkup}

  <div class="sheet" id="order-sheet" hidden>
    <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="order-title">
      <button type="button" class="sheet-close" id="order-close" aria-label="Close">×</button>
      <div class="sheet-holo"><span id="order-glyph" aria-hidden="true"></span></div>
      <h2 id="order-title"></h2>
      <p id="order-detail" class="muted"></p>
      <div id="order-options"></div>
      <p class="order-total">TOTAL <b id="order-total">$0.00</b></p>
      <button type="button" id="place-order" class="order-go">ORDER NOW</button>
      <p id="order-note" aria-live="polite" class="small"></p>
    </div>
  </div>
  <div class="sheet" id="thread-sheet" hidden>
    <div class="sheet-card" style="--c:var(--accent)" role="dialog" aria-modal="true" aria-labelledby="thread-title">
      <button type="button" class="sheet-close" id="thread-close" aria-label="Close">×</button>
      <h2 id="thread-title">ORDER CHAT</h2>
      <p id="thread-sum" class="muted"></p>
      <p id="thread-status-line"></p>
      <div id="thread-choose" hidden><button type="button" class="ghost" id="thread-choose-btn">🚚 Delivery or 🤝 meet up?</button></div>
      <div id="thread-log" class="chat"></div>
      <form id="thread-form" class="msg-bar"><input id="thread-input" maxlength="600" placeholder="Add directions or change your order…" autocomplete="off" required><button type="submit" aria-label="Send">➤</button></form>
      <p id="thread-note" aria-live="polite" class="small"></p>
      <p id="thread-closed" class="muted small" hidden>✅ This order is complete, so the chat is closed.</p>
    </div>
  </div>
  <div class="sheet" id="fulfil-sheet" hidden>
    <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="fulfil-title">
      <button type="button" class="sheet-close" id="fulfil-close" aria-label="Close">×</button>
      <h2 id="fulfil-title">ORDER SENT ✅</h2>
      <p id="fulfil-sum" class="muted"></p>
      <div id="fulfil-choices">
        <label>How do you want to get it?</label>
        <div class="fulfil-choices"><button type="button" data-fulfil="delivery">🚚<br>DELIVERY</button><button type="button" data-fulfil="meetup">🤝<br>MEET UP</button></div>
        <button type="button" class="ghost" id="fulfil-later">Decide later</button>
      </div>
      <form id="delivery-form" hidden>
        <label for="delivery-text">Address and any info</label>
        <textarea id="delivery-text" rows="4" maxlength="700" placeholder="Street, apt / unit, gate code, name to ask for, best time…" required></textarea>
        <button type="submit" class="order-go">SEND WITH ORDER</button>
        <button type="button" class="ghost" id="delivery-back">Back</button>
      </form>
      <p id="fulfil-note" aria-live="polite" class="small"></p>
    </div>
  </div>
  <div class="sheet" id="bath-sheet" hidden>
    <div class="sheet-card" style="--c:#ffd98a" role="dialog" aria-modal="true" aria-labelledby="bath-title">
      <button type="button" class="sheet-close" id="bath-close" aria-label="Close">×</button>
      <h2 id="bath-title">BATHROOM WINDOW</h2>
      <p class="muted small">Someone is listening behind the glass. Type a message and wait for the reply.</p>
      <div class="bath-art" aria-hidden="true"></div>
      <form id="message-form" class="msg-bar"><input id="member-message" name="message" maxlength="1000" placeholder="Tap to message…" autocomplete="off" required><button type="submit" aria-label="Send message">➤</button></form>
      <p id="message-note" aria-live="polite" class="small"></p>
      <button type="button" class="ghost" id="clear-chat" hidden>🗑 Delete my conversation with the shadow</button>
      <div id="message-history" class="stack"></div>
    </div>
  </div>
  <div class="toasts" id="toasts" aria-live="polite"></div>
</div>`;

try { window.nightshopPwa?.mountPanel($("#app-panel"), { supabase, toast }); } catch (e) { console.error("App panel failed:", e); }

/* ---------- look around the lounge: a 360° spin. Drag or swipe, or use the arrows; it wraps around forever ---------- */
const RATIO = 1464 / 672;
const viewport = $("#lounge-viewport");
const world = $("#lounge-world");
let pan = 0, picW = 0, laidOut = false, dragged = false, spinning = null;

function setPan(value) {
  if (!picW) return;
  pan = ((value % picW) + picW) % picW;                       // wrap: past one edge you come back in at the other
  world.style.transform = "translate3d(" + (-(picW + pan)) + "px,0,0)";   // three copies side by side, we always show the middle one's range
}
function layout() {
  const vw = viewport.clientWidth;
  if (!vw) return;                                          // shop not on screen yet; the observer below calls us again
  const height = Math.max(Math.min(Math.max(vw / RATIO, 320), Math.round(window.innerHeight * 0.62), 560), vw / RATIO);
  const width = height * RATIO, before = picW;
  viewport.style.height = height + "px";
  world.style.width = (width * 3) + "px";
  world.style.height = height + "px";
  world.style.setProperty("--wu", (width / 100) + "px");     // 1% of the picture's width, so the holograms scale with the scene
  picW = width;
  // first view: look at the coffee table and the holograms
  setPan(laidOut ? pan * (width / before) : 0.565 * width - vw / 2);
  laidOut = true;
}
layout();
new ResizeObserver(layout).observe(viewport);               // re-fit whenever the shop appears or the window changes size
window.addEventListener("resize", layout);
window.addEventListener("orientationchange", () => setTimeout(layout, 250));

function spinTo(target, ms = 380) {
  cancelAnimationFrame(spinning);
  const from = pan, t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    setPan(from + (target - from) * e);
    if (k < 1) spinning = requestAnimationFrame(step);
  };
  spinning = requestAnimationFrame(step);
}
let dragStart = null, last = null, velocity = 0;
viewport.addEventListener("pointerdown", event => {
  cancelAnimationFrame(spinning);
  dragStart = { x: event.clientX, pan, id: event.pointerId };
  last = { x: event.clientX, t: performance.now() }; velocity = 0;
  dragged = false;
});
viewport.addEventListener("pointermove", event => {
  if (!dragStart || event.pointerId !== dragStart.id) return;
  const dx = event.clientX - dragStart.x;
  if (!dragged && Math.abs(dx) > 6) { dragged = true; viewport.setPointerCapture?.(event.pointerId); }
  if (dragged) {
    setPan(dragStart.pan - dx);
    const now = performance.now(), dt = Math.max(1, now - last.t);
    velocity = 0.8 * velocity + 0.2 * ((last.x - event.clientX) / dt); last = { x: event.clientX, t: now };
  }
});
const endDrag = () => {
  const wasDrag = dragged; dragStart = null;
  setTimeout(() => { dragged = false; }, 0);
  if (wasDrag && Math.abs(velocity) > 0.05) {                 // keep gliding after you let go
    let v = velocity * 16, prev = performance.now();
    const glide = now => { const dt = (now - prev) / 16; prev = now; setPan(pan + v * dt); v *= Math.pow(0.94, dt); if (Math.abs(v) > 0.15) spinning = requestAnimationFrame(glide); };
    spinning = requestAnimationFrame(glide);
  }
};
viewport.addEventListener("pointerup", endDrag);
viewport.addEventListener("pointercancel", endDrag);
$("#look-left").addEventListener("click", () => spinTo(pan - viewport.clientWidth * 0.5));
$("#look-right").addEventListener("click", () => spinTo(pan + viewport.clientWidth * 0.5));
window.__spin = { get pan() { return pan; }, set: setPan };   // used by the tests

/* ---------- shop open (blue lights) / closed (red lights) ---------- */
let shopOpen = false, statusKnown = false;
function applyTheme() {
  document.body.classList.toggle("theme-open", shopOpen);
  document.body.classList.toggle("theme-closed", !shopOpen);
  const pill = $("#shop-pill");
  pill.textContent = shopOpen ? "● OPEN" : "● CLOSED";
  pill.className = "pill " + (shopOpen ? "pill-open" : "pill-closed");
  $("#closed-veil").hidden = shopOpen;
  $$("[data-product]").forEach(button => { button.disabled = !shopOpen; button.hidden = !shopOpen; });
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
  $("#order-glyph").textContent = item.icon;
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
/* the restroom sign opens the bathroom window */
const bathSheet = $("#bath-sheet");
const closeBath = () => { bathSheet.hidden = true; };
root.addEventListener("click", event => { if (event.target.closest("[data-bath]")) { if (dragged) return; bathSheet.hidden = false; } });
$("#bath-close").addEventListener("click", closeBath);
bathSheet.addEventListener("click", event => { if (event.target.id === "bath-sheet") closeBath(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeBath(); closeOrder(); closeFulfil(); closeThread(); } });

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
/* ---------- order conversations ----------
   Everything about an order (delivery / meet-up details, extra directions, changes, the owner's replies) is kept as
   private messages tagged "[order:ID]". The chat stays open until the owner adds a "✅ DONE" line to the last reply. */
const TAG = /\s*\[order:([\w-]+)\]\s*$/;
const DONE = "✅ DONE";
function parseTagged(m) {
  const full = String(m?.message ?? "");
  const hit = TAG.exec(full);
  if (!hit) return null;
  const text = full.replace(TAG, "");
  const [head, ...rest] = text.split("\n");
  const kind = head.startsWith("📦") ? "delivery" : head.startsWith("🤝") ? "meetup" : head.startsWith("🧾") ? "order" : "note";
  const body = kind === "note" ? text.replace(/^💬\s*/, "") : rest.join("\n").trim();
  return { orderId: hit[1], kind, head, body };
}
const kindLabel = kind => kind === "delivery" ? "📦 Delivery" : kind === "meetup" ? "🤝 Meet up" : "💬 Note";
const threadFor = (orderId, messages, customerId) => messages
  .filter(m => (!customerId || m.customer_id === customerId) && parseTagged(m)?.orderId === String(orderId))
  .sort((x, y) => new Date(x.created_at) - new Date(y.created_at));
const replyLines = reply => String(reply || "").split("\n").map(line => line.trim()).filter(line => line && line !== DONE);
const hasDone = m => String(m?.reply || "").split("\n").some(line => line.trim() === DONE);
const isDone = (order, thread) => cls(order.status) === "done" || thread.some(hasDone);
const isFinished = (order, thread) => isDone(order, thread) || cls(order.status) === "denied";   // finished orders live in History
const stripDone = reply => String(reply || "").split("\n").filter(line => line.trim() !== DONE).join("\n").trim();
const myChoice = thread => thread.some(m => ["delivery", "meetup"].includes(parseTagged(m).kind));

/* hide-from-view list: used only if the database does not allow customers to delete their own messages */
const hideKey = "nsx-hidden-messages-" + user.id;
let hiddenIds = new Set();
try { hiddenIds = new Set(JSON.parse(localStorage.getItem(hideKey) || "[]")); } catch { /* storage blocked */ }
const rememberHidden = ids => {
  ids.forEach(id => hiddenIds.add(String(id)));
  try { localStorage.setItem(hideKey, JSON.stringify([...hiddenIds])); } catch { /* storage blocked */ }
};

/* ---------- placing an order ---------- */
$("#place-order").addEventListener("click", async () => {
  const note = $("#order-note");
  if (!shopOpen || !selected) { note.textContent = "The shop is closed."; return; }
  const order = computeOrder();
  if (selected.kind === "amount" && (!Number.isFinite(order.total) || order.total < 20 || order.total > 10000 || order.total % 5 !== 0)) { note.textContent = "Choose $20 or more in $5 steps."; return; }
  if (selected.kind === "shot" && (!Number.isInteger(order.quantity) || order.quantity < 1 || order.quantity > 99)) { note.textContent = "Choose 1–99 shots."; return; }
  const color = COLORS[selected.color];
  const go = $("#place-order"); go.disabled = true; note.textContent = "Sending…";
  const { error } = await supabase.from("orders").insert({ customer_id: user.id, item: order.item, quantity: order.quantity, total_amount: order.total });
  go.disabled = false;
  if (error) { console.error(error); note.textContent = "Could not send the order. Please try again."; return; }
  closeOrder();
  await loadOrders();
  const placed = myOrders[0];                                   // newest first
  if (!placed) { toast("Order sent. You'll get a reply here as soon as the owner answers."); return; }
  // every order gets its own conversation, opened with a first line that carries the order id
  const first = await supabase.from("messages").insert({ customer_id: user.id, message: "🧾 ORDER · " + placed.item + " × " + placed.quantity + " · " + money(placed.total_amount) + " [order:" + placed.id + "]" });
  if (first.error) console.error(first.error);
  await loadMessages();
  openFulfil(placed, color);                                    // next step: delivery or meet up
});

/* ---------- after ordering: delivery or meet up ---------- */
let fulfilOrder = null;
const fulfilSheet = $("#fulfil-sheet");
function openFulfil(order, color) {
  fulfilOrder = order;
  fulfilSheet.style.setProperty("--c", color || "var(--accent)");
  $("#fulfil-sum").textContent = order.item + " × " + order.quantity + " · " + money(order.total_amount);
  $("#fulfil-choices").hidden = false;
  $("#delivery-form").hidden = true;
  $("#delivery-text").value = "";
  $("#fulfil-note").textContent = "";
  fulfilSheet.hidden = false;
}
function closeFulfil() { fulfilSheet.hidden = true; fulfilOrder = null; }
async function sendFulfil(kind, details) {
  const o = fulfilOrder; if (!o) return;
  const note = $("#fulfil-note"); note.textContent = "Sending…";
  const head = (kind === "delivery" ? "📦 DELIVERY" : "🤝 MEET UP") + " · " + o.item + " × " + o.quantity + " · " + money(o.total_amount);
  const message = head + (details ? "\n" + details : "") + " [order:" + o.id + "]";
  const { error } = await supabase.from("messages").insert({ customer_id: user.id, message });
  if (error) { console.error(error); note.textContent = "Could not send. Please try again."; return; }
  toast(kind === "delivery" ? "Delivery details sent with your order." : "Meet up requested. The owner has been notified.");
  closeFulfil();
  await Promise.all([loadMessages(), loadOrders()]);
}
$("#fulfil-choices").addEventListener("click", event => {
  const button = event.target.closest("[data-fulfil]"); if (!button) return;
  if (button.dataset.fulfil === "delivery") { $("#fulfil-choices").hidden = true; $("#delivery-form").hidden = false; $("#delivery-text").focus(); }
  else sendFulfil("meetup", "");
});
$("#delivery-form").addEventListener("submit", event => {
  event.preventDefault();
  const text = $("#delivery-text").value.trim();
  if (text) sendFulfil("delivery", text);
});
$("#delivery-back").addEventListener("click", () => { $("#delivery-form").hidden = true; $("#fulfil-choices").hidden = false; });
$("#fulfil-close").addEventListener("click", closeFulfil);
$("#fulfil-later").addEventListener("click", closeFulfil);
fulfilSheet.addEventListener("click", event => { if (event.target.id === "fulfil-sheet") closeFulfil(); });

/* ---------- the order chat: stays open for directions or changes until the owner marks the order done ---------- */
let threadOrderId = null;
const threadSheet = $("#thread-sheet");
function openThread(orderId) { threadOrderId = String(orderId); renderThread(); threadSheet.hidden = false; const log = $("#thread-log"); log.scrollTop = log.scrollHeight; }
function closeThread() { threadSheet.hidden = true; threadOrderId = null; }
function renderThread() {
  if (threadOrderId == null) return;
  const order = myOrders.find(o => String(o.id) === threadOrderId);
  if (!order) return;
  const thread = threadFor(order.id, myMessages), done = isDone(order, thread);
  $("#thread-sum").textContent = order.item + " × " + order.quantity + " · " + money(order.total_amount);
  $("#thread-status-line").innerHTML = done ? '<span class="status status-done">Done ✅</span>' : `<span class="status status-${cls(order.status)}">${statusLabel(order.status)}</span>`;
  $("#thread-choose").hidden = done || myChoice(thread);
  const bubbles = [];
  thread.forEach(m => {
    const t = parseTagged(m);
    if (t.kind !== "order") {
      const mine = t.kind === "delivery" ? "📦 Delivery" + (t.body ? "\n" + t.body : "") : t.kind === "meetup" ? "🤝 Meet up requested" + (t.body ? "\n" + t.body : "") : t.body;
      bubbles.push(`<div class="bubble me">${safe(mine)}<small>${when(m.created_at)}</small></div>`);
    }
    replyLines(m.reply).forEach(line => bubbles.push(`<div class="bubble them"><b>🕴️ Shadow</b>${safe(line)}</div>`));
  });
  if (done) bubbles.push('<div class="bubble sys">✅ Order complete</div>');
  const log = $("#thread-log"), atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40, keep = log.scrollTop;
  log.innerHTML = bubbles.join("") || '<p class="muted small">No messages yet. Add directions or changes below.</p>';
  log.scrollTop = atBottom ? log.scrollHeight : keep;
  $("#thread-form").hidden = done;
  $("#thread-closed").hidden = !done;
}
$("#thread-close").addEventListener("click", closeThread);
threadSheet.addEventListener("click", event => { if (event.target.id === "thread-sheet") closeThread(); });
$("#thread-choose-btn").addEventListener("click", () => {
  const order = myOrders.find(o => String(o.id) === threadOrderId);
  if (order) openFulfil(order);
});
$("#thread-form").addEventListener("submit", async event => {
  event.preventDefault();
  const input = $("#thread-input"), note = $("#thread-note"), text = input.value.trim();
  if (!text || threadOrderId == null) return;
  note.textContent = "Sending…";
  const { error } = await supabase.from("messages").insert({ customer_id: user.id, message: "💬 " + text + " [order:" + threadOrderId + "]" });
  if (error) { console.error(error); note.textContent = "Could not send. Please try again."; return; }
  input.value = ""; note.textContent = "";
  await loadMessages();
  const log = $("#thread-log"); log.scrollTop = log.scrollHeight;
});
$("#order-history").addEventListener("click", event => {
  const button = event.target.closest("[data-thread]"); if (button) openThread(button.dataset.thread);
});

/* ---------- member: order history + replies ---------- */
const seenOrders = new Map();
let ordersLoaded = false, myOrders = [], myMessages = [];
let myTab = "active";
function setMyTab(tab) {
  myTab = tab;
  $$("#my-tabs [data-tab]").forEach(btn => btn.classList.toggle("on", btn.dataset.tab === tab));
  renderMyOrders();
}
$("#my-tabs").addEventListener("click", event => { const btn = event.target.closest("[data-tab]"); if (btn) setMyTab(btn.dataset.tab); });
function renderMyOrders() {
  const rows = myOrders.map(o => { const thread = threadFor(o.id, myMessages); return { o, thread, done: isDone(o, thread), finished: isFinished(o, thread) }; });
  const active = rows.filter(r => !r.finished), history = rows.filter(r => r.finished);
  $("#my-tabs-count-active").textContent = active.length;
  $("#my-tabs-count-history").textContent = history.length;
  const list = myTab === "history" ? history : active;
  patch($("#order-history"), list.map(({ o, thread, done }) => {
    const pill = done ? '<span class="status status-done">Done ✅</span>' : `<span class="status status-${cls(o.status)}">${statusLabel(o.status)}</span>`;
    const info = `<div><b>${safe(o.item)}</b><small>${safe(o.quantity)} · ${money(o.total_amount)} · ${when(o.created_at)}</small></div>${pill}`;
    if (myTab === "history") return `<div class="row-card" data-order-card="${safe(o.id)}">${info}</div>`;   // the conversation is closed and gone
    const last = [...thread].reverse().flatMap(m => replyLines(m.reply).reverse())[0];
    return `<div class="row-card" data-order-card="${safe(o.id)}">${info}${last ? `<div class="reply">🕴️ ${safe(last)}</div>` : ""}<button type="button" class="ghost open-thread" data-thread="${safe(o.id)}">💬 Conversation · add directions or changes</button></div>`;
  }).join("") || (myTab === "history" ? "No past orders yet." : "No open orders."));
}
/* open an order from an alert: open orders open their chat, finished ones show in History */
function showOrder(id) {
  const order = myOrders.find(o => String(o.id) === String(id)); if (!order) return;
  if (isFinished(order, threadFor(order.id, myMessages))) {
    closeThread(); setMyTab("history");
    setTimeout(() => flash($('#order-history [data-order-card="' + id + '"]')), 100);
  } else { setMyTab("active"); openThread(id); }
}
async function loadOrders() {
  const { data, error } = await supabase.from("orders").select("id,item,quantity,total_amount,status,created_at")
    .eq("customer_id", user.id).order("created_at", { ascending: false }).limit(60);
  if (error) { $("#order-history").textContent = "Could not load orders."; return; }
  myOrders = data || [];
  renderMyOrders();
  renderThread();
  myOrders.forEach(o => {
    if (ordersLoaded && seenOrders.has(o.id) && seenOrders.get(o.id) !== o.status && cls(o.status) !== "pending") {
      toast("Lu’s Lounge: your order — " + String(STATUS_LABEL[cls(o.status)] || o.status), "alert", () => showOrder(o.id));
    }
    seenOrders.set(o.id, o.status);
  });
  ordersLoaded = true;
}

const seenReplies = new Map();
let messagesLoaded = false;
function openBath(messageId) {
  bathSheet.hidden = false;
  if (messageId != null) setTimeout(() => flash($('#message-history [data-msg-row="' + messageId + '"]')), 150);
}
async function loadMessages() {
  const { data, error } = await supabase.from("messages").select("*").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(600);
  const box = $("#message-history");
  if (error) { box.textContent = "Could not load messages."; return; }
  myMessages = data || [];
  // order conversations live on the order; only plain messages show in the bathroom window
  const plain = myMessages.filter(m => !parseTagged(m) && !hiddenIds.has(String(m.id)) && !hasDone(m));   // a closed conversation disappears
  box.innerHTML = plain.slice(0, 20).map(m => `<div class="row-card msg" data-msg-row="${safe(m.id)}"><div><b>You</b><small>${safe(m.message)}</small>${replyLines(m.reply).length ? `<div class="reply">🕴️ ${safe(replyLines(m.reply).join("\n"))}</div>` : ""}</div><button type="button" class="mini-del" data-del="${safe(m.id)}" aria-label="Delete this message">🗑</button></div>`).join("");
  $("#clear-chat").hidden = !plain.length;
  myMessages.forEach(m => {
    if (hiddenIds.has(String(m.id))) return;
    const key = m.id ?? m.created_at, t = parseTagged(m), lines = replyLines(m.reply).join("\n"), done = hasDone(m);
    const prev = seenReplies.get(key) || { lines: "", done: false };
    if (messagesLoaded) {
      if (lines && lines !== prev.lines && !(done && !t)) {
        if (t) toast("The shadow replied about your order.", "alert", () => showOrder(t.orderId));
        else toast("The shadow replied to your message.", "alert", () => openBath(m.id));
      }
      if (t && done && !prev.done) toast("Your order is complete ✅", "alert", () => showOrder(t.orderId));
    }
    seenReplies.set(key, { lines, done });
  });
  messagesLoaded = true;
  renderMyOrders();
  renderThread();
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

/* delete past conversations with the shadow (plain bathroom-window messages only; order chats are order records) */
async function deleteMessages(list) {
  const ids = list.map(m => m.id).filter(id => id != null);
  if (!ids.length) return;
  let removed = 0;
  const { data, error } = await supabase.from("messages").delete().in("id", ids).eq("customer_id", user.id).select("id");
  if (!error) removed = (data || []).length;
  if (removed < ids.length) rememberHidden(ids);            // database refused: at least take it out of this person's view
  toast(removed >= ids.length ? "Deleted." : "Removed from your view.");
  await loadMessages();
}
$("#message-history").addEventListener("click", event => {
  const button = event.target.closest("[data-del]"); if (!button) return;
  const message = myMessages.find(m => String(m.id) === button.dataset.del);
  if (message) deleteMessages([message]);
});
$("#clear-chat").addEventListener("click", async () => {
  const plain = myMessages.filter(m => !parseTagged(m) && !hiddenIds.has(String(m.id)) && !hasDone(m));
  if (plain.length && await ask("Delete your whole conversation with the shadow? This can't be undone.", "Delete")) deleteMessages(plain);
});
$("#sign-out").addEventListener("click", async () => {
  try { await window.nightshopPwa?.release?.(supabase); } catch { /* alerts cleanup is best effort */ }
  await supabase.auth.signOut(); location.reload();
});

/* ---------- owner tools ---------- */
let loadOwnerOrders = async () => {}, loadOwnerMessages = async () => {};
const ownerShow = { order() {}, message() {} };
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
  let ownerOrdersLoaded = false, ownerOrders = [], ownerMsgs = [];
  const ownerNames = new Map();
  const learnNames = async ids => { (await names(ids)).forEach((value, key) => ownerNames.set(key, value)); };

  const ownerBubbles = (thread, name) => thread.map(m => {
    const t = parseTagged(m), out = [];
    const theirs = t.kind === "delivery" ? "📦 Delivery" + (t.body ? "\n" + t.body : "") : t.kind === "meetup" ? "🤝 Meet up requested" + (t.body ? "\n" + t.body : "") : t.kind === "note" ? t.body : "";
    if (theirs) out.push(`<div class="bubble them">${safe(theirs)}<small>${safe(name)} · ${when(m.created_at)}</small></div>`);
    replyLines(m.reply).forEach(line => out.push(`<div class="bubble me"><b>You</b>${safe(line)}</div>`));
    return out.join("");
  }).join("");

  let ownerTab = "active";
  const ownerRows = () => ownerOrders.map(o => { const thread = threadFor(o.id, ownerMsgs, o.customer_id); return { o, thread, done: isDone(o, thread), finished: isFinished(o, thread) }; });
  // order chats show on their order card; show a message on its own only if no matching order is loaded
  const ownerPlain = () => ownerMsgs.filter(m => { const t = parseTagged(m); return !t || !ownerOrders.some(o => String(o.id) === t.orderId && o.customer_id === m.customer_id); });
  function refreshOwnerCounts() {
    const rows = ownerRows(), plain = ownerPlain();
    $("#owner-tabs-count-active").textContent = rows.filter(r => !r.finished).length + plain.filter(m => !hasDone(m)).length;
    $("#owner-tabs-count-history").textContent = rows.filter(r => r.finished).length + plain.filter(hasDone).length;
  }
  function setOwnerTab(tab) {
    ownerTab = tab;
    $$("#owner-tabs [data-tab]").forEach(btn => btn.classList.toggle("on", btn.dataset.tab === tab));
    $("#owner-orders-title").textContent = tab === "history" ? "PAST ORDERS" : "INCOMING ORDERS";
    $("#owner-messages-title").textContent = tab === "history" ? "OLD MESSAGES" : "CUSTOMER MESSAGES";
    renderOwnerOrders(); renderOwnerMessages();
  }
  $("#owner-tabs").addEventListener("click", event => { const btn = event.target.closest("[data-tab]"); if (btn) setOwnerTab(btn.dataset.tab); });

  function renderOwnerOrders() {
    const all = ownerRows();
    const rows = all.filter(r => ownerTab === "history" ? r.finished : !r.finished);
    const rank = r => cls(r.o.status) === "pending" ? 0 : 1;
    if (ownerTab === "active") rows.sort((x, y) => rank(x) - rank(y));
    refreshOwnerCounts();
    patch($("#owner-orders"), rows.map(({ o, thread, done }) => {
      const name = ownerNames.get(o.customer_id) || "Member";
      const target = [...thread].reverse().find(m => parseTagged(m).kind !== "order") || thread[thread.length - 1];
      const chat = thread.length
        ? `<div class="thread-box"><span class="fulfil-tag">CONVERSATION</span><div class="chat">${ownerBubbles(thread, name)}</div>${done ? '<div class="bubble sys">✅ Done</div>' : `<form class="msg-bar small-bar" data-msg="${safe(target.id ?? "")}" data-append="1"><input data-draft="r:${safe(target.id ?? "")}" name="reply" maxlength="500" placeholder="Reply to ${safe(name)}…" autocomplete="off" required><button type="submit" aria-label="Send reply">➤</button></form>`}</div>`
        : '<small class="pending-note">No conversation yet (older order)</small>';
      const pill = done ? '<span class="status status-done">Done ✅</span>' : `<span class="status status-${cls(o.status)}">${statusLabel(o.status)}</span>`;
      return `<div class="row-card order-card ${!done && cls(o.status) === "pending" ? "is-new" : ""} ${done ? "is-done" : ""}" data-order-card="${safe(o.id)}"><div><b>${safe(o.item)}</b><small>${safe(name)} · ${safe(o.quantity)} · ${money(o.total_amount)} · ${when(o.created_at)}</small></div>${pill}<div class="decide">${done ? `<button type="button" class="d-wait" data-reopen="${safe(o.id)}">↩ Reopen</button>` : `<button type="button" class="d-confirm" data-order="${safe(o.id)}" data-status="confirmed">Confirm</button><button type="button" class="d-deny" data-order="${safe(o.id)}" data-status="denied" ${cls(o.status) === "denied" ? "disabled" : ""}>Deny</button><button type="button" class="d-wait" data-order="${safe(o.id)}" data-status="waitlisted">Waitlist</button><button type="button" class="d-done" data-done="${safe(o.id)}">Done</button>`}</div>${chat}</div>`;
    }).join("") || (ownerTab === "history" ? "No past orders yet." : "No open orders."));
  }
  const orderCard = id => $('#owner-orders [data-order-card="' + id + '"]');

  loadOwnerOrders = async () => {
    const { data, error } = await supabase.from("orders").select("id,customer_id,item,quantity,total_amount,status,created_at").order("created_at", { ascending: false }).limit(100);
    if (error) { $("#owner-orders").textContent = "Could not load orders."; return; }
    ownerOrders = data || [];
    await learnNames(ownerOrders.map(o => o.customer_id));
    renderOwnerOrders();
    ownerOrders.forEach(o => {
      if (cls(o.status) === "pending" && !knownPending.has(o.id)) {
        if (ownerOrdersLoaded) toast("New order: " + o.item + " · " + money(o.total_amount), "alert", () => ownerShow.order(o.id));
        knownPending.add(o.id);
      }
    });
    ownerOrdersLoaded = true;
  };
  $("#owner-orders").addEventListener("click", async event => {
    const doneButton = event.target.closest("[data-done]");
    if (doneButton) { await markDone(doneButton.dataset.done); return; }
    const reopenButton = event.target.closest("[data-reopen]");
    if (reopenButton) { await reopenOrder(reopenButton.dataset.reopen); return; }
    const button = event.target.closest("[data-order]"); if (!button) return;
    button.disabled = true;
    const { error } = await supabase.from("orders").update({ status: button.dataset.status }).eq("id", button.dataset.order);
    if (error) { console.error(error); toast("Could not update that order.", "alert"); } else { toast("Order marked " + button.dataset.status + "."); }
    await loadOwnerOrders();
  });
  async function markDone(orderId) {
    const order = ownerOrders.find(o => String(o.id) === String(orderId)); if (!order) return;
    if (!(await ask("Mark this order done? The customer's chat for it will close.", "Mark done"))) return;
    const thread = threadFor(order.id, ownerMsgs, order.customer_id), last = thread[thread.length - 1];
    const result = last
      ? await supabase.from("messages").update({ reply: (last.reply ? last.reply + "\n" : "") + DONE }).eq("id", last.id).select("id")
      : await supabase.from("orders").update({ status: "done" }).eq("id", order.id).select("id");   // older order with no conversation
    if (result.error || !(result.data || []).length) { console.error(result.error); toast("Could not mark it done.", "alert"); return; }
    toast("Order marked done.");
    await Promise.all([loadOwnerMessages(), loadOwnerOrders()]);
  }

  async function reopenOrder(orderId) {
    const order = ownerOrders.find(o => String(o.id) === String(orderId)); if (!order) return;
    const marked = threadFor(order.id, ownerMsgs, order.customer_id).filter(hasDone);
    const results = marked.length
      ? await Promise.all(marked.map(m => supabase.from("messages").update({ reply: stripDone(m.reply) || null }).eq("id", m.id).select("id")))
      : [await supabase.from("orders").update({ status: "confirmed" }).eq("id", order.id).select("id")];
    if (results.some(r => r.error || !(r.data || []).length)) { toast("Could not reopen it.", "alert"); return; }
    toast("Order reopened.");
    await Promise.all([loadOwnerMessages(), loadOwnerOrders()]);
  }
  async function setMessageDone(id, done) {
    const m = ownerMsgs.find(x => String(x.id) === String(id)); if (!m) return;
    const reply = done ? (m.reply ? m.reply + "\n" : "") + DONE : (stripDone(m.reply) || null);
    const { data, error } = await supabase.from("messages").update({ reply }).eq("id", m.id).select("id");
    if (error || !(data || []).length) { console.error(error); toast("Could not update that message.", "alert"); return; }
    toast(done ? "Moved to History." : "Message reopened.");
    await loadOwnerMessages();
  }
  $("#owner-messages").addEventListener("click", event => {
    const d = event.target.closest("[data-msg-done]"), r = event.target.closest("[data-msg-reopen]");
    if (d) setMessageDone(d.dataset.msgDone, true);
    if (r) setMessageDone(r.dataset.msgReopen, false);
  });

  const knownMessages = new Set();
  let ownerMessagesLoaded = false;
  loadOwnerMessages = async () => {
    const { data, error } = await supabase.from("messages").select("*").order("created_at", { ascending: false }).limit(600);
    const box = $("#owner-messages");
    if (error) { box.textContent = "Could not load messages."; return; }
    ownerMsgs = data || [];
    await learnNames(ownerMsgs.map(m => m.customer_id));
    renderOwnerMessages();
    ownerMsgs.forEach(m => {
      const key = m.id ?? m.created_at;
      if (knownMessages.has(key)) return;
      knownMessages.add(key);
      if (!ownerMessagesLoaded || m.reply) return;
      const t = parseTagged(m), name = ownerNames.get(m.customer_id) || "Member";
      if (t && t.kind === "order") return;                      // the order alert already covers this one
      if (t) toast(name + " · " + kindLabel(t.kind) + (t.body ? ": " + t.body.slice(0, 50) : ""), "alert", () => ownerShow.order(t.orderId));
      else toast("New message from " + name + ": " + String(m.message).slice(0, 50), "alert", () => ownerShow.message(m.id));
    });
    ownerMessagesLoaded = true;
    renderOwnerOrders();
  };
  function renderOwnerMessages() {
    const box = $("#owner-messages");
    const plain = ownerPlain().filter(m => ownerTab === "history" ? hasDone(m) : !hasDone(m)).slice(0, 60);
    refreshOwnerCounts();
    patch(box, plain.map(m => {
      const name = safe(ownerNames.get(m.customer_id) || "Member");
      const lines = replyLines(m.reply).map(l => safe(l)).join("\n");
      const head = `<b>${name}</b><small>${safe(m.message.replace(TAG, ""))} · ${when(m.created_at)}</small>${lines ? `<div class="reply">You: ${lines}</div>` : ""}`;
      if (ownerTab === "history") return `<div class="row-card msg is-done" data-msg="${safe(m.id ?? "")}"><div>${head}</div><div class="decide"><button type="button" class="d-wait" data-msg-reopen="${safe(m.id ?? "")}">↩ Reopen</button></div></div>`;
      return `<form class="row-card msg reply-form" data-msg="${safe(m.id ?? "")}" data-append="1"><div>${head}<div class="msg-bar small-bar"><input data-draft="m:${safe(m.id ?? "")}" name="reply" maxlength="1000" placeholder="${lines ? "Send another reply…" : "Reply as the shadow…"}" autocomplete="off" required><button type="submit" aria-label="Send reply">➤</button></div><div class="decide"><button type="button" class="d-done" data-msg-done="${safe(m.id ?? "")}">✅ Done · move to history</button></div></div></form>`;
    }).join("") || (ownerTab === "history" ? "No old messages yet." : "No messages."));
  }
  ownerShow.order = id => {
    const row = ownerRows().find(r => String(r.o.id) === String(id));
    setOwnerTab(row && row.finished ? "history" : "active");
    setTimeout(() => flash(orderCard(id)), 100);
  };
  ownerShow.message = id => {
    const m = ownerMsgs.find(x => String(x.id) === String(id));
    setOwnerTab(m && hasDone(m) ? "history" : "active");
    setTimeout(() => flash($('#owner-messages [data-msg="' + id + '"]')), 100);
  };
  async function sendOwnerReply(event) {
    event.preventDefault();
    const formEl = event.target.closest("[data-msg]"); if (!formEl || !formEl.dataset.msg) { toast("This message has no id, so it can't be answered.", "alert"); return; }
    let text = formEl.elements.reply.value.trim(); if (!text) return;
    if (formEl.dataset.append) {                                // order chat: add to earlier replies instead of replacing them
      const current = ownerMsgs.find(m => String(m.id) === formEl.dataset.msg);
      if (current?.reply) text = current.reply + "\n" + text;
    }
    const { data, error } = await supabase.from("messages").update({ reply: text }).eq("id", formEl.dataset.msg).select("id");
    if (error || !(data || []).length) { console.error(error); toast("Could not send the reply.", "alert"); return; }
    formEl.elements.reply.value = "";
    toast("Reply sent.");
    await loadOwnerMessages();
  }
  $("#owner-messages").addEventListener("submit", sendOwnerReply);
  $("#owner-orders").addEventListener("submit", sendOwnerReply);

  const inviteUrl = () => location.origin + location.pathname.replace(/index\.html$/, "") + "?invite=1";
  $("#invite-share").addEventListener("click", async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Lu’s Lounge", text: "You're invited. Tap to enter Lu’s Lounge.", url: inviteUrl() });
      else throw new Error("no share");
    } catch (e) { if (e?.name !== "AbortError") $("#invite-note").textContent = "Sharing isn't available here. Tap Copy link instead."; }
  });
  $("#invite-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(inviteUrl()); $("#invite-note").textContent = "Link copied."; }
    catch { $("#invite-note").textContent = "Couldn't copy. Use the QR code or Share instead."; }
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

/* ---------- deep links: from a lock-screen notification or an in-app alert ---------- */
function handleGo(go) {
  const [kind, ...rest] = String(go || "").split(":"), id = rest.join(":");
  if (!kind || !id) return;
  if (kind === "o-order" && isOwner) ownerShow.order(id);
  else if (kind === "o-msg" && isOwner) ownerShow.message(id);
  else if (kind === "order" || kind === "history") showOrder(id);
  else if (kind === "msg") openBath(id);
}
try {
  const go = new URLSearchParams(location.search).get("go");
  if (go) { handleGo(go); history.replaceState(null, "", location.pathname); }
} catch { /* ignore */ }
navigator.serviceWorker?.addEventListener("message", event => { if (event.data?.type === "nightshop-go") handleGo(event.data.go); });
