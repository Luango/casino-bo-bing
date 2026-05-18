/* ============================================================
   Casino Bo Bing — Full 3D Three.js Implementation
   (Uses global THREE loaded via <script> tag in index.html)
   ============================================================ */

// ============================================================ CONSTANTS
const TIERS = {
  supreme:        { cn: "至尊状元", en: "SUPREME",         pay: "JP" },
  super_champion: { cn: "高级状元", en: "SUPER CHAMPION",  pay: 200 },
  champion:       { cn: "普通状元", en: "CHAMPION",        pay: 50 },
  second_place:   { cn: "对堂",     en: "SECOND PLACE",    pay: 30 },
  third_place:    { cn: "三红",     en: "THIRD PLACE",     pay: 12 },
  doctor:         { cn: "四进",     en: "DOCTOR",          pay: 4 },
  graduate:       { cn: "二举",     en: "GRADUATE",        pay: 2 },
  showman:        { cn: "一秀",     en: "SHOWMAN",         pay: 1 },
  miss:           { cn: "白板",     en: "MISS",            pay: 1 },
};
const SIDE_TIERS = {
  red:        { cn: "红多",   en: "RED",     pay: 1 },
  black:      { cn: "黑多",   en: "BLACK",   pay: 1 },
  tie:        { cn: "和局",   en: "TIE",     pay: 2 },
  jackpot_bet:{ cn: "大奖押", en: "JACKPOT", pay: 0 },
};
const RED_FACES = new Set([1, 4]);

const LINES = {
  idle: [
    { cn: "下注吧，凡人",       en: "PLACE YOUR BETS, MORTAL" },
    { cn: "圆月之下，自有玄机", en: "UNDER THE MOON, FATES STIR" },
    { cn: "本局，由你做主",     en: "THIS ROUND IS YOURS TO CALL" },
  ],
  locked:  [{ cn: "封盘 —— 不可加注", en: "BETS LOCKED" }],
  rolling: [{ cn: "六骰飞舞，命数将明", en: "THE DICE DECIDE" }],
  win_supreme: [{ cn: "至尊状元！鸿运当头！", en: "SUPREME · THE HEAVENS SMILE" }],
  win_big:    [{ cn: "金榜题名，恭喜恭喜！", en: "A GREAT WIN, MORTAL" }],
  win_small:  [{ cn: "些许进账，再来一局？", en: "A MODEST WIN — AGAIN?" }],
  lose:       [
    { cn: "白板一场 —— 再战如何？", en: "EMPTY HAND · TRY AGAIN" },
    { cn: "天意难测，下次再来",     en: "FATE IS CRUEL" },
  ],
};

// Bet zone layout on the table (top-down coordinates)
// X: -3.6 .. 3.6 (table radius ~4.2). Z: -3.0 (far/dealer) .. +3.0 (near/player)
const ZONES = [
  // Far row — high tiers near dealer (z ≈ -2.85)
  { tier:'super_champion', x:-2.45, z:-2.70, w:1.55, h:0.90, color:0xff8c42 },
  { tier:'supreme',        x:  0.0, z:-2.85, w:1.65, h:1.05, color:0xff4d6d, supreme:true },
  { tier:'champion',       x: 2.45, z:-2.70, w:1.55, h:0.90, color:0xf5c14a },
  // Outer-mid (left/right of bowl, top row)
  { tier:'second_place',   x:-3.15, z:-1.05, w:1.15, h:0.85, color:0x6ce5ff },
  { tier:'third_place',    x: 3.15, z:-1.05, w:1.15, h:0.85, color:0xff5a5a },
  // Outer-mid (left/right of bowl, bottom row)
  { tier:'doctor',         x:-3.15, z: 0.55, w:1.15, h:0.85, color:0xb88ff5 },
  { tier:'graduate',       x: 3.15, z: 0.55, w:1.15, h:0.85, color:0xd4a23a },
  // Near row — closer to player
  { tier:'showman',        x:-1.20, z: 1.75, w:1.40, h:0.78, color:0xB8860B },
  { tier:'miss',           x: 1.20, z: 1.75, w:1.40, h:0.78, color:0x808080 },
  // Side bets — very front strip
  { tier:'red',         x:-2.65, z: 2.85, w:1.05, h:0.55, color:0xff5050, side:true },
  { tier:'tie',         x:-0.88, z: 2.85, w:1.05, h:0.55, color:0x6ce28a, side:true },
  { tier:'black',       x: 0.88, z: 2.85, w:1.05, h:0.55, color:0x444444, side:true },
  { tier:'jackpot_bet', x: 2.65, z: 2.85, w:1.05, h:0.55, color:0xffb86b, side:true },
];

// ============================================================ STATE
const state = {
  balance: 10000,
  jackpot: 500000,
  bets: {},
  lastBets: {},
  phase: "betting",   // betting | rolling | settling
  lastWin: 0,
  drag: { active: false, value: 0 },
  hoveredZone: null,
  _lastChip: 25,
};

// ============================================================ AUDIO
// CC0 sound effects by Kenney (casino + interface packs). Files live in audio/sfx/.
// Each named cue points at 1+ files; a pool of HTMLAudio voices per file lets
// overlapping events (six dice in 1.5s, repeated chip drops) play without cutting
// each other off. First user gesture unlocks playback to satisfy browser autoplay.
const AUDIO = (() => {
  const BASE = 'audio/sfx/';
  const LIB = {
    chipPlace:    ['chip-place-1.ogg', 'chip-place-2.ogg', 'chip-place-3.ogg'],
    chipPickup:   ['chip-pickup.ogg'],
    chipHandle:   ['chip-handle.ogg'],
    diceGrab:     ['dice-grab.ogg'],
    diceShake:    ['dice-shake.ogg'],
    diceRoll:     ['dice-roll.ogg'],
    dieThrow:     ['die-throw-1.ogg','die-throw-2.ogg','die-throw-3.ogg','die-throw-4.ogg'],
    leverPull:    ['lever-pull.ogg'],
    uiClick:      ['ui-click.ogg'],
    winSmall:     ['win-small.ogg'],
    winBig:       ['win-big.ogg'],
    winJackpot:   ['win-jackpot.ogg'],
    jackpotChime: ['jackpot-chime.ogg'],
    lose:         ['lose.ogg'],
  };

  const POOL_SIZE = 4;
  const pools = new Map();
  for (const list of Object.values(LIB)) {
    for (const f of list) {
      if (pools.has(f)) continue;
      const voices = [];
      for (let i = 0; i < POOL_SIZE; i++) {
        const el = new Audio(BASE + f);
        el.preload = 'auto';
        voices.push(el);
      }
      pools.set(f, { voices, next: 0 });
    }
  }

  let muted = false;
  let masterVol = 0.7;
  let unlocked = false;

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    // Silently kick every pool once so subsequent plays aren't blocked by autoplay policy
    for (const { voices } of pools.values()) {
      const v = voices[0];
      const prevVol = v.volume;
      v.volume = 0;
      v.play().then(() => { v.pause(); v.currentTime = 0; v.volume = prevVol; }).catch(()=>{ v.volume = prevVol; });
    }
  }
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });

  function play(name, opts) {
    if (muted) return;
    const list = LIB[name];
    if (!list) return;
    const vol = opts && opts.vol != null ? opts.vol : 1.0;
    const rate = opts && opts.rate != null ? opts.rate : 1.0;
    const file = list[Math.floor(Math.random() * list.length)];
    const pool = pools.get(file);
    const el = pool.voices[pool.next];
    pool.next = (pool.next + 1) % pool.voices.length;
    try {
      el.currentTime = 0;
      el.volume = Math.max(0, Math.min(1, masterVol * vol));
      el.playbackRate = rate;
      el.play().catch(()=>{});
    } catch (_) { /* swallow */ }
  }

  function setMute(m) { muted = m; }
  function isMuted() { return muted; }
  function setMasterVolume(v) { masterVol = Math.max(0, Math.min(1, v)); }

  return { play, setMute, isMuted, setMasterVolume, unlock };
})();

// Press M to toggle sound on/off.
window.addEventListener('keydown', e => {
  if (e.key === 'm' || e.key === 'M') {
    AUDIO.setMute(!AUDIO.isMuted());
    toast(AUDIO.isMuted() ? 'SOUND OFF · 静音' : 'SOUND ON · 音效');
  }
});

// ============================================================ HUD DOM
const $ = (s) => document.querySelector(s);
const elBalance   = $("#balanceAmount");
const elJackpot   = $("#jackpotAmount");
const elLastWin   = $("#lastWin");
const elSpeech    = $("#speech");
const elSpeechCn  = $("#speechCn");
const elSpeechEn  = $("#speechEn");
const elBanner    = $("#banner");
const elBannerCn  = $("#bannerCn");
const elBannerEn  = $("#bannerEn");
const elWinOver   = $("#winOverlay");
const elWinCn     = $("#winCn");
const elWinEn     = $("#winEn");
const elWinAmount = $("#winAmount");
const elToast     = $("#toast");
const elDragChip  = $("#dragChip");
const elLoading   = $("#loading");
const elLoadFill  = $("#loadFill");

const fmt = (n) => "HK$ " + Math.round(n).toLocaleString("en-US");

// ============================================================ HUD HELPERS
function updateHud() {
  elBalance.textContent = fmt(state.balance);
  elJackpot.textContent = fmt(state.jackpot);
  elLastWin.textContent = fmt(state.lastWin);
}

function speak(category) {
  const opts = LINES[category];
  if (!opts) return;
  const line = opts[Math.floor(Math.random() * opts.length)];
  elSpeechCn.textContent = line.cn;
  elSpeechEn.textContent = line.en;
  elSpeech.classList.add("show");
}
function hideSpeech() { elSpeech.classList.remove("show"); }

