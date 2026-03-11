"""
Panzer Waffe 西部戦線1944 - AI学習専用スクリプト
ターミナルで実行: python3 train_west.py 40000
"""

import pandas as pd
import random
import json
import sys
import os
import time
from collections import defaultdict

# =====================================================
# 人格パラメータ（デッキ構築テーマ選択の多様性を確保）
# =====================================================
PERSONALITIES = {
    '重装甲大隊': (0.3, 'ドイツ軍', '重戦車と拠点地形で守り撃ちする'),
    '機動戦術':   (0.3, 'ドイツ軍', '軽量戦車で素早く攻め壊乱を狙う'),
    '物量と陣地': (0.4, '連合軍', '陣地構築と航空支援で押し切る'),
}

# =====================================================
# カードクラス（簡易版）
# =====================================================
class Card:
    def __init__(self, row):
        self.id = str(int(row['ID']))
        self.faction = row['Faction']
        self.type = row['Type']
        self.name = row['Name']
        self.short_name = str(row['ShortName']).strip() if pd.notna(row.get('ShortName')) and str(row.get('ShortName', '')).strip() else self.name
        self.attack = str(int(float(row['Attack']))) if pd.notna(row.get('Attack')) and str(row.get('Attack', '')).strip() else "0"
        self.defense = str(row['Defense']) if pd.notna(row.get('Defense')) and str(row.get('Defense', '')).strip() else "0"
        self.cost = int(float(row['Cost'])) if pd.notna(row.get('Cost')) and str(row.get('Cost', '')).strip() else 0
        self.traits = [str(row[col]).strip() for col in ['Trait_Fixed','Trait1','Trait2','Trait3','Trait4','Trait5','Trait6']
                       if col in row.index and pd.notna(row[col]) and str(row[col]).strip()]
        self.is_face_up = True
        self.owner = None

# =====================================================
# プレイヤー
# =====================================================
class Player:
    def __init__(self, faction_name):
        self.faction = faction_name
        self.headquarters = []
        self.hand = []
        self.discard_pile = []
        self.platoons = {'A': [], 'B': [], 'C': []}
        self.advanced = {'A': False, 'B': False, 'C': False}
        self.attachments = {'A': [], 'B': [], 'C': []}
        self.active_events = []

# =====================================================
# AI Brain（学習用簡易版）
# =====================================================
class AI_Brain:
    def __init__(self, faction_id):
        self.faction = faction_id
        self.q_table = {}
        self.card_winrates = {}
        self.synergy_table = {}
        self.history = []
        self.deck_used = []
        self.intermediate_reward = 0.0
        self.alpha = 0.1
        self.gamma = 0.9

    def get_abstract_state(self, my_player, enemy_player, terrains=None):
        parts = []
        for col in ['A', 'B', 'C']:
            my_cnt = len(my_player.platoons[col])
            en_cnt = len(enemy_player.platoons[col])
            my_adv = 1 if my_player.advanced[col] else 0
            en_adv = 1 if enemy_player.advanced[col] else 0
            terrain = ""
            if terrains and terrains.get(col):
                terrain = terrains[col].name[:2]
            parts.append(f"{col}{my_cnt}{my_adv}v{en_cnt}{en_adv}{terrain}")
        my_hq = self._hq_range(len(my_player.headquarters))
        en_hq = self._hq_range(len(enemy_player.headquarters))
        parts.append(f"HQ{my_hq}v{en_hq}")
        hand = self._hand_range(len(my_player.hand))
        parts.append(f"H{hand}")
        return "_".join(parts)

    def _hq_range(self, n):
        if n == 0: return "0"
        if n <= 3: return "S"
        if n <= 8: return "M"
        return "L"

    def _hand_range(self, n):
        if n <= 1: return "S"
        if n <= 3: return "M"
        return "L"

    def record_action(self, state, action_type, detail=""):
        full_action = action_type if not detail else f"{action_type}:{detail}"
        self.history.append((str(state), full_action))

    def add_intermediate_reward(self, amount):
        self.intermediate_reward += amount

    def learn(self, final_reward):
        if not self.history: return
        reward = final_reward + self.intermediate_reward
        for state, action in reversed(self.history):
            if state not in self.q_table:
                self.q_table[state] = {}
            if action not in self.q_table[state]:
                self.q_table[state][action] = 0.0
            old_q = self.q_table[state][action]
            self.q_table[state][action] = old_q + self.alpha * (reward - old_q)
            reward = self.q_table[state][action] * self.gamma
        self.history = []
        self.intermediate_reward = 0.0

    def record_deck(self, deck):
        self.deck_used = [c.name for c in deck if c.type not in ['イベント', 'アクシデント']]

    def learn_deck(self, won):
        if not self.deck_used: return
        for name in self.deck_used:
            if name not in self.card_winrates:
                self.card_winrates[name] = {"wins": 0, "games": 0}
            self.card_winrates[name]["games"] += 1
            if won: self.card_winrates[name]["wins"] += 1
        for i in range(len(self.deck_used)):
            for j in range(i + 1, len(self.deck_used)):
                key = "__".join(sorted([self.deck_used[i], self.deck_used[j]]))
                if key not in self.synergy_table:
                    self.synergy_table[key] = {"wins": 0, "games": 0}
                self.synergy_table[key]["games"] += 1
                if won: self.synergy_table[key]["wins"] += 1
        self.deck_used = []

    def get_card_score(self, card_name, deck_so_far):
        score = 0.0
        if card_name in self.card_winrates:
            wr = self.card_winrates[card_name]
            if wr["games"] >= 3:
                winrate = wr["wins"] / wr["games"]
                score += (winrate - 0.5) * 100
        for existing in deck_so_far:
            key = "__".join(sorted([card_name, existing]))
            if key in self.synergy_table:
                syn = self.synergy_table[key]
                if syn["games"] >= 3:
                    winrate = syn["wins"] / syn["games"]
                    score += (winrate - 0.5) * 50
        return score

    def get_q_value(self, state, action_type, detail=""):
        full_action = action_type if not detail else f"{action_type}:{detail}"
        return self.q_table.get(state, {}).get(full_action, 0.0)

