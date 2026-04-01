# game.py - PFB Baseball Browser Game Engine
# Table 5/17/18/19/2/3 corrected from PFB_CHART51
import random
import pandas as pd
from io import StringIO
from js import document, console
from pyodide.ffi import create_proxy

# ============================================================
# GLOBALS
# ============================================================
df_all = None
game = None

# ============================================================
# DATA HELPERS
# ============================================================
def get_val(s, idx):
    if pd.isna(s) or str(s).strip() == '': return -1
    parts = str(s).split()
    if len(parts) <= idx: return -1
    v = parts[idx]
    if v == '**': return -1
    try: return int(v)
    except: return -1

def player_name(p):
    return str(p['氏名']).replace(' ', '　').split('　')[0]

def get_hit_direction(roll):
    ones = roll % 10
    if ones in [1,4,7]: return "レフト"
    if ones in [0,2,5,8]: return "センター"
    return "ライト"

def extract_pitcher_stats(row):
    stats = {}
    for i in range(1, 8):
        col = f'守備{chr(0xFF10+i)}'
        try:
            v = str(row.get(col, ''))
            if v and v != 'nan' and '=' in v:
                ps = v.split('=')
                if len(ps) == 2: stats[ps[0]] = ps[1]
        except: pass
    return stats

def get_team_defense(lineup, pitcher):
    d = {k:2 for k in ['P','C','1B','2B','3B','SS','LF','CF','RF','OF']}
    try:
        pv = str(pitcher.row.get('守備１', ''))
        if '=' in pv: d['P'] = int(pv.split('=')[1][0])
    except: pass
    for p in lineup:
        for i in range(1,8):
            col = f'守備{chr(0xFF10+i)}'
            try:
                v = str(p.get(col, ''))
                if not v or v == 'nan': continue
                for k in ['C','1B','2B','3B','SS','LF','CF','RF','OF']:
                    if v.startswith(k+'='):
                        rt = int(v.split('=')[1][0])
                        d[k] = max(d[k], rt)
                        if k in ['LF','CF','RF']: d['OF'] = max(d['OF'], rt)
            except: pass
    return d

def get_catcher_t(lineup):
    for p in lineup:
        if '捕手' in str(p.get('ポジション','')):
            for i in range(1,8):
                v = str(p.get(f'守備{chr(0xFF10+i)}',''))
                if 'T:' in v:
                    try: return int(v.split('T:')[1].split(')')[0].replace('+',''))
                    except: pass
    return 0

FIELDER_NAMES = {
    'P':'投手','C':'捕手','1B':'一塁手','2B':'二塁手',
    '3B':'三塁手','SS':'遊撃手','LF':'左翼手','CF':'中堅手','RF':'右翼手'
}

# ============================================================
# PITCHER STATE
# ============================================================
class PitcherState:
    def __init__(self, row):
        self.row = row
        self.name = player_name(row)
        self.arm = str(row.get('利き腕','右'))
        stats = extract_pitcher_stats(row)

        def parse(key, default='2.0'):
            g = stats.get(key, default)
            b = int(g.split('.')[0]) if g.split('.')[0].lstrip('-').isdigit() else 2
            dec = int(g.split('.')[1]) if '.' in g and g.split('.')[1].isdigit() else 0
            return max(0, min(4, b + (1 if random.randint(1,10) <= dec else 0)))

        self.base_G = parse('G')
        self.base_C = parse('C')
        self.temp_G = self.temp_C = 0
        self.K = max(0, min(4, int(stats.get('K','2')) if stats.get('K','2').isdigit() else 2))
        self.HR_mod = stats.get('HR','-')
        try: self.S = int(stats.get('S','3'))
        except: self.S = 3
        features = str(row.get('特徴',''))
        self.has_WP = 'WP' in features
        self.has_BK = 'BK' in features
        self.outs_pitched = 0
        self.runs_allowed = 0
        self.is_used = False
        self.is_starter = self.S >= 4

    @property
    def fatigue(self):
        p = 0
        if self.outs_pitched >= self.S * 3: p += 1
        if self.outs_pitched >= (self.S+2) * 3: p += 1
        if self.runs_allowed >= max(3, self.S): p += 1
        return p

    @property
    def G(self): return max(0, min(4, self.base_G + self.temp_G - self.fatigue))
    @property
    def C(self): return max(0, min(4, self.base_C + self.temp_C - self.fatigue))
    def reset_temp(self): self.temp_G = self.temp_C = 0

# ============================================================
# TABLE 5: 汎用打撃結果表 (Generic at-bat result)
# ============================================================
def table5_generic_type(ones, tens):
    """Returns (type='G'|'F'|'RARE', fielder_pos)"""
    if ones == 0: return ('RARE', None)
    elif ones == 1: return ('G', 'P' if tens%2!=0 else '2B')
    elif ones == 2: return ('F', 'SS')   # short pop
    elif ones == 3: return ('G', '1B' if tens%2!=0 else 'SS')
    elif ones == 4: return ('G', '2B')
    elif ones == 5: return ('G', '3B')
    elif ones == 6: return ('G', 'SS')
    elif ones == 7: return ('F', 'LF')
    elif ones == 8: return ('F', 'CF')
    else:           return ('F', 'RF')

# ============================================================
# TABLE 18: エラー表 内野手 (Infield error check)
# ============================================================
def table18_infield_error(fielder_pos, def_rating):
    d10 = random.randint(1,10)
    total = d10 + def_rating
    fname = FIELDER_NAMES.get(fielder_pos,'内野手')
    if total <= 6:
        return 'INFIELD_HIT', f"【内野安打！】{fname}の横を抜ける！打者1塁へ。各走者1進塁"
    elif total <= 9:
        return 'INFIELD_ERROR', f"【内野ゴロエラー！】{fname}がファンブル！打者1塁へ。各走者1進塁"
    elif total == 10:
        return 'THROWING_ERROR', f"【送球エラー！】{fname}の悪送球！打者2塁へ。各走者2進塁"
    else:
        return 'GROUNDER', None  # → 内野ゴロ表へ

# ============================================================
# TABLE 19: エラー表 外野手 (Outfield error check)
# ============================================================
def table19_outfield_error(fielder_pos, def_rating, has_r2, outs):
    d10 = random.randint(1,10)
    total = d10 + def_rating
    fname = FIELDER_NAMES.get(fielder_pos,'外野手')
    if total <= 5:
        adv_txt = "各走者2進塁" if outs==2 else "各走者1進塁"
        return 'OF_POTENTIAL', f"【ポテンヒット！】{fname}が追いつけない！打者1塁へ。{adv_txt}", 1, (2 if outs==2 else 1)
    elif total <= 7:
        if outs == 2:
            return 'OF_ERROR_2B', f"【外野フライエラー！】{fname}が落球！打者2塁へ。各走者2進塁", 2, 2
        batter_to = '1塁' if has_r2 else '2塁'
        return 'OF_ERROR', f"【外野フライエラー！】{fname}が落球！打者{batter_to}へ。各走者1進塁", (1 if has_r2 else 2), 1
    elif total == 8:
        return 'OF_THROWING_ERROR', f"【外野+送球エラー！】打者2塁へ。各走者2進塁", 2, 2
    else:
        return 'FLY_OUT', f"外野フライアウト", 0, 0

# ============================================================
# TABLE 2: 暴走表 (Aggressive baserunning)
# ============================================================
def table2_boso(runner_speed, of_def, outs, is_left_hit):
    d10 = random.randint(1,10)
    dm = 0
    if of_def >= 4: dm += 2   # strong OF → runner harder to score
    if of_def <= 2: dm -= 2   # weak OF
    if runner_speed == 'S': dm += 2  # slow runner
    if runner_speed == 'F': dm -= 2  # fast runner
    if outs == 2: dm -= 2    # 2 outs: runners go
    if is_left_hit: dm -= 4  # left field: longer throw
    total = d10 + dm
    if total <= 1:   return True,  f"セーフ！(D10:{d10}+修正:{dm}={total})"
    elif total <= 3: return True,  f"セーフ！他走者も進塁(D10:{d10}+修正:{dm}={total})"
    elif total <= 6: return False, f"ストップ（好返球）(D10:{d10}+修正:{dm}={total})"
    elif total <= 10: return 'OUT', f"アウト！他走者進塁(D10:{d10}+修正:{dm}={total})"
    else:             return 'OUT', f"アウト！レーザービーム！(D10:{d10}+修正:{dm}={total})"