let toastTimer;
function toast(msg) {
  elToast.textContent = msg;
  elToast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elToast.classList.remove("show"), 1600);
}
function showBanner(cn, en, ms = 2400) {
  elBannerCn.textContent = cn;
  elBannerEn.textContent = en;
  elBanner.classList.add("show");
  setTimeout(() => elBanner.classList.remove("show"), ms);
}
function showWinOverlay(cn, en, amount) {
  elWinCn.textContent = cn;
  elWinEn.textContent = en;
  elWinAmount.textContent = "+ " + fmt(amount);
  elWinOver.classList.add("show");
}
function hideWinOverlay() { elWinOver.classList.remove("show"); }

// ============================================================ GAME LOGIC
function classify(dice) {
  const counts = [0,0,0,0,0,0,0];
  dice.forEach(d => counts[d]++);
  const c4 = counts[4];
  const nfc = [counts[1], counts[2], counts[3], counts[5], counts[6]];
  const nfMax = Math.max(...nfc);
  const nfFace = [1,2,3,5,6][nfc.indexOf(nfMax)];
  const isStraight = counts[1]===1 && counts[2]===1 && counts[3]===1 && counts[4]===1 && counts[5]===1 && counts[6]===1;

  if (c4 === 6) return { tier:"supreme", winningDice:[0,1,2,3,4,5] };
  if (c4 === 4 && counts[1] === 2) {
    return { tier:"supreme", winningDice: dice.map((v,i)=>(v===4||v===1)?i:-1).filter(i=>i>=0) };
  }
  if (c4 === 5) return { tier:"super_champion", winningDice: dice.map((v,i)=>v===4?i:-1).filter(i=>i>=0) };
  if (nfMax === 6) return { tier:"super_champion", winningDice:[0,1,2,3,4,5] };
  if (c4 === 4) return { tier:"champion", winningDice: dice.map((v,i)=>v===4?i:-1).filter(i=>i>=0) };
  if (nfMax === 5) return { tier:"champion", winningDice: dice.map((v,i)=>v===nfFace?i:-1).filter(i=>i>=0) };
  if (isStraight) return { tier:"second_place", winningDice:[0,1,2,3,4,5] };
  if (c4 === 3) return { tier:"third_place", winningDice: dice.map((v,i)=>v===4?i:-1).filter(i=>i>=0) };
  if (nfMax === 4) return { tier:"doctor", winningDice: dice.map((v,i)=>v===nfFace?i:-1).filter(i=>i>=0) };
  if (c4 === 2) return { tier:"graduate", winningDice: dice.map((v,i)=>v===4?i:-1).filter(i=>i>=0) };
  if (c4 === 1) return { tier:"showman", winningDice: dice.map((v,i)=>v===4?i:-1).filter(i=>i>=0) };
  return { tier:"miss", winningDice:[] };
}
function classifySides(dice) {
  let red = 0;
  dice.forEach(d => { if (RED_FACES.has(d)) red++; });
  return { red, black: 6 - red, tie: red === 3 };
}

// ============================================================ THREE.JS SETUP
const canvas = $("#scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x080205, 12, 30);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth/window.innerHeight, 0.1, 100);
camera.position.set(0, 6.0, 8.4);
camera.lookAt(0, 0.0, -0.7);

// ============================================================ MULTI-VIEW CAMERA SYSTEM
// Distinct camera positions for each game phase, lerped between Inscryption-style.
const VIEWS = {
  betting: {
    pos:  new THREE.Vector3(0,   6.0,  8.4),
    look: new THREE.Vector3(0,   0.0, -0.7),
    fov: 58,
    speed: 2.4,
  },
  // Lever-pull / dice tumbling — camera pulls back to take in the dramatic free-fall onto the felt
  rolling: {
    pos:  new THREE.Vector3(0,   3.4,  4.4),
    look: new THREE.Vector3(0,   0.55, 0.0),
    fov: 56,
    speed: 1.8,
  },
  // Result reveal — pulled back and slightly higher, dramatic wide angle to take in the table
  payout: {
    pos:  new THREE.Vector3(0,   7.2,  9.4),
    look: new THREE.Vector3(0,   0.0, -0.8),
    fov: 64,
    speed: 2.6,
  },
  // Brief look at the dealer character (used on jackpot / big wins)
  dealer: {
    pos:  new THREE.Vector3(0,   3.6,  2.2),
    look: new THREE.Vector3(0,   2.95, -4.6),
    fov: 46,
    speed: 2.2,
  },
};

const camView = {
  current: 'betting',
  posVec:     new THREE.Vector3().copy(VIEWS.betting.pos),
  lookVec:    new THREE.Vector3().copy(VIEWS.betting.look),
  targetPos:  new THREE.Vector3().copy(VIEWS.betting.pos),
  targetLook: new THREE.Vector3().copy(VIEWS.betting.look),
  targetFov:  58,
  speed: 2.4,
};

function setView(name) {
  const v = VIEWS[name];
  if (!v) return;
  camView.current = name;
  camView.targetPos.copy(v.pos);
  camView.targetLook.copy(v.look);
  camView.targetFov = v.fov;
  camView.speed = v.speed;
}

// ----- Lights -----
const ambient = new THREE.AmbientLight(0xff8060, 0.08);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0xffe1a8, 0x2a0506, 0.28);
scene.add(hemi);

const tableSpot = new THREE.SpotLight(0xffd680, 12, 18, Math.PI/4.5, 0.55, 1.5);
tableSpot.position.set(0, 9, 1.5);
tableSpot.target.position.set(0, 0, 0);
tableSpot.castShadow = true;
tableSpot.shadow.mapSize.set(1024, 1024);
tableSpot.shadow.camera.near = 1;
tableSpot.shadow.camera.far = 20;
tableSpot.shadow.bias = -0.0005;
scene.add(tableSpot);
scene.add(tableSpot.target);

const moonLight = new THREE.PointLight(0xfff4d9, 1.4, 26);
moonLight.position.set(0, 7, -10);
scene.add(moonLight);

const lantern1 = new THREE.PointLight(0xff5030, 2.5, 8, 1.5);
lantern1.position.set(-4.5, 3.0, -3.5);
scene.add(lantern1);
const lantern2 = new THREE.PointLight(0xff7040, 2.5, 8, 1.5);
lantern2.position.set(4.5, 2.8, -3.5);
scene.add(lantern2);

// ============================================================ BACKGROUND
// Sky sphere with gradient
{
  const c = document.createElement('canvas');
  c.width = 2; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0,    '#080104');
  g.addColorStop(0.45, '#180510');
  g.addColorStop(0.75, '#3a0612');
  g.addColorStop(1,    '#0a0205');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 512);
  const skyTex = new THREE.CanvasTexture(c);
  skyTex.encoding = THREE.sRGBEncoding;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(40, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);
}

// Stars
{
  const N = 220;
  const positions = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 28 + Math.random() * 6;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1) * 0.45;
    positions[i*3+0] = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = 5 + r * Math.cos(phi) * 0.8;
    positions[i*3+2] = -8 + r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xfff8d4, size: 0.13, sizeAttenuation: true, fog: false });
  const stars = new THREE.Points(geo, mat);
  stars.userData.twinkle = true;
  scene.add(stars);
  state._stars = stars;
}

// Moon
{
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(96, 80, 10, 128, 128, 130);
  g.addColorStop(0,    '#fff4d9');
  g.addColorStop(0.45, '#f3d27a');
  g.addColorStop(0.85, '#c89a3a');
  g.addColorStop(1,    '#6e4e0a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(110,78,10,0.30)';
  for (let i = 0; i < 10; i++) {
    const x = 35 + Math.random()*180;
    const y = 35 + Math.random()*180;
    const r = 6 + Math.random()*18;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  }
  const moonTex = new THREE.CanvasTexture(c);
  moonTex.encoding = THREE.sRGBEncoding;
  const moonMat = new THREE.MeshBasicMaterial({ map: moonTex, fog: false });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 24), moonMat);
  moon.position.set(0, 7.5, -12);
  scene.add(moon);

  // Halo via additive sprite-like sphere
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xffe6b4, transparent: true, opacity: 0.10,
    blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(3.6, 24, 24), haloMat);
  halo.position.copy(moon.position);
  scene.add(halo);
}

// ============================================================ LANTERNS
function makeLantern(color = 0xc41020) {
  const group = new THREE.Group();
  // body — squashed sphere
  const bodyGeo = new THREE.SphereGeometry(0.45, 16, 12);
  bodyGeo.scale(1, 1.1, 1);
  const bodyMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.65, metalness: 0.0,
    emissive: color, emissiveIntensity: 0.6,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(body);
  // top + bottom caps
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2a0506, roughness: 0.7 });
  const topCap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.08, 12), capMat);
  topCap.position.y = 0.48;
  group.add(topCap);
  const botCap = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.08, 12), capMat);
  botCap.position.y = -0.48;
  group.add(botCap);
  // tassel
  const tasselMat = new THREE.MeshStandardMaterial({ color: 0xf3d27a, roughness: 0.55, metalness: 0.5 });
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 8), tasselMat);
  tassel.position.y = -0.66;
  tassel.rotation.x = Math.PI;
  group.add(tassel);
  // hanging string
  const stringMat = new THREE.MeshBasicMaterial({ color: 0x4a2a08 });
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.2, 6), stringMat);
  str.position.y = 1.1;
  group.add(str);

  group.userData.sway = Math.random() * Math.PI;
  return group;
}
{
  const l1 = makeLantern(0xc41020);
  l1.position.set(-5.4, 3.4, -3.8);
  scene.add(l1);
  state._lantern1 = l1;
  const l2 = makeLantern(0xc41020);
  l2.position.set(5.4, 3.0, -3.8);
  scene.add(l2);
  state._lantern2 = l2;
  const l3 = makeLantern(0xa00010);
  l3.position.set(-3.8, 4.4, -6.5);
  l3.scale.setScalar(0.7);
  scene.add(l3);
  state._lantern3 = l3;
}

