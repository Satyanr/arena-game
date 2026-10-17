'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
function game(seed = 123) {
  const element = () => ({ value: '', children: [], style: {}, append(...items) { this.children.push(...items); }, replaceChildren() { this.children = []; }, showModal() {}, close() {}, click() {} });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], element()]));
  const fields = new Map([...html.matchAll(/name="([^"]+)"/g)].map(m => [m[1], element()]));
  nodes.get('characterForm').elements = { namedItem: key => fields.get(key) };
  Object.assign(nodes.get('arena'), { width: 520, height: 420, getContext: () => new Proxy({}, { get: (o, k) => o[k] ?? (() => {}) }) });
  const math = Object.create(Math);
  math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const listeners = {};
  const document = { hidden: false, getElementById: key => nodes.get(key), createElement: element, addEventListener: (event, fn) => { listeners[event] = fn; } };
  const context = vm.createContext({ console, Math: math, document, requestAnimationFrame() {}, localStorage: { getItem: () => null, setItem() {} }, alert() {}, confirm: () => true });
  vm.runInContext(fs.readFileSync(path.join(root, 'script.js'), 'utf8'), context);
  return { run: code => vm.runInContext(code, context), nodes, fields, document, listeners };
}
test('simultaneous lethal strikes produce a draw without first-slot advantage', () => {
  const g = game();
  g.run('fighters.forEach(a=>{a.health=1;a.ability="none"}); resolveHits([{a:fighters[0],b:fighters[1],damage:10},{a:fighters[1],b:fighters[0],damage:10}]); endBattle()');
  assert.equal(g.nodes.get('status').textContent, 'DRAW!');
});
test('shield blocks lifesteal; status stacks are capped; DOT uses remaining duration', () => {
  const g = game();
  g.run('fighters[0].ability="lifesteal"; fighters[0].chance=100; fighters[0].health=50; fighters[1].shield=40; resolveHits([{a:fighters[0],b:fighters[1],damage:10}])');
  assert.equal(g.run('fighters[0].health'), 50);
  g.run('fighters[0].ability="burn"; for(let i=0;i<20;i++) abilityEffect(...fighters, 1)');
  assert.equal(g.run('fighters[1].dots.length'), 1);
  assert.equal(g.run('fighters[1].dots[0].stacks'), 3);
  g.run('reset(); fighters[0].dots=[{type:"burn",time:.001,dps:10,stacks:1}]; update(STEP)');
  assert.ok(Math.abs(g.run('fighters[0].health') - 99.99) < 1e-8);
});
test('stun permits knockback slide and guard prevents repeated stun', () => {
  const g = game();
  g.run('fighters[0].stunned=.5; fighters[0].vx=300; fighters[0].vy=0; fighters[0].x=200; bounceMovement(fighters[0],STEP)');
  assert.ok(g.run('fighters[0].x > 200'));
  g.run('fighters[0].stun=3; resolveHits([{a:fighters[0],b:fighters[1],damage:0}])');
  assert.equal(g.run('fighters[1].stunned'), .6);
  g.run('fighters[1].stunned=.1; resolveHits([{a:fighters[0],b:fighters[1],damage:0}])');
  assert.equal(g.run('fighters[1].stunned'), .1);
});
test('visible weapon head and swept arc hit, distant target misses', () => {
  const g = game();
  g.run('Object.assign(fighters[0],{x:200,y:200,angle:0,range:50,weapon:"spear",previous:null}); Object.assign(fighters[1],{x:280,y:200,previous:null})');
  assert.equal(g.run('weaponTouches(...fighters)'), true);
  g.run('fighters[1].y=350'); assert.equal(g.run('weaponTouches(...fighters)'), false);
  g.run('fighters[0].previous={x:200,y:200,angle:-1}; fighters[0].angle=1; fighters[1].y=200');
  assert.equal(g.run('weaponTouches(...fighters)'), true);
});
test('collision separates coincident bodies and walls keep velocity pointing inward', () => {
  const g = game();
  g.run('fighters.forEach(a=>{a.x=200;a.y=200}); collide(...fighters)');
  assert.ok(g.run('Math.hypot(fighters[0].x-fighters[1].x,fighters[0].y-fighters[1].y) >= 42'));
  g.run('Object.assign(fighters[0],{x:-5,y:500,vx:100,vy:-100}); constrain(fighters[0])');
  assert.equal(g.run('fighters[0].x===21 && fighters[0].y===399 && fighters[0].vx>0 && fighters[0].vy<0'), true);
});
test('120-second timeout compares HP percentage and zero damage can draw', () => {
  const g = game();
  g.run('fighters[0].hp=200;fighters[0].health=100;fighters[1].hp=100;fighters[1].health=60;elapsed=120;endBattle()');
  assert.ok(g.nodes.get('status').textContent.startsWith('Dagger WINS'));
  g.run('reset(); fighters.forEach(a=>{a.damage=0;a.ability="none"}); for(let i=0;i<28802&&!finished;i++) update(STEP)');
  assert.equal(g.run('finished'), true); assert.equal(g.nodes.get('status').textContent, 'DRAW!');
});
test('fixed steps give the same seeded result at 30, 60 and 144 FPS', () => {
  const results = [30, 60, 144].map(fps => {
    const g = game();
    g.run(`running=true; frame(0); for(let i=1;i<=${fps * 10};i++)frame(i*1000/${fps})`);
    return g.run('JSON.stringify(fighters.map(a=>[a.x,a.y,a.health]))');
  });
  assert.equal(results[0], results[1]); assert.equal(results[1], results[2]);
});
test('hidden tabs pause; creator still creates an independent custom fighter', () => {
  const g = game();
  g.nodes.get('start').onclick(); g.document.hidden = true; g.listeners.visibilitychange();
  assert.equal(g.run('running'), false);
  g.nodes.get('openCreator').onclick(); assert.equal(g.nodes.get('creatorFields').disabled, true);
  g.nodes.get('cloneCharacter').onclick(); g.fields.get('name').value = 'Custom Test';
  g.nodes.get('characterForm').onsubmit({ preventDefault() {} });
  assert.equal(g.run('roster.length'), 6); assert.equal(g.run('fighters[0].name'), 'Custom Test');
  assert.equal(g.run('builtins[0].name'), 'Club');
});
test('all preset matchups terminate with finite, bounded state', () => {
  const g = game();
  for (const a of ['club','dagger','spear','sword','hammer']) {
    for (const b of ['club','dagger','spear','sword','hammer']) {
      g.run(`selected={a:'${a}',b:'${b}'};reset();for(let i=0;i<28802&&!finished;i++)update(STEP)`);
      assert.equal(g.run('finished'), true);
      assert.equal(g.run('fighters.every(a=>[a.x,a.y,a.vx,a.vy,a.health].every(Number.isFinite)&&a.x>=a.r&&a.x<=W-a.r&&a.y>=a.r&&a.y<=H-a.r&&a.health>=0&&a.health<=a.hp)'),true);
    }
  }
});
