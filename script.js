"use strict";

const canvas = document.getElementById("arena");
const ctx = canvas.getContext("2d");
const W = canvas.width;
const H = canvas.height;
const TAU = Math.PI * 2;

const weapons = ["club", "dagger", "sword", "hammer", "spear"];
const abilities = [
  "none", "burn", "poison", "heal",
  "shield", "lifesteal", "slow"
];

const defaults = [
  {
    name: "Club", color: "#c65b38", weapon: "club",
    hp: 100, speed: 140, damage: 3, attackSpeed: 4,
    range: 58, stun: 0.24, knockback: 125,
    ability: "burn", chance: 20
  },
  {
    name: "Dagger", color: "#29dd51", weapon: "dagger",
    hp: 100, speed: 160, damage: 2, attackSpeed: 7,
    range: 49, stun: 0.10, knockback: 85,
    ability: "heal", chance: 14
  }
];

const fields = [
  ["name", "Name", "text"],
  ["color", "Color", "color"],
  ["weapon", "Weapon", "select", weapons],
  ["hp", "Max HP", "number", 10, 1000],
  ["speed", "Movement speed", "number", 0, 400],
  ["damage", "Damage", "number", 0, 100],
  ["attackSpeed", "Attack speed", "number", 0.2, 20],
  ["range", "Weapon reach", "number", 20, 160],
  ["stun", "Stun duration", "number", 0, 3],
  ["knockback", "Knockback", "number", 0, 600],
  ["ability", "Special ability", "select", abilities],
  ["chance", "Ability chance (%)", "number", 0, 100]
];

let config = structuredClone(defaults);
let fighters = [];
let particles = [];
let running = false;
let finished = false;
let round = 1;
let last = 0;

const $ = id => document.getElementById(id);
const rand = (min, max) => min + Math.random() * (max - min);

function valid(data) {
  return Array.isArray(data) &&
    data.length === 2 &&
    data.every(c =>
      c &&
      typeof c.name === "string" &&
      /^#[0-9a-f]{6}$/i.test(c.color) &&
      weapons.includes(c.weapon) &&
      abilities.includes(c.ability) &&
      fields.filter(f => f[2] === "number")
        .every(f =>
          Number.isFinite(Number(c[f[0]])) &&
          Number(c[f[0]]) >= f[3] &&
          Number(c[f[0]]) <= f[4]
        )
    );
}

try {
  const saved = JSON.parse(localStorage.getItem("orbArenaConfig"));
  if (valid(saved)) config = saved;
} catch (e) {
  console.warn("Saved settings unavailable", e);
}

// CHARACTER EDITOR
function renderEditor() {
  const container = $("editors");
  container.replaceChildren();

  config.forEach((c, i) => {
    const col = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = i ? "🟢 Fighter B" : "🟠 Fighter A";
    col.append(title);

    fields.forEach(([key, label, type, a, b]) => {
      const wrapper = document.createElement("label");
      wrapper.append(document.createTextNode(label));

      let el;
      if (type === "select") {
        el = document.createElement("select");
        a.forEach(value => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = value;
          el.append(option);
        });
      } else {
        el = document.createElement("input");
        el.type = type;
        if (type === "number") {
          el.min = a;
          el.max = b;
          el.step = ["stun", "attackSpeed"].includes(key)
            ? "0.01" : "1";
        }
      }

      el.value = c[key];
      el.addEventListener("change", () => {
        let value = type === "number" ? Number(el.value) : el.value;
        if (type === "number") {
          value = Math.min(b, Math.max(a,
            Number.isFinite(value) ? value : a));
        }
        config[i][key] = value;
        el.value = value;
      });

      wrapper.append(el);
      col.append(wrapper);
    });

    container.append(col);
  });
}

// RANDOM BOUNCE ENGINE
function createFighter(c, i) {
  const direction = rand(0, TAU);
  const speed = Math.max(65, c.speed);

  return {
    ...structuredClone(c),
    // Spawn pada sisi kiri atau kanan arena
    x: i
      ? rand(W * 0.65, W * 0.80)
      : rand(W * 0.20, W * 0.35),
    y: rand(H * 0.25, H * 0.75),
    vx: Math.cos(direction) * speed,
    vy: Math.sin(direction) * speed,
    r: 21,
    health: c.hp,
    angle: rand(0, TAU),
    spin: Math.random() < 0.5 ? -1 : 1,
    hitTimer: 0,
    stunned: 0,
    shield: 0,
    dots: [],
    slow: 0
  };
}

