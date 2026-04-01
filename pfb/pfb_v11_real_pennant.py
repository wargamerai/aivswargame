# -*- coding: utf-8 -*-
"""PFB ペナント管理システム (Ver 10.4 リアル編成・手動采配完全版)"""
import pandas as pd
import random
import time
import os
import re

TEAM_INITIALS = {
    'giant': '巨', 'tiger': '神', 'baystar': 'De', 'carp': '広', 'dragon': '中', 'swallow': 'ヤ',
    'hawk': 'ソ', 'marine': 'ロ', 'lion': '西', 'eagle': '楽', 'buffalo': 'オ', 'fighter': '日'
}

TEAM_MANAGERS = {
    '巨': ('阿部監督', 'バランス'), '神': ('藤川監督', '投手重視'), 'De': ('三浦監督', '打撃重視'),
    '広': ('新井監督', 'バランス'), '中': ('井上監督', '投手重視'), 'ヤ': ('高津監督', '打撃重視'),
    'ソ': ('小久保監督', '打撃重視'), 'ロ': ('吉井監督', '投手重視'), '西': ('西口監督', '投手重視'),
    '楽': ('三木監督', 'バランス'), 'オ': ('岸田監督', '投手重視'), '日': ('新庄監督', '攻撃重視')
}

USER_TEAM = "Hawk" # 監督が操作する自チーム

def get_team_initial(team_name):
    lower_name = team_name.lower()
    for key, initial in TEAM_INITIALS.items():
        if key in lower_name: return initial
    return team_name[:1]

# ==========================================
# 1. チーム編成 ＆ データベース
# ==========================================
class PlayerStats:
    def __init__(self, row):
        self.row = row
        self.name = str(row['氏名']).replace(' ', '　').split('　')[0]
        self.team = str(row.get('チーム', 'Unknown')).split(' ', 1)[-1]
        self.initial = get_team_initial(self.team)
        self.pos = str(row.get('ポジション', '不明'))
        
        # ▼追加：リアルなカードデータをそのまま保持
        self.pos_detail = str(row.get('守備', row.get('ポジション', '不明'))) # 守備力の詳細
        self.raw_fa = str(row.get('Fa', '-'))
        self.raw_hr = str(row.get('HR', '-'))
        self.raw_s1 = str(row.get('S1', '-'))
        self.raw_s2 = str(row.get('S2', '-'))

        # 試合数（絶対上限）の読み取り
        try:
            val = row.get('試合数', 143)
            if pd.isna(val) or str(val).strip() == '': self.max_games = 143
            else: self.max_games = int(float(str(val)))
        except: self.max_games = 143
        if self.max_games <= 0: self.max_games = 3
        if '無名' in self.name: self.max_games = 9999

        # 実績（勝・S）の読み取り
        self.real_wins = 0
        self.real_saves = 0
        if pd.notna(row.get('個人DATA')):
            data_str = str(row['個人DATA'])
            w_match = re.search(r'(\d+)勝', data_str)
            if w_match: self.real_wins = int(w_match.group(1))
            s_match = re.search(r'(\d+)S', data_str)
            if s_match: self.real_saves = int(s_match.group(1))

        # スタミナ(S)の読み取り
        self.S = 3
        if 'スタミナ' in row and pd.notna(row['スタミナ']):
            nums = re.findall(r'\d+', str(row['スタミナ']))
            if nums: self.S = int(nums[0])

        self.hr_val = 0
        if pd.notna(row.get('HR')):
            parts = str(row['HR']).split()
            if parts:
                v_str = parts[0].replace('+', '').replace('*', '')
                if v_str.replace('.', '').isdigit(): self.hr_val = int(float(v_str))

        self.appearances = 0
        self.at_bats = 0; self.hits = 0; self.homeruns = 0; self.rbis = 0; self.steals = 0
        self.innings = 0; self.runs_allowed = 0; self.wins = 0; self.losses = 0
        self.strikeouts = 0; self.saves = 0; self.holds = 0
        self.rest_days = 0

    @property
    def average(self): return self.hits / self.at_bats if self.at_bats > 0 else 0.0
    @property
    def era(self): return (self.runs_allowed * 27) / self.innings if self.innings > 0 else 0.00