// ============================================================ TABLE
{
  const tableGroup = new THREE.Group();

  // Outer wood base
  const baseGeo = new THREE.CylinderGeometry(4.0, 4.2, 0.55, 56);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x180306, roughness: 0.85, metalness: 0.05
  });
  const base = new THREE.Mesh(baseGeo, baseMat);
  base.position.y = -0.28;
  base.receiveShadow = true;
  tableGroup.add(base);

  // Felt top — canvas texture
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');

  const grd = ctx.createRadialGradient(512, 512, 60, 512, 512, 512);
  grd.addColorStop(0,   '#6a1018');
  grd.addColorStop(0.5, '#48080f');
  grd.addColorStop(0.85,'#2a0408');
  grd.addColorStop(1,   '#160205');
  ctx.fillStyle = grd; ctx.fillRect(0,0,1024,1024);

  // Felt weave
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 240; i++) {
    ctx.strokeStyle = i % 2 ? '#fff' : '#000';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(Math.random()*1024, 0);
    ctx.lineTo(Math.random()*1024 + (Math.random()-0.5)*40, 1024);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Gold rings
  ctx.strokeStyle = '#d4a23a'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(512, 512, 488, 0, Math.PI*2); ctx.stroke();
  ctx.setLineDash([8, 10]);
  ctx.strokeStyle = '#f3d27a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(512, 512, 460, 0, Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);

  // Auspicious cloud patterns around the rim
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#f3d27a';
  ctx.lineWidth = 1.5;
  for (let a = 0; a < Math.PI*2; a += Math.PI/8) {
    const cx = 512 + Math.cos(a)*430;
    const cy = 512 + Math.sin(a)*430;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, Math.PI*2);
    ctx.arc(cx-18, cy-8, 14, 0, Math.PI*2);
    ctx.arc(cx+18, cy-8, 14, 0, Math.PI*2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 中央 moon-shaped circle outline where the bowl sits
  ctx.strokeStyle = 'rgba(243, 210, 122, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.arc(512, 512, 200, 0, Math.PI*2); ctx.stroke();
  ctx.setLineDash([]);

  const feltTex = new THREE.CanvasTexture(c);
  feltTex.anisotropy = 16;
  feltTex.encoding = THREE.sRGBEncoding;

  const feltGeo = new THREE.CircleGeometry(3.92, 64);
  const feltMat = new THREE.MeshStandardMaterial({
    map: feltTex, roughness: 0.92, metalness: 0.0
  });
  const felt = new THREE.Mesh(feltGeo, feltMat);
  felt.rotation.x = -Math.PI/2;
  felt.position.y = 0.005;
  felt.receiveShadow = true;
  tableGroup.add(felt);

  // Gold trim torus
  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(3.95, 0.06, 14, 96),
    new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.32, metalness: 0.95 })
  );
  trim.rotation.x = Math.PI/2;
  trim.position.y = 0.02;
  tableGroup.add(trim);

  scene.add(tableGroup);
}

// ============================================================ DICE ARENA (no dome — open table)
// A flat gold ring on the felt marks where the dice land. Replaces the old glass dome.
const ARENA_RADIUS = 1.55;
const arenaGroup = new THREE.Group();
arenaGroup.position.set(0, 0, 0);
{
  // Slightly darkened felt circle inside the play area for visual contrast
  const arenaPad = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_RADIUS, 56),
    new THREE.MeshStandardMaterial({
      color: 0x2a0608,
      roughness: 0.92,
      metalness: 0.0,
      transparent: true,
      opacity: 0.55,
    })
  );
  arenaPad.rotation.x = -Math.PI/2;
  arenaPad.position.y = 0.012;
  arenaPad.receiveShadow = true;
  arenaGroup.add(arenaPad);

  // Decorative gold ring marking the arena edge (flat, sits on the felt)
  const ringOuter = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_RADIUS, 0.035, 14, 64),
    new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.32, metalness: 0.95 })
  );
  ringOuter.rotation.x = Math.PI/2;
  ringOuter.position.y = 0.022;
  arenaGroup.add(ringOuter);

  // Inner thin gold ring for layered detail
  const ringInner = new THREE.Mesh(
    new THREE.TorusGeometry(ARENA_RADIUS - 0.12, 0.015, 10, 56),
    new THREE.MeshStandardMaterial({ color: 0xf3d27a, roughness: 0.35, metalness: 0.9 })
  );
  ringInner.rotation.x = Math.PI/2;
  ringInner.position.y = 0.018;
  arenaGroup.add(ringInner);
}
scene.add(arenaGroup);

// ============================================================ DICE
const FACE_ROTATIONS = {
  // Box geometry face order: +X, -X, +Y, -Y, +Z, -Z mapped to dice values 1, 6, 2, 5, 3, 4
  // To show face N on top (+Y), we need this rotation:
  1: new THREE.Euler(0, 0, -Math.PI/2),
  2: new THREE.Euler(0, 0, 0),
  3: new THREE.Euler(Math.PI/2, 0, 0),
  4: new THREE.Euler(-Math.PI/2, 0, 0),
  5: new THREE.Euler(Math.PI, 0, 0),
  6: new THREE.Euler(0, 0, Math.PI/2),
};

function makeDiceFaceTexture(value) {
  const SZ = 256;
  const c = document.createElement('canvas');
  c.width = c.height = SZ;
  const ctx = c.getContext('2d');

  // Ivory background with subtle vertical tonal shift
  const bg = ctx.createLinearGradient(0, 0, 0, SZ);
  bg.addColorStop(0,    '#fffaf2');
  bg.addColorStop(0.55, '#f7eada');
  bg.addColorStop(1,    '#e8d4b3');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, SZ, SZ);

  // Grainy/aged speckles
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(160, 110, 60, ${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * SZ, Math.random() * SZ, 2, 2);
  }

  // Soft inner vignette (darker toward edges — simulates bevel shadow)
  const vg = ctx.createRadialGradient(SZ/2, SZ/2, SZ*0.35, SZ/2, SZ/2, SZ*0.65);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(80, 50, 20, 0.32)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, SZ, SZ);

  // Pip positions (scaled to 256x256)
  const positions = {
    1: [[128, 128]],
    2: [[72, 72], [184, 184]],
    3: [[72, 72], [128, 128], [184, 184]],
    4: [[72, 72], [184, 72], [72, 184], [184, 184]],
    5: [[72, 72], [184, 72], [128, 128], [72, 184], [184, 184]],
    6: [[72, 64], [184, 64], [72, 128], [184, 128], [72, 192], [184, 192]],
  }[value];

  const isRed = (value === 1 || value === 4);
  const PIP_R = 22;
  for (const [x, y] of positions) {
    // Soft drop shadow under pip
    ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 3, PIP_R + 1, 0, Math.PI*2);
    ctx.fill();

    // Pip well (deep gradient for the inset look)
    const grd = ctx.createRadialGradient(x - 5, y - 6, 1, x, y, PIP_R);
    if (isRed) {
      grd.addColorStop(0,    '#ff9d9d');
      grd.addColorStop(0.30, '#ea2535');
      grd.addColorStop(0.78, '#7c0014');
      grd.addColorStop(1,    '#3a0008');
    } else {
      grd.addColorStop(0,    '#6a1828');
      grd.addColorStop(0.35, '#2c0612');
      grd.addColorStop(0.85, '#0a0204');
      grd.addColorStop(1,    '#000');
    }
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, PIP_R, 0, Math.PI*2);
    ctx.fill();

    // Specular highlight on the well rim
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.arc(x - 6, y - 7, 5, 0, Math.PI*2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 16;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// Rounded-box geometry: a BoxGeometry whose surface is "inflated" outward at
// the corners so the cube looks like a real casino die with chamfered edges.
function makeRoundedBoxGeometry(size, radius, segments = 6) {
  const geo = new THREE.BoxGeometry(size, size, size, segments, segments, segments);
  const half = size / 2;
  const innerHalf = half - radius;
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const cx = Math.max(-innerHalf, Math.min(innerHalf, x));
    const cy = Math.max(-innerHalf, Math.min(innerHalf, y));
    const cz = Math.max(-innerHalf, Math.min(innerHalf, z));
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const len = Math.sqrt(dx*dx + dy*dy + dz*dz);
    if (len > 0.0001) {
      const f = radius / len;
      pos.setXYZ(i, cx + dx*f, cy + dy*f, cz + dz*f);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function makeDie() {
  const size = 0.50;
  const geom = makeRoundedBoxGeometry(size, 0.06, 6);
  // Three.js BoxGeometry face index order: +X, -X, +Y, -Y, +Z, -Z
  // We map: +X=1, -X=6, +Y=2, -Y=5, +Z=3, -Z=4 (opposite faces sum to 7)
  const mats = [1, 6, 2, 5, 3, 4].map(v => new THREE.MeshStandardMaterial({
    map: makeDiceFaceTexture(v),
    roughness: 0.32,
    metalness: 0.10,
    emissive: 0x1f0d05,
    emissiveIntensity: 0.18,
  }));
  const mesh = new THREE.Mesh(geom, mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const dice = [];
const DICE_RESTING_POSITIONS = [
  [-0.52,  0.28, -0.32],
  [ 0.00,  0.28, -0.32],
  [ 0.52,  0.28, -0.32],
  [-0.52,  0.28,  0.26],
  [ 0.00,  0.28,  0.26],
  [ 0.52,  0.28,  0.26],
];
for (let i = 0; i < 6; i++) {
  const d = makeDie();
  d.position.set(...DICE_RESTING_POSITIONS[i]);
  const startVal = ((i * 7 + 3) % 6) + 1;
  d.setRotationFromEuler(FACE_ROTATIONS[startVal]);
  d.userData.value = startVal;
  d.userData.winning = false;
  scene.add(d);
  dice.push(d);
}

// ============================================================ PHYSICS WORLD (cannon.js)
const world = new CANNON.World();
world.gravity.set(0, -22, 0);                     // stronger-than-earth for snappy dice
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 16;
world.allowSleep = true;
world.defaultContactMaterial.contactEquationStiffness = 1e7;
world.defaultContactMaterial.contactEquationRelaxation = 3;

// Materials
const _diceMat  = new CANNON.Material('dice');
const _floorMat = new CANNON.Material('floor');
world.addContactMaterial(new CANNON.ContactMaterial(_diceMat, _floorMat, {
  friction: 0.45, restitution: 0.30,
}));
// Higher dice-on-dice friction + very low restitution so a die can't comfortably
// rest on top of another one — it slides off onto the felt instead.
world.addContactMaterial(new CANNON.ContactMaterial(_diceMat, _diceMat, {
  friction: 0.55, restitution: 0.12,
}));

// Felt floor — horizontal plane at the table surface (y ≈ 0.01)
{
  const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: _floorMat });
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI/2);
  b.position.set(0, 0.01, 0);
  world.addBody(b);
}
// Soft safety ceiling — far above so dice can fall from up high but never escape upward
{
  const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: _floorMat });
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI/2);
  b.position.set(0, 5.0, 0);
  world.addBody(b);
}
// Invisible containment walls keep the dice in the central play area (no dome — just an open ring).
// Slightly larger radius than the visible gold ring so dice can roll right up against the edge.
const BOWL_WALL_RADIUS = ARENA_RADIUS + 0.05;
const BOWL_WALL_SEGMENTS = 16;
for (let i = 0; i < BOWL_WALL_SEGMENTS; i++) {
  const a = (i / BOWL_WALL_SEGMENTS) * Math.PI * 2;
  const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: _floorMat });
  b.position.set(Math.cos(a) * BOWL_WALL_RADIUS, 1.0, Math.sin(a) * BOWL_WALL_RADIUS);
  // Rotate +Z (default plane normal) to point toward origin
  b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -a - Math.PI/2);
  world.addBody(b);
}