# =====================================================
# ゲームシミュレーション
# =====================================================
class GameSim:
    def __init__(self, df, brain_de, brain_us):
        self.df = df
        self.game_over = False
        self.winner = None
        self.player1 = Player("ドイツ軍")
        self.player2 = Player("連合軍")
        self.brain1 = brain_de
        self.brain2 = brain_us
        self.current_player = self.player1
        self.enemy_player = self.player2
        self.current_brain = self.brain1
        self.enemy_brain = self.brain2
        self.terrains = {'A': None, 'B': None, 'C': None}
        self.terrain_progress = {'A': 0, 'B': 0, 'C': 0}

    def get_brain(self, player):
        return self.brain1 if player == self.player1 else self.brain2

    def setup(self):
        deck1 = self.build_deck_auto(self.player1, self.brain1)
        deck2 = self.build_deck_auto(self.player2, self.brain2)
        self.setup_initial_board(self.player1, deck1)
        self.setup_initial_board(self.player2, deck2)
        self.brain1.record_deck(deck1)
        self.brain2.record_deck(deck2)
        if random.choice([True, False]):
            self.current_player, self.enemy_player = self.player1, self.player2
            self.current_brain, self.enemy_brain = self.brain1, self.brain2
        else:
            self.current_player, self.enemy_player = self.player2, self.player1
            self.current_brain, self.enemy_brain = self.brain2, self.brain1

    def build_deck_auto(self, player, brain):
        faction_match = player.faction.replace("軍", "")
        pool = [Card(row) for _, row in self.df.iterrows() if row['Faction'] == player.faction or row['Faction'] == faction_match]
        events = [c for c in pool if c.type in ['イベント', 'アクシデント']]
        non_events = [c for c in pool if c.type not in ['イベント', 'アクシデント']]

        if player.faction == "ドイツ軍":
            themes = ["重装甲大隊", "機動戦術"]
        else:
            themes = ["物量と陣地"]

        # テーマ選択（ε-greedy）
        if random.random() < 0.2:
            chosen_theme = random.choice(themes)
        else:
            best_score = -9999
            chosen_theme = themes[0]
            state_str = "DeckBuild"
            for t in themes:
                q_val = brain.q_table.get(state_str, {}).get(t, 0.0)
                final_score = q_val + random.uniform(0, 1)
                if final_score > best_score:
                    best_score = final_score
                    chosen_theme = t
        brain.record_action("DeckBuild", chosen_theme)

        card_scores = []
        deck_names = []
        for c in non_events:
            score = random.randint(1, 10)
            score += brain.get_card_score(c.name, deck_names)
            if chosen_theme == "重装甲大隊":
                if c.type == '戦車':
                    if c.cost >= 4: score += 100
                    if '重戦車' in c.traits: score += 50
                elif c.name in ['バストーニュ', 'サン・ヴィット', '陣地構築', 'ティーガーショック']: score += 80
                elif c.name in ['空からの補給', '被弾経始', '強行軍', 'パイパー戦闘団']: score -= 100
            elif chosen_theme == "機動戦術":
                if c.type == '戦車':
                    if c.cost <= 3: score += 100
                elif c.name in ['奇襲', '強行軍', '壊乱', '近接航空支援']: score += 80
                elif c.type == '地形': score -= 100
            elif chosen_theme == "物量と陣地":
                if c.type == '戦車':
                    if c.cost <= 3: score += 80
                elif c.name in ['バストーニュ', 'サン・ヴィット', '陣地構築', '空からの補給', '近接航空支援', '強行軍', 'Nuts!']: score += 80
            card_scores.append((score, c))

        card_scores.sort(key=lambda x: x[0], reverse=True)
        deck = list(events)
        current_cost = 0
        for score, c in card_scores:
            if c.type == '戦車' and current_cost + c.cost <= 30:
                deck.append(c); current_cost += c.cost
        for score, c in card_scores:
            if c.type != '戦車' and current_cost + c.cost <= 30:
                deck.append(c); current_cost += c.cost
        return deck

    def setup_initial_board(self, player, deck):
        tanks = [c for c in deck if c.type == '戦車']
        random.shuffle(tanks)
        for i in range(3):
            if tanks:
                tank = tanks.pop(0)
                tank.is_face_up = False
                deck.remove(tank)
                player.platoons[['A', 'B', 'C'][i]].append(tank)
        random.shuffle(deck)
        player.headquarters = deck
        for _ in range(4):
            if player.headquarters:
                player.hand.append(player.headquarters.pop(0))

    def damage_hq(self, target_player, amount, is_special=False):
        attacker = self.current_player if target_player != self.current_player else self.enemy_player
        for _ in range(amount):
            if len(target_player.headquarters) > 0:
                card = target_player.headquarters.pop(0)
                card.is_face_up = False
                target_player.discard_pile.append(card)
                self.get_brain(attacker).add_intermediate_reward(0.15)
                self.get_brain(target_player).add_intermediate_reward(-0.15)
            else:
                if is_special:
                    self.game_over = True
                    self.winner = attacker
                return

    def handle_annihilation(self, player, p):
        enemy = self.player1 if player == self.player2 else self.player2
        self.get_brain(enemy).add_intermediate_reward(0.3)
        self.get_brain(player).add_intermediate_reward(-0.3)
        player.advanced[p] = False
        # 自動補充
        tanks_in_hand = [c for c in player.hand if c.type == '戦車']
        if tanks_in_hand and not any(att.name == '連合軍の慢心' for att in player.attachments[p]):
            deploy = random.choice(tanks_in_hand)
            deploy.is_face_up = False
            player.platoons[p].append(deploy)
            player.hand.remove(deploy)
            if enemy.advanced[p]:
                enemy.advanced[p] = False

    def get_reaction_auto(self, player, card_name):
        valid = [c for c in player.hand if c.name == card_name]
        return valid[0] if valid else None

    def execute_attack_hq(self, attacker, defender, p, is_long_range=False):
        if len(defender.headquarters) == 0:
            self.game_over = True
            self.winner = attacker
            return True
        if is_long_range:
            self.damage_hq(defender, 1)
        else:
            self.damage_hq(defender, 2)
        return True

    def execute_attack(self, attacker, defender, atk_p, def_p):
        for card in attacker.platoons[atk_p]:
            card.is_face_up = True
        if defender.platoons[def_p]:
            defender.platoons[def_p][0].is_face_up = True

        # ダミー除去
        for lst, owner in [(attacker.platoons[atk_p], attacker), (defender.platoons[def_p], defender)]:
            dummies = [c for c in lst if ("欺瞞" in c.name or "ダミー" in c.name) and c.is_face_up]
            for d in dummies:
                lst.remove(d)
                owner.discard_pile.append(d)

        if not attacker.platoons[atk_p]:
            return True
        if not defender.platoons[def_p]:
            defender.advanced[def_p] = False
            self.handle_annihilation(defender, def_p)
            return True

        target = defender.platoons[def_p][0]
        is_flank = (atk_p != def_p)
        attacking_tanks = attacker.platoons[atk_p][:]
        if is_flank:
            attacking_tanks = [c for c in attacking_tanks if '固定砲塔' not in c.traits]
            if not attacking_tanks:
                return True

        is_melee = attacker.advanced[atk_p] or defender.advanced[def_p]
        if is_melee and not is_flank:
            valid_atks = [int(c.attack) for c in attacking_tanks if '固定砲塔' not in c.traits]
            base_atk = max(valid_atks) if valid_atks else 0
        else:
            base_atk = max([int(c.attack) for c in attacking_tanks])

        atk_val = base_atk + (len(attacking_tanks) - 1)
        if any(att.name == 'パイパー戦闘団' for att in attacker.attachments[atk_p]):
            atk_val += 2

        # アクションカード使用（1枚）
        action_cards = [c for c in attacker.hand if c.name in ['奇襲', '近接航空支援', '壊乱', '強行軍']]
        filtered = []
        for c in action_cards:
            if c.name == '強行軍' and any('重戦車' in t for tank in attacker.platoons[atk_p] for t in tank.traits):
                continue
            filtered.append(c)
        used_action = None
        active_action = None
        if filtered:
            used_action = filtered[0]
            # リアクションチェック
            reaction = None
            if used_action.name == '近接航空支援':
                reaction = self.get_reaction_auto(defender, '対空砲')
            elif used_action.name in ['奇襲', '強行軍']:
                reaction = self.get_reaction_auto(defender, '燃料切れ')
            if reaction:
                defender.hand.remove(reaction)
                defender.discard_pile.append(reaction)
                attacker.hand.remove(used_action)
                attacker.discard_pile.append(used_action)
            else:
                attacker.hand.remove(used_action)
                attacker.discard_pile.append(used_action)
                active_action = used_action
                if used_action.name == '奇襲':
                    atk_val += 1
                elif used_action.name == '近接航空支援':
                    atk_val += 3

        # 地形効果（深雪）
        ignore_terrain = any(e.name == 'アルデンヌの霧' for e in attacker.active_events)
        if self.terrains[atk_p] and '深雪' in self.terrains[atk_p].name and not ignore_terrain:
            atk_val -= 2

        # 防御値計算
        def_val_str = str(target.defense).split('-')
        if (is_flank or is_melee) and len(def_val_str) > 1:
            def_val = int(def_val_str[1])
        else:
            def_val = int(def_val_str[0])

        # 被弾経始リアクション
        if any('傾斜装甲' in t for t in target.traits):
            reaction = self.get_reaction_auto(defender, '被弾経始')
            if reaction:
                defender.hand.remove(reaction)
                defender.discard_pile.append(reaction)
                def_val += 2

        if any(att.name == '陣地構築' for att in defender.attachments[def_p]):
            def_val += 2
        if any(e.name == 'Nuts!' for e in defender.active_events):
            def_val += 2
        if self.terrains[def_p] and getattr(self.terrains[def_p], 'owner', None) == defender:
            if self.terrains[def_p].name in ['サン・ヴィット', 'バストーニュ']:
                def_val += 2

        # 連合軍の慢心解除
        for mc in [att for att in defender.attachments[def_p] if att.name == '連合軍の慢心']:
            defender.attachments[def_p].remove(mc)
            attacker.discard_pile.append(mc)

        if atk_val >= def_val:
            destroyed = defender.platoons[def_p].pop(0)
            destroyed.is_face_up = True
            defender.discard_pile.append(destroyed)

            # 壊乱効果
            if active_action and active_action.name == '壊乱' and defender.platoons[def_p]:
                for t in defender.platoons[def_p]:
                    t.is_face_up = True
                defender.discard_pile.extend(defender.platoons[def_p])
                defender.platoons[def_p] = []

            if not defender.platoons[def_p]:
                defender.advanced[def_p] = False
                self.handle_annihilation(defender, def_p)
                # 付与カード解除
                for att in list(defender.attachments[def_p]):
                    defender.attachments[def_p].remove(att)
                    if att.faction == defender.faction:
                        defender.discard_pile.append(att)
                    else:
                        attacker.discard_pile.append(att)
                    if att.name == 'パイパー戦闘団':
                        self.damage_hq(defender, 1, is_special=True)
                # 地形解除
                if self.terrains[def_p] and self.terrains[def_p].name in ['バストーニュ', 'サン・ヴィット']:
                    if getattr(self.terrains[def_p], 'owner', None) == defender:
                        removed = self.terrains[def_p]
                        self.terrains[def_p] = None
                        defender.discard_pile.append(removed)
                        if removed.name == 'バストーニュ':
                            self.damage_hq(defender, 1, is_special=True)

            # 奇襲 + アルデンヌの霧 → 進入
            if active_action and active_action.name == '奇襲' and not defender.platoons[def_p]:
                if any(e.name == 'アルデンヌの霧' for e in attacker.active_events):
                    if not attacker.advanced[atk_p]:
                        attacker.advanced[atk_p] = True
                        for tank in attacker.platoons[atk_p]:
                            tank.is_face_up = True
                        # 陣地構築解除
                        for zc in [att for att in attacker.attachments[atk_p] if att.name == '陣地構築']:
                            attacker.attachments[atk_p].remove(zc)
                            attacker.discard_pile.append(zc)
                        if len(defender.headquarters) == 0:
                            self.game_over = True
                            self.winner = attacker

            # 強行軍効果
            if active_action and active_action.name == '強行軍' and not defender.platoons[def_p]:
                if len(attacker.platoons[atk_p]) > 1:
                    sac = attacker.platoons[atk_p].pop()
                    sac.is_face_up = True
                    attacker.discard_pile.append(sac)
                    self.damage_hq(defender, 1, is_special=True)
                    if not attacker.platoons[atk_p]:
                        attacker.advanced[atk_p] = False

        # 深雪ペナルティ（射撃後に自軍戦車を1両失う）
        if self.terrains[atk_p] and '深雪' in self.terrains[atk_p].name and attacker.platoons[atk_p] and not ignore_terrain:
            lost = attacker.platoons[atk_p].pop()
            lost.is_face_up = True
            attacker.discard_pile.append(lost)
            if not attacker.platoons[atk_p]:
                attacker.advanced[atk_p] = False
                self.handle_annihilation(attacker, atk_p)

        return True

    def execute_move(self, attacker, defender, p):
        if self.terrains[p] and self.terrains[p].name in ['深雪', '森林']:
            self.terrain_progress[p] += 1
            if self.terrain_progress[p] >= 2:
                removed = self.terrains[p]
                self.terrains[p] = None
                self.terrain_progress[p] = 0
                attacker.discard_pile.append(removed)
            return True
        if self.terrains[p] and self.terrains[p].name in ['バストーニュ', 'サン・ヴィット']:
            if getattr(self.terrains[p], 'owner', None) != attacker:
                return False
        if defender.platoons[p]:
            return False
        if attacker.advanced[p]:
            return False
        attacker.advanced[p] = True
        for card in attacker.platoons[p]:
            card.is_face_up = True
        self.get_brain(attacker).add_intermediate_reward(0.2)
        if len(defender.headquarters) == 0:
            self.game_over = True
            self.winner = attacker
        # 陣地構築解除
        for zc in [att for att in attacker.attachments[p] if att.name == '陣地構築']:
            attacker.attachments[p].remove(zc)
            attacker.discard_pile.append(zc)
        return True

    def ai_take_turn(self):
        cp = self.current_player
        ep = self.enemy_player
        cb = self.current_brain
        state_str = cb.get_abstract_state(cp, ep, self.terrains)

        platoons_with_tanks = [p for p in ['A', 'B', 'C'] if cp.platoons[p]]
        enemy_nuts = any(e.name == 'Nuts!' for e in ep.active_events)

        # 司令部攻撃可否
        can_attack_hq = []
        for p in platoons_with_tanks:
            if any(att.name == 'ティーガーショック' for att in cp.attachments[p]) and len(cp.platoons[p]) < 3:
                continue
            if cp.advanced[p]:
                can_attack_hq.append((p, False))
            else:
                has_lr = any('長射程' in t for tank in cp.platoons[p] for t in tank.traits)
                if has_lr and not ep.platoons[p] and not self.terrains[p] and not enemy_nuts:
                    can_attack_hq.append((p, True))

        # 戦術カード
        combat_only = ['奇襲', '強行軍', '壊乱', '近接航空支援']
        tactical_cards = [c for c in cp.hand if c.type in ['地形', 'アクション', 'イベント'] and c.name not in combat_only]
        valid_tacticals = []
        for c in tactical_cards:
            if c.name == '空からの補給':
                if [dc for dc in cp.discard_pile if dc.type == '戦車' and '重戦車' not in dc.traits and dc.is_face_up]:
                    valid_tacticals.append(c)
            elif c.type == '地形':
                if [col for col in ['A', 'B', 'C'] if self.terrains[col] is None and not cp.advanced[col] and not ep.advanced[col]]:
                    valid_tacticals.append(c)
            elif c.name in ['陣地構築', 'パイパー戦闘団']:
                if [mp for mp in ['A', 'B', 'C'] if cp.platoons[mp] and not any(a.name == c.name for a in cp.attachments[mp])]:
                    valid_tacticals.append(c)
            elif c.name in ['ティーガーショック', '連合軍の慢心']:
                if [ep_col for ep_col in ['A', 'B', 'C'] if ep.platoons[ep_col] and not any(a.name == c.name for a in ep.attachments[ep_col])]:
                    valid_tacticals.append(c)
            else:
                valid_tacticals.append(c)

        # 移動可否
        can_move = []
        for p in platoons_with_tanks:
            if any(att.name == 'ティーガーショック' for att in cp.attachments[p]) and len(cp.platoons[p]) < 3:
                continue
            if self.terrains[p] and self.terrains[p].name in ['深雪', '森林']:
                can_move.append(p)
            elif not cp.advanced[p] and not ep.platoons[p]:
                if self.terrains[p] and self.terrains[p].name in ['バストーニュ', 'サン・ヴィット'] and getattr(self.terrains[p], 'owner', None) != cp:
                    continue
                can_move.append(p)

        # 攻撃可否
        can_attack = []
        ignore_terrain = any(e.name == 'アルデンヌの霧' for e in cp.active_events)
        for p in platoons_with_tanks:
            has_turret = any('旋回砲塔' in t for tank in cp.platoons[p] for t in tank.traits)
            if any(att.name == 'ティーガーショック' for att in cp.attachments[p]) and len(cp.platoons[p]) < 3:
                continue
            if self.terrains[p] and '森林' in self.terrains[p].name and not ignore_terrain:
                continue
            if cp.advanced[p]:
                if has_turret:
                    for target_p in ['A', 'B', 'C']:
                        if target_p != p and ep.platoons[target_p]:
                            can_attack.append((p, target_p))
            else:
                if ep.platoons[p]:
                    can_attack.append((p, p))
                if has_turret:
                    for target_p in ['A', 'B', 'C']:
                        if target_p != p and ep.platoons[target_p] and ep.advanced[target_p]:
                            can_attack.append((p, target_p))

        tanks_in_hand = [c for c in cp.hand if c.type == '戦車']
        valid_add_platoons = [p for p in ['A', 'B', 'C'] if not any(att.name == '連合軍の慢心' for att in cp.attachments[p])]

        # 行動評価
        evaluated = []
        for p, is_lr in can_attack_hq:
            evaluated.append(('attack_hq', (p, is_lr), 10000))

        for atk_p, def_p in can_attack:
            att_tanks = cp.platoons[atk_p][:]
            is_flank = (atk_p != def_p)
            if is_flank:
                att_tanks = [c for c in att_tanks if '固定砲塔' not in c.traits]
            if not att_tanks:
                continue
            target = ep.platoons[def_p][0]
            is_melee = cp.advanced[atk_p] or ep.advanced[def_p]
            if is_melee and not is_flank:
                valid_atks = [int(c.attack) for c in att_tanks if '固定砲塔' not in c.traits]
                base_atk = max(valid_atks) if valid_atks else 0
            else:
                base_atk = max([int(c.attack) for c in att_tanks])
            ai_atk = base_atk + len(att_tanks) - 1
            if any(att.name == 'パイパー戦闘団' for att in cp.attachments[atk_p]):
                ai_atk += 2
            def_str = str(target.defense).split('-')
            d_val = int(def_str[1]) if (is_flank or is_melee) and len(def_str) > 1 else int(def_str[0])
            if any(att.name == '陣地構築' for att in ep.attachments[def_p]):
                d_val += 2
            score = 500 + (ai_atk - d_val) * 10 if ai_atk >= d_val else 10
            if ep.advanced[def_p] and is_flank:
                score += 5000
            evaluated.append(('attack', (atk_p, def_p), score))

        for p in valid_add_platoons:
            for c in tanks_in_hand:
                score = 500 + int(c.attack) * 10 + int(str(c.defense).split('-')[0]) * 10
                if not cp.platoons[p]:
                    score += 300
                if ep.platoons[p]:
                    score += 200
                if ep.advanced[p]:
                    score += 4000
                evaluated.append(('add_tank', (p, c), score))

        for c in valid_tacticals:
            if c.type == 'イベント':
                evaluated.append(('play_tactical', c, 500))
            elif c.name == '空からの補給':
                evaluated.append(('play_tactical', c, 500))
            elif c.name in ['ティーガーショック', '連合軍の慢心']:
                best_ep = None
                max_atk = -1
                for ep_col in ['A', 'B', 'C']:
                    if ep.platoons[ep_col] and not any(a.name == c.name for a in ep.attachments[ep_col]):
                        atk_sum = sum([int(tank.attack) for tank in ep.platoons[ep_col]])
                        if atk_sum > max_atk:
                            max_atk = atk_sum
                            best_ep = ep_col
                if best_ep:
                    evaluated.append(('play_tactical_target', (c, best_ep), 500))
            elif c.name in ['パイパー戦闘団', '陣地構築']:
                best_mp = None
                max_count = 0
                for mp in ['A', 'B', 'C']:
                    if len(cp.platoons[mp]) > max_count and not any(a.name == c.name for a in cp.attachments[mp]):
                        max_count = len(cp.platoons[mp])
                        best_mp = mp
                if best_mp:
                    evaluated.append(('play_tactical_target', (c, best_mp), 500))
            elif c.type == '地形':
                evaluated.append(('play_tactical', c, 500))
            else:
                evaluated.append(('play_tactical', c, 500))

        for p in can_move:
            score = 300
            if not self.terrains[p] and not ep.platoons[p]:
                score += 500
            evaluated.append(('move', p, score))

        if cp.hand:
            evaluated.append(('swap', None, 1))

        if not evaluated:
            self.game_over = True
            self.winner = ep
            return

        # Q学習ベースの行動選択（ε-greedy）
        if random.random() < 0.1:
            best_action = random.choice(evaluated)
        else:
            best_action = None
            best_score = -99999
            for act in evaluated:
                a_type = act[0]
                base_score = act[2]
                q_bonus = cb.q_table.get(state_str, {}).get(a_type, 0.0)
                final_score = base_score + q_bonus + random.uniform(0, 5)
                if final_score > best_score:
                    best_score = final_score
                    best_action = act

        action_type = best_action[0]
        params = best_action[1]

        # 行動記録
        try:
            if action_type == 'attack':
                detail = f"{params[0]}->{params[1]}"
            elif action_type == 'attack_hq':
                detail = f"{params[0]}"
            elif action_type == 'move':
                detail = f"{params}"
            elif action_type == 'add_tank':
                detail = f"{params[0]}:{params[1].name}"
            elif action_type in ['play_tactical', 'play_tactical_target']:
                c = params if action_type == 'play_tactical' else params[0]
                detail = c.name
            else:
                detail = ""
            cb.record_action(state_str, action_type, detail)
        except:
            pass

        # 行動実行
        if action_type == 'attack_hq':
            p, is_lr = params
            self.execute_attack_hq(cp, ep, p, is_long_range=is_lr)
        elif action_type == 'play_tactical':
            c = params
            if c.type == 'イベント':
                for pl in [cp, ep]:
                    if pl.active_events:
                        pl.discard_pile.extend(pl.active_events)
                        pl.active_events.clear()
                cp.active_events.append(c)
                cp.hand.remove(c)
            elif c.type == '地形':
                empty_cols = [col for col in ['A', 'B', 'C'] if self.terrains[col] is None and not cp.advanced[col] and not ep.advanced[col]]
                col = random.choice(empty_cols) if empty_cols else 'A'
                c.owner = cp
                self.terrains[col] = c
                self.terrain_progress[col] = 0
                cp.hand.remove(c)
            elif c.name == '空からの補給':
                reaction = self.get_reaction_auto(ep, '対空砲')
                if reaction:
                    ep.hand.remove(reaction)
                    ep.discard_pile.append(reaction)
                else:
                    tanks_disc = [dc for dc in cp.discard_pile if dc.type == '戦車' and '重戦車' not in dc.traits and dc.is_face_up]
                    p = random.choice(valid_add_platoons) if valid_add_platoons else 'A'
                    for _ in range(2):
                        if tanks_disc:
                            res = tanks_disc.pop(0)
                            cp.discard_pile.remove(res)
                            res.is_face_up = False
                            cp.platoons[p].append(res)
                            if ep.advanced[p]:
                                ep.advanced[p] = False
                cp.hand.remove(c)
                cp.discard_pile.append(c)
        elif action_type == 'play_tactical_target':
            c, target_p = params
            target_enemy = c.name in ['ティーガーショック', '連合軍の慢心']
            if target_enemy:
                ep.attachments[target_p].append(c)
            else:
                cp.attachments[target_p].append(c)
                # 陣地構築の不利カード除去
                if c.name == '陣地構築':
                    bad_cards = [att for att in cp.attachments[target_p] if att.name in ['連合軍の慢心', 'ティーガーショック']]
                    for bad in bad_cards:
                        cp.attachments[target_p].remove(bad)
                        ep.discard_pile.append(bad)
            cp.hand.remove(c)
        elif action_type == 'move':
            p = params
            self.execute_move(cp, ep, p)
        elif action_type == 'attack':
            atk_p, def_p = params
            self.execute_attack(cp, ep, atk_p, def_p)
        elif action_type == 'add_tank':
            p, c = params
            c.is_face_up = False
            idx = random.randint(0, len(cp.platoons[p]))
            cp.platoons[p].insert(idx, c)
            cp.hand.remove(c)
            if ep.advanced[p]:
                ep.advanced[p] = False
        elif action_type == 'swap':
            c = cp.hand.pop(0)
            cp.headquarters.append(c)
            if cp.headquarters:
                cp.hand.append(cp.headquarters.pop(0))

    def play(self):
        turn_count = 0
        while not self.game_over and turn_count < 150:
            turn_count += 1
            self.ai_take_turn()
            if self.game_over:
                break
            # ドロー
            while len(self.current_player.hand) < 4 and len(self.current_player.headquarters) > 0:
                drawn = self.current_player.headquarters.pop(0)
                if drawn.type == 'アクシデント':
                    for p_target in [self.current_player, self.enemy_player]:
                        while p_target.active_events:
                            old_ev = p_target.active_events.pop(0)
                    self.current_player.active_events.append(drawn)
                else:
                    self.current_player.hand.append(drawn)
            if self.game_over:
                break
            # プレイヤー交代
            self.current_player, self.enemy_player = self.enemy_player, self.current_player
            self.current_brain, self.enemy_brain = self.enemy_brain, self.current_brain

        if turn_count >= 150:
            self.winner = "Draw"

        if self.winner == "Draw":
            r1, r2 = 0.3, 0.3
        elif self.winner == self.player1:
            r1, r2 = 1.0, -1.0
        else:
            r1, r2 = -1.0, 1.0

        self.brain1.learn(r1)
        self.brain2.learn(r2)
        self.brain1.learn_deck(self.winner == self.player1)
        self.brain2.learn_deck(self.winner == self.player2)

        return self.winner

