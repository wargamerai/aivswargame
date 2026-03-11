import json
import random
from collections import deque

# ==========================================
# ノモンハンの戦い - 特徴ベース Q学習 v2
# ユニット単位の行動決定 + 特徴ベース状態で汎化
# 実行: python3 train_nomonhan_v2.py
# ==========================================

# --- 地形データ（v1と同一） ---
IMPASSABLE = {"3-1","4-1","5-1","7-1","7-2","7-3","7-4","7-5","7-6","7-7","7-8","7-9"}
HILLS = {"1-1","1-2","1-3","1-4","1-5","1-6"}
RIVERS = {"1-8-2-8","2-7-2-8","2-7-3-8","2-7-3-7","2-6-3-7","2-6-3-6",
          "2-5-3-6","2-5-3-5","2-4-3-5","2-4-3-4","2-3-3-4","2-3-3-3",
          "2-2-3-3","2-2-3-2","2-1-3-2","2-1-3-1"}
BRIDGES = {"2-1-3-2"}       # 常設橋
MIL_BRIDGE = {"2-7-3-8"}    # 軍用橋（破壊可能）

def is_impassable(r, c):
    return f"{r}-{c}" in IMPASSABLE

def is_hill(r, c):
    return f"{r}-{c}" in HILLS

def is_river_cross(r1, c1, r2, c2):
    e = f"{r1}-{c1}-{r2}-{c2}"
    return e in RIVERS or f"{r2}-{c2}-{r1}-{c1}" in RIVERS

def is_bridge(r1, c1, r2, c2, bd):
    e = f"{r1}-{c1}-{r2}-{c2}"
    er = f"{r2}-{c2}-{r1}-{c1}"
    if e in BRIDGES or er in BRIDGES:
        return True
    if not bd and (e in MIL_BRIDGE or er in MIL_BRIDGE):
        return True
    return False

def get_adj(r, c):
    even = (r % 2 == 0)
    dirs = [[0,1],[0,-1],[-1,0],[-1,1],[1,0],[1,1]] if even else [[0,1],[0,-1],[-1,-1],[-1,0],[1,-1],[1,0]]
    res = []
    for dr, dc in dirs:
        nr, nc = r + dr, c + dc
        if 1 <= nr <= 7 and 1 <= nc <= 8 and not is_impassable(nr, nc):
            res.append((nr, nc))
    return res

def hex_dist(r1, c1, r2, c2):
    """ヘクス距離（BFS、川越えは橋なし時不可）"""
    if r1 == r2 and c1 == c2:
        return 0
    q = deque([(r1, c1, 0)])
    visited = {(r1, c1)}
    while q:
        r, c, d = q.popleft()
        for nr, nc in get_adj(r, c):
            if (nr, nc) not in visited:
                if nr == r2 and nc == c2:
                    return d + 1
                visited.add((nr, nc))
                q.append((nr, nc, d + 1))
    return 99

def is_enemy_zoc(r, c, my_side, units, bd):
    for e in units:
        if e['side'] == my_side or e['steps'] <= 0:
            continue
        for nr, nc in get_adj(e['r'], e['c']):
            if nr == r and nc == c:
                if not (is_river_cross(r, c, e['r'], e['c']) and not is_bridge(r, c, e['r'], e['c'], bd)):
                    return True
    return False

def get_reachable(unit, units, bd):
    sr, sc = unit['r'], unit['c']
    q = deque([(sr, sc, 0)])
    visited = {(sr, sc): 0}
    reachable = [(sr, sc)]
    occ = {(u['r'], u['c']) for u in units if u['steps'] > 0 and u['id'] != unit['id']}
    while q:
        r, c, cost = q.popleft()
        if cost >= unit['mov']:
            continue
        if cost > 0 and is_enemy_zoc(r, c, unit['side'], units, bd):
            continue
        for nr, nc in get_adj(r, c):
            if (nr, nc) in occ:
                continue
            if is_river_cross(r, c, nr, nc) and not is_bridge(r, c, nr, nc, bd):
                continue
            nc2 = cost + 1
            if (nr, nc) not in visited or visited[(nr, nc)] > nc2:
                visited[(nr, nc)] = nc2
                reachable.append((nr, nc))
                q.append((nr, nc, nc2))
    return list(set(reachable))