# ============================================================
# GROUNDER TABLES (Tables 3, 6, 7, 8, 9, 10, 13, 14)
# ============================================================
def resolve_grounder(fielder_pos, def_rating, runners, batter, batter_speed, outs, is_forward_def=False):
    """Returns dict: outs_added, bases[3], runs, desc"""
    r1, r2, r3 = runners[0], runners[1], runners[2]
    has_r1, has_r2, has_r3 = r1 is not None, r2 is not None, r3 is not None
    d10 = random.randint(1,10)
    total = d10 + def_rating
    fname = FIELDER_NAMES.get(fielder_pos,'野手')
    nb = list(runners)
    outs_add, runs = 1, 0

    is_g1g2 = fielder_pos in ['P','C']
    is_g3g4 = fielder_pos in ['1B','2B']

    # Table 13: 満塁 通常守備
    if has_r1 and has_r2 and has_r3 and not is_forward_def:
        if total <= 5:
            runs += 1; nb = [None, r1, r2]
            desc = "打者アウト。走者全員1進塁"
        elif total == 6:
            runs += 1; nb = [batter, None, r2]; outs_add = 1
            desc = "1塁走者アウト(フォース)。打者セーフ。他走者1進塁"
        elif total == 7:
            nb = [batter, r1, r2]; nb[2] = None; outs_add = 1  # r3 out
            # Actually r3 is the 3B runner: index 2
            nb = [batter, r1, None]
            desc = "3塁走者アウト。打者セーフ。他走者1進塁"; runs = 0
        elif total == 8:
            if batter_speed == 'S': nb = [None, r1, None]; outs_add = 2; desc = "3塁走者アウト、打者もアウト(走力S)"
            else: nb = [batter, r1, None]; desc = "3塁走者アウト。打者セーフ"
        elif total == 9:
            if batter_speed != 'F': nb = [None, r1, r2]; outs_add = 2; runs += 1; desc = "1塁走者アウト、打者もアウト(走力F以外)。他走者1進塁"
            else: nb = [batter, None, r2]; outs_add = 1; runs += 1; desc = "1塁走者アウト。打者セーフ。他走者1進塁"
        elif total <= 12:
            nb = [None, None, r2]; outs_add = 2; runs += 1
            desc = "ゲッツー！1塁走者と打者アウト。2塁走者3塁へ、3塁走者生還"
        else:
            nb = [None, r1, None]; outs_add = 2
            desc = "ゲッツー！3塁走者と打者アウト。他走者1進塁"

    # Table 14: 満塁 前進守備
    elif has_r1 and has_r2 and has_r3 and is_forward_def:
        if total <= 6:
            if is_g1g2: nb = [None, r1, r2]; desc = "打者アウト。1塁→2塁、3塁そのまま"
            else:
                nb = [batter, r1, None]; runs += 1; outs_add = 0
                desc = "内野安打！打者1塁、各走者1進塁、3塁走者生還"
        elif total <= 8:
            nb = [batter, r1, r3]; outs_add = 1  # r1 out
            nb[0] = batter; nb[1] = r2; nb[2] = r3  # Wait: r1 out, batter safe, 3B stays
            nb = [batter, r2, r3]
            desc = "1塁走者アウト。打者セーフ。3塁走者そのまま"
        elif total == 9 and batter_speed == 'S':
            nb = [None, r2, r3]; outs_add = 2; desc = "1塁走者アウト、打者もアウト(走力S)"
        elif total == 10 and batter_speed != 'F':
            nb = [None, r2, r3]; outs_add = 2; desc = "1塁走者アウト、打者もアウト(走力F以外)"
        else:
            nb = [None, r2, r3]; outs_add = 2
            desc = "ゲッツー！1塁走者と打者アウト。3塁走者そのまま"

    # Table 10: 走者2塁3塁 通常守備
    elif has_r2 and has_r3 and not has_r1:
        if total <= 5:
            if is_g1g2: desc = "打者アウト。走者そのまま(G1/G2)"; nb = [None, r2, r3]
            else: runs += 1; nb = [None, None, r2]; desc = "打者アウト。走者1進塁"
        elif total <= 11:
            if is_g1g2: desc = "打者アウト。走者そのまま(G1/G2)"; nb = [None, r2, r3]
            elif fielder_pos in ['3B','SS']: desc = "打者アウト。走者そのまま(G5/G6)"; nb = [None, r2, r3]
            else: runs += 1; nb = [None, None, r2]; desc = "打者アウト。走者1進塁"
        else:
            desc = "打者アウト。走者そのまま"; nb = [None, r2, r3]

    # Table 9: 走者1塁2塁
    elif has_r1 and has_r2 and not has_r3:
        if total <= 5:
            nb = [None, r1, r2]; desc = "打者アウト。走者1進塁"
        elif total <= 7:
            nb = [batter, None, r2]; desc = "1塁走者アウト(フォース)。打者セーフ。2塁→3塁"
        elif total == 8:
            if batter_speed == 'S': nb = [None, None, r2]; outs_add = 2; desc = "1塁走者アウト、打者もアウト(走力S)"
            else: nb = [batter, None, r2]; desc = "1塁走者アウト。打者セーフ"
        elif total == 9:
            if batter_speed != 'F': nb = [None, None, r2]; outs_add = 2; desc = "ゲッツー(走力F以外)"
            else: nb = [batter, None, r2]; desc = "1塁走者アウト。打者セーフ(俊足)"
        else:
            nb = [None, None, r2]; outs_add = 2; desc = "ゲッツー！1塁走者と打者アウト"

    # Table 8: 走者3塁 前進守備
    elif has_r3 and not has_r1 and not has_r2 and is_forward_def:
        if total <= 6:
            if is_g1g2: nb = [None, None, r3]; desc = "打者アウト。3塁走者そのまま(G1/G2)"
            else: nb = [batter, None, None]; runs += 1; outs_add = 0; desc = "内野安打！打者1塁、3塁走者生還！"
        else:
            nb = [None, None, r3]; desc = "打者アウト。3塁走者そのまま"

    # Table 7: 走者3塁 通常守備
    elif has_r3 and not has_r1 and not has_r2:
        if total <= 11:
            if is_g1g2: nb = [None, None, r3]; desc = "打者アウト。3塁走者そのまま(G1/G2)"
            else: nb = [None, None, None]; runs += 1; desc = "打者アウト。3塁走者生還！"
        else:
            nb = [None, None, r3]; desc = "打者アウト。3塁走者そのまま"

    # Table 6: 走者2塁のみ
    elif has_r2 and not has_r1 and not has_r3:
        if total <= 5:
            nb = [None, None, r2]; desc = "打者アウト。2塁走者3塁へ"
        elif total <= 9:
            if is_g3g4: nb = [None, None, r2]; desc = "打者アウト。2塁走者3塁へ(G3/G4方向)"
            else: nb = [None, r2, None]; desc = "打者アウト。2塁走者そのまま"
        else:
            nb = [None, r2, None]; desc = "打者アウト。2塁走者そのまま"

    # Table 3: 走者1塁のみ
    elif has_r1 and not has_r2 and not has_r3:
        if outs >= 2:
            nb = [None, r1, None]; desc = "打者アウト。1塁走者2塁へ"
        elif total <= 5:
            nb = [None, r1, None]; desc = "打者アウト。1塁走者2塁へ"
        elif total <= 7:
            nb = [batter, None, None]; desc = "1塁走者アウト(フォース)。打者セーフ"
        elif total == 8:
            if batter_speed == 'S': nb = [None, None, None]; outs_add = 2; desc = "ゲッツー！(走力S)"
            else: nb = [batter, None, None]; desc = "1塁走者アウト。打者セーフ"
        elif total == 9:
            if batter_speed != 'F': nb = [None, None, None]; outs_add = 2; desc = "ゲッツー！(走力F以外)"
            else: nb = [batter, None, None]; desc = "1塁走者アウト。打者セーフ(俊足)"
        else:
            nb = [None, None, None]; outs_add = 2; desc = "ゲッツー！"

    # No runners
    else:
        desc = "打者アウト"; nb = [None, None, None]

    return {'outs': outs_add, 'bases': nb, 'runs': runs,
            'desc': desc, 'd10': d10, 'total': total}