def load_and_organize_teams():
    print("データを探しています...")
    possible_paths = ["Data_25.csv", "/content/Data_25.csv", "/content/drive/MyDrive/Data_25.csv"]
    file_path = next((p for p in possible_paths if os.path.exists(p)), None)
    if file_path is None: return [], {}, {}

    try: df = pd.read_csv(file_path, encoding="utf-8")
    except: df = pd.read_csv(file_path, encoding="cp932")
    if '氏名' in df.columns: df = df.dropna(subset=['氏名'])

    players = [PlayerStats(row) for _, row in df.iterrows()]
    team_dict = {}; nameless_batters = []; nameless_pitchers = []

    for p in players:
        if '無名' in p.name:
            if p.pos == '投手': nameless_pitchers.append(p)
            else: nameless_batters.append(p)
        else:
            if p.team not in team_dict: team_dict[p.team] = {'pitchers': [], 'batters': []}
            if p.pos == '投手': team_dict[p.team]['pitchers'].append(p)
            else: team_dict[p.team]['batters'].append(p)

    if not nameless_batters: nameless_batters.append(PlayerStats(pd.Series({'氏名': '無名野手(補)', 'ポジション': '外野手', '試合数': 9999, 'HR': '-'})))
    if not nameless_pitchers: nameless_pitchers.append(PlayerStats(pd.Series({'氏名': '無名投手(補)', 'ポジション': '投手', '試合数': 9999, 'スタミナ': 'S=1'})))

    rosters = {}; team_standings = {}
    for t_name, t_players in team_dict.items():
        if len(t_players['batters']) < 9: continue
        initial = get_team_initial(t_name)
        manager_data = TEAM_MANAGERS.get(initial, ('不明監督', 'バランス'))

        batters_sorted = sorted(t_players['batters'], key=lambda x: x.max_games, reverse=True)

        sp_candidates = [p for p in t_players['pitchers'] if p.S >= 4 and p.real_saves < 5]
        rp_candidates = [p for p in t_players['pitchers'] if p.S < 4 or p.real_saves >= 5]
        sp_candidates.sort(key=lambda x: (x.real_wins, x.max_games), reverse=True)
        rp_candidates.sort(key=lambda x: (x.real_saves, x.max_games), reverse=True)

        starters = sp_candidates[:6]
        if len(starters) < 6:
            needed = 6 - len(starters)
            starters.extend(rp_candidates[:needed])
            rp_candidates = rp_candidates[needed:]
        relievers = sp_candidates[6:] + rp_candidates

        lineup = []; bench = []
        needed_pos = ['捕手', '内野手', '内野手', '内野手', '内野手', '外野手', '外野手', '外野手', '指名打者']
        for p in batters_sorted:
            assigned = False
            for i, np in enumerate(needed_pos):
                if np in p.pos or (np == '指名打者'):
                    lineup.append(p); needed_pos.pop(i); assigned = True; break
            if not assigned: bench.append(p)
        while len(lineup) < 9 and bench: lineup.append(bench.pop(0))

        n_bats = [PlayerStats(b.row) for b in nameless_batters]
        n_pits = [PlayerStats(p.row) for p in nameless_pitchers]
        for b in n_bats: b.team = t_name; b.name = "無名野手(補)"; b.max_games = 9999
        for p in n_pits: p.team = t_name; p.name = "無名投手(補)"; p.max_games = 9999

        rosters[t_name] = {
            'lineup': lineup[:9], 'bench': bench,
            'starters': starters, 'relievers': relievers,
            'manager': manager_data, 'n_bats': n_bats, 'n_pits': n_pits
        }
        team_standings[t_name] = {'games': 0, 'wins': 0, 'losses': 0, 'draws': 0, 'runs_scored': 0, 'runs_allowed': 0, 'homeruns': 0}
        players.extend(n_bats); players.extend(n_pits)

    return players, rosters, team_standings

def split_leagues(rosters):
    central = {}; pacific = {}
    c_key = ['giant', 'tiger', 'baystar', 'carp', 'dragon', 'swallow', '巨', '阪', '神', 'De', '広', '中', 'ヤ']
    p_key = ['hawk', 'marine', 'lion', 'eagle', 'buffalo', 'fighter', 'ソ', 'ロ', '西', '楽', 'オ', '日']
    unassigned = []
    for t_name, data in rosters.items():
        assigned = False; lower_name = t_name.lower()
        for k in c_key:
            if k.lower() in lower_name: central[t_name] = data; assigned = True; break
        if assigned: continue
        for k in p_key:
            if k.lower() in lower_name: pacific[t_name] = data; assigned = True; break
        if not assigned: unassigned.append(t_name)
    for t_name in unassigned:
        if len(central) <= len(pacific): central[t_name] = rosters[t_name]
        else: pacific[t_name] = rosters[t_name]
    return central, pacific