# --- 初期配置 ---
def get_initial_units():
    return [
        {"id":"jp1","side":"JP","r":3,"c":8,"atk":4,"def":4,"mov":2,"steps":2,
         "full_atk":4,"full_def":4,"full_mov":2,"back_atk":2,"back_def":2,"back_mov":2,"isTank":False},
        {"id":"jp2","side":"JP","r":4,"c":8,"atk":2,"def":1,"mov":3,"steps":2,
         "full_atk":2,"full_def":1,"full_mov":3,"back_atk":1,"back_def":1,"back_mov":3,"isTank":True},
        {"id":"jp3","side":"JP","r":6,"c":8,"atk":3,"def":1,"mov":3,"steps":2,
         "full_atk":3,"full_def":1,"full_mov":3,"back_atk":1,"back_def":1,"back_mov":3,"isTank":True},
        {"id":"sv1","side":"SOV","r":4,"c":2,"atk":2,"def":2,"mov":3,"steps":2,
         "full_atk":2,"full_def":2,"full_mov":3,"back_atk":1,"back_def":1,"back_mov":3,"isTank":False},
        {"id":"sv2","side":"SOV","r":5,"c":3,"atk":3,"def":1,"mov":4,"steps":2,
         "full_atk":3,"full_def":1,"full_mov":4,"back_atk":2,"back_def":1,"back_mov":4,"isTank":True},
        {"id":"sv3","side":"SOV","r":1,"c":7,"atk":1,"def":1,"mov":3,"steps":1,
         "full_atk":1,"full_def":1,"full_mov":3,"back_atk":0,"back_def":0,"back_mov":0,"isTank":False},
        {"id":"sv4","side":"SOV","r":1,"c":2,"atk":1,"def":1,"mov":0,"steps":1,
         "full_atk":1,"full_def":1,"full_mov":0,"back_atk":0,"back_def":0,"back_mov":0,"isTank":False}
    ]


# ==========================================
# 特徴ベース状態
# ==========================================
# 各ユニットの「状況」を特徴量に変換（汎化の鍵）
# state = (side, nearest_enemy_dist, adj_enemies, adj_friends, steps, isTank, bridge, on_hill)
# - nearest_enemy_dist: 1,2,3,4+ → 4段階
# - adj_enemies: 0,1,2+ → 3段階
# - adj_friends: 0,1,2+ → 3段階
# - steps: 1 or 2
# - isTank: 0 or 1
# - bridge: 0 or 1
# - on_hill: 0 or 1
# 合計: 4 × 3 × 3 × 2 × 2 × 2 × 2 = 576状態（とても小さい！）

def compute_features(unit, units, bd):
    side = unit['side']
    enemies = [u for u in units if u['side'] != side and u['steps'] > 0]
    friends = [u for u in units if u['side'] == side and u['steps'] > 0 and u['id'] != unit['id']]

    # 最寄り敵距離
    if enemies:
        ne_dist = min(hex_dist(unit['r'], unit['c'], e['r'], e['c']) for e in enemies)
    else:
        ne_dist = 99
    ne_dist = min(ne_dist, 4)  # 4+ は同じ

    # 隣接敵数
    adj_e = 0
    for e in enemies:
        if (e['r'], e['c']) in [(nr, nc) for nr, nc in get_adj(unit['r'], unit['c'])]:
            adj_e += 1
    adj_e = min(adj_e, 2)

    # 隣接友軍数
    adj_f = 0
    for f in friends:
        if (f['r'], f['c']) in [(nr, nc) for nr, nc in get_adj(unit['r'], unit['c'])]:
            adj_f += 1
    adj_f = min(adj_f, 2)

    steps = unit['steps']  # 1 or 2
    is_tank = 1 if unit['isTank'] else 0
    bridge = 1 if bd else 0
    on_hill = 1 if is_hill(unit['r'], unit['c']) else 0

    return (side, ne_dist, adj_e, adj_f, steps, is_tank, bridge, on_hill)