function reset() {
  fighters = config.map(createFighter);
  particles = [];
  running = false;
  finished = false;
  $("status").textContent = "Ready to fight";
  $("round").textContent = "Battle #" + round;
  draw();
}

function bounceMovement(a, dt) {
  const speed = Math.max(65, a.speed * (a.slow > 0 ? 0.35 : 1));

  // Random steering, tanpa mencari posisi lawan.
  const noise = rand(-1.25, 1.25) * dt;
  const cos = Math.cos(noise);
  const sin = Math.sin(noise);

  const vx = a.vx * cos - a.vy * sin;
  const vy = a.vx * sin + a.vy * cos;
  const length = Math.hypot(vx, vy);

  if (length < 0.001) {
    const direction = rand(0, TAU);
    a.vx = Math.cos(direction) * speed;
    a.vy = Math.sin(direction) * speed;
  } else {
    a.vx = vx / length * speed;
    a.vy = vy / length * speed;
  }

  a.x += a.vx * dt;
  a.y += a.vy * dt;

  // Pantulan dinding dengan variasi arah.
  if (a.x <= a.r || a.x >= W - a.r) {
    a.x = Math.max(a.r, Math.min(W - a.r, a.x));
    a.vx *= -1;
    a.vy += rand(-42.5, 42.5);
  }

  if (a.y <= a.r || a.y >= H - a.r) {
    a.y = Math.max(a.r, Math.min(H - a.r, a.y));
    a.vy *= -1;
    a.vx += rand(-42.5, 42.5);
  }
}

function collide(a, b) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let distance = Math.hypot(dx, dy);

  if (distance < 0.001) {
    const angle = rand(0, TAU);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    distance = 1;
  }

  const minimum = a.r + b.r;
  if (distance >= minimum) return;

  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = (minimum - distance) / 2;

  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;

  const relative = (b.vx - a.vx) * nx +
                   (b.vy - a.vy) * ny;

  if (relative < 0) {
    const impulse = -relative * rand(0.8, 1.3);
    a.vx -= nx * impulse;
    a.vy -= ny * impulse;
    b.vx += nx * impulse;
    b.vy += ny * impulse;
  }
}

// ABILITY SYSTEM
function applyAbility(a, b) {
  if (Math.random() * 100 >= a.chance) return;

  switch (a.ability) {
    case "burn":
      b.dots.push({ time: 2, dps: Math.max(0.5, a.damage * 0.7) });
      break;
    case "poison":
      b.dots.push({ time: 3, dps: Math.max(0.4, a.damage * 0.4) });
      break;
    case "heal":
      a.health = Math.min(a.hp, a.health + a.damage * 1.6 + 2);
      break;
    case "shield":
      a.shield = Math.min(40, a.shield + 5 + a.damage);
      break;
    case "lifesteal":
      a.health = Math.min(a.hp, a.health + a.damage * 0.8);
      break;
    case "slow":
      b.slow = Math.max(b.slow, 1.6);
      break;
  }
}

function hit(a, b) {
  if (a.hitTimer > 0 || a.stunned > 0 || b.health <= 0) return;

  const wx = a.x + Math.cos(a.angle) * a.range;
  const wy = a.y + Math.sin(a.angle) * a.range;

  if (Math.hypot(b.x - wx, b.y - wy) > b.r + 18) return;

  const damage = Math.max(0, a.damage) * rand(0.8, 1.2);
  const absorbed = Math.min(b.shield, damage);

  b.shield -= absorbed;
  b.health = Math.max(0, b.health - damage + absorbed);

  const distance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  b.vx += (b.x - a.x) / distance * a.knockback;
  b.vy += (b.y - a.y) / distance * a.knockback;

  b.stunned = Math.max(b.stunned, a.stun);
  a.hitTimer = 1 / Math.max(0.2, a.attackSpeed);

  applyAbility(a, b);

  particles.push({
    x: b.x, y: b.y,
    text: "-" + Math.round(damage - absorbed),
    life: 0.65
  });
}