// Dice rigid bodies — one Box per visual die
const DIE_PHYS_HALF = 0.25; // half of the visual 0.50 cube
const diceBodies = [];
dice.forEach((mesh, i) => {
  const body = new CANNON.Body({
    mass: 0.30,
    shape: new CANNON.Box(new CANNON.Vec3(DIE_PHYS_HALF, DIE_PHYS_HALF, DIE_PHYS_HALF)),
    material: _diceMat,
    linearDamping: 0.10,
    angularDamping: 0.10,
    allowSleep: true,
    sleepSpeedLimit: 0.06,
    sleepTimeLimit: 0.35,
  });
  body.position.set(mesh.position.x, mesh.position.y, mesh.position.z);
  body.quaternion.set(mesh.quaternion.x, mesh.quaternion.y, mesh.quaternion.z, mesh.quaternion.w);
  diceBodies.push(body);
  world.addBody(body);
});

// === Helpers ====================================================
// Park all dice off-stage (used both for the dramatic sequential drop and the
// presettle on page load). Bodies are slept far below the bowl so they don't
// interfere with the simulation while we wait to release them.
function parkDice() {
  dice.forEach(d => { d.visible = false; });
  for (let i = 0; i < diceBodies.length; i++) {
    const body = diceBodies[i];
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.position.set((i - 2.5) * 2.5, -20, 0); // way below the table
    body.quaternion.set(0, 0, 0, 1);
    body.sleep();
  }
}

// Pre-allocated 2x3 grid of drop columns so each die lands in its own cell
// (prevents stacking when six dice are dropped sequentially into the same area).
const SPAWN_GRID = [
  [-0.85, -0.55],
  [ 0.00, -0.62],
  [ 0.85, -0.55],
  [-0.85,  0.55],
  [ 0.00,  0.62],
  [ 0.85,  0.55],
];

// Drop a single die onto the felt with light initial velocity + heavy spin.
// The die appears high above its assigned grid cell and free-falls dramatically.
function releaseDie(i) {
  const body = diceBodies[i];
  const [gx, gz] = SPAWN_GRID[i];
  const jx = (Math.random() - 0.5) * 0.18;
  const jz = (Math.random() - 0.5) * 0.18;
  body.position.set(
    gx + jx,
    2.6 + Math.random() * 0.4,                          // high above the felt — dramatic fall
    gz + jz
  );
  const q = new CANNON.Quaternion();
  q.setFromEuler(Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2, 'XYZ');
  body.quaternion.copy(q);
  // Counter the spawn jitter so each die nudges back toward its grid cell.
  // Gentle downward push, gravity does the dramatic work.
  body.velocity.set(
    -jx * 1.5,
    -1.0 - Math.random() * 1.2,
    -jz * 1.5
  );
  // Heavy spin while in the air; friction kills it quickly on the felt
  body.angularVelocity.set(
    (Math.random() - 0.5) * 26,
    (Math.random() - 0.5) * 26,
    (Math.random() - 0.5) * 26
  );
  body.wakeUp();
  // Sync mesh transform so it appears in the right place the moment it's revealed
  dice[i].position.copy(body.position);
  dice[i].quaternion.copy(body.quaternion);
  dice[i].visible = true;
  // Brief pop-in scale animation for extra drama
  dice[i].scale.set(0.6, 0.6, 0.6);
  dice[i].userData.popIn = { t: 0, dur: 0.18 };
  // Audible "thunk" per die — varied pitch so six in a row feels percussive, not robotic
  AUDIO.play('dieThrow', { vol: 0.85, rate: 0.92 + Math.random() * 0.16 });
}

// Sequentially drop all 6 dice with a delay between each one (dramatic intro).
async function throwDice() {
  parkDice();
  await sleep(220);                                      // brief anticipation pause
  for (let i = 0; i < diceBodies.length; i++) {
    releaseDie(i);
    await sleep(230);                                    // delay between drops
  }
}

// After the dice settle, read which face value is up by finding which local axis
// is closest to world +Y. Three.js box face order: +X, -X, +Y, -Y, +Z, -Z mapped to 1, 6, 2, 5, 3, 4.
const _FACE_DIRS = [
  { local: new CANNON.Vec3( 1, 0, 0), value: 1 },
  { local: new CANNON.Vec3(-1, 0, 0), value: 6 },
  { local: new CANNON.Vec3( 0, 1, 0), value: 2 },
  { local: new CANNON.Vec3( 0,-1, 0), value: 5 },
  { local: new CANNON.Vec3( 0, 0, 1), value: 3 },
  { local: new CANNON.Vec3( 0, 0,-1), value: 4 },
];
function readDieValue(body) {
  const worldVec = new CANNON.Vec3();
  let bestY = -Infinity, bestValue = 1;
  for (const f of _FACE_DIRS) {
    body.quaternion.vmult(f.local, worldVec);
    if (worldVec.y > bestY) { bestY = worldVec.y; bestValue = f.value; }
  }
  return bestValue;
}

// Poll until every die is sleeping (or below a tiny velocity threshold), capped by
// maxMs. minMs ensures we always tumble visibly even if a die settles instantly.
async function waitForDiceToRest(maxMs, minMs = 0) {
  const tStart = performance.now();
  while (true) {
    await sleep(120);
    const elapsedMs = performance.now() - tStart;
    if (elapsedMs > maxMs) return;
    if (elapsedMs < minMs) continue;
    const allResting = diceBodies.every(b =>
      b.sleepState === CANNON.Body.SLEEPING ||
      (b.velocity.lengthSquared() < 0.002 && b.angularVelocity.lengthSquared() < 0.01)
    );
    if (allResting) return;
  }
}

// A flat-on-the-felt die has its centre at y ≈ floorY + halfSize = 0.01 + 0.25 = 0.26.
// Anything sitting noticeably higher than that must be perched on another die.
const FLAT_Y_MAX = 0.26 + 0.06;          // generous tolerance

// Detect any die whose centre is higher than FLAT_Y_MAX (i.e. it's resting on top
// of another die) and apply a horizontal impulse + small upward kick so it slides
// off onto bare felt. Returns true if any die was nudged.
function nudgeStackedDice() {
  let nudged = false;
  for (let i = 0; i < diceBodies.length; i++) {
    const body = diceBodies[i];
    if (body.position.y <= FLAT_Y_MAX) continue;

    // Pick a horizontal direction that points outward from the centre of the
    // pile so the die slides toward open felt rather than into another die.
    let dx = body.position.x;
    let dz = body.position.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) {
      // Right above the centre — pick a random direction
      const a = Math.random() * Math.PI * 2;
      dx = Math.cos(a);
      dz = Math.sin(a);
    } else {
      dx /= len;
      dz /= len;
    }

    body.wakeUp();
    body.velocity.set(
      dx * (1.8 + Math.random() * 0.8),
      0.9 + Math.random() * 0.4,
      dz * (1.8 + Math.random() * 0.8)
    );
    body.angularVelocity.set(
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14,
      (Math.random() - 0.5) * 14
    );
    nudged = true;
  }
  return nudged;
}

