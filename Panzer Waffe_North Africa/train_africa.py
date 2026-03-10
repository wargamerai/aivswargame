"""
Panzer Waffe 北アフリカ1942 - AI学習専用スクリプト
ターミナルで実行: python3 train_africa.py
"""

import pandas as pd
import random
import json
import sys
import os
import time
import re
from collections import defaultdict

# イベントカード（順序学習の対象）
KEY_EVENTS = {'砂漠の狐', 'モンティ'}

# =====================================================
# 人格パラメータ
# =====================================================
PERSONALITIES = {
    '電撃精鋭': (0.9, 0.2, '少数の強力な戦車で電光石火の進入を狙う'),
    '電撃物量': (0.9, 0.9, '全列に戦車を並べ一斉攻撃で圧倒する'),
    '守城精鋭': (0.1, 0.2, '最強の1両を陣地で守り長射程で削り続ける'),
    '守城物量': (0.1, 0.9, '全列に補填を続けながら地形で時間を稼ぐ'),
    'エース':   (0.5, 0.3, '勝率上位カードで組んだ最強デッキ'),
}

# エース人格のベストカード（学習結果から選定・初期値）
ACE_CARDS_DE = {'4号/F2', '3号/J', '8.8cm高射砲', 'イタリア軍戦車隊', 'ベルザリエーリ', '迂回戦術', '悪魔の園'}
ACE_CARDS_US = {'M4', 'マチルダ2', 'バレンタイン', '圧倒的物量', '弾幕射撃', 'ボックス陣地', 'チャーチルが来た'}

def random_personality():
    weights = [0.2125, 0.2125, 0.2125, 0.2125, 0.15]
    name = random.choices(list(PERSONALITIES.keys()), weights=weights, k=1)[0]
    aggr, mass, _ = PERSONALITIES[name]
    if name != 'エース':
        aggr = max(0.0, min(1.0, aggr + random.uniform(-0.15, 0.15)))
        mass = max(0.0, min(1.0, mass + random.uniform(-0.15, 0.15)))
    return name, aggr, mass

# =====================================================
# カードクラス
# =====================================================
class Card:
    def __init__(self, row):
        self.id = str(int(row['ID']))
        self.faction = row['Faction']
        self.type = row['Type']
        self.name = row['Name']
        self.short_name = str(row.get('ShortName', row['Name'])).strip() or row['Name']
        self.attack = str(int(float(row['Attack']))) if pd.notna(row['Attack']) and str(row['Attack']).strip() else "0"
        self.defense = str(row['Defense']) if pd.notna(row['Defense']) and str(row['Defense']).strip() else "0"
        self.cost = int(float(row['Cost'])) if pd.notna(row['Cost']) and str(row['Cost']).strip() else 0
        self.trait_fixed = str(row.get('Trait_Fixed', '')).strip() if pd.notna(row.get('Trait_Fixed', '')) else ''
        self.traits = [self.trait_fixed] if self.trait_fixed else []
        t1 = str(row.get('Trait1', '')).strip() if pd.notna(row.get('Trait1', '')) else ''
        t2 = str(row.get('Trait2', '')).strip() if pd.notna(row.get('Trait2', '')) else ''
        if t1: self.traits.append(t1)
        if t2: self.traits.append(t2)
        self.is_face_up = True
        self.owner = None
        self.is_decoy = False  # 欺瞞作戦フラグ

