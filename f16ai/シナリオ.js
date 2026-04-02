// ==========================================
// シナリオ.js - CSVキーワード完全解析・汎用配置版
// ==========================================

const rawScenarioCsv = `,,,,,,,,,,機関砲,,,,ミサイル,,,,,
,先行,登場ターン,ソ連,米軍,高度,,map,,turn,米軍,弾数,ソ連,弾数,,,,弾数,,得点
朝鮮半島上空,ソ連,1,Mig-15*2,,10+1d6,友軍は同じ高度,54*28,map中央にランダム配置 友軍3ヘクス以内 同じ向き,15,,,f,4,なし,,なし,,,撃墜三点損害1点　得点の多い方の勝ち
朝鮮半島上空,,1,,F-86*2,10+1d6,友軍は同じ高度,,Mig-15からちょうど8ヘクス離れた位置にランダム配置 友軍3ヘクス以内 同じ向き,,e,10,,,なし,,なし,,，
フリーシナリオ,ソ連,1,,F-4*2,25,固定,54*28,マップ下段から上方向で侵入,25,a*3,,,,HSミサイル,4,RHミサイル,4,米国初期,撃墜三点損害1点　得点の多い方の勝ち
フリーシナリオ,,1,Mig-21*3,,20,固定,,マップ上段から下方向で侵入,,,,b*5,,HSミサイル,2,,,,`;

// CSVの「10+1d6」などの文章からダイスを読み取ってランダム計算
function parseDice(diceStr) {
    if (!diceStr) return 0;
    let match = diceStr.match(/(\d+)\+(\d+)d(\d+)/i);
    if (match) {
        let base = parseInt(match[1], 10);
        let numDice = parseInt(match[2], 10);
        let diceFaces = parseInt(match[3], 10);
        let sum = base;
        for (let i = 0; i < numDice; i++) {
            sum += Math.floor(Math.random() * diceFaces) + 1;
        }
        return sum;
    }
    return parseInt(diceStr, 10) || 0;
}

