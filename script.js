"use strict";

const $ = id => document.getElementById(id);
const canvas = $("arena");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clone = value => JSON.parse(JSON.stringify(value));

const weapons = ["club", "dagger", "sword", "hammer", "spear"];
const abilities = [
  "none", "burn", "poison", "heal",
  "shield", "lifesteal", "slow"
];

const limits = {
  hp: [10, 1000],
  speed: [30, 400],
  damage: [0, 100],
  attackSpeed: [0.2, 20],
  range: [20, 160],
  stun: [0, 3],
  knockback: [0, 600],
  chance: [0, 100]
};

const builtins = [
  {
    id: "club", builtin: true,
    name: "Club", color: "#c65b38", weapon: "club",
    hp: 100, speed: 140, damage: 3, attackSpeed: 4,
    range: 58, stun: 0.24, knockback: 125,
    ability: "burn", chance: 20
  },
  {
    id: "dagger", builtin: true,
    name: "Dagger", color: "#29dd51", weapon: "dagger",
    hp: 100, speed: 160, damage: 2, attackSpeed: 7,
    range: 49, stun: 0.10, knockback: 85,
    ability: "lifesteal", chance: 14
  },
  {
    id: "spear", builtin: true,
    name: "Spear", color: "#38bdf8", weapon: "spear",
    hp: 100, speed: 130, damage: 3.3, attackSpeed: 3.8,
    range: 76, stun: 0.12, knockback: 115,
    ability: "poison", chance: 18
  },
  {
    id: "sword", builtin: true,
    name: "Sword", color: "#a78bfa", weapon: "sword",
    hp: 110, speed: 145, damage: 3.5, attackSpeed: 4.5,
    range: 60, stun: 0.12, knockback: 110,
    ability: "shield", chance: 15
  },
  {
    id: "hammer", builtin: true,
    name: "Hammer", color: "#f59e0b", weapon: "hammer",
    hp: 120, speed: 110, damage: 5, attackSpeed: 2.5,
    range: 53, stun: 0.35, knockback: 200,
    ability: "slow", chance: 20
  }
];

let roster = clone(builtins);
let selected = { a: "club", b: "dagger" };
let fighters = [];
let particles = [];
let running = false;
let finished = false;
let round = 1;
let last = null;
let accumulator = 0;
let elapsed = 0;
const STEP = 1 / 240;
const ROUND_SECONDS = 120;

function updateClock() {
  $('battleClock').textContent = Math.ceil(ROUND_SECONDS - elapsed) + ' s';
}

// CHARACTER DATA
function validCharacter(c) {
  return c &&
    typeof c.name === "string" &&
    c.name.trim().length > 0 &&
    c.name.length <= 24 &&
    /^#[0-9a-f]{6}$/i.test(c.color) &&
    weapons.includes(c.weapon) &&
    abilities.includes(c.ability) &&
    Object.entries(limits).every(([key, [min, max]]) => {
      const value = c[key];
      return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= min && value <= max;
    });
}

function getCharacter(id) {
  return roster.find(c => c.id === id);
}

function createId() {
  return "custom-" + Date.now().toString(36) +
    "-" + Math.random().toString(36).slice(2, 9);
}

function saveData() {
  try {
    localStorage.setItem("orbArenaV3", JSON.stringify({
      custom: roster.filter(c => !c.builtin),
      selected
    }));
  } catch (e) {
    console.warn("Cannot save roster", e);
  }
}

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem("orbArenaV3"));
    if (!saved) return;

    const ids = new Set(builtins.map(c => c.id));
    if (Array.isArray(saved.custom)) {
      for (const c of saved.custom.slice(0, 200)) {
        if (!validCharacter(c)) continue;
        if (typeof c.id !== "string" || !c.id.startsWith("custom-"))
          continue;
        if (ids.has(c.id)) continue;

        ids.add(c.id);
        roster.push({ ...c, builtin: false });
      }
    }

    if (getCharacter(saved.selected?.a))
      selected.a = saved.selected.a;
    if (getCharacter(saved.selected?.b))
      selected.b = saved.selected.b;
  } catch (e) {
    console.warn("Cannot load saved roster", e);
  }
}