def feature_key(features):
    """特徴タプルをQ-tableキーに変換"""
    side, ned, ae, af, st, tk, br, oh = features
    return f"{side}_d{ned}_e{ae}_f{af}_s{st}_t{tk}_b{br}_h{oh}"


# ==========================================
# ユニット単位行動 (6種)
# ==========================================
UNIT_ACTIONS = [
    "charge_nearest",    # 最寄り敵に突進、隣接なら攻撃
    "charge_priority",   # 優先目標に突進（JP→sv4砲兵、SOV→戦車）
    "flank",             # 敵に接近するが、味方隣接ヘクスを優先（包囲狙い）
    "support_friend",    # 最寄りの味方に接近（援護）
    "defend_position",   # 動かない or 丘に移動（防御重視）
    "retreat"            # 最寄り敵から離れる
]

# JP専用の追加行動
JP_EXTRA_ACTIONS = ["destroy_bridge"]


# ==========================================
# 行動実行
# ==========================================
def execute_action(unit, action, units, bd):
    """ユニットの行動を実行し、新しいbdを返す"""
    side = unit['side']
    enemies = [u for u in units if u['side'] != side and u['steps'] > 0]
    friends = [u for u in units if u['side'] == side and u['steps'] > 0 and u['id'] != unit['id']]
    reachable = get_reachable(unit, units, bd)

    if not reachable or not enemies:
        return bd

    if action == "destroy_bridge":
        if side == "JP" and not bd:
            bd = True
            return bd
        # 橋がすでに破壊されてる場合はcharge_nearestにフォールバック
        action = "charge_nearest"

    if action == "charge_nearest":
        best = min(reachable, key=lambda h: min(hex_dist(h[0], h[1], e['r'], e['c']) for e in enemies))
        unit['r'], unit['c'] = best

    elif action == "charge_priority":
        if side == "JP":
            targets = [e for e in enemies if e['id'] == 'sv4']
        else:
            targets = [e for e in enemies if e['isTank']]
        if not targets:
            targets = enemies
        best = min(reachable, key=lambda h: min(hex_dist(h[0], h[1], t['r'], t['c']) for t in targets))
        unit['r'], unit['c'] = best

    elif action == "flank":
        # 敵の隣接ヘクスのうち、味方もいるところを優先
        def flank_score(h):
            min_ed = min(hex_dist(h[0], h[1], e['r'], e['c']) for e in enemies)
            friend_near = sum(1 for f in friends if hex_dist(h[0], h[1], f['r'], f['c']) <= 2)
            return min_ed - friend_near * 0.5  # 味方近くて敵にも近い方がいい
        best = min(reachable, key=flank_score)
        unit['r'], unit['c'] = best

    elif action == "support_friend":
        if friends:
            best = min(reachable, key=lambda h: min(hex_dist(h[0], h[1], f['r'], f['c']) for f in friends))
        else:
            best = min(reachable, key=lambda h: min(hex_dist(h[0], h[1], e['r'], e['c']) for e in enemies))
        unit['r'], unit['c'] = best

    elif action == "defend_position":
        # 丘があれば丘へ、なければ動かない
        hills_in_reach = [h for h in reachable if is_hill(h[0], h[1])]
        if hills_in_reach:
            unit['r'], unit['c'] = hills_in_reach[0]
        # else: stay put

    elif action == "retreat":
        if enemies:
            nearest_e = min(enemies, key=lambda e: hex_dist(unit['r'], unit['c'], e['r'], e['c']))
            best = max(reachable, key=lambda h: hex_dist(h[0], h[1], nearest_e['r'], nearest_e['c']))
            unit['r'], unit['c'] = best

    return bd


# ==========================================
# 戦闘処理（v1と同一ルール）
# ==========================================
def update_stats(u):
    if u['steps'] == 1 and 'back_atk' in u:
        u['atk'], u['def'], u['mov'] = u['back_atk'], u['back_def'], u['back_mov']
    elif u['steps'] == 2:
        u['atk'], u['def'], u['mov'] = u['full_atk'], u['full_def'], u['full_mov']