// Pre-simulate so dice settle into a natural starting pose before the player sees the scene
// (no drama needed on init — just drop them all once and let physics relax)
function presettleDice() {
  dice.forEach(d => { d.visible = true; d.scale.set(1, 1, 1); });
  for (let i = 0; i < diceBodies.length; i++) {
    const body = diceBodies[i];
    const ang = (i / diceBodies.length) * Math.PI * 2;
    body.position.set(
      Math.cos(ang) * 0.30,
      0.70 + Math.random() * 0.20,
      Math.sin(ang) * 0.30
    );
    body.quaternion.setFromEuler(
      Math.random()*Math.PI*2, Math.random()*Math.PI*2, Math.random()*Math.PI*2, 'XYZ'
    );
    body.velocity.set((Math.random()-0.5), -1.0, (Math.random()-0.5));
    body.angularVelocity.set(
      (Math.random()-0.5)*8, (Math.random()-0.5)*8, (Math.random()-0.5)*8
    );
    body.wakeUp();
  }
  for (let i = 0; i < 240; i++) world.step(1/60);
  for (let i = 0; i < dice.length; i++) {
    dice[i].position.copy(diceBodies[i].position);
    dice[i].quaternion.copy(diceBodies[i].quaternion);
    dice[i].userData.value = readDieValue(diceBodies[i]);
  }
}
presettleDice();

// ============================================================ BET ZONES
const zoneMeshes = [];   // for raycaster
const zoneByTier = {};   // tier -> { group, topMat, chipStack: [] }

function makeZoneTexture(tier, zone) {
  const w = 1024, h = 576;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');

  // Subtle gradient background (darker at edges)
  const bg = ctx.createRadialGradient(w/2, h/2, 40, w/2, h/2, w*0.7);
  bg.addColorStop(0,   'rgba(60, 8, 14, 0.78)');
  bg.addColorStop(0.7, 'rgba(30, 4, 8, 0.86)');
  bg.addColorStop(1,   'rgba(14, 2, 4, 0.92)');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

  // Bright glow border (accent color)
  const accentHex = '#' + zone.color.toString(16).padStart(6,'0');
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 12;
  ctx.shadowColor = accentHex;
  ctx.shadowBlur = 20;
  ctx.strokeRect(14, 14, w-28, h-28);
  ctx.shadowBlur = 0;

  // Inner dashed border (gold)
  ctx.strokeStyle = 'rgba(243, 210, 122, 0.55)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([10, 14]);
  ctx.strokeRect(34, 34, w-68, h-68);
  ctx.setLineDash([]);

  // Decorative corners (small ornaments)
  ctx.fillStyle = 'rgba(243, 210, 122, 0.4)';
  [[40,40],[w-40,40],[40,h-40],[w-40,h-40]].forEach(([cx,cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, Math.PI*2);
    ctx.fill();
  });

  const def = TIERS[tier] || SIDE_TIERS[tier];
  const isSide = zone.side;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Chinese title — large glowing gold gradient
  const cnFont = isSide ? 130 : 175;
  const cnY = isSide ? 200 : 220;
  const cnGrad = ctx.createLinearGradient(0, cnY-90, 0, cnY+90);
  cnGrad.addColorStop(0,   '#fff7c8');
  cnGrad.addColorStop(0.45,'#ffd34f');
  cnGrad.addColorStop(1,   '#a07020');
  ctx.fillStyle = cnGrad;
  ctx.shadowColor = 'rgba(255, 170, 60, 0.85)';
  ctx.shadowBlur = 28;
  ctx.font = `900 ${cnFont}px "Ma Shan Zheng", "Noto Serif SC", serif`;
  ctx.fillText(def.cn, w/2, cnY);
  ctx.shadowBlur = 0;

  // English subtitle
  ctx.fillStyle = '#f3d27a';
  ctx.font = `900 ${isSide ? 36 : 42}px Cinzel, serif`;
  ctx.fillText(def.en, w/2, isSide ? 330 : 360);

  // Payout — big and glowing
  ctx.fillStyle = '#ffe681';
  ctx.font = `900 ${isSide ? 52 : 68}px Cinzel, serif`;
  ctx.shadowColor = 'rgba(255, 220, 100, 0.9)';
  ctx.shadowBlur = 16;
  const payText = def.pay === 'JP' ? 'JACKPOT' : `${def.pay} : 1`;
  ctx.fillText(payText, w/2, isSide ? 440 : 480);

  ctx.restore();

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 16;
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

ZONES.forEach(z => {
  const group = new THREE.Group();
  group.position.set(z.x, 0.012, z.z);

  const tex = makeZoneTexture(z.tier, z);
  const topMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.65,
    metalness: 0.05,
    transparent: true,
    emissive: new THREE.Color(z.color),
    emissiveMap: tex,
    emissiveIntensity: 0.0,
  });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x2a0408, roughness: 0.9 });

  // Materials array for BoxGeometry: +X, -X, +Y, -Y, +Z, -Z
  const mats = [sideMat, sideMat, topMat, sideMat, sideMat, sideMat];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(z.w, 0.02, z.h), mats);
  mesh.userData.tier = z.tier;
  mesh.userData.group = group;
  mesh.userData.isZone = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Subtle "glow plate" underneath for win/hover state
  const glowGeo = new THREE.PlaneGeometry(z.w * 1.15, z.h * 1.15);
  const glowMat = new THREE.MeshBasicMaterial({
    color: z.color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI/2;
  glow.position.y = 0.011;
  group.add(glow);

  group.userData.topMat = topMat;
  group.userData.glowMat = glowMat;
  group.userData.zone = z;
  group.userData.chipStack = []; // 3D chip meshes placed here

  scene.add(group);
  zoneMeshes.push(mesh);
  zoneByTier[z.tier] = group;
});

// ============================================================ CHIP RACK (3D)
const rackChips = [];      // for raycaster
const rackGroup = new THREE.Group();
rackGroup.position.set(0, 0.55, 4.05);
rackGroup.rotation.x = -0.15; // tilt slightly toward camera for visibility
scene.add(rackGroup);

function makeChipMesh(value, color, radius = 0.21, height = 0.04) {
  const group = new THREE.Group();
  group.userData.chipValue = value;

  // Chip top texture
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#' + color.toString(16).padStart(6,'0');
  ctx.beginPath(); ctx.arc(128, 128, 122, 0, Math.PI*2); ctx.fill();
  // white outer ring
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(128, 128, 108, 0, Math.PI*2); ctx.stroke();
  // dashed sector marks
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.translate(128, 128);
    ctx.rotate(i * Math.PI/4);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-12, -122, 24, 26);
    ctx.restore();
  }
  // inner circle
  ctx.fillStyle = '#' + color.toString(16).padStart(6,'0');
  ctx.beginPath(); ctx.arc(128, 128, 78, 0, Math.PI*2); ctx.fill();
  // value
  ctx.fillStyle = (value === 1000) ? '#4a0d14' : (value === 100 ? '#ffd34f' : '#fff');
  ctx.font = 'bold 56px Cinzel, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value >= 1000 ? (value/1000)+'K' : String(value), 128, 134);
  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;

  const sideMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 });
  const topMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1 });

  const geo = new THREE.CylinderGeometry(radius, radius, height, 28);
  // BoxGeometry: side, side, top, bottom, side, side (actually Cylinder: side, top, bottom)
  const chip = new THREE.Mesh(geo, [sideMat, topMat, topMat]);
  chip.castShadow = true;
  chip.receiveShadow = true;
  group.add(chip);
  return group;
}

// Build rack
{
  // Wooden tray (curved arc would be nicer; box for simplicity)
  const trayGeo = new THREE.BoxGeometry(4.0, 0.16, 0.7);
  const trayMat = new THREE.MeshStandardMaterial({ color: 0x3a1810, roughness: 0.7, metalness: 0.2 });
  const tray = new THREE.Mesh(trayGeo, trayMat);
  tray.castShadow = true;
  tray.receiveShadow = true;
  rackGroup.add(tray);

  // Gold trim along top edges
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.35, metalness: 0.95 });
  const trimFront = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.025, 0.07), trimMat);
  trimFront.position.set(0, 0.10, -0.32);
  rackGroup.add(trimFront);
  const trimBack = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.025, 0.07), trimMat);
  trimBack.position.set(0, 0.10, 0.32);
  rackGroup.add(trimBack);
  // Decorative corner caps
  [-2, 2].forEach(x => {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), trimMat);
    cap.position.set(x, 0.10, 0);
    rackGroup.add(cap);
  });

  const denoms = [
    { value: 5,    color: 0xc92020 },
    { value: 25,   color: 0x2da14b },
    { value: 100,  color: 0x1f1f24 },
    { value: 500,  color: 0x5d2eb1 },
    { value: 1000, color: 0xf3d27a }
  ];
  denoms.forEach((d, i) => {
    // make a 4-chip stack for visual depth
    for (let s = 0; s < 4; s++) {
      const chip = makeChipMesh(d.value, d.color, 0.32, 0.06);
      chip.position.set(-1.6 + i * 0.8, 0.11 + s * 0.06, 0);
      // only top chip is draggable / clickable
      if (s === 3) {
        chip.userData.isRackChip = true;
        chip.userData.value = d.value;
        chip.userData.color = d.color;
        const top = chip.children[0];
        top.userData.isRackChip = true;
        top.userData.value = d.value;
        rackChips.push(top);
      }
      rackGroup.add(chip);
    }
  });
}

// ============================================================ LEVER
const lever = new THREE.Group();
lever.position.set(4.8, 0, 2.6);
scene.add(lever);

