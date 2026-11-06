/* Lu’s Lounge in real 3D. Look around by dragging, walk by tapping the floor (or WASD / arrow keys).
   Everything is built from simple shapes and painted textures, so there are no model files to download.
   To add something new to the room, put it in room-extras.js. */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { addExtras } from "./room-extras.js?v=1";

/* ---------- small helpers ---------- */
const rng = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function canvasTex(w, h, draw, { repeat, srgb = true } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function marbleTex(w, h, seed, gold = "#d9b25a", veins = 34) {
  return canvasTex(w, h, (g, W, H) => {
    const r = rng(seed);
    g.fillStyle = "#06080a"; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) {
      const x = r() * W, y = r() * H, rad = 60 + r() * 220;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, "rgba(28,40,36,.30)"); grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    g.lineCap = "round"; g.lineJoin = "round";
    const vein = (x, y, ang, len, width, alpha, col = gold) => {
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < len; s++) {
        ang += (r() - 0.5) * 0.55; x += Math.cos(ang) * (8 + r() * 14); y += Math.sin(ang) * (8 + r() * 14);
        g.lineTo(x, y);
        if (r() < 0.05 && width > 0.6) vein(x, y, ang + (r() - 0.5) * 2, 6 + (r() * 14 | 0), width * 0.6, alpha * 0.8, col);
      }
      g.strokeStyle = col; g.globalAlpha = alpha; g.lineWidth = width; g.shadowColor = col; g.shadowBlur = 2; g.stroke();
      g.globalAlpha = 1; g.shadowBlur = 0;
    };
    for (let i = 0; i < veins; i++) vein(r() * W, r() * H, r() * Math.PI * 2, 18 + (r() * 40 | 0), 0.5 + r() * 1.3, 0.3 + r() * 0.45);
    for (let i = 0; i < veins * 0.8; i++) vein(r() * W, r() * H, r() * Math.PI * 2, 14 + (r() * 30 | 0), 0.4 + r() * 0.9, 0.12 + r() * 0.2, "#a9b8b0");
    for (let i = 0; i < 5000; i++) { g.fillStyle = "rgba(255,255,255," + r() * 0.05 + ")"; g.fillRect(r() * W, r() * H, 1.5, 1.5); }
  });
}
const glow = (g, color, blur) => { g.shadowColor = color; g.shadowBlur = blur; };
function crownPath(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx - s, cy + s * 0.55); g.lineTo(cx - s * 1.05, cy - s * 0.55); g.lineTo(cx - s * 0.5, cy - s * 0.05);
  g.lineTo(cx, cy - s * 0.85); g.lineTo(cx + s * 0.5, cy - s * 0.05); g.lineTo(cx + s * 1.05, cy - s * 0.55);
  g.lineTo(cx + s, cy + s * 0.55); g.closePath();
}

/* ---------- materials ---------- */
const M = {
  gold: new THREE.MeshStandardMaterial({ color: 0xd8ab4a, metalness: 1, roughness: 0.28 }),
  goldDim: new THREE.MeshStandardMaterial({ color: 0x8a6a2a, metalness: 1, roughness: 0.4 }),
  leather: new THREE.MeshPhysicalMaterial({ color: 0x0e0e11, roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4, bumpMap: canvasTex(256, 256, (g, w, h) => { const r = rng(3); g.fillStyle = "#808080"; g.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const v = 100 + (r() * 60 | 0); g.fillStyle = "rgb(" + v + "," + v + "," + v + ")"; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 1.6, 0, 7); g.fill(); } }, { repeat: [3, 3], srgb: false }), bumpScale: 1.2, sheen: 0.4, sheenColor: new THREE.Color(0x2a3a30) }),
  dark: new THREE.MeshStandardMaterial({ color: 0x07090b, roughness: 0.6, metalness: 0.2 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 0.5, metalness: 0.1 }),
  felt: new THREE.MeshStandardMaterial({ color: 0x0a7a38, roughness: 0.95, metalness: 0 }),
  velvet: new THREE.MeshStandardMaterial({ color: 0x07281a, roughness: 0.95, metalness: 0 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x1c7a2c, roughness: 0.7, emissive: 0x06300f, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
  neonGreen: new THREE.MeshBasicMaterial({ color: 0x31ff80, toneMapped: false }),
  neonGold: new THREE.MeshBasicMaterial({ color: 0xffc860, toneMapped: false }),
  neonPurple: new THREE.MeshBasicMaterial({ color: 0xa24dff, toneMapped: false }),
  warm: new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false })
};
const lit = (m, mat) => { if (mat.isMeshStandardMaterial) m.castShadow = m.receiveShadow = true; return m; };
const box = (w, h, d, mat, x = 0, y = 0, z = 0, parent) => {
  const m = lit(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), mat); m.position.set(x, y, z); parent?.add(m); return m;
};
const rbox = (w, h, d, mat, x = 0, y = 0, z = 0, parent) => {
  const m = lit(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(0.09, Math.min(w, h, d) * 0.45)), mat), mat); m.position.set(x, y, z); parent?.add(m); return m;
};
const aoMat = new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, "rgba(0,0,0,.8)"); gr.addColorStop(0.55, "rgba(0,0,0,.4)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }), transparent: true, depthWrite: false, toneMapped: false });
const cyl = (rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 28, parent) => {
  const m = lit(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), mat); m.position.set(x, y, z); parent?.add(m); return m;
};

