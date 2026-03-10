"""
Air Combat Game - AI学習スクリプト
ターミナルで実行: python3 train_air.py
学習データ: aircombat_q.json に保存

固定シナリオ: フリーシナリオ（F-4×2 vs Mig-21×4）
"""

import random
import json
import math
import sys
import os
import time
import re

# =====================================================
# データ定義（f16kitai.js / f16statas.js から）
# =====================================================

def parse_val(s):
    """'2/3' → [2,3], '2' → [2], '-1/-2' → [-1,-2]"""
    s = str(s).strip()
    if not s or s == 'nan': return [0]
    parts = s.split('/')
    result = []
    for p in parts:
        try: result.append(int(p.strip()))
        except: pass
    return result if result else [0]

def load_kitai(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        raw = f.read()
    raw = re.sub(r'^const rawKitaiCsv\s*=\s*`', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'`;\s*$', '', raw, flags=re.MULTILINE)
    lines = [l for l in raw.strip().split('\n') if l.strip()]
    plane_data = {}
    cur = None
    for i, line in enumerate(lines[1:], 1):
        cols = line.split(',')
        name = cols[0].strip()
        if name:
            cur = name
            plane_data[cur] = {'speed': [], 'alt': [], 'turn': []}
        if cur is None: continue
        row_data = []
        for r in range(5):
            row = []
            for c in range(5):
                idx = 2 + r * 5 + c
                v = cols[idx].strip() if idx < len(cols) else '0'
                row.append(v)
            row_data.append(row)
        st = cols[1].strip() if len(cols) > 1 else ''
        if st == '直進': plane_data[cur]['speed'] = row_data
        elif st == '高度': plane_data[cur]['alt'] = row_data
        elif st == '旋回': plane_data[cur]['turn'] = row_data
    return plane_data

def load_statas(filepath):
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        raw = f.read()
    raw = re.sub(r'^const rawStatasCsv\s*=\s*`', '', raw, flags=re.MULTILINE)
    raw = re.sub(r'`;\s*$', '', raw, flags=re.MULTILINE)
    lines = [l for l in raw.strip().split('\n') if l.strip()]

    gun_chart = {}
    hs_chart = {}
    rh_chart = {}
    mode = None
    hs_heads = []
    rh_heads = []

    for line in lines:
        cols = [c.strip() for c in line.split(',')]
        h = cols[0]
        if h == '機関砲': mode = 'GUN'; continue
        if h == 'HS':  mode = 'HS';  hs_heads = [c for c in cols[1:] if c]; continue
        if h == 'RH':  mode = 'RH';  rh_heads = [c for c in cols[1:] if c]; continue
        if not h: continue

        if mode == 'GUN' and re.match(r'^[A-G]$', h):
            vals = [int(c) if c.lstrip('-').isdigit() else 0 for c in cols[1:]]
            gun_chart[h] = {
                '前方':     vals[0:3],
                '後方側面': vals[3:6],
                '後方':     vals[6:9]
            }
        elif mode == 'HS' and hs_heads:
            row = {}
            for j, k in enumerate(hs_heads):
                v = cols[j+1] if j+1 < len(cols) else '0'
                row[k] = int(v) if v.lstrip('-').isdigit() else 0
            hs_chart[h] = row
        elif mode == 'RH' and rh_heads:
            row = {}
            for j, k in enumerate(rh_heads):
                v = cols[j+1] if j+1 < len(cols) else '0'
                if v: row[k] = int(v) if v.lstrip('-').isdigit() else 0
            rh_chart[h] = row

    return gun_chart, hs_chart, rh_chart

# =====================================================
# 定数
# =====================================================
PLANE_CHART_TYPE = {
    'F-86': '米国初期', 'Mig-15': 'ソ連',
    'F-4': '米国初期', 'F-105': '米国初期',  # ←ここを「初期」に合わせる
    'Mig-17': 'ソ連', 'Mig-21': 'ソ連'
}

DIR_ORDER = [8, 9, 3, 2, 1, 7]
DIR_ANGLES = {8: -90, 9: -30, 3: 30, 2: 90, 1: 150, 7: -150}
HEX_STEP = 2.0

# =====================================================
# ヘックス距離計算
# =====================================================
def get_hex_distance(x1, y1, x2, y2):
    dx = abs(x2 - x1)
    dy = abs(y2 - y1)
    return max(dx, dy, (dx + dy + 1) // 2)

# =====================================================
# アーク・アスペクト判定
# =====================================================
def get_arc_aspect(ax, ay, a_dir, tx, ty, t_dir):
    dx, dy = tx - ax, ty - ay
    if dx == 0 and dy == 0:
        return '前方', '後方'

    ang = math.degrees(math.atan2(dy, dx))

    a_ang = DIR_ANGLES.get(a_dir, 0)
    rel = (ang - a_ang + 360) % 360
    if rel > 180: rel -= 360
    arc = '前方' if abs(rel) <= 60 else '後方'

    t_ang = DIR_ANGLES.get(t_dir, 0)
    t_to_a = (math.degrees(math.atan2(ay - ty, ax - tx)) - t_ang + 360) % 360
    if t_to_a > 180: t_to_a -= 360
    if abs(t_to_a) <= 60: aspect = '後方'
    elif abs(t_to_a) <= 120: aspect = '後方側面'
    else: aspect = '前方'

    return arc, aspect

# =====================================================
# ミサイル命中値取得
# =====================================================
def get_missile_value(chart, chart_type, dist):
    row = chart.get(chart_type, {})
    for key in row:
        rng = key.replace(' ', '')
        if '+' in rng:
            low = int(rng.replace('+',''))
            if dist >= low: return row[key]
        elif '/' in rng:
            parts = rng.split('/')
            lo, hi = int(parts[0]), int(parts[-1])
            if lo <= dist <= hi: return row[key]
        else:
            try:
                if dist == int(rng): return row[key]
            except: pass
    return 0

# =====================================================
# ユニット
# =====================================================
class Unit:
    def __init__(self, uid, aircraft, team, x, y, direction, altitude, gun, gun_type, hs, rh):
        self.id = uid
        self.aircraft = aircraft
        self.team = team
        self.x = x
        self.y = y
        self.direction = direction
        self.altitude = altitude
        self.status = 'alive'
        self.damage = 'なし'
        self.gun = gun
        self.gun_type = gun_type
        self.missiles_hs = hs
        self.missiles_rh = rh
        self.missile_type = PLANE_CHART_TYPE.get(aircraft, '米国後期')
        self.start_row = 2
        self.start_col = 2
        self.prev_row = 2
        self.steps_since_turn = 0
        self.lock_target = None
        self.rh_in_flight = None

    def copy(self):
        u = Unit(self.id, self.aircraft, self.team, self.x, self.y,
                 self.direction, self.altitude, self.gun, self.gun_type,
                 self.missiles_hs, self.missiles_rh)
        u.status = self.status
        u.damage = self.damage
        u.start_row = self.start_row
        u.start_col = self.start_col
        u.prev_row = self.prev_row
        u.steps_since_turn = self.steps_since_turn
        u.lock_target = self.lock_target
        u.rh_in_flight = self.rh_in_flight
        return u

# =====================================================
# Q学習 AI
# =====================================================
class AirCombatAI:
    def __init__(self):
        self.q_table = {}
        self.maneuver_stats = {}
        self.alpha = 0.15
        self.gamma = 0.92
        self.epsilon = 0.2
        self._last = {}

    def get_state(self, unit, enemy, all_units=None):
        dist = min(20, get_hex_distance(unit.x, unit.y, enemy.x, enemy.y))
        dist_band = 'C' if dist <= 1 else 'N' if dist <= 4 else 'M' if dist <= 10 else 'F'
        alt_raw = unit.altitude - enemy.altitude
        alt_c = 'U' if alt_raw >= 3 else 'D' if alt_raw <= -3 else 'E'
        my_alt = 'H' if unit.altitude >= 25 else 'M' if unit.altitude >= 12 else 'L'
        arc, aspect = get_arc_aspect(unit.x, unit.y, unit.direction,
                                      enemy.x, enemy.y, enemy.direction)
        arc_c = 'F' if arc == '前方' else 'O'
        asp_c = 'R' if aspect == '後方' else 'S' if aspect == '後方側面' else 'X'
        hs_c = 'H' if unit.missiles_hs >= 2 else 'h' if unit.missiles_hs == 1 else 'N'
        rh_c = 'R' if unit.missiles_rh >= 2 else 'r' if unit.missiles_rh == 1 else 'N'
        dmg_c = 'D' if enemy.damage == '損害あり' else 'O'
        if all_units:
            my_alive = len([u for u in all_units if u.team == unit.team and u.status != 'destroyed'])
            en_alive = len([u for u in all_units if u.team != unit.team and u.status != 'destroyed'])
            num_c = 'A' if my_alive > en_alive else 'B' if my_alive < en_alive else 'E'
        else:
            num_c = 'E'
        prev_dist = self._last.get(unit.id, (None, None, dist))[2]
        trend_c = 'I' if dist < prev_dist else 'O' if dist > prev_dist else 'S'
        return f"{dist_band}{alt_c}{my_alt}_{arc_c}{asp_c}_{hs_c}{rh_c}_{dmg_c}{num_c}{trend_c}"

    def get_q(self, state, action):
        return self.q_table.get(state, {}).get(action, 0.0)

    def update_q(self, state, action, reward, next_max_q):
        if state not in self.q_table:
            self.q_table[state] = {}
        old = self.q_table[state].get(action, 0.0)
        self.q_table[state][action] = old + self.alpha * (reward + self.gamma * next_max_q - old)

    def get_best_q(self, state):
        actions = self.q_table.get(state, {})
        return max(actions.values()) if actions else 0.0

    def choose_action(self, unit, enemies, plane_data, all_units=None, tactic_info=None):
        valid_enemies = [e for e in enemies if e.status != 'destroyed']
        if not valid_enemies:
            return 2, 2
        if tactic_info and tactic_info.get('target') and tactic_info['target'].status != 'destroyed':
            target = tactic_info['target']
        else:
            target = min(valid_enemies, key=lambda e: get_hex_distance(unit.x, unit.y, e.x, e.y))
        state = self.get_state(unit, target, all_units)
        if random.random() < self.epsilon:
            r = random.randint(0, 4)
            c = random.randint(0, 4)
        else:
            best_r, best_c, best_score = 2, 2, -9999
            for r in range(5):
                for c in range(5):
                    action = f"r{r}c{c}"
                    q = self.get_q(state, action)
                    h = self._heuristic(unit, target, r, c, plane_data, valid_enemies, tactic_info, all_units)
                    score = q + h
                    if score > best_score:
                        best_score, best_r, best_c = score, r, c
            r, c = best_r, best_c
        action = f"r{r}c{c}"
        dist = get_hex_distance(unit.x, unit.y, target.x, target.y)
        self._last[unit.id] = (state, action, dist)
        return r, c

    def _heuristic(self, unit, target, r, c, plane_data, all_enemies, tactic_info=None, all_units=None):
        plane = plane_data.get(unit.aircraft)
        if not plane: return 0
        alt_raw = parse_val(plane['alt'][r][c])[0]
        new_alt = max(1, min(40, unit.altitude + alt_raw))
        speed = parse_val(plane['speed'][r][c])[0]
        dir_idx = DIR_ORDER.index(unit.direction) if unit.direction in DIR_ORDER else 0
        dc = c - 2
        if dc != 0:
            dir_idx = (dir_idx + (1 if dc > 0 else -1)) % 6
        new_dir = DIR_ORDER[dir_idx]
        ang = math.radians(DIR_ANGLES[new_dir])
        new_x = max(0, min(53, round(unit.x + math.cos(ang) * speed)))
        new_y = max(0, min(27, round(unit.y + math.sin(ang) * speed)))
        score = 0.0
        old_dist = get_hex_distance(unit.x, unit.y, target.x, target.y)
        new_dist = get_hex_distance(new_x, new_y, target.x, target.y)
        tactic = tactic_info.get('tactic', 'SOLO') if tactic_info else 'SOLO'
        role   = tactic_info.get('role',   'attacker') if tactic_info else 'attacker'

        if tactic == 'CHASE':
            score += (old_dist - new_dist) * 50
        elif tactic == 'FOCUS':
            score += (old_dist - new_dist) * 40
        elif tactic == 'TANK':
            if role == 'tank':
                score += (old_dist - new_dist) * 45
                arc, aspect = get_arc_aspect(new_x, new_y, new_dir,
                                              target.x, target.y, target.direction)
                if arc == '前方': score += 30
            elif role == 'surround_high':
                score += (old_dist - new_dist) * 30
                alt_adv = new_alt - target.altitude
                if 3 <= alt_adv <= 8: score += 80
                elif alt_adv < 3:     score -= 20
                arc, aspect = get_arc_aspect(new_x, new_y, new_dir,
                                              target.x, target.y, target.direction)
                if arc == '前方' and aspect in ('後方側面', '後方'): score += 60
            elif role == 'surround_low':
                score += (old_dist - new_dist) * 30
                alt_adv = new_alt - target.altitude
                if -8 <= alt_adv <= -3: score += 80
                elif alt_adv > -3:      score -= 20
                arc, aspect = get_arc_aspect(new_x, new_y, new_dir,
                                              target.x, target.y, target.direction)
                if arc == '前方' and aspect in ('後方側面', '後方'): score += 60
        elif tactic == 'PINCER':
            if role == 'pincer_front':
                score += (old_dist - new_dist) * 40
                arc, aspect = get_arc_aspect(new_x, new_y, new_dir,
                                              target.x, target.y, target.direction)
                if arc == '前方': score += 40
            elif role == 'pincer_rear':
                score += (old_dist - new_dist) * 25
                arc, aspect = get_arc_aspect(new_x, new_y, new_dir,
                                              target.x, target.y, target.direction)
                if arc == '前方' and aspect == '後方':     score += 120
                elif arc == '前方' and aspect == '後方側面': score += 80
                if all_units:
                    fronts = [u for u in all_units
                              if u.team == unit.team and u.id != unit.id
                              and u.status != 'destroyed'
                              and tactic_info.get('role') == 'pincer_front']
                    if fronts:
                        f = fronts[0]
                        my_ang  = math.atan2(new_y - target.y, new_x - target.x)
                        his_ang = math.atan2(f.y   - target.y, f.x   - target.x)
                        angle_diff = abs(math.degrees(my_ang - his_ang)) % 360
                        if angle_diff > 180: angle_diff = 360 - angle_diff
                        if angle_diff >= 120: score += 60
                        elif angle_diff >= 60: score += 30
        else:
            score += (old_dist - new_dist) * 25

        arc, aspect = get_arc_aspect(new_x, new_y, new_dir,
                                      target.x, target.y, target.direction)
        alt_diff = abs(new_alt - target.altitude)

        if arc == '前方' and aspect == '後方' and alt_diff <= 1:
            score += 120
        elif arc == '前方' and aspect == '後方' and alt_diff <= 3:
            score += 90
        elif arc == '前方' and aspect == '後方側面' and alt_diff <= 2:
            score += 60
        elif arc == '前方':
            score += 20

        if unit.missiles_hs > 0 and new_dist <= 8 and arc == '前方':
            score += 100
        if unit.missiles_rh > 0 and new_dist <= 15 and arc == '前方':
            score += 60
        if unit.gun > 0 and new_dist <= 1 and arc == '前方' and aspect in ('後方', '後方側面'):
            score += 150

        alt_adv = new_alt - target.altitude
        if role not in ('surround_high', 'surround_low'):
            if 1 <= alt_adv <= 5:  score += 25
            elif alt_adv > 8:      score -= 10

        if new_x <= 2 or new_x >= 51 or new_y <= 1 or new_y >= 26:
            score -= 30
        if target.damage == '損害あり':
            score += 40

        return score

    def reward_step(self, unit_id, new_dist, fired, hit, killed, got_shot_at=False):
        if unit_id not in self._last: return
        state, action, old_dist = self._last[unit_id]
        r = 0
        if new_dist < old_dist:   r += 3
        elif new_dist > old_dist: r -= 2
        if new_dist <= 1:  r += 8
        elif new_dist <= 4: r += 4
        elif new_dist <= 10: r += 1
        if fired:  r += 6
        if hit:    r += 18
        if killed: r += 35
        if got_shot_at: r -= 8
        next_max = self.get_best_q(state)
        self.update_q(state, action, r, next_max)

    def reward_end(self, unit_id, won, survived):
        if unit_id not in self._last: return
        state, action, _ = self._last[unit_id]
        r = 0
        if won and survived:  r = 30
        elif won:             r = 15
        elif not won and not survived: r = -20
        else:                 r = -8
        self.update_q(state, action, r, 0)

    def record_maneuver(self, r, c, hit, killed):
        key = f"r{r}c{c}"
        if key not in self.maneuver_stats:
            self.maneuver_stats[key] = {'attempts': 0, 'hits': 0, 'kills': 0}
        self.maneuver_stats[key]['attempts'] += 1
        if hit:    self.maneuver_stats[key]['hits'] += 1
        if killed: self.maneuver_stats[key]['kills'] += 1

# =====================================================
# チーム戦術エンジン
# =====================================================
class TeamTactics:
    @staticmethod
    def decide(team_units, enemy_units):
        alive_team   = [u for u in team_units  if u.status != 'destroyed']
        alive_enemy  = [u for u in enemy_units if u.status != 'destroyed']
        n_my = len(alive_team)
        n_en = len(alive_enemy)

        if n_my == 0 or n_en == 0:
            return {u.id: {'tactic': 'SOLO', 'target': None, 'role': 'attacker'} for u in alive_team}

        assignments = {}

        if n_en >= 2:
            cx = sum(e.x for e in alive_enemy) / n_en
            cy = sum(e.y for e in alive_enemy) / n_en
            isolated = max(alive_enemy, key=lambda e: get_hex_distance(int(cx), int(cy), e.x, e.y))
            iso_dist = get_hex_distance(int(cx), int(cy), isolated.x, isolated.y)
            if iso_dist >= 6:
                for u in alive_team:
                    assignments[u.id] = {'tactic': 'CHASE', 'target': isolated, 'role': 'attacker'}
                return assignments

        if n_my >= 3 and n_my > n_en:
            enemy_cx = sum(e.x for e in alive_enemy) / n_en
            enemy_cy = sum(e.y for e in alive_enemy) / n_en
            tank = min(alive_team, key=lambda u: get_hex_distance(u.x, u.y, int(enemy_cx), int(enemy_cy)))
            others = [u for u in alive_team if u.id != tank.id]
            focus_target = TeamTactics._pick_focus_target(alive_team, alive_enemy)
            assignments[tank.id] = {'tactic': 'TANK', 'target': focus_target, 'role': 'tank'}
            for i, u in enumerate(others):
                role = 'surround_high' if i % 2 == 0 else 'surround_low'
                assignments[u.id] = {'tactic': 'TANK', 'target': focus_target, 'role': role}
            return assignments

        focus_target = TeamTactics._pick_focus_target(alive_team, alive_enemy)
        if focus_target and (n_my >= n_en or focus_target.damage == '損害あり'):
            for u in alive_team:
                assignments[u.id] = {'tactic': 'FOCUS', 'target': focus_target, 'role': 'attacker'}
            return assignments

        if n_my >= 2 and n_en == 1:
            target = alive_enemy[0]
            sorted_team = sorted(alive_team, key=lambda u: get_hex_distance(u.x, u.y, target.x, target.y))
            assignments[sorted_team[0].id] = {'tactic': 'PINCER', 'target': target, 'role': 'pincer_front'}
            for u in sorted_team[1:]:
                assignments[u.id] = {'tactic': 'PINCER', 'target': target, 'role': 'pincer_rear'}
            return assignments

        for u in alive_team:
            nearest = min(alive_enemy, key=lambda e: get_hex_distance(u.x, u.y, e.x, e.y))
            assignments[u.id] = {'tactic': 'SOLO', 'target': nearest, 'role': 'attacker'}
        return assignments

    @staticmethod
    def _pick_focus_target(team_units, enemy_units):
        damaged = [e for e in enemy_units if e.damage == '損害あり']
        if damaged:
            cx = sum(u.x for u in team_units) / len(team_units)
            cy = sum(u.y for u in team_units) / len(team_units)
            return min(damaged, key=lambda e: get_hex_distance(int(cx), int(cy), e.x, e.y))
        cx = sum(u.x for u in team_units) / len(team_units)
        cy = sum(u.y for u in team_units) / len(team_units)
        return min(enemy_units, key=lambda e: get_hex_distance(int(cx), int(cy), e.x, e.y))


def resolve_attack(attacker, target, gun_chart, hs_chart, rh_chart):
    """射撃判定。返値: ('kill'|'hit'|'miss'|'skip')"""
    dist = get_hex_distance(attacker.x, attacker.y, target.x, target.y)
    alt_diff = abs(attacker.altitude - target.altitude)
    arc, aspect = get_arc_aspect(attacker.x, attacker.y, attacker.direction,
                                  target.x, target.y, target.direction)
    mtype = attacker.missile_type

    def roll(): return random.randint(1,6) + random.randint(1,6)

    if attacker.gun > 0 and arc == '前方' and dist <= 1 and alt_diff <= 1 and aspect in ('後方','後方側面'):
        val = gun_chart.get(attacker.gun_type, {}).get(aspect, [0,0,0])
        needed = val[dist] if dist < len(val) else 0
        if needed > 0:
            r = roll()
            if r <= needed:
                target.status = 'destroyed'
                return 'kill', dist, aspect, 'GUN'
            elif r <= needed + 2:
                target.damage = '損害あり'
                return 'hit', dist, aspect, 'GUN'
        return 'miss', dist, aspect, 'GUN'

    hs_val = get_missile_value(hs_chart, mtype, dist) if attacker.missiles_hs > 0 and arc == '前方' and alt_diff <= 2 else 0
    rh_val = get_missile_value(rh_chart, mtype, dist) if attacker.missiles_rh > 0 and arc == '前方' and alt_diff <= 3 else 0

    use_hs = hs_val > 0 and (dist <= 8 or rh_val == 0)
    use_rh = rh_val > 0 and not use_hs

    if use_hs:
        attacker.missiles_hs -= 1
        r = roll()
        if r <= hs_val:
            target.status = 'destroyed'
            return 'kill', dist, aspect, 'HS'
        return 'miss', dist, aspect, 'HS'

    if use_rh:
        attacker.missiles_rh -= 1
        r = roll()
        if r <= rh_val:
            target.status = 'destroyed'
            return 'kill', dist, aspect, 'RH'
        return 'miss', dist, aspect, 'RH'

    return 'skip', dist, aspect, None

# =====================================================
# 【NEW】包囲形態分類
# 的機の向きを基準に、攻撃側の包囲方向を分類する
#   left_right  : 左右から挟んでいる（横断スパン >= 3ヘックス）
#   up_down     : 上下（高度）から挟んでいる（高度差 >= 4）
#   front_back  : 前後から挟んでいる（縦断スパン >= 3ヘックス）
#   concentrated: 一か所に固まっている
#   single      : 1機のみ
# =====================================================
def classify_formation(attackers, target):
    if len(attackers) < 2:
        return 'single'

    t_ang = math.radians(DIR_ANGLES.get(target.direction, 0))
    # 前後方向（的機の進行方向）
    front_x = math.cos(t_ang)
    front_y = math.sin(t_ang)
    # 左右方向（前方に対して90度）
    right_x = -math.sin(t_ang)
    right_y  =  math.cos(t_ang)

    lateral_list = []
    depth_list   = []
    alt_list     = []

    for a in attackers:
        dx = a.x - target.x
        dy = a.y - target.y
        lateral_list.append(dx * right_x + dy * right_y)
        depth_list.append(dx * front_x  + dy * front_y)
        alt_list.append(a.altitude)

    lateral_span = max(lateral_list) - min(lateral_list)
    depth_span   = max(depth_list)   - min(depth_list)
    alt_span     = max(alt_list)     - min(alt_list)

    candidates = []
    if lateral_span >= 3: candidates.append(('left_right',  lateral_span))
    if alt_span     >= 4: candidates.append(('up_down',     alt_span))
    if depth_span   >= 3: candidates.append(('front_back',  depth_span))

    if not candidates:
        return 'concentrated'
    return max(candidates, key=lambda x: x[1])[0]


# =====================================================
# 【NEW】攻撃可能かチェック（射程・アーク判定）
# =====================================================
def is_in_attack_range(attacker, target, gun_chart, hs_chart, rh_chart):
    dist = get_hex_distance(attacker.x, attacker.y, target.x, target.y)
    alt_diff = abs(attacker.altitude - target.altitude)
    arc, aspect = get_arc_aspect(attacker.x, attacker.y, attacker.direction,
                                  target.x, target.y, target.direction)
    if arc != '前方': return False
    if attacker.gun > 0 and dist <= 1 and alt_diff <= 1 and aspect in ('後方', '後方側面'):
        return True
    mtype = attacker.missile_type
    if attacker.missiles_hs > 0 and alt_diff <= 2:
        if get_missile_value(hs_chart, mtype, dist) > 0:
            return True
    if attacker.missiles_rh > 0 and alt_diff <= 3:
        if get_missile_value(rh_chart, mtype, dist) > 0:
            return True
    return False


# =====================================================
# ユニット移動
# =====================================================
def move_unit(unit, r, c, plane_data):
    plane = plane_data.get(unit.aircraft)
    if not plane: return

    can_immelmann = (unit.prev_row == 0) and (r == 0) and (1 <= c <= 3)
    can_split_s   = (unit.prev_row == 4) and (r == 4) and (1 <= c <= 3)
    can_lateral   = (c == 2) and (r == 2 or r == 3)

    special = None
    if can_immelmann and random.random() < 0.4:
        special = 'immelmann'
    elif can_split_s and random.random() < 0.4:
        special = 'split_s'
    elif can_lateral and random.random() < 0.3:
        special = 'lateral_' + random.choice(['left', 'right'])

    unit.prev_row = unit.start_row
    unit.start_row = r
    unit.start_col = c

    alt_raw = parse_val(plane['alt'][r][c])[0]
    unit.altitude = max(1, min(40, unit.altitude + alt_raw))

    speed = parse_val(plane['speed'][r][c])[0]
    if speed <= 0: speed = 1

    dir_idx = DIR_ORDER.index(unit.direction) if unit.direction in DIR_ORDER else 0
    dc = c - 2
    if dc != 0:
        dir_idx = (dir_idx + (1 if dc > 0 else -1)) % 6

    if special == 'immelmann':
        dir_idx = (dir_idx + 3) % 6
        unit.altitude = min(40, unit.altitude + 3)
    elif special == 'split_s':
        dir_idx = (dir_idx + 3) % 6
        unit.altitude = max(1, unit.altitude - 3)
    elif special and special.startswith('lateral'):
        side = 1 if special == 'lateral_right' else -1
        perp_idx = (dir_idx + side) % 6
        perp_ang = math.radians(DIR_ANGLES[DIR_ORDER[perp_idx]])
        unit.x = max(0, min(53, round(unit.x + math.cos(perp_ang) * 2)))
        unit.y = max(0, min(27, round(unit.y + math.sin(perp_ang) * 2)))

    unit.direction = DIR_ORDER[dir_idx]
    ang = math.radians(DIR_ANGLES[unit.direction])
    unit.x = max(0, min(53, round(unit.x + math.cos(ang) * speed)))
    unit.y = max(0, min(27, round(unit.y + math.sin(ang) * speed)))

    return special

# =====================================================
# シナリオ定義（フリーシナリオのみ固定）
# =====================================================
SCENARIOS = [
    {
        'name': 'フリーシナリオ（F-4×2 vs Mig-21×4）',
        'blue': [
            ('F-4', 3, 'A', 4, 4),
            ('F-4', 3, 'A', 4, 4),
        ],
        'red': [
            ('Mig-21', 5, 'B', 2, 0),
            ('Mig-21', 5, 'B', 2, 0),
            ('Mig-21', 5, 'B', 2, 0),
            ('Mig-21', 5, 'B', 2, 0),
        ],
        'max_turns': 20
    },
]

def setup_scenario(sc):
    units = []
    map_w, map_h = 54, 28
    nb = len(sc['blue'])
    nr = len(sc['red'])

    for i, (aircraft, gun, gun_type, hs, rh) in enumerate(sc['blue']):
        y = int(map_h * (i + 1) / (nb + 1))
        alt = 15 + random.randint(0, 5)
        units.append(Unit(f"{aircraft}-B{i+1}", aircraft, 'Blue',
                          5, y, 3, alt, gun, gun_type, hs, rh))

    for i, (aircraft, gun, gun_type, hs, rh) in enumerate(sc['red']):
        y = int(map_h * (i + 1) / (nr + 1))
        alt = 15 + random.randint(0, 5)
        units.append(Unit(f"{aircraft}-R{i+1}", aircraft, 'Red',
                          48, y, 7, alt, gun, gun_type, hs, rh))
    return units

# =====================================================
# 1試合シミュレーション
# =====================================================
def run_game(sc, ai, plane_data, gun_chart, hs_chart, rh_chart):
    units = setup_scenario(sc)
    kill_by_this = {'GUN': 0, 'HS': 0, 'RH': 0}
    tactic_log = {}

    # 【NEW】同時攻撃数別ログ（Red機の攻撃のみ集計）
    # Key: 何機が同時にその的機を狙っていたか (1〜4)
    simul_log = {1: {'attacks': 0, 'hits': 0, 'kills': 0},
                 2: {'attacks': 0, 'hits': 0, 'kills': 0},
                 3: {'attacks': 0, 'hits': 0, 'kills': 0},
                 4: {'attacks': 0, 'hits': 0, 'kills': 0}}

    # 【NEW】包囲形態別ログ（Red機が的機を囲む形を分類）
    formation_log = {
        'single':       {'attacks': 0, 'hits': 0, 'kills': 0},
        'concentrated': {'attacks': 0, 'hits': 0, 'kills': 0},
        'left_right':   {'attacks': 0, 'hits': 0, 'kills': 0},
        'up_down':      {'attacks': 0, 'hits': 0, 'kills': 0},
        'front_back':   {'attacks': 0, 'hits': 0, 'kills': 0},
    }

    for turn in range(sc['max_turns']):
        alive = [u for u in units if u.status != 'destroyed']
        order = sorted(alive, key=lambda u: -u.altitude)

        blue_alive  = [u for u in units if u.team == 'Blue' and u.status != 'destroyed']
        red_alive   = [u for u in units if u.team == 'Red'  and u.status != 'destroyed']
        blue_tactics = TeamTactics.decide(blue_alive, red_alive)
        red_tactics  = TeamTactics.decide(red_alive,  blue_alive)

        # 【NEW】このターンで各Blue機に対して攻撃圏内にいるRed機を事前計算
        red_in_range_map = {}  # blue_id -> list of red units in attack range
        for blue_u in blue_alive:
            red_in_range_map[blue_u.id] = [
                r for r in red_alive
                if is_in_attack_range(r, blue_u, gun_chart, hs_chart, rh_chart)
            ]

        shot_at = set()

        for u in order:
            if u.status == 'destroyed': continue
            enemies = [e for e in units if e.team != u.team and e.status != 'destroyed']
            if not enemies: continue

            tactic_map = blue_tactics if u.team == 'Blue' else red_tactics
            tactic_info = tactic_map.get(u.id, {'tactic': 'SOLO', 'target': None, 'role': 'attacker'})
            tkey = (tactic_info['tactic'], tactic_info['role'])
            if tkey not in tactic_log:
                tactic_log[tkey] = {'count': 0, 'kills': 0, 'hits': 0}
            tactic_log[tkey]['count'] += 1

            r, c = ai.choose_action(u, enemies, plane_data, units, tactic_info)
            special = move_unit(u, r, c, plane_data)
            if special:
                tactic_log[tkey]['special'] = tactic_log[tkey].get('special', {})
                tactic_log[tkey]['special'][special] = tactic_log[tkey]['special'].get(special, 0) + 1

            enemies2 = [e for e in units if e.team != u.team and e.status != 'destroyed']
            if not enemies2: continue

            target = min(enemies2, key=lambda e: get_hex_distance(u.x, u.y, e.x, e.y))
            result, dist, aspect, weapon = resolve_attack(u, target, gun_chart, hs_chart, rh_chart)
            hit    = result in ('kill', 'hit')
            killed = result == 'kill'
            if result != 'skip':
                shot_at.add(target.id)
            if killed and weapon:
                kill_by_this[weapon] = kill_by_this.get(weapon, 0) + 1
            if hit:    tactic_log[tkey]['hits']  += 1
            if killed: tactic_log[tkey]['kills'] += 1
            ai.reward_step(u.id, dist, result != 'skip', hit, killed,
                           got_shot_at=(u.id in shot_at))
            ai.record_maneuver(r, c, hit, killed)

            # 【NEW】Red機が攻撃した場合のみ同時攻撃数・包囲形態を記録
            if u.team == 'Red' and result != 'skip' and target.team == 'Blue':
                simultaneous = red_in_range_map.get(target.id, [])
                n = max(1, min(4, len(simultaneous)))

                # 包囲形態を分類（攻撃圏内のRed機全体の配置）
                form = classify_formation(simultaneous, target) if simultaneous else 'single'

                simul_log[n]['attacks'] += 1
                if hit:    simul_log[n]['hits']   += 1
                if killed: simul_log[n]['kills']  += 1

                formation_log[form]['attacks'] += 1
                if hit:    formation_log[form]['hits']   += 1
                if killed: formation_log[form]['kills']  += 1

        blue_alive = [u for u in units if u.team == 'Blue' and u.status != 'destroyed']
        red_alive  = [u for u in units if u.team == 'Red'  and u.status != 'destroyed']
        if not blue_alive or not red_alive: break

    blue_alive = [u for u in units if u.team == 'Blue' and u.status != 'destroyed']
    red_alive  = [u for u in units if u.team == 'Red'  and u.status != 'destroyed']
    blue_kills = len([u for u in units if u.team == 'Red'  and u.status == 'destroyed'])
    red_kills  = len([u for u in units if u.team == 'Blue' and u.status == 'destroyed'])

    if blue_alive and not red_alive: winner = 'blue'
    elif red_alive and not blue_alive: winner = 'red'
    elif blue_kills > red_kills: winner = 'blue'
    elif red_kills > blue_kills: winner = 'red'
    else: winner = 'draw'

    for u in units:
        won = (winner == 'blue' and u.team == 'Blue') or (winner == 'red' and u.team == 'Red')
        survived = u.status != 'destroyed'
        ai.reward_end(u.id, won, survived)

    return winner, blue_kills, red_kills, kill_by_this, tactic_log, simul_log, formation_log

# =====================================================
# 機動名（表示用）
# =====================================================
ROW_NAMES = ['急上昇', '上昇', '水平', '降下', '急降下']
COL_NAMES = ['左急旋回', '左旋回', '直進', '右旋回', '右急旋回']

def maneuver_name(key):
    m = re.match(r'r(\d)c(\d)', key)
    if not m: return key
    r, c = int(m.group(1)), int(m.group(2))
    return f"{ROW_NAMES[r]}{COL_NAMES[c]}"

# =====================================================
# メイン
# =====================================================
DATA_FILE   = 'aircombat_q.json'
KITAI_FILE  = 'f16kitai.js'
STATAS_FILE = 'f16statas.js'

for f in [KITAI_FILE, STATAS_FILE]:
    if not os.path.exists(f):
        print(f"エラー: {f} が見つかりません")
        sys.exit(1)

plane_data = load_kitai(KITAI_FILE)
gun_chart, hs_chart, rh_chart = load_statas(STATAS_FILE)
print(f"機体データ: {list(plane_data.keys())}")
print(f"機関砲チャート: {list(gun_chart.keys())}")
print(f"固定シナリオ: フリーシナリオ（F-4×2 vs Mig-21×4）")

ai = AirCombatAI()
total_games = 0

if os.path.exists(DATA_FILE):
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        saved = json.load(f)
    ai.q_table        = saved.get('q_table', {})
    ai.maneuver_stats = saved.get('maneuver_stats', {})
    total_games       = saved.get('total_games', 0)
    print(f"既存データ読み込み: 累計{total_games}戦 / 状態数{len(ai.q_table)}")
else:
    print("新規学習を開始します。")

print()
print("=" * 55)
print("  Air Combat Game - AI学習スクリプト")
print("  F-4×2（米軍） vs Mig-21×4（ソ連）固定")
print("=" * 55)

try:
    n_str = input("\n対戦回数を入力 (例: 1000, 10000): ").strip()
    num = int(n_str)
    if num < 1: raise ValueError
except:
    print("終了します。")
    sys.exit(0)

print(f"\n{num}回の自動対戦を開始します...\n")

start = time.time()
blue_wins = red_wins = draws = 0
total_kills = [0, 0]
kill_by = {'GUN': 0, 'HS': 0, 'RH': 0}
all_tactic_log = {}

# 【NEW】累積集計用
all_simul_log = {1: {'attacks': 0, 'hits': 0, 'kills': 0},
                 2: {'attacks': 0, 'hits': 0, 'kills': 0},
                 3: {'attacks': 0, 'hits': 0, 'kills': 0},
                 4: {'attacks': 0, 'hits': 0, 'kills': 0}}
all_formation_log = {
    'single':       {'attacks': 0, 'hits': 0, 'kills': 0},
    'concentrated': {'attacks': 0, 'hits': 0, 'kills': 0},
    'left_right':   {'attacks': 0, 'hits': 0, 'kills': 0},
    'up_down':      {'attacks': 0, 'hits': 0, 'kills': 0},
    'front_back':   {'attacks': 0, 'hits': 0, 'kills': 0},
}

sc = SCENARIOS[0]  # フリーシナリオのみ

for i in range(num):
    winner, bk, rk, kb, tlog, simul_log, formation_log = run_game(
        sc, ai, plane_data, gun_chart, hs_chart, rh_chart)

    if winner == 'blue':  blue_wins += 1
    elif winner == 'red': red_wins  += 1
    else:                 draws     += 1

    total_kills[0] += bk
    total_kills[1] += rk

    for w, n in kb.items():
        kill_by[w] = kill_by.get(w, 0) + n

    for tkey, v in tlog.items():
        if tkey not in all_tactic_log:
            all_tactic_log[tkey] = {'count': 0, 'kills': 0, 'hits': 0, 'special': {}}
        all_tactic_log[tkey]['count'] += v['count']
        all_tactic_log[tkey]['kills'] += v['kills']
        all_tactic_log[tkey]['hits']  += v['hits']
        for sp, cnt in v.get('special', {}).items():
            all_tactic_log[tkey]['special'][sp] = all_tactic_log[tkey]['special'].get(sp, 0) + cnt

    for n, v in simul_log.items():
        all_simul_log[n]['attacks'] += v['attacks']
        all_simul_log[n]['hits']    += v['hits']
        all_simul_log[n]['kills']   += v['kills']

    for form, v in formation_log.items():
        all_formation_log[form]['attacks'] += v['attacks']
        all_formation_log[form]['hits']    += v['hits']
        all_formation_log[form]['kills']   += v['kills']

    if (i + 1) % 100 == 0 or i == num - 1:
        done = i + 1
        pct = done / num * 100
        elapsed = time.time() - start
        eta = elapsed / done * (num - done) if done < num else 0
        state_count = len(ai.q_table)
        bar = '█' * int(pct / 5) + '░' * (20 - int(pct / 5))
        print(
            f"  [{bar}] {done}/{num}  "
            f"Blue:{blue_wins}({blue_wins/done*100:.1f}%)  "
            f"Red:{red_wins}({red_wins/done*100:.1f}%)  "
            f"撃墜B{total_kills[0]}R{total_kills[1]}  "
            f"状態数:{state_count}  残{eta:.0f}秒   ",
            end='\r', flush=True
        )

elapsed = time.time() - start
total_games += num
total_k = total_kills[0] + total_kills[1]

print(f"\n\n完了！ {elapsed:.1f}秒  累計{total_games}戦")
print(f"Blue(F-4×2) {blue_wins}勝({blue_wins/num*100:.1f}%)"
      f" / Red(Mig-21×4) {red_wins}勝({red_wins/num*100:.1f}%)"
      f" / 引分 {draws}({draws/num*100:.1f}%)")

# キルレシオ
kl_ratio = total_kills[0] / max(total_kills[1], 1)
print(f"\n【キルレシオ】")
print(f"  Blue撃墜: {total_kills[0]}機  Red撃墜: {total_kills[1]}機  "
      f"KDR: {kl_ratio:.2f}  平均/試合: B{total_kills[0]/num:.2f} R{total_kills[1]/num:.2f}")

# 武器別撃墜
print(f"\n【武器別撃墜数】")
for w in ['GUN', 'HS', 'RH']:
    n = kill_by.get(w, 0)
    pct = n / max(total_k, 1) * 100
    label = {'GUN':'機関砲', 'HS':'HSミサイル', 'RH':'RHミサイル'}[w]
    bar = '█' * int(pct / 5)
    print(f"  {label:10s}  {n:5d}機  ({pct:5.1f}%)  {bar}")

# =====================================================
# 【NEW】同時攻撃数別集計（ソ連Mig-21）
# =====================================================
print(f"\n【同時攻撃数別集計（ソ連 Mig-21 → 米軍 F-4）】")
print(f"  {'同時機数':8s}  {'攻撃回数':>8}  {'命中率':>7}  {'撃墜率':>7}  グラフ")
print("  " + "-" * 60)
for n in [1, 2, 3, 4]:
    v = all_simul_log[n]
    a = v['attacks']
    if a == 0:
        print(f"  {n}機同時    {'なし':>8}")
        continue
    hit_pct  = v['hits']  / a * 100
    kill_pct = v['kills'] / a * 100
    bar = '█' * int(kill_pct / 2)
    print(f"  {n}機同時    {a:8d}回  {hit_pct:6.1f}%  {kill_pct:6.1f}%  {bar}")

# 最も有効な同時攻撃数を表示
best_simul = max(
    [(n, v) for n, v in all_simul_log.items() if v['attacks'] > 0],
    key=lambda x: x[1]['kills'] / x[1]['attacks'],
    default=(0, {})
)
if best_simul[0]:
    print(f"\n  → 最も撃墜率が高い同時攻撃数: {best_simul[0]}機同時")

# =====================================================
# 【NEW】包囲形態別集計（的機に対してどの方向から囲むか）
# =====================================================
FORM_LABELS = {
    'single':       '単独攻撃（1機のみ）',
    'concentrated': '集中（密集・同方向）',
    'left_right':   '左右分断（横から挟む）',
    'up_down':      '上下分断（高度差で挟む）',
    'front_back':   '前後分断（縦から挟む）',
}
print(f"\n【包囲形態別集計（的機F-4に対するMig-21の囲み方）】")
print(f"  {'形態':20s}  {'攻撃回数':>8}  {'命中率':>7}  {'撃墜率':>7}  グラフ")
print("  " + "-" * 68)
form_results = []
for form, label in FORM_LABELS.items():
    v = all_formation_log[form]
    a = v['attacks']
    if a == 0:
        print(f"  {label:20s}  {'なし':>8}")
        continue
    hit_pct  = v['hits']  / a * 100
    kill_pct = v['kills'] / a * 100
    bar = '█' * int(kill_pct / 2)
    print(f"  {label:20s}  {a:8d}回  {hit_pct:6.1f}%  {kill_pct:6.1f}%  {bar}")
    form_results.append((form, label, kill_pct, a))

if form_results:
    best_form = max(form_results, key=lambda x: x[2])
    print(f"\n  → 最も撃墜率が高い包囲形態: {best_form[1]}  ({best_form[2]:.1f}%)")

# 戦術別発動ログ
TACTIC_LABELS = {
    'SOLO':   '個人行動',
    'FOCUS':  '集中攻撃',
    'CHASE':  '孤立敵追跡',
    'TANK':   '囮＋包囲',
    'PINCER': '挟撃',
}
ROLE_LABELS = {
    'attacker':      'アタッカー',
    'tank':          '囮',
    'surround_high': '包囲（高）',
    'surround_low':  '包囲（低）',
    'pincer_front':  '挟撃（正面）',
    'pincer_rear':   '挟撃（後方）',
}
print(f"\n【戦術別発動回数・撃墜率】")
print(f"  {'戦術':12s} {'役割':12s}  {'発動数':>8}  {'命中率':>7}  {'撃墜率':>7}")
print("  " + "-" * 58)
sorted_tactics = sorted(all_tactic_log.items(), key=lambda x: -x[1]['count'])
for (tactic, role), v in sorted_tactics:
    cnt = v['count']
    hit_pct  = v['hits']  / cnt * 100 if cnt > 0 else 0
    kill_pct = v['kills'] / cnt * 100 if cnt > 0 else 0
    tname = TACTIC_LABELS.get(tactic, tactic)
    rname = ROLE_LABELS.get(role, role)
    bar = '█' * int(kill_pct / 1)
    print(f"  {tname:12s} {rname:12s}  {cnt:8d}  {hit_pct:6.1f}%  {kill_pct:6.1f}%  {bar}")

# 特殊機動集計
SPECIAL_LABELS = {
    'immelmann':    'イメルマンターン',
    'split_s':      'スプリットS',
    'lateral_left': 'ラテラルロール左',
    'lateral_right':'ラテラルロール右',
}
special_totals = {}
for v in all_tactic_log.values():
    for sp, cnt in v.get('special', {}).items():
        special_totals[sp] = special_totals.get(sp, 0) + cnt

if special_totals:
    total_sp = sum(special_totals.values())
    print(f"\n【特殊機動発動回数】  合計: {total_sp:,}回")
    for sp, cnt in sorted(special_totals.items(), key=lambda x: -x[1]):
        label = SPECIAL_LABELS.get(sp, sp)
        pct = cnt / total_sp * 100
        bar = '█' * int(pct / 2)
        print(f"  {label:18s}  {cnt:8,}回  ({pct:5.1f}%)  {bar}")

print("\n【機動別命中率トップ10】")
m_stats = [(k, v) for k, v in ai.maneuver_stats.items() if v['attempts'] >= 10]
m_stats.sort(key=lambda x: x[1]['kills'] / max(x[1]['attempts'], 1), reverse=True)
for k, v in m_stats[:10]:
    a, h, kl = v['attempts'], v['hits'], v['kills']
    print(f"  {maneuver_name(k):12s}  試行:{a:5d}  命中率:{h/a*100:5.1f}%  撃墜率:{kl/a*100:5.1f}%")

# 保存
save_data = {
    'q_table': ai.q_table,
    'maneuver_stats': ai.maneuver_stats,
    'total_games': total_games,
}
with open(DATA_FILE, 'w', encoding='utf-8') as f:
    json.dump(save_data, f, ensure_ascii=False, indent=2)
print(f"\n学習データ保存: {DATA_FILE}  (状態数:{len(ai.q_table)})")

# ai.jsへの焼き込み
try:
    ans = input("\nai.jsに焼き込みますか？ (y/n): ").strip().lower()
except EOFError:
    ans = 'n'
if ans == 'y':
    ai_js_path = 'ai.js'
    if not os.path.exists(ai_js_path):
        print(f"{ai_js_path} が見つかりません")
    else:
        with open(ai_js_path, 'r', encoding='utf-8') as f:
            ai_js = f.read()
        ai_js = re.sub(r'\n// ===AI学習データ===[\s\S]*?\}\)\(\);\n', '', ai_js)
        q_json = json.dumps(ai.q_table, ensure_ascii=False)
        inject = (
            "\n// ===AI学習データ===\n"
            f"(function(){{try{{localStorage.setItem('aircombat_q','{q_json.replace(chr(39), chr(92)+chr(39))}');}}"
            "catch(e){}})();\n"
        )
        ai_js += inject
        with open('ai_trained.js', 'w', encoding='utf-8') as f:
            f.write(ai_js)
        print("焼き込み完了 → ai_trained.js")