const leverArm = new THREE.Group(); // pivot
const leverKnob = makeChipMesh(0, 0xc41020, 0.0); // placeholder; replaced below
let _leverKnobMesh;

{
  // Wooden box base
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 1.0, 0.55),
    new THREE.MeshStandardMaterial({ color: 0x3a1810, roughness: 0.7, metalness: 0.2 })
  );
  base.position.y = 0.5;
  base.castShadow = true;
  base.receiveShadow = true;
  lever.add(base);

  // Brass top plate
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.24, 0.06, 24),
    new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.3, metalness: 0.95 })
  );
  plate.position.set(0, 1.04, 0);
  plate.castShadow = true;
  lever.add(plate);

  // Pivot
  const pivot = new THREE.Mesh(
    new THREE.SphereGeometry(0.10, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.4, metalness: 0.95 })
  );
  pivot.position.set(0, 1.07, 0);
  lever.add(pivot);

  // Arm (cylinder) sitting on pivot
  leverArm.position.set(0, 1.07, 0);
  lever.add(leverArm);

  const armMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1.0, 16),
    new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.35, metalness: 0.9 })
  );
  armMesh.position.y = 0.5; // sticks up from pivot
  armMesh.castShadow = true;
  leverArm.add(armMesh);

  // Red knob
  const knobMat = new THREE.MeshStandardMaterial({
    color: 0xc41020, roughness: 0.3, metalness: 0.1,
    emissive: 0x5a0008, emissiveIntensity: 0.5
  });
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), knobMat);
  knob.position.y = 1.1;
  knob.castShadow = true;
  knob.userData.isLever = true;
  _leverKnobMesh = knob;
  leverArm.add(knob);
}

// ============================================================ DEALER CHARACTER
const dealer = new THREE.Group();
dealer.position.set(0, 0, -4.6);
dealer.scale.setScalar(1.15);
scene.add(dealer);

let _dealerEyes = [];

{
  // Robe — truncated cone (narrow at neck, wide at floor) so head/hat sit above it
  const robeMat = new THREE.MeshStandardMaterial({ color: 0x4a060f, roughness: 0.75, metalness: 0.0 });
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.40, 1.45, 2.45, 24, 1, false), robeMat);
  robe.position.y = 1.225;
  robe.castShadow = true;
  robe.receiveShadow = true;
  dealer.add(robe);

  // Gold trim at robe bottom
  const robeTrim = new THREE.Mesh(
    new THREE.TorusGeometry(1.38, 0.04, 10, 32),
    new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.35, metalness: 0.95 })
  );
  robeTrim.position.y = 0.02;
  robeTrim.rotation.x = Math.PI/2;
  dealer.add(robeTrim);

  // V-shaped gold collar on chest
  const collarMat = new THREE.MeshStandardMaterial({ color: 0xd4a23a, roughness: 0.4, metalness: 0.9 });
  const collar = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.35, 4), collarMat);
  collar.position.set(0, 2.05, 0.42);
  collar.rotation.x = Math.PI;
  dealer.add(collar);

  // Neck
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.22, 0.28, 16),
    new THREE.MeshStandardMaterial({ color: 0xc4a684, roughness: 0.6 })
  );
  neck.position.set(0, 2.55, 0.05);
  dealer.add(neck);

  // Head — slightly elongated sphere
  const headTex = makeDealerFaceTexture();
  const headGeo = new THREE.SphereGeometry(0.45, 32, 32);
  const headMat = new THREE.MeshStandardMaterial({
    map: headTex, roughness: 0.55, metalness: 0.0
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.set(0, 2.85, 0.05);
  head.castShadow = true;
  dealer.add(head);

  // Hat (官帽 — black cap with side flaps)
  const hatTopMat = new THREE.MeshStandardMaterial({ color: 0x080104, roughness: 0.65 });
  const hatTop = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.34, 18), hatTopMat);
  hatTop.position.set(0, 3.32, 0.0);
  hatTop.castShadow = true;
  dealer.add(hatTop);
  // hat brim
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 24), hatTopMat);
  brim.position.set(0, 3.14, 0.0);
  dealer.add(brim);
  // Hat side flaps (官帽 wings)
  const flapMat = new THREE.MeshStandardMaterial({ color: 0x0a0204, roughness: 0.6 });
  const flapL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.08), flapMat);
  flapL.position.set(-0.55, 3.20, 0.0);
  dealer.add(flapL);
  const flapR = flapL.clone();
  flapR.position.x = 0.55;
  dealer.add(flapR);
  // Gold seal on hat
  const sealMat = new THREE.MeshStandardMaterial({ color: 0xf3d27a, roughness: 0.3, metalness: 0.95, emissive: 0x6e4e0a, emissiveIntensity: 0.4 });
  const seal = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), sealMat);
  seal.position.set(0, 3.5, 0.36);
  dealer.add(seal);

  // Glowing eyes — small spheres
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0xff3030, emissive: 0xff3030, emissiveIntensity: 2.5,
    roughness: 0.3, metalness: 0.0
  });
  const eyeGeo = new THREE.SphereGeometry(0.04, 12, 10);
  const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
  eyeL.position.set(-0.13, 2.92, 0.43);
  dealer.add(eyeL);
  const eyeR = new THREE.Mesh(eyeGeo, eyeMat.clone());
  eyeR.position.set(0.13, 2.92, 0.43);
  dealer.add(eyeR);
  _dealerEyes.push(eyeL, eyeR);

  // Eye glow point lights (subtle)
  const eyeLight = new THREE.PointLight(0xff4040, 0.6, 1.5);
  eyeLight.position.set(0, 2.95, 0.5);
  dealer.add(eyeLight);
  state._eyeLight = eyeLight;
}

function makeDealerFaceTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  // skin gradient
  const g = ctx.createRadialGradient(100, 90, 30, 128, 128, 130);
  g.addColorStop(0, '#f5e6d3');
  g.addColorStop(0.5, '#d8b48c');
  g.addColorStop(1, '#704020');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);

  // brows
  ctx.strokeStyle = '#1a0a08';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(70, 108); ctx.quadraticCurveTo(90, 96, 108, 112);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(148, 112); ctx.quadraticCurveTo(166, 96, 186, 108);
  ctx.stroke();

  // eyes (closed look — eyelid shadow line, real eyes are emissive 3D meshes in front)
  ctx.strokeStyle = '#1a0a08';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(75, 125); ctx.lineTo(105, 125); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(151, 125); ctx.lineTo(181, 125); ctx.stroke();

  // nose
  ctx.strokeStyle = 'rgba(80, 40, 20, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(128, 130); ctx.lineTo(122, 168); ctx.lineTo(134, 168); ctx.stroke();

  // mouth
  ctx.strokeStyle = '#3a0006';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(106, 185);
  ctx.quadraticCurveTo(128, 196, 150, 185);
  ctx.stroke();

  // mustache
  ctx.strokeStyle = '#1a0a08';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(110, 178); ctx.quadraticCurveTo(96, 188, 80, 200);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(146, 178); ctx.quadraticCurveTo(160, 188, 176, 200);
  ctx.stroke();

  // beard outline
  ctx.fillStyle = 'rgba(26,10,8,0.45)';
  ctx.beginPath();
  ctx.moveTo(112, 200);
  ctx.quadraticCurveTo(118, 220, 128, 232);
  ctx.quadraticCurveTo(138, 220, 144, 200);
  ctx.quadraticCurveTo(128, 208, 112, 200);
  ctx.fill();

  const tex = new THREE.CanvasTexture(c);
  tex.encoding = THREE.sRGBEncoding;
  return tex;
}

// ============================================================ FLOOR (subtle, gives depth)
{
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({ color: 0x080205, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI/2;
  floor.position.y = -0.61;
  floor.receiveShadow = true;
  scene.add(floor);
}

// ============================================================ PARTICLES (win celebration)
const winParticles = new THREE.Group();
scene.add(winParticles);

function spawnWinParticles(count = 60, fromY = 8) {
  const palette = [0xfff7c0, 0xffd34f, 0xff5050, 0xff8e3c];
  for (let i = 0; i < count; i++) {
    const color = palette[i % palette.length];
    const p = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 6),
      new THREE.MeshBasicMaterial({ color })
    );
    p.position.set((Math.random()-0.5) * 10, fromY + Math.random()*2, (Math.random()-0.5) * 6 - 0.5);
    p.userData.vel = new THREE.Vector3(
      (Math.random()-0.5) * 0.04,
      -0.05 - Math.random()*0.04,
      (Math.random()-0.5) * 0.04
    );
    p.userData.life = 1.6 + Math.random() * 1.4;
    p.userData.age = 0;
    winParticles.add(p);
  }
}

// ============================================================ INTERACTION (Raycaster + Pointer)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setPointer(e) {
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
}

function intersectFirst(meshes) {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(meshes, true);
  return hits.length ? hits[0] : null;
}

function getZoneUnderPointer() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(zoneMeshes, false);
  return hits.length ? hits[0].object : null;
}

function findRackChipUnderPointer() {
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(rackChips, false);
  return hits.length ? hits[0].object : null;
}