def force_retreat(loser, winner, hexes, units, bd):
    retreated = 0
    path = []
    for _ in range(hexes):
        if loser['steps'] <= 0:
            break
        occ = {(u['r'], u['c']) for u in units if u['steps'] > 0 and u['id'] != loser['id']}
        valids = []
        for nr, nc in get_adj(loser['r'], loser['c']):
            if (nr, nc) in occ:
                continue
            if is_river_cross(loser['r'], loser['c'], nr, nc) and not is_bridge(loser['r'], loser['c'], nr, nc, bd):
                continue
            if is_enemy_zoc(nr, nc, loser['side'], units, bd):
                continue
            valids.append((nr, nc))
        if not valids:
            loser['steps'] -= 1
            update_stats(loser)
            break
        best = max(valids, key=lambda h: hex_dist(h[0], h[1], winner['r'], winner['c']))
        path.append((loser['r'], loser['c']))
        loser['r'], loser['c'] = best
        retreated += 1
    # 勝者前進
    if winner['steps'] > 0 and path:
        for pr, pc in path:
            winner['r'], winner['c'] = pr, pc
    return retreated

def resolve_combat(attacker, defender, units, bd):
    """戦闘解決。v1と同一ルール。"""
    # 砲兵ボーナス
    art_bonus = 0
    for u in units:
        if u['id'] == 'sv4' and u['steps'] > 0:
            if hex_dist(u['r'], u['c'], attacker['r'], attacker['c']) <= 3 or \
               hex_dist(u['r'], u['c'], defender['r'], defender['c']) <= 3:
                art_bonus = 1
                break

    atk_total = attacker['atk'] + (art_bonus if attacker['side'] == 'SOV' else 0)
    def_total = defender['def'] + (art_bonus if defender['side'] == 'SOV' else 0)

    # 橋越え防御ボーナス
    if is_river_cross(attacker['r'], attacker['c'], defender['r'], defender['c']) and \
       is_bridge(attacker['r'], attacker['c'], defender['r'], defender['c'], bd):
        def_total += 1

    atk_target = 6 if is_hill(defender['r'], defender['c']) else 5
    def_target = 6 if is_hill(attacker['r'], attacker['c']) else 5

    atk_hits = sum(1 for _ in range(atk_total) if random.randint(1, 6) >= atk_target)
    def_hits = sum(1 for _ in range(def_total) if random.randint(1, 6) >= def_target)
    diff = atk_hits - def_hits

    if atk_hits > 0:
        defender['steps'] -= atk_hits
        update_stats(defender)
    if def_hits > 0:
        attacker['steps'] -= def_hits
        update_stats(attacker)

    retreat_hexes = 0
    if diff > 0 and defender['steps'] > 0:
        retreat_hexes = force_retreat(defender, attacker, diff, units, bd)
    elif diff < 0 and attacker['steps'] > 0:
        retreat_hexes = force_retreat(attacker, defender, -diff, units, bd)

    return atk_hits, def_hits, diff, retreat_hexes


