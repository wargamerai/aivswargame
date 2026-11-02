// ==========================================
// ai.js - ミニマックス2手先探索版
// ==========================================

window.PLANE_CHART_TYPE = {
    "F-86": "米国初期",
    "Mig-15": "ソ連",
    "F-4": "米国後期",
    "F-105": "米国後期",
    "Mig-17": "ソ連",
    "Mig-21": "ソ連"
};

// ==========================================
// Q学習テーブル（localStorage永続化）
// ==========================================
const AirCombatRL = {
    _table: null,
    _dirty: false,
    _saveTimer: null,

    getTable: function() {
        if (!this._table) {
            // aircombat_q_data.js で定義された window.AIRCOMBAT_Q_TABLE から読み込み
            if (window.AIRCOMBAT_Q_TABLE) {
                this._table = window.AIRCOMBAT_Q_TABLE;
                console.log('[Q] AIRCOMBAT_Q_TABLE loaded:', Object.keys(this._table).length, 'states');
            } else {
                this._table = {};
            }
        }
        return this._table;
    },

    get: function(state, action) {
        return (this.getTable()[state] || {})[action] || 0;
    },

    update: function(state, action, reward, nextMaxQ) {
        const t = this.getTable();
        if (!t[state]) t[state] = {};
        const old = t[state][action] || 0;
        const alpha = 0.15, gamma = 0.9;
        t[state][action] = old + alpha * (reward + gamma * nextMaxQ - old);
        this._dirty = true;
        // バッチ保存（100msデバウンス）
        if (!this._saveTimer) {
            this._saveTimer = setTimeout(() => {
                if (this._dirty) {
                    try { localStorage.setItem('aircombat_q', JSON.stringify(this._table)); } catch(e) {}
                    this._dirty = false;
                }
                this._saveTimer = null;
            }, 100);
        }
    },

    getBestAction: function(state, actions) {
        const t = this.getTable();
        let best = null, bestQ = -Infinity;
        for (let a of actions) {
            const q = (t[state] || {})[a] || 0;
            if (q > bestQ) { bestQ = q; best = a; }
        }
        return best;
    },

    // 直前の行動を記憶（報酬計算用）
    _lastState: {},
    _lastAction: {},
    _lastDist: {},

    recordStep: function(unitId, state, action, dist) {
        this._lastState[unitId] = state;
        this._lastAction[unitId] = action;
        this._lastDist[unitId] = dist;
    },

    applyReward: function(unitId, newDist, fired, hit, gotRear, arc, aspect) {
        const prev = this._lastState[unitId];
        const act  = this._lastAction[unitId];
        const oldD = this._lastDist[unitId];
        if (!prev || !act) return;
        // Python train_air.py の reward_step() と同一の報酬構造
        let r = 0;
        if (newDist < oldD)  r += 3;   // 接近
        else if (newDist > oldD) r -= 2; // 離脱ペナルティ
        if (newDist <= 1)    r += 8;   // 超近距離
        else if (newDist <= 4) r += 4; // 射程内
        else if (newDist <= 10) r += 1; // 中距離
        if (fired)           r += 6;   // 攻撃実行
        if (hit)             r += 18;  // 命中
        // ポジショニング報酬（Python reward_step と同一）
        if (arc === '前方' && aspect === '後方') r += 12;
        else if (arc === '前方' && aspect === '後方側面') r += 8;
        else if (arc === '前方') r += 3;
        else if (aspect === '後方') r += 4;
        // nextMaxQ を正しく計算（Python版と同じ）
        let nextMax = 0;
        const table = this.getTable();
        const actions = table[prev] || {};
        const vals = Object.values(actions);
        if (vals.length > 0) nextMax = Math.max(...vals);
        this.update(prev, act, r, nextMax);
    }
};