// ============================================================ CHIP PLACEMENT (3D)
function placeChipOnZone(tier, value) {
  const zoneGroup = zoneByTier[tier];
  if (!zoneGroup) return;
  const colorMap = { 5: 0xc92020, 25: 0x2da14b, 100: 0x1f1f24, 500: 0x5d2eb1, 1000: 0xf3d27a };
  const color = colorMap[value] || 0xc92020;
  const chip = makeChipMesh(value, color, 0.16, 0.04);
  const stack = zoneGroup.userData.chipStack;
  const stackIdx = stack.length;
  // stack a few chips, then offset to side
  const ix = stackIdx % 4;
  const iz = Math.floor(stackIdx / 4) % 3;
  chip.position.set(
    (ix - 1.5) * 0.10,
    0.04 + (Math.floor(stackIdx / 12)) * 0.05,
    (iz - 1) * 0.10
  );
  // drop animation
  chip.userData.dropAnim = { y0: chip.position.y + 0.6, y1: chip.position.y, t: 0 };
  chip.position.y = chip.userData.dropAnim.y0;
  zoneGroup.add(chip);
  stack.push(chip);

  state.bets[tier] = (state.bets[tier] || 0) + value;

  // Bigger stack → slightly higher pitch so repeated placements feel layered, not flat
  const pitch = 0.94 + Math.min(0.18, stack.length * 0.025) + (Math.random() - 0.5) * 0.04;
  AUDIO.play('chipPlace', { rate: pitch });
}

function clearAllChips() {
  for (const tier in zoneByTier) {
    const g = zoneByTier[tier];
    g.userData.chipStack.forEach(c => g.remove(c));
    g.userData.chipStack = [];
  }
  state.bets = {};
}

// ============================================================ POINTER EVENTS
function onPointerDown(e) {
  setPointer(e);
  if (state.phase !== "betting") return;

  // Lever?
  raycaster.setFromCamera(pointer, camera);
  const leverHits = raycaster.intersectObject(_leverKnobMesh, false);
  if (leverHits.length) {
    pullLever();
    return;
  }

  // Rack chip?
  const chip = findRackChipUnderPointer();
  if (chip) {
    const v = chip.userData.value;
    if (state.balance < v) {
      toast("INSUFFICIENT BALANCE · 余额不足");
      return;
    }
    state.drag.active = true;
    state.drag.value = v;
    state._lastChip = v;
    elDragChip.className = "drag-chip v" + v + " show";
    elDragChip.textContent = v >= 1000 ? (v/1000)+"K" : String(v);
    moveDragPreview(e.clientX, e.clientY);
    return;
  }
}

function onPointerMove(e) {
  setPointer(e);

  if (state.drag.active) {
    moveDragPreview(e.clientX, e.clientY);
    // Hover-highlight zone under pointer
    const zoneMesh = getZoneUnderPointer();
    if (state.hoveredZone !== zoneMesh) {
      // clear previous
      if (state.hoveredZone) {
        const prev = state.hoveredZone.userData.group;
        prev.userData.glowMat.opacity = 0;
        prev.userData.topMat.emissiveIntensity = 0;
      }
      state.hoveredZone = zoneMesh;
      if (zoneMesh) {
        const g = zoneMesh.userData.group;
        g.userData.glowMat.opacity = 0.35;
        g.userData.topMat.emissiveIntensity = 0.6;
      }
    }
    return;
  }

  // Cursor styling: pointer if over rack chip or lever
  raycaster.setFromCamera(pointer, camera);
  const lh = raycaster.intersectObject(_leverKnobMesh, false);
  const rh = findRackChipUnderPointer();
  canvas.style.cursor = (lh.length || rh) ? "pointer" : "default";
}

function onPointerUp(e) {
  setPointer(e);
  if (!state.drag.active) return;
  // Find zone under pointer
  const zoneMesh = getZoneUnderPointer();
  if (zoneMesh) {
    const tier = zoneMesh.userData.tier;
    if (state.balance >= state.drag.value) {
      state.balance -= state.drag.value;
      placeChipOnZone(tier, state.drag.value);
      updateHud();
    }
  }
  // Clear drag
  state.drag.active = false;
  state.drag.value = 0;
  elDragChip.className = "drag-chip";
  if (state.hoveredZone) {
    state.hoveredZone.userData.group.userData.glowMat.opacity = 0;
    state.hoveredZone.userData.group.userData.topMat.emissiveIntensity = 0;
    state.hoveredZone = null;
  }
}

function onContextMenu(e) {
  e.preventDefault();
  if (state.phase !== "betting") return;
  setPointer(e);
  const zoneMesh = getZoneUnderPointer();
  if (!zoneMesh) return;
  const tier = zoneMesh.userData.tier;
  const cur = state.bets[tier];
  if (!cur) return;
  const denoms = [1000, 500, 100, 25, 5];
  const d = denoms.find(x => x <= cur) || cur;
  state.bets[tier] -= d;
  state.balance += d;
  // remove top chip mesh from stack
  const group = zoneByTier[tier];
  const stk = group.userData.chipStack;
  const popped = stk.pop();
  if (popped) group.remove(popped);
  if (state.bets[tier] <= 0) delete state.bets[tier];
  updateHud();
  AUDIO.play('chipPickup', { vol: 0.8, rate: 0.95 + Math.random() * 0.1 });
}

function moveDragPreview(x, y) {
  elDragChip.style.left = x + "px";
  elDragChip.style.top  = y + "px";
}

canvas.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointermove", onPointerMove);
window.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("contextmenu", onContextMenu);

// Clear / Repeat buttons
$("#btnClear").addEventListener("click", () => {
  if (state.phase !== "betting") return;
  AUDIO.play('uiClick', { vol: 0.7 });
  const refund = Object.values(state.bets).reduce((a,b)=>a+b, 0);
  if (refund > 0) AUDIO.play('chipHandle', { vol: 0.8 });
  state.balance += refund;
  clearAllChips();
  updateHud();
});
$("#btnRepeat").addEventListener("click", () => {
  if (state.phase !== "betting") return;
  AUDIO.play('uiClick', { vol: 0.7 });
  if (!Object.keys(state.lastBets).length) { toast("NO PREVIOUS BET · 无上注"); return; }
  const refund = Object.values(state.bets).reduce((a,b)=>a+b, 0);
  state.balance += refund;
  clearAllChips();
  const total = Object.values(state.lastBets).reduce((a,b)=>a+b, 0);
  if (state.balance < total) {
    toast("INSUFFICIENT FOR REPEAT · 余额不足");
    updateHud();
    return;
  }
  state.balance -= total;
  for (const [tier, amt] of Object.entries(state.lastBets)) {
    // place stacked chips of single denom = 25 as visual approximation
    // For accuracy, break into denoms
    let r = amt;
    const denoms = [1000, 500, 100, 25, 5];
    for (const d of denoms) {
      while (r >= d) {
        placeChipOnZone(tier, d);
        r -= d;
      }
    }
  }
  updateHud();
});

// ============================================================ ROLL / SETTLE
let _leverAnimState = "idle";

function pullLever() {
  if (state.phase !== "betting") return;
  if (_leverAnimState !== "idle") return;
  const total = Object.values(state.bets).reduce((a,b)=>a+b, 0);
  if (total === 0) { toast("PLACE A BET FIRST · 请先下注"); return; }
  _leverAnimState = "pulling";
  AUDIO.play('leverPull', { vol: 0.9 });

  const startT = performance.now();
  function down() {
    const t = Math.min(1, (performance.now() - startT) / 360);
    leverArm.rotation.x = -t * 1.35;
    if (t < 1) requestAnimationFrame(down);
    else {
      const startT2 = performance.now();
      function up() {
        const t = Math.min(1, (performance.now() - startT2) / 350);
        leverArm.rotation.x = -1.35 * (1 - t);
        if (t < 1) requestAnimationFrame(up);
        else _leverAnimState = "idle";
      }
      up();
    }
  }
  down();

  setTimeout(() => triggerRoll(), 220);
}

let _rollAnim = null;

async function triggerRoll() {
  state.lastBets = { ...state.bets };
  state.phase = "rolling";
  setView('rolling');                  // dive the camera in over the bowl
  hideSpeech(); await sleep(150); speak("locked");
  AUDIO.play('diceGrab', { vol: 0.8 });
  await sleep(400); AUDIO.play('diceShake', { vol: 0.7 });
  await sleep(150); speak("rolling");

  if (state.bets.jackpot_bet) state.jackpot += state.bets.jackpot_bet * 0.7;
  state.jackpot += Math.floor(Math.random() * 60) + 40;
  updateHud();

  // === REAL PHYSICS ROLL ===
  // Sequential drop: each die is released one at a time with a delay, so the
  // player watches them clatter into the bowl one after another. Returns once
  // all 6 have been released into the simulation.
  await throwDice();

  // Now wait for the last few dice to come to rest (or hit the max-wait timeout)
  await waitForDiceToRest(5500, 600);

  // Post-settle: if any die ended up stacked on top of another, nudge it off
  // and let physics resolve again. Up to 3 attempts before we accept the result.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!nudgeStackedDice()) break;
    await waitForDiceToRest(2200, 250);
  }

  // Force-sleep any straggler so its quaternion is stable for the readout
  diceBodies.forEach(b => { b.velocity.setZero(); b.angularVelocity.setZero(); b.sleep && b.sleep(); });

  // Read the actual face values from the settled physics quaternions
  const finalDice = diceBodies.map(b => readDieValue(b));
  dice.forEach((d, i) => { d.userData.value = finalDice[i]; });

  await sleep(450);
  await settle(finalDice);
}