loadData();

// ROSTER UI
function populateSelect(el, current) {
  el.replaceChildren();

  roster.forEach(c => {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.name + (c.builtin ? "" : " ★");
    el.append(option);
  });

  el.value = getCharacter(current) ? current : roster[0].id;
}

function addStat(container, title, value) {
  const box = document.createElement("div");
  box.className = "stat-item";

  const label = document.createElement("span");
  label.className = "stat-label";
  label.textContent = title;

  const val = document.createElement("span");
  val.className = "stat-value";
  val.textContent = String(value);

  box.append(label, val);
  container.append(box);
}

function renderInfo(id, targetId) {
  const c = getCharacter(id);
  const target = $(targetId);
  target.replaceChildren();
  if (!c) return;

  const heading = document.createElement("div");
  heading.className = "character-name";

  const dot = document.createElement("span");
  dot.className = "color-dot";
  dot.style.background = c.color;

  const name = document.createElement("span");
  name.textContent = c.name;

  heading.append(dot, name);
  target.append(heading);

  const stats = document.createElement("div");
  stats.className = "stat-grid";

  [
    ["Equipment", c.weapon],
    ["Ability", c.ability],
    ["HP", c.hp],
    ["Damage", c.damage],
    ["Movement", c.speed],
    ["Attack Speed", c.attackSpeed],
    ["Range", c.range],
    ["Stun", c.stun + " s"],
    ["Knockback", c.knockback],
    ["Ability Chance", c.chance + "%"]
  ].forEach(([title, value]) => addStat(stats, title, value));

  target.append(stats);
}

function renderRoster() {
  if (!getCharacter(selected.a)) selected.a = roster[0].id;
  if (!getCharacter(selected.b)) selected.b = roster[1].id;

  populateSelect($("fighterA"), selected.a);
  populateSelect($("fighterB"), selected.b);

  renderInfo(selected.a, "fighterAInfo");
  renderInfo(selected.b, "fighterBInfo");
}

$("fighterA").onchange = e => {
  selected.a = e.target.value;
  renderInfo(selected.a, "fighterAInfo");
  saveData();
  reset();
};

$("fighterB").onchange = e => {
  selected.b = e.target.value;
  renderInfo(selected.b, "fighterBInfo");
  saveData();
  reset();
};

// CHARACTER CREATOR
const creator = $("creator");
const form = $("characterForm");
const manager = $("manageCharacter");
let editingId = null;

function getField(key) {
  return form.elements.namedItem(key);
}

function fillForm(c) {
  ["name", "color", "weapon", "ability", ...Object.keys(limits)]
    .forEach(key => {
      getField(key).value = c[key];
    });
}

function creatorMode(mode, character = null) {
  const viewingBuiltin = mode === "builtin";
  $("creatorFields").disabled = viewingBuiltin;
  $("saveCharacter").disabled = viewingBuiltin;
  $("deleteCharacter").disabled = mode !== "edit";

  editingId = mode === "edit" ? character.id : null;

  if (character) fillForm(character);

  $("creatorHint").textContent =
    mode === "builtin"
      ? "Preset bawaan terkunci. Klik Duplicate untuk membuat versi custom."
      : mode === "edit"
        ? "Mengedit karakter custom. Perubahan akan disimpan ke roster."
        : "Karakter baru. Simpan untuk menambahkannya ke roster.";
}

function renderManager(current = "") {
  manager.replaceChildren();

  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "— New / Unsaved Character —";
  manager.append(blank);

  roster.forEach(c => {
    const option = document.createElement("option");
    option.value = c.id;
    option.textContent = c.name + (c.builtin ? " [Preset]" : " [Custom]");
    manager.append(option);
  });

  manager.value = current;
}

function openManagedCharacter(id) {
  const c = getCharacter(id);

  if (!c) {
    newCharacter();
    return;
  }

  renderManager(id);
  creatorMode(c.builtin ? "builtin" : "edit", c);
}

