/* Installable app + lock-screen alerts (Web Push). Exposes window.nightshopPwa. */
const VAPID_PUBLIC_KEY = "BFsjnxSrEUlVHC5-RySJwjLb9feks9cYTzdUx-0FvSqJpaJysVL7Ch9srsBncFeDRQu1VAbPUyL6saOaKpbJr8M";

const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let installEvent = null, registration = null;
const panels = [];

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then(r => { registration = r; refresh(); }).catch(e => console.warn("Service worker failed:", e));
}
addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; refresh(); });
addEventListener("appinstalled", () => { installEvent = null; refresh(); });

const b64 = s => { const p = "=".repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(r, c => c.charCodeAt(0)); };
const key = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function sheet() {
  let el = document.querySelector("#install-sheet");
  if (!el) {
    el = document.createElement("div");
    el.id = "install-sheet"; el.className = "sheet"; el.hidden = true;
    el.innerHTML = '<div class="sheet-card" role="dialog" aria-modal="true"><button type="button" class="sheet-close" aria-label="Close">×</button><h2>INSTALL THE APP</h2><div class="install-steps"></div></div>';
    el.addEventListener("click", e => { if (e.target === el || e.target.closest(".sheet-close")) el.hidden = true; });
    document.body.append(el);
  }
  return el;
}
async function openInstall() {
  if (installEvent) {
    installEvent.prompt();
    try { await installEvent.userChoice; } catch { /* ignore */ }
    installEvent = null; refresh(); return;
  }
  const el = sheet();
  el.querySelector(".install-steps").innerHTML = isIOS
    ? '<ol class="small"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>Lu’s Lounge</b> from your Home Screen and sign in there. Alerts only work from the Home Screen app on iPhone.</li></ol>'
    : '<ol class="small"><li>Open the browser menu <b>⋮</b> (top right in Chrome).</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Open <b>Lu’s Lounge</b> from your home screen.</li></ol>';
  el.hidden = false;
}

const footerBtn = () => document.querySelector("#install-btn");
function refresh() {
  const b = footerBtn();
  if (b) b.hidden = standalone();
  panels.forEach(fn => fn());
}
document.addEventListener("click", e => { if (e.target.closest("#install-btn")) openInstall(); });
if (document.readyState !== "loading") refresh(); else addEventListener("DOMContentLoaded", refresh);

async function current() {
  if (!("serviceWorker" in navigator)) return null;
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { return null; }
}

async function enable(supabase) {
  if (!pushOK()) throw new Error(isIOS && !standalone() ? "On iPhone, install the app to your Home Screen first, then turn alerts on inside it." : "This browser can't receive alerts.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked. Allow them in your phone's settings for this app, then try again.");
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const want = b64(VAPID_PUBLIC_KEY);
  if (sub && sub.options?.applicationServerKey && key(sub.options.applicationServerKey) !== VAPID_PUBLIC_KEY) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want });
  const j = sub.toJSON();
  const { error } = await supabase.rpc("register_push", { p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) {
    console.error("register_push failed:", error);
    throw new Error("Alerts aren't set up on the server yet (the owner needs to run the alert setup). " + (error.message || ""));
  }
}
async function disable(supabase) {
  const sub = await current();
  if (sub) { try { await supabase.rpc("unregister_push", { p_endpoint: sub.endpoint }); } catch { /* ignore */ } await sub.unsubscribe(); }
}
// on sign out: stop alerts for this phone so the next person to sign in doesn't get this account's alerts
async function release(supabase) { try { await disable(supabase); } catch { /* ignore */ } }