# =====================================================
# AI脳
# =====================================================
class AI_Brain:
    def __init__(self, faction):
        self.faction = faction
        self.q_table = {}
        self.card_winrates = {}
        self.synergy_table = {}
        self.event_order_table = {}
        self.no_reinforce_table = {}
        self.history = []
        self.deck_used = []
        self.intermediate_reward = 0.0
        self.alpha = 0.1
        self.gamma = 0.9
        self.events_played = []
        self.turn_count = 0
        self.personality_name = '電撃精鋭'
        self.aggression = 0.5
        self.mass_power = 0.5
        # 砂漠の狐：1ターン2回攻撃フラグ
        self.fox_active = False
        self.fox_attacks_used = 0

    def set_personality(self, name, aggr, mass):
        self.personality_name = name
        self.aggression = aggr
        self.mass_power = mass

    def load_from_dict(self, data):
        self.q_table            = data.get("q_table", {})
        self.card_winrates      = data.get("card_winrates", {})
        self.synergy_table      = data.get("synergy_table", {})
        self.event_order_table  = data.get("event_order_table", {})
        self.no_reinforce_table = data.get("no_reinforce_table", {})

    def to_dict(self):
        return {
            "q_table":            self.q_table,
            "card_winrates":      self.card_winrates,
            "synergy_table":      self.synergy_table,
            "event_order_table":  self.event_order_table,
            "no_reinforce_table": self.no_reinforce_table,
        }

    def get_state(self, my_p, en_p, terrains=None):
        parts = []
        for col in ['A','B','C']:
            my_cnt = len(my_p.platoons[col])
            en_cnt = len(en_p.platoons[col])
            my_adv = 1 if my_p.advanced[col] else 0
            en_adv = 1 if en_p.advanced[col] else 0
            my_atk = "H" if my_p.platoons[col] and int(my_p.platoons[col][0].attack) >= 3 else \
                     "M" if my_p.platoons[col] and int(my_p.platoons[col][0].attack) >= 2 else "L"
            en_def = "H" if en_p.platoons[col] and int(str(en_p.platoons[col][0].defense).split('-')[0]) >= 4 else \
                     "M" if en_p.platoons[col] and int(str(en_p.platoons[col][0].defense).split('-')[0]) >= 3 else "L"
            tr = terrains[col].name[:2] if terrains and terrains.get(col) else ""
            # イタリア軍戦車隊アタッチメント
            it = "I" if any('イタリア' in a.name for a in my_p.attachments[col]) else "N"
            parts.append(f"{col}{my_cnt}{my_adv}{my_atk}{it}v{en_cnt}{en_adv}{en_def}{tr}")
        parts.append(f"HQ{self._hq(len(my_p.headquarters))}v{self._hq(len(en_p.headquarters))}")
        my_tanks_h = len([c for c in my_p.hand if c.type=='戦車'])
        parts.append(f"H{self._hand(len(my_p.hand))}T{my_tanks_h}")
        my_ev = my_p.active_events[0].name[:2] if my_p.active_events else "no"
        en_ev = en_p.active_events[0].name[:2] if en_p.active_events else "no"
        parts.append(f"EV{my_ev}v{en_ev}")
        parts.append(f"T{self._turn_phase()}")
        return "_".join(parts)

    def _hq(self, n):
        return "0" if n==0 else "S" if n<=3 else "M" if n<=8 else "L"

    def _hand(self, n):
        return "S" if n<=1 else "M" if n<=3 else "L"

    def _turn_phase(self):
        return "E" if self.turn_count<=5 else "M" if self.turn_count<=15 else "L"

    def record_action(self, state, action_type, detail=""):
        full = f"{action_type}:{detail}" if detail else action_type
        self.history.append((str(state), full))

    def add_intermediate_reward(self, amount):
        self.intermediate_reward += amount

    def record_event_played(self, event_name, state):
        if event_name in KEY_EVENTS:
            self.events_played.append((event_name, state))

    def learn(self, final_reward):
        if not self.history: return
        reward = final_reward + self.intermediate_reward
        for state, action in reversed(self.history):
            if state not in self.q_table: self.q_table[state] = {}
            if action not in self.q_table[state]: self.q_table[state][action] = 0.0
            old_q = self.q_table[state][action]
            self.q_table[state][action] = old_q + self.alpha * (reward - old_q)
            reward = self.q_table[state][action] * self.gamma
        self.history = []
        self.intermediate_reward = 0.0

    def learn_event_order(self, won):
        if len(self.events_played) < 2:
            self.events_played = []; return
        for i in range(len(self.events_played)-1):
            e1_name, e1_state = self.events_played[i]
            e2_name, _ = self.events_played[i+1]
            order_key = f"{e1_name}->{e2_name}"
            for key in [order_key]:
                if key not in self.event_order_table:
                    self.event_order_table[key] = {"wins":0,"games":0}
                self.event_order_table[key]["games"] += 1
                if won: self.event_order_table[key]["wins"] += 1
        self.events_played = []

    def record_deck(self, deck):
        self.deck_used = [c.name for c in deck if c.type not in ['イベント','アクシデント']]

    def learn_deck(self, won):
        if not self.deck_used: return
        for name in self.deck_used:
            if name not in self.card_winrates:
                self.card_winrates[name] = {"wins":0,"games":0}
            self.card_winrates[name]["games"] += 1
            if won: self.card_winrates[name]["wins"] += 1
        for i in range(len(self.deck_used)):
            for j in range(i+1, len(self.deck_used)):
                key = "__".join(sorted([self.deck_used[i], self.deck_used[j]]))
                if key not in self.synergy_table:
                    self.synergy_table[key] = {"wins":0,"games":0}
                self.synergy_table[key]["games"] += 1
                if won: self.synergy_table[key]["wins"] += 1
        self.deck_used = []

    def get_card_score(self, card_name, deck_so_far):
        score = 0.0
        if card_name in self.card_winrates:
            wr = self.card_winrates[card_name]
            if wr["games"] >= 3:
                score += (wr["wins"]/wr["games"] - 0.5) * 100
        for existing in deck_so_far:
            key = "__".join(sorted([card_name, existing]))
            if key in self.synergy_table:
                syn = self.synergy_table[key]
                if syn["games"] >= 3:
                    score += (syn["wins"]/syn["games"] - 0.5) * 50
        return score

    def get_q_value(self, state, action_type, detail=""):
        full = f"{action_type}:{detail}" if detail else action_type
        return self.q_table.get(state, {}).get(full, 0.0)

# =====================================================
# プレイヤー
# =====================================================
class Player:
    def __init__(self, faction):
        self.faction = faction
        file_id = "Panzerwaffe_africa_ge" if faction=="ドイツ" else "Panzerwaffe_africa_uk"
        self.brain = AI_Brain(file_id)
        self.headquarters = []
        self.hand = []
        self.discard_pile = []
        self.platoons = {'A':[],'B':[],'C':[]}
        self.advanced = {'A':False,'B':False,'C':False}
        self.attachments = {'A':[],'B':[],'C':[]}
        self.active_events = []
        self.fox_extra_attack = False  # 砂漠の狐による追加攻撃権