function newCharacter() {
  renderManager("");
  creatorMode("new", {
    name: "New Fighter",
    color: "#f472b6",
    weapon: "sword",
    ability: "none",
    hp: 100,
    speed: 145,
    damage: 3,
    attackSpeed: 4,
    range: 55,
    stun: 0.1,
    knockback: 100,
    chance: 20
  });
}

$("openCreator").onclick = () => {
  openManagedCharacter(selected.a);
  creator.showModal();
};

$("creatorClose").onclick = () => creator.close();
$("creatorCancel").onclick = () => creator.close();

manager.onchange = () => openManagedCharacter(manager.value);
$("newCharacter").onclick = newCharacter;

$("cloneCharacter").onclick = () => {
  const source = getCharacter(manager.value) ||
    getCharacter(selected.a);

  if (!source) return;

  const draft = clone(source);
  draft.name += " Custom";
  if (draft.name.length > 24) draft.name = draft.name.slice(0, 24);

  renderManager("");
  creatorMode("new", draft);
};

form.onsubmit = e => {
  e.preventDefault();

  const data = {
    id: editingId || createId(),
    builtin: false,
    name: String(getField("name").value).trim(),
    color: getField("color").value,
    weapon: getField("weapon").value,
    ability: getField("ability").value
  };

  Object.keys(limits).forEach(key => {
    data[key] = Number(getField(key).value);
  });

  if (!validCharacter(data)) {
    alert("Periksa kembali nama dan statistik karakter.");
    return;
  }

  // Nama preset disediakan untuk karakter bawaan.
  if (builtins.some(c => c.name.toLowerCase() === data.name.toLowerCase())) {
    alert("Nama ini digunakan preset bawaan. Pilih nama unik.");
    return;
  }

  if (roster.some(c => c.id !== data.id &&
    c.name.toLowerCase() === data.name.toLowerCase())) {
    alert("Nama karakter sudah digunakan.");
    return;
  }

  if (editingId) {
    const index = roster.findIndex(c =>
      c.id === editingId && !c.builtin);

    if (index < 0) return;
    roster[index] = data;
  } else {
    roster.push(data);
    selected.a = data.id;
  }

  renderRoster();
  saveData();
  reset();
  openManagedCharacter(data.id);
  $("creatorHint").textContent = "✓ Character saved successfully!";
};

$("deleteCharacter").onclick = () => {
  const c = getCharacter(manager.value);
  if (!c || c.builtin) return;

  if (!confirm(`Delete ${c.name}?`)) return;

  roster = roster.filter(item => item.id !== c.id);

  if (selected.a === c.id) selected.a = "club";
  if (selected.b === c.id) selected.b = "dagger";

  renderRoster();
  saveData();
  reset();
  newCharacter();
};

// PHYSICS / BATTLE
function makeFighter(c, i) {
  const direction = rand(0, TAU);
  const speed = c.speed;

  return {
    ...clone(c),
    x: i ? rand(W * .65, W * .8) : rand(W * .2, W * .35),
    y: rand(H * .25, H * .75),
    vx: Math.cos(direction) * speed,
    vy: Math.sin(direction) * speed,
    r: 21,
    health: c.hp,
    angle: rand(0, TAU),
    spin: Math.random() < .5 ? -1 : 1,
    hitTimer: 0,
    stunned: 0,
    stunGuard: 0,
    previous: null,
    shield: 0,
    dots: [],
    slow: 0
  };
}

function reset() {
  fighters = [
    makeFighter(getCharacter(selected.a), 0),
    makeFighter(getCharacter(selected.b), 1)
  ];

  particles = [];
  elapsed = 0;
  accumulator = 0;
  updateClock();
  running = false;
  finished = false;
  $("status").textContent = "Ready to fight";
  $("round").textContent = "Battle #" + round;
  draw();
}

// Keep bodies inside the ring even after separation or knockback.
function constrain(a) {
  if (a.x < a.r || a.x > W - a.r) {
    a.x = Math.max(a.r, Math.min(W - a.r, a.x));
    a.vx = a.x === a.r ? Math.abs(a.vx) : -Math.abs(a.vx);
  }
  if (a.y < a.r || a.y > H - a.r) {
    a.y = Math.max(a.r, Math.min(H - a.r, a.y));
    a.vy = a.y === a.r ? Math.abs(a.vy) : -Math.abs(a.vy);
  }
}

