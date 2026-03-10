import json
import random
from collections import deque

# ==========================================
# ノモンハンの戦い - 8ターン完全決着・全座標記録 Q学習シミュレーター
# （戦闘後前進・退却による陣形変化の完全シミュレート版）
# 実行: python3 train_nomonhan_perfect.py
# ==========================================

def is_impassable(r, c):
    return f"{r}-{c}" in ["3-1", "4-1", "5-1", "7-1", "7-2", "7-3", "7-4", "7-5", "7-6", "7-7", "7-8", "7-9"]

def is_hill(r, c):
    return f"{r}-{c}" in ["1-1", "1-2", "1-3", "1-4", "1-5", "1-6"]

def is_military_bridge(r1, c1, r2, c2, bridge_destroyed):
    if bridge_destroyed: return False
    e = f"{r1}-{c1}-{r2}-{c2}"
    er = f"{r2}-{c2}-{r1}-{c1}"
    return e == "2-7-3-8" or er == "2-7-3-8"

def is_bridge(r1, c1, r2, c2, bridge_destroyed):
    e = f"{r1}-{c1}-{r2}-{c2}"
    er = f"{r2}-{c2}-{r1}-{c1}"
    return e == "2-1-3-2" or er == "2-1-3-2" or is_military_bridge(r1, c1, r2, c2, bridge_destroyed)

def is_river_cross(r1, c1, r2, c2):
    e = f"{r1}-{c1}-{r2}-{c2}"
    er = f"{r2}-{c2}-{r1}-{c1}"
    rivers = ["1-8-2-8", "2-7-2-8", "2-7-3-8", "2-7-3-7", "2-6-3-7", "2-6-3-6", 
              "2-5-3-6", "2-5-3-5", "2-4-3-5", "2-4-3-4", "2-3-3-4", "2-3-3-3", 
              "2-2-3-3", "2-2-3-2", "2-1-3-2", "2-1-3-1"]
    return e in rivers or er in rivers

def get_adjacent_coords(r, c):
    is_even = (r % 2 == 0)
    dirs = [[0, 1], [0, -1], [-1, 0], [-1, 1], [1, 0], [1, 1]] if is_even else [[0, 1], [0, -1], [-1, -1], [-1, 0], [1, -1], [1, 0]]
    res = []
    for dr, dc in dirs:
        nr, nc = r + dr, c + dc
        if 1 <= nr <= 7 and 1 <= nc <= 8 and not is_impassable(nr, nc):
            res.append({"r": nr, "c": nc})
    return res

def is_enemy_zoc(r, c, my_side, units, bridge_destroyed):
    for e in units:
        if e['side'] == my_side or e['steps'] <= 0: continue
        for pos in get_adjacent_coords(e['r'], e['c']):
            if pos['r'] == r and pos['c'] == c:
                if not (is_river_cross(r, c, e['r'], e['c']) and not is_bridge(r, c, e['r'], e['c'], bridge_destroyed)):
                    return True
    return False

def get_reachable_hexes(unit, units, bridge_destroyed):
    start_r, start_c = unit['r'], unit['c']
    q = deque([{"r": start_r, "c": start_c, "cost": 0}])
    visited = {f"{start_r}-{start_c}": 0}
    reachable = []
    
    while q:
        curr = q.popleft()
        reachable.append(curr)
        if curr['cost'] >= unit['mov']: continue
        if curr['cost'] > 0 and is_enemy_zoc(curr['r'], curr['c'], unit['side'], units, bridge_destroyed): continue
        
        for adj in get_adjacent_coords(curr['r'], curr['c']):
            if any(u['r'] == adj['r'] and u['c'] == adj['c'] and u['steps'] > 0 for u in units): continue
            if is_river_cross(curr['r'], curr['c'], adj['r'], adj['c']) and not is_bridge(curr['r'], curr['c'], adj['r'], adj['c'], bridge_destroyed): continue
            
            n_cost = curr['cost'] + 1
            k = f"{adj['r']}-{adj['c']}"
            if k not in visited or visited[k] > n_cost:
                visited[k] = n_cost
                q.append({"r": adj['r'], "c": adj['c'], "cost": n_cost})
    return reachable