/* ---------- the room ---------- */
export function createRoom(container, hooks = {}) {
  const W = 18, D = 12, H = 4.4;                       // metres: x from -9..9, z from -6..6
  const colliders = [];                                // boxes you can't walk through: [minX, maxX, minZ, maxZ]
  const interactive = [];                              // things you can tap
  const animated = [];                                 // per-frame functions
  const lights = [];
  const ao = (x, z, w, d, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), aoMat); m.rotation.order = "YXZ"; m.rotation.set(-Math.PI / 2, ry, 0); m.position.set(x, 0.016, z); m.renderOrder = 2; scene.add(m); };

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  const coarse = matchMedia("(pointer: coarse)").matches;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;   // the room is still, so shadows are drawn once
  renderer.domElement.className = "room3d-canvas";
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010302);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 60);
  const eye = 1.62;
  camera.position.set(0.6, eye, 3.6);
  let yaw = 0.18, pitch = -0.04;                       // yaw 0 = looking at the sign wall

  /* ----- lighting ----- */
  scene.add(new THREE.HemisphereLight(0x2e6a4a, 0x050505, 0.6));
  const pt = (color, intensity, x, y, z, dist = 14) => { const l = new THREE.PointLight(color, intensity, dist, 2); l.position.set(x, y, z); scene.add(l); lights.push(l); return l; };
  pt(0xffd9a0, 18, 0, 3.4, -1, 14);
  const sm = coarse ? 512 : 1024;
  const spot = (x, z, tx, tz, color, intensity) => { const l = new THREE.SpotLight(color, intensity, 12, 0.85, 0.8, 2); l.position.set(x, H - 0.3, z); l.target.position.set(tx, 0, tz); scene.add(l, l.target); l.castShadow = true; l.shadow.mapSize.set(sm, sm); l.shadow.bias = -0.0004; l.shadow.normalBias = 0.03; l.shadow.camera.near = 0.5; l.shadow.camera.far = 10; };
  spot(1.2, -1, 0, -1, 0xffe0b0, 90); spot(0, -3.2, 0, -4.2, 0xffd9a0, 70); spot(5.6, -0.3, 5.6, -0.3, 0xffd8a0, 60); spot(6.2, 3.4, 6.2, 3.4, 0xffe0b0, 55); spot(-5.4, 1.6, -5.6, 1.6, 0xb8ffd0, 50);                    // chandelier
  pt(0x2cff7a, 14, -5, 3.9, 0, 14);
  pt(0x2cff7a, 14, 5, 3.9, 0, 14);
  pt(0xffb870, 9, 0, 2.6, -4.6, 9);                  // sign wall
  pt(0x4a7cff, 10, -8.2, 2.1, 1.5, 7);                 // TV
  pt(0xffa050, 12, 8.0, 2.2, 1.5, 9);                  // windows and painting

  /* ----- floor ----- */
  const floorTex = marbleTex(2048, 1536, 11, "#e0b85c", 70);
  const mirror = !coarse;                                // real reflections on computers; phones use the shiny finish only
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.14, metalness: mirror ? 0.2 : 0.55, envMapIntensity: 1.4, transparent: mirror, opacity: mirror ? 0.8 : 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  if (mirror) { const rf = new Reflector(new THREE.PlaneGeometry(W, D), { clipBias: 0.003, textureWidth: 1024, textureHeight: 768, color: 0x9aa09c }); rf.rotation.x = -Math.PI / 2; rf.position.y = -0.004; scene.add(rf); }
  // green glow strips on the floor along the walls
  for (const [w, d, x, z] of [[W - 1, 0.1, 0, -5.55], [W - 1, 0.1, 0, 5.55], [0.1, D - 1, -8.55, 0], [0.1, D - 1, 8.55, 0]]) box(w, 0.02, d, M.neonGreen, x, 0.012, z, scene);
  box(7.5, 0.02, 0.07, M.neonGreen, 0, 0.012, -3.0, scene); box(7.5, 0.02, 0.07, M.neonGreen, 0, 0.012, 1.0, scene);

  /* ----- walls and ceiling ----- */
  const wallMat = (seed, rx, ry) => { const t = marbleTex(1024, 512, seed, "#9a7a38", 14); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.32, metalness: 0.25 }); };
  const wall = (w, h, mat, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.receiveShadow = true; m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); return m; };
  wall(W, H, wallMat(21, 3, 1), 0, H / 2, -D / 2, 0);                  // back
  wall(W, H, wallMat(22, 3, 1), 0, H / 2, D / 2, Math.PI);             // front (behind you at the start)
  wall(D, H, wallMat(23, 2, 1), -W / 2, H / 2, 0, Math.PI / 2);        // left
  wall(D, H, wallMat(24, 2, 1), W / 2, H / 2, 0, -Math.PI / 2);        // right
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0x050605, roughness: 0.5, metalness: 0.3 }));
  ceil.rotation.x = Math.PI / 2; ceil.position.y = H; scene.add(ceil);
  // gold trim and pilasters
  for (const y of [0.12, 3.9]) { box(W, 0.07, 0.05, M.gold, 0, y, -D / 2 + 0.03, scene); box(W, 0.07, 0.05, M.gold, 0, y, D / 2 - 0.03, scene); box(0.05, 0.07, D, M.gold, -W / 2 + 0.03, y, 0, scene); box(0.05, 0.07, D, M.gold, W / 2 - 0.03, y, 0, scene); }
  for (const x of [-8, -4, 4, 8]) { box(0.35, H, 0.12, M.dark, x, H / 2, -D / 2 + 0.06, scene); box(0.05, H, 0.14, M.gold, x - 0.17, H / 2, -D / 2 + 0.07, scene); box(0.05, H, 0.14, M.gold, x + 0.17, H / 2, -D / 2 + 0.07, scene); }
  // ceiling coves: glowing green rings and a gold one, stepping up toward the middle
  const ring = (w, d, y, mat, t = 0.09) => { box(w, 0.05, t, mat, 0, y, -d / 2, scene); box(w, 0.05, t, mat, 0, y, d / 2, scene); box(t, 0.05, d, mat, -w / 2, y, 0, scene); box(t, 0.05, d, mat, w / 2, y, 0, scene); };
  ring(W - 0.6, D - 0.6, H - 0.06, M.neonGreen, 0.14); ring(15.5, 9.6, H - 0.4, M.neonGreen, 0.12); ring(12, 7.2, H - 0.7, M.neonGold, 0.07); ring(9.2, 5.2, H - 0.9, M.neonGreen, 0.1);
  box(15.5, 0.4, 9.6, M.dark, 0, H - 0.22, 0, scene).material = new THREE.MeshStandardMaterial({ color: 0x020302, roughness: 0.6 }); // soffit box above the rings
  scene.children[scene.children.length - 1].visible = false;

  /* ----- chandelier ----- */
  {
    const g = new THREE.Group(); g.position.set(0, H - 0.9, -1);
    cyl(1.9, 1.9, 0.1, M.gold, 0, 0.55, 0, 40, g); cyl(1.5, 1.5, 0.1, M.neonGreen, 0, 0.45, 0, 40, g); cyl(1.1, 1.1, 0.12, M.gold, 0, 0.35, 0, 40, g);
    cyl(0.03, 0.03, 0.6, M.gold, 0, 0.0, 0, 8, g);
    const crystal = new THREE.MeshStandardMaterial({ color: 0xfff1cf, emissive: 0xffd18a, emissiveIntensity: 0.5, roughness: 0.1, metalness: 0.2 });
    const geo = new THREE.OctahedronGeometry(0.06, 0), r = rng(5);
    for (let i = 0; i < 90; i++) {
      const t = i / 90, ang = i * 2.399, rad = 0.12 + t * 0.7, y = -0.1 - (1 - t) * 0.65 + r() * 0.08;
      const m = new THREE.Mesh(geo, crystal); m.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad); m.scale.set(1, 1.8 + r(), 1); g.add(m);
    }
    g.traverse(o => { o.castShadow = false; });
    scene.add(g);
  }

  /* ----- the Lu’s Lounge sign wall ----- */
  {
    const panel = box(8, 3.3, 0.12, new THREE.MeshStandardMaterial({ map: marbleTex(1024, 512, 33, "#e0b85c", 30), roughness: 0.22, metalness: 0.4 }), 0.4, 2.15, -D / 2 + 0.08, scene);
    for (const [w, h, x, y] of [[8.1, 0.06, 0.4, 3.82], [8.1, 0.06, 0.4, 0.5], [0.06, 3.36, -3.65, 2.15], [0.06, 3.36, 4.45, 2.15]]) box(w, h, 0.07, M.neonGreen, x, y, -D / 2 + 0.16, scene);
    const signTex = canvasTex(1024, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.textAlign = "center"; g.textBaseline = "middle";
      glow(g, "#ffb040", 28); g.strokeStyle = "#ffd88a"; g.lineWidth = 7; crownPath(g, w / 2, 130, 62); g.stroke();
      g.fillStyle = "#ffe0a0"; for (const dx of [-62, 0, 62]) { g.beginPath(); g.arc(w / 2 + dx, 60 - (dx === 0 ? 0 : -22), 8, 0, 7); g.fill(); }
      g.font = "italic 190px Georgia, 'Times New Roman', serif"; g.lineWidth = 7; g.strokeStyle = "#ffd88a"; g.fillStyle = "#fff0c8";
      g.strokeText("Lu’s Lounge", w / 2, 330); glow(g, "#ffa020", 10); g.fillText("Lu’s Lounge", w / 2, 330);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.2), new THREE.MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false }));
    sign.position.set(0.4, 2.15, -D / 2 + 0.17); scene.add(sign);
  }

  /* ----- bathroom door (tap it for the shadow) ----- */
  {
    const g = new THREE.Group(); g.position.set(-5.6, 0, -D / 2 + 0.06);
    box(1.5, 2.6, 0.1, M.gold, 0, 1.3, 0, g);
    const door = box(1.25, 2.45, 0.12, new THREE.MeshStandardMaterial({ color: 0x120a07, roughness: 0.45, metalness: 0.15 }), 0, 1.25, 0.03, g);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.9), new THREE.MeshBasicMaterial({ map: canvasTex(512, 400, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.textAlign = "center"; c.textBaseline = "middle"; glow(c, "#ffb040", 14);
      c.strokeStyle = "#ffd88a"; c.lineWidth = 6; crownPath(c, w / 2, 110, 52); c.stroke();
      c.fillStyle = "#ffe3a8"; c.font = "bold 64px Georgia, serif"; c.fillText("BATHROOM", w / 2, 270);
    }), transparent: true, toneMapped: false }));
    label.position.set(0, 1.7, 0.1); g.add(label);
    box(0.06, 0.2, 0.08, M.gold, 0.5, 1.1, 0.12, g); box(0.06, 0.2, 0.08, M.gold, -0.5, 1.1, 0.12, g);
    // a soft ring so it reads as tappable
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 2.8), new THREE.MeshBasicMaterial({ color: 0xffd36a, transparent: true, opacity: 0.0, toneMapped: false, depthWrite: false }));
    halo.position.set(0, 1.3, 0.14); g.add(halo);
    door.userData.action = "bath"; halo.userData.action = "bath"; interactive.push(door, halo);
    animated.push(t => { halo.material.opacity = 0.04 + 0.04 * Math.sin(t * 2.2); });
    scene.add(g);
  }

  /* ----- city skyline texture, used for the TV and the windows ----- */
  const skyline = (seed, sunset) => canvasTex(1024, 512, (g, w, h) => {
    const r = rng(seed), sky = g.createLinearGradient(0, 0, 0, h);
    if (sunset) { sky.addColorStop(0, "#14123a"); sky.addColorStop(0.55, "#5a2a6a"); sky.addColorStop(0.8, "#e0703a"); sky.addColorStop(1, "#ffb060"); }
    else { sky.addColorStop(0, "#0a0a28"); sky.addColorStop(0.7, "#3a2a7a"); sky.addColorStop(1, "#d070c0"); }
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    const water = g.createLinearGradient(0, h * 0.72, 0, h); water.addColorStop(0, "#1a2a5a"); water.addColorStop(1, "#06081a");
    for (let layer = 0; layer < 2; layer++) {
      g.fillStyle = layer ? "#0b0b1c" : "#15152e";
      for (let x = 0; x < w; x += 18 + r() * 26) { const bw = 20 + r() * 40, bh = 60 + r() * (layer ? 170 : 120); g.fillRect(x, h * 0.72 - bh, bw, bh); if (layer) { g.fillStyle = "#ffd78a"; for (let k = 0; k < 14; k++) g.fillRect(x + 4 + r() * (bw - 8), h * 0.72 - bh + 6 + r() * (bh - 10), 3, 4); g.fillStyle = "#0b0b1c"; } }
    }
    g.fillStyle = water; g.fillRect(0, h * 0.72, w, h * 0.28);
    for (let i = 0; i < 80; i++) { g.fillStyle = "rgba(255,200,140," + (0.1 + r() * 0.25) + ")"; g.fillRect(r() * w, h * 0.74 + r() * h * 0.25, 4 + r() * 24, 2); }
  });

  /* ----- left wall: TV, fireplace, shelves, arcade ----- */
  {
    const x = -W / 2 + 0.06;
    box(0.1, 2.0, 3.9, M.dark, x, 2.35, 1.6, scene);
    const tv = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 1.8), new THREE.MeshBasicMaterial({ map: skyline(4, false), toneMapped: false })); tv.rotation.y = Math.PI / 2; tv.position.set(x + 0.07, 2.35, 1.6); scene.add(tv);
    box(0.12, 0.8, 3.9, M.dark, x + 0.02, 0.85, 1.6, scene);
    const fire = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(512, 64, (g, w, h) => {
      g.fillStyle = "#050303"; g.fillRect(0, 0, w, h); const r = rng(9);
      for (let i = 0; i < 90; i++) { const fx = r() * w, fh = 18 + r() * 40, gr = g.createLinearGradient(0, h, 0, h - fh); gr.addColorStop(0, "#fff0a0"); gr.addColorStop(0.4, "#ff8a20"); gr.addColorStop(1, "rgba(255,60,0,0)"); g.fillStyle = gr; g.beginPath(); g.ellipse(fx, h, 4 + r() * 5, fh, 0, 0, 7); g.fill(); }
    }), toneMapped: false })); fire.rotation.y = Math.PI / 2; fire.position.set(x + 0.09, 0.9, 1.6); scene.add(fire);
    box(0.06, 0.05, 3.5, M.neonGreen, x + 0.1, 0.5, 1.6, scene); box(0.14, 0.05, 3.9, M.gold, x + 0.04, 0.45, 1.6, scene);
    animated.push(t => { fire.material.color.setScalar(0.85 + 0.15 * Math.sin(t * 9) * Math.sin(t * 5.3)); });
    // shelves with gold ornaments either side of the TV
    for (const z of [-1.0, 4.2]) {
      box(0.35, 3.2, 1.2, M.dark, x + 0.15, 1.9, z, scene);
      for (let i = 0; i < 4; i++) { const y = 0.7 + i * 0.8; box(0.38, 0.04, 1.2, M.gold, x + 0.15, y, z, scene); box(0.04, 0.04, 1.14, M.neonGreen, x + 0.34, y + 0.03, z, scene);
        const r = rng(i + z * 3); for (let k = 0; k < 3; k++) { const o = new THREE.Mesh(r() > 0.5 ? new THREE.SphereGeometry(0.1, 14, 10) : new THREE.CylinderGeometry(0.06, 0.1, 0.22, 14), M.gold); o.position.set(x + 0.15, y + 0.15, z - 0.4 + k * 0.4); scene.add(o); } }
    }
    // arcade cabinet "GAME ON"
    const ag = new THREE.Group(); ag.position.set(-W / 2 + 0.7, 0, -3.6); ag.rotation.y = Math.PI / 2;
    box(0.95, 1.9, 0.8, new THREE.MeshStandardMaterial({ color: 0x0a0716, roughness: 0.4, metalness: 0.3 }), 0, 0.95, 0, ag);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.58), new THREE.MeshBasicMaterial({ map: canvasTex(256, 200, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#ff3cac"); gr.addColorStop(0.5, "#784ba0"); gr.addColorStop(1, "#2b86c5"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = "#0b0b1c"; for (let i = 0; i < 6; i++) g.fillRect(20 + i * 38, 140 + (i % 2) * 14, 26, 40); g.fillStyle = "#ffe14a"; g.beginPath(); g.arc(128, 90, 26, 0.3, 5.9); g.lineTo(128, 90); g.fill();
    }), toneMapped: false })); scr.position.set(0, 1.28, 0.41); scr.rotation.x = -0.1; ag.add(scr);
    box(0.95, 0.28, 0.4, M.neonPurple, 0, 0.88, 0.45, ag).scale.set(1, 1, 0.5);
    const mq = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: canvasTex(256, 80, (g, w, h) => { g.fillStyle = "#04140a"; g.fillRect(0, 0, w, h); glow(g, "#31ff80", 12); g.fillStyle = "#7affb0"; g.font = "bold 42px Arial"; g.textAlign = "center"; g.fillText("GAME ON", w / 2, 56); }), toneMapped: false })); mq.position.set(0, 1.78, 0.41); ag.add(mq);
    box(0.04, 1.9, 0.04, M.neonPurple, -0.49, 0.95, 0.41, ag); box(0.04, 1.9, 0.04, M.neonPurple, 0.49, 0.95, 0.41, ag);
    scene.add(ag); colliders.push([-W / 2, -W / 2 + 1.4, -4.2, -3.0]);
    const stool = new THREE.Group(); stool.position.set(-W / 2 + 1.7, 0, -3.6); cyl(0.17, 0.17, 0.06, M.leather, 0, 0.66, 0, 20, stool); cyl(0.03, 0.03, 0.62, M.gold, 0, 0.33, 0, 8, stool); cyl(0.2, 0.2, 0.03, M.gold, 0, 0.02, 0, 20, stool); scene.add(stool);
  }

  /* ----- right wall: windows over the city, the Florida painting, jukebox ----- */
  {
    const x = W / 2 - 0.05;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3.5), new THREE.MeshBasicMaterial({ map: skyline(8, true), toneMapped: false })); win.rotation.y = -Math.PI / 2; win.position.set(x, 2.15, -2.2); scene.add(win);
    for (let i = 0; i < 4; i++) box(0.1, 3.6, 0.07, M.dark, x - 0.03, 2.15, -5 + i * 1.87, scene);
    box(0.1, 0.07, 5.8, M.dark, x - 0.03, 3.92, -2.2, scene); box(0.1, 0.07, 5.8, M.dark, x - 0.03, 0.4, -2.2, scene);
    box(0.28, 4.1, 1.0, M.velvet, x - 0.12, 2.1, -5.4, scene); box(0.28, 4.1, 1.0, M.velvet, x - 0.12, 2.1, 1.0, scene);
    const paint = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.5), new THREE.MeshBasicMaterial({ map: canvasTex(768, 576, (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#26124a"); sky.addColorStop(0.5, "#d4546a"); sky.addColorStop(0.72, "#ffb040"); sky.addColorStop(1, "#0c2a3a"); g.fillStyle = sky; g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffe08a"; g.beginPath(); g.arc(w * 0.55, h * 0.58, 46, 0, 7); g.fill();
      g.fillStyle = "#0e4a2a"; g.beginPath(); g.moveTo(w * 0.3, h * 0.1); g.lineTo(w * 0.62, h * 0.08); g.lineTo(w * 0.66, h * 0.3); g.lineTo(w * 0.72, h * 0.42); g.lineTo(w * 0.66, h * 0.52); g.lineTo(w * 0.62, h * 0.44); g.lineTo(w * 0.56, h * 0.5); g.lineTo(w * 0.5, h * 0.3); g.lineTo(w * 0.3, h * 0.26); g.closePath(); g.fill();
      g.fillStyle = "#06222a"; g.fillRect(0, h * 0.64, w, h * 0.36);
      g.fillStyle = "#0a3a22"; g.beginPath(); g.ellipse(w * 0.55, h * 0.8, 150, 26, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(w * 0.72, h * 0.8); g.lineTo(w * 0.9, h * 0.7); g.lineTo(w * 0.74, h * 0.85); g.fill();
      g.fillStyle = "#050f0a"; for (const px of [90, 640]) { g.fillRect(px, h * 0.3, 8, h * 0.4); for (let k = 0; k < 6; k++) { g.beginPath(); g.ellipse(px + 4 + (k - 3) * 14, h * 0.3 + Math.abs(k - 3) * 6, 38, 6, (k - 3) * 0.4, 0, 7); g.fill(); } }
    }), toneMapped: false })); paint.rotation.y = -Math.PI / 2; paint.position.set(x - 0.06, 2.3, 3.4); scene.add(paint);
    box(0.08, 2.7, 3.5, M.gold, x - 0.03, 2.3, 3.4, scene);
    // jukebox
    const jg = new THREE.Group(); jg.position.set(W / 2 - 0.6, 0, 0.35); jg.rotation.y = -Math.PI / 2;
    box(0.9, 1.3, 0.55, M.dark, 0, 0.65, 0, jg); const arch = cyl(0.45, 0.45, 0.55, M.dark, 0, 1.3, 0, 24, jg); arch.rotation.x = Math.PI / 2; arch.scale.set(1, 1, 1);
    const jf = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshBasicMaterial({ color: 0x31ff80, toneMapped: false })); jf.position.set(0, 1.3, 0.29); jg.add(jf);
    box(0.7, 0.55, 0.02, M.neonGold, 0, 0.62, 0.28, jg); box(0.8, 0.04, 0.04, M.neonGreen, 0, 1.0, 0.29, jg);
    scene.add(jg); colliders.push([W / 2 - 1.0, W / 2, -0.2, 0.9]);
    // GOOD VIBES ONLY neon
    const vibes = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: canvasTex(256, 128, (g, w, h) => { g.textAlign = "center"; g.textBaseline = "middle"; glow(g, "#ffd36a", 10); g.fillStyle = "#ffe9a8"; g.font = "bold 40px Arial"; g.fillText("GOOD", w / 2, 40); g.fillText("VIBES ONLY", w / 2, 88); }), transparent: true, toneMapped: false })); vibes.rotation.y = -Math.PI / 2; vibes.position.set(x - 0.05, 2.1, 0.6); vibes.visible = false; scene.add(vibes);
  }

  /* ----- plants ----- */
  const plant = (x, z, s = 1) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
    cyl(0.28, 0.22, 0.5, M.dark, 0, 0.25, 0, 20, g); const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 8, 24), M.gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.5; g.add(rim);
    cyl(0.035, 0.05, 1.3, new THREE.MeshStandardMaterial({ color: 0x3a2a14, roughness: 0.8 }), 0, 1.15, 0, 8, g);
    const frond = new THREE.ConeGeometry(0.16, 1.45, 5, 1, true); frond.translate(0, 0.72, 0);
    for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(frond, M.leaf); f.position.y = 1.7; f.rotation.set(Math.PI / 2 - 0.45 - (i % 3) * 0.2, 0, 0); const holder = new THREE.Group(); holder.rotation.y = i * 0.7; holder.add(f); holder.position.y = 0; g.add(holder); f.scale.set(1, 1, 0.25); }
    const up = new THREE.Mesh(new THREE.CircleGeometry(0.35, 20), new THREE.MeshBasicMaterial({ color: 0xc8ff6a, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false })); up.rotation.x = -Math.PI / 2; up.position.y = 0.02; g.add(up);
    scene.add(g); ao(x, z, 1.2, 1.2); colliders.push([x - 0.4, x + 0.4, z - 0.4, z + 0.4]);
  };
  for (const [x, z] of [[-3.7, -5.5], [4.6, -5.5], [-8.3, -5.5], [8.3, -5.5], [-8.3, 5.5], [8.3, 5.5], [3.3, 5.5], [-3.3, 5.5], [8.3, 3.9], [-7.6, 4.2]]) plant(x, z, 1.1 + (x * 7 % 3) * 0.04);

  /* ----- seating ----- */
  const sofa = (len, x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry;
    rbox(len, 0.45, 1.0, M.leather, 0, 0.35, 0, g); rbox(len, 0.7, 0.28, M.leather, 0, 0.8, -0.4, g); rbox(0.28, 0.65, 1.0, M.leather, -len / 2 + 0.14, 0.55, 0, g); rbox(0.28, 0.65, 1.0, M.leather, len / 2 - 0.14, 0.55, 0, g);
    const n = Math.round(len / 1.0); for (let i = 0; i < n; i++) rbox(len / n - 0.06, 0.18, 0.78, M.leather, -len / 2 + (i + 0.5) * (len / n), 0.67, 0.08, g);
    for (const lx of [-len / 2 + 0.2, len / 2 - 0.2]) { rbox(0.08, 0.12, 0.8, M.gold, lx, 0.06, 0, g); }
    const pil = [0x0f6a3a, 0xb98a2e, 0x0f6a3a, 0xb98a2e]; for (let i = 0; i < 4; i++) { const p = rbox(0.36, 0.36, 0.14, new THREE.MeshStandardMaterial({ color: pil[i], roughness: 0.7 }), -len / 2 + 0.7 + i * (len - 1.4) / 3, 0.88, -0.2, g); p.rotation.set(-0.2, 0, (i % 2 ? 0.3 : -0.25)); }
    scene.add(g); ao(x, z, len + 0.8, 1.9, ry);
    const c = Math.cos(ry), s = Math.sin(ry), hx = Math.abs(c) * len / 2 + Math.abs(s) * 0.5, hz = Math.abs(s) * len / 2 + Math.abs(c) * 0.5;
    colliders.push([x - hx, x + hx, z - hz, z + hz]);
  };
  const chair = (x, z, ry, s = 1) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(s);
    rbox(0.85, 0.4, 0.8, M.leather, 0, 0.36, 0, g); rbox(0.85, 0.75, 0.22, M.leather, 0, 0.78, -0.33, g); rbox(0.18, 0.5, 0.8, M.leather, -0.43, 0.56, 0, g); rbox(0.18, 0.5, 0.8, M.leather, 0.43, 0.56, 0, g);
    rbox(0.7, 0.04, 0.7, M.gold, 0, 0.12, 0, g); scene.add(g); ao(x, z, 1.5, 1.5); colliders.push([x - 0.5, x + 0.5, z - 0.5, z + 0.5]);
  };
  sofa(6.2, 0, -3.9, 0);                              // main sofa under the sign
  sofa(3.4, -4.7, -2.2, Math.PI / 6);                 // angled wing
  sofa(3.4, 4.7, -2.4, -Math.PI / 6);
  chair(-2.4, -0.4, 0.5, 1.0); chair(2.4, -0.4, -0.5, 1.0);   // round armchairs in front
  // recliners facing the TV
  for (const z of [0.6, 2.6]) { const g = new THREE.Group(); g.position.set(-5.6, 0, z); g.rotation.y = -Math.PI / 2;
    rbox(1.0, 0.5, 1.1, M.leather, 0, 0.4, 0, g); rbox(1.0, 1.05, 0.3, M.leather, 0, 0.95, -0.52, g); rbox(0.2, 0.5, 1.1, M.leather, -0.5, 0.6, 0, g); rbox(0.2, 0.5, 1.1, M.leather, 0.5, 0.6, 0, g); rbox(0.9, 0.1, 0.1, M.gold, 0, 0.12, 0.3, g); scene.add(g); ao(-5.6, z, 1.7, 1.8, -Math.PI / 2); colliders.push([-6.3, -4.8, z - 0.7, z + 0.7]); }

  /* ----- rug and coffee table ----- */
  {
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 5.2), new THREE.MeshStandardMaterial({ map: canvasTex(1024, 720, (g, w, h) => {
      g.fillStyle = "#07090a"; g.fillRect(0, 0, w, h); g.strokeStyle = "#caa24e"; g.lineWidth = 3; g.globalAlpha = 0.9;
      for (let i = 0; i < 6; i++) { g.strokeRect(24 + i * 14, 24 + i * 14, w - 48 - i * 28, h - 48 - i * 28); }
      const r = rng(2); g.globalAlpha = 0.55; g.lineWidth = 2;
      for (let k = 0; k < 80; k++) { const cx = 140 + r() * (w - 280), cy = 140 + r() * (h - 280), rad = 14 + r() * 40; g.beginPath(); g.arc(cx, cy, rad, 0, 7); g.stroke(); g.beginPath(); g.moveTo(cx - rad, cy); g.lineTo(cx + rad, cy); g.moveTo(cx, cy - rad); g.lineTo(cx, cy + rad); g.stroke(); }
      g.globalAlpha = 1; g.lineWidth = 5; g.strokeStyle = "#ffd36a"; glow(g, "#ffb040", 14); crownPath(g, w / 2, h / 2 + 130, 60); g.stroke();
    }), roughness: 0.9 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, -1.0); scene.add(rug);
    const tbl = new THREE.Group(); tbl.position.set(0, 0, -1.0);
    cyl(0.95, 0.95, 0.08, new THREE.MeshStandardMaterial({ map: marbleTex(512, 512, 77, "#e8c46a", 18), roughness: 0.12, metalness: 0.5 }), 0, 0.46, 0, 40, tbl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.03, 10, 48), M.gold); rim.rotation.x = Math.PI / 2; rim.position.y = 0.5; tbl.add(rim);
    cyl(0.12, 0.2, 0.42, M.gold, 0, 0.21, 0, 16, tbl); cyl(0.5, 0.5, 0.04, M.gold, 0, 0.02, 0, 32, tbl);
    for (const [cx, cz] of [[0.3, 0.2], [-0.35, -0.2]]) { cyl(0.05, 0.05, 0.16, M.neonGold, cx, 0.58, cz, 12, tbl); }
    scene.add(tbl); ao(0, -1, 2.7, 2.7); colliders.push([-1.0, 1.0, -2.0, 0.0]);
  }

  /* ----- pool table with pendant lamps ----- */
  {
    const g = new THREE.Group(); g.position.set(5.6, 0, -0.3); g.rotation.y = 0.2;
    box(3.2, 0.3, 1.8, M.wood, 0, 0.8, 0, g); box(2.9, 0.04, 1.5, M.felt, 0, 0.96, 0, g);
    for (const [w, d, x, z] of [[3.2, 0.14, 0, 0.83], [3.2, 0.14, 0, -0.83], [0.14, 1.8, 1.53, 0], [0.14, 1.8, -1.53, 0]]) { box(w, 0.1, d, M.dark, x, 0.99, z, g); }
    box(3.25, 0.03, 0.03, M.gold, 0, 1.05, 0.9, g); box(3.25, 0.03, 0.03, M.gold, 0, 1.05, -0.9, g);
    for (const x of [-1.3, 1.3]) for (const z of [-0.65, 0.65]) box(0.22, 0.65, 0.22, M.dark, x, 0.33, z, g);
    const balls = [0xff3030, 0xffd030, 0x30a0ff, 0xffffff, 0x101010, 0xff7030]; const r = rng(4);
    balls.forEach((c, i) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.2 })); b.position.set(0.3 + (i % 3) * 0.11, 1.03, -0.15 + Math.floor(i / 3) * 0.12 + r() * 0.03); g.add(b); });
    scene.add(g); ao(5.6, -0.3, 4.4, 3.0, 0.2); colliders.push([4.0, 7.2, -1.5, 1.2]);
    for (const x of [-0.8, 0.8]) { const lamp = new THREE.Group(); lamp.position.set(5.6 + x, H - 1.2, -0.3);
      cyl(0.01, 0.01, 1.4, M.dark, 0, 0.7, 0, 6, lamp); const sh = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.26, 28, 1, true), new THREE.MeshStandardMaterial({ color: 0x0a3a1c, roughness: 0.4, side: THREE.DoubleSide, emissive: 0x0a5a2a, emissiveIntensity: 0.6 })); lamp.add(sh);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), M.warm); bulb.position.y = -0.08; lamp.add(bulb); scene.add(lamp); }
    pt(0xffc880, 14, 5.6, 2.8, -0.3, 6);
  }

  /* ----- poker table ----- */
  {
    const g = new THREE.Group(); g.position.set(6.2, 0, 3.4);
    cyl(1.25, 1.25, 0.1, M.felt, 0, 0.82, 0, 44, g); const rim = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.1, 12, 48), M.leather); rim.rotation.x = Math.PI / 2; rim.position.y = 0.84; g.add(rim);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.025, 8, 48), M.neonGreen); ring.rotation.x = Math.PI / 2; ring.position.y = 0.9; g.add(ring);
    cyl(0.12, 0.2, 0.78, M.gold, 0, 0.39, 0, 12, g); cyl(0.55, 0.55, 0.04, M.gold, 0, 0.02, 0, 28, g);
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5 + 0.3; const c = new THREE.Group(); c.position.set(Math.cos(a) * 1.75, 0, Math.sin(a) * 1.75); c.rotation.y = -a - Math.PI / 2;
      box(0.62, 0.12, 0.62, M.leather, 0, 0.5, 0, c); box(0.62, 0.62, 0.12, M.leather, 0, 0.88, -0.28, c); cyl(0.04, 0.04, 0.45, M.gold, 0, 0.24, 0, 8, c); cyl(0.3, 0.3, 0.03, M.gold, 0, 0.02, 0, 16, c); g.add(c); }
    scene.add(g); ao(6.2, 3.4, 5.0, 5.0); colliders.push([4.5, 7.9, 1.7, 5.1]);
  }

  /* ----- ceiling fan ----- */
  {
    const g = new THREE.Group(); g.position.set(-5.4, H - 0.35, -0.8);
    cyl(0.04, 0.04, 0.3, M.dark, 0, 0.17, 0, 8, g); cyl(0.14, 0.14, 0.12, M.dark, 0, 0, 0, 16, g);
    const blades = new THREE.Group(); for (let i = 0; i < 5; i++) { const b = box(1.1, 0.02, 0.2, M.dark, 0.65, -0.05, 0); const h = new THREE.Group(); h.rotation.y = i * Math.PI * 2 / 5; h.add(b); blades.add(h); }
    g.add(blades); g.traverse(o => { o.castShadow = false; }); scene.add(g); animated.push(t => { blades.rotation.y = t * 1.6; });
  }

  /* ----- the three holograms over the coffee table ----- */
  const holo = new THREE.Group(); holo.position.set(0, 0, -1.0); scene.add(holo);
  const additive = (color, op = 0.85) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const holoItems = {};
  const makeHolo = (id, color, x, build) => {
    const g = new THREE.Group(); g.position.set(x, 1.45, 0);
    const art = new THREE.Group(); build(art, additive(color), additive(color, 0.35)); g.add(art);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.5, 0.95, 24, 1, true), additive(color, 0.12)); beam.position.y = -0.62; g.add(beam);
    const base = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.012, 8, 40), additive(color, 0.9)); base.rotation.x = Math.PI / 2; base.position.y = -1.0; g.add(base);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.userData.action = "product:" + id; g.add(hit); interactive.push(hit);
    holo.add(g); holoItems[id] = { g, art, base, hit, phase: x * 3 };
  };
  makeHolo("ice", 0x8dffe6, -0.95, (art, solid, soft) => {                       // snowflake
    for (let i = 0; i < 3; i++) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.035), solid); arm.rotation.z = i * Math.PI / 3; art.add(arm);
      for (const s of [-1, 1]) for (const k of [0.22, 0.38]) for (const side of [-1, 1]) { const tw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.025), solid); tw.position.set(s * k, 0, 0); tw.rotation.z = i * Math.PI / 3 + side * 0.8; tw.position.x = s * k * Math.cos(i * Math.PI / 3); tw.position.y = s * k * Math.sin(i * Math.PI / 3); art.add(tw); } }
    const gem = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), soft); art.add(gem);
    const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: 0x8dffe6, wireframe: true, transparent: true, opacity: 0.6, toneMapped: false })); art.add(wire);
  });
  makeHolo("tea", 0x38ff7a, 0, (art, solid, soft) => {                           // palm tree
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.05, 0.75, 8), solid); trunk.position.y = -0.1; art.add(trunk);
    for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 4, 1, true), solid); f.geometry.translate(0, 0.3, 0); const h = new THREE.Group(); h.position.y = 0.27; h.rotation.y = i * 0.9; f.rotation.z = -1.15 - (i % 2) * 0.25; h.add(f); art.add(h); }
    const nut = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), soft); nut.position.y = 0.25; art.add(nut);
  });
  makeHolo("shot", 0xffd36a, 0.95, (art, solid, soft) => {                       // caduceus
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.95, 8), solid); art.add(staff);
    for (const ph of [0, Math.PI]) { const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40; pts.push(new THREE.Vector3(Math.sin(t * Math.PI * 4 + ph) * 0.11 * (1 - 0.15 * t), -0.42 + t * 0.78, Math.cos(t * Math.PI * 4 + ph) * 0.11)); } art.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.02, 6), solid)); }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), solid); ball.position.y = 0.5; art.add(ball);
    for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.4, 3, 1), soft); w.rotation.z = s * -1.45; w.position.set(s * 0.22, 0.42, 0); art.add(w); }
  });
  // name tags that appear when you point at one
  const label = (text, color) => new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(512, 96, (g, w, h) => {
    g.fillStyle = "rgba(3,8,6,.8)"; g.beginPath(); g.roundRect(6, 10, w - 12, h - 20, 40); g.fill(); g.strokeStyle = color; g.lineWidth = 3; g.stroke();
    g.fillStyle = "#fff"; g.font = "bold 38px Arial"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, w / 2, h / 2 + 2);
  }), transparent: true, depthTest: false, toneMapped: false, opacity: 0 }));
  for (const [id, text, color] of [["ice", "❄️ Honeydrippers", "#8dffe6"], ["tea", "🌴 Herbal teas", "#38ff7a"], ["shot", "⚕️ Herbal shots", "#ffd36a"]]) { const s = label(text, color); s.scale.set(1.2, 0.225, 1); s.position.y = -1.3; s.renderOrder = 10; holoItems[id].g.add(s); holoItems[id].label = s; }

  addExtras({ THREE, scene, M, box, rbox, cyl, canvasTex, glow, colliders, interactive, animated, addLight: pt, ao });
  renderer.shadowMap.needsUpdate = true;

  /* ----- camera, input ----- */
  const clampPos = (x, z) => [Math.max(-8.2, Math.min(8.2, x)), Math.max(-5.3, Math.min(5.4, z))];
  const blocked = (x, z) => colliders.some(([a, b, c, d]) => x > a - 0.25 && x < b + 0.25 && z > c - 0.25 && z < d + 0.25);
  let walkTarget = null, vYaw = 0, vPitch = 0, fov = 72;
  const keys = new Set();
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pointerRay = (cx, cy) => {
    const r = renderer.domElement.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera);
    return raycaster;
  };
  const pick = (cx, cy) => {
    const rc = pointerRay(cx, cy);
    const hit = rc.intersectObjects(interactive, false)[0];
    const fl = rc.intersectObject(floor, false)[0];
    if (hit && (!fl || hit.distance < fl.distance + 0.5)) return { type: "action", action: hit.object.userData.action };
    if (fl) return { type: "floor", x: fl.point.x, z: fl.point.z };
    return null;
  };
  const act = a => { if (a === "bath") hooks.onBath?.(); else if (a?.startsWith("product:")) hooks.onProduct?.(a.slice(8)); };

  const el = renderer.domElement; el.style.touchAction = "none";
  const pointers = new Map(); let downAt = null, moved = 0, pinch0 = 0;
  el.addEventListener("pointerdown", e => { el.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); downAt = [e.clientX, e.clientY]; moved = 0; vYaw = vPitch = 0; walkTarget = null; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  el.addEventListener("pointermove", e => {
    const prev = pointers.get(e.pointerId);
    if (prev) {
      if (pointers.size === 2) {
        pointers.set(e.pointerId, [e.clientX, e.clientY]); const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (pinch0) { fov = Math.max(42, Math.min(95, fov * (pinch0 / d))); camera.fov = fov; camera.updateProjectionMatrix(); } pinch0 = d; moved = 99; return;
      }
      const dx = e.clientX - prev[0], dy = e.clientY - prev[1]; moved += Math.abs(dx) + Math.abs(dy);
      const k = (fov / 72) * 0.0052; yaw -= dx * k; pitch = Math.max(-1.15, Math.min(1.15, pitch - dy * k)); vYaw = -dx * k; vPitch = -dy * k;
      pointers.set(e.pointerId, [e.clientX, e.clientY]);
    } else if (e.pointerType === "mouse") {
      const h = pick(e.clientX, e.clientY); el.style.cursor = h?.type === "action" ? "pointer" : "grab"; setHover(h?.action);
    }
  });
  const end = e => {
    const had = pointers.has(e.pointerId); pointers.delete(e.pointerId);
    if (had && pointers.size === 0 && moved < 8 && e.type === "pointerup") {
      const h = pick(e.clientX, e.clientY);
      if (h?.type === "action") act(h.action);
      else if (h?.type === "floor") { const [x, z] = clampPos(h.x, h.z); if (!blocked(x, z)) walkTarget = [x, z]; }
    }
    if (pointers.size < 2) pinch0 = 0;
  };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  el.addEventListener("wheel", e => { e.preventDefault(); fov = Math.max(42, Math.min(95, fov + e.deltaY * 0.04)); camera.fov = fov; camera.updateProjectionMatrix(); }, { passive: false });
  const kd = e => { if (container.offsetParent === null || /input|textarea/i.test(e.target.tagName)) return; keys.add(e.key.toLowerCase()); };
  const ku = e => keys.delete(e.key.toLowerCase());
  addEventListener("keydown", kd); addEventListener("keyup", ku);
  let hovered = null; const setHover = a => { hovered = a || null; };

  /* ----- render loop ----- */
  const size = new THREE.Vector2();
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: coarse ? 2 : 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), coarse ? 0.3 : 0.38, 0.5, 0.92);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  const finish = new ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); } void main(){ vec4 c = texture2D(tDiffuse, vUv); float v = smoothstep(0.95, 0.25, length((vUv - 0.5) * vec2(1.15, 1.0))); c.rgb *= mix(0.55, 1.0, v); c.rgb += (h(vUv * 1000.0) - 0.5) * 0.03; gl_FragColor = c; }" });
  composer.addPass(finish);
  function resize() {
    const w = container.clientWidth; if (!w) return;
    const h = Math.round(Math.max(340, Math.min(w * (w < 700 ? 1.05 : 0.6), innerHeight * 0.74, 700)));
    container.style.height = h + "px"; renderer.setSize(w, h, false); renderer.domElement.style.width = w + "px"; renderer.domElement.style.height = h + "px";
    composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.getSize(size);
  }
  new ResizeObserver(resize).observe(container); resize();

  let running = true, visible = true, last = performance.now(), t0 = last;
  new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0.01 }).observe(container);
  function frame(now) {
    if (!running) return; requestAnimationFrame(frame);
    if (!visible || document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = (now - t0) / 1000;
    // glide after a drag
    if (!pointers.size) { yaw += vYaw; pitch = Math.max(-1.15, Math.min(1.15, pitch + vPitch)); vYaw *= 0.92; vPitch *= 0.92; if (Math.abs(vYaw) < 1e-4) vYaw = 0; if (Math.abs(vPitch) < 1e-4) vPitch = 0; }
    // walking: tap the floor, or WASD / arrow keys
    const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), rgt = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    let mx = 0, mz = 0;
    if (keys.has("w") || keys.has("arrowup")) { mx += f.x; mz += f.z; } if (keys.has("s") || keys.has("arrowdown")) { mx -= f.x; mz -= f.z; }
    if (keys.has("d")) { mx += rgt.x; mz += rgt.z; } if (keys.has("a")) { mx -= rgt.x; mz -= rgt.z; }
    if (keys.has("arrowleft")) yaw += 1.6 * dt; if (keys.has("arrowright")) yaw -= 1.6 * dt;
    if (walkTarget) { const dx = walkTarget[0] - camera.position.x, dz = walkTarget[1] - camera.position.z, d = Math.hypot(dx, dz); if (d < 0.08) walkTarget = null; else { mx = dx / d; mz = dz / d; } }
    if (mx || mz) {
      const sp = (keys.size ? 2.6 : 3.4) * dt, nx = camera.position.x + mx * sp, nz = camera.position.z + mz * sp;
      const [cx, cz] = clampPos(nx, nz);
      if (!blocked(cx, cz)) camera.position.set(cx, eye, cz); else if (!blocked(cx, camera.position.z)) camera.position.x = cx; else if (!blocked(camera.position.x, cz)) camera.position.z = cz; else walkTarget = null;
      camera.position.y = eye + Math.sin(t * 9) * (walkTarget || keys.size ? 0.012 : 0);
    }
    camera.rotation.set(pitch, yaw, 0, "YXZ");
    // holograms: spin, bob, brighten when pointed at
    for (const [id, h] of Object.entries(holoItems)) {
      h.art.rotation.y = t * 0.9 + h.phase; h.g.position.y = 1.45 + Math.sin(t * 1.6 + h.phase) * 0.05; h.base.scale.setScalar(1 + 0.05 * Math.sin(t * 3 + h.phase));
      const on = hovered === "product:" + id; h.label.material.opacity += ((on ? 1 : 0) - h.label.material.opacity) * 0.2; h.art.scale.setScalar(on ? 1.12 : 1);
    }
    for (const fn of animated) fn(t);
    finish.uniforms.time.value = t % 10;
    composer.render();
  }
  requestAnimationFrame(frame);

  return {
    setOpen(open) { holo.visible = open; interactive.forEach(o => { if (o.userData.action?.startsWith("product:")) o.visible = open; }); },
    dispose() { running = false; removeEventListener("keydown", kd); removeEventListener("keyup", ku); renderer.dispose(); renderer.domElement.remove(); },
    /* for tests */
    debug: { camera, get yaw() { return yaw; }, set yaw(v) { yaw = v; }, get pitch() { return pitch; }, set pitch(v) { pitch = v; }, pick, project(a) { const o = interactive.find(i => i.userData.action === a); const v = o.getWorldPosition(new THREE.Vector3()).project(camera); const r = renderer.domElement.getBoundingClientRect(); return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height, v.z]; }, walkTo(x, z) { walkTarget = [x, z]; }, get walking() { return !!walkTarget; } }
  };
}