# =====================================================
# メイン
# =====================================================
def save_data(brain_de, brain_us, total_games, filepath):
    output = {
        "de": {
            "q_table": brain_de.q_table,
            "card_winrates": brain_de.card_winrates,
            "synergy_table": brain_de.synergy_table,
        },
        "uk": {
            "q_table": brain_us.q_table,
            "card_winrates": brain_us.card_winrates,
            "synergy_table": brain_us.synergy_table,
        },
        "total_games": total_games,
    }
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False)
    size_mb = os.path.getsize(filepath) / 1024 / 1024
    print(f"  保存完了: {filepath} ({size_mb:.1f} MB)")

    # JS形式も同時出力
    js_path = filepath.replace('.json', '_data.js')
    # Q値が小さいエントリを刈り込み（0.01未満カット）
    pruned = {}
    for side in ['de', 'uk']:
        side_data = {}
        qt = {}
        for state, actions in output[side]['q_table'].items():
            kept = {a: round(q, 6) for a, q in actions.items() if abs(q) >= 0.01}
            if kept:
                qt[state] = kept
        side_data['q_table'] = qt
        side_data['card_winrates'] = output[side].get('card_winrates', {})
        side_data['synergy_table'] = output[side].get('synergy_table', {})
        pruned[side] = side_data
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write('var AI_PRETRAINED_WEST = ' + json.dumps(pruned, ensure_ascii=False, separators=(',', ':')) + ';\n')
    js_size = os.path.getsize(js_path) / 1024 / 1024
    print(f"  JS出力: {js_path} ({js_size:.1f} MB)")