# =====================================================
# ゲーム本体
# =====================================================
class Game:
    def __init__(self, df):
        self.df = df
        self.game_over = False
        self.winner = None
        self.player1 = Player("ドイツ")
        self.player2 = Player("連合軍")
        self.current_player = self.player1
        self.enemy_player = self.player2
        self.terrains = {'A':None,'B':None,'C':None}
        self.turn_count = 0

    def setup(self, brain1, brain2):
        self.player1.brain = brain1
        self.player2.brain = brain2
        brain1.turn_count = 0
        brain2.turn_count = 0
        brain1.events_played = []
        brain2.events_played = []
        brain1.fox_active = False
        brain1.fox_attacks_used = 0
        brain2.fox_active = False
        brain2.fox_attacks_used = 0
        p1_name, p1_aggr, p1_mass = random_personality()
        p2_name, p2_aggr, p2_mass = random_personality()
        brain1.set_personality(p1_name, p1_aggr, p1_mass)
        brain2.set_personality(p2_name, p2_aggr, p2_mass)
        deck1 = self.build_deck(self.player1)
        deck2 = self.build_deck(self.player2)
        self.setup_board(self.player1, deck1)
        self.setup_board(self.player2, deck2)
        brain1.record_deck(deck1)
        brain2.record_deck(deck2)
        if random.choice([True,False]):
            self.current_player, self.enemy_player = self.player1, self.player2
        else:
            self.current_player, self.enemy_player = self.player2, self.player1

    def build_deck(self, player):
        pool = [Card(row) for _,row in self.df.iterrows()
                if row['Faction'] == player.faction]
        events = [c for c in pool if c.type in ['イベント','アクシデント']]
        non_events = [c for c in pool if c.type not in ['イベント','アクシデント']]

        personality = player.brain.personality_name
        aggr = player.brain.aggression
        mass = player.brain.mass_power

        atk_cards = {'ベルザリエーリ','迂回戦術','圧倒的物量','イタリア軍奮闘'}
        def_cards = {'8.8cm高射砲','悪魔の園','イタリア軍戦車隊','4号スペツィアル','ボックス陣地','弾幕射撃','チャーチルが来た'}

        # ── エース人格 ──
        if personality == 'エース':
            ace_best = ACE_CARDS_DE if player.faction=='ドイツ' else ACE_CARDS_US
            deck = list(events)
            current_cost = 0
            ace_pool = sorted(
                [c for c in non_events if c.name in ace_best],
                key=lambda c: player.brain.get_card_score(c.name, []) + random.uniform(0,5),
                reverse=True
            )
            others = [c for c in non_events if c.name not in ace_best]
            ace_tanks = [c for c in ace_pool if c.type=='戦車']
            ace_supports = [c for c in ace_pool if c.type!='戦車']
            added_tanks = 0
            for c in sorted(ace_tanks, key=lambda c: c.cost, reverse=True):
                if added_tanks >= 5: break
                if current_cost + c.cost <= 30:
                    deck.append(c); current_cost += c.cost; added_tanks += 1; c._used = True
                else: c._used = False
            for c in ace_supports:
                if current_cost + c.cost <= 30:
                    deck.append(c); current_cost += c.cost
            for c in sorted(others, key=lambda c: player.brain.get_card_score(c.name,[]), reverse=True):
                if current_cost + c.cost <= 30:
                    deck.append(c); current_cost += c.cost
            player.brain.record_action("DeckBuild", personality)
            return deck

        # ── 通常人格 ──
        tanks = [c for c in non_events if c.type=='戦車']
        supports = [c for c in non_events if c.type!='戦車']
        deck = list(events)
        current_cost = 0

        if personality in ('電撃精鋭','守城精鋭'):
            tanks_sorted = sorted(tanks, key=lambda c: c.cost, reverse=True)
            tank_budget = 15; min_tanks = 3; max_tanks = 5
        else:
            tanks_sorted = sorted(tanks, key=lambda c: c.cost)
            tank_budget = 18; min_tanks = 5; max_tanks = 99

        added_tanks = 0
        for c in tanks_sorted:
            if added_tanks >= max_tanks: break
            if current_cost + c.cost <= tank_budget or added_tanks < min_tanks:
                if current_cost + c.cost <= 30:
                    deck.append(c); current_cost += c.cost; added_tanks += 1; c._used = True
                    continue
            c._used = False
        for c in tanks_sorted:
            if not getattr(c,'_used',False): c._used = False

        # 最低5枚保証
        if added_tanks < 5:
            for c in sorted(tanks, key=lambda c: c.cost):
                if added_tanks >= 5: break
                if not getattr(c,'_used',False) and current_cost+c.cost<=30:
                    deck.append(c); current_cost+=c.cost; added_tanks+=1; c._used=True

        # 支援カード
        support_scores = []
        deck_names = [c.name for c in deck]
        for c in supports:
            score = random.randint(1,10) + player.brain.get_card_score(c.name, deck_names)
            is_atk = c.name in atk_cards
            is_def = c.name in def_cards
            if personality in ('電撃精鋭','電撃物量'):
                if is_atk: score += 150
                if is_def: score -= 50
            else:
                if is_def: score += 150
                if is_atk: score -= 50
            if is_atk: score += int(aggr * 80)
            if is_def: score += int((1.0-aggr) * 80)
            support_scores.append((score, c))

        support_scores.sort(key=lambda x: x[0], reverse=True)
        for score, c in support_scores:
            if current_cost + c.cost <= 30:
                deck.append(c); current_cost += c.cost

        player.brain.record_action("DeckBuild", personality)
        return deck

    def setup_board(self, player, deck):
        tanks = [c for c in deck if c.type=='戦車' and not c.is_decoy]
        random.shuffle(tanks)
        for i, col in enumerate(['A','B','C']):
            if i < len(tanks):
                t = tanks[i]; t.is_face_up=False
                deck.remove(t); player.platoons[col].append(t)
        random.shuffle(deck)
        player.headquarters = deck
        for _ in range(4):
            if player.headquarters:
                drawn = player.headquarters.pop(0)
                # アクシデント自動発動
                if drawn.type == 'アクシデント':
                    player.active_events.append(drawn)
                else:
                    player.hand.append(drawn)

    def damage_hq(self, target, amount):
        for _ in range(amount):
            if target.headquarters:
                card = target.headquarters.pop(0)
                card.is_face_up=False; target.discard_pile.append(card)
                attacker = self.player1 if target==self.player2 else self.player2
                if attacker.brain: attacker.brain.add_intermediate_reward(0.15)
                if target.brain: target.brain.add_intermediate_reward(-0.15)
            else:
                self.game_over=True; self.winner=self.current_player; return

    def handle_annihilation(self, player, col):
        player.advanced[col]=False
        # イタリア軍戦車隊アタッチメントも除去
        for att in list(player.attachments[col]):
            player.attachments[col].remove(att)
            player.discard_pile.append(att)
        tanks = [c for c in player.hand if c.type=='戦車']
        if not tanks: return
        t = random.choice(tanks); t.is_face_up=False
        player.platoons[col].append(t); player.hand.remove(t)
        enemy = self.player2 if player==self.player1 else self.player1
        if enemy.advanced[col]: enemy.advanced[col]=False

    # =====================================================
    # AIターン
    # =====================================================
    def ai_turn(self, cp, ep):
        cp.brain.turn_count += 1
        state = cp.brain.get_state(cp, ep, self.terrains)
        aggr = cp.brain.aggression
        mass = cp.brain.mass_power

        # 砂漠の狐リセット（新ターン開始時）
        fox_active = any(e.name=='砂漠の狐' for e in cp.active_events)
        max_attacks = 2 if fox_active else 1
        attacks_done = 0

        platoons_with_tanks = [p for p in ['A','B','C']
                                if any(c.type=='戦車' and not c.is_decoy for c in cp.platoons[p])]

        # ── 行動候補スコアリング ──
        evaluated = []

        # 司令部攻撃
        for p in platoons_with_tanks:
            if cp.advanced[p]:
                evaluated.append(('attack_hq', p, 10000, f"{p}:adv"))
            else:
                has_lr = any('長射程' in t for c in cp.platoons[p] for t in c.traits)
                if has_lr and not ep.platoons[p] and not self.terrains[p]:
                    evaluated.append(('attack_hq', p, 9000, f"{p}:lr"))

        # 通常攻撃
        for p in platoons_with_tanks:
            if self.terrains[p] and self.terrains[p].name == '悪魔の園':
                continue  # 悪魔の園がある列からは攻撃できない（進入時にコストが必要）
            if self.terrains[p] and self.terrains[p].name == 'ボックス陣地' and not cp.advanced[p]:
                continue  # ボックス陣地の列からは攻撃不可
            if ep.platoons[p]:
                # 攻撃力計算
                real_tanks = [c for c in cp.platoons[p] if c.type=='戦車' and not c.is_decoy]
                if not real_tanks: continue
                base_atk = max(int(c.attack) for c in real_tanks)
                atk_val = base_atk + len(real_tanks) - 1
                # イタリア軍戦車隊
                if any('イタリア' in a.name for a in cp.attachments[p]): atk_val += 2
                # ベルザリエーリ（手札から）
                if any('ベルザリエーリ' in c.name for c in cp.hand): atk_val += 1
                if len(ep.platoons[p]) >= 5: atk_val += 1

                target = ep.platoons[p][0]
                def_val = int(str(target.defense).split('-')[0])
                # ボックス陣地防御ボーナス
                if self.terrains[p] and self.terrains[p].name == 'ボックス陣地' and not ep.advanced[p]:
                    def_val += 2
                # イタリア軍戦車隊防御ボーナス
                if any('イタリア' in a.name for a in ep.attachments[p]): def_val += 1

                can_win = atk_val >= def_val
                score = 500 + (atk_val-def_val)*10 if can_win else 10
                if ep.advanced[p]: score += 3000
                if not can_win: score += int(aggr * 200 - 100)
                score += int(aggr * 150)
                evaluated.append(('attack', p, score, f"{p}->{p}:{target.name}"))

        # 戦車配置
        tanks_in_hand = [c for c in cp.hand if c.type=='戦車']
        for p in ['A','B','C']:
            for c in tanks_in_hand:
                atk_v = int(c.attack); def_v = int(str(c.defense).split('-')[0])
                score = 500 + atk_v*10 + def_v*10 + int(mass*300) + int((1.0-mass)*(atk_v+def_v)*5)
                if not any(t.type=='戦車' for t in cp.platoons[p]): score += 300
                if ep.advanced[p]: score += 4000
                evaluated.append(('add_tank', (p,c), score, f"{p}:{c.name}"))

        # 移動（進入）
        for p in platoons_with_tanks:
            if not cp.advanced[p] and not ep.platoons[p]:
                # 悪魔の園チェック
                if self.terrains[p] and self.terrains[p].name == '悪魔の園':
                    # 戦車3枚犠牲にできるか
                    sacrifice_tanks = [c for c in cp.platoons[p] if c.type=='戦車']
                    if len(sacrifice_tanks) >= 3:
                        score = 200 + int(aggr * 400)
                        evaluated.append(('move_devil', p, score, f"devil:{p}"))
                else:
                    score = 300 + int(aggr * 400)
                    if cp.platoons[p]:
                        score += int(cp.platoons[p][0].attack)*5
                    evaluated.append(('move', p, score, f"move:{p}"))

        # 欺瞞作戦（デコイ配置）
        decoy_cards = [c for c in cp.hand if '欺瞞' in c.name]
        for c in decoy_cards:
            for p in ['A','B','C']:
                score = 200 + int((1.0-aggr)*100)
                evaluated.append(('play_decoy', (c,p), score, f"decoy:{p}"))

        # 戦術カード
        already_played = [e[0] for e in cp.brain.events_played]
        for c in cp.hand:
            if c.type not in ['アクション','イベント','地形','リアクション']: continue
            if c.name in ['迂回戦術','圧倒的物量','ベルザリエーリ','弾幕射撃','反撃','4号スペツィアル']:
                continue  # 戦闘時に使用するカード

            base_score = 400
            if c.name in KEY_EVENTS:
                cp.brain.record_event_played(c.name, state)

            if c.name == '砂漠の狐':
                if not fox_active:
                    base_score = 600 + int(aggr*200)
                    evaluated.append(('play_event', c, base_score, c.name))
            elif c.name == 'モンティ':
                targets = [d for d in cp.discard_pile if d.is_face_up]
                if targets:
                    evaluated.append(('play_event', c, base_score, c.name))
            elif c.name == 'チャーチルが来た':
                targets = [d for d in cp.discard_pile if d.is_face_up and d.type not in ['戦車','イベント','アクシデント']]
                if targets:
                    evaluated.append(('play_tactical', c, base_score, c.name))
            elif c.name == '鹵獲戦車':
                targets = [d for d in ep.discard_pile if d.is_face_up and d.type=='戦車']
                if targets:
                    evaluated.append(('play_scavenge', c, base_score+200, c.name))
            elif c.name == 'イタリア軍奮闘':
                for col in ['A','B','C']:
                    if ep.platoons[col]:
                        evaluated.append(('play_remove_tank', (c,col), base_score+300, f"{c.name}:{col}"))
            elif c.name == '頼りになるハニー':
                has_face_down = any(not t.is_face_up for col in ['A','B','C'] for t in ep.platoons[col])
                if has_face_down:
                    evaluated.append(('play_tactical', c, base_score, c.name))
            elif c.type == 'イタリア軍戦車隊' or c.name == 'イタリア軍戦車隊':
                for col in ['A','B','C']:
                    if cp.platoons[col] and not any('イタリア' in a.name for a in cp.attachments[col]):
                        score_col = base_score + len(cp.platoons[col])*20
                        if ep.advanced[col]: score_col += 100
                        evaluated.append(('play_attach_my', (c,col), score_col, f"{c.name}:{col}"))
            elif c.type == '地形':
                for col in ['A','B','C']:
                    if not self.terrains[col] and not cp.advanced[col] and not ep.advanced[col]:
                        col_score = base_score + int((1.0-aggr)*200)
                        if c.name == 'ボックス陣地':
                            # 戦車がいる列のみ
                            if any(t.type=='戦車' for t in cp.platoons[col]):
                                col_score += len(cp.platoons[col])*10
                                evaluated.append(('play_terrain', (c,col), col_score, f"{c.name}:{col}"))
                        else:
                            evaluated.append(('play_terrain', (c,col), col_score, f"{c.name}:{col}"))

        # 手札交換
        if cp.hand:
            swap_score = 1 + int((1.0-aggr)*50)
            evaluated.append(('swap', None, swap_score, 'swap'))

        if not evaluated:
            self.game_over=True; self.winner=ep; return

        # ── ε-greedy ──
        if random.random() < 0.1:
            best = random.choice(evaluated)
        else:
            best=None; best_final=-99999
            for act in evaluated:
                atype, params, base_score, detail = act
                q_bonus = cp.brain.q_table.get(state,{}).get(f"{atype}:{detail}", 0.0)
                fs = base_score + q_bonus + random.uniform(0,3)
                if fs>best_final: best_final=fs; best=act

        atype, params, _, detail = best
        cp.brain.record_action(state, atype, detail)

        # ── 行動実行 ──
        if atype == 'attack_hq':
            p = params
            if cp.advanced[p]: self.damage_hq(ep, 2)
            else: self.damage_hq(ep, 1)
            attacks_done += 1

        elif atype == 'attack':
            p = params
            self.execute_attack(cp, ep, p)
            attacks_done += 1
            # 砂漠の狐：2回目攻撃
            if fox_active and attacks_done < max_attacks:
                for act2 in evaluated:
                    if act2[0] in ('attack','attack_hq') and act2[1] != p:
                        cp.brain.record_action(state, act2[0], act2[3])
                        if act2[0]=='attack': self.execute_attack(cp, ep, act2[1])
                        else: self.damage_hq(ep, 2 if cp.advanced[act2[1]] else 1)
                        break

        elif atype == 'move':
            p = params
            if not ep.platoons[p] and not cp.advanced[p]:
                cp.advanced[p]=True
                for c in cp.platoons[p]: c.is_face_up=True
                cp.brain.add_intermediate_reward(0.2)
                # ボックス陣地除去
                for att in list(cp.attachments[p]):
                    if att.name == 'ボックス陣地':
                        cp.attachments[p].remove(att); cp.discard_pile.append(att)
                if not ep.headquarters: self.game_over=True; self.winner=cp

        elif atype == 'move_devil':
            p = params
            sacrifice_tanks = [c for c in cp.platoons[p] if c.type=='戦車'][:3]
            for st in sacrifice_tanks:
                cp.platoons[p].remove(st); cp.discard_pile.append(st)
            if not cp.platoons[p] or not any(c.type=='戦車' for c in cp.platoons[p]):
                pass  # 戦車なくなったら進入できない
            else:
                cp.advanced[p]=True
                for c in cp.platoons[p]: c.is_face_up=True
                cp.brain.add_intermediate_reward(0.1)

        elif atype == 'add_tank':
            p, c = params
            c.is_face_up=False
            cp.platoons[p].append(c); cp.hand.remove(c)
            if ep.advanced[p]: ep.advanced[p]=False

        elif atype == 'play_decoy':
            c, p = params
            c.is_decoy=True; c.is_face_up=False
            cp.platoons[p].insert(0, c); cp.hand.remove(c)

        elif atype == 'play_event':
            c = params
            if c.name == '砂漠の狐':
                # 全列の戦車を手元に回収して再配置
                all_tanks = []
                for col in ['A','B','C']:
                    real = [t for t in cp.platoons[col] if t.type=='戦車' and not t.is_decoy]
                    all_tanks.extend(real)
                    for t in real: cp.platoons[col].remove(t)
                random.shuffle(all_tanks)
                for i, col in enumerate(['A','B','C']):
                    if i < len(all_tanks):
                        t = all_tanks[i]; t.is_face_up=False
                        cp.platoons[col].append(t)
                for t in all_tanks[3:]: cp.hand.append(t)
                for e in list(cp.active_events): cp.discard_pile.append(e); cp.active_events.clear()
                for e in list(ep.active_events): ep.discard_pile.append(e); ep.active_events.clear()
                cp.active_events.append(c); cp.hand.remove(c)
                cp.brain.record_event_played(c.name, state)
            elif c.name == 'モンティ':
                targets = [d for d in cp.discard_pile if d.is_face_up]
                for t in targets[:3]:
                    cp.headquarters.append(t); cp.discard_pile.remove(t)
                random.shuffle(cp.headquarters)
                for e in list(cp.active_events): cp.discard_pile.append(e); cp.active_events.clear()
                for e in list(ep.active_events): ep.discard_pile.append(e); ep.active_events.clear()
                cp.active_events.append(c); cp.hand.remove(c)
                cp.brain.record_event_played(c.name, state)

        elif atype == 'play_tactical':
            c = params
            if c.name == 'チャーチルが来た':
                targets = [d for d in cp.discard_pile if d.is_face_up and d.type not in ['戦車','イベント','アクシデント']]
                for t in targets[:2]:
                    cp.headquarters.insert(0, t); cp.discard_pile.remove(t)
                cp.discard_pile.append(c); cp.hand.remove(c)
            elif c.name == '頼りになるハニー':
                for col in ['A','B','C']:
                    for t in ep.platoons[col]:
                        if not t.is_face_up: t.is_face_up=True; break
                # Stuartを捨てて追加発動
                stuarts = [t for col in ['A','B','C'] for t in cp.platoons[col] if 'Stuart' in t.name]
                if stuarts:
                    s = stuarts[0]
                    for col in ['A','B','C']:
                        if s in cp.platoons[col]: cp.platoons[col].remove(s); break
                    cp.discard_pile.append(s)
                    for col in ['A','B','C']:
                        for t in ep.platoons[col]:
                            if not t.is_face_up: t.is_face_up=True; break
                cp.discard_pile.append(c); cp.hand.remove(c)

        elif atype == 'play_scavenge':
            c = params
            targets = [d for d in ep.discard_pile if d.is_face_up and d.type=='戦車']
            if targets:
                best_t = max(targets, key=lambda t: int(t.attack))
                ep.discard_pile.remove(best_t)
                best_t.is_face_up=False
                best_col = min(['A','B','C'], key=lambda col: len(cp.platoons[col]))
                cp.platoons[best_col].append(best_t)
                cp.brain.add_intermediate_reward(0.15)
            cp.discard_pile.append(c); cp.hand.remove(c)

        elif atype == 'play_remove_tank':
            c, col = params
            # 慢性的補給不足チェック
            supply_shortage = any(e.name=='慢性的補給不足' for e in cp.active_events)
            if ep.platoons[col]:
                target = ep.platoons[col][0]
                if supply_shortage:
                    target.is_face_up = True
                else:
                    ep.platoons[col].remove(target); ep.discard_pile.append(target)
                    cp.brain.add_intermediate_reward(0.2)
                    if not ep.platoons[col]:
                        self.handle_annihilation(ep, col)
            cp.discard_pile.append(c); cp.hand.remove(c)

        elif atype == 'play_attach_my':
            c, col = params
            cp.attachments[col].append(c); cp.hand.remove(c)

        elif atype == 'play_terrain':
            c, col = params
            if c.name == 'ボックス陣地':
                if any(t.type=='戦車' for t in cp.platoons[col]):
                    self.terrains[col]=c; c.owner=cp; cp.hand.remove(c)
                else:
                    cp.discard_pile.append(c); cp.hand.remove(c)
            else:
                self.terrains[col]=c; c.owner=cp; cp.hand.remove(c)

        elif atype == 'swap':
            if cp.hand and cp.headquarters:
                c=cp.hand.pop(0); cp.headquarters.append(c)
                cp.hand.append(cp.headquarters.pop(0))

    # =====================================================
    # 戦闘実行
    # =====================================================
    def execute_attack(self, cp, ep, p):
        # デコイを表にして除去
        for lst, pl in [(cp.platoons[p],cp),(ep.platoons[p],ep)]:
            dummies=[c for c in lst if c.is_decoy and c.is_face_up]
            for d in dummies: lst.remove(d); pl.discard_pile.append(d)

        real_attackers = [c for c in cp.platoons[p] if c.type=='戦車' and not c.is_decoy]
        if not real_attackers or not ep.platoons[p]: return

        for c in cp.platoons[p]: c.is_face_up=True
        target = ep.platoons[p][0]; target.is_face_up=True

        # デコイターゲットなら除去して終了
        if target.is_decoy:
            ep.platoons[p].remove(target); ep.discard_pile.append(target)
            return

        # 8.8cm高射砲チェック（裏向きで配置されている）
        hidden_88 = next((c for c in ep.platoons[p] if '8.8cm' in c.name and not c.is_face_up), None)
        if hidden_88:
            hidden_88.is_face_up=True
            # 弾幕射撃リアクション（連合軍のみ）
            barrage = next((c for c in cp.hand if '弾幕射撃' in c.name), None)
            if barrage:
                cp.hand.remove(barrage); cp.discard_pile.append(barrage)
                # 無効化
                ep.platoons[p].remove(hidden_88); ep.discard_pile.append(hidden_88)
            else:
                # 8.8cmが攻撃キャンセル＆8ダメージ
                ep.platoons[p].remove(hidden_88); ep.discard_pile.append(hidden_88)
                # 攻撃キャンセル→8ダメージを攻撃側に
                sacrificed = real_attackers[0]
                cp.platoons[p].remove(sacrificed); cp.discard_pile.append(sacrificed)
                ep.brain.add_intermediate_reward(0.3)
                if not cp.platoons[p]: self.handle_annihilation(cp, p)
                return

        # 攻撃力計算
        base_atk = max(int(c.attack) for c in real_attackers)
        atk_val = base_atk + len(real_attackers) - 1
        if any('イタリア' in a.name for a in cp.attachments[p]): atk_val += 2
        # ベルザリエーリ
        bersaglieri = next((c for c in cp.hand if 'ベルザリエーリ' in c.name), None)
        if bersaglieri:
            atk_val += 1
            if len(ep.platoons[p]) >= 5: atk_val += 1
            cp.hand.remove(bersaglieri); cp.discard_pile.append(bersaglieri)

        def_val = int(str(target.defense).split('-')[0])
        if any('イタリア' in a.name for a in ep.attachments[p]): def_val += 1
        if self.terrains[p] and self.terrains[p].name == 'ボックス陣地' and not ep.advanced[p]:
            def_val += 2

        if atk_val >= def_val:
            # イタリア軍戦車隊身代わりチェック
            it_shield = next((a for a in ep.attachments[p] if 'イタリア' in a.name), None)
            if it_shield and random.random() < 0.5:  # AIは50%で使用
                ep.attachments[p].remove(it_shield); ep.discard_pile.append(it_shield)
                # 攻撃無効化
                return

            # 4号スペツィアル身代わりチェック
            save_card = next((c for c in ep.hand if '4号スペツィアル' in c.name), None)
            saved = False
            if save_card and len(ep.platoons[p]) >= 2:
                sacrificeable = [t for t in ep.platoons[p] if t != target and t.type=='戦車']
                if sacrificeable and random.random() < 0.6:
                    sac = random.choice(sacrificeable)
                    ep.platoons[p].remove(sac); ep.discard_pile.append(sac)
                    ep.hand.remove(save_card); ep.discard_pile.append(save_card)
                    saved = True

            if not saved:
                ep.platoons[p].remove(target); ep.discard_pile.append(target)
                cp.brain.add_intermediate_reward(0.2); ep.brain.add_intermediate_reward(-0.1)

                # 圧倒的物量（追加破壊）
                extra_kill = next((c for c in cp.hand if '圧倒的物量' in c.name), None)
                if extra_kill and ep.platoons[p] and random.random() < 0.7:
                    extra_target = ep.platoons[p][0]
                    if extra_target.type=='戦車':
                        ep.platoons[p].remove(extra_target); ep.discard_pile.append(extra_target)
                        cp.hand.remove(extra_kill); cp.discard_pile.append(extra_kill)
                        cp.brain.add_intermediate_reward(0.15)

                # 迂回戦術（HQダメージ）
                flank = next((c for c in cp.hand if '迂回戦術' in c.name), None)
                if flank and random.random() < 0.7:
                    burn = target.cost
                    cp.hand.remove(flank); cp.discard_pile.append(flank)
                    self.damage_hq(ep, burn)

                if not ep.platoons[p]:
                    ep.advanced[p]=False
                    self.handle_annihilation(ep, p)
                    if not ep.platoons[p]:
                        cp.advanced[p]=True
                        for c in cp.platoons[p]: c.is_face_up=True
                        if not ep.headquarters: self.game_over=True; self.winner=cp

                # ボックス陣地：守備隊全滅で除去
                if not ep.platoons[p] and self.terrains[p] and self.terrains[p].name=='ボックス陣地':
                    ep.discard_pile.append(self.terrains[p]); self.terrains[p]=None

    # =====================================================
    # ゲーム進行
    # =====================================================
    def play(self):
        while not self.game_over and self.turn_count < 150:
            self.turn_count += 1
            cp=self.current_player; ep=self.enemy_player
            self.ai_turn(cp, ep)
            if self.game_over: break
            while len(cp.hand)<4 and cp.headquarters:
                drawn=cp.headquarters.pop(0)
                if drawn.type=='アクシデント':
                    cp.active_events.append(drawn)
                else:
                    cp.hand.append(drawn)
            if self.game_over: break
            self.current_player, self.enemy_player = ep, cp

        if self.turn_count >= 150: self.winner="Draw"

        if self.winner=="Draw": r1,r2=0.3,0.3
        elif self.winner==self.player1: r1,r2=1.0,-1.0
        else: r1,r2=-1.0,1.0

        self.player1.brain.learn(r1)
        self.player2.brain.learn(r2)
        self.player1.brain.learn_deck(self.winner==self.player1)
        self.player2.brain.learn_deck(self.winner==self.player2)
        self.player1.brain.learn_event_order(self.winner==self.player1)
        self.player2.brain.learn_event_order(self.winner==self.player2)
        return self.winner