def get_path_cost(start_pos, target_pos, bridge_destroyed):
    if start_pos['r'] == target_pos['r'] and start_pos['c'] == target_pos['c']: return 0
    q = deque([{"r": start_pos['r'], "c": start_pos['c'], "cost": 0}])
    visited = set([f"{start_pos['r']}-{start_pos['c']}"])
    while q:
        curr = q.popleft()
        if curr['r'] == target_pos['r'] and curr['c'] == target_pos['c']: return curr['cost']
        for adj in get_adjacent_coords(curr['r'], curr['c']):
            if is_river_cross(curr['r'], curr['c'], adj['r'], adj['c']) and not is_bridge(curr['r'], curr['c'], adj['r'], adj['c'], bridge_destroyed): continue
            k = f"{adj['r']}-{adj['c']}"
            if k not in visited:
                visited.add(k)
                q.append({"r": adj['r'], "c": adj['c'], "cost": curr['cost'] + 1})
    return 999

def get_initial_units():
    return [
        {"id": "jp1", "side": "JP", "r": 3, "c": 8, "atk": 4, "def": 4, "mov": 2, "steps": 2, "full_atk": 4, "full_def": 4, "full_mov": 2, "back_atk": 2, "back_def": 2, "back_mov": 2, "isTank": False},
        {"id": "jp2", "side": "JP", "r": 4, "c": 8, "atk": 2, "def": 1, "mov": 3, "steps": 2, "full_atk": 2, "full_def": 1, "full_mov": 3, "back_atk": 1, "back_def": 1, "back_mov": 3, "isTank": True},
        {"id": "jp3", "side": "JP", "r": 6, "c": 8, "atk": 3, "def": 1, "mov": 3, "steps": 2, "full_atk": 3, "full_def": 1, "full_mov": 3, "back_atk": 1, "back_def": 1, "back_mov": 3, "isTank": True},
        {"id": "sv1", "side": "SOV", "r": 4, "c": 2, "atk": 2, "def": 2, "mov": 3, "steps": 2, "full_atk": 2, "full_def": 2, "full_mov": 3, "back_atk": 1, "back_def": 1, "back_mov": 3, "isTank": False},
        {"id": "sv2", "side": "SOV", "r": 5, "c": 3, "atk": 3, "def": 1, "mov": 4, "steps": 2, "full_atk": 3, "full_def": 1, "full_mov": 4, "back_atk": 2, "back_def": 1, "back_mov": 4, "isTank": True},
        {"id": "sv3", "side": "SOV", "r": 1, "c": 7, "atk": 1, "def": 1, "mov": 3, "steps": 1, "full_atk": 1, "full_def": 1, "full_mov": 3, "back_atk": 0, "back_def": 0, "back_mov": 0, "isTank": False},
        {"id": "sv4", "side": "SOV", "r": 1, "c": 2, "atk": 1, "def": 1, "mov": 0, "steps": 1, "full_atk": 1, "full_def": 1, "full_mov": 0, "back_atk": 0, "back_def": 0, "back_mov": 0, "isTank": False}
    ]