def main():
    if len(sys.argv) > 1:
        num_episodes = int(sys.argv[1])
    else:
        try:
            num_episodes = int(input("何回戦わせますか？（例: 40000）: "))
        except:
            num_episodes = 40000

    csv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cards_west.csv')
    try:
        df = pd.read_csv(csv_path, encoding='utf-8-sig')
    except:
        df = pd.read_csv(csv_path, encoding='cp932')

    print(f"\n【Panzer Waffe 西部戦線 - AI学習】")
    print(f"対戦回数: {num_episodes}")
    print(f"カード数: {len(df)}")

    brain_de = AI_Brain("Panzerwaffe_west_ge")
    brain_us = AI_Brain("Panzerwaffe_west_us")

    # 既存データがあれば読み込み
    json_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ai_data_west.json')
    if os.path.exists(json_path):
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        brain_de.q_table = data.get("de", {}).get("q_table", {})
        brain_de.card_winrates = data.get("de", {}).get("card_winrates", {})
        brain_de.synergy_table = data.get("de", {}).get("synergy_table", {})
        brain_us.q_table = data.get("uk", {}).get("q_table", {})
        brain_us.card_winrates = data.get("uk", {}).get("card_winrates", {})
        brain_us.synergy_table = data.get("uk", {}).get("synergy_table", {})
        prev_games = data.get("total_games", 0)
        print(f"既存データを読み込みました（{prev_games}ゲーム分）")
    else:
        prev_games = 0

    de_wins = 0
    us_wins = 0
    draws = 0
    start_time = time.time()
    save_interval = 10000  # 1万回ごとに保存

    for i in range(num_episodes):
        try:
            game = GameSim(df, brain_de, brain_us)
            game.setup()
            winner = game.play()
            if winner == game.player1:
                de_wins += 1
            elif winner == game.player2:
                us_wins += 1
            else:
                draws += 1
        except Exception as e:
            draws += 1

        # 進捗表示
        if (i + 1) % 1000 == 0:
            elapsed = time.time() - start_time
            rate = (i + 1) / elapsed
            remaining = (num_episodes - i - 1) / rate if rate > 0 else 0
            total = i + 1
            de_pct = de_wins / total * 100
            us_pct = us_wins / total * 100
            dr_pct = draws / total * 100
            de_states = len(brain_de.q_table)
            us_states = len(brain_us.q_table)
            print(f"[{total:>7}/{num_episodes}] DE勝率:{de_pct:.1f}% US勝率:{us_pct:.1f}% 引分:{dr_pct:.1f}% | "
                  f"状態数 DE:{de_states} US:{us_states} | "
                  f"{rate:.0f}局/秒 残り{remaining/60:.0f}分")

        # 定期保存
        if (i + 1) % save_interval == 0:
            print(f"\n--- 中間保存 ({i + 1}回完了) ---")
            save_data(brain_de, brain_us, prev_games + i + 1, json_path)

    # 最終保存
    total_games = prev_games + num_episodes
    print(f"\n{'='*60}")
    print(f"学習完了！ 合計: {total_games}ゲーム")
    print(f"今回: DE {de_wins}勝 ({de_wins/num_episodes*100:.1f}%) / US {us_wins}勝 ({us_wins/num_episodes*100:.1f}%) / 引分 {draws}")
    print(f"DE Q-table: {len(brain_de.q_table)} 状態")
    print(f"US Q-table: {len(brain_us.q_table)} 状態")
    print(f"{'='*60}")
    save_data(brain_de, brain_us, total_games, json_path)
    print("\n完了！")

if __name__ == '__main__':
    main()