function bounceMovement(a, dt) {
  const speed = a.speed * (a.slow > 0 ? .45 : 1);
  const noise = rand(-1.25, 1.25) * dt;
  const cos = Math.cos(noise), sin = Math.sin(noise);
  let vx = a.vx * cos - a.vy * sin;
  let vy = a.vx * sin + a.vy * cos;
  let length = Math.hypot(vx, vy);
  if (length < .001) {
    const direction = rand(0, TAU);
    vx = Math.cos(direction); vy = Math.sin(direction); length = 1;
  }
  // Stun stops voluntary movement but preserves a decaying knockback slide.
  const target = a.stunned > 0 ? 0 : speed;
  const next = Math.min(850, length + (target - length) * (1 - Math.exp(-dt * 3)));
  a.vx = vx / length * next;
  a.vy = vy / length * next;
  a.x += a.vx * dt;
  a.y += a.vy * dt;
  constrain(a);
}

function collide(a, b) {
  let dx = b.x - a.x, dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= a.r + b.r) return;
  if (distance < .001) {
    const direction = rand(0, TAU);
    dx = Math.cos(direction); dy = Math.sin(direction);
  } else { dx /= distance; dy /= distance; }
  const overlap = (a.r + b.r - distance) / 2 + .001;
  a.x -= dx * overlap; a.y -= dy * overlap;
  b.x += dx * overlap; b.y += dy * overlap;
  const relative = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
  if (relative < 0) {
    const impulse = -relative * .95;
    a.vx -= dx * impulse; a.vy -= dy * impulse;
    b.vx += dx * impulse; b.vy += dy * impulse;
  }
  constrain(a); constrain(b);
}

function dealDamage(target, amount) {
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  const dealt = Math.min(target.health, amount - absorbed);
  target.health = Math.max(0, target.health - dealt);
  return dealt;
}

function abilityEffect(a, b, dealt) {
  if (Math.random() * 100 >= a.chance) return;
  switch (a.ability) {
    case 'burn':
    case 'poison': {
      const type = a.ability;
      let dot = b.dots.find(d => d.type === type);
      if (!dot) { dot = { type, stacks: 0 }; b.dots.push(dot); }
      dot.stacks = Math.min(3, dot.stacks + 1);
      dot.time = type === 'burn' ? 2 : 3;
      dot.dps = Math.max(.4, a.damage * (type === 'burn' ? .7 : .4));
      break;
    }
    case 'heal': a.health = Math.min(a.hp, a.health + a.damage * 1.6 + 2); break;
    case 'shield': a.shield = Math.min(40, a.shield + 5 + a.damage); break;
    case 'lifesteal': a.health = Math.min(a.hp, a.health + dealt * .8); break;
    case 'slow': b.slow = Math.max(b.slow, 1.6); break;
  }
}

function weaponLength(a) {
  return { club: 23, hammer: 20, spear: 36, sword: 29, dagger: 19 }[a.weapon];
}

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

// Sweep the visible weapon head along its rotation and translation.
function weaponTouches(a, b) {
  const from = a.previous || a, targetFrom = b.previous || b;
  const turn = a.angle - from.angle;
  const samples = Math.max(1, Math.ceil(Math.abs(turn) * (a.range + weaponLength(a)) / 4));
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const angle = from.angle + turn * t, cos = Math.cos(angle), sin = Math.sin(angle);
    const x = from.x + (a.x - from.x) * t, y = from.y + (a.y - from.y) * t;
    const bx = targetFrom.x + (b.x - targetFrom.x) * t;
    const by = targetFrom.y + (b.y - targetFrom.y) * t;
    const width = a.weapon === 'hammer' ? 14 : 8;
    if (segmentDistance(bx, by, x + cos * a.range, y + sin * a.range,
      x + cos * (a.range + weaponLength(a)), y + sin * (a.range + weaponLength(a))) <= b.r + width) return true;
  }
  return false;
}

