import json
import random

# localStorageのキー名
LS_KEY_PREFIX = "panzer_waffe_ai_"

class AI_Brain:
    def __init__(self, faction):
        self.faction = faction
        self.q_table = {}
        self.card_winrates = {}
        self.synergy_table = {}
        self.player_patterns = {}
        self.history = []
        self.deck_used = []
        self.intermediate_reward = 0.0
        self.alpha = 0.1
        self.gamma = 0.9

    # =====================================================
    # localStorage: データ読み込み
    # =====================================================
    async def load_data(self):
        try:
            import js
            key = LS_KEY_PREFIX + self.faction
            raw = js.localStorage.getItem(key)
            if raw:
                data = json.loads(raw)
                self.q_table        = data.get("q_table", {})
                self.card_winrates  = data.get("card_winrates", {})
                self.synergy_table  = data.get("synergy_table", {})
                self.player_patterns= data.get("player_patterns", {})
                return
        except Exception:
            pass
        self.q_table = {}
        self.card_winrates = {}
        self.synergy_table = {}
        self.player_patterns = {}

    # =====================================================
    # localStorage: 保存
    # =====================================================
    async def save_data(self):
        try:
            import js
            key = LS_KEY_PREFIX + self.faction
            payload = {
                "q_table":         self.q_table,
                "card_winrates":   self.card_winrates,
                "synergy_table":   self.synergy_table,
                "player_patterns": self.player_patterns,
            }
            js.localStorage.setItem(key, json.dumps(payload, ensure_ascii=False))
        except Exception:
            pass

    # =====================================================
    # 状態文字列の生成
    # =====================================================
    def get_abstract_state(self, my_player, enemy_player, terrains=None):
        parts = []
        for col in ['A', 'B', 'C']:
            my_cnt  = len(my_player.platoons[col])
            en_cnt  = len(enemy_player.platoons[col])
            my_adv  = 1 if my_player.advanced[col] else 0
            en_adv  = 1 if enemy_player.advanced[col] else 0
            terrain = ""
            if terrains and terrains.get(col):
                terrain = terrains[col].name[:2]
            parts.append(f"{col}{my_cnt}{my_adv}v{en_cnt}{en_adv}{terrain}")
        my_hq  = self._hq_range(len(my_player.headquarters))
        en_hq  = self._hq_range(len(enemy_player.headquarters))
        parts.append(f"HQ{my_hq}v{en_hq}")
        hand = self._hand_range(len(my_player.hand))
        parts.append(f"H{hand}")
        return "_".join(parts)

    def _hq_range(self, n):
        if n == 0:   return "0"
        if n <= 3:   return "S"
        if n <= 8:   return "M"
        return "L"

    def _hand_range(self, n):
        if n <= 1:   return "S"
        if n <= 3:   return "M"
        return "L"

    # =====================================================
    # 行動の記録
    # =====================================================
    def record_action(self, state, action_type, detail=""):
        full_action = action_type if not detail else f"{action_type}:{detail}"
        self.history.append((str(state), full_action))

    def add_intermediate_reward(self, amount):
        self.intermediate_reward += amount

    # =====================================================
    # Q学習：対戦結果を学習して保存
    # =====================================================
    async def learn(self, final_reward):
        if not self.history:
            return
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
        await self.save_data()

    # =====================================================
    # デッキ学習
    # =====================================================
    def record_deck(self, deck):
        self.deck_used = [c.name for c in deck if c.type not in ['イベント', 'アクシデント']]

    async def learn_deck(self, won):
        if not self.deck_used:
            return
        for name in self.deck_used:
            if name not in self.card_winrates:
                self.card_winrates[name] = {"wins": 0, "games": 0}
            self.card_winrates[name]["games"] += 1
            if won:
                self.card_winrates[name]["wins"] += 1
        for i in range(len(self.deck_used)):
            for j in range(i + 1, len(self.deck_used)):
                key = "__".join(sorted([self.deck_used[i], self.deck_used[j]]))
                if key not in self.synergy_table:
                    self.synergy_table[key] = {"wins": 0, "games": 0}
                self.synergy_table[key]["games"] += 1
                if won:
                    self.synergy_table[key]["wins"] += 1
        self.deck_used = []
        await self.save_data()

    # =====================================================
    # カードスコア計算
    # =====================================================
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

    # =====================================================
    # プレイヤーの癖の記録
    # =====================================================
    def record_player_action(self, action_type, detail=""):
        full_action = action_type if not detail else f"{action_type}:{detail}"
        if full_action not in self.player_patterns:
            self.player_patterns[full_action] = 0
        self.player_patterns[full_action] += 1

    def get_player_tendency(self):
        if not self.player_patterns:
            return []
        sorted_patterns = sorted(self.player_patterns.items(), key=lambda x: x[1], reverse=True)
        return sorted_patterns[:3]

    async def save_player_patterns(self):
        await self.save_data()

    # =====================================================
    # Q値の参照
    # =====================================================
    def get_q_value(self, state, action_type, detail=""):
        full_action = action_type if not detail else f"{action_type}:{detail}"
        return self.q_table.get(state, {}).get(full_action, 0.0)