function mountPanel(el, { supabase, toast }) {
  if (!el) return;
  el.hidden = false;
  const draw = async () => {
    const sub = await current();
    const on = Boolean(sub) && Notification.permission === "granted";
    let msg;
    if (standalone()) msg = "📲 App installed.";
    else if (isIOS) msg = "📲 Add this to your Home Screen to install it. (Required for alerts on iPhone.)";
    else msg = installEvent ? "📲 You can install this as an app." : "📲 Install it from your browser menu for a full-screen app.";
    const alerts = !pushOK()
      ? (isIOS && !standalone() ? "🔕 Lock-screen alerts need the Home Screen app on iPhone." : "🔕 Lock-screen alerts aren't supported in this browser.")
      : Notification.permission === "denied" ? "🔕 Alerts are blocked in your phone settings."
      : on ? "🔔 Lock-screen alerts are ON for this phone." : "🔕 Lock-screen alerts are off.";
    el.innerHTML = '<h2>APP &amp; ALERTS</h2><p class="app-state">' + msg + '</p><p class="app-state">' + alerts + '</p><div class="app-row">' +
      (standalone() ? "" : '<button type="button" class="ghost" data-app="install">Install the app</button>') +
      (pushOK() ? (on ? '<button type="button" class="ghost" data-app="off">Turn alerts off</button>' : '<button type="button" data-app="on">Turn on lock-screen alerts</button>') : "") +
      "</div>";
  };
  el.addEventListener("click", async e => {
    const btn = e.target.closest("[data-app]"); if (!btn) return;
    btn.disabled = true;
    try {
      if (btn.dataset.app === "install") await openInstall();
      if (btn.dataset.app === "on") { await enable(supabase); toast("Lock-screen alerts are on for this phone. 🔔"); }
      if (btn.dataset.app === "off") { await disable(supabase); toast("Alerts turned off for this phone."); }
    } catch (err) { toast(err.message || "That didn't work.", "alert"); }
    draw();
  });
  panels.push(draw); draw();
}

/* Invitation link (?invite=1): in a normal browser, show an install screen first. */
function inviteGate() {
  let invited = false;
  try { invited = new URLSearchParams(location.search).get("invite") === "1"; } catch { /* ignore */ }
  if (!invited || standalone()) return;
  const el = document.createElement("div");
  el.id = "invite-gate"; el.className = "invite-gate";
  const steps = isIOS
    ? '<ol class="small"><li>Tap the <b>Share</b> button (square with an arrow). Use <b>Safari</b> if you opened this in another app.</li><li>Tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open <b>Lu’s Lounge</b> from your Home Screen. Come back here only to add it.</li></ol>'
    : '<p class="small" id="gate-help">Tap the button below to add it to your home screen.</p>';
  el.innerHTML = '<div class="gate-card"><div class="crest">♛</div><h1>LU’S LOUNGE</h1><p class="small">You\'re invited. Add the app to your phone to come in.</p>' + steps +
    (isIOS ? "" : '<button type="button" id="gate-install" class="order-go">📲 ADD TO HOME SCREEN</button>') +
    (isIOS ? "" : '<button type="button" class="ghost" id="gate-skip">Continue in browser</button>') + '</div>';   // iPhones: Home Screen only, no browser option
  document.body.append(el);
  const close = () => { el.remove(); try { history.replaceState(null, "", location.pathname); } catch { /* ignore */ } };
  el.querySelector("#gate-skip")?.addEventListener("click", close);
  el.querySelector("#gate-install")?.addEventListener("click", async () => {
    if (installEvent) { installEvent.prompt(); try { await installEvent.userChoice; } catch { /* ignore */ } installEvent = null; close(); }
    else el.querySelector("#gate-help").textContent = "Open your browser menu (⋮) and tap Install app or Add to Home screen.";
  });
  addEventListener("appinstalled", close);
}
if (document.readyState !== "loading") inviteGate(); else addEventListener("DOMContentLoaded", inviteGate);

window.nightshopPwa = { mountPanel, release, openInstall };

/* the close button is painted into the corner of every pop-up frame: tapping that corner closes it */
document.addEventListener("click", e => {
  const card = e.target.classList && e.target.classList.contains("sheet-card") ? e.target : null;
  if (!card) return;
  const r = card.getBoundingClientRect();
  if (e.clientX > r.right - 48 && e.clientY < r.top + 44) card.querySelector(".sheet-close")?.click();
});