function prepareHit(a, b) {
  if (a.health <= 0 || b.health <= 0 || a.hitTimer > 0 || a.stunned > 0 || !weaponTouches(a, b)) return null;
  return { a, b, damage: a.damage * rand(.9, 1.1) };
}

function resolveHits(hits) {
  // Both fighters commit before damage, stun or death can cancel the other hit.
  for (const hit of hits) {
    hit.a.hitTimer = 1 / hit.a.attackSpeed;
    hit.dealt = dealDamage(hit.b, hit.damage);
    const dx = hit.b.x - hit.a.x, dy = hit.b.y - hit.a.y;
    const distance = Math.hypot(dx, dy) || 1;
    hit.b.vx += dx / distance * hit.a.knockback;
    hit.b.vy += dy / distance * hit.a.knockback;
    if (hit.b.stunGuard <= 0 && hit.a.stun > 0) {
      hit.b.stunned = Math.min(.6, hit.a.stun);
      hit.b.stunGuard = hit.b.stunned + .4;
    }
    particles.push({ x: hit.b.x, y: hit.b.y, text: hit.dealt > 0 ? '-' + hit.dealt.toFixed(1) : 'BLOCK', life: .65 });
  }
  for (const hit of hits) {
    if (hit.a.health > 0) abilityEffect(hit.a, hit.b, hit.dealt);
  }
}

function endBattle() {
  if (finished) return;
  const [a, b] = fighters;
  const timeout = elapsed >= ROUND_SECONDS;
  if (a.health > 0 && b.health > 0 && !timeout) return;
  finished = true;
  running = false;
  const difference = a.health / a.hp - b.health / b.hp;
  const draw = (a.health <= 0 && b.health <= 0) || (timeout && Math.abs(difference) < .000001);
  const winner = timeout ? (difference > 0 ? a : b) : (a.health > 0 ? a : b);
  $('status').textContent = draw ? 'DRAW!' : winner.name + ' WINS! 🏆' + (timeout ? ' · Time limit (HP %)' : '');
}

function update(dt) {
  if (finished) return;
  dt = Math.min(dt, ROUND_SECONDS - elapsed);
  elapsed = Math.min(ROUND_SECONDS, elapsed + dt);
  fighters.forEach(a => {
    a.previous = { x: a.x, y: a.y, angle: a.angle };
    a.hitTimer = Math.max(0, a.hitTimer - dt);
    a.stunned = Math.max(0, a.stunned - dt);
    a.stunGuard = Math.max(0, a.stunGuard - dt);
    a.slow = Math.max(0, a.slow - dt);
    a.dots = a.dots.filter(dot => {
      dealDamage(a, dot.dps * dot.stacks * Math.min(dt, dot.time));
      dot.time -= dt;
      return dot.time > 0;
    });
  });
  // Resolve simultaneous damage-over-time deaths before new attacks.
  if (fighters.some(a => a.health <= 0)) { endBattle(); return; }
  fighters.forEach(a => {
    bounceMovement(a, dt);
    if (a.stunned <= 0) a.angle += a.spin * TAU * a.attackSpeed * dt * .34;
  });
  collide(...fighters);
  resolveHits([prepareHit(fighters[0], fighters[1]), prepareHit(fighters[1], fighters[0])].filter(Boolean));
  endBattle();
  particles.forEach(p => { p.y -= 25 * dt; p.life -= dt; });
  particles = particles.filter(p => p.life > 0);
  updateClock();
}