# ============================================================
# TABLE 17: 珍プレイ表 (Rare play table)
# Returns (roll, text, event_type, extra_data)
# ============================================================
def table17_rare_play(pitcher, batter_row, runners, defense):
    roll = random.randint(1,100)
    has_runners = any(r is not None for r in runners)
    batter_features = str(batter_row.get('特徴',''))

    # 1-30: Error checks for specific fielders
    if roll <= 2:   pos = 'P'
    elif roll == 3: pos = 'C'
    elif roll <= 6: pos = '1B'
    elif roll <= 12: pos = '2B'
    elif roll <= 17: pos = '3B'
    elif roll <= 24: pos = 'SS'
    elif roll <= 26: pos = 'LF'
    elif roll <= 28: pos = 'CF'
    elif roll <= 30: pos = 'RF'
    else: pos = None

    if pos:
        fname = FIELDER_NAMES[pos]
        def_r = defense.get(pos, 2)
        if pos in ['LF','CF','RF']:
            return roll, f"[珍:{roll}]{fname}への打球！エラーチェック", 'RARE_OF_ERROR', (pos, def_r)
        else:
            return roll, f"[珍:{roll}]{fname}への打球！エラーチェック", 'RARE_IF_ERROR', (pos, def_r)

    # 31: Catcher HBP foul tip
    elif roll == 31:
        return roll, f"[珍:{roll}]強烈なファウルチップ！捕手に直撃（続行）", 'FOUL_TIP', None

    # 32-35: Hard grounders
    elif roll <= 35:
        pos = {32:'1B',33:'2B',34:'3B',35:'SS'}[roll]
        return roll, f"[珍:{roll}]{FIELDER_NAMES[pos]}への強いゴロ→内野ゴロ表へ", 'RARE_GROUNDER', (pos, defense.get(pos,2))

    # 36-38: Wall flies
    elif roll <= 38:
        pos = {36:'LF',37:'CF',38:'RF'}[roll]
        return roll, f"[珍:{roll}]{FIELDER_NAMES[pos]}がフェンスに激突！打者アウト。各走者タッチアップ+1", 'WALL_FLY', pos

    # 39-40: Hard grounder to pitcher
    elif roll <= 40:
        return roll, f"[珍:{roll}]投手への強いゴロ→内野ゴロ表へ", 'RARE_GROUNDER', ('P', defense.get('P',2))

    # 41-45: Strikeout with injury check
    elif roll <= 45:
        return roll, f"[珍:{roll}]三振！（負傷チェック）", 'K', None

    # 46-52: HBP with injury
    elif roll <= 52:
        return roll, f"[珍:{roll}]死球！打者は負傷チェック", 'HBP_INJURY', None

    # 53-54: Pickoff - safe
    elif roll <= 54:
        if has_runners:
            return roll, f"[珍:{roll}]牽制球！先頭走者はセーフ（盗塁スタート可）", 'PICKOFF_SAFE', None
        return roll, f"[珍:{roll}]三振（走者なし）", 'K', None

    # 55-60: Pitcher feature
    elif roll <= 60:
        if pitcher.has_WP:
            return roll, f"[珍:{roll}]ワイルドピッチ！走者1進塁", ('WP' if has_runners else 'K'), None
        elif pitcher.has_BK:
            return roll, f"[珍:{roll}]ボーク！走者1進塁", ('BALK' if has_runners else 'K'), None
        return roll, f"[珍:{roll}]四球（投手特徴）", 'BB', None

    # 61-66: Batter feature
    elif roll <= 66:
        if 'DB' in batter_features:
            return roll, f"[珍:{roll}]死球！（打者特徴DB）", 'HBP', None
        elif 'IH' in batter_features:
            return roll, f"[珍:{roll}]内野安打！（打者特徴IH）", '1B', None
        return roll, f"[珍:{roll}]三振（打者特徴チェック）", 'K', None

    # 67-70: HBP
    elif roll <= 70:
        return roll, f"[珍:{roll}]死球！打者1塁へ", 'HBP', None

    # 71-74: Pickoff out
    elif roll <= 74:
        if has_runners:
            return roll, f"[珍:{roll}]牽制球！先頭走者アウト！", 'PICKOFF_OUT', None
        return roll, f"[珍:{roll}]三振（走者なし）", 'K', None

    # 75-78: Steal chance
    elif roll <= 78:
        if has_runners:
            return roll, f"[珍:{roll}]盗塁チャンス！スタートチェックなし、成功値+10で盗塁可能", 'STEAL_CHANCE', None
        return roll, f"[珍:{roll}]三振（走者なし）", 'K', None

    # 79-90: Wild pitch
    elif roll <= 90:
        if has_runners:
            return roll, f"[珍:{roll}]ワイルドピッチ！各走者1進塁", 'WP', None
        return roll, f"[珍:{roll}]ワイルドピッチ（走者なし→三振）", 'K', None

    # 91-95: Passed ball
    elif roll <= 95:
        if has_runners:
            return roll, f"[珍:{roll}]パスボール！各走者1進塁", 'PB', None
        return roll, f"[珍:{roll}]パスボール（走者なし→三振）", 'K', None

    # 96: Balk
    elif roll == 96:
        if has_runners:
            return roll, f"[珍:{roll}]ボーク！各走者1進塁", 'BALK', None
        return roll, f"[珍:{roll}]ボーク（走者なし→三振）", 'K', None

    # 97: Complex
    elif roll == 97:
        sub = random.randint(1,10)
        if sub <= 3:
            return roll, f"[珍:{roll}-{sub}]頭部への死球！投手は危険球退場", 'HBP', None
        elif sub == 4:
            return roll, f"[珍:{roll}-{sub}]頭部への死球！打者負傷チェック", 'HBP_INJURY', None
        elif sub <= 7:
            return roll, f"[珍:{roll}-{sub}]三振", 'K', None
        else:
            return roll, f"[珍:{roll}-{sub}]三振！打者が抗議し退場（次打者へ）", 'K', None

    # 98: Triple
    elif roll == 98:
        return roll, f"[珍:{roll}]ライト方向への大きな当たり！スリーベースヒット！！", '3B', None

    # 99: HR
    elif roll == 99:
        return roll, f"[珍:{roll}]レフトスタンドへのホームラン！！！！", 'HR', None

    # 100: Rain
    else:
        sub = random.randint(1,10)
        if sub <= 4:
            return roll, f"[珍:{roll}-{sub}]突然の降雨！10分中断後再開", 'DELAY', None
        elif sub <= 8:
            return roll, f"[珍:{roll}-{sub}]大雨で60分中断！", 'DELAY', None
        else:
            return roll, f"[珍:{roll}-{sub}]ゲリラ豪雨！試合中止(コールドゲーム)！！", 'RAIN_OUT', None