def generate_league_matchups(teams):
    if len(teams) % 2 != 0: teams.append(None)
    n = len(teams); patterns = []
    for i in range(n - 1):
        pat = []
        for j in range(n // 2):
            t1, t2 = teams[j], teams[n - 1 - j]
            if t1 and t2: pat.append((t1, t2))
        teams.insert(1, teams.pop())
        patterns.append(pat)
    return patterns

def generate_unified_schedule(c_rosters, p_rosters):
    unified_schedule = []
    c_teams = list(c_rosters.keys()); p_teams = list(p_rosters.keys())
    while len(c_teams) < 6: c_teams.append(None)
    while len(p_teams) < 6: p_teams.append(None)

    c_patterns = generate_league_matchups(c_teams); p_patterns = generate_league_matchups(p_teams)

    def add_in_league_series():
        for i in range(5):
            matches = []
            if i < len(c_patterns): matches.extend(c_patterns[i])
            if i < len(p_patterns): matches.extend(p_patterns[i])
            for _ in range(3): unified_schedule.append(matches)
            unified_schedule.append(None)

    for _ in range(3): add_in_league_series()
    for i in range(6):
        inter_matches = []
        for j in range(6):
            c_t, p_t = c_teams[j], p_teams[(j + i) % 6]
            if c_t and p_t: inter_matches.append((c_t, p_t))
        for _ in range(3): unified_schedule.append(inter_matches)
        unified_schedule.append(None)
    for _ in range(5): add_in_league_series()
    for i in range(5):
        matches = []
        if i < len(c_patterns): matches.extend(c_patterns[i])
        if i < len(p_patterns): matches.extend(p_patterns[i])
        unified_schedule.append(matches); unified_schedule.append(None)
    return unified_schedule

# ==========================================
# 2. 采配選択システム（リアルデータ表示）
# ==========================================
def manual_select_lineup(team_name, roster):
    print(f"\n" + "="*70)
    print(f" ⚾ 【{team_name}】 試合前 采配ボード")
    print("="*70)
    print(" 1: 自分でスタメンを組む（先発投手 ＋ 打者9名）")
    print(" 2: オート（自動編成）で進める")
    choice = input("采配を選択してください (1 or 2): ")
    
    if choice == "1":
        print("\n▼ 先発投手を選択 (疲労なしの選手のみ表示)")
        avail_p = [p for p in roster['starters'] + roster['relievers'] if p.rest_days <= 0]
        for i, p in enumerate(avail_p):
            era_str = f"{p.era:.2f}"
            print(f" [{i:>2}] {p.name[:8]:<8} | スタミナ:S={p.S:<2} | 実績:{p.real_wins:>2}勝 {p.real_saves:>2}S | (防御率:{era_str} 登板:{p.appearances})")
        p_idx = int(input("先発投手の番号を入力: "))
        starter = avail_p[p_idx]
        
        print("\n▼ スタメン打順（1番〜9番）を選択")
        print("  ※ DH制です。投手は打席に立ちません。DH（指名打者）を含む9名の野手を選出してください。")
        print("-------------------------------------------------------------------------")
        avail_b = roster['lineup'] + roster['bench']
        for i, b in enumerate(avail_b):
            avg_str = f".{str(b.average).split('.')[-1].ljust(3, '0')[:3]}"
            # ▼修正：実際のカードの Fa, HR, S1, S2 と詳細な守備位置を表示
            print(f" [{i:>2}] {b.name[:8]:<8} | 守備: {b.pos_detail[:12]:<12} | Fa: {b.raw_fa:<8} HR: {b.raw_hr:<6} | 走(S1/S2): {b.raw_s1:>2}/{b.raw_s2:<2}")
        print("-------------------------------------------------------------------------")
        
        lineup = []
        for j in range(1, 10):
            while True:
                try:
                    b_idx = int(input(f" {j}番打者の番号を入力: "))
                    if 0 <= b_idx < len(avail_b):
                        lineup.append(avail_b[b_idx])
                        break
                    else:
                        print(" 正しい番号を入力してください。")
                except ValueError:
                    print(" 数字を入力してください。")
        return starter, lineup
    return None, None

# ==========================================
# 3. 高速ペナントエンジン
# ==========================================
def get_val(val_str, grade_idx):
    if pd.isna(val_str) or str(val_str).strip() == '': return -1
    parts = str(val_str).split()
    if len(parts) > grade_idx and parts[grade_idx] != '**':
        v_str = parts[grade_idx].replace('+', '').replace('*', '')
        try: return int(float(v_str))
        except: return -1
    return -1

class PitcherState:
    def __init__(self, p_stats):
        self.p_stats = p_stats; self.name = p_stats.name; row = p_stats.row
        self.S = p_stats.S

        self.base_G = 2
        if 'グレード' in row and pd.notna(row['グレード']):
            nums = re.findall(r'\d+', str(row['グレード']))
            if nums: self.base_G = int(nums[0])
        self.base_G = max(0, min(4, self.base_G))
        self.outs_pitched = 0; self.runs_allowed = 0

    @property
    def fatigue_penalty(self):
        pen = 0
        if self.outs_pitched >= self.S * 3: pen += 1
        if self.runs_allowed >= max(3, self.S): pen += 1
        return pen
    @property
    def G(self): return max(0, min(4, self.base_G - self.fatigue_penalty))

class PennantGameEngine:
    def __init__(self, team1_name, team2_name, rosters, team_standings, is_playoff=False, m1_starter=None, m1_lineup=None, m2_starter=None, m2_lineup=None):
        self.t1_name = team1_name; self.t2_name = team2_name
        self.standings = team_standings; self.is_playoff = is_playoff
        self.t1_roster = rosters[team1_name]; self.t2_roster = rosters[team2_name]
        self.m1_style = self.t1_roster['manager'][1]; self.m2_style = self.t2_roster['manager'][1]

        self.appeared_players = set()
        
        if m1_lineup:
            self.lineup1 = m1_lineup
            for p in m1_lineup: self.appeared_players.add(p)
        else: self.lineup1 = self.build_todays_lineup(self.t1_roster)
        
        if m2_lineup:
            self.lineup2 = m2_lineup
            for p in m2_lineup: self.appeared_players.add(p)
        else: self.lineup2 = self.build_todays_lineup(self.t2_roster)

        self.used_pitchers = {0: [], 1: []}
        self.setup_starter(0, m2_starter); self.setup_starter(1, m1_starter)
        
        self.scores = [0, 0]; self.team_hrs = [0, 0]; self.inning = 1
        self.top_bottom = 0; self.outs = 0; self.bases = [None, None, None]
        self.batter_idx = [0, 0]; self.game_over = False

    def build_todays_lineup(self, roster):
        todays = []
        for starter in roster['lineup']:
            if starter.appearances < starter.max_games or self.is_playoff: todays.append(starter)
            else:
                replacement = None
                for b_player in roster['bench']:
                    if b_player.appearances < b_player.max_games and b_player not in todays:
                        replacement = b_player; break
                if replacement: todays.append(replacement)
                else: todays.append(random.choice(roster['n_bats']))
        for p in todays: self.appeared_players.add(p)
        return todays

    def setup_starter(self, tb, manual_starter=None):
        roster = self.t2_roster if tb == 0 else self.t1_roster
        if manual_starter:
            first_p = PitcherState(manual_starter)
        else:
            avail = [p for p in roster['starters'] if p.rest_days <= 0 and (p.appearances < p.max_games or self.is_playoff)]
            if not avail: avail = [p for p in roster['relievers'] if p.rest_days <= 0 and (p.appearances < p.max_games or self.is_playoff)]
            if avail: first_p = PitcherState(avail[0])
            else: first_p = PitcherState(random.choice(roster['n_pits']))

        self.used_pitchers[1 - tb].append(first_p)
        self.appeared_players.add(first_p.p_stats)
        if tb == 0: self.current_p2 = first_p
        else: self.current_p1 = first_p

    def play_game(self):
        for inning in range(1, 10):
            self.inning = inning
            for tb in [0, 1]:
                self.top_bottom = tb
                if inning == 9 and tb == 1 and self.scores[1] > self.scores[0]: self.game_over = True; break

                self.outs = 0; self.bases = [None, None, None]
                batting_lineup = self.lineup1 if tb == 0 else self.lineup2
                defending_pitcher = self.current_p2 if tb == 0 else self.current_p1
                defending_roster = self.t2_roster if tb == 0 else self.t1_roster
                defending_style = self.m2_style if tb == 0 else self.m1_style

                while self.outs < 3 and not self.game_over:
                    old_outs = self.outs
                    outs_limit = defending_pitcher.S * 3
                    is_tired = (defending_pitcher.outs_pitched >= outs_limit) or (defending_pitcher.runs_allowed >= 4)
                    if defending_style == '投手重視' and defending_pitcher.runs_allowed >= 3 and defending_pitcher.outs_pitched >= 12:
                        is_tired = True

                    if is_tired:
                        used_stats = [up.p_stats for up in self.used_pitchers[1 - tb]]
                        avail = [p for p in defending_roster['relievers'] if p.rest_days <= 0 and p not in used_stats and (p.appearances < p.max_games or self.is_playoff)]
                        if not avail: avail = [p for p in defending_roster['starters'] if p.rest_days <= 0 and p not in used_stats and (p.appearances < p.max_games or self.is_playoff)]
                        if avail: new_p = PitcherState(avail[0])
                        else: new_p = PitcherState(random.choice(defending_roster['n_pits']))

                        if tb == 0: self.current_p2 = new_p
                        else: self.current_p1 = new_p
                        self.used_pitchers[1 - tb].append(new_p)
                        self.appeared_players.add(new_p.p_stats)
                        defending_pitcher = new_p

                    if self.bases[0] is not None and self.bases[1] is None:
                        runner = self.bases[0]
                        try: s1 = int(float(runner.row.get('S1', 0))) if pd.notna(runner.row.get('S1', 0)) else 0
                        except: s1 = 0
                        try: s2 = int(float(runner.row.get('S2', 0))) if pd.notna(runner.row.get('S2', 0)) else 0
                        except: s2 = 0
                        steal_chance = s1 + (2 if defending_style in ['攻撃重視', '打撃重視'] else 0)
                        if steal_chance > 0 and random.randint(1, 20) <= steal_chance:
                            if random.randint(1, 100) <= s2:
                                self.bases[1] = runner; self.bases[0] = None
                                if not self.is_playoff: runner.steals += 1
                            else: self.bases[0] = None; self.outs += 1; continue

                    batter_stats = batting_lineup[self.batter_idx[tb]]
                    self.appeared_players.add(batter_stats)
                    roll = random.randint(1, 100)
                    g = defending_pitcher.G
                    hr_val = get_val(batter_stats.row['HR'], g)
                    fa = get_val(batter_stats.row['Fa'], g)

                    event_type = "OUT"
                    if fa > 0 and 1 <= roll <= fa:
                        if hr_val != -1 and roll <= hr_val: event_type = "HR"
                        elif roll <= fa * 0.2: event_type = "2B"
                        else: event_type = "1B"
                    elif roll >= 80: event_type = "K"

                    if not self.is_playoff: batter_stats.at_bats += 1

                    if event_type == "HR":
                        if not self.is_playoff: batter_stats.hits += 1; batter_stats.homeruns += 1; self.team_hrs[tb] += 1
                        self._advance_and_score(4, batter_stats, defending_pitcher)
                    elif event_type == "2B":
                        if not self.is_playoff: batter_stats.hits += 1
                        self._advance_and_score(2, batter_stats, defending_pitcher)
                    elif event_type == "1B":
                        if not self.is_playoff: batter_stats.hits += 1
                        self._advance_and_score(1, batter_stats, defending_pitcher)
                    elif event_type == "K":
                        self.outs += 1
                        if not self.is_playoff: defending_pitcher.p_stats.strikeouts += 1
                    else: self.outs += 1

                    if self.outs > old_outs:
                        defending_pitcher.outs_pitched += (self.outs - old_outs)
                        if not self.is_playoff: defending_pitcher.p_stats.innings += (self.outs - old_outs)
                    
                    self.batter_idx[tb] = (self.batter_idx[tb] + 1) % 9
            if self.game_over: break

        if not self.is_playoff:
            for p in self.appeared_players: p.appearances += 1
        self._record_team_stats()

    def _advance_and_score(self, adv, batter, pitcher):
        runs = 0; new_bases = [None, None, None]
        if self.bases[2]:
            if adv >= 1: runs += 1; new_bases[2] = None
            else: new_bases[2] = self.bases[2]
        if self.bases[1]:
            if adv >= 2: runs += 1; new_bases[1] = None
            elif adv == 1: new_bases[2] = self.bases[1]
            else: new_bases[1] = self.bases[1]
        if self.bases[0]:
            if adv >= 3: runs += 1; new_bases[0] = None
            elif adv == 2: new_bases[2] = self.bases[0]
            elif adv == 1: new_bases[1] = self.bases[0]
            else: new_bases[0] = self.bases[0]

        if adv >= 4: runs += 1
        elif adv == 3: new_bases[2] = batter
        elif adv == 2: new_bases[1] = batter
        elif adv == 1: new_bases[0] = batter

        self.bases = new_bases
        if runs > 0:
            self.scores[self.top_bottom] += runs
            pitcher.runs_allowed += runs
            if not self.is_playoff:
                pitcher.p_stats.runs_allowed += runs; batter.rbis += runs
            if self.inning >= 9 and self.top_bottom == 1 and self.scores[1] > self.scores[0]: self.game_over = True

    def _record_team_stats(self):
        for def_tb in [0, 1]:
            used_p = self.used_pitchers[def_tb]
            for p_state in used_p:
                outs = p_state.outs_pitched
                if outs >= 9: p_state.p_stats.rest_days = p_state.S
                elif outs >= 3: p_state.p_stats.rest_days = 1
                else: p_state.p_stats.rest_days = 0

        if self.is_playoff: return

        t1_s = self.standings[self.t1_name]; t2_s = self.standings[self.t2_name]
        t1_s['games'] += 1; t2_s['games'] += 1
        t1_s['runs_scored'] += self.scores[0]; t1_s['runs_allowed'] += self.scores[1]
        t2_s['runs_scored'] += self.scores[1]; t2_s['runs_allowed'] += self.scores[0]
        t1_s['homeruns'] += self.team_hrs[0]; t2_s['homeruns'] += self.team_hrs[1]

        for def_tb in [0, 1]:
            used_p = self.used_pitchers[def_tb]
            team_score = self.scores[def_tb]; opp_score = self.scores[1 - def_tb]
            if team_score > opp_score:
                win_p = used_p[0] if used_p[0].outs_pitched >= 15 else max(used_p, key=lambda p: p.outs_pitched)
                win_p.p_stats.wins += 1
                last_p = used_p[-1]; save_p = None
                if last_p != win_p and (team_score - opp_score) <= 3 and last_p.outs_pitched > 0:
                    save_p = last_p; save_p.p_stats.saves += 1
                for p_state in used_p:
                    if p_state != win_p and p_state != save_p and p_state.outs_pitched > 0: p_state.p_stats.holds += 1
            elif team_score < opp_score:
                lose_p = max(used_p, key=lambda p: p.runs_allowed)
                lose_p.p_stats.losses += 1

        if self.scores[0] > self.scores[1]: t1_s['wins'] += 1; t2_s['losses'] += 1
        elif self.scores[1] > self.scores[0]: t2_s['wins'] += 1; t1_s['losses'] += 1
        else: t1_s['draws'] += 1; t2_s['draws'] += 1

# ==========================================
# 4. 各種表示 ＆ デバッグ機能
# ==========================================
def record_ranks(c_standings, p_standings, c_history, p_history):
    def calc_wp(t): return t['wins'] / (t['wins'] + t['losses']) if (t['wins'] + t['losses']) > 0 else 0.0
    for standings, history in [(c_standings, c_history), (p_standings, p_history)]:
        sorted_teams = sorted(standings.items(), key=lambda x: calc_wp(x[1]), reverse=True)
        for rank, (t_name, t) in enumerate(sorted_teams):
            history[t_name].append(rank + 1)

def show_league_leaderboard(all_players, standings, history, league_name, rosters):
    print(f"\n=========================================================================")
    print(f" 🏆 【{league_name}】 リーグ順位表 (143試合制)")
    print(f"=========================================================================")
    print(f"{'順位':<2} {'チーム名':<6} {'監督名':<6} {'試':<3} {'勝':<3} {'敗':<3} {'分':<3} {'勝率':<6} | 4月 5月 6月 7月 8月 最終")

    def calc_wp(t): return t['wins'] / (t['wins'] + t['losses']) if t['wins'] + t['losses'] > 0 else 0.0
    sorted_teams = sorted(standings.items(), key=lambda x: calc_wp(x[1]), reverse=True)
    league_teams = [t[0] for t in sorted_teams]
    current_day = len(list(history.values())[0]) if history else 0
    milestones = [30, 60, 90, 130, 160]

    for i, (t_name, t) in enumerate(sorted_teams):
        wp = calc_wp(t); wp_str = f".{str(wp).split('.')[-1].ljust(3, '0')[:3]}" if wp > 0 else ".000"
        if wp == 1.0: wp_str = "1.000"
        m_str = ""; ranks = history[t_name]
        for ms in milestones:
            if current_day >= ms: m_str += f"{ranks[ms-1]}位 "
            else: m_str += "-   "
        if current_day >= 194: m_str += f"{ranks[-1]}位"
        else: m_str += "-  "
        manager_name = rosters[t_name]['manager'][0]
        print(f"{i+1:<3} {t_name[:5]:<6} {manager_name[:6]:<7} {t['games']:<4} {t['wins']:<4} {t['losses']:<4} {t['draws']:<4} {wp_str:<6} | {m_str}")

    avg_games = max(1, sum(t['games'] for t in standings.values()) // len(standings)) if standings else 1
    qualifying_ab = int(avg_games * 3.1); qualifying_outs = int(avg_games * 3)

    batters = [p for p in all_players if p.team in league_teams and p.at_bats > 0 and '無名' not in p.name]
    pitchers = [p for p in all_players if p.team in league_teams and p.innings > 0 and '無名' not in p.name]

    print(f"\n👑 【{league_name}】 個人成績 トップ5 (規定打席:{qualifying_ab} / 規定投球回:{qualifying_outs//3})")
    q_batters = [p for p in batters if p.at_bats >= qualifying_ab]
    print(" [打率]                  [本塁打]                [打点]                  [盗塁]")
    top_avg = sorted(q_batters, key=lambda x: x.average, reverse=True)[:5]
    top_hr = sorted(batters, key=lambda x: x.homeruns, reverse=True)[:5]
    top_rbi = sorted(batters, key=lambda x: x.rbis, reverse=True)[:5]
    top_sb = sorted(batters, key=lambda x: x.steals, reverse=True)[:5]
    for j in range(5):
        t_avg = f"{top_avg[j].name[:5]}({top_avg[j].initial}): .{str(top_avg[j].average).split('.')[-1].ljust(3,'0')[:3]}" if j < len(top_avg) else " "*14
        t_hr = f"{top_hr[j].name[:5]}({top_hr[j].initial}): {top_hr[j].homeruns:>2}本" if j < len(top_hr) and top_hr[j].homeruns > 0 else " "*14
        t_rbi = f"{top_rbi[j].name[:5]}({top_rbi[j].initial}): {top_rbi[j].rbis:>3}点" if j < len(top_rbi) and top_rbi[j].rbis > 0 else " "*14
        t_sb = f"{top_sb[j].name[:5]}({top_sb[j].initial}): {top_sb[j].steals:>2}個" if j < len(top_sb) and top_sb[j].steals > 0 else " "*14
        print(f" {j+1}. {t_avg:<16} | {j+1}. {t_hr:<15} | {j+1}. {t_rbi:<16} | {j+1}. {t_sb}")

    q_pitchers = [p for p in pitchers if p.innings >= qualifying_outs]
    print("\n [防御率]                [勝利]                  [セーブ]                [ホールド]              [奪三振]")
    top_era = sorted(q_pitchers, key=lambda x: x.era)[:5]
    top_w = sorted(pitchers, key=lambda x: x.wins, reverse=True)[:5]
    top_sv = sorted(pitchers, key=lambda x: x.saves, reverse=True)[:5]
    top_hld = sorted(pitchers, key=lambda x: x.holds, reverse=True)[:5]
    top_k = sorted(pitchers, key=lambda x: x.strikeouts, reverse=True)[:5]
    for j in range(5):
        t_era = f"{top_era[j].name[:5]}({top_era[j].initial}): {top_era[j].era:.2f}" if j < len(top_era) else " "*14
        t_w = f"{top_w[j].name[:5]}({top_w[j].initial}): {top_w[j].wins:>2}勝" if j < len(top_w) and top_w[j].wins > 0 else " "*14
        t_sv = f"{top_sv[j].name[:5]}({top_sv[j].initial}): {top_sv[j].saves:>2}S" if j < len(top_sv) and top_sv[j].saves > 0 else " "*14
        t_hld = f"{top_hld[j].name[:5]}({top_hld[j].initial}): {top_hld[j].holds:>2}H" if j < len(top_hld) and top_hld[j].holds > 0 else " "*14
        t_k = f"{top_k[j].name[:5]}({top_k[j].initial}): {top_k[j].strikeouts:>3}K" if j < len(top_k) and top_k[j].strikeouts > 0 else " "*14
        print(f" {j+1}. {t_era:<14} | {j+1}. {t_w:<15} | {j+1}. {t_sv:<15} | {j+1}. {t_hld:<15} | {j+1}. {t_k}")
    print("=========================================================================\n")

def show_team_all_stats(all_players, target_team='Hawk'):
    print(f"\n=========================================================================")
    print(f" 🦅 【{target_team}】 所属全選手 最終成績ダンプ")
    print(f"=========================================================================")
    team_players = [p for p in all_players if target_team.lower() in p.team.lower()]
    batters = [p for p in team_players if p.pos != '投手']
    pitchers = [p for p in team_players if p.pos == '投手']

    print("\n【野手成績】 (出場試合数が多い順)")
    print(f"{'選手名':<10} {'守備':<8} {'上限':<3} {'出場':<4} {'打数':<4} {'安打':<3} {'本塁打':<4} {'打点':<3} {'盗塁':<3} {'打率':<5}")
    for p in sorted(batters, key=lambda x: x.appearances, reverse=True):
        avg_str = f".{str(p.average).split('.')[-1].ljust(3, '0')[:3]}"
        print(f"{p.name[:8]:<10} {p.pos_detail[:8]:<8} {p.max_games:<4} {p.appearances:<5} {p.at_bats:<5} {p.hits:<4} {p.homeruns:<6} {p.rbis:<4} {p.steals:<4} {avg_str}")

    print("\n【投手成績】 (出場試合数が多い順)")
    print(f"{'選手名':<10} {'上限':<3} {'登板':<4} {'投球回':<5} {'勝':<2} {'敗':<2} {'S':<2} {'H':<2} {'三振':<4} {'防御率':<5}")
    for p in sorted(pitchers, key=lambda x: x.appearances, reverse=True):
        era_str = f"{p.era:.2f}"
        print(f"{p.name[:8]:<10} {p.max_games:<4} {p.appearances:<5} {p.innings//3:>3}回{p.innings%3}/3  {p.wins:<2} {p.losses:<2} {p.saves:<2} {p.holds:<2} {p.strikeouts:<4} {era_str}")
    print("=========================================================================\n")

# ==========================================
# 5. メイン進行ループ
# ==========================================
def process_day(schedule, day_idx, rosters, team_standings, c_history, p_history, c_rosters, p_rosters):
    matches = schedule[day_idx]
    if matches is None:
        for data in rosters.values():
            for p in data['starters'] + data['relievers'] + data['n_pits']:
                if p.rest_days > 0: p.rest_days -= 1
        return False
    else:
        for t1, t2 in matches:
            m1_starter, m1_lineup = None, None
            m2_starter, m2_lineup = None, None
            
            # 自チームの試合なら手動采配を呼び出し
            if USER_TEAM.lower() in t1.lower():
                m1_starter, m1_lineup = manual_select_lineup(t1, rosters[t1])
            elif USER_TEAM.lower() in t2.lower():
                m2_starter, m2_lineup = manual_select_lineup(t2, rosters[t2])

            game = PennantGameEngine(t1, t2, rosters, team_standings, False, m1_starter, m1_lineup, m2_starter, m2_lineup)
            game.play_game()
            
        record_ranks({k: team_standings[k] for k in c_rosters}, {k: team_standings[k] for k in p_rosters}, c_history, p_history)
        for data in rosters.values():
            for p in data['starters'] + data['relievers'] + data['n_pits']:
                if p.rest_days > 0: p.rest_days -= 1
        return True

def pennant_mode():
    all_players, rosters, team_standings = load_and_organize_teams()
    if not rosters: return
    c_rosters, p_rosters = split_leagues(rosters)
    c_history = {t: [] for t in c_rosters}; p_history = {t: [] for t in p_rosters}

    unified_schedule = generate_unified_schedule(c_rosters, p_rosters)
    if not unified_schedule: return

    current_day = 0; total_days = len(unified_schedule)

    print("\n" + "="*45)
    print(" 🏆 PFB ペナントレース モード 開幕！(143試合制)")
    print("="*45)

    while True:
        if current_day < total_days:
            games_played = team_standings[list(rosters.keys())[0]]['games']
            print(f"\n【現在: {games_played} 試合 消化 (残り日程: {total_days - current_day}日)】")
            
            # ▼追加・修正機能：自チームだけのカレンダー表示
            print(f"\n--- 📅 {USER_TEAM} 直近の試合日程 (向こう約1ヶ月) ---")
            end_day = min(current_day + 30, total_days)
            for d_idx in range(current_day, end_day):
                matches = unified_schedule[d_idx]
                if matches is not None:
                    for t1, t2 in matches:
                        if USER_TEAM.lower() in t1.lower() or USER_TEAM.lower() in t2.lower():
                            print(f" {d_idx + 1}日目: {get_team_initial(t1)} vs {get_team_initial(t2)}")
            print("------------------------------------------\n")
            
            print(" 1: 次の「1カード（3連戦）」を進める (自チーム試合は采配確認あり)")
            print(" 2: 1シーズン全日程（143試合）を一気にシミュレート！")
        else:
            print(f"\n【🏆 ペナントレース 全日程終了！】")

        print(" 3: いつでも確認OK！ リーグ順位表 ＆ 個人成績")
        print(f" 6: 🔍 【内部データ確認】{USER_TEAM}の全選手成績ダンプ")
        print(" 0: 終了する")
        cmd = input("コマンドを入力してください: ")

        if cmd == "0": break
        elif cmd == "1" and current_day < total_days:
            processed_games = 0
            while processed_games < 3 and current_day < total_days:
                is_match = process_day(unified_schedule, current_day, rosters, team_standings, c_history, p_history, c_rosters, p_rosters)
                current_day += 1
                if is_match: processed_games += 1
                else: break
            print("＞ スケジュールを進行しました。")
        elif cmd == "2" and current_day < total_days:
            print("\n＞ 1シーズン全日程(交流戦含む)を全力でシミュレート中...")
            start_time = time.time(); day_count = 0
            while current_day < total_days:
                process_day(unified_schedule, current_day, rosters, team_standings, c_history, p_history, c_rosters, p_rosters)
                current_day += 1; day_count += 1
                if day_count % 20 == 0 or current_day == total_days:
                    progress = int((current_day / total_days) * 100)
                    print(f"  ... {progress}% 完了 (カレンダー {current_day}/{total_days}日目) ...")
            print(f"＞ 全日程が完了しました！（所要時間: {time.time() - start_time:.1f}秒）")
        elif cmd == "3":
            c_standings = {t: team_standings[t] for t in c_rosters}
            p_standings = {t: team_standings[t] for t in p_rosters}
            show_league_leaderboard(all_players, c_standings, c_history, "セ・リーグ", c_rosters)
            show_league_leaderboard(all_players, p_standings, p_history, "パ・リーグ", p_rosters)
        elif cmd == "6": show_team_all_stats(all_players, USER_TEAM)

if __name__ == "__main__":
    pennant_mode()