# ==========================================
# 学習エンジン
# ==========================================
class NomonhanV2:
    def __init__(self):
        self.q_table = {}  # feature_key → {action: Q値}
        self.alpha = 0.1
        self.gamma = 0.9
        self.epsilon_start = 0.3
        self.epsilon_end = 0.02
        self.stats = {"jp_wins": 0, "sov_wins": 0, "draws": 0,
                      "flank_kills": 0, "total_combats": 0}

    def get_actions(self, unit, bd):
        acts = list(UNIT_ACTIONS)
        if unit['side'] == "JP" and not bd:
            acts.append("destroy_bridge")
        return acts

    def choose_action(self, fkey, actions, epsilon):
        if fkey not in self.q_table:
            self.q_table[fkey] = {a: 0.0 for a in actions}
        else:
            # 新しいアクションがあれば追加
            for a in actions:
                if a not in self.q_table[fkey]:
                    self.q_table[fkey][a] = 0.0

        if random.random() < epsilon:
            return random.choice(actions)
        else:
            return max(actions, key=lambda a: self.q_table[fkey].get(a, 0.0))

    def update_q(self, fkey, action, reward, next_fkey, next_actions):
        if fkey not in self.q_table:
            self.q_table[fkey] = {}
        if action not in self.q_table[fkey]:
            self.q_table[fkey][action] = 0.0

        if next_fkey and next_actions:
            if next_fkey not in self.q_table:
                self.q_table[next_fkey] = {a: 0.0 for a in next_actions}
            max_next = max(self.q_table[next_fkey].get(a, 0.0) for a in next_actions)
        else:
            max_next = 0.0

        old_q = self.q_table[fkey][action]
        self.q_table[fkey][action] = old_q + self.alpha * (reward + self.gamma * max_next - old_q)

    def train(self, episodes):
        print(f"\n--- 🧠 特徴ベースQ学習 v2 開始 ({episodes:,}回) ---")
        print(f"特徴: (side, near_enemy_dist, adj_enemies, adj_friends, steps, isTank, bridge, hill)")
        print(f"行動: {UNIT_ACTIONS} + destroy_bridge(JP)")
        print()

        for ep in range(1, episodes + 1):
            epsilon = self.epsilon_start + (self.epsilon_end - self.epsilon_start) * min(ep / episodes, 1.0)
            units = get_initial_units()
            bd = False
            game_active = True

            # 各ユニットの(state, action)を記録（ターン末にまとめて更新）
            for turn in range(1, 9):
                if not game_active:
                    break

                for side in ["JP", "SOV"]:
                    if not game_active:
                        break

                    my_units = [u for u in units if u['side'] == side and u['steps'] > 0]
                    enemy_units = [u for u in units if u['side'] != side and u['steps'] > 0]

                    if not my_units or not enemy_units:
                        break

                    # --- フェーズ1: 各ユニットの行動決定＆移動 ---
                    unit_records = []  # (unit_id, fkey, action)
                    for u in my_units:
                        feat = compute_features(u, units, bd)
                        fkey = feature_key(feat)
                        actions = self.get_actions(u, bd)
                        action = self.choose_action(fkey, actions, epsilon)
                        unit_records.append((u['id'], fkey, action))
                        bd = execute_action(u, action, units, bd)

                    # --- フェーズ2: 戦闘解決 ---
                    # 移動後、隣接する敵ペアで戦闘
                    combat_reward = 0
                    my_alive = [u for u in units if u['side'] == side and u['steps'] > 0]
                    for u in my_alive:
                        adj_enemies = [e for e in units if e['side'] != side and e['steps'] > 0
                                       and (e['r'], e['c']) in get_adj(u['r'], u['c'])]
                        if not adj_enemies:
                            continue
                        target = adj_enemies[0]
                        # 包囲チェック
                        friendly_around = sum(
                            1 for nr, nc in get_adj(target['r'], target['c'])
                            if any(mu['r'] == nr and mu['c'] == nc and mu['steps'] > 0
                                   for mu in units if mu['side'] == side)
                        )
                        is_flanking = friendly_around >= 2

                        self.stats["total_combats"] += 1
                        ah, dh, diff, rh = resolve_combat(u, target, units, bd)

                        if target['steps'] <= 0:
                            combat_reward += 300
                            if is_flanking:
                                combat_reward += 100  # 包囲ボーナス
                                self.stats["flank_kills"] += 1
                        elif diff > 0:
                            combat_reward += 50 * rh
                        elif diff < 0:
                            combat_reward -= 50 * rh

                        if u['steps'] <= 0:
                            combat_reward -= 200  # 自軍撃破ペナルティ

                    # --- フェーズ3: 勝敗判定 ---
                    jp_tanks = [u for u in units if u['side'] == 'JP' and u['isTank'] and u['steps'] > 0]
                    sov_art = [u for u in units if u['id'] == 'sv4' and u['steps'] > 0]

                    terminal_reward = 0
                    is_terminal = False

                    if not sov_art:
                        game_active = False
                        is_terminal = True
                        self.stats["jp_wins"] += 1
                        terminal_reward = 1000 if side == "JP" else -1000
                    elif not jp_tanks:
                        game_active = False
                        is_terminal = True
                        self.stats["sov_wins"] += 1
                        terminal_reward = 1000 if side == "SOV" else -1000

                    # --- フェーズ4: Q値更新 ---
                    total_reward = combat_reward + terminal_reward
                    per_unit_reward = total_reward / max(len(unit_records), 1)

                    for uid, fkey, action in unit_records:
                        u_now = next((u for u in units if u['id'] == uid), None)
                        if u_now and u_now['steps'] > 0 and not is_terminal:
                            next_feat = compute_features(u_now, units, bd)
                            next_fkey = feature_key(next_feat)
                            next_acts = self.get_actions(u_now, bd)
                            self.update_q(fkey, action, per_unit_reward, next_fkey, next_acts)
                        else:
                            self.update_q(fkey, action, per_unit_reward, None, None)

            # 8ターン引き分け
            if game_active:
                self.stats["draws"] += 1

            # 進捗表示
            if ep % max(episodes // 20, 1) == 0:
                total = self.stats['jp_wins'] + self.stats['sov_wins'] + self.stats['draws']
                jp_pct = self.stats['jp_wins'] / total * 100 if total else 0
                sov_pct = self.stats['sov_wins'] / total * 100 if total else 0
                print(f"[{ep:>8,}/{episodes:,}] JP:{self.stats['jp_wins']:,}({jp_pct:.1f}%) "
                      f"SOV:{self.stats['sov_wins']:,}({sov_pct:.1f}%) "
                      f"Draw:{self.stats['draws']:,} "
                      f"ε={epsilon:.3f} Q状態数={len(self.q_table)}")

            # 5万回ごとに途中保存（中断しても失われない）
            if ep % 50000 == 0:
                self.save_qtable()
                print(f"  💾 途中保存完了 ({ep:,}回時点)")

        self.print_report()

    def save_qtable(self):
        """Q-tableをJSON + JS形式で保存"""
        out = "nomonhan_q_v2.json"
        with open(out, 'w', encoding='utf-8') as f:
            json.dump(self.q_table, f, ensure_ascii=False, indent=2)
        out_js = "nomonhan_q_v2_data.js"
        with open(out_js, 'w', encoding='utf-8') as f:
            f.write("var Q_TABLE_V2 = ")
            json.dump(self.q_table, f, ensure_ascii=False)
            f.write(";\n")

    def print_report(self):
        print("\n==========================================")
        print(" 📊 特徴ベースQ学習 v2 レポート")
        print("==========================================")
        print(f"🎌 日本軍 勝利: {self.stats['jp_wins']:,}")
        print(f"⭐ ソ連軍 勝利: {self.stats['sov_wins']:,}")
        print(f"⚖️ 引き分け: {self.stats['draws']:,}")
        print(f"⚔️ 総戦闘回数: {self.stats['total_combats']:,}")
        print(f"🎯 包囲撃破: {self.stats['flank_kills']:,}")
        print(f"🧠 Q-table状態数: {len(self.q_table)}")
        print("==========================================\n")

        self.save_qtable()
        print(f"💾 Q-table保存: nomonhan_q_v2.json ({len(self.q_table)} 状態)")
        print(f"💾 JS版保存: nomonhan_q_v2_data.js")

        # サンプル表示
        print("\n--- Q-table サンプル ---")
        for i, (k, v) in enumerate(self.q_table.items()):
            if i >= 10:
                break
            best_a = max(v, key=v.get)
            print(f"  {k}: best={best_a} Q={v[best_a]:.2f}")


if __name__ == "__main__":
    import sys
    print("【ノモンハンの戦い - 特徴ベースQ学習 v2】")
    print("状態=ユニットの局所的特徴 × 行動=ユニット単位6種")
    print()
    # コマンドライン引数があればそれを使う（例: python3 train_nomonhan_v2.py 500000）
    if len(sys.argv) > 1:
        try:
            n = int(sys.argv[1])
        except ValueError:
            n = 500000
    else:
        try:
            user_input = input("何回戦わせますか？（例: 500000）: ")
            n = int(user_input.strip())
            if n <= 0:
                raise ValueError
        except ValueError:
            n = 500000
    sim = NomonhanV2()
    sim.train(n)