# ============================================================
# AT-BAT RESOLUTION
# ============================================================
def resolve_at_bat(batter_row, pitcher, outs, runners):
    roll = random.randint(1, 100)
    g = pitcher.G

    hr_val  = get_val(batter_row['HR'], g)
    if hr_val != -1:
        if pitcher.HR_mod == '*':  hr_val -= 1
        elif pitcher.HR_mod == '**': hr_val += 1

    h2p = get_val(batter_row['2H+'], g)
    h2  = get_val(batter_row['2H'],  g)
    h3  = get_val(batter_row['3H'],  g)
    h1s = get_val(batter_row['1H*'], g)
    h1p = get_val(batter_row['1H+'], g)
    h1  = get_val(batter_row['1H'],  g)
    fa  = get_val(batter_row['Fa'],  g)

    try: walk_lo = int(batter_row['BS'])
    except: walk_lo = 51
    walk_hi = get_val(batter_row['BB'], pitcher.C)

    try: k_hi = int(batter_row['KS'])
    except: k_hi = 100
    k_lo = get_val(batter_row['K'], pitcher.K)

    if 1 <= roll <= fa:
        dir_t = get_hit_direction(roll)
        if hr_val != -1 and roll <= hr_val: return roll, f"{dir_t}スタンドへのホームラン！！(HR)", 'HR'
        elif h2p != -1 and roll <= h2p:     return roll, f"{dir_t}の頭上を越えるツーベース！(2H+)", '2B+'
        elif h2  != -1 and roll <= h2:      return roll, f"{dir_t}線を破るツーベース！(2B)", '2B'
        elif h3  != -1 and roll <= h3:      return roll, f"{dir_t}へのスリーベース！(3H)", '3B'
        elif h1s != -1 and roll <= h1s:     return roll, f"{dir_t}前クリーンヒット！(1H*)", '1H*'
        elif h1p != -1 and roll <= h1p:     return roll, f"{dir_t}へのヒット！(1H+)", '1H+'
        elif h1  != -1 and roll <= h1:      return roll, f"{dir_t}前ヒット！(1H)", '1H'
        else:
            # Fa: sacrifice fly if runner on 3B, < 2 outs
            if outs < 2 and runners[2] is not None:
                return roll, f"外野への大きなフライ！タッチアップで生還！（犠飛）", 'SF'
            # Fall to generic
            return roll, None, 'GENERIC'

    elif walk_lo <= roll <= walk_hi:
        return roll, "よく見た！四球！", 'BB'

    elif k_lo != -1 and k_lo <= roll <= k_hi:
        return roll, "三振！", 'K'

    else:
        return roll, None, 'GENERIC'

def resolve_bunt(batter_row, is_squeeze=False):
    b = 0
    try: b = int(batter_row['バント'])
    except: pass
    b = max(1, min(4, b))
    roll = random.randint(1, 100)
    if not is_squeeze:
        sm = {1:40,2:50,3:60,4:70}[b]
        fc = {1:60,2:70,3:80,4:90}[b]
        fo = {1:84,2:88,3:92,4:96}[b]
        fm = {1:96,2:97,3:98,4:99}[b]
    else:
        sm = {1:30,2:40,3:50,4:60}[b]
        fc = {1:50,2:60,3:70,4:80}[b]
        fo = {1:60,2:68,3:76,4:84}[b]
        fm = {1:80,2:84,3:88,4:92}[b]

    if roll <= 4:   return roll, "絶妙なバントヒット！打者もセーフ！", 'BUNT_HIT'
    elif roll <= 6: return roll, "バント成功！", 'BUNT_OK'
    elif roll <= sm: return roll, "送りバント成功！", 'BUNT_OK'
    elif roll <= fc: return roll, "野手選択！全員セーフ！", 'BUNT_FC'
    elif roll <= fo: return roll, "バントファウル→アウト！", 'BUNT_FAIL'
    elif roll <= fm:
        msg = "スクイズ失敗！3塁走者挟まれアウト！" if is_squeeze else "バント失敗！先頭走者アウト！"
        return roll, msg, 'BUNT_LEAD_OUT'
    else:
        return roll, "最悪！ダブルプレー！", 'BUNT_DP'

def resolve_steal(runners_list, pitcher, catcher_t=0, is_cautious=False, bonus=False):
    min_s1, min_s2, target_base = 99, 99, 2
    for r, tb in runners_list:
        try:
            s1 = int(r['S1'])
            s2 = int(r['S2'])
            if s1 < min_s1: min_s1 = s1; target_base = tb
            if s2 < min_s2: min_s2 = s2
        except: pass
    s1, s2 = min_s1, min_s2
    if len(runners_list) > 1: s1 -= 1
    if target_base == 2 and '左投' not in pitcher.arm: s1 += 1
    if is_cautious: s1 -= 2; s2 -= 20
    s2 -= (catcher_t * 5)
    if bonus: s2 += 10  # 珍プレイ盗塁チャンス

    start = random.randint(1,10)
    if start <= s1:
        success = random.randint(1,100)
        if success <= s2: return True, True, f"好スタート→盗塁成功！(D100:{success}≤{s2})"
        else: return True, False, f"スタートは切ったがアウト！(D100:{success}>{s2})"
    return False, False, f"スタート切れず(D10:{start}>{s1})"

# ============================================================
# ADVANCE RUNNERS (for hit results)
# ============================================================
def advance_runners(runners, batter_row, r1_adv, r2_adv, r3_adv, b_adv):
    """Move runners. adv=1→1B, 2→2B, 3→3B, 4→home(score)"""
    nb = [None, None, None]
    runs = 0
    r1, r2, r3 = runners

    if r3:
        if r3_adv >= 1: runs += 1
        else: nb[2] = r3

    if r2:
        if r2_adv >= 2: runs += 1
        elif r2_adv == 1: nb[2] = r2
        else: nb[1] = r2

    if r1:
        if r1_adv >= 3: runs += 1
        elif r1_adv == 2: nb[2] = r1
        elif r1_adv == 1: nb[1] = r1
        else: nb[0] = r1

    if b_adv >= 4: runs += 1
    elif b_adv == 3: nb[2] = batter_row
    elif b_adv == 2: nb[1] = batter_row
    elif b_adv == 1: nb[0] = batter_row

    return nb, runs