class NomonhanEnvPerfect:
    def __init__(self):
        self.q_table = {}
        self.stats = {
            "jp_wins": 0, "sov_wins": 0, "draws": 0,
            "flank_kills": 0, "combat_advance_hexes": 0, "combat_retreat_hexes": 0
        }

    def update_unit_stats(self, u):
        if u['steps'] == 1 and 'back_atk' in u:
            u['atk'], u['def'], u['mov'] = u['back_atk'], u['back_def'], u['back_mov']
        elif u['steps'] == 2:
            u['atk'], u['def'], u['mov'] = u['full_atk'], u['full_def'], u['full_mov']

    def is_adjacent(self, u1, u2):
        for adj in get_adjacent_coords(u1['r'], u1['c']):
            if adj['r'] == u2['r'] and adj['c'] == u2['c']: return True
        return False

    def get_state_key(self, units, bridge_destroyed):
        # 盤面の全ユニットの「ID、R座標、C座標、残りステップ数」を完全に文字列化して記録
        # これにより、戦闘後前進や退却による「新しい包囲陣形」が100%状態として保存される
        alive_units = sorted([(u['id'], u['r'], u['c'], u['steps']) for u in units if u['steps'] > 0])
        return f"{str(alive_units)}_B{1 if bridge_destroyed else 0}"

    def force_retreat_and_advance(self, loser, winner, hexes, units, bridge_destroyed):
        """敗者の後退と、勝者の戦闘後前進を実際のマップ座標上で実行する"""
        actual_retreats = 0
        path_taken = []
        
        for _ in range(hexes):
            if loser['steps'] <= 0: break
            
            valid_retreats = []
            for a in get_adjacent_coords(loser['r'], loser['c']):
                if any(u['r'] == a['r'] and u['c'] == a['c'] and u['steps'] > 0 for u in units): continue
                if is_river_cross(loser['r'], loser['c'], a['r'], a['c']) and not is_bridge(loser['r'], loser['c'], a['r'], a['c'], bridge_destroyed): continue
                if is_enemy_zoc(a['r'], a['c'], loser['side'], units, bridge_destroyed): continue
                valid_retreats.append(a)
                
            if not valid_retreats:
                loser['steps'] -= 1 # 退却不能によるステップ減
                self.update_unit_stats(loser)
                break
                
            # 勝者から最も遠ざかるマスへ退却
            best_retreat = max(valid_retreats, key=lambda pos: get_path_cost({"r":pos['r'], "c":pos['c']}, {"r":winner['r'], "c":winner['c']}, bridge_destroyed))
            path_taken.append({"r": loser['r'], "c": loser['c']})
            loser['r'], loser['c'] = best_retreat['r'], best_retreat['c']
            actual_retreats += 1
            
        # 戦闘後前進 (勝者が空いたマスに入り込む)
        if winner['steps'] > 0 and path_taken:
            for step_pos in path_taken:
                winner['r'], winner['c'] = step_pos['r'], step_pos['c']
                
        return actual_retreats

    def execute_combat(self, attacker, defender, units, bridge_destroyed, is_flanking):
        art_bonus = 1 if any(u['id'] == 'sv4' and u['steps'] > 0 and (get_path_cost(u, attacker, bridge_destroyed) <= 3 or get_path_cost(u, defender, bridge_destroyed) <= 3) for u in units) else 0
        
        atk_total = attacker['atk'] + (art_bonus if attacker['side'] == 'SOV' else 0)
        def_total = defender['def'] + (art_bonus if defender['side'] == 'SOV' else 0)
        if is_river_cross(attacker['r'], attacker['c'], defender['r'], defender['c']) and is_bridge(attacker['r'], attacker['c'], defender['r'], defender['c'], bridge_destroyed):
            def_total += 1 

        atk_target = 6 if is_hill(defender['r'], defender['c']) else 5
        def_target = 6 if is_hill(attacker['r'], attacker['c']) else 5

        atk_hits = sum(1 for _ in range(atk_total) if random.randint(1, 6) >= atk_target)
        def_hits = sum(1 for _ in range(def_total) if random.randint(1, 6) >= def_target)
        diff = atk_hits - def_hits
        
        if atk_hits > 0:
            defender['steps'] -= atk_hits
            self.update_unit_stats(defender)
        if def_hits > 0:
            attacker['steps'] -= def_hits
            self.update_unit_stats(attacker)
            
        combat_result = "DRAW"
        retreat_hexes = 0
        
        # 本物の退却と戦闘後前進の処理を実行
        if diff > 0 and defender['steps'] > 0:
            retreat_hexes = self.force_retreat_and_advance(defender, attacker, diff, units, bridge_destroyed)
            combat_result = "ATK_WIN"
        elif diff < 0 and attacker['steps'] > 0:
            retreat_hexes = self.force_retreat_and_advance(attacker, defender, -diff, units, bridge_destroyed)
            combat_result = "DEF_WIN"
            
        return atk_hits, def_hits, combat_result, retreat_hexes

    def train(self, episodes):
        print(f"\n--- 🔥 完全版AI学習開始 ({episodes}回) ---")
        
        for episode in range(1, episodes + 1):
            units = get_initial_units()
            bridge_destroyed = False
            turn = 1
            game_active = True
            
            # 【絶対ルール】8ターンで完全決着
            while game_active and turn <= 8:
                for side in ["JP", "SOV"]:
                    if not game_active: break
                    
                    state = self.get_state_key(units, bridge_destroyed)
                    actions = ["attack", "move_forward", "defend"]
                    if side == "JP" and not bridge_destroyed: actions.append("destroy_bridge")
                    
                    if state not in self.q_table:
                        self.q_table[state] = {a: 0.0 for a in actions}

                    action = random.choice(actions) if random.random() < 0.1 else max(self.q_table[state], key=self.q_table[state].get)
                    
                    reward = 0
                    my_units = [u for u in units if u['side'] == side and u['steps'] > 0]
                    enemy_units = [u for u in units if u['side'] != side and u['steps'] > 0]
                    
                    if action == "destroy_bridge":
                        bridge_destroyed = True
                        reward += 50

                    elif action == "move_forward" or action == "attack":
                        for u in my_units:
                            reachable = get_reachable_hexes(u, units, bridge_destroyed)
                            if not reachable: continue
                            
                            targets = [e for e in enemy_units if (e['id']=='sv4' if side=='JP' else e['isTank'])]
                            if not targets: targets = enemy_units
                            
                            best_move = min(reachable, key=lambda h: min(get_path_cost(h, {"r":t['r'], "c":t['c']}, bridge_destroyed) for t in targets))
                            u['r'], u['c'] = best_move['r'], best_move['c']
                            
                            adjacent_enemies = [e for e in enemy_units if self.is_adjacent(u, e)]
                            if adjacent_enemies and action == "attack":
                                target_e = adjacent_enemies[0]
                                
                                # 包囲判定
                                enemy_adj_spaces = get_adjacent_coords(target_e['r'], target_e['c'])
                                friendly_around = sum(1 for a in enemy_adj_spaces if any(mu['r']==a['r'] and mu['c']==a['c'] for mu in my_units))
                                is_flanking = (friendly_around >= 2)
                                
                                atk_hits, def_hits, res, retreat_hexes = self.execute_combat(u, target_e, units, bridge_destroyed, is_flanking)
                                
                                # 陣形変化に基づいた点数化
                                if target_e['steps'] <= 0:
                                    reward += 300
                                    if is_flanking: self.stats["flank_kills"] += 1
                                elif res == "ATK_WIN":
                                    reward += 50 * retreat_hexes
                                    self.stats["combat_advance_hexes"] += retreat_hexes
                                elif res == "DEF_WIN":
                                    reward -= 50 * retreat_hexes
                                    self.stats["combat_retreat_hexes"] += retreat_hexes

                    # 即勝利・敗北判定
                    jp_tanks = [u for u in units if u['side'] == 'JP' and u['isTank'] and u['steps'] > 0]
                    sov_art = [u for u in units if u['id'] == 'sv4' and u['steps'] > 0]
                    
                    if not sov_art:
                        game_active = False
                        self.stats["jp_wins"] += 1
                        reward += 1000 if side == "JP" else -1000
                    elif not jp_tanks:
                        game_active = False
                        self.stats["sov_wins"] += 1
                        reward += 1000 if side == "SOV" else -1000

                    if game_active:
                        next_state = self.get_state_key(units, bridge_destroyed)
                        if next_state not in self.q_table:
                            self.q_table[next_state] = {a: 0.0 for a in actions}
                        max_next_q = max(self.q_table[next_state].values())
                        current_q = self.q_table[state][action]
                        self.q_table[state][action] = current_q + 0.1 * (reward + 0.9 * max_next_q - current_q)

                turn += 1
                
            if game_active: self.stats["draws"] += 1

            if episode % (episodes // 10 if episodes >= 10 else 1) == 0:
                print(f"[{episode}/{episodes}回 完了] JP勝:{self.stats['jp_wins']} SOV勝:{self.stats['sov_wins']} 引分:{self.stats['draws']}")

        self.print_report()

    def print_report(self):
        print("\n==========================================")
        print(" 📊 完全版ルール 学習結果レポート (8ターン制限)")
        print("==========================================")
        print(f"🎌 日本軍 勝利: {self.stats['jp_wins']} 回")
        print(f"⭐ ソ連軍 勝利: {self.stats['sov_wins']} 回")
        print(f"⚖️ 引き分け(8ターン経過): {self.stats['draws']} 回")
        print("-" * 42)
        print("⚔️ 陣形推移・戦術データ:")
        print(f"   └ 複数部隊で包囲して撃破: {self.stats['flank_kills']} 回")
        print(f"   └ 戦闘後前進を成功させた（食い込んだマス数）: 計 {self.stats['combat_advance_hexes']} ヘクス")
        print(f"   └ 逆に後退させられた（押し込まれたマス数）: 計 {self.stats['combat_retreat_hexes']} ヘクス")
        print("==========================================\n")
        
        with open('nomonhan_q_perfect.json', 'w', encoding='utf-8') as f:
            json.dump(self.q_table, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    print("【ノモンハンの戦い - 陣形完全記録 AI学習ツール】")
    try:
        user_input = input("何回戦わせますか？（例: 10000）: ")
        episodes_count = int(user_input.strip())
        if episodes_count <= 0: raise ValueError
    except ValueError:
        episodes_count = 10000
    sim = NomonhanEnvPerfect()
    sim.train(episodes_count)