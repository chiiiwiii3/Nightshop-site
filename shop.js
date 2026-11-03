import { supabase } from "./supabase-client.js";

const root = document.querySelector("#shop-app");
const { data: { user } } = await supabase.auth.getUser();
if (!user || !root) throw new Error("Member session unavailable");

const { data: profile, error: profileError } = await supabase.from("profiles")
  .select("display_name,is_owner,access_enabled").eq("id", user.id).single();
if (profileError || !profile?.access_enabled) {
  await supabase.auth.signOut();
  root.textContent = "Your membership is not active. Please contact the owner.";
  throw new Error("Membership disabled");
}

const safe = value => { const el = document.createElement("span"); el.textContent = value ?? ""; return el.innerHTML; };
const money = value => "$" + Number(value || 0).toFixed(2);
const choices = [
  { id: "ice", icon: "❄️", name: "Honeydrippers", detail: "Frozen Kool-Aid ice cups with candy and/or fruit", kind: "amount" },
  { id: "tea", icon: "🌴", name: "Herbal teas", detail: "Small or Big · choose a bundle", kind: "tea" },
  { id: "shot", icon: "⚕️", name: "Herbal shots", detail: "Small or Medium · priced per shot glass", kind: "shot" }
];

root.innerHTML = `
  <section class="shop-panel"><div class="row"><div><p class="muted">MEMBER LOUNGE</p><h2>Welcome in, ${safe(profile.display_name || "member")}</h2><p id="shop-state">Checking shop status…</p></div><button id="sign-out" type="button">Sign out</button></div></section>
  ${profile.is_owner ? '<section class="shop-panel" id="exterior-artwork-tools"><h2>EXTERIOR ARTWORK</h2><p class="muted">Upload the approved storefront picture from your phone Gallery. JPG, PNG, or WebP · up to 15 MB.</p><input id="exterior-upload" type="file" accept="image/jpeg,image/png,image/webp"><p id="exterior-upload-status" aria-live="polite"></p></section>' : ""}
  
  <section id="lounge-scene" aria-label="The Night Shop private lounge">
    <div class="lounge-ceiling"></div><h2 class="lounge-title">WELCOME TO THE PRIVATE LOUNGE</h2>
    <div class="lounge-hologram"><b>❄️</b><span>HONEYDRIPPERS</span></div>
    <div class="lounge-hologram h2"><b>🌴</b><span>HERBAL TEAS</span></div>
    <div class="lounge-hologram h3"><b>⚕️</b><span>HERBAL SHOTS</span></div>
    <div class="lounge-bar"></div><div class="lounge-sofa"></div><div class="lounge-pool"></div><div class="lounge-floor"></div>
    <div class="lounge-controls"><button type="button" id="lounge-lights">DIM THE LIGHTS</button><button type="button" id="lounge-view">CHANGE VIEW</button></div>
  </section>
  <section class="shop-panel"><h2>THE COLLECTION</h2><div id="catalog" class="product-grid"></div></section>
  <section class="shop-panel" id="order-panel" hidden><h3 id="order-title">Your order</h3><p id="order-detail"></p><div id="order-options"></div><button id="place-order">Submit order</button><p id="order-note" aria-live="polite"></p></section>
  <section class="shop-panel"><h2>YOUR ORDERS</h2><div id="order-history">Loading…</div></section>
  <section class="shop-panel"><h2>PRIVATE MESSAGE</h2><textarea id="member-message" rows="3" maxlength="1000" placeholder="Send the owner a private message"></textarea><button id="send-message">Send message</button><p id="message-note" aria-live="polite"></p><div id="message-history"></div></section>
  ${profile.is_owner ? '<section class="shop-panel"><h2>OWNER CONTROLS</h2><button id="toggle-shop">Toggle shop open / closed</button><div id="owner-orders"></div></section>' : ""}
`;

// Load the currently published exterior artwork for every visitor.
const exteriorImage = document.querySelector("#exterior-artwork");
if (exteriorImage) {
  const { data: exteriorUrl } = supabase.storage.from("nightshop-artwork").getPublicUrl("exterior/current");
  exteriorImage.onload = () => document.querySelector("#street-scene")?.classList.add("artwork-mode");
  exteriorImage.onerror = () => document.querySelector("#street-scene")?.classList.remove("artwork-mode");
  exteriorImage.src = exteriorUrl.publicUrl;
}