# ============================================================
# GAME STATE
# ============================================================
class Game:
    def __init__(self, player_team, df):
        self.df = df
        self.player_team = player_team
        self.state = 'pregame'

        # Build rosters
        pt_df = df[df['チーム'] == player_team]
        other_teams = [t for t in df['チーム'].unique() if t != player_team]
        opp_team = random.choice(other_teams) if other_teams else player_team
        self.opp_team = opp_team
        ot_df = df[df['チーム'] == opp_team]

        def build_roster(tdf):
            pit_df = tdf[tdf['ポジション'] == '投手'].reset_index(drop=True)
            bat_df = tdf[tdf['ポジション'] != '投手'].reset_index(drop=True)
            pitchers = [PitcherState(pit_df.iloc[i]) for i in range(min(5, len(pit_df)))]
            batters = [bat_df.iloc[i].to_dict() for i in range(min(15, len(bat_df)))]
            return pitchers, batters[:9], batters[9:]

        self.pitchers = [None, None]    # [player, opponent]
        self.lineups  = [[], []]
        self.benches  = [[], []]

        p0, l0, b0 = build_roster(pt_df)
        p1, l1, b1 = build_roster(ot_df)
        self.pitchers[0] = p0; self.lineups[0] = l0; self.benches[0] = b0
        self.pitchers[1] = p1; self.lineups[1] = l1; self.benches[1] = b1

        self.current_pitcher = [self.pitchers[0][0], self.pitchers[1][0]]
        self.current_pitcher[0].is_used = True
        self.current_pitcher[1].is_used = True

        self.scores = [0, 0]
        self.inning = 1
        self.half = 0  # 0=top, 1=bottom
        self.outs = 0
        self.bases = [None, None, None]
        self.batter_idx = [0, 0]

        self.inning_scores = [[], []]
        self.home_runs = []
        self.win_pitcher = None
        self.lose_pitcher = None
        self.game_over = False
        self.called = False

        # Pending action state
        self.pending = None
        self.is_auto = False
        self.pending_boso = None  # (runner, target_base, of_def, is_left)

        # Log buffer (list of strings)
        self.log = []

    @property
    def batting_side(self): return self.half
    @property
    def defending_side(self): return 1 - self.half
    @property
    def player_bats(self): return self.half == 0  # player is team 0
    @property
    def cur_pitcher(self): return self.current_pitcher[self.defending_side]
    @property
    def cur_lineup(self): return self.lineups[self.batting_side]
    @property
    def cur_bench(self): return self.benches[self.batting_side]
    @property
    def def_lineup(self): return self.lineups[self.defending_side]
    @property
    def def_bench(self): return self.benches[self.defending_side]
    @property
    def cur_batter(self): return self.cur_lineup[self.batter_idx[self.batting_side]]

    def log_add(self, text, cls=''):
        self.log.append((text, cls))

    def add_score(self, runs):
        if runs > 0:
            self.scores[self.batting_side] += runs
            self.cur_pitcher.runs_allowed += runs
            if (self.inning >= 9 and self.half == 1 and
                    self.scores[1] > self.scores[0]):
                self.log_add("【サヨナラ！！】劇的なサヨナラ決着！！！", 'sayonara')
                self.game_over = True

    def advance_batter(self):
        self.batter_idx[self.batting_side] = (self.batter_idx[self.batting_side]+1) % 9

    def get_runners_str(self):
        parts = []
        if self.bases[0]: parts.append(f"1塁:{player_name(self.bases[0])}")
        if self.bases[1]: parts.append(f"2塁:{player_name(self.bases[1])}")
        if self.bases[2]: parts.append(f"3塁:{player_name(self.bases[2])}")
        return " ".join(parts) if parts else "走者なし"

    def get_out_str(self):
        return "●"*self.outs + "○"*(3-self.outs)

    def get_defense(self):
        return get_team_defense(self.def_lineup, self.cur_pitcher)

    def can_change_pitcher(self):
        return any(not p.is_used for p in self.pitchers[self.defending_side])

    def auto_pitcher_change(self):
        if self.cur_pitcher.fatigue > 0:
            avail = [p for p in self.pitchers[self.defending_side] if not p.is_used]
            if avail:
                new_p = avail[0]
                new_p.is_used = True
                self.current_pitcher[self.defending_side] = new_p
                self.log_add(f"【自動投手交代】{new_p.name}がマウンドへ！", 'sub')

    def process_hit_result(self, event_type, batter_row, result_text):
        """Apply hit results to bases and scores"""
        r = self.bases
        is_left = "レフト" in result_text

        if event_type == 'HR':
            nb, runs = advance_runners(r, batter_row, 4,4,4,4)
            self.home_runs.append(player_name(batter_row))
        elif event_type == '3B':
            nb, runs = advance_runners(r, batter_row, 3,3,1,3)
        elif event_type in ('2B+','2B'):
            if event_type == '2B+':
                nb, runs = advance_runners(r, batter_row, 3,2,1,2)
            else:
                nb, runs = advance_runners(r, batter_row, 2,2,1,2)
        elif event_type == '1H*':
            nb, runs = advance_runners(r, batter_row, 2,2,1,1)
        elif event_type == '1H+':
            nb, runs = advance_runners(r, batter_row, 1,2,1,1)
        elif event_type == '1H':
            nb, runs = advance_runners(r, batter_row, 1,1,1,1)
        elif event_type == 'SF':
            nb = list(r); nb[2] = None; runs = 1
            self.outs += 1
        elif event_type == 'BB' or event_type == 'HBP':
            # Force advance
            if r[0] and r[1] and r[2]: nb, runs = list(r), 1
            elif r[0] and r[1]:
                nb = list(r); nb[2] = r[1]; nb[1] = r[0]; runs = 0
            elif r[0]:
                nb = list(r); nb[1] = r[0]; runs = 0
            else:
                nb = list(r); runs = 0
            nb[0] = batter_row
        else:
            nb, runs = list(r), 0

        self.bases = nb
        self.add_score(runs)
        return runs

    def handle_generic(self, roll, batter_row, is_h_and_r, is_forward_def):
        """Process generic at-bat result (Table 5)"""
        ones = roll % 10
        tens = (roll // 10) % 10
        gtype, fielder = table5_generic_type(ones, tens)
        batter_speed = str(batter_row.get('走','A')).strip()

        if gtype == 'RARE':
            self.handle_rare_play(batter_row)
            return

        defense = self.get_defense()

        if gtype == 'G':
            fname = FIELDER_NAMES.get(fielder,'野手')
            def_r = defense.get(fielder, 2)
            # First: infield error check (Table 18)
            err_type, err_msg = table18_infield_error(fielder, def_r)
            if err_type == 'GROUNDER':
                # Proceed to runner-config table
                g_result = resolve_grounder(fielder, def_r, self.bases, batter_row,
                                             batter_speed, self.outs, is_forward_def)
                self.log_add(f"{fname}ゴロ → {g_result['desc']} (D10:{g_result['d10']}+守備:{def_r}={g_result['total']})", 'out')
                self.outs += g_result['outs']
                old_bases = self.bases
                self.bases = g_result['bases']
                self.add_score(g_result['runs'])
                self.cur_pitcher.outs_pitched += g_result['outs']
            elif err_type in ('INFIELD_HIT','INFIELD_ERROR'):
                self.log_add(err_msg, 'hit')
                nb, runs = advance_runners(self.bases, batter_row, 1,1,1,1)
                self.bases = nb
                self.add_score(runs)
            elif err_type == 'THROWING_ERROR':
                self.log_add(err_msg, 'hit')
                nb, runs = advance_runners(self.bases, batter_row, 2,2,2,2)
                self.bases = nb
                self.add_score(runs)
        else:  # F (fly)
            fname = FIELDER_NAMES.get(fielder,'外野手')
            def_r = defense.get(fielder if fielder in ['LF','CF','RF'] else 'OF', 2)
            has_r2 = self.bases[1] is not None
            err_type, err_msg, b_to, r_adv = table19_outfield_error(fielder, def_r, has_r2, self.outs)

            if err_type == 'FLY_OUT':
                self.log_add(f"{fname}フライアウト", 'out')
                # Sacrifice fly check: r3 can tag up
                if self.outs < 2 and self.bases[2]:
                    sf_roll = random.randint(1,10)
                    if sf_roll <= 5:
                        self.log_add("3塁走者タッチアップで生還！", 'score')
                        self.bases[2] = None; self.add_score(1)
                    else:
                        self.log_add("3塁走者はタッチアップできず自重", 'info')
                self.outs += 1
                self.cur_pitcher.outs_pitched += 1
            else:
                self.log_add(err_msg, 'hit')
                if err_type in ('OF_POTENTIAL',):
                    nb, runs = advance_runners(self.bases, batter_row, r_adv, r_adv, r_adv, b_to)
                    self.bases = nb; self.add_score(runs)
                elif err_type in ('OF_ERROR','OF_ERROR_2B','OF_THROWING_ERROR'):
                    nb, runs = advance_runners(self.bases, batter_row, r_adv, r_adv, r_adv, b_to)
                    self.bases = nb; self.add_score(runs)

    def handle_rare_play(self, batter_row):
        """Process Table 17 rare play"""
        defense = self.get_defense()
        roll, text, event_type, extra = table17_rare_play(
            self.cur_pitcher, batter_row, self.bases, defense)
        self.log_add(text, 'rare')

        batter_speed = str(batter_row.get('走','A')).strip()

        if event_type == 'RARE_IF_ERROR':
            pos, def_r = extra
            err_type, err_msg = table18_infield_error(pos, def_r)
            if err_type == 'GROUNDER':
                g = resolve_grounder(pos, def_r, self.bases, batter_row, batter_speed, self.outs)
                self.log_add(g['desc'], 'out')
                self.outs += g['outs']; self.bases = g['bases']; self.add_score(g['runs'])
                self.cur_pitcher.outs_pitched += g['outs']
            else:
                self.log_add(err_msg, 'hit')
                adv = 2 if err_type == 'THROWING_ERROR' else 1
                nb, runs = advance_runners(self.bases, batter_row, adv,adv,adv,adv)
                self.bases = nb; self.add_score(runs)

        elif event_type == 'RARE_OF_ERROR':
            pos, def_r = extra
            has_r2 = self.bases[1] is not None
            err_type, err_msg, b_to, r_adv = table19_outfield_error(pos, def_r, has_r2, self.outs)
            self.log_add(err_msg, 'hit')
            if err_type != 'FLY_OUT':
                nb, runs = advance_runners(self.bases, batter_row, r_adv,r_adv,r_adv,b_to)
                self.bases = nb; self.add_score(runs)
            else:
                self.outs += 1; self.cur_pitcher.outs_pitched += 1

        elif event_type == 'RARE_GROUNDER':
            pos, def_r = extra
            g = resolve_grounder(pos, def_r, self.bases, batter_row, batter_speed, self.outs)
            self.log_add(g['desc'], 'out')
            self.outs += g['outs']; self.bases = g['bases']; self.add_score(g['runs'])
            self.cur_pitcher.outs_pitched += g['outs']

        elif event_type == 'WALL_FLY':
            self.outs += 1; self.cur_pitcher.outs_pitched += 1
            # Runners can tag up +1
            nb = list(self.bases)
            runs = 0
            if self.outs < 3:
                if nb[2]: runs += 1; nb[2] = None
                elif nb[1]: nb[2] = nb[1]; nb[1] = None
                elif nb[0]: nb[1] = nb[0]; nb[0] = None
            self.bases = nb; self.add_score(runs)

        elif event_type in ('WP','PB','BALK'):
            nb, runs = advance_runners(self.bases, batter_row, 1,1,1,0)
            self.bases = nb; self.add_score(runs)

        elif event_type in ('BB','HBP','HBP_INJURY','HBP_HEAD'):
            self.process_hit_result('BB', batter_row, '')
            self.advance_batter()

        elif event_type == 'K':
            self.outs += 1; self.cur_pitcher.outs_pitched += 1
            self.advance_batter()

        elif event_type in ('HR','3B','2B','1B'):
            et_map = {'HR':'HR','3B':'3B','2B':'2B','1B':'1H'}
            self.process_hit_result(et_map[event_type], batter_row, '')
            self.advance_batter()

        elif event_type == 'PICKOFF_OUT':
            # Lead runner out
            for i in [0,1,2]:
                if self.bases[i] is not None:
                    self.log_add(f"牽制でアウト！{player_name(self.bases[i])}が刺された！", 'out')
                    self.bases[i] = None; self.outs += 1; self.cur_pitcher.outs_pitched += 1
                    break

        elif event_type == 'DELAY':
            pass  # continue normally

        elif event_type == 'RAIN_OUT':
            self.called = True

        elif event_type == 'STEAL_CHANCE':
            pass  # simplified: just continue

# ============================================================
# UI DISPLAY
# ============================================================
def get_team_short(name):
    if not name: return '??'
    name = str(name)
    if ' ' in name: return name.split(' ',1)[1][:4]
    return name[:4]

def render_scoreboard():
    if not game: return
    sb = document.getElementById('scoreboard')
    p_name = get_team_short(game.player_team)
    o_name = get_team_short(game.opp_team)

    inn_row0 = "".join(f"<td>{s}</td>" for s in game.inning_scores[0])
    inn_row1 = "".join(f"<td>{s}</td>" for s in game.inning_scores[1])
    n_inn = max(len(game.inning_scores[0]), len(game.inning_scores[1]))
    # Pad with empty cells
    if len(game.inning_scores[1]) < len(game.inning_scores[0]):
        inn_row1 += "<td>-</td>"

    half_str = "表" if game.half == 0 else "裏"
    runner_icons = []
    for i, label in enumerate(['1','2','3']):
        filled = game.bases[i] is not None
        runner_icons.append(f'<span class="base-{"on" if filled else "off"}">{label}</span>')
    bases_html = " ".join(runner_icons)

    sb.innerHTML = f"""
<table class="score-table">
  <tr><th></th>{''.join(f'<th>{i+1}</th>' for i in range(max(n_inn,9)))}<th>R</th></tr>
  <tr><td class="team-name">{p_name}</td>{inn_row0}{'<td></td>'*(max(n_inn,9)-len(game.inning_scores[0]))}<td class="r-col">{game.scores[0]}</td></tr>
  <tr><td class="team-name">{o_name}</td>{inn_row1}{'<td></td>'*(max(n_inn,9)-len(game.inning_scores[1]))}<td class="r-col">{game.scores[1]}</td></tr>
</table>
<div class="status-bar">
  {game.inning}回{half_str} | アウト: {game.get_out_str()} | {bases_html} | {game.get_runners_str()}
</div>
"""

def render_log():
    log_div = document.getElementById('game-log')
    html = ""
    start = max(0, len(game.log)-80)
    for text, cls in game.log[start:]:
        escaped = text.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;')
        html += f'<div class="log-line log-{cls}">{escaped}</div>\n'
    log_div.innerHTML = html
    log_div.scrollTop = log_div.scrollHeight

def render_buttons(buttons):
    """buttons = list of (label, action_id, css_class)"""
    btn_div = document.getElementById('action-buttons')
    html = ""
    for label, action_id, css_cls in buttons:
        safe_id = action_id.replace("'","\\'")
        html += f'<button class="action-btn {css_cls}" data-action="{safe_id}">{label}</button>'
    btn_div.innerHTML = html

    # Re-attach click handlers
    for btn in btn_div.querySelectorAll('.action-btn'):
        btn.addEventListener('click', create_proxy(lambda e: handle_button(e)))

def handle_button(event):
    action = event.target.getAttribute('data-action')
    if action: process_game_action(action)

def show_team_select():
    teams = sorted(df_all['チーム'].dropna().unique())
    btns = [(str(t), f"team:{t}", 'btn-team') for t in teams]
    render_buttons(btns)
    document.getElementById('game-log').innerHTML = (
        '<div class="log-line log-info">チームを選択してください。あなたが先攻チームになります。</div>'
    )

def show_offense_menu():
    btns = [("⚾ 打て！", "hit", "btn-primary")]
    batter = game.cur_batter
    has_runners = any(b is not None for b in game.bases)
    can_bunt_val = 0
    try: can_bunt_val = int(batter.get('バント', 0))
    except: pass
    r1 = game.bases[0] is not None
    r2 = game.bases[1] is not None
    r3 = game.bases[2] is not None
    can_bunt = game.outs < 2 and can_bunt_val > 0 and has_runners
    can_squeeze = r3 and game.outs < 2
    stealable = (r1 and not r2) or (r2 and not r3)

    if can_bunt: btns.append(("🏏 送りバント", "bunt", "btn-normal"))
    if can_squeeze: btns.append(("💥 スクイズ", "squeeze", "btn-warning"))
    if stealable: btns.append(("🏃 盗塁", "steal", "btn-normal"))
    if r1 and not has_runners or True:  # H&R when r1 exists
        if r1: btns.append(("→ H&R", "hr", "btn-normal"))
    if game.cur_bench: btns.append(("🔄 代打", "pinch", "btn-sub"))
    btns.append(("⏩ AUTO", "auto", "btn-auto"))
    render_buttons(btns)

def show_defense_menu():
    btns = [("▶ 通常守備", "def_normal", "btn-primary")]
    has_runners = any(b is not None for b in game.bases)
    if has_runners:
        btns.append(("🤝 敬遠", "def_ibb", "btn-warning"))
        btns.append(("⚠ 盗塁警戒", "def_steal", "btn-normal"))
    if game.bases[2]:
        btns.append(("👆 前進守備", "def_forward", "btn-normal"))
    if game.can_change_pitcher():
        btns.append(("🔄 投手交代", "def_pitcher", "btn-sub"))
    if game.def_bench: btns.append(("🔄 野手交代", "def_fielder", "btn-sub"))
    btns.append(("⏩ AUTO", "auto", "btn-auto"))
    render_buttons(btns)

def show_next_button(label="▶ 次へ"):
    render_buttons([(label, "next", "btn-primary"), ("⏩ AUTO", "auto", "btn-auto")])

# ============================================================
# GAME FLOW
# ============================================================
def start_at_bat():
    """Setup display for current at-bat"""
    game.cur_pitcher.reset_temp()

    # Auto pitcher change if fatigued (opponent)
    if not game.player_bats:
        game.auto_pitcher_change()
    if game.player_bats:
        game.auto_pitcher_change()

    pitcher = game.cur_pitcher
    batter = game.cur_batter
    b_name = player_name(batter)
    b_pos  = batter.get('ポジション','')
    b_order = game.batter_idx[game.batting_side] + 1
    fat_str = f"【疲労{pitcher.fatigue}】" if pitcher.fatigue > 0 else ""
    inn_str = f"{pitcher.outs_pitched//3}回{pitcher.outs_pitched%3}/3"

    game.log_add(f"─────────────────────", 'sep')
    game.log_add(
        f"[{game.get_out_str()}] {game.get_runners_str()}  "
        f"{game.scores[0]}-{game.scores[1]}", 'status')
    game.log_add(
        f"▼ {fat_str}{pitcher.name}({pitcher.arm}) {inn_str} G:{pitcher.G} C:{pitcher.C} S:{pitcher.S}", 'pitcher')
    game.log_add(
        f"【{b_order}番 {b_pos}】{b_name}  走:{batter.get('走','?')} バント:{batter.get('バント','?')}", 'batter')

    render_scoreboard()
    render_log()

    if game.player_bats:
        # Player controls offense - show defense menu first? No, just offense
        show_offense_menu()
    else:
        # Opponent bats - auto resolve
        auto_resolve_at_bat()

def auto_resolve_at_bat():
    """AI/Auto plays: just hit (no bunt/steal)"""
    process_at_bat_result("hit", False, False)

def process_at_bat_result(action, is_bunt, is_squeeze, is_h_and_r=False, is_forward_def=False,
                           is_steal_caution=False):
    batter = game.cur_batter
    pitcher = game.cur_pitcher
    b_speed = str(batter.get('走','A')).strip()

    if is_bunt or is_squeeze:
        roll, text, event = resolve_bunt(batter, is_squeeze)
        game.log_add(f"ダイス[{roll:02d}]: {text}", 'bunt')
        advance_batter = True
        if event == 'BUNT_HIT':
            nb, runs = advance_runners(game.bases, batter, 1,1,1,1)
            game.bases = nb; game.add_score(runs)
        elif event == 'BUNT_OK':
            nb, runs = advance_runners(game.bases, None, 1,1,1,0)
            game.bases = nb; game.add_score(runs); game.outs += 1
            game.cur_pitcher.outs_pitched += 1
        elif event == 'BUNT_FC':
            nb, runs = advance_runners(game.bases, batter, 1,1,1,1)
            game.bases = nb; game.add_score(runs)
        elif event == 'BUNT_FAIL':
            game.outs += 1; game.cur_pitcher.outs_pitched += 1
        elif event == 'BUNT_LEAD_OUT':
            if is_squeeze and game.bases[2]:
                game.bases[2] = None
            elif game.bases[0]:
                game.bases[0] = None
            game.outs += 1; game.cur_pitcher.outs_pitched += 1
            game.bases[0] = batter
        elif event == 'BUNT_DP':
            for i in [0,1,2]:
                if game.bases[i]: game.bases[i] = None; break
            game.outs += 2; game.cur_pitcher.outs_pitched += 2
        finish_at_bat(advance_batter)
        return

    # Normal at-bat
    roll, text, event = resolve_at_bat(batter, pitcher, game.outs, game.bases)
    direction = get_hit_direction(roll)

    if event == 'GENERIC':
        ones = roll % 10
        tens = (roll // 10) % 10
        gtype, fielder = table5_generic_type(ones, tens)
        defense = game.get_defense()
        b_speed = str(batter.get('走','A')).strip()

        if gtype == 'RARE':
            game.log_add(f"ダイス[{roll:02d}]: 珍プレイ！！", 'rare')
            game.handle_rare_play(batter)
            game.advance_batter()
        elif gtype == 'G':
            fname = FIELDER_NAMES.get(fielder,'野手')
            def_r = defense.get(fielder, 2)
            game.log_add(f"ダイス[{roll:02d}]: {fname}へのゴロ...", 'out')
            err_type, err_msg = table18_infield_error(fielder, def_r)
            if err_type == 'GROUNDER':
                g = resolve_grounder(fielder, def_r, game.bases, batter,
                                      b_speed, game.outs, is_forward_def)
                game.log_add(f"  → {g['desc']}", 'out')
                game.outs += g['outs']
                game.cur_pitcher.outs_pitched += g['outs']
                game.bases = g['bases']; game.add_score(g['runs'])
            else:
                game.log_add(f"  → {err_msg}", 'hit')
                adv = 2 if err_type == 'THROWING_ERROR' else 1
                nb, runs = advance_runners(game.bases, batter, adv,adv,adv,adv)
                game.bases = nb; game.add_score(runs)
            game.advance_batter()
        else:  # F
            fname = FIELDER_NAMES.get(fielder,'外野手')
            def_r = defense.get(fielder if fielder in ['LF','CF','RF'] else 'OF', 2)
            has_r2 = game.bases[1] is not None
            game.log_add(f"ダイス[{roll:02d}]: {fname}へのフライ...", 'out')
            err_type, err_msg, b_to, r_adv = table19_outfield_error(fielder, def_r, has_r2, game.outs)
            if err_type == 'FLY_OUT':
                game.log_add(f"  → {fname}フライアウト", 'out')
                if game.outs < 2 and game.bases[2]:
                    sf = random.randint(1,10)
                    if sf <= 5:
                        game.log_add("  → 3塁走者タッチアップ！生還！", 'score')
                        game.bases[2] = None; game.add_score(1)
                game.outs += 1; game.cur_pitcher.outs_pitched += 1
            else:
                game.log_add(f"  → {err_msg}", 'hit')
                nb, runs = advance_runners(game.bases, batter, r_adv,r_adv,r_adv,b_to)
                game.bases = nb; game.add_score(runs)
            game.advance_batter()

    elif event in ('HR','3B','2B+','2B','1H*','1H+','1H','SF','BB','K','HBP'):
        game.log_add(f"ダイス[{roll:02d}]: {text}", 'hit' if event not in ('K',) else 'out')
        if event == 'K':
            game.outs += 1; game.cur_pitcher.outs_pitched += 1
            game.advance_batter()
        elif event == 'SF':
            game.outs += 1; game.cur_pitcher.outs_pitched += 1
            game.bases[2] = None; game.add_score(1)
            game.advance_batter()
        else:
            if event == 'HR': game.home_runs.append(player_name(batter))
            hit_map = {'2B+':'2B+','2B':'2B','3B':'3B','HR':'HR',
                       '1H*':'1H*','1H+':'1H+','1H':'1H','BB':'BB','HBP':'BB'}
            runs = game.process_hit_result(hit_map.get(event,event), batter, text)
            if runs > 0: game.log_add(f"  → {runs}点入った！", 'score')
            game.advance_batter()

    finish_at_bat(True)

def finish_at_bat(advance_batter_done=True):
    render_scoreboard()
    render_log()

    if game.game_over or game.called:
        end_game()
        return

    if game.outs >= 3:
        end_half_inning()
        return

    # Next at-bat
    if game.player_bats or game.is_auto:
        show_next_button("▶ 次の打席")
        game.state = 'between'
    else:
        # Auto-process next opponent at-bat
        import asyncio
        start_at_bat()

def end_half_inning():
    runs = game.scores[game.batting_side] - (game.inning_scores[game.batting_side][-1] if game.inning_scores[game.batting_side] else 0)
    # Record inning score
    if game.half == 0:
        inning_runs = game.scores[0] - sum(game.inning_scores[0])
        game.inning_scores[0].append(inning_runs)
    else:
        inning_runs = game.scores[1] - sum(game.inning_scores[1])
        game.inning_scores[1].append(inning_runs)

    game.log_add(f"=== {game.inning}回{'表' if game.half==0 else '裏'}終了 ===  {game.scores[0]}-{game.scores[1]}", 'inning')
    game.outs = 0
    game.bases = [None, None, None]

    if game.half == 0:
        game.half = 1
    else:
        game.half = 0
        game.inning += 1
        if game.inning > 12:
            end_game(); return
        if game.inning > 9 and game.scores[0] != game.scores[1]:
            end_game(); return

    render_scoreboard()
    render_log()

    half_str = "表" if game.half==0 else "裏"
    batting = game.player_team if game.half==0 else game.opp_team
    game.log_add(f"\n▶ {game.inning}回{half_str} {get_team_short(batting)}の攻撃", 'inning')
    render_log()
    show_next_button(f"▶ {game.inning}回{half_str}開始")
    game.state = 'between'

def end_game():
    if game.scores[0] > game.scores[1]:
        game.win_pitcher = game.current_pitcher[0].name
        game.lose_pitcher = game.current_pitcher[1].name
        winner = game.player_team
    elif game.scores[1] > game.scores[0]:
        game.win_pitcher = game.current_pitcher[1].name
        game.lose_pitcher = game.current_pitcher[0].name
        winner = game.opp_team
    else:
        winner = "引き分け"

    game.log_add("="*40, 'sep')
    if game.called:
        game.log_add("☔ 降雨コールドゲーム！", 'inning')
    game.log_add("【ゲームセット！】", 'inning')
    game.log_add(f"最終スコア: {get_team_short(game.player_team)} {game.scores[0]} - {game.scores[1]} {get_team_short(game.opp_team)}", 'score')
    if winner != "引き分け":
        game.log_add(f"勝利チーム: {winner}", 'score')
    if game.win_pitcher: game.log_add(f"勝利投手: {game.win_pitcher}", 'info')
    if game.lose_pitcher: game.log_add(f"敗戦投手: {game.lose_pitcher}", 'info')
    if game.home_runs:
        game.log_add(f"本塁打: {', '.join(game.home_runs)}", 'hit')
    render_scoreboard()
    render_log()
    render_buttons([("🔄 もう一度", "restart", "btn-primary")])
    game.state = 'game_over'

# ============================================================
# MAIN ACTION DISPATCHER
# ============================================================
def process_game_action(action):
    global game

    # Team selection
    if action.startswith('team:'):
        team = action[5:]
        game = Game(team, df_all)
        p_name = get_team_short(team)
        o_name = get_team_short(game.opp_team)
        game.log_add(f"試合開始！ {p_name} vs {o_name}", 'inning')
        game.log_add(f"あなたは【{p_name}】の監督です。（先攻）", 'info')
        render_scoreboard()
        start_at_bat()
        return

    if action == 'restart':
        show_team_select()
        return

    if action == 'auto':
        game.is_auto = True
        process_game_action('next')
        return

    if game is None or game.state == 'game_over': return

    if action == 'next':
        if game.state == 'between':
            game.state = 'playing'
            start_at_bat()
        return

    # Offense actions
    if action == 'hit':
        game.state = 'playing'
        process_at_bat_result("hit", False, False)

    elif action == 'bunt':
        game.state = 'playing'
        game.log_add("バントの構え！", 'bunt')
        process_at_bat_result("bunt", True, False)

    elif action == 'squeeze':
        game.state = 'playing'
        game.log_add("スクイズ！！", 'bunt')
        process_at_bat_result("squeeze", False, True)

    elif action == 'steal':
        game.state = 'playing'
        stealable = []
        if game.bases[0] and not game.bases[1]: stealable.append((game.bases[0], 2))
        if game.bases[1] and not game.bases[2]: stealable.append((game.bases[1], 3))
        if not stealable:
            game.log_add("盗塁できる走者がいません", 'info')
            show_offense_menu(); return
        catcher_t = get_catcher_t(game.def_lineup)
        started, success, msg = resolve_steal(stealable, game.cur_pitcher, catcher_t)
        game.log_add(f"盗塁チャレンジ → {msg}", 'steal')
        if started and success:
            for r, tb in sorted(stealable, key=lambda x: x[1], reverse=True):
                game.bases[tb-1] = r; game.bases[tb-2] = None
        elif started and not success:
            r, tb = stealable[0]
            game.bases[tb-2] = None; game.outs += 1
            game.cur_pitcher.outs_pitched += 1
        else:
            game.cur_pitcher.temp_G += 1
        render_scoreboard(); render_log()
        if game.outs >= 3: end_half_inning()
        else: show_next_button("▶ 次の打席")
        game.state = 'between'

    elif action == 'hr':
        game.state = 'playing'
        game.log_add("ヒットエンドラン！走者スタート！", 'steal')
        game.cur_pitcher.temp_G += 1
        game.cur_pitcher.temp_C += 1
        process_at_bat_result("hit", False, False, is_h_and_r=True)

    elif action == 'pinch':
        if not game.cur_bench:
            game.log_add("ベンチに野手がいません！", 'info')
            show_offense_menu(); return
        # Show bench players as buttons
        btns = [(f"{player_name(p)} ({p.get('ポジション','')})", f"pinch_select:{i}", "btn-sub")
                for i, p in enumerate(game.cur_bench)]
        btns.append(("キャンセル", "cancel_sub", "btn-normal"))
        render_buttons(btns)
        game.state = 'selecting_pinch'

    elif action.startswith('pinch_select:'):
        idx = int(action.split(':')[1])
        if idx < len(game.cur_bench):
            new_b = game.cur_bench.pop(idx)
            bi = game.batter_idx[game.batting_side]
            game.cur_lineup[bi] = new_b
            game.log_add(f"【代打】{player_name(new_b)} が登場！", 'sub')
        game.state = 'playing'
        show_offense_menu()

    elif action == 'cancel_sub':
        game.state = 'playing'
        show_offense_menu()

    # Defense actions (when AI is pressing buttons)
    elif action == 'def_normal':
        game.state = 'playing'
        process_at_bat_result("hit", False, False)

    elif action == 'def_ibb':
        batter = game.cur_batter
        game.log_add(f"【敬遠】{player_name(batter)}を歩かせる", 'info')
        game.process_hit_result('BB', batter, '')
        game.advance_batter()
        finish_at_bat()

    elif action == 'def_steal':
        game.cur_pitcher.temp_G += 1
        game.log_add("盗塁警戒！", 'info')
        process_at_bat_result("hit", False, False, is_steal_caution=True)

    elif action == 'def_forward':
        game.log_add("前進守備！", 'info')
        process_at_bat_result("hit", False, False, is_forward_def=True)

    elif action == 'def_pitcher':
        avail = [p for p in game.pitchers[game.defending_side] if not p.is_used]
        if not avail:
            game.log_add("ブルペンに投手がいません！", 'info')
            show_defense_menu(); return
        btns = [(f"{p.name}({p.arm}) G:{p.base_G} C:{p.base_C} S:{p.S}", f"pitcher_select:{i}", "btn-sub")
                for i, p in enumerate(avail)]
        btns.append(("キャンセル", "cancel_sub", "btn-normal"))
        render_buttons(btns)
        game.state = 'selecting_pitcher'

    elif action.startswith('pitcher_select:'):
        idx = int(action.split(':')[1])
        avail = [p for p in game.pitchers[game.defending_side] if not p.is_used]
        if idx < len(avail):
            new_p = avail[idx]
            new_p.is_used = True
            game.current_pitcher[game.defending_side] = new_p
            game.log_add(f"【投手交代】{new_p.name}がマウンドへ！", 'sub')
        game.state = 'playing'
        show_next_button("▶ 打席へ")

    elif action == 'def_fielder':
        if not game.def_bench:
            game.log_add("ベンチに野手がいません！", 'info')
            show_defense_menu(); return
        btns = [(f"{player_name(p)} ({p.get('ポジション','')})", f"def_sub_select:{i}", "btn-sub")
                for i, p in enumerate(game.def_bench)]
        btns.append(("キャンセル", "cancel_sub", "btn-normal"))
        render_buttons(btns)
        game.state = 'selecting_def_sub'

    elif action.startswith('def_sub_select:'):
        idx = int(action.split(':')[1])
        if idx < len(game.def_bench):
            new_p = game.def_bench.pop(idx)
            # Replace the last fielder in lineup (simplified)
            game.def_lineup[-1] = new_p
            game.log_add(f"【守備交代】{player_name(new_p)}が入ります", 'sub')
        game.state = 'playing'
        show_next_button("▶ 打席へ")

# ============================================================
# INITIALIZATION
# ============================================================
def init():
    global df_all
    try:
        df_all = pd.read_csv('Data_25.csv', encoding='cp932')
    except:
        df_all = pd.read_csv('Data_25.csv', encoding='utf-8')
    if '氏名' in df_all.columns:
        df_all = df_all.dropna(subset=['氏名'])
    console.log(f"PFB: loaded {len(df_all)} players")
    show_team_select()

init()