const AI = {
    DIR_ANGLES: {8: -90, 9: -30, 3: 30, 2: 90, 1: 150, 7: -150},
    DIR_ORDER: [8, 9, 3, 2, 1, 7],

    // ==========================================
    // 状態を文字列に変換（Q学習用）
    // ==========================================
    getState: function(unit, enemy) {
        // Python train_air.py の get_state() と完全同一のキー生成
        const dist = Math.min(20, Math.round(this.getHexDistance(unit.x, unit.y, enemy.x, enemy.y)));
        const distBand = dist <= 1 ? 'C' : dist <= 4 ? 'N' : dist <= 10 ? 'M' : 'F';
        const altRaw = unit.altitude - enemy.altitude;
        const altC = altRaw >= 3 ? 'U' : altRaw <= -3 ? 'D' : 'E';
        const myAlt = unit.altitude >= 25 ? 'H' : unit.altitude >= 12 ? 'M' : 'L';
        const { arc, aspect } = this.getArcAndAspect(
            unit.x, unit.y, unit.direction,
            enemy.x, enemy.y, enemy.direction, dist
        );
        const arcC = arc === '前方' ? 'F' : 'O';
        const aspC = aspect === '後方' ? 'R' : aspect === '後方側面' ? 'S' : 'X';
        const hs = unit.missiles ? unit.missiles.hs : 0;
        const rh = unit.missiles ? unit.missiles.rh : 0;
        const hsC = hs >= 2 ? 'H' : hs === 1 ? 'h' : 'N';
        const rhC = rh >= 2 ? 'R' : rh === 1 ? 'r' : 'N';
        const dmgC = (enemy.damage === '損害あり') ? 'D' : 'O';
        let numC = 'E';
        if (typeof units !== 'undefined') {
            const myAlive = units.filter(u => u.team === unit.team && u.status !== 'destroyed').length;
            const enAlive = units.filter(u => u.team !== unit.team && u.status !== 'destroyed').length;
            numC = myAlive > enAlive ? 'A' : myAlive < enAlive ? 'B' : 'E';
        }
        const prevDist = (this._lastDist && this._lastDist[unit.id]) || dist;
        const trendC = dist < prevDist ? 'I' : dist > prevDist ? 'O' : 'S';
        return `${distBand}${altC}${myAlt}_${arcC}${aspC}_${hsC}${rhC}_${dmgC}${numC}${trendC}`;
    },

    // ==========================================
    // メイン：decideMove
    // グループ戦術・ラテラルロール・後攻スコア対応版
    // ==========================================
    // =====================================================================
    // 撃てる位置を狙う移動（兵器の性能に合わせて、有利な位置で撃つ）
    //   今撃てる見込み（自分が動いた直後に撃つ）＋次のターンに撃てる見込み
    //   − まだ動いていない敵から撃たれる危険 ＋ 位置取りの補助（後ろを取る・高度・端を避ける）
    // =====================================================================
    // 表の値 v に対して 2d6 の合計が v 未満なら撃墜、v と同じなら損害
    hitProb: function(v) {
        const W = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
        let kill = 0, dmg = 0;
        for (let s = 2; s <= 12; s++) { if (s < v) kill += W[s]; else if (s === v) dmg += W[s]; }
        return (kill + 0.35 * dmg) / 36;
    },
    // RH: 2d6 の合計が値以下なら撃墜（損害はない）
    rhProb: function(v) {
        const W = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
        let k = 0; for (let s = 2; s <= 12; s++) if (s <= v) k += W[s];
        return k / 36;
    },
    mTypeOf: function(u) {
        let nation = (window.PLANE_CHART_TYPE && window.PLANE_CHART_TYPE[u.aircraft]) || (u.team === 'Red' ? 'ソ連' : '米国後期');
        let mType = u.missileType || nation;
        if (window.COMBAT_CHARTS && window.COMBAT_CHARTS.HS && !window.COMBAT_CHARTS.HS[mType]) {
            let keys = Object.keys(window.COMBAT_CHARTS.HS);
            mType = keys.find(k => nation.includes(k) || k.includes(nation)) || keys[0] || mType;
        }
        return mType;
    },
    // コマンドの上昇(8)・降下(2)の数で高度が決まる（ゲーム本体と同じ）
    simAlt: function(unit, cmd, r, c) {
        let up = (cmd.match(/8/g) || []).length, dn = (cmd.match(/2/g) || []).length;
        if (up || dn) return unit.altitude + (up ? up : -dn);
        return unit.altitude + (parseInt(window.planeData[unit.aircraft].alt[r][c]) || 0);
    },
    // sh（位置 s）が tg（位置 t）を撃った時の撃墜の見込み（使える兵器のうち一番よいもの）
    fireValue: function(sh, s, t, opt) {
        opt = opt || {};
        let dist = this.getHexDistance(s.x, s.y, t.x, t.y);
        let altDiff = Math.abs(s.alt - t.alt);
        let { arc, aspect } = this.getArcAndAspect(s.x, s.y, s.dir, t.x, t.y, t.dir, dist);
        if (arc !== '前方') return 0;
        let best = 0, mType = this.mTypeOf(sh);
        if (!opt.rhOnly && sh.gun > 0 && altDiff <= 1 && dist <= 2 && (aspect === '後方' || aspect === '後方側面' || aspect === '前方')) {
            let v = (window.COMBAT_CHARTS.GUN[sh.gunType || 'A'] || {})[aspect];
            best = Math.max(best, this.hitProb(v ? (v[dist] || 0) : 0));
        }
        if (!opt.rhOnly && sh.missiles && sh.missiles.hs > 0 && altDiff <= 2 && aspect === '後方' && dist >= 1) {
            let v = this.getMissileTargetValue('HS', mType, dist);
            if (v >= 3) best = Math.max(best, this.hitProb(v));
        }
        if (!opt.noRH && sh.team !== 'Red' && sh.missiles && sh.missiles.rh > 0 && altDiff <= 3 && dist >= 4) {
            let v = this.getMissileTargetValue('RH', mType, dist);
            // RH はロックオン→発射→次のターンに命中判定。まだロックしていなければ少し割り引く
            if (v >= 5) best = Math.max(best, this.rhProb(v) * (sh.lockOnTargetId ? 0.85 : 0.7));
        }
        return best;
    },
    // 機体が取りうる移動の行き先（{r,c,cmd,s}）を全部挙げる
    endStates: function(unit, limit) {
        let out = [], seen = {};
        let r0 = unit.startRow != null ? unit.startRow : 2, c0 = unit.startCol != null ? unit.startCol : 2;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
            if (Math.abs(dr) + Math.abs(dc) > 2) continue;
            let r = r0 + dr, c = c0 + dc;
            if (r < 0 || r > 4 || c < 0 || c > 4) continue;
            if ((unit.damage === '損害あり' || unit.bomb_equipped) && (r < 1 || r > 3 || c < 1 || c > 3)) continue;
            if (unit.altitude >= 40 && r === 0) continue;
            let cmds;
            try { cmds = this.generateAllValidCommands(unit, r, c); } catch (e) { continue; }
            for (let cmd of cmds) {
                let sim = this.simulatePosition(unit, cmd, r, c);
                let alt = this.simAlt(unit, cmd, r, c);
                if (sim.isOffMap || alt > 40 || alt < 1) continue;
                let key = sim.c + ',' + sim.r + ',' + sim.dir + ',' + alt + ',' + r + ',' + c;
                if (seen[key]) continue;
                seen[key] = 1;
                out.push({ r, c, cmd, steps: sim.finalSteps || 0, s: { x: sim.c, y: sim.r, dir: sim.dir, alt } });
            }
        }
        if (limit && out.length > limit) {
            for (let i = out.length - 1; i > 0; i--) { let j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
            out = out.slice(0, limit);
        }
        return out;
    },
    // RH の目標の割り振り: 味方と敵の距離の合計が一番短い組み合わせ（目の前の敵）
    rhAssign: function(unit, myUnits, foes) {
        if (unit._rhTarget) { let t = foes.find(e => e.id === unit._rhTarget); if (t) return t; }
        let mates = myUnits.filter(m => m.team === unit.team && m.status !== 'destroyed').sort((a, b) => a.id.localeCompare(b.id));
        let best = null, bestSum = Infinity;
        const perm = (arr, n) => n === 0 ? [[]] : arr.flatMap((x, i) => perm(arr.filter((_, j) => j !== i), n - 1).map(p => [x, ...p]));
        let n = Math.min(mates.length, foes.length);
        for (let p of perm(foes, n)) {
            let sum = 0; for (let i = 0; i < n; i++) sum += this.getHexDistance(mates[i].x, mates[i].y, p[i].x, p[i].y);
            if (sum < bestSum) { bestSum = sum; best = p; }
        }
        let idx = mates.findIndex(m => m.id === unit.id);
        let t = (best && idx >= 0 && idx < best.length) ? best[idx] : foes[0];
        unit._rhTarget = t.id;
        return t;
    },
    // RH の段取りごとの、このヘクスの値（s=自分、t=目標。ターンの最後の位置）
    rhGoal: function(unit, s, t, phase) {
        let d = this.getHexDistance(s.x, s.y, t.x, t.y);
        let { arc, aspect } = this.getArcAndAspect(s.x, s.y, s.dir, t.x, t.y, t.dir, d);
        if (arc !== '前方' || Math.abs(s.alt - t.alt) > 3) return 0;
        let v = this.getMissileTargetValue('RH', unit.missileType || this.mTypeOf(unit), d);
        if (phase === 'lock') return v >= 3 ? 0.3 + (d >= 10 && d <= 20 ? 0.1 : 0) : 0;
        // 正面から向かい合っている（目標がこちらを向いている）時は、すれ違わない遠めの距離ほどよい
        if (phase === 'fire') return d >= 4 ? this.rhProb(v) * (this.headOn(aspect) ? (d >= 10 ? 1 : d >= 8 ? 0.75 : 0.6) : 1) : 0;
        // 飛んでいる RH の誘導を保つ（命中は発射時の距離で決まる）＋もう1発撃てるなら少し上乗せ
        let pf = 1;
        if (unit.rhMissileInFlight && unit.rhMissileInFlight.launchDist != null) pf = this.rhProb(this.getMissileTargetValue('RH', unit.missileType || this.mTypeOf(unit), unit.rhMissileInFlight.launchDist));
        return pf + (unit.missiles.rh > 1 && d >= 4 ? 0.3 * this.rhProb(v) : 0);
    },
    headOn: function(aspect) { return aspect === '前方' || aspect === '側面'; },
    stateOf: function(u) { return { x: u.x, y: u.y, dir: u.direction, alt: u.altitude }; },
    // 行き先 e から、次のターンに動ける機体（仮）を作る
    unitAt: function(unit, e) {
        return Object.assign({}, unit, { x: e.s.x, y: e.s.y, direction: e.s.dir, altitude: e.s.alt, startRow: e.r, startCol: e.c, cursorRow: e.r, cursorCol: e.c, prevRow: e.r, stepsSinceLastTurn: e.steps });
    },
    // このターン、自分より後に動く敵か
    movesAfter: function(unit, e) {
        try {
            if (typeof turnOrder !== 'undefined' && typeof currentOrderIndex !== 'undefined' && turnOrder && turnOrder.length) {
                let mine = turnOrder.findIndex(o => o.u === unit || (o.u && o.u.id === unit.id));
                let his = turnOrder.findIndex(o => o.u === e || (o.u && o.u.id === e.id));
                if (mine >= 0 && his >= 0) return his > mine;
            }
        } catch (err) {}
        if (e.altitude !== unit.altitude) return e.altitude > unit.altitude;
        return unit.team === 'Red' && e.team !== 'Red';
    },
    edgePenalty: function(s) {
        let maxC = (window.AI && window.AI.mapMaxC !== undefined) ? window.AI.mapMaxC : 27;
        let maxR = (window.AI && window.AI.mapMaxR !== undefined) ? window.AI.mapMaxR : 53;
        let dL = s.x, dR = maxC - s.x, dT = s.y, dB = maxR - s.y;
        let edge = Math.min(dL, dR, dT, dB);
        if (edge <= 0) return 99999;
        if (edge > 5) return 0;
        let deg = this.DIR_ANGLES[s.dir] || 0, facing = false;
        if (dR <= 5 && deg > -90 && deg < 90) facing = true;
        if (dL <= 5 && (deg > 90 || deg < -90)) facing = true;
        if (dB <= 5 && deg > 0 && deg < 180) facing = true;
        if (dT <= 5 && deg < 0 && deg > -180) facing = true;
        return (6 - edge) * 60 + (facing ? 400 : 0);
    },
    decideMove: function(unit, enemies) {
        if (!unit) return { r: 2, c: 2, cmd: '5' };
        let foes = enemies ? enemies.filter(e => e.status !== 'destroyed') : [];
        if (foes.length === 0) {
            let reqS = window.planeData[unit.aircraft].speed[unit.cursorRow][unit.cursorCol].toString().split('/')[0];
            return { r: unit.cursorRow, c: unit.cursorCol, cmd: '5'.repeat(Number(reqS)) };
        }
        let allUnits = (typeof units !== 'undefined') ? units : [unit];
        let myUnits = allUnits.filter(u => u.team === unit.team && u.status !== 'destroyed');
        let focus = this.assignGroupTarget(unit, myUnits, foes) || foes[0];
        let armed = unit.gun > 0 || (unit.missiles && (unit.missiles.hs > 0 || unit.missiles.rh > 0));

        let cands = this.endStates(unit);
        if (cands.length === 0) return this.decideMoveOld(unit, enemies);

        // 敵の今の位置と、まだ動いていない敵の行き先の予想
        let foeNow = foes.map(e => this.stateOf(e));
        let foeAfterAll = foes.map(e => this.movesAfter(unit, e) ? this.endStates(e).map(x => x.s) : null);
        let foeAfter = foeAfterAll.map(a => { if (!a) return null; if (a.length <= 60) return a; let b = a.slice(); for (let i = b.length - 1; i > 0; i--) { let j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b.slice(0, 60); });
        // 次のターンの敵の位置の目安（そのままの速さで直進）
        let foeNext = foes.map(e => {
            try {
                let sp = Number(window.planeData[e.aircraft].speed[e.cursorRow != null ? e.cursorRow : 2][e.cursorCol != null ? e.cursorCol : 2].toString().split('/')[0]) || 3;
                let sim = this.simulatePosition(e, '5'.repeat(sp), e.cursorRow != null ? e.cursorRow : 2, e.cursorCol != null ? e.cursorCol : 2);
                return { x: sim.c, y: sim.r, dir: sim.dir, alt: e.altitude };
            } catch (err) { return this.stateOf(e); }
        });
        let inFlight = unit.rhMissileInFlight ? foes.findIndex(e => e.id === unit.rhMissileInFlight.targetId) : -1;
        // RH 用の機動を使うか: RH が残っていて、一番近い敵がまだ距離4以上（または RH が飛んでいる）
        let nearest = Math.min(...foes.map(e => this.getHexDistance(unit.x, unit.y, e.x, e.y)));
        if (unit._rh0 == null && unit.missiles) unit._rh0 = unit.missiles.rh;
        // 最初の1発を撃ったら、そのあとはどの敵でも正面に入ったものを狙う
        if (unit.missiles && unit.missiles.rh < unit._rh0) unit._rhFirstDone = true;
        // 最初のすれ違いを過ぎたら（1発撃って、敵が距離7以内に来たら）HS の戦いへ
        if (unit._rhFirstDone && nearest <= 7) unit._merged = true;
        let rhMode = unit.team !== 'Red' && unit.missiles && !unit._merged && (unit.missiles.rh > 0 || inFlight >= 0);
        let rhTgt = rhMode ? this.rhAssign(unit, myUnits, foes) : null;
        let locked = unit.lockOnTargetId ? foes.find(e => e.id === unit.lockOnTargetId) : null;
        if (inFlight >= 0) rhTgt = foes[inFlight];
        else if (locked) rhTgt = locked;
        let rhPhase = inFlight >= 0 ? 'flight' : (rhTgt && unit.lockOnTargetId === rhTgt.id) ? 'fire' : 'lock';
        // 狙う相手: 飛んでいる／ロック中ならその敵、最初の1発までは担当の敵、そのあとは誰でも
        let goalIdx = (inFlight >= 0 || locked || !unit._rhFirstDone) ? [foes.indexOf(rhTgt)] : foes.map((e, i) => i);
        let mates = myUnits.filter(m => m !== unit && m.id !== unit.id && m.status !== 'destroyed');
        let hsRole = null, watcher = null, baitUnit = null;
        if (unit.team !== 'Red' && mates.length) {
            const nd = u => Math.min(...foes.map(e => this.getHexDistance(u.x, u.y, e.x, e.y)));
            let pair = [unit, mates[0]].sort((a, b) => nd(a) - nd(b) || a.id.localeCompare(b.id));
            hsRole = pair[0] === unit ? 'bait' : 'watch';
            watcher = hsRole === 'bait' ? mates[0] : null;
            baitUnit = hsRole === 'watch' ? mates[0] : null;
        }

        for (let k of cands) {
            let s = k.s;
            // 1) 動いた直後に撃てる見込み（機関砲・HS は今の敵の位置に撃つ。RH はこのターンの最後）
            let now = 0;
            foes.forEach((e, i) => {
                now = Math.max(now, this.fireValue(unit, s, foeNow[i], { noRH: true }));
                let rhT = (foeAfter[i] && foeAfter[i].length) ? foeAfter[i] : [foeNow[i]];
                let rh = rhT.reduce((a, t) => a + this.fireValue(unit, s, t, { rhOnly: true }), 0) / rhT.length;
                now = Math.max(now, rh);
            });
            // 2) まだ動いていない敵から撃たれる危険（敵は一番よい手を選ぶとみる）
            let threat = 0;
            // 後から動く MiG は、撃てる位置に来られるなら必ず来るとみる（取りうる動きを全部調べて一番高い確率）
            foes.forEach((e, i) => {
                if (!foeAfterAll[i] || !foeAfterAll[i].length) return;
                let mx = 0;
                for (let t of foeAfterAll[i]) { let v = this.fireValue(e, t, s, { noRH: true }); if (v > mx) mx = v; }
                threat += mx;
            });
            // 3) 位置取りの補助
            let t = this.stateOf(focus), ti = foes.indexOf(focus);
            if (foeAfter[ti] && foeAfter[ti].length) t = foeNext[ti];
            let dist = this.getHexDistance(s.x, s.y, t.x, t.y);
            let { arc, aspect } = this.getArcAndAspect(s.x, s.y, s.dir, t.x, t.y, t.dir, dist);
            let pos = 0;
            if (arc === '前方' && aspect === '後方') pos += 120;
            else if (arc === '前方' && aspect === '後方側面') pos += 60;
            else if (arc === '前方') pos += 25;
            // 持っている兵器に合った距離へ
            let ideal = (unit.missiles && unit.missiles.hs > 0) ? 3 : (unit.team !== 'Red' && unit.missiles && unit.missiles.rh > 0) ? 8 : 1;
            pos -= Math.abs(dist - ideal) * 6;
            // 敵の方を向く
            let sx = s.x * 37.5, sy = s.y * 43.301 + (s.x % 2) * 21.650;
            let tx = t.x * 37.5, ty = t.y * 43.301 + (t.x % 2) * 21.650;
            let hd = Math.abs(((Math.atan2(ty - sy, tx - sx) * 180 / Math.PI - (this.DIR_ANGLES[s.dir] || 0) + 540) % 360) - 180);
            pos += 40 * (1 - hd / 180);
            // 高度は敵と同じか少し上
            let altAdv = s.alt - t.alt;
            pos -= Math.abs(altAdv) * 6;
            if (altAdv >= 1 && altAdv <= 2) pos += 10;
            if (s.alt > 35) pos -= (s.alt - 35) * 25;
            // 飛翔中の RH は前方に捉え続ける
            if (inFlight >= 0) {
                // 命中判定はこのターンの全機の移動のあと。その時に前方・距離4以上に捉えていられるか
                let tts = (foeAfter[inFlight] && foeAfter[inFlight].length) ? foeAfter[inFlight] : [foeNow[inFlight]];
                let sum = 0, inArc = 0;
                for (let tt of tts) {
                    let d2 = this.getHexDistance(s.x, s.y, tt.x, tt.y);
                    let a2 = this.getArcAndAspect(s.x, s.y, s.dir, tt.x, tt.y, tt.dir, d2).arc;
                    if (a2 === '前方' && Math.abs(s.alt - tt.alt) <= 3) inArc++;
                }
                let ld = unit.rhMissileInFlight.launchDist != null ? unit.rhMissileInFlight.launchDist : this.getHexDistance(unit.x, unit.y, foeNow[inFlight].x, foeNow[inFlight].y);
                let pr = this.rhProb(this.getMissileTargetValue('RH', unit.missileType || this.mTypeOf(unit), ld));
                pos += 1500 * pr * inArc / tts.length - (inArc ? 0 : 300);
            }
            // 2. 一撃離脱: RH が残っていて近くで撃てない時は、いったん離れて RH の距離で捉え直す
            if (unit.team !== 'Red' && unit.missiles && unit.missiles.rh > 0) {
                let rhNext = 0;
                foes.forEach((e, i) => { rhNext = Math.max(rhNext, this.fireValue(unit, s, foeNext[i], { rhOnly: true })); });
                pos += 350 * rhNext;
                let curD = this.getHexDistance(unit.x, unit.y, t.x, t.y);
                if (curD < 4 && now < 0.15) pos += (dist - curD) * 15;
            }
            // 4. 僚機との連携: 同じ敵を狙う味方と違う方向から回り込む
            let mates = myUnits.filter(m => m !== unit && m.id !== unit.id && m.status !== 'destroyed');
            for (let m of mates) {
                let mt = this.assignGroupTarget(m, myUnits, foes);
                if (!mt || mt.id !== focus.id) continue;
                let md = this.getHexDistance(m.x, m.y, t.x, t.y);
                if (md > 15 || dist > 15) continue;
                let ex = t.x * 37.5, ey = t.y * 43.301 + (t.x % 2) * 21.650;
                let mx = m.x * 37.5, my = m.y * 43.301 + (m.x % 2) * 21.650;
                let a1 = Math.atan2(sy - ey, sx - ex), a2 = Math.atan2(my - ey, mx - ex);
                let ad = Math.abs(a1 - a2) * 180 / Math.PI; if (ad > 180) ad = 360 - ad;
                pos += ad >= 90 ? 80 : ad >= 60 ? 40 : ad < 30 ? -60 : 0;
            }
            pos -= this.edgePenalty(s);
            if (!armed) { k.score = -800 * threat + dist * 8 - this.edgePenalty(s); continue; }
            // ── HS の戦い（すれ違ったあとの米軍）──
            //   落とせる確率（HS・機関砲・RH の高い方）− 落とされる確率
            //   ＋ MiG から距離5〜7の外回り（内側に切り込まない）＋ 僚機と支え合える距離
            if (!rhMode && unit.team !== 'Red') {
                let rhImm = 0;
                if ((unit.missiles && unit.missiles.rh > 0) || inFlight >= 0) {
                    foes.forEach((e, i) => {
                        let ts = (foeAfter[i] && foeAfter[i].length) ? foeAfter[i] : [foeNow[i]];
                        let ph = i === inFlight ? 'flight' : (unit.lockOnTargetId === e.id ? 'fire' : 'lock');
                        let g = ts.reduce((a, tt) => a + this.rhGoal(unit, s, tt, ph), 0) / ts.length;
                        if (ph === 'fire' && unit.missiles.rh <= 1 && g < 0.58) g = 0;   // 最後の1発は最高の時だけ
                        if (ph === 'lock') g *= 0.5;
                        rhImm = Math.max(rhImm, g);
                    });
                }
                let ring = 0;
                foes.forEach((e, i) => {
                    let ts = (foeAfter[i] && foeAfter[i].length) ? foeAfter[i] : [foeNow[i]];
                    let dAvg = 0, inside = 0;
                    for (let tt of ts) {
                        let d4 = this.getHexDistance(s.x, s.y, tt.x, tt.y);
                        dAvg += d4;
                        let ea = this.getArcAndAspect(tt.x, tt.y, tt.dir, s.x, s.y, s.dir, d4).arc;
                        if (d4 <= 4 && (ea === '前方' || ea === '前方側面')) inside++;
                    }
                    dAvg /= ts.length;
                    if (dAvg >= 5 && dAvg <= 7) ring += 0.05;
                    else if (dAvg <= 2) ring -= 0.1;
                    ring -= 0.15 * inside / ts.length;   // MiG の内側に切り込まない（旋回されたらやられる）
                });
                let sup = 0;
                for (let m of mates) {
                    let dm = this.getHexDistance(s.x, s.y, m.x, m.y);
                    if (dm >= 4 && dm <= 10) sup += 0.04; else if (dm < 3) sup -= 0.04;
                }
                let roleTerm = 0;
                if (hsRole === 'bait' && watcher) {
                    // 格闘戦役: 絶対に近づかない（距離4未満に入らない）、見守り役を背にして飛ぶ
                    foes.forEach((e, i) => {
                        let ts = (foeAfter[i] && foeAfter[i].length) ? foeAfter[i] : [foeNow[i]];
                        let dAvg = ts.reduce((a, tt) => a + this.getHexDistance(s.x, s.y, tt.x, tt.y), 0) / ts.length;
                        if (dAvg < 4) roleTerm -= 0.15 * (4 - dAvg);
                    });
                    let wx = watcher.x * 37.5, wy = watcher.y * 43.301 + (watcher.x % 2) * 21.650;
                    let awayDeg = Math.atan2(sy - wy, sx - wx) * 180 / Math.PI;   // 見守り役から自分への向き
                    let hd2 = Math.abs(((awayDeg - (this.DIR_ANGLES[s.dir] || 0) + 540) % 360) - 180);
                    roleTerm += 0.06 * (1 - hd2 / 180);
                } else if (hsRole === 'watch') {
                    // 見守り役: MiG と距離7以上を保つ（2ターン先を撃てる位置は、あとで読む）
                    foes.forEach((e, i) => {
                        let ts = (foeAfter[i] && foeAfter[i].length) ? foeAfter[i] : [foeNow[i]];
                        let dAvg = ts.reduce((a, tt) => a + this.getHexDistance(s.x, s.y, tt.x, tt.y), 0) / ts.length;
                        if (dAvg < 7) roleTerm -= 0.04 * (7 - dAvg);
                    });
                }
                k.now = now; k.threat = threat; k.pos = pos; k.rh = rhImm;
                k.score = 1000 * (Math.max(now, rhImm) - threat + ring + sup + roleTerm) - this.edgePenalty(s);
                continue;
            }
            // ── RH 用の機動: 担当の敵に、ロックオン→発射（距離7〜12が最高）→誘導の維持 ──
            if (rhMode) {
                let imm = 0;
                for (let gi of goalIdx) {
                    if (gi < 0) continue;
                    let tEnd = (foeAfter[gi] && foeAfter[gi].length) ? foeAfter[gi] : [foeNow[gi]];
                    let ph = gi === inFlight ? 'flight' : (unit.lockOnTargetId === foes[gi].id ? 'fire' : 'lock');
                    imm = Math.max(imm, tEnd.reduce((a, tt) => a + this.rhGoal(unit, s, tt, ph), 0) / tEnd.length);
                }
                // MiG の兵器（機関砲は距離2以内、HS は後ろから距離10以内）が届かない距離11以上を取る
                let away = 0;   // 次のターン以降の危険の目安（距離11未満の MiG 1機・1ヘクスにつき 0.03）
                foes.forEach((e, i) => {
                    let ts = (foeAfter[i] && foeAfter[i].length) ? foeAfter[i] : [foeNow[i]];
                    let dAvg = ts.reduce((a, tt) => a + this.getHexDistance(s.x, s.y, tt.x, tt.y), 0) / ts.length;
                    if (dAvg < 11) away -= (11 - dAvg) * 0.03;
                });
                // 僚機とも離れる（MiG がどちらかを追えば、もう1機の正面に入る）。高度も上下に分かれる
                let sep = 0;
                for (let m of mates) {
                    let dm = this.getHexDistance(s.x, s.y, m.x, m.y);
                    sep += Math.min(dm, 15) * 0.01 + (Math.abs(s.alt - m.altitude) >= 3 ? 0.04 : 0);
                }
                k.imm = imm; k.now = now; k.threat = threat; k.pos = pos;
                // 自分が落とせる確率 − 落とされる確率（＋次のターン以降の危険の目安）で比べる
                k.score = 1000 * (imm - threat + away + sep) - this.edgePenalty(s);
                continue;
            }
            k.now = now; k.threat = threat; k.pos = pos;
            k.score = 1000 * now - 800 * threat + pos;
        }

        // 4) RH 用の機動: 次のターンの RH フェイズまで読む。終わりの高度で次のターンの順番が決まる
        //    （敵より高ければ敵の後に動ける＝敵の動きを見てから一番よいヘクスへ。低ければ先に動く）
        if (rhMode && goalIdx.length === 1 && goalIdx[0] >= 0) {
            cands.sort((a, b) => b.score - a.score);
            let ti = goalIdx[0];
            let tEnd = (foeAfter[ti] && foeAfter[ti].length) ? foeAfter[ti].slice(0, 6) : [foeNow[ti]];
            let tNext = [];
            let k0x = cands[0] ? cands[0].s.x : unit.x, k0y = cands[0] ? cands[0].s.y : unit.y;
            for (let te of tEnd) {
                let tv = Object.assign({}, rhTgt, { x: te.x, y: te.y, direction: te.dir, altitude: te.alt });
                let all = this.endStates(tv).map(x => x.s);
                // こちらに近づく動きを優先して取る（正面から詰めてくる危険を低く見ない）
                all.sort((a, b) => this.getHexDistance(a.x, a.y, k0x, k0y) - this.getHexDistance(b.x, b.y, k0x, k0y));
                let n = Math.max(4, Math.floor(24 / tEnd.length));
                tNext = tNext.concat(all.slice(0, Math.ceil(n * 0.6)), all.slice(Math.ceil(n * 0.6)).sort(() => Math.random() - 0.5).slice(0, n - Math.ceil(n * 0.6)));
            }
            if (!tNext.length) tNext = [this.stateOf(rhTgt)];
            let tAlt = tEnd.reduce((a, t) => a + t.alt, 0) / tEnd.length;
            for (let k of cands.slice(0, 25)) {
                // このターンの最後に目標を達成できたら、次の段取りへ
                let nextPhase = rhPhase === 'lock' ? (k.imm > 0.2 ? 'fire' : 'lock') : rhPhase === 'fire' ? (k.imm > 0.2 ? 'flight' : 'fire') : (unit.missiles.rh > 0 ? 'fire' : 'flight');
                let mine = this.endStates(this.unitAt(unit, k), 150).filter(m => this.edgePenalty(m.s) < 1000);
                if (!mine.length) { k.V = 0; continue; }
                let after = k.s.alt > tAlt;   // 次のターン、敵の後に動けるか
                let V = 0;
                if (after) {
                    for (let t of tNext) { let b = 0; for (let m of mine) b = Math.max(b, this.rhGoal(unit, m.s, t, nextPhase)); V += b; }
                    V /= tNext.length;
                } else {
                    for (let m of mine) { let a = 0; for (let t of tNext) a += this.rhGoal(unit, m.s, t, nextPhase); V = Math.max(V, a / tNext.length); }
                }
                k.V = V; k.after = after;
                k.score += 700 * V;
            }
        }
        // 4'') 見守り役: MiG の2ターン先の分布へ、次のターンに RH・HS を撃てる位置を逆算する（ざっくり）
        if (armed && !rhMode && hsRole === 'watch' && baitUnit) {
            let mi = 0, md = Infinity;
            foes.forEach((e, i) => { let d6 = this.getHexDistance(baitUnit.x, baitUnit.y, e.x, e.y); if (d6 < md) { md = d6; mi = i; } });
            let e = foes[mi];
            let one = this.endStates(e, 8);
            let dist2 = [];
            for (let o of one) {
                let ev = Object.assign({}, e, { x: o.s.x, y: o.s.y, direction: o.s.dir, altitude: o.s.alt, startRow: o.r, startCol: o.c, cursorRow: o.r, cursorCol: o.c, prevRow: o.r, stepsSinceLastTurn: o.steps });
                dist2 = dist2.concat(this.endStates(ev, 8).map(x => x.s));
            }
            if (dist2.length) {
                cands.sort((a, b) => b.score - a.score);
                for (let k of cands.slice(0, 30)) {
                    let mine = this.endStates(this.unitAt(unit, k), 100).filter(m => this.edgePenalty(m.s) < 1000);
                    let best = 0;
                    for (let m of mine) {
                        let v = 0;
                        for (let t of dist2) v += this.fireValue(unit, m.s, t);
                        v /= dist2.length;
                        if (v > best) best = v;
                    }
                    k.watch2 = best;
                    k.score += 600 * best;
                }
            }
        }
        // 4') 格闘戦: 上位の手は、次のターンに撃てる位置へ回り込めるかを一手先まで読む
        if (armed && !rhMode) {
            cands.sort((a, b) => b.score - a.score);
            let top = cands.slice(0, 12);
            for (let k of top) {
                let v = this.unitAt(unit, k), best = 0;
                let nexts = this.endStates(v, 120);
                for (let n of nexts) {
                    if (this.edgePenalty(n.s) > 1000) continue;
                    foes.forEach((e, i) => { best = Math.max(best, this.fireValue(unit, n.s, foeNext[i])); });
                }
                k.next = best;
                k.score += 450 * best;
            }
        }
        // RH が飛んでいる間は、何があっても誘導しきる: 目標を前方・高度差3以内に捉え続けられる見込みが一番高い手だけに絞る
        if (inFlight >= 0) {
            let tgt = foes[inFlight];
            let ts = (foeAfterAll[inFlight] && foeAfterAll[inFlight].length) ? foeAfterAll[inFlight] : [foeNow[inFlight]];
            for (let k of cands) {
                let keep = 0;
                for (let tt of ts) {
                    let d7 = this.getHexDistance(k.s.x, k.s.y, tt.x, tt.y);
                    if (this.getArcAndAspect(k.s.x, k.s.y, k.s.dir, tt.x, tt.y, tt.dir, d7).arc === '前方' && Math.abs(k.s.alt - tt.alt) <= 3) keep++;
                }
                k.keep = keep / ts.length;
            }
            let mk = Math.max(...cands.map(k => k.keep));
            if (mk > 0) cands = cands.filter(k => k.keep >= mk - 1e-9);
        }
        cands.forEach(k => { if (!isFinite(k.score)) { if (!this._nanWarned) { console.log('[AI_MOVE2] NaN', JSON.stringify(k)); this._nanWarned = true; } k.score = -1e9; } });
        cands.sort((a, b) => b.score - a.score);
        let pick = cands[0];
        if (!pick) return this.decideMoveOld(unit, enemies);
        // 同じくらいよい手が複数あれば、少しだけばらつかせる
        let close = cands.filter(k => k.score >= pick.score - 5).slice(0, 3);
        if (close.length) pick = close[Math.floor(Math.random() * close.length)];
        console.log(`[AI_MOVE2] ${unit.id}${rhMode ? '（RH ' + rhPhase + ' 目標' + rhTgt.id + ' 今' + ((pick.imm || 0) * 100).toFixed(0) + '% 次' + ((pick.V || 0) * 100).toFixed(0) + '%' + (pick.after ? ' 次は後手' : ' 次は先手') + '）' : ''} → r${pick.r}c${pick.c} [${pick.cmd}] 今撃てる見込み:${((pick.now || 0) * 100).toFixed(0)}% 次:${((pick.next || 0) * 100).toFixed(0)}% 危険:${((pick.threat || 0) * 100).toFixed(0)}% 候補:${cands.length}`);
        unit._lastPlan = { now: pick.now || 0, next: pick.next || 0, threat: pick.threat || 0 };
        return { r: pick.r, c: pick.c, cmd: pick.cmd };
    },

    // 元の移動の決め方（比べるために残す）
    decideMoveOld: function(unit, enemies) {
        if (!unit) return { r: 2, c: 2, cmd: '5' };

        let validEnemies = enemies ? enemies.filter(e => e.status !== 'destroyed') : [];
        if (validEnemies.length === 0) {
            let reqS = window.planeData[unit.aircraft].speed[unit.cursorRow][unit.cursorCol].toString().split('/')[0];
            return { r: unit.cursorRow, c: unit.cursorCol, cmd: '5'.repeat(Number(reqS)) };
        }

        // ── グループ戦術：担当ターゲットと役割を決定 ──
        let allUnits = (typeof units !== 'undefined') ? units : [unit];
        let myUnits = allUnits.filter(u => u.team === unit.team && u.status !== 'destroyed');
        let role = this.getSovietRole(unit, myUnits);   // 0:囮  1:左翼  2:右翼
        let target = this.assignGroupTarget(unit, myUnits, validEnemies);
        if (!target) target = validEnemies[0];

        const state   = this.getState(unit, target);
        const curDist = this.getHexDistance(unit.x, unit.y, target.x, target.y);

        // ── ぐるぐる回り検出（直近5手で距離変化なし → circling） ──
        if (!unit._posHistory) unit._posHistory = [];
        unit._posHistory.push(curDist);
        if (unit._posHistory.length > 5) unit._posHistory.shift();
        const isCircling = unit._posHistory.length >= 4 &&
            (Math.max(...unit._posHistory) - Math.min(...unit._posHistory)) < 2;

        // ── 前ターンのQ報酬適用（ポジショニング報酬付き） ──
        const { arc: prevArc, aspect: prevAspect } = this.getArcAndAspect(
            unit.x, unit.y, unit.direction,
            target.x, target.y, target.direction, curDist
        );
        AirCombatRL.applyReward(unit.id, curDist, false, false,
            prevAspect === '後方', prevArc, prevAspect);

        // ── スコアリング定数（ここを変えるとAIの傾向が変わる） ──
        // 固定マップ（朝鮮シナリオ等）ではターン数が短いので攻撃的に
        let isSmallMap = (window.AI && window.AI.mapMaxC !== undefined && window.AI.mapMaxC <= 30 && window.AI.mapMaxR !== undefined && window.AI.mapMaxR <= 30);
        const PT = {
            REAR:          isSmallMap ? 400 : 200,   // 後方射界に入る（後攻取得、最重要）
            REAR_SIDE:     isSmallMap ? 150 :  70,   // 後方側面に入る
            FRONT_ARC:     isSmallMap ?  80 :  30,   // 前方射界（まず向く）
            DIST_CLOSE:    isSmallMap ?  60 :  20,   // 1ヘクス接近ごと
            ALT_PENALTY:     8,   // 高度差1につきマイナス
            ALT_CEILING:    25,   // 高度35以上ペナルティ係数
            ROLE_SPREAD:    50,   // 役割に沿った位置取り
            BREAK_AWAY:     80,   // ぐるぐる回り脱出
            RE_ENGAGE:     isSmallMap ? 500 : 300,   // 敵方向への旋回（近距離×3倍）
        };

        let candidates = [];

        // ── 端5ヘクス以内+端向き → 直進(c=2)禁止フラグ ──
        let uEdgeMaxC = (window.AI && window.AI.mapMaxC !== undefined) ? window.AI.mapMaxC : 27;
        let uEdgeMaxR = (window.AI && window.AI.mapMaxR !== undefined) ? window.AI.mapMaxR : 53;
        let uDLeft = unit.x, uDRight = uEdgeMaxC - unit.x;
        let uDTop = unit.y, uDBot = uEdgeMaxR - unit.y;
        let uEdgeDist = Math.min(uDLeft, uDRight, uDTop, uDBot);
        let uDirDeg = this.DIR_ANGLES[unit.direction] || 0;
        let forceEdgeTurn = false;
        if (uEdgeDist <= 5) {
            if (uDRight <= 5 && uDirDeg > -90 && uDirDeg < 90) forceEdgeTurn = true;
            if (uDLeft  <= 5 && (uDirDeg > 90 || uDirDeg < -90)) forceEdgeTurn = true;
            if (uDBot   <= 5 && uDirDeg > 0 && uDirDeg < 180) forceEdgeTurn = true;
            if (uDTop   <= 5 && uDirDeg < 0 && uDirDeg > -180) forceEdgeTurn = true;
        }

        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                if (Math.abs(dr) + Math.abs(dc) > 2) continue;
                let r = unit.startRow + dr;
                let c = unit.startCol + dc;
                if (r < 0 || r > 4 || c < 0 || c > 4) continue;
                // 端向き時は直進(c=2)を完全禁止 → 旋回のみ許可
                if (forceEdgeTurn && c === 2) continue;
                if ((unit.damage === '損害あり' || unit.bomb_equipped) && (r < 1 || r > 3 || c < 1 || c > 3)) continue;
                if (unit.altitude >= 40 && r === 0) continue;

                let cmds = this.generateAllValidCommands(unit, r, c);
                if (cmds.length === 0) continue;

                // ターン方向を優先したベースコマンドを選択
                const _tc = (c === 0 || c === 1) ? '4' : (c === 3 || c === 4) ? '6' : null;
                let baseCmd = (_tc ? (cmds.find(x => x.includes(_tc)) || cmds[0]) : cmds[0]);

                // ラテラルロール候補を追加（c=2 のとき 1/3 コマンドを別候補として評価）
                let variants = [{ cmd: baseCmd, suffix: '' }];
                if (c === 2) {
                    let lL = cmds.find(x => /^[28]*1/.test(x));
                    let lR = cmds.find(x => /^[28]*3/.test(x));
                    if (lL) variants.push({ cmd: lL, suffix: '_LL' });
                    if (lR) variants.push({ cmd: lR, suffix: '_LR' });
                }

                for (let vt of variants) {
                    let sim = this.applyMove(unit, { r, c, cmd: vt.cmd });
                    if (sim.alt > 40 || sim.alt < 1 || sim.isOffMap) continue;

                    let actionKey = `r${r}c${c}${vt.suffix}`;
                    let qVal = AirCombatRL.get(state, actionKey) || AirCombatRL.get(state, `r${r}c${c}`);

                    let newDist = this.getHexDistance(sim.x, sim.y, target.x, target.y);
                    let altDiff = Math.abs(sim.altitude - target.altitude);
                    let { arc, aspect } = this.getArcAndAspect(
                        sim.x, sim.y, sim.dir,
                        target.x, target.y, target.direction, newDist
                    );

                    // ── ヒューリスティックスコア ──
                    let hScore = 0;

                    // ★★ 射撃可能判定: この位置から実際に撃てるなら最大ボーナス ★★
                    if (arc === '前方') {
                        // GUN: dist≤2, altDiff≤1, aspect=後方/後方側面/前方
                        if (unit.gun > 0 && newDist <= 2 && altDiff <= 1 &&
                            (aspect === '後方' || aspect === '後方側面' || aspect === '前方')) {
                            hScore += 2000;
                        }
                        // HS: aspect=後方, altDiff≤2
                        if (unit.missiles && unit.missiles.hs > 0 && aspect === '後方' && altDiff <= 2 && newDist >= 1) {
                            hScore += 1500;
                        }
                        // RH: dist≥4, altDiff≤3 (非ソ連のみ)
                        if (unit.team !== 'Red' && unit.missiles && unit.missiles.rh > 0 && newDist >= 4 && altDiff <= 3) {
                            hScore += 1200;
                        }
                    }

                    // 後攻取得が最重要評価軸（射界はルール通り±30°で判定済み）
                    if      (arc === '前方' && aspect === '後方')      hScore += PT.REAR;
                    else if (arc === '前方' && aspect === '後方側面')  hScore += PT.REAR_SIDE;
                    else if (arc === '前方')                           hScore += PT.FRONT_ARC;
                    // 前方側面にいても敵の方を向いている→射撃位置に向かうインセンティブ
                    else if (arc === '前方側面')                        hScore += PT.FRONT_ARC / 2;

                    // ── 敵が前方にいない場合、敵方向への旋回にボーナス ──
                    if (arc !== '前方') {
                        let simDirDeg = this.DIR_ANGLES[sim.dir] || 0;
                        let sx = sim.x * 37.5, sy = sim.y * 43.301 + (sim.x % 2) * 21.650;
                        let tx = target.x * 37.5, ty = target.y * 43.301 + (target.x % 2) * 21.650;
                        let angleToEnemy = Math.atan2(ty - sy, tx - sx) * 180 / Math.PI;
                        let headingDiff = Math.abs(((angleToEnemy - simDirDeg + 540) % 360) - 180);
                        // headingDiff: 0°=敵の方向, 180°=背中向き
                        // 近距離(≤6)では旋回ボーナスを大幅強化（ドッグファイト優先）
                        let engageBonus = PT.RE_ENGAGE;
                        if (newDist <= 6) engageBonus = PT.RE_ENGAGE * 3;
                        if (headingDiff < 120) {
                            hScore += engageBonus * (1 - headingDiff / 120);
                        }
                        // 旋回中は距離増加ペナルティを完全キャンセル
                        if (curDist - newDist < 0) {
                            hScore += Math.abs(curDist - newDist) * PT.DIST_CLOSE;
                        }
                    }

                    // 距離調整（補助）
                    hScore += (curDist - newDist) * PT.DIST_CLOSE;

                    // 高度差ペナルティ
                    hScore -= altDiff * PT.ALT_PENALTY;

                    // ── 挟撃役割別スコアリング ──
                    if (role === 'pincer_front') {
                        // 正面担当: まっすぐ敵に突っ込んで旋回を強制する
                        hScore += (curDist - newDist) * 80;  // 距離詰めを強化
                        if (arc === '前方') hScore += 100;
                        // 高度は敵と同じか少し下（正面から圧力をかける）
                        if (altDiff <= 2) hScore += 50;
                    } else if (role === 'pincer_rear') {
                        // 後方担当: frontとは違う方向から回り込んで尻を取る
                        // ★距離ペナルティを打ち消す（迂回を許容）
                        if (newDist > curDist) {
                            hScore += (newDist - curDist) * PT.DIST_CLOSE; // 距離増ペナルティ相殺
                        }
                        // ★高度優位: 敵より高い位置を取る（急降下攻撃の準備）
                        let altAdv = sim.altitude - target.altitude;
                        if (altAdv >= 3 && altAdv <= 8) hScore += 300;  // 高度優位
                        else if (altAdv >= 1) hScore += 150;
                        // ★射撃位置に入れたら最大ボーナス
                        if (arc === '前方' && aspect === '後方') hScore += 800;
                        else if (arc === '前方' && aspect === '後方側面') hScore += 500;
                        else if (arc === '前方') hScore += 200;
                        // ★frontとの角度差（挟撃の核心）
                        let frontUnit = myUnits.find(u => u.id !== unit.id &&
                            this.getSovietRole(u, myUnits) === 'pincer_front');
                        if (frontUnit) {
                            let sx = sim.x * 37.5, sy = sim.y * 43.301 + (sim.x % 2) * 21.650;
                            let fx = frontUnit.x * 37.5, fy = frontUnit.y * 43.301 + (frontUnit.x % 2) * 21.650;
                            let etx = target.x * 37.5, ety = target.y * 43.301 + (target.x % 2) * 21.650;
                            let myAng = Math.atan2(sy - ety, sx - etx) * 180 / Math.PI;
                            let hisAng = Math.atan2(fy - ety, fx - etx) * 180 / Math.PI;
                            let angleDiff = Math.abs(myAng - hisAng);
                            if (angleDiff > 180) angleDiff = 360 - angleDiff;
                            // 90°以上離れていれば挟めている
                            if (angleDiff >= 120) hScore += 400;
                            else if (angleDiff >= 90) hScore += 250;
                            else if (angleDiff >= 60) hScore += 100;
                            // frontと同じ方向にいるなら罰則（同じ方向に突っ込むな）
                            if (angleDiff < 30) hScore -= 300;
                        }
                    } else {
                        // solo: 高度差も考慮
                        hScore -= altDiff * 3;
                    }

                    // ぐるぐる回り対策：大きく位置・高度を変える手にボーナス
                    if (isCircling) {
                        let posDelta = Math.abs(newDist - curDist);
                        let altDelta = Math.abs(sim.altitude - unit.altitude);
                        if (posDelta >= 3 || altDelta >= 2) hScore += PT.BREAK_AWAY;
                    }

                    // 高度上限ペナルティ
                    if (sim.altitude > 35) hScore -= (sim.altitude - 35) * PT.ALT_CEILING;

                    // マップ端ペナルティ（端5ヘクス以内: 位置+方向で判定）
                    let edgeMaxC = (window.AI && window.AI.mapMaxC !== undefined) ? window.AI.mapMaxC : 27;
                    let edgeMaxR = (window.AI && window.AI.mapMaxR !== undefined) ? window.AI.mapMaxR : 53;
                    let dLeft = sim.x, dRight = edgeMaxC - sim.x;
                    let dTop = sim.y, dBot = edgeMaxR - sim.y;
                    let edgeDist = Math.min(dLeft, dRight, dTop, dBot);
                    // 方向角度（度）: 右=0~60, 下=60~150, 左=150~210, 上=210~330
                    let dirDeg = this.DIR_ANGLES[sim.dir] || 0;
                    // 各辺に向かっているか判定
                    let facingEdge = false;
                    if (dRight <= 5 && dirDeg > -90 && dirDeg < 90)   facingEdge = true;  // 右端で右向き
                    if (dLeft  <= 5 && (dirDeg > 90 || dirDeg < -90)) facingEdge = true;  // 左端で左向き
                    if (dBot   <= 5 && dirDeg > 0 && dirDeg < 180)    facingEdge = true;  // 下端で下向き
                    if (dTop   <= 5 && dirDeg < 0 && dirDeg > -180)   facingEdge = true;  // 上端で上向き

                    if (edgeDist <= 0) hScore -= 99999;
                    else if (edgeDist <= 5) {
                      // 端に入ること自体を事実上禁止（距離が近いほど致命的）
                      // dist1=-5000, dist2=-4000, dist3=-3000, dist4=-2000, dist5=-1000
                      hScore -= (6 - edgeDist) * 1000;
                      // 外側を向いていれば更に致命的
                      if (facingEdge) hScore -= 10000;
                    }

                    // Q値の重み（全マップ共通）
                    let qWeight = 2;
                    // ε-greedy: 15%でランダム探索
                    let finalScore = qVal * qWeight + hScore + (Math.random() < 0.15 ? Math.random() * 40 : 0);

                    candidates.push({ r, c, cmd: vt.cmd, actionKey, finalScore, newDist });
                }
            }
        }

        if (candidates.length === 0) {
            // 全候補がマップ外 → 反転して直進を試みる
            return { r: unit.cursorRow, c: 2, cmd: '75' };
        }

        candidates.sort((a, b) => b.finalScore - a.finalScore);
        let best = candidates[0];

        // デバッグ: 移動決定の詳細ログ
        let { arc: dbgArc } = this.getArcAndAspect(unit.x, unit.y, unit.direction, target.x, target.y, target.direction, curDist);
        console.log(`[AI_MOVE] ${unit.id} pos:(${unit.x},${unit.y}) dir:${unit.direction} alt:${unit.altitude} role:${role} → target:(${target.x},${target.y}) dist:${curDist} arc:${dbgArc} forceEdgeTurn:${forceEdgeTurn} best:r${best.r}c${best.c} score:${best.finalScore.toFixed(0)} candidates:${candidates.length} top3:[${candidates.slice(0,3).map(c=>`r${c.r}c${c.c}=${c.finalScore.toFixed(0)}`).join(', ')}]`);

        // 次ターンの報酬計算用に記録
        AirCombatRL.recordStep(unit.id, state, best.actionKey, curDist);
        // 後方アスペクトを記録（次ターンの報酬判定用）
        let bestSim = this.applyMove(unit, { r: best.r, c: best.c, cmd: best.cmd });
        let bestDist = this.getHexDistance(bestSim.x, bestSim.y, target.x, target.y);
        let { aspect: bestAspect } = this.getArcAndAspect(
            bestSim.x, bestSim.y, bestSim.dir,
            target.x, target.y, target.direction, bestDist
        );
        unit._prevAspect = { aspect: bestAspect };

        return { r: best.r, c: best.c, cmd: best.cmd };
    },

    // ===== ソ連AI専用：グループターゲット選択（decideAttackで使用） =====
    selectGroupTarget: function(myUnits, enemyUnits) {
        if (enemyUnits.length === 0) return null;
        let damaged = enemyUnits.filter(e => e.damage === '損傷あり' || e.damage === '損害あり');
        let candidates = damaged.length > 0 ? damaged : enemyUnits;
        let avgX = myUnits.reduce((s, u) => s + u.x, 0) / myUnits.length;
        let avgY = myUnits.reduce((s, u) => s + u.y, 0) / myUnits.length;
        let best = null, bestDist = Infinity;
        for (let e of candidates) {
            let d = Math.hypot(e.x - avgX, e.y - avgY);
            if (d < bestDist) { bestDist = d; best = e; }
        }
        return best;
    },

    // ===== グループ目標割り当て =====
    // 味方が敵より多い場合、インデックスで担当敵を分散する
    // 例：味方4機 vs 敵2機 → 0,1番目が敵A / 2,3番目が敵B
    assignGroupTarget: function(unit, myUnits, enemyUnits) {
        if (enemyUnits.length === 0) return null;
        if (enemyUnits.length === 1) return enemyUnits[0];

        // 損傷済みの敵を優先リストの先頭に
        let sorted = [...enemyUnits].sort((a, b) => {
            let aD = (a.damage === '損害あり' || a.damage === '損傷あり') ? 1 : 0;
            let bD = (b.damage === '損害あり' || b.damage === '損傷あり') ? 1 : 0;
            return bD - aD;
        });

        let allies = [...myUnits].sort((a, b) => a.id.localeCompare(b.id));
        let myIdx = allies.findIndex(u => u.id === unit.id);
        if (myIdx < 0) myIdx = 0;

        // 均等分散：ceil(味方数 / 敵数) 機ずつ担当
        let perEnemy = Math.ceil(allies.length / sorted.length);
        let targetIdx = Math.floor(myIdx / perEnemy) % sorted.length;
        return sorted[targetIdx];
    },

    // ===== 挟撃役割割り当て（Python train_air.py PINCER戦術と同一） =====
    // 同じ敵を担当する味方が2機以上いる場合:
    //   最も近い1機 → pincer_front（正面から追って旋回を強制）
    //   残り       → pincer_rear（後方から回り込んで尻を取る）
    // 1機だけなら solo
    getSovietRole: function(unit, myUnits) {
        // この機体と同じターゲットを担当する味方を探す
        let validEnemies = (typeof units !== 'undefined')
            ? units.filter(u => u.team !== unit.team && u.status !== 'destroyed') : [];
        if (validEnemies.length === 0) return 'solo';
        let myTarget = this.assignGroupTarget(unit, myUnits, validEnemies);
        if (!myTarget) return 'solo';

        // 同じターゲット担当の味方リスト
        let sameTarget = myUnits.filter(u => {
            let t = this.assignGroupTarget(u, myUnits, validEnemies);
            return t && t.id === myTarget.id;
        });
        if (sameTarget.length <= 1) return 'solo';

        // 最も敵に近い機体が正面担当、残りが後方担当
        sameTarget.sort((a, b) => {
            let da = this.getHexDistance(a.x, a.y, myTarget.x, myTarget.y);
            let db = this.getHexDistance(b.x, b.y, myTarget.x, myTarget.y);
            return da - db;
        });
        return (sameTarget[0].id === unit.id) ? 'pincer_front' : 'pincer_rear';
    },

    // ===== ソ連AI専用：回避行動 =====
    decideEvasion: function(unit, locker) {
        // ロッカーの前方から外れるように急旋回 or 高度変更
        let candidates = [];
        // 急旋回（col=0または4）＋高度変更（row=0急上昇 or row=4急降下）を優先候補に
        const evasionMoves = [
            { dr: -1, dc: -2 }, { dr: -1, dc: 2 },  // 急旋回＋上昇
            { dr: 1,  dc: -2 }, { dr: 1,  dc: 2 },  // 急旋回＋降下
            { dr: -2, dc: 0  }, { dr: 2,  dc: 0  },  // 急上昇・急降下
            { dr: 0,  dc: -2 }, { dr: 0,  dc: 2  },  // 急旋回のみ
        ];
        let bestEvade = null, bestScore = -Infinity;
        for (let mv of evasionMoves) {
            let r = unit.startRow + mv.dr;
            let c = unit.startCol + mv.dc;
            if (r < 0 || r > 4 || c < 0 || c > 4) continue;
            if ((unit.damage === '損害あり' || unit.bomb_equipped) && (r < 1 || r > 3 || c < 1 || c > 3)) continue;
            let cmds = this.generateAllValidCommands(unit, r, c);
            if (cmds.length === 0) continue;
            const _tc2 = (c === 0 || c === 1) ? '4' : (c === 3 || c === 4) ? '6' : null;
            let cmd = (_tc2 ? (cmds.find(x => x.includes(_tc2)) || cmds[0]) : cmds[0]);
            let sim = this.applyMove(unit, { r, c, cmd });
            // ロッカーの前方から外れているほど高スコア
            let dist = this.getHexDistance(sim.x, sim.y, locker.x, locker.y);
            let { arc } = this.getArcAndAspect(locker.x, locker.y, locker.dir || locker.direction, sim.x, sim.y, sim.dir, dist);
            let score = (arc !== '前方' ? 1000 : 0) + dist * 10;
            if (score > bestScore) { bestScore = score; bestEvade = { r, c, cmd }; }
        }
        return bestEvade;
    },

    // ==========================================
    // ==========================================
    // 仮移動：unitの状態を複製してmoveを適用
    applyMove: function(unit, move) {
        let sim = this.simulatePosition(unit, move.cmd, move.r, move.c);
        return {
            id: unit.id, aircraft: unit.aircraft, team: unit.team,
            x: sim.c, y: sim.r, dir: sim.dir, direction: sim.dir,
            altitude: sim.alt, status: unit.status, damage: unit.damage,
            gun: unit.gun, gunType: unit.gunType,
            missiles: { hs: unit.missiles.hs, rh: unit.missiles.rh },
            missileType: unit.missileType,
            lockOnTargetId: unit.lockOnTargetId,
            rhMissileInFlight: unit.rhMissileInFlight,
            startRow: move.r, startCol: move.c,
            cursorRow: move.r, cursorCol: move.c, prevRow: move.r,
            stepsSinceLastTurn: sim.finalSteps || 0,
            bomb_equipped: unit.bomb_equipped
        };
    },

    shallowCopyUnit: function(u) {
        return Object.assign({}, u, { missiles: { hs: u.missiles.hs, rh: u.missiles.rh } });
    },

    // ==========================================
    // 以下、元のロジック（変更なし）
    // ==========================================
    generateAllValidCommands: function(unit, r, c) {
        let speeds = window.planeData[unit.aircraft].speed[r][c].toString().split('/').map(Number);
        let maxTurns = Math.max(...window.planeData[unit.aircraft].turn[r][c].toString().split('/').map(Number)) || 0;
        let altStr = window.planeData[unit.aircraft].alt[r][c].toString();

        // 高度オプションを全段階展開（"-1/-4" → [-1,-2,-3,-4]）
        let altParts = altStr.split('/').map(Number);
        let altOptions = [];
        if (altParts.length === 1) {
            altOptions = altParts;
        } else {
            let a = altParts[0], b = altParts[altParts.length - 1];
            let step = a < b ? 1 : -1;
            for (let v = a; v !== b + step; v += step) altOptions.push(v);
        }
        let altNum = altOptions[0]; // デフォルトは最初の値（後でループ）

        let allowedTurn = null;
        if (c === 0 || c === 1) allowedTurn = '4';
        if (c === 3 || c === 4) allowedTurn = '6';

        let canLateral = (c === 2) && (r === 2 || r === 3);
        let canImmelmann = (unit.prevRow === 0) && (r === 0) && (c >= 1 && c <= 3);
        let canSplitS = (unit.prevRow === 4) && (r === 4) && (c >= 1 && c <= 3);

        let cmds = [];
        for (let altNum of altOptions) {
            let altCmds = "";
            if (altNum > 0) altCmds = "8".repeat(altNum);
            if (altNum < 0) altCmds = "2".repeat(-altNum);

            for (let speed of speeds) {
                let queue = [{ str: "", speedLeft: speed, turnsLeft: maxTurns, stepsSinceTurn: unit.stepsSinceLastTurn }];
                let validBaseCmds = [];
                while (queue.length > 0) {
                    let curr = queue.shift();
                    if (curr.speedLeft === 0) { validBaseCmds.push(curr.str); continue; }
                    queue.push({ str: curr.str + "5", speedLeft: curr.speedLeft - 1, turnsLeft: curr.turnsLeft, stepsSinceTurn: curr.stepsSinceTurn + 1 });
                    if (allowedTurn && curr.turnsLeft > 0 && curr.stepsSinceTurn >= 1) {
                        queue.push({ str: curr.str + allowedTurn, speedLeft: curr.speedLeft, turnsLeft: curr.turnsLeft - 1, stepsSinceTurn: 0 });
                    }
                }
                for (let base of validBaseCmds) {
                    cmds.push(altCmds + base);
                    if (canLateral && base.length > 0 && base[0] === '5') {
                        cmds.push(altCmds + "1" + base.substring(1));
                        cmds.push(altCmds + "3" + base.substring(1));
                    }
                    if (canImmelmann) cmds.push(altCmds + base + "9");
                    if (canSplitS) cmds.push(altCmds + base + "7");
                }
            }
        }
        return [...new Set(cmds)];
    },

    simulatePosition: function(unit, cmd, r, c) {
        let currentDirIdx = this.DIR_ORDER.indexOf(unit.direction);
        if (currentDirIdx === -1) currentDirIdx = 0;
        const hexSize = 25;
        const hStep = 1.5 * hexSize;
        const vStep = Math.sqrt(3) * hexSize;
        const moveDist = Math.sqrt(3) * hexSize;
        let cx = unit.x * hStep;
        let cy = unit.y * vStep + (unit.x % 2) * (vStep / 2);
        let isOffMap = false;
        let stepsSinceLastTurn = unit.stepsSinceLastTurn || 0;

        for (let char of cmd) {
            if (char === '4') { currentDirIdx = (currentDirIdx + 5) % 6; stepsSinceLastTurn = 0; }
            else if (char === '6') { currentDirIdx = (currentDirIdx + 1) % 6; stepsSinceLastTurn = 0; }
            else if (char === '1') { currentDirIdx = (currentDirIdx + 5) % 6; cx += moveDist * Math.cos(Math.PI / 180 * this.DIR_ANGLES[this.DIR_ORDER[currentDirIdx]]); cy += moveDist * Math.sin(Math.PI / 180 * this.DIR_ANGLES[this.DIR_ORDER[currentDirIdx]]); stepsSinceLastTurn++; }
            else if (char === '3') { currentDirIdx = (currentDirIdx + 1) % 6; cx += moveDist * Math.cos(Math.PI / 180 * this.DIR_ANGLES[this.DIR_ORDER[currentDirIdx]]); cy += moveDist * Math.sin(Math.PI / 180 * this.DIR_ANGLES[this.DIR_ORDER[currentDirIdx]]); stepsSinceLastTurn++; }
            else if (char === '7' || char === '9') { currentDirIdx = (currentDirIdx + 3) % 6; }
            else if (char === '5') { cx += moveDist * Math.cos(Math.PI / 180 * this.DIR_ANGLES[this.DIR_ORDER[currentDirIdx]]); cy += moveDist * Math.sin(Math.PI / 180 * this.DIR_ANGLES[this.DIR_ORDER[currentDirIdx]]); stepsSinceLastTurn++; }
            let bMaxC = (window.AI && window.AI.mapMaxC !== undefined) ? window.AI.mapMaxC : 27;
            let bMaxR = (window.AI && window.AI.mapMaxR !== undefined) ? window.AI.mapMaxR : 53;
            if (cx < -10 || cx > bMaxC * hStep + 10 || cy < -10 || cy > bMaxR * vStep + 10) isOffMap = true;
        }

        let maxC = (window.AI && window.AI.mapMaxC !== undefined) ? window.AI.mapMaxC : 27;
        let maxR = (window.AI && window.AI.mapMaxR !== undefined) ? window.AI.mapMaxR : 53;
        let simHex = this.snapToHex(cx, cy);
        if (simHex.c < 0 || simHex.c > maxC || simHex.r < 0 || simHex.r > maxR) isOffMap = true;
        let altChange = parseInt(window.planeData[unit.aircraft].alt[r][c]) || 0;

        return { c: simHex.c, r: simHex.r, dir: this.DIR_ORDER[currentDirIdx], alt: unit.altitude + altChange, isOffMap, finalSteps: stepsSinceLastTurn };
    },

    evaluateRulesStrict: function(unit, sim, enemies, isDefenseMode, hasWeapons) {
        if (!hasWeapons && sim.isOffMap) return { priority: 100, tiebreaker: 0 };

        // 高度上限超えは最低評価
        if (sim.alt > 40) return { priority: -5, tiebreaker: -(sim.alt - 40) * 100 };

        if (isDefenseMode) {
            let isSafe = true;
            for (let target of enemies) {
                let dist = this.getHexDistance(sim.c, sim.r, target.x, target.y);
                let altDiff = Math.abs(sim.alt - target.altitude);
                let { arc: eArcSim } = this.getArcAndAspect(target.x, target.y, target.direction, sim.c, sim.r, sim.dir, dist);
                if (eArcSim === "前方" && altDiff < 4) isSafe = false;
            }
            return { priority: isSafe ? 50 : -10, tiebreaker: 0 };
        }

        let bestPriority = -1, bestTiebreaker = -Infinity;
        let mType = unit.missileType || (window.PLANE_CHART_TYPE[unit.aircraft] || '');

        for (let target of enemies) {
            let dist = this.getHexDistance(sim.c, sim.r, target.x, target.y);
            let altDiff = Math.abs(sim.alt - target.altitude);
            let { arc, aspect } = this.getArcAndAspect(sim.c, sim.r, sim.dir, target.x, target.y, target.direction, dist);
            let p = -1, tb = 0;

            // RH飛翔中：前方維持が最優先
            if (unit.rhMissileInFlight && unit.rhMissileInFlight.targetId === target.id) {
                if (arc === "前方") { p = 15; tb = -(altDiff * 100) - dist; }
                else { p = -3; tb = 0; }
                if (p > bestPriority || (p === bestPriority && tb > bestTiebreaker)) {
                    bestPriority = p; bestTiebreaker = tb;
                }
                continue;
            }

            // 機関砲：dist0〜1、後方・後方側面のみ
            if (unit.gun > 0 && altDiff <= 1 && arc === "前方" && dist <= 1 && (aspect === "後方" || aspect === "後方側面")) {
                if (dist === 0 && aspect === "後方") { p = 11; tb = 0; }
                else if (dist === 0 && aspect === "後方側面") { p = 10; tb = 0; }
                else if (dist === 1 && aspect === "後方") { p = 9; tb = 0; }
                else if (dist === 1 && aspect === "後方側面") { p = 8; tb = 0; }
            }
            if (p === -1 && unit.gun > 0 && unit.missiles.hs === 0 && unit.missiles.rh === 0) {
                if (arc === "前方" && (aspect === "後方" || aspect === "後方側面") && dist <= 1) { p = 6.5; tb = -dist; }
            }

            // HSミサイル：命中率+最適距離
            if (p === -1 && unit.missiles.hs > 0 && arc === "前方" && aspect === "後方" && altDiff <= 2) {
                let hsHit = this.getMissileTargetValue('HS', mType, dist);
                if (hsHit >= 3) {
                    let bestDist = this.findBestHsDistance(mType);
                    let distPenalty = Math.abs(dist - bestDist);
                    p = 6; tb = hsHit * 100 - distPenalty * 10;
                } else if (hsHit > 0) {
                    p = 5; tb = hsHit * 100;
                }
            }

            // RHミサイル：命中率10%以上
            if (p === -1 && unit.missiles.rh > 0 && arc === "前方" && altDiff <= 3) {
                let rhHit = this.getMissileTargetValue('RH', mType, dist);
                if (rhHit >= 3) { p = 4; tb = rhHit * 100; }
            }

            // 接近・位置取り
            if (p === -1) {
                let altAdv = sim.alt - target.altitude;
                let altBonus = (altAdv > 0 && altAdv <= 5) ? 50 : 0;
                p = 1; tb = -(dist * 1000) + altBonus;
            }

            if (p > bestPriority || (p === bestPriority && tb > bestTiebreaker)) {
                bestPriority = p; bestTiebreaker = tb;
            }
        }
        return { priority: bestPriority, tiebreaker: bestTiebreaker };
    },

    snapToHex: function(cx, cy) {
        const hStep = 1.5 * 25, vStep = Math.sqrt(3) * 25;
        let maxC = (window.AI && window.AI.mapMaxC !== undefined) ? window.AI.mapMaxC : 27;
        let maxR = (window.AI && window.AI.mapMaxR !== undefined) ? window.AI.mapMaxR : 53;
        let cD = Infinity, cH = {c: 0, r: 0};
        let c0 = Math.max(0, Math.min(maxC, Math.round(cx / hStep)));
        for (let c = Math.max(0, c0 - 2); c <= Math.min(maxC, c0 + 2); c++) {
            let r0 = Math.max(0, Math.min(maxR, Math.round((cy - (c % 2) * (vStep / 2)) / vStep)));
            for (let r = Math.max(0, r0 - 2); r <= Math.min(maxR, r0 + 2); r++) {
                let hx = c * hStep, hy = r * vStep + (c % 2) * (vStep / 2);
                let d = Math.hypot(cx - hx, cy - hy);
                if (d < cD) { cD = d; cH = {c, r}; }
            }
        }
        return cH;
    },

    simulateBestHitChance: function(unit, dist, altDiff, aspect, target) {
        if (!window.COMBAT_CHARTS) return 0;
        let best = 0;
        let nation = window.PLANE_CHART_TYPE[unit.aircraft] || (unit.team === 'Red' ? 'ソ連' : '米国後期');
        let mType = unit.missileType || nation;

        if (unit.gun > 0 && altDiff <= 1 && dist >= 0 && dist <= 2) {
            let val = 0;
            if (aspect === "前方" || aspect === "後方" || aspect === "後方側面") {
                val = window.COMBAT_CHARTS.GUN[unit.gunType || "A"]?.[aspect]?.[dist] || 0;
            }
            if (val > best) best = val;
        }

        if (unit.missiles && unit.missiles.hs > 0 && altDiff <= 2 && aspect === "後方") {
            let hsChart = window.COMBAT_CHARTS.HS[mType];
            if (hsChart) {
                let val = this.getMissileTargetValue('HS', mType, dist);
                if (val > best) best = val;
            }
        }

        if (unit.missiles && unit.missiles.rh > 0 && altDiff <= 3) {
            let val = this.getMissileTargetValue('RH', mType, dist);
            if (val > best) best = val;
        }

        return best;
    },

    decideAttack: function(unit, enemies) {
        if (!unit || !enemies || enemies.length === 0) return { type: 'SKIP' };
        let best = { type: 'SKIP', score: -1 };
        let valid = enemies.filter(e => e.status !== 'destroyed');
        let nation = window.PLANE_CHART_TYPE[unit.aircraft] || (unit.team === 'Red' ? 'ソ連' : '米国後期');
        // missileTypeが未設定の場合はCOMBAT_CHARTSのHSキーから自動検出
        let mType = unit.missileType || nation;
        if (window.COMBAT_CHARTS && window.COMBAT_CHARTS.HS && !window.COMBAT_CHARTS.HS[mType]) {
            // 一致するキーを探す
            let keys = Object.keys(window.COMBAT_CHARTS.HS);
            let found = keys.find(k => nation.includes(k) || k.includes(nation));
            if (found) mType = found;
            else if (keys.length > 0) mType = keys[0]; // 最終フォールバック
        }
        let isSoviet = (unit.team === 'Red');

        // ソ連はグループターゲットを優先
        if (isSoviet) {
            let allUnits = (typeof units !== 'undefined') ? units : [unit];
            let myUnits = allUnits.filter(u => u.team === unit.team && u.status !== 'destroyed');
            let groupTarget = this.selectGroupTarget(myUnits, valid);
            if (groupTarget) valid = [groupTarget, ...valid.filter(e => e.id !== groupTarget.id)];
        }

        for (let target of valid) {
            let dist = this.getHexDistance(unit.x, unit.y, target.x, target.y);
            let altDiff = Math.abs(unit.altitude - target.altitude);
            let { arc, aspect } = this.getArcAndAspect(unit.x, unit.y, unit.direction, target.x, target.y, target.direction, dist);
            if (arc !== "前方") continue;

            // 機関砲：dist0〜2、後方・後方側面・前方
            if (unit.gun > 0 && altDiff <= 1 && dist <= 2 && (aspect === "後方" || aspect === "後方側面" || aspect === "前方")) {
                let val = window.COMBAT_CHARTS.GUN[unit.gunType || "A"]?.[aspect]?.[dist] || 0;
                if (val > best.score) best = { type: 'GUN', targetId: target.id, dist, aspect, score: val };
            }

            // HSミサイル：後方のみ（dist>=1、dist=0後方側面は不可）
            if (unit.missiles.hs > 0 && altDiff <= 2 && aspect === "後方" && arc === "前方" && dist >= 1) {
                let val = this.getMissileTargetValue('HS', mType, dist);
                if (val >= 3 && val > best.score) best = { type: 'HS', targetId: target.id, dist, aspect, score: val };
            }

            // RHミサイル：ソ連はスキップ
            let rhOnlyTarget = !unit._rhFirstDone && unit._rhTarget && valid.some(e => e.id === unit._rhTarget) && target.id !== unit._rhTarget;
            if (!isSoviet && !rhOnlyTarget && unit.missiles.rh > 0 && altDiff <= 3 && dist >= 4) {
                let val = this.getMissileTargetValue('RH', mType, dist);
                if (val >= 3) {
                    if (!unit.lockOnTargetId) {
                        if (val > best.score) best = { type: 'RH_LOCK', targetId: target.id, score: val };
                    } else if (unit.lockOnTargetId === target.id) {
                        let headOnNear = this.headOn(aspect) && dist < 10 && dist >= 7 && unit._rhWait !== target.id;
                        if (headOnNear) unit._rhWait = target.id;   // 1回だけ待つ（次のターンに遠い位置から撃つ）
                        if (!headOnNear && (!unit.rhMissileInFlight || unit.rhMissileInFlight.targetId !== target.id) && (val >= 7 || (val >= 6 && dist <= 6 && unit.missiles.rh > 1)) && (unit.missiles.rh > 1 || val >= 7)) {
                            if (val > best.score || best.type === 'RH_LOCK') best = { type: 'RH_FIRE', targetId: target.id, score: Math.max(val, best.score) };
                        }
                    }
                }
            }
        }

        // RH が飛んでいる間は、何があっても誘導しきる（機関砲・HS は撃たない。撃つと誘導が切れる）
        if (!isSoviet && unit.rhMissileInFlight && (best.type === 'GUN' || best.type === 'HS')) best = { type: 'SKIP', score: -1 };
        // RH誘導維持：非ソ連のみ
        if (!isSoviet && unit.rhMissileInFlight) {
            let t = valid.find(e => e.id === unit.rhMissileInFlight.targetId);
            if (t) {
                let dist = this.getHexDistance(unit.x, unit.y, t.x, t.y);
                let { arc } = this.getArcAndAspect(unit.x, unit.y, unit.direction, t.x, t.y, t.direction, dist);
                if (arc === "前方") return { type: 'RH_KEEP', targetId: t.id };
            }
        }

        return best;
    },

    getArcAndAspect: function(ax_hex, ay_hex, a_dir, tx_hex, ty_hex, t_dir, dist) {
        let aF = this.DIR_ANGLES[a_dir];
        let tF = this.DIR_ANGLES[t_dir];
        let arc = "範囲外", aspect = "側面";

        if (dist === 0) {
            let diff = Math.abs((aF - tF + 360) % 360);
            if (diff > 180) diff = 360 - diff;
            let rDiff = Math.round(diff);
            arc = (rDiff === 120) ? "範囲外" : "前方";
            if (rDiff === 0) aspect = "後方";
            else if (rDiff === 60) aspect = "後方側面";
            else if (rDiff === 180) aspect = "前方";
            else aspect = "側面";
        } else {
            let ax = ax_hex * 37.5, ay = ay_hex * 43.301 + (ax_hex % 2) * 21.650;
            let tx = tx_hex * 37.5, ty = ty_hex * 43.301 + (tx_hex % 2) * 21.650;
            let angleToTarget = Math.atan2(ty - ay, tx - ax) * 180 / Math.PI;
            let relArc = (angleToTarget - aF + 360) % 360;
            // ゲーム本体と同じ射界区分（ルール準拠、スコアリング用に細分化）
            if (relArc <= 30 || relArc >= 330) arc = "前方";
            else if (relArc > 30 && relArc < 90) arc = "前方側面";
            else if (relArc > 270 && relArc < 330) arc = "前方側面";
            else if (relArc >= 150 && relArc <= 210) arc = "後方";
            else arc = "後方側面";
            let angle = Math.atan2(ay - ty, ax - tx) * 180 / Math.PI;
            let diffAspect = Math.abs((angle - tF + 540) % 360 - 180);
            if (diffAspect < 30) aspect = "前方";
            else if (diffAspect > 150) aspect = "後方";
            else if (diffAspect >= 90) aspect = "後方側面";
            else aspect = "側面";
        }
        return { arc, aspect };
    },

    getHexDistance: function(q1, r1_raw, q2, r2_raw) {
        let r1 = r1_raw - (q1 + (q1 & 1)) / 2;
        let r2 = r2_raw - (q2 + (q2 & 1)) / 2;
        return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
    },

    getMissileTargetValue: function(type, missileType, dist) {
        if (!window.COMBAT_CHARTS || !window.COMBAT_CHARTS[type] || !window.COMBAT_CHARTS[type][missileType]) return 0;
        let row = window.COMBAT_CHARTS[type][missileType];
        for (let key in row) {
            let val = Number(row[key]) || 0;
            if (key.includes('+')) {
                if (dist >= parseInt(key)) return val;
            } else if (key.includes('/')) {
                let parts = key.split('/');
                if (dist >= parseInt(parts[0]) && dist <= parseInt(parts[1])) return val;
            } else {
                if (dist === parseInt(key)) return val;
            }
        }
        return 0;
    }
};

window.AI = AI;