function endBattle() {
  if (finished) return;
  const [a, b] = fighters;

  if (a.health > 0 && b.health > 0) return;

  finished = true;
  running = false;

  const winner = a.health <= 0 && b.health <= 0
    ? "DRAW!"
    : (a.health > 0 ? a.name : b.name) + " WINS! 🏆";

  $("status").textContent = winner;
}

function update(dt) {
  fighters.forEach(a => {
    a.hitTimer = Math.max(0, a.hitTimer - dt);
    a.stunned = Math.max(0, a.stunned - dt);
    a.slow = Math.max(0, a.slow - dt);

    a.dots = a.dots.filter(dot => {
      a.health = Math.max(0, a.health - dot.dps * dt);
      dot.time -= dt;
      return dot.time > 0;
    });
  });

  endBattle();
  if (finished) return;

  fighters.forEach(a => {
    if (a.stunned <= 0) bounceMovement(a, dt);
    a.angle += a.spin * TAU * a.attackSpeed * dt * 0.34;
  });

  collide(fighters[0], fighters[1]);
  hit(fighters[0], fighters[1]);
  if (fighters[1].health > 0) hit(fighters[1], fighters[0]);

  endBattle();

  particles.forEach(p => {
    p.y -= 25 * dt;
    p.life -= dt;
  });
  particles = particles.filter(p => p.life > 0);
}

// RENDERING
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
  ctx.moveTo(-a.range * 0.45, 0);
  ctx.lineTo(5, 0);
  ctx.stroke();

  if (a.weapon === "club" || a.weapon === "hammer") {
    ctx.fillStyle = a.weapon === "club" ? "#65394a" : "#64748b";
    ctx.fillRect(0, a.weapon === "club" ? -8 : -14,
      a.weapon === "club" ? 23 : 20,
      a.weapon === "club" ? 16 : 28);
  } else {
    const length = a.weapon === "spear" ? 36 :
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

    const sx = i ? W - 225 : 15;
    ctx.textAlign = "left";
    ctx.font = "bold 18px system-ui";
    ctx.fillText(a.name.slice(0, 17), sx, 28);

    ctx.fillStyle = "#cbd5e1";
    ctx.fillRect(sx, 36, 210, 13);
    ctx.fillStyle = a.color;
    ctx.fillRect(sx, 36, 210 * Math.max(0, a.health / a.hp), 13);

    ctx.fillStyle = "#334155";
    ctx.font = "12px system-ui";
    ctx.fillText(
      `${Math.ceil(a.health)}/${a.hp} HP · ${a.ability}`,
      sx, 65
    );
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
  if (!last) last = t;
  const dt = Math.min((t - last) / 1000, 0.035);
  last = t;

  if (running && !finished) {
    for (let i = 0; i < 2 && !finished; i++) {
      update(dt / 2);
    }
  }

  draw();
  requestAnimationFrame(frame);
}

// CONTROLS
$("start").onclick = () => {
  if (finished) {
    round++;
    reset();
  }
  running = true;
  $("status").textContent = "⚔ Battle in progress";
};

$("pause").onclick = () => {
  running = false;
  $("status").textContent = "Paused";
};

$("reset").onclick = () => {
  round++;
  reset();
};

$("random").onclick = () => {
  config.forEach(c => {
    c.damage = Math.round(rand(1, 10) * 10) / 10;
    c.attackSpeed = Math.round(rand(2, 11) * 10) / 10;
    c.stun = Math.round(rand(0, 0.7) * 100) / 100;
    c.speed = Math.round(rand(80, 250));
    c.weapon = weapons[Math.floor(rand(0, weapons.length))];
    c.ability = abilities[Math.floor(rand(0, abilities.length))];
  });
  renderEditor();
  reset();
};

$("save").onclick = () => {
  localStorage.setItem("orbArenaConfig", JSON.stringify(config));
  $("status").textContent = "Settings saved locally";
};

$("export").onclick = () => {
  const blob = new Blob([JSON.stringify(config, null, 2)],
    { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "orb-arena-characters.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

$("import").onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (!valid(data)) throw Error("Invalid character data");
    config = data;
    renderEditor();
    reset();
  } catch (err) {
    alert("Import failed: " + err.message);
  }

  e.target.value = "";
};

renderEditor();
reset();
requestAnimationFrame(frame);