async function settle(finalDice) {
  state.phase = "settling";
  setView('payout');                   // pull back to show the table + winning zone
  const result = classify(finalDice);
  const sides = classifySides(finalDice);
  const mainTier = result.tier;
  const tierDef = TIERS[mainTier];

  // Highlight winning dice
  result.winningDice.forEach(i => { dice[i].userData.winning = true; });

  // Highlight main winning zone (and lose for others with bets)
  const mainGroup = zoneByTier[mainTier];
  if (mainGroup) mainGroup.userData._win = true;

  showBanner(tierDef.cn, tierDef.en + (tierDef.pay === "JP" ? " · JACKPOT!" : ` · ${tierDef.pay}:1`));

  let totalWin = 0;
  const winners = new Set();

  for (const [tier, amount] of Object.entries(state.bets)) {
    if (tier in TIERS) {
      if (tier === mainTier) {
        let win;
        if (tier === "supreme") {
          win = state.jackpot;
          state.jackpot = 50000;
        } else {
          win = amount * tierDef.pay;
        }
        winners.add(tier);
        totalWin += amount + win;
      } else {
        // lose — fade chip stack
        const g = zoneByTier[tier];
        if (g) g.userData._lose = true;
      }
    }
  }

  // Side bets
  if (state.bets.red) {
    if (sides.tie) totalWin += state.bets.red;
    else if (sides.red >= 4) {
      totalWin += state.bets.red + state.bets.red * SIDE_TIERS.red.pay;
      winners.add("red");
      zoneByTier.red.userData._win = true;
    } else zoneByTier.red.userData._lose = true;
  }
  if (state.bets.black) {
    if (sides.tie) totalWin += state.bets.black;
    else if (sides.black >= 4) {
      totalWin += state.bets.black + state.bets.black * SIDE_TIERS.black.pay;
      winners.add("black");
      zoneByTier.black.userData._win = true;
    } else zoneByTier.black.userData._lose = true;
  }
  if (state.bets.tie) {
    if (sides.tie) {
      totalWin += state.bets.tie + state.bets.tie * SIDE_TIERS.tie.pay;
      winners.add("tie");
      zoneByTier.tie.userData._win = true;
    } else zoneByTier.tie.userData._lose = true;
  }
  if (state.bets.jackpot_bet) {
    if (mainTier === "supreme") {
      const jpWin = state.bets.jackpot_bet * 100;
      totalWin += state.bets.jackpot_bet + jpWin;
      winners.add("jackpot_bet");
      zoneByTier.jackpot_bet.userData._win = true;
    } else zoneByTier.jackpot_bet.userData._lose = true;
  }

  state.balance += totalWin;
  state.lastWin = totalWin;
  updateHud();

  // Dealer reaction
  if (mainTier === "supreme" && winners.size > 0) speak("win_supreme");
  else if (totalWin >= 500) speak("win_big");
  else if (totalWin > 0) speak("win_small");
  else speak("lose");

  if (winners.size > 0) {
    const cn = tierDef.cn;
    const en = mainTier === "supreme" ? "JACKPOT WINNER" : tierDef.en;
    showWinOverlay(cn, en, totalWin);
    spawnWinParticles(mainTier === "supreme" ? 140 : 70);
    // Jackpot gets a dramatic cut to the dealer character before returning to payout
    if (mainTier === "supreme") {
      AUDIO.play('winJackpot', { vol: 1.0 });
      setTimeout(() => AUDIO.play('jackpotChime', { vol: 0.9 }), 380);
      setTimeout(() => AUDIO.play('jackpotChime', { vol: 0.85, rate: 1.18 }), 760);
      await sleep(900);
      setView('dealer');
      await sleep(1500);
      setView('payout');
      await sleep(1400);
    } else {
      AUDIO.play(totalWin >= 500 ? 'winBig' : 'winSmall', { vol: 0.95 });
      await sleep(3800);
    }
  } else if (totalWin > 0) {
    // Side-bet pushback / small consolation win (no main tier hit but side bets paid)
    showWinOverlay("中奖", "WINNER", totalWin);
    spawnWinParticles(40);
    AUDIO.play('winSmall', { vol: 0.9 });
    await sleep(3800);
  } else {
    AUDIO.play('lose', { vol: 0.7 });
    await sleep(3800);
  }

  resetRound();
}

function resetRound() {
  state.phase = "betting";
  setView('betting');                   // back to the table overview for the next round
  hideWinOverlay();
  clearAllChips();
  for (const g of Object.values(zoneByTier)) {
    g.userData._win = false;
    g.userData._lose = false;
    g.userData.glowMat.opacity = 0;
    g.userData.topMat.emissiveIntensity = 0;
  }
  dice.forEach(d => { d.userData.winning = false; });
  speak("idle");
  updateHud();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================ RENDER LOOP
const clock = new THREE.Clock();
let elapsed = 0;
function animate() {
  const dt = clock.getDelta();
  elapsed += dt;

  // Lanterns sway
  [state._lantern1, state._lantern2, state._lantern3].forEach((l, i) => {
    if (!l) return;
    l.rotation.z = Math.sin(elapsed * (0.7 + i*0.13) + l.userData.sway) * 0.12;
    // flicker emissive
    l.children[0].material.emissiveIntensity = 0.5 + Math.sin(elapsed * 4 + i) * 0.15;
  });

  // Star twinkle (size pulse)
  if (state._stars) state._stars.material.opacity = 0.6 + Math.sin(elapsed * 1.5) * 0.3;

  // Dealer eyes pulse
  _dealerEyes.forEach((e, i) => {
    const base = state.phase === "rolling" ? 3.5 : 2.0;
    e.material.emissiveIntensity = base + Math.sin(elapsed * 3 + i) * 0.6;
  });
  if (state._eyeLight) {
    state._eyeLight.intensity = state.phase === "rolling" ? 1.2 : 0.6;
  }

  // (No dome — open table. The arena ring sits flat on the felt; no shake needed.)

  // === PHYSICS STEP ===
  // Step the world and sync visual dice transforms to their rigid bodies.
  // Substeps (the 3rd arg) help prevent tunnelling when dice move fast.
  world.step(1/60, Math.min(dt, 1/30), 4);
  for (let i = 0; i < dice.length; i++) {
    dice[i].position.copy(diceBodies[i].position);
    dice[i].quaternion.copy(diceBodies[i].quaternion);
  }

  // Winning-die highlight: bright gold emissive pulse (don't move the mesh, physics owns it)
  for (const d of dice) {
    const win = d.userData.winning;
    const intensity = win ? (0.85 + Math.sin(elapsed * 5) * 0.45) : 0.18;
    const colorHex = win ? 0xff9c3a : 0x1f0d05;
    if (Array.isArray(d.material)) {
      for (const m of d.material) {
        m.emissive.setHex(colorHex);
        m.emissiveIntensity = intensity;
      }
    }
    // Pop-in scale animation when a die is dramatically released
    if (d.userData.popIn) {
      d.userData.popIn.t += dt;
      const tt = Math.min(1, d.userData.popIn.t / d.userData.popIn.dur);
      const eased = 1 - Math.pow(1 - tt, 2);
      const s = 0.6 + 0.4 * eased;
      d.scale.set(s, s, s);
      if (tt >= 1) {
        d.scale.set(1, 1, 1);
        delete d.userData.popIn;
      }
    }
  }

  // Chip drop animations
  for (const tier in zoneByTier) {
    const group = zoneByTier[tier];
    group.userData.chipStack.forEach(c => {
      if (c.userData.dropAnim) {
        const a = c.userData.dropAnim;
        a.t = Math.min(1, a.t + dt * 5);
        const e = 1 - Math.pow(1 - a.t, 3);
        c.position.y = a.y0 + (a.y1 - a.y0) * e;
        if (a.t >= 1) delete c.userData.dropAnim;
      }
    });

    // win zone glow pulse
    if (group.userData._win) {
      const pulse = (Math.sin(elapsed * 4) + 1) * 0.5;
      group.userData.glowMat.opacity = 0.35 + pulse * 0.4;
      group.userData.topMat.emissiveIntensity = 0.4 + pulse * 0.6;
    } else if (group.userData._lose) {
      group.userData.glowMat.opacity = 0;
      // fade the chips
      group.userData.chipStack.forEach(c => {
        c.traverse(o => {
          if (o.material) o.material.opacity = 0.35;
          if (o.material) o.material.transparent = true;
        });
      });
    }
  }

  // Particles
  for (let i = winParticles.children.length - 1; i >= 0; i--) {
    const p = winParticles.children[i];
    p.userData.age += dt;
    p.position.add(p.userData.vel);
    p.userData.vel.y -= 0.003;
    p.rotation.x += 0.1; p.rotation.z += 0.08;
    if (p.userData.age >= p.userData.life || p.position.y < -1) {
      winParticles.remove(p);
    }
  }

  // Multi-view camera lerp: smoothly glide to the active view (betting/rolling/payout/dealer)
  const lerp = 1 - Math.exp(-dt * camView.speed);
  camView.posVec.lerp(camView.targetPos, lerp);
  camView.lookVec.lerp(camView.targetLook, lerp);
  camera.position.copy(camView.posVec);
  // Add subtle breathing on top of the lerped position
  camera.position.y += Math.sin(elapsed * 0.5) * 0.04;
  // Tiny camera shake during the active throw for impact
  if (state.phase === 'rolling') {
    camera.position.x += (Math.random() - 0.5) * 0.018;
    camera.position.y += (Math.random() - 0.5) * 0.018;
  }
  camera.lookAt(camView.lookVec);
  if (Math.abs(camera.fov - camView.targetFov) > 0.05) {
    camera.fov += (camView.targetFov - camera.fov) * lerp;
    camera.updateProjectionMatrix();
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// ============================================================ RESIZE
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================ INIT
function init() {
  // Loading bar fake progress
  let p = 0;
  const interval = setInterval(() => {
    p = Math.min(100, p + 5 + Math.random() * 12);
    elLoadFill.style.width = p + "%";
    if (p >= 100) {
      clearInterval(interval);
      setTimeout(() => {
        elLoading.classList.add("hidden");
        speak("idle");
      }, 300);
    }
  }, 60);

  updateHud();
  animate();
}
init();