# =====================================================
# メイン
# =====================================================
def main():
    print("="*55)
    print("  Panzer Waffe 北アフリカ1942 AI学習スクリプト")
    print("="*55)

    csv_file="cards_africa.csv"
    if not os.path.exists(csv_file):
        print(f"エラー: {csv_file} が見つかりません。")
        sys.exit(1)
    try: df=pd.read_csv(csv_file, encoding='utf-8-sig')
    except: df=pd.read_csv(csv_file, encoding='cp932')
    print(f"カードデータ: {len(df)}枚\n")

    data_file="ai_data_africa.json"
    brain_de=AI_Brain("Panzerwaffe_africa_ge")
    brain_uk=AI_Brain("Panzerwaffe_africa_uk")
    saved_data = {}
    total_games = 0
    if os.path.exists(data_file):
        with open(data_file,'r',encoding='utf-8') as f:
            saved=json.load(f)
        brain_de.load_from_dict(saved.get("de",{}))
        brain_uk.load_from_dict(saved.get("uk",{}))
        total_games = saved.get("total_games", 0)
        saved_data = saved
        print(f"既存データ読み込み完了（累計{total_games}戦）")
    else:
        print("新規学習を開始します。")

    while True:
        try:
            num=int(input("\n対戦回数を入力 (例: 1000, 10000): ").strip())
            if num>0: break
        except: pass
        print("1以上の数を入力してください。")

    print(f"\n{num}回の自動対戦を開始します...\n")

    p1_wins=p2_wins=draws=0
    pmatrix = defaultdict(lambda: defaultdict(lambda: {'wins':0,'games':0}))
    start_time=time.time()

    for i in range(num):
        g=Game(df)
        g.setup(brain_de, brain_uk)
        de_p=brain_de.personality_name; uk_p=brain_uk.personality_name
        winner=g.play()

        if winner=="Draw":
            draws+=1; pmatrix[de_p][uk_p]['games']+=1
        elif winner==g.player1:
            p1_wins+=1; pmatrix[de_p][uk_p]['games']+=1; pmatrix[de_p][uk_p]['wins']+=1
        else:
            p2_wins+=1; pmatrix[de_p][uk_p]['games']+=1

        if (i+1)%10==0 or i==num-1:
            done=i+1; pct=done/num*100
            elapsed=time.time()-start_time
            eta=(elapsed/done*(num-done)) if done>0 else 0
            de_r=f"{p1_wins/done*100:.1f}%"
            uk_r=f"{p2_wins/done*100:.1f}%"
            bar="█"*(int(pct)//5)+"░"*(20-int(pct)//5)
            print(f"  [{bar}] {done:>6}/{num}  "
                  f"ドイツ:{p1_wins}({de_r})[{brain_de.personality_name}]  "
                  f"連合:{p2_wins}({uk_r})[{brain_uk.personality_name}]  "
                  f"引分:{draws}  残{int(eta)}秒   ", end='\r')

    elapsed=time.time()-start_time
    total_games += num
    print(f"\n\n完了！ {elapsed:.1f}秒  累計{total_games}戦")
    print(f"ドイツ {p1_wins}勝 / 連合 {p2_wins}勝 / 引分 {draws}")

    de_states = len(brain_de.q_table)
    uk_states = len(brain_uk.q_table)
    print(f"\n学習データ:")
    print(f"  ドイツ: 状態{de_states}個 / イベント順序{len(brain_de.event_order_table)}パターン")
    print(f"  連合  : 状態{uk_states}個 / イベント順序{len(brain_uk.event_order_table)}パターン")

    # 人格別相性表
    pnames = ['電撃精鋭','電撃物量','守城精鋭','守城物量','エース']
    print(f"\n{'='*65}")
    print("【人格別相性表】ドイツ勝率 (行=ドイツ人格 / 列=連合人格)")
    print(f"{'':10}", end='')
    for us_p in pnames: print(f"{us_p:10}", end='')
    print()
    print("-"*55)
    for de_p in pnames:
        print(f"{de_p:10}", end='')
        for us_p in pnames:
            v = pmatrix[de_p][us_p]
            if v['games'] >= 1: print(f"{v['wins']/v['games']*100:>7.1f}%  ", end='')
            else: print(f"{'--':>7}   ", end='')
        print()
    print(f"{'='*65}")

    # 人格マトリクスをマージ保存
    saved_pmatrix = saved_data.get('personality_matrix', {})
    for de_p in pmatrix:
        if de_p not in saved_pmatrix: saved_pmatrix[de_p] = {}
        for us_p in pmatrix[de_p]:
            if us_p not in saved_pmatrix[de_p]:
                saved_pmatrix[de_p][us_p] = {'wins':0,'games':0}
            saved_pmatrix[de_p][us_p]['wins']  += pmatrix[de_p][us_p]['wins']
            saved_pmatrix[de_p][us_p]['games'] += pmatrix[de_p][us_p]['games']

    out_data={
        "de": brain_de.to_dict(),
        "uk": brain_uk.to_dict(),
        "total_games": total_games,
        "personality_matrix": saved_pmatrix,
    }
    with open(data_file,'w',encoding='utf-8') as f:
        json.dump(out_data, f, ensure_ascii=False)
    print(f"\n学習データ保存: {data_file}")

    # HTMLへの焼き込み
    html_file="index.html"
    if os.path.exists(html_file):
        ans=input(f"\nindex.htmlに焼き込みますか？ (y/n): ").strip().lower()
        if ans=='y':
            with open(html_file,'r',encoding='utf-8') as f:
                html=f.read()
            de_json=json.dumps(brain_de.to_dict(), ensure_ascii=False)
            uk_json=json.dumps(brain_uk.to_dict(), ensure_ascii=False)
            inject=f"""<script id="ai-preload-data">
(function(){{
  try{{localStorage.setItem("panzer_waffe_ai_Panzerwaffe_africa_ge",'{de_json}');}}catch(e){{}}
  try{{localStorage.setItem("panzer_waffe_ai_Panzerwaffe_africa_uk",'{uk_json}');}}catch(e){{}}
}})();
</script>"""
            html=re.sub(r'<script id="ai-preload-data">.*?</script>','',html,flags=re.DOTALL)
            html=html.replace('</head>', inject+'\n</head>', 1)
            out="index_trained.html"
            with open(out,'w',encoding='utf-8') as f:
                f.write(html)
            print(f"焼き込み完了 → {out}")

if __name__=="__main__":
    main()