// DRAWING
function drawWeapon(a) {
  const x = a.x + Math.cos(a.angle) * a.range;
  const y = a.y + Math.sin(a.angle) * a.range;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a.angle);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 5;

  ctx.beginPath();
  ctx.moveTo(-a.range * .45, 0);
  ctx.lineTo(5, 0);
  ctx.stroke();

  if (a.weapon === "club" || a.weapon === "hammer") {
    ctx.fillStyle = a.weapon === "club" ? "#65394a" : "#64748b";
    ctx.fillRect(
      0,
      a.weapon === "club" ? -8 : -14,
      a.weapon === "club" ? 23 : 20,
      a.weapon === "club" ? 16 : 28
    );
  } else {
    const length =
      a.weapon === "spear" ? 36 :
      a.weapon === "sword" ? 29 : 19;

    ctx.fillStyle = "#dbeafe";
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(length, 0);
    ctx.lineTo(0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, W - 5, H - 5);

  fighters.forEach((a, i) => {
    drawWeapon(a);

    ctx.beginPath();
    ctx.arc(a.x, a.y, a.r, 0, TAU);
    ctx.fillStyle = a.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#334155";
    ctx.stroke();

    if (a.shield > 0) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r + 5, 0, TAU);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.textAlign = "center";
    ctx.fillStyle = "#111827";
    ctx.font = "bold 14px system-ui";
    ctx.fillText(Math.ceil(a.health), a.x, a.y + 5);

    const sx = i ? W - 205 : 15;
    ctx.textAlign = "left";
    ctx.font = "bold 16px system-ui";
    ctx.fillText(a.name.slice(0, 17), sx, 27);

    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(sx, 34, 190, 11);

    ctx.fillStyle = a.color;
    ctx.fillRect(sx, 34,
      190 * Math.max(0, a.health / a.hp), 11);

    ctx.fillStyle = "#334155";
    ctx.font = "11px system-ui";
    ctx.fillText(
      `${Math.ceil(a.health)}/${a.hp} HP | ${a.ability}`,
      sx, 60
    );
    const effects = [a.shield > 0 ? 'SHIELD ' + Math.ceil(a.shield) : '',
      a.stunned > 0 ? 'STUN' : '', a.slow > 0 ? 'SLOW' : '',
      ...a.dots.map(dot => dot.type.toUpperCase() + ' ×' + dot.stacks)].filter(Boolean);
    ctx.fillText(effects.join(' · '), sx, 76);
  });

  particles.forEach(p => {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 19px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(p.text, p.x, p.y);
  });

  ctx.globalAlpha = 1;
}

function frame(t) {
  const dt = last === null ? 0 : Math.min(Math.max(0, (t - last) / 1000), .1);
  last = t;
  if (running && !finished) {
    accumulator += dt;
    while (accumulator >= STEP && !finished) {
      update(STEP);
      accumulator -= STEP;
    }
  } else accumulator = 0;
  draw();
  requestAnimationFrame(frame);
}

// Returning from a hidden tab never fast-forwards the battle.
document.addEventListener('visibilitychange', () => {
  last = null;
  accumulator = 0;
  if (document.hidden && running) $('pause').onclick();
});

// BATTLE BUTTONS
$("start").onclick = () => {
  if (finished) {
    round++;
    reset();
  }
  last = null;
  accumulator = 0;
  running = true;
  $("status").textContent = "⚔ Battle in progress";
};

$("pause").onclick = () => {
  if (finished) return;
  running = false;
  $("status").textContent = "Paused";
};

$("reset").onclick = () => {
  round++;
  reset();
};

$("random").onclick = () => {
  const a = Math.floor(Math.random() * roster.length);
  let b = Math.floor(Math.random() * roster.length);

  if (roster.length > 1) {
    while (b === a) b = Math.floor(Math.random() * roster.length);
  }

  selected.a = roster[a].id;
  selected.b = roster[b].id;
  renderRoster();
  saveData();
  round++;
  reset();
};

// ROSTER EXPORT / IMPORT
$("export").onclick = () => {
  const data = {
    version: 3,
    custom: roster.filter(c => !c.builtin),
    selected
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "orb-arena-roster.json";
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

$("import").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.custom)) throw Error("Invalid roster");

    const existing = new Set(roster.map(c => c.id));
    let imported = 0;

    for (const c of data.custom.slice(0, 200)) {
      if (!validCharacter(c)) continue;

      const character = clone(c);
      character.id = createId();
      while (existing.has(character.id))
        character.id = createId();

      character.builtin = false;
      existing.add(character.id);
      roster.push(character);
      imported++;
    }

    renderRoster();
    saveData();
    reset();

    alert(`${imported} custom character(s) imported.`);
  } catch (err) {
    alert("Import failed: " + err.message);
  }

  e.target.value = "";
};

renderRoster();
reset();
requestAnimationFrame(frame);