// CSVの「*4」などから弾数を抽出
function parseWeapon(weaponStr) {
    if (!weaponStr || weaponStr === 'なし') return 0;
    let match = weaponStr.match(/\*(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

// ヘクス座標の厳密な距離計算定規
function getHexDistSetup(q1, r1_raw, q2, r2_raw) {
    let r1 = r1_raw - (q1 + (q1 & 1)) / 2;
    let r2 = r2_raw - (q2 + (q2 & 1)) / 2;
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

// CSVのテキストを読み込んでユニットを自動配置するメイン処理
function setupScenarioUnits(config, createUnit) {
    let scenarioName = config.scenario || '朝鮮半島上空';
    // マップサイズはgameConfigから取得（デフォルトは54×28）
    let mapMaxC = (config.mapMaxC !== undefined) ? config.mapMaxC : 27; // 列 0〜mapMaxC
    let mapMaxR = (config.mapMaxR !== undefined) ? config.mapMaxR : 53; // 行 0〜mapMaxR
    // ソ連軍の機体数オーバーライド
    let redCountOverride = (config.redCount && config.redCount > 0) ? config.redCount : null;
    let lines = rawScenarioCsv.trim().split('\n');
    let units = [];
    let groups = [];

    // SCENARIO_INFOにターン数を登録（初回のみ）
    if (!window.SCENARIO_INFO) window.SCENARIO_INFO = {};
    for (let i = 2; i < lines.length; i++) {
        let cols = lines[i].split(',');
        let name = cols[0] ? cols[0].trim() : '';
        if (!name) continue;
        let turns = parseInt(cols[9], 10);
        if (!isNaN(turns) && turns > 0 && !window.SCENARIO_INFO[name]) {
            let senkoCols = lines[i].split(',');
            let senkoStr = senkoCols[1] ? senkoCols[1].trim() : '';
            let firstTeam = senkoStr === 'ソ連' ? 'Red' : (senkoStr === '米軍' ? 'Blue' : null);
            window.SCENARIO_INFO[name] = { maxTurns: turns, firstTeam: firstTeam };
        }
    }
    
    // フリーシナリオ：カスタム設定があればCSVを無視して直接生成
    if (scenarioName === 'フリーシナリオ' && config.blueConfig && config.redConfig) {
        let customUnits = [];
        let baseX = Math.floor(mapMaxC / 2) - 1 + Math.floor(Math.random() * 4);
        [{cfg: config.blueConfig, team: 'Blue', dir: 8, alt: 25, y: Math.floor(mapMaxR * 0.80)},
         {cfg: config.redConfig,  team: 'Red',  dir: 2, alt: 20, y: Math.floor(mapMaxR * 0.18)}
        ].forEach(function(side) {
            let c = side.cfg;
            for (let i = 0; i < c.count; i++) {
                let u = createUnit(c.aircraft+'-'+(i+1), c.aircraft, side.team,
                    Math.min(mapMaxC, Math.max(0, baseX + i)), side.y, side.dir, side.alt,
                    c.gunAmmo, c.hsCount, c.rhCount, false);
                u.gunType = c.gunRank;
                u.missileType = c.missileType;
                customUnits.push(u);
            }
        });
        return customUnits;
    }

    // 1. CSVデータの文字列を解析し、機体・高度・武装のデータを作る
    for (let i = 2; i < lines.length; i++) {
        let cols = lines[i].split(',');
        if (cols[0] !== scenarioName) continue;

        // 新しいCSVに合わせて列番号をズラして読み取る
        let isSoviet = cols[3] && cols[3].trim() !== ''; 
        let team = isSoviet ? 'Red' : 'Blue';
        let aircraftStr = isSoviet ? cols[3] : cols[4]; 
        if (!aircraftStr) continue;

        let [aircraft, countStr] = aircraftStr.split('*');
        let count = parseInt(countStr || '1', 10);
        // ソ連軍（Red）の機体数をUI入力値で上書き
        if (isSoviet && redCountOverride) count = redCountOverride;

        let altStr = cols[5]; 
        let altRule = cols[6] || ''; 
        let groupAlt = 0;
        
        if (altRule.includes('友軍は同じ高度')) {
            groupAlt = parseDice(altStr);
        }

        // 機関砲のタイプ(A,B,Eなど)と弾数の読み取り
        let gunStr = "";
        let gunAmmo = 0;
        if (isSoviet) {
            gunStr = cols[12] || "";
            if (gunStr.includes('*')) {
                gunAmmo = parseWeapon(gunStr);
                gunStr = gunStr.split('*')[0];
            } else {
                gunAmmo = parseInt(cols[13], 10) || 0;
            }
        } else {
            gunStr = cols[10] || "";
            if (gunStr.includes('*')) {
                gunAmmo = parseWeapon(gunStr);
                gunStr = gunStr.split('*')[0];
            } else {
                gunAmmo = parseInt(cols[11], 10) || 0;
            }
        }
        let gunType = gunStr ? gunStr.trim().toUpperCase() : "A";

        // ミサイルとミサイルタイプ（米国初期など）の読み取り
        let hsAmmo = 0, rhAmmo = 0;
        let missileType = "";
        for(let c = 14; c <= 18; c++) {
            if (cols[c]) {
                if (cols[c].includes('HSミサイル')) {
                    hsAmmo = cols[c].includes('*') ? parseWeapon(cols[c]) : (parseInt(cols[c+1], 10) || 0);
                }
                else if (cols[c].includes('RHミサイル')) {
                    rhAmmo = cols[c].includes('*') ? parseWeapon(cols[c]) : (parseInt(cols[c+1], 10) || 0);
                }
                else if (['米国初期', '米国後期', 'ソ連', 'フランス'].includes(cols[c].trim())) {
                    missileType = cols[c].trim();
                }
            }
        }

        let ruleText = [cols[8], cols[14], cols[15], cols[16], cols[19]].filter(Boolean).join(" ");
        let isBomb = aircraft.includes('F-105') || ruleText.includes('爆装');

        let groupUnits = [];
        for (let j = 0; j < count; j++) {
            let alt = groupAlt > 0 ? groupAlt : parseDice(altStr);
            let u = createUnit(`${aircraft}-${j+1}`, aircraft, team, 0, 0, 8, alt, gunAmmo, hsAmmo, rhAmmo, isBomb);
            u.gunType = gunType;
            u.missileType = missileType;
            groupUnits.push(u);
            units.push(u);
        }

        groups.push({ units: groupUnits, rule: ruleText });
    }

    // 2. 読み取った「日本語のルール文章」を解読して配置を決定する
    const DIRS = [8, 9, 3, 2, 1, 7];
    let placedUnits = []; // 距離チェック用の配置済みリスト

    // 「正面対峙」配置：上下から中央に向かい合う固定配置
    let hasFaceOff = groups.some(g => g.rule.includes("下段から上方向") || g.rule.includes("上段から下方向"));
    if (hasFaceOff) {
        // 列中央からランダムに2〜3列ずらす
        let baseX = Math.floor(mapMaxC / 2) - 1 + Math.floor(Math.random() * 4);
        groups.forEach(group => {
            let rule = group.rule;
            let isFromBottom = rule.includes("下段から上方向"); // 米軍：下端→上向き
            let dir = isFromBottom ? 8 : 2;
            // 行方向の下端80%・上端20%付近に配置（マップサイズに比例）
            let baseY = isFromBottom ? Math.floor(mapMaxR * 0.80) : Math.floor(mapMaxR * 0.18);

            group.units.forEach((u, i) => {
                u.x = Math.min(mapMaxC, Math.max(0, baseX + i));
                u.y = baseY;
                u.direction = dir;
                placedUnits.push(u);
            });
        });
        return units;
    }

    groups.forEach(group => {
        let rule = group.rule;
        let leader = group.units[0];

        // 向き（Direction）の文章解析
        let dir = DIRS[Math.floor(Math.random() * DIRS.length)];
        if (rule.includes("左端から侵入") || rule.includes("00xx") || rule.includes("左端(")) {
            dir = 3;
        } else if (rule.includes("下段から上方向")) {
            dir = 8;
        } else if (rule.includes("上段から下方向")) {
            dir = 2;
        }
        // 向きを先に確定（僚機の「同じ向き」判定にも使われる）
        leader.direction = dir;
        
        // 距離条件をグループスコープで定義（リーダー・僚機共通で使用）
        let minEnemyDist = 0, maxEnemyDist = Infinity;
        let matchExact = rule.match(/ちょうど(\d+)ヘクス離れた/);
        let matchRange = rule.match(/(\d+)〜(\d+)ヘクス離れた/);
        let matchMin = rule.match(/(\d+)ヘクス以上離れる/);
        if (matchExact) {
            minEnemyDist = parseInt(matchExact[1], 10);
            maxEnemyDist = parseInt(matchExact[1], 10);
        } else if (matchRange) {
            minEnemyDist = parseInt(matchRange[1], 10);
            maxEnemyDist = parseInt(matchRange[2], 10);
        } else if (matchMin) {
            minEnemyDist = parseInt(matchMin[1], 10);
        }
        let matchAlly = rule.match(/友軍(\d+)ヘクス以内/);
        let maxAllyDist = matchAlly ? parseInt(matchAlly[1], 10) : Infinity;

        // リーダー機の初期座標を文章から解読
        let placedLeader = false;

        // 敵基準で距離指定がある場合、ヘクスリング上の全候補を列挙してシャッフル
        let enemyRef = placedUnits.find(o => o.team !== leader.team);
        if (enemyRef && minEnemyDist > 0) {
            // minEnemyDist〜maxEnemyDist の全ヘクスを列挙
            // 列(x): 0〜mapMaxC、行(y): 0〜mapMaxR（以前は逆になっていたバグを修正）
            let candidates = [];
            for (let cx = 0; cx <= mapMaxC; cx++) {
                for (let cy = 0; cy <= mapMaxR; cy++) {
                    let d = getHexDistSetup(enemyRef.x, enemyRef.y, cx, cy);
                    if (d >= minEnemyDist && d <= maxEnemyDist) {
                        candidates.push({ x: cx, y: cy });
                    }
                }
            }
            // シャッフル
            for (let i = candidates.length - 1; i > 0; i--) {
                let j = Math.floor(Math.random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            // 友軍条件も満たす最初の候補を選択
            for (let cand of candidates) {
                leader.x = cand.x;
                leader.y = cand.y;
                leader.direction = dir;
                let ok = true;
                for (let other of placedUnits) {
                    let d = getHexDistSetup(leader.x, leader.y, other.x, other.y);
                    if (other.team === leader.team && d > maxAllyDist) { ok = false; break; }
                }
                if (ok) { placedLeader = true; break; }
            }
        }

        // 敵基準なし、またはフォールバック
        let leaderAttempts = 0;
        while (!placedLeader && leaderAttempts < 500) {
            leaderAttempts++;
            let bx = 0, by = 0;
            if (rule.includes("map中央")) {
                // マップ中央付近にランダム配置（mapMaxCの中央、mapMaxRの中央）
                bx = Math.floor(mapMaxC / 2) + Math.floor(Math.random() * 5) - 2;
                by = Math.floor(mapMaxR / 2) + Math.floor(Math.random() * 5) - 2;
            } else if (rule.includes("下段から上方向")) {
                bx = Math.floor(Math.random() * Math.max(1, mapMaxC - 10)) + 5;
                by = Math.floor(mapMaxR * 0.80) + Math.floor(Math.random() * 3);
            } else if (rule.includes("上段から下方向")) {
                bx = Math.floor(Math.random() * Math.max(1, mapMaxC - 10)) + 5;
                by = Math.floor(Math.random() * 3);
            } else if (rule.includes("上下端") && rule.includes("左端")) {
                let edge = Math.floor(Math.random() * 3);
                if (edge === 0) { bx = 0; by = Math.floor(Math.random() * (mapMaxR + 1)); dir = 3; }
                else if (edge === 1) { bx = Math.floor(Math.random() * Math.floor(mapMaxC * 0.6)); by = 0; dir = 2; }
                else { bx = Math.floor(Math.random() * Math.floor(mapMaxC * 0.6)); by = mapMaxR; dir = 8; }
            } else if (rule.includes("左端") || rule.includes("00xx")) {
                bx = 0;
                by = Math.floor(mapMaxR * 0.3) + Math.floor(Math.random() * Math.floor(mapMaxR * 0.3));
            } else if (rule.includes("ランダム")) {
                bx = Math.floor(Math.random() * Math.max(1, mapMaxC - 10)) + 5;
                by = Math.floor(Math.random() * Math.max(1, mapMaxR - 8)) + 4;
            } else {
                bx = Math.floor(Math.random() * (mapMaxC + 1));
                by = Math.floor(Math.random() * (mapMaxR + 1));
            }
            leader.x = Math.max(0, Math.min(mapMaxC, bx));
            leader.y = Math.max(0, Math.min(mapMaxR, by));
            leader.direction = dir;

            let tooClose = false;
            for (let other of placedUnits) {
                let dist = getHexDistSetup(leader.x, leader.y, other.x, other.y);
                if (other.team !== leader.team) {
                    if (dist < minEnemyDist || dist > maxEnemyDist) { tooClose = true; break; }
                } else {
                    if (dist > maxAllyDist) { tooClose = true; break; }
                }
            }
            if (!tooClose) placedLeader = true;
        }
        if (!placedLeader) {
            leader.x = 27; leader.y = 14; leader.direction = dir;
        }
        placedUnits.push(leader);

        // 僚機（2機目以降）の配置ルールの文章解析
        let followMatch = rule.match(/友軍(\d+)ヘクス以内/);
        let spreadDist = followMatch ? parseInt(followMatch[1], 10) : 1;

        for (let i = 1; i < group.units.length; i++) {
            let u = group.units[i];
            
            // 向き：「同じ向き」明示 or 侵入方向が固定されている場合はリーダーと同じ
            if (rule.includes("同じ向き") || rule.includes("侵入") || rule.includes("下段から上方向") || rule.includes("上段から下方向") || rule.includes("左端から侵入")) {
                u.direction = leader.direction;
            } else {
                u.direction = DIRS[Math.floor(Math.random() * DIRS.length)];
            }

            let placedFollower = false;
            let attempts = 0;
            while (!placedFollower && attempts < 100) {
                attempts++;
                let nx = leader.x + Math.floor(Math.random() * (spreadDist*2 + 1)) - spreadDist;
                let ny = leader.y + Math.floor(Math.random() * (spreadDist*2 + 1)) - spreadDist;
                
                if (getHexDistSetup(leader.x, leader.y, nx, ny) <= spreadDist) {
                    u.x = Math.max(0, Math.min(mapMaxC, nx));
                    u.y = Math.max(0, Math.min(mapMaxR, ny));
                    
                    let tooClose = false;
                    for (let other of placedUnits) {
                        let dist = getHexDistSetup(u.x, u.y, other.x, other.y);
                        if (other.team !== u.team) {
                            if (dist < minEnemyDist || dist > maxEnemyDist) { tooClose = true; break; }
                        } else {
                            if (dist > maxAllyDist) { tooClose = true; break; }
                        }
                    }
                    if (!tooClose) placedFollower = true;
                }
            }
            placedUnits.push(u);
        }
    });

    return units;
}