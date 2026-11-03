// スタートリック ゲーム本体（画面なし。ブラウザと node の両方で動く）
// 1971 年の BASIC 版と Super Star Trek の処理に沿っている
(function (root) {
'use strict';

const SIZE = 12;      // 銀河の大きさ（クワドラント）
const SEC = 8;        // クワドラントの大きさ（セクター）
const MAX_ENERGY = 3000;
const MAX_TORP = 10;
const KLINGON_POWER = 200;

// k: 敵の数, b: 基地の数, days: 期限
const DIFFICULTY = {
  easy:     { k: 20, b: 5, days: 100 },
  normal:   { k: 30, b: 3, days: 80 },
  hard:     { k: 40, b: 2, days: 90 },
  veryhard: { k: 55, b: 1, days: 100 },
};

const DEVICES = ['nav', 'srs', 'lrs', 'pha', 'tor', 'dam', 'she', 'com'];

// コースの基準ベクトル。1=東 3=北 5=西 7=南（y は下が正）
const CV = [null, [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0]];

function courseVector(c) {
  const r = Math.floor(c), t = c - r;
  return [CV[r][0] + (CV[r + 1][0] - CV[r][0]) * t, CV[r][1] + (CV[r + 1][1] - CV[r][1]) * t];
}

// (dx, dy) へ向かうコースを返す。y は下が正
function courseTo(dx, dy) {
  if (dx === 0 && dy === 0) return null;
  for (let r = 1; r <= 8; r++) {
    const a = CV[r], b = [CV[r + 1][0] - a[0], CV[r + 1][1] - a[1]];
    const den = b[0] * dy - b[1] * dx;
    if (den === 0) continue;
    const t = (a[1] * dx - a[0] * dy) / den;
    if (t < -1e-9 || t >= 1 - 1e-9) continue;
    const vx = a[0] + b[0] * t, vy = a[1] + b[1] * t;
    if (vx * dx + vy * dy > 0) return r + Math.max(0, t);
  }
  return null;
}

class Game {
  constructor(opts) {
    opts = opts || {};
    this.rnd = opts.rnd || Math.random;
    this.diffKey = opts.difficulty || 'normal';
    const d = Object.assign({}, DIFFICULTY[this.diffKey], opts.params || {});
    this.params = d;
    this.size = SIZE;
    this.out = [];
    this.over = null;
    this.gal = [];
    this.known = [];
    this.damage = {};
    DEVICES.forEach(n => { this.damage[n] = 0; });
    this.energy = MAX_ENERGY;
    this.shields = 0;
    this.torps = MAX_TORP;
    this.docked = false;
    this.killed = 0;
    this.basesLost = 0;

    for (let y = 0; y < SIZE; y++) {
      this.gal.push([]);
      this.known.push([]);
      for (let x = 0; x < SIZE; x++) {
        this.gal[y].push({ k: 0, b: 0, s: 1 + this.ri(8) });
        this.known[y].push(false);
      }
    }
    for (let i = 0; i < d.k;) {
      const c = this.gal[this.ri(SIZE)][this.ri(SIZE)];
      if (c.k < 3) { c.k++; i++; }
    }
    for (let i = 0; i < d.b;) {
      const c = this.gal[this.ri(SIZE)][this.ri(SIZE)];
      if (!c.b) { c.b = 1; i++; }
    }
    this.totalK = d.k;
    this.totalB = d.b;
    this.startK = d.k;
    this.startDate = 100 * (20 + this.ri(20));
    this.date = this.startDate;
    this.limit = d.days;
    // 最初の場所に敵は置かない（シールド0で始まるので）
    do {
      this.qx = this.ri(SIZE);
      this.qy = this.ri(SIZE);
    } while (this.gal[this.qy][this.qx].k > 0);
    this.emit('intro', { k: this.totalK, d: this.limit, b: this.totalB, date: this.startDate + this.limit });
    this.enterQuadrant(this.ri(SEC), this.ri(SEC));
  }

  ri(n) { return Math.floor(this.rnd() * n); }
  emit(k, p) { this.out.push({ k, p: p || {} }); }
  drain() { const o = this.out; this.out = []; return o; }
  daysLeft() { return this.startDate + this.limit - this.date; }
  broken(n) { return this.damage[n] < 0; }
  live() { return this.klingons.filter(k => k.e > 0); }

  emptyCell() {
    for (let i = 0; i < 400; i++) {
      const x = this.ri(SEC), y = this.ri(SEC);
      if (this.sector[y][x] === '.') return [x, y];
    }
    return null;
  }

  enterQuadrant(sx, sy) {
    this.sector = [];
    for (let y = 0; y < SEC; y++) this.sector.push(new Array(SEC).fill('.'));
    this.klingons = [];
    this.sx = sx; this.sy = sy;
    this.sector[sy][sx] = 'E';
    const q = this.gal[this.qy][this.qx];
    this.known[this.qy][this.qx] = true;
    for (let i = 0; i < q.k; i++) {
      const p = this.emptyCell();
      this.sector[p[1]][p[0]] = 'K';
      this.klingons.push({ x: p[0], y: p[1], e: KLINGON_POWER * (0.5 + this.rnd()) });
    }
    if (q.b) { const p = this.emptyCell(); this.sector[p[1]][p[0]] = 'B'; }
    for (let i = 0; i < q.s; i++) {
      const p = this.emptyCell();
      if (p) this.sector[p[1]][p[0]] = '*';
    }
    this.emit('enter', { x: this.qx + 1, y: this.qy + 1 });
    if (q.k > 0) {
      this.emit('combatArea', { n: q.k });
      if (this.shields <= 200) this.emit('shieldsLow');
    }
    this.checkDock();
  }

  checkDock() {
    const was = this.docked;
    this.docked = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = this.sx + dx, y = this.sy + dy;
      if (x >= 0 && x < SEC && y >= 0 && y < SEC && this.sector[y][x] === 'B') this.docked = true;
    }
    if (!this.docked) return;
    this.energy = MAX_ENERGY;
    this.torps = MAX_TORP;
    this.shields = 0;
    if (!was) this.emit('docked');
    let sum = 0;
    DEVICES.forEach(n => { if (this.damage[n] < 0) sum += -this.damage[n]; });
    if (sum > 0) {
      const t = Math.min(0.9, 0.1 * sum);
      DEVICES.forEach(n => { this.damage[n] = 0; });
      this.date += t;
      this.emit('repaired', { t: t.toFixed(1) });
      this.checkEnd();
    }
  }

  condition() {
    if (this.docked) return 'docked';
    if (this.live().length) return 'red';
    if (this.energy + this.shields < MAX_ENERGY * 0.1) return 'yellow';
    return 'green';
  }

  dist(k) {
    return Math.max(1, Math.hypot(k.x - this.sx, k.y - this.sy));
  }

  // 敵の砲撃
  klingonsFire() {
    if (this.over || !this.live().length) return;
    if (this.docked) { this.emit('baseProtects'); return; }
    for (const k of this.live()) {
      const h = Math.floor(k.e / this.dist(k) * (2 + this.rnd()));
      this.shields -= h;
      k.e = k.e / (3 + this.rnd());
      this.emit('hit', { h, x: k.x + 1, y: k.y + 1, s: Math.max(0, Math.floor(this.shields)) });
      if (this.shields <= 0) { this.finish('destroyed'); return; }
      if (h >= 20 && h / this.shields > 0.02 && this.rnd() > 0.6) {
        const d = DEVICES[this.ri(DEVICES.length)];
        this.damage[d] -= h / this.shields + 0.5 * this.rnd();
        this.emit('devHit', { d });
      }
    }
  }

  finish(kind) {
    if (this.over) return;
    this.over = kind;
    this.emit('end_' + kind, { k: this.totalK, killed: this.killed, date: this.date.toFixed(1) });
  }

  checkEnd() {
    if (this.over) return true;
    if (this.totalK <= 0) { this.finish('win'); return true; }
    if (this.daysLeft() <= 0) { this.finish('time'); return true; }
    if (this.shields + this.energy <= 10 || (this.energy <= 10 && this.broken('she'))) {
      if (!this.docked) { this.finish('stranded'); return true; }
    }
    return false;
  }

  // 敵の移動（ワープの前に動く）
  klingonsShift() {
    for (const k of this.live()) {
      const p = this.emptyCell();
      if (!p) continue;
      this.sector[k.y][k.x] = '.';
      k.x = p[0]; k.y = p[1];
      this.sector[k.y][k.x] = 'K';
    }
  }

  repairAndEvents(warp) {
    const dt = warp >= 1 ? 1 : warp;
    const fixed = [];
    DEVICES.forEach(n => {
      if (this.damage[n] >= 0) return;
      this.damage[n] += dt;
      if (this.damage[n] > -0.1 && this.damage[n] < 0) this.damage[n] = -0.1;
      else if (this.damage[n] >= 0) { this.damage[n] = 0; fixed.push(n); }
    });
    fixed.forEach(d => this.emit('devFixed', { d }));
    if (this.rnd() <= 0.2) {
      const d = DEVICES[this.ri(DEVICES.length)];
      if (this.rnd() >= 0.6) {
        if (this.damage[d] < 0) {
          this.damage[d] = Math.min(0, this.damage[d] + this.rnd() * 3 + 1);
          this.emit('devImproved', { d });
        }
      } else {
        this.damage[d] -= this.rnd() * 5 + 1;
        this.emit('devAccident', { d });
      }
    }
  }

  // NAV: コース 1〜8.99、ワープ
  nav(course, warp) {
    if (this.over) return false;
    if (!(course >= 1 && course < 9)) { this.emit('badCourse'); return false; }
    const maxW = this.broken('nav') ? 0.2 : 8;
    if (!(warp > 0) || warp > maxW) {
      if (this.broken('nav') && warp > 0.2) this.emit('navDamaged');
      else this.emit('badWarp');
      return false;
    }
    const n = Math.round(warp * 8);
    if (n < 1) { this.emit('badWarp'); return false; }
    if (this.energy < n) {
      this.emit('noEnergy', { need: n, have: Math.floor(this.energy) });
      if (this.shields >= n - this.energy && !this.broken('she')) this.emit('shieldHint', { s: Math.floor(this.shields) });
      return false;
    }

    this.klingonsShift();
    this.klingonsFire();
    if (this.over) return true;
    this.repairAndEvents(warp);

    const v = courseVector(course);
    this.sector[this.sy][this.sx] = '.';
    const ox = this.sx, oy = this.sy;
    let lastX = ox, lastY = oy, blocked = false, left = false;
    for (let i = 1; i <= n; i++) {
      const x = Math.round(ox + v[0] * i), y = Math.round(oy + v[1] * i);
      if (x < 0 || x >= SEC || y < 0 || y >= SEC) { left = true; break; }
      if (this.sector[y][x] !== '.') { blocked = true; break; }
      lastX = x; lastY = y;
    }
    const dt = warp < 1 ? Math.floor(warp * 10) * 0.1 : 1;
    this.useEnergy(n + 10);
    this.date += dt;

    if (left) {
      let gx = this.qx * SEC + ox + Math.round(v[0] * n);
      let gy = this.qy * SEC + oy + Math.round(v[1] * n);
      let edge = false;
      if (gx < 0) { gx = 0; edge = true; }
      if (gy < 0) { gy = 0; edge = true; }
      const mx = SIZE * SEC - 1;
      if (gx > mx) { gx = mx; edge = true; }
      if (gy > mx) { gy = mx; edge = true; }
      const nq = [Math.floor(gx / SEC), Math.floor(gy / SEC)];
      if (edge) this.emit('galaxyEdge');
      if (nq[0] !== this.qx || nq[1] !== this.qy) {
        this.qx = nq[0]; this.qy = nq[1];
        if (!this.checkEnd()) this.enterQuadrant(gx % SEC, gy % SEC);
        this.checkEnd();
        return true;
      }
      // 端で止まった場合は今のクワドラント内
      lastX = gx % SEC; lastY = gy % SEC;
      if (this.sector[lastY][lastX] !== '.') { lastX = ox; lastY = oy; }
    }
    if (blocked) this.emit('blocked', { x: lastX + 1, y: lastY + 1 });
    this.sx = lastX; this.sy = lastY;
    this.sector[lastY][lastX] = 'E';
    this.checkDock();
    this.checkEnd();
    return true;
  }

  useEnergy(n) {
    this.energy -= n;
    if (this.energy < 0) {
      this.emit('shieldSupply');
      this.shields += this.energy;
      this.energy = 0;
      if (this.shields < 0) this.shields = 0;
    }
  }

  srsAvailable() { return !this.broken('srs') || this.docked; }

  // LRS: 周囲3×3を調べて地図に記録する
  lrs() {
    if (this.over) return null;
    if (this.broken('lrs')) { this.emit('lrsDown'); return null; }
    const rows = [];
    for (let dy = -1; dy <= 1; dy++) {
      const r = [];
      for (let dx = -1; dx <= 1; dx++) {
        const x = this.qx + dx, y = this.qy + dy;
        if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) { r.push(null); continue; }
        this.known[y][x] = true;
        const c = this.gal[y][x];
        r.push(c.k * 100 + c.b * 10 + c.s);
      }
      rows.push(r);
    }
    this.emit('lrsDone');
    return rows;
  }

  // PHA
  phaser(x) {
    if (this.over) return false;
    if (this.broken('pha')) { this.emit('phaDown'); return false; }
    if (!this.live().length) { this.emit('noTargets'); return false; }
    if (!(x > 0)) { this.emit('badAmount'); return false; }
    x = Math.floor(x);
    if (x > this.energy) { this.emit('noEnergy', { need: x, have: Math.floor(this.energy) }); return false; }
    this.energy -= x;
    if (this.broken('com')) x = x * this.rnd();
    const live = this.live();
    const per = x / live.length;
    for (const k of live) {
      const h = Math.floor(per / this.dist(k) * (this.rnd() + 2));
      if (h <= 0.15 * k.e) { this.emit('phaNoEffect', { x: k.x + 1, y: k.y + 1 }); continue; }
      k.e -= h;
      this.emit('phaHit', { h, x: k.x + 1, y: k.y + 1, r: Math.max(0, Math.floor(k.e)) });
      if (k.e <= 0) this.killKlingon(k);
    }
    if (!this.checkEnd()) this.klingonsFire();
    this.checkEnd();
    return true;
  }

  killKlingon(k) {
    k.e = 0;
    this.sector[k.y][k.x] = '.';
    this.gal[this.qy][this.qx].k--;
    this.totalK--;
    this.killed++;
    this.emit('killed', { x: k.x + 1, y: k.y + 1, n: this.totalK });
  }

  // 魚雷がどう飛ぶかを調べる（発射はしない）
  torpedoPath(course) {
    const v = courseVector(course), cells = [];
    for (let i = 1; i < 20; i++) {
      const x = Math.round(this.sx + v[0] * i), y = Math.round(this.sy + v[1] * i);
      if (x < 0 || x >= SEC || y < 0 || y >= SEC) return { cells, hit: null };
      if (cells.length && cells[cells.length - 1][0] === x && cells[cells.length - 1][1] === y) continue;
      cells.push([x, y]);
      const t = this.sector[y][x];
      if (t !== '.' && t !== 'E') return { cells, hit: t, x, y };
    }
    return { cells, hit: null };
  }

  // TOR
  torpedo(course) {
    if (this.over) return false;
    if (this.broken('tor')) { this.emit('torDown'); return false; }
    if (this.torps <= 0) { this.emit('noTorps'); return false; }
    if (!(course >= 1 && course < 9)) { this.emit('badCourse'); return false; }
    this.torps--;
    this.useEnergy(2);
    const p = this.torpedoPath(course);
    this.emit('torTrack', { path: p.cells.map(c => (c[0] + 1) + ',' + (c[1] + 1)).join(' ') });
    if (p.hit === 'K') {
      const k = this.klingons.find(q => q.x === p.x && q.y === p.y && q.e > 0);
      this.killKlingon(k);
    } else if (p.hit === '*') {
      this.emit('torStar', { x: p.x + 1, y: p.y + 1 });
    } else if (p.hit === 'B') {
      this.sector[p.y][p.x] = '.';
      this.gal[this.qy][this.qx].b = 0;
      this.totalB--;
      this.basesLost++;
      this.docked = false;
      this.emit('torBase');
    } else {
      this.emit('torMiss');
    }
    if (!this.checkEnd()) this.klingonsFire();
    this.checkEnd();
    return true;
  }

  // SHE: シールドの値を指定する
  setShields(x) {
    if (this.over) return false;
    if (this.broken('she')) { this.emit('sheDown'); return false; }
    if (!(x >= 0)) { this.emit('badAmount'); return false; }
    x = Math.floor(x);
    if (x > this.energy + this.shields) { this.emit('noEnergy', { need: x, have: Math.floor(this.energy + this.shields) }); return false; }
    this.energy = this.energy + this.shields - x;
    this.shields = x;
    this.emit('shieldsSet', { s: x, e: Math.floor(this.energy) });
    return true;
  }
}

const api = { Game, DIFFICULTY, DEVICES, SIZE, SEC, MAX_ENERGY, MAX_TORP, courseTo, courseVector };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.StarTrick = api;
})(this);