const catalog = root.querySelector("#catalog");
const panel = root.querySelector("#order-panel");
let selected = null, shopOpen = false;
catalog.innerHTML = choices.map(item => `<article class="product-card"><h3>${item.icon} ${item.name}</h3><p>${item.detail}</p><button data-product="${item.id}">Choose</button></article>`).join("");

async function refreshStatus() {
  const { data, error } = await supabase.from("shop_status").select("is_open").eq("id", 1).maybeSingle();
  shopOpen = !error && Boolean(data?.is_open);
  root.querySelector("#shop-state").textContent = shopOpen ? "● THE SHOP IS OPEN" : "● THE SHOP IS CLOSED";
  root.querySelectorAll("[data-product]").forEach(button => button.disabled = !shopOpen);
}
catalog.addEventListener("click", event => {
  const button = event.target.closest("[data-product]");
  if (!button || !shopOpen) return;
  selected = choices.find(item => item.id === button.dataset.product);
  root.querySelector("#order-title").textContent = selected.icon + " " + selected.name;
  root.querySelector("#order-detail").textContent = selected.detail;
  const options = root.querySelector("#order-options");
  if (selected.kind === "amount") {
    options.innerHTML = '<label>Spending amount (minimum $20)</label><input id="spend-amount" type="number" min="20" step="5" value="20">';
  } else if (selected.kind === "tea") {
    options.innerHTML = '<label>Size</label><select id="tea-size"><option>Small</option><option>Big</option></select><label>Bundle</label><select id="tea-qty"><option value="1">1</option><option value="2">2</option><option value="4">4</option></select><p id="tea-price"></p>';
    const update = () => { const q = Number(options.querySelector("#tea-qty").value); const unit = options.querySelector("#tea-size").value === "Small" ? 20 : 35; options.querySelector("#tea-price").textContent = money(q * unit); };
    options.querySelectorAll("select").forEach(el => el.addEventListener("change", update)); update();
  } else {
    options.innerHTML = '<label>Size</label><select id="shot-size"><option value="Small">Small — $5 each</option><option value="Medium">Medium — $10 each</option></select><label>Number of shots</label><input id="shot-qty" type="number" min="1" max="99" value="1"><p id="shot-price">$5.00</p>';
    const update = () => { const unit = options.querySelector("#shot-size").value === "Small" ? 5 : 10; options.querySelector("#shot-price").textContent = money(unit * Number(options.querySelector("#shot-qty").value || 1)); };
    options.querySelectorAll("select,input").forEach(el => el.addEventListener("input", update)); update();
  }
  root.querySelector("#order-note").textContent = "";
  panel.hidden = false;
});
root.querySelector("#place-order").addEventListener("click", async () => {
  const note = root.querySelector("#order-note");
  if (!shopOpen || !selected) { note.textContent = "The shop is closed."; return; }
  let item = selected.name, quantity = 1, total = 0;
  if (selected.kind === "amount") {
    total = Number(root.querySelector("#spend-amount").value);
    if (!Number.isFinite(total) || total < 20 || total > 10000 || total % 5 !== 0) { note.textContent = "Choose $20 or more in $5 steps."; return; }
    item += " · spending amount";
  } else if (selected.kind === "tea") {
    const size = root.querySelector("#tea-size").value; quantity = Number(root.querySelector("#tea-qty").value);
    total = (size === "Small" ? 20 : 35) * quantity; item += " · " + size;
  } else {
    const size = root.querySelector("#shot-size").value; quantity = Number(root.querySelector("#shot-qty").value);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) { note.textContent = "Choose 1–99 shots."; return; }
    total = (size === "Small" ? 5 : 10) * quantity; item += " · " + size;
  }
  const button = root.querySelector("#place-order"); button.disabled = true; note.textContent = "Submitting…";
  const { error } = await supabase.from("orders").insert({ customer_id: user.id, item, quantity, total_amount: total });
  button.disabled = false;
  if (error) { console.error(error); note.textContent = "Could not submit order. Please try again."; return; }
  note.textContent = "Order submitted. The owner will review it."; await loadOrders();
});
async function loadOrders() {
  const { data, error } = await supabase.from("orders").select("item,quantity,total_amount,status,created_at").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(10);
  root.querySelector("#order-history").innerHTML = error ? "Could not load orders." : (data || []).map(o => `<p><strong>${safe(o.item)}</strong> · ${o.quantity} · ${money(o.total_amount)}<br><small>${safe(o.status)} · ${new Date(o.created_at).toLocaleString()}</small></p>`).join("") || "No orders yet.";
}
root.querySelector("#send-message").addEventListener("click", async () => {
  const input = root.querySelector("#member-message"), note = root.querySelector("#message-note"), message = input.value.trim();
  if (!message) { note.textContent = "Type a message first."; return; }
  const { error } = await supabase.from("messages").insert({ customer_id: user.id, message });
  note.textContent = error ? "Message could not be sent." : "Message sent privately.";
  if (!error) { input.value = ""; await loadMessages(); }
});
async function loadMessages() {
  const { data, error } = await supabase.from("messages").select("message,reply,created_at").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(10);
  root.querySelector("#message-history").innerHTML = error ? "Could not load messages." : (data || []).map(m => `<p>${safe(m.message)}${m.reply ? '<br><small>Owner reply: ' + safe(m.reply) + '</small>' : ""}</p>`).join("");
}
root.querySelector("#sign-out").addEventListener("click", async () => { await supabase.auth.signOut(); location.reload(); });
if (profile.is_owner) {
  const artworkInput = root.querySelector("#exterior-upload");
  const artworkStatus = root.querySelector("#exterior-upload-status");
  artworkInput?.addEventListener("change", async () => {
    const file = artworkInput.files?.[0];
    if (!file) return;
    if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) {
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
      image.onload = () => {
        document.querySelector("#street-scene")?.classList.add("artwork-mode");
        artworkStatus.textContent = "Exterior artwork is live.";
      };
      image.onerror = () => { artworkStatus.textContent = "Uploaded, but the preview could not load. Refresh and try again."; };
      image.src = data.publicUrl + "?v=" + Date.now();
    } catch (error) {
      console.error("Exterior artwork upload failed:", error);
      artworkStatus.textContent = "Upload failed: " + (error?.message || "Please try again.");
    } finally {
      artworkInput.disabled = false;
    }
  });
  root.querySelector("#toggle-shop").addEventListener("click", async () => {
    const { error } = await supabase.from("shop_status").update({ is_open: !shopOpen, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) root.querySelector("#shop-state").textContent = "Could not update shop status."; else await refreshStatus();
  });
  async function loadOwnerOrders() {
    const { data, error } = await supabase.from("orders").select("id,item,quantity,total_amount,status,created_at").order("created_at", { ascending: false }).limit(30);
    root.querySelector("#owner-orders").innerHTML = error ? "Could not load orders." : (data || []).map(o => `<article><strong>${safe(o.item)}</strong> · ${o.quantity} · ${money(o.total_amount)} · ${safe(o.status)}<div>${["confirmed","denied","waitlisted"].map(s => `<button data-order="${o.id}" data-status="${s}">${s}</button>`).join(" ")}</div></article>`).join("") || "No orders yet.";
  }
  root.querySelector("#owner-orders").addEventListener("click", async event => {
    const b = event.target.closest("[data-order]"); if (!b) return;
    const { error } = await supabase.from("orders").update({ status: b.dataset.status }).eq("id", b.dataset.order);
    if (error) alert("Could not update order."); else await loadOwnerOrders();
  });
  await loadOwnerOrders();
}
await Promise.all([refreshStatus(), loadOrders(), loadMessages()]);
// Lounge ambience controls
const loungeScene = root.querySelector("#lounge-scene");
root.querySelector("#lounge-lights")?.addEventListener("click", event => {
  loungeScene?.classList.toggle("lights-low");
  event.currentTarget.textContent = loungeScene?.classList.contains("lights-low") ? "RESTORE LIGHTS" : "DIM THE LIGHTS";
});
root.querySelector("#lounge-view")?.addEventListener("click", () => {
  loungeScene?.classList.toggle("alternate-view");
  if (loungeScene) loungeScene.style.backgroundPosition = loungeScene.classList.contains("alternate-view") ? "right center" : "center";
  loungeScene?.scrollIntoView({behavior:"smooth",block:"center"});
});
