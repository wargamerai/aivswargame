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
            try {
                const raw = localStorage.getItem('aircombat_q');
                this._table = raw ? JSON.parse(raw) : {};
            } catch(e) { this._table = {}; }
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

    applyReward: function(unitId, newDist, fired, hit, gotRear) {
        const prev = this._lastState[unitId];
        const act  = this._lastAction[unitId];
        const oldD = this._lastDist[unitId];
        if (!prev || !act) return;
        let r = 0;
        if (gotRear)         r += 8;   // 後方ポジション取得（最重要）
        if (newDist < oldD)  r += 1;   // 接近（補助）
        else if (newDist > oldD) r -= 1;
        if (newDist <= 4)    r += 2;   // 射程内
        if (fired)           r += 5;   // 攻撃できた
        if (hit)             r += 15;  // 命中
        this.update(prev, act, r, 0);
    }
};

const AI = {
    DIR_ANGLES: {8: -90, 9: -30, 3: 30, 2: 90, 1: 150, 7: -150},
    DIR_ORDER: [8, 9, 3, 2, 1, 7],

    // ==========================================
    // 状態を文字列に変換（Q学習用）
    // ==========================================
    getState: function(unit, enemy) {
        const dist = Math.min(20, Math.round(this.getHexDistance(unit.x, unit.y, enemy.x, enemy.y)));
        const altDiff = Math.max(-5, Math.min(5, Math.round((unit.altitude - enemy.altitude) / 2)));
        const { arc, aspect } = this.getArcAndAspect(
            unit.x, unit.y, unit.direction,
            enemy.x, enemy.y, enemy.direction, dist
        );
        const arcCode = arc === '前方' ? 'F' : 'O';
        const aspCode = aspect === '後方' ? 'R' : aspect === '後方側面' ? 'S' : 'X';
        const hasHS = (unit.missiles && unit.missiles.hs > 0) ? 'H' : 'N';
        const hasRH = (unit.missiles && unit.missiles.rh > 0) ? 'R' : 'N';
        return `d${dist}_a${altDiff}_${arcCode}${aspCode}_${hasHS}${hasRH}`;
    },

    // ==========================================
    // メイン：decideMove
    // グループ戦術・ラテラルロール・後攻スコア対応版
    // ==========================================
    decideMove: function(unit, enemies) {
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

        // ── 前ターンのQ報酬適用（後方ポジション取得を加点） ──
        const { aspect: prevAspect } = unit._prevAspect || { aspect: '' };
        AirCombatRL.applyReward(unit.id, curDist, false, false,
            prevAspect === '後方');

        // ── スコアリング定数（ここを変えるとAIの傾向が変わる） ──
        const PT = {
            REAR:          200,   // 後方射界に入る（後攻取得、最重要）
            REAR_SIDE:      70,   // 後方側面に入る
            FRONT_ARC:      30,   // 前方射界（まず向く）
            DIST_CLOSE:     20,   // 1ヘクス接近ごと
            ALT_PENALTY:     8,   // 高度差1につきマイナス
            ALT_CEILING:    25,   // 高度35以上ペナルティ係数
            ROLE_SPREAD:    50,   // 役割に沿った位置取り
            BREAK_AWAY:     80,   // ぐるぐる回り脱出
        };

        let candidates = [];

        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                if (Math.abs(dr) + Math.abs(dc) > 2) continue;
                let r = unit.startRow + dr;
                let c = unit.startCol + dc;
                if (r < 0 || r > 4 || c < 0 || c > 4) continue;
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

                    // 後攻取得が最重要評価軸
                    if      (arc === '前方' && aspect === '後方')      hScore += PT.REAR;
                    else if (arc === '前方' && aspect === '後方側面')  hScore += PT.REAR_SIDE;
                    else if (arc === '前方')                           hScore += PT.FRONT_ARC;

                    // 距離調整（補助）
                    hScore += (curDist - newDist) * PT.DIST_CLOSE;

                    // 高度差ペナルティ
                    hScore -= altDiff * PT.ALT_PENALTY;

                    // 役割別ボーナス
                    // role 1(左翼)：目標より+3高度・左側から接近
                    // role 2(右翼)：目標より-3高度・右側から接近
                    // role 0(囮)  ：目標正面に飛び込み（高度は目標に合わせる）
                    if (role === 1) {
                        hScore -= Math.abs(sim.altitude - (target.altitude + 3)) * 3;
                        let tRad = this.DIR_ANGLES[target.direction] * Math.PI / 180;
                        let cross = Math.cos(tRad) * (sim.y - target.y) - Math.sin(tRad) * (sim.x - target.x);
                        if (cross > 0) hScore += PT.ROLE_SPREAD;
                    } else if (role === 2) {
                        hScore -= Math.abs(sim.altitude - (target.altitude - 3)) * 3;
                        let tRad = this.DIR_ANGLES[target.direction] * Math.PI / 180;
                        let cross = Math.cos(tRad) * (sim.y - target.y) - Math.sin(tRad) * (sim.x - target.x);
                        if (cross < 0) hScore += PT.ROLE_SPREAD;
                    } else {
                        // role 0 は高度を合わせて正面から引きつける
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

                    // マップ端ペナルティ（端4ヘクス以内で強い減点）
                    let edgeMaxC = (window.AI && window.AI.mapMaxC !== undefined) ? window.AI.mapMaxC : 27;
                    let edgeMaxR = (window.AI && window.AI.mapMaxR !== undefined) ? window.AI.mapMaxR : 53;
                    let edgeDist = Math.min(sim.x, sim.y, edgeMaxC - sim.x, edgeMaxR - sim.y);
                    if (edgeDist <= 0) hScore -= 200;
                    else if (edgeDist <= 1) hScore -= 100;
                    else if (edgeDist <= 2) hScore -= 50;
                    else if (edgeDist <= 4) hScore -= (5 - edgeDist) * 10;

                    // ε-greedy: 15%でランダム探索
                    let finalScore = qVal * 2 + hScore + (Math.random() < 0.15 ? Math.random() * 40 : 0);

                    candidates.push({ r, c, cmd: vt.cmd, actionKey, finalScore, newDist });
                }
            }
        }

        if (candidates.length === 0) {
            return { r: unit.cursorRow, c: 2, cmd: '5' };
        }

        candidates.sort((a, b) => b.finalScore - a.finalScore);
        let best = candidates[0];

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

    // ===== 役割割り当て =====
    // role 0: 囮・正面（直進で引きつける）
    // role 1: 左翼（左から回り込み、高度+3を目指す）
    // role 2: 右翼（右から回り込み、高度-3を目指す）
    getSovietRole: function(unit, myUnits) {
        let sorted = [...myUnits].sort((a, b) => a.id.localeCompare(b.id));
        let idx = sorted.findIndex(u => u.id === unit.id);
        return idx % 3; // 0:囮 1:左翼 2:右翼
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
        for (let c = 0; c <= maxC; c++) {
            for (let r = 0; r <= maxR; r++) {
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
            if (!isSoviet && unit.missiles.rh > 0 && altDiff <= 3 && dist >= 4) {
                let val = this.getMissileTargetValue('RH', mType, dist);
                if (val >= 3) {
                    if (!unit.lockOnTargetId) {
                        if (val > best.score) best = { type: 'RH_LOCK', targetId: target.id, score: val };
                    } else if (unit.lockOnTargetId === target.id) {
                        if (!unit.rhMissileInFlight || unit.rhMissileInFlight.targetId !== target.id) {
                            if (val > best.score) best = { type: 'RH_FIRE', targetId: target.id, score: val };
                        }
                    }
                }
            }
        }

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
            // 前方弧：±30度（真正面のみ、60度幅）
            if (relArc <= 30 || relArc >= 330) arc = "前方";
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