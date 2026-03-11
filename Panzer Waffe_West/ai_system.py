import json
import random

# localStorageのキー名
LS_KEY_PREFIX = "panzer_waffe_ai_"

try:
    import js
    def _ls_get(key):
        v = js.localStorage.getItem(key)
        return v if v is not None else None
    def _ls_set(key, val):
        js.localStorage.setItem(key, val)
    def _get_pretrained():
        """JSグローバル変数 AI_PRETRAINED_WEST から事前学習データを取得"""
        try:
            raw = js.AI_PRETRAINED_WEST
            if raw:
                from pyodide.ffi import JsProxy
                return json.loads(js.JSON.stringify(raw))
        except Exception:
            pass
        return None
except ImportError:
    def _ls_get(key): return None
    def _ls_set(key, val): pass
    def _get_pretrained(): return None

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
    # データ読み込み（事前学習ベース + localStorage差分マージ）
    # =====================================================
    async def load_data(self):
        # --- 1) 事前学習データをベースとして読み込み ---
        pretrained = _get_pretrained()
        side_key = "de" if "ge" in self.faction or "de" in self.faction.lower() else "uk"
        if pretrained and side_key in pretrained:
            base = pretrained[side_key]
            self.q_table       = dict(base.get("q_table", {}))
            self.card_winrates = dict(base.get("card_winrates", {}))
            self.synergy_table = dict(base.get("synergy_table", {}))
        else:
            self.q_table = {}
            self.card_winrates = {}
            self.synergy_table = {}
        self.player_patterns = {}

        # --- 2) localStorageの追加学習データをマージ（上書き優先） ---
        key = LS_KEY_PREFIX + self.faction
        try:
            raw = _ls_get(key)
            if raw:
                local = json.loads(raw)
                # Q-table: localStorageのデータで上書き・追加
                for state, actions in local.get("q_table", {}).items():
                    if state not in self.q_table:
                        self.q_table[state] = {}
                    self.q_table[state].update(actions)
                # card_winrates: localStorageで上書き
                for card, wr in local.get("card_winrates", {}).items():
                    self.card_winrates[card] = wr
                # synergy: localStorageで上書き
                for pair, syn in local.get("synergy_table", {}).items():
                    self.synergy_table[pair] = syn
                # player_patterns: localStorage固有
                self.player_patterns = local.get("player_patterns", {})
        except Exception:
            pass

    # =====================================================
    # 保存（事前学習との差分のみlocalStorageに保存）
    # =====================================================
    async def save_data(self):
        key = LS_KEY_PREFIX + self.faction
        # 事前学習ベースを取得
        pretrained = _get_pretrained()
        side_key = "de" if "ge" in self.faction or "de" in self.faction.lower() else "uk"
        base_q = {}
        base_wr = {}
        base_syn = {}
        if pretrained and side_key in pretrained:
            base_q  = pretrained[side_key].get("q_table", {})
            base_wr = pretrained[side_key].get("card_winrates", {})
            base_syn = pretrained[side_key].get("synergy_table", {})

        # Q-table差分
        delta_q = {}
        for state, actions in self.q_table.items():
            base_actions = base_q.get(state, {})
            diff = {}
            for act, qval in actions.items():
                if act not in base_actions or abs(qval - base_actions[act]) > 1e-9:
                    diff[act] = qval
            if diff:
                delta_q[state] = diff

        # card_winrates差分
        delta_wr = {}
        for card, wr in self.card_winrates.items():
            if card not in base_wr or wr != base_wr[card]:
                delta_wr[card] = wr

        # synergy差分
        delta_syn = {}
        for pair, syn in self.synergy_table.items():
            if pair not in base_syn or syn != base_syn[pair]:
                delta_syn[pair] = syn

        payload = {
            "q_table":         delta_q,
            "card_winrates":   delta_wr,
            "synergy_table":   delta_syn,
            "player_patterns": self.player_patterns,
        }
        try:
            _ls_set(key, json.dumps(payload, ensure_ascii=False))
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
