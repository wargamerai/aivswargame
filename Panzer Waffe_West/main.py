import pandas as pd
import random
import time
import unicodedata
import os
import sys
import traceback
import asyncio

from ai_system import AI_Brain

# ---------------------------------------------
# 【表示の配線】
# ---------------------------------------------
import builtins

if not hasattr(builtins, "_real_print"):
    builtins._real_print = builtins.print

def print(*args, **kwargs):
    builtins._real_print(*args, **kwargs)
    try:
        import js
        text = " ".join(map(str, args))
        output_area = js.document.getElementById("output-area")
        if output_area:
            new_line = js.document.createElement("div")
            new_line.innerText = text
            new_line.style.color = "#ffff88" 
            new_line.className = "log-new"
            output_area.appendChild(new_line)
            log_view = js.document.getElementById("scroll-log")
            if log_view: log_view.scrollTop = log_view.scrollHeight
    except Exception:
        pass

# ---------------------------------------------
# 【入力の配線】
# ---------------------------------------------
async def safe_input(prompt_text=""):
    import js
    from pyodide.ffi import create_proxy
    print(f"\n> {prompt_text}")
    future = asyncio.Future()

    def on_action(event):
        try:
            if event: event.preventDefault()
            if future.done(): return
            inp = js.document.getElementById("user-input")
            if not inp: return
            val = inp.value
            inp.value = "" 
            try:
                output_area = js.document.getElementById("output-area")
                if output_area:
                    old_nodes = list(output_area.getElementsByClassName("log-old"))
                    for node in old_nodes:
                        node.style.color = ""
                        node.classList.remove("log-old")
                    new_nodes = list(output_area.getElementsByClassName("log-new"))
                    for node in new_nodes:
                        node.style.color = "#ff8888"
                        node.classList.remove("log-new")
                        node.classList.add("log-old")
            except: pass
            future.set_result(val)
        except: pass

    def on_keydown(event):
        if event.key == "Enter": on_action(event)

    proxy_action = create_proxy(on_action)
    proxy_keydown = create_proxy(on_keydown)

    btn = js.document.getElementById("submit-btn")
    inp = js.document.getElementById("user-input")
    
    if btn: btn.onclick = proxy_action
    if inp: inp.onkeydown = proxy_keydown

    result = await future

    if btn: btn.onclick = None
    if inp: inp.onkeydown = None
    proxy_action.destroy()
    proxy_keydown.destroy()

    return result

class Card:
    def __init__(self, row):
        self.id = str(int(row['ID']))
        self.faction = row['Faction']
        self.type = row['Type']
        self.name = row['Name']
        if 'ShortName' in row and pd.notna(row['ShortName']) and str(row['ShortName']).strip() != '':
            self.short_name = str(row['ShortName']).strip()
        else: self.short_name = self.name
        self.attack = str(int(float(row['Attack']))) if pd.notna(row['Attack']) and str(row['Attack']).strip() != '' else "0"
        self.defense = str(row['Defense']) if pd.notna(row['Defense']) and str(row['Defense']).strip() != '' else "0"
        self.cost = int(float(row['Cost'])) if pd.notna(row['Cost']) and str(row['Cost']).strip() != '' else 0
        self.traits = [str(row[col]).strip() for col in ['Trait_Fixed', 'Trait1', 'Trait2', 'Trait3', 'Trait4', 'Trait5', 'Trait6'] if col in row and pd.notna(row[col]) and str(row[col]).strip()]
        self.is_face_up = True 
        self.owner = None

class Player:
    def __init__(self, faction_name, is_ai=False):
        self.faction = faction_name
        self.is_ai = is_ai 
        file_id = "Panzerwaffe_west_ge" if faction_name == "ドイツ軍" else "Panzerwaffe_west_us"
        self.brain = AI_Brain(file_id) if is_ai else None 
        self.headquarters = [] 
        self.hand = []
        self.discard_pile = []
        self.platoons = {'A': [], 'B': [], 'C': []} 
        self.advanced = {'A': False, 'B': False, 'C': False} 
        self.attachments = {'A': [], 'B': [], 'C': []} 
        self.active_events = []

class Game:
    def __init__(self, df, p1_faction="ドイツ軍", p2_faction="連合軍", p1_ai=False, p2_ai=False, quiet_mode=False, training_mode=False, p1_preset_deck=None, p2_preset_deck=None):
        self.df = df
        self.quiet = quiet_mode
        self.training_mode = training_mode
        self.game_over = False
        self.winner = None
        self.p1_preset_deck = p1_preset_deck
        self.p2_preset_deck = p2_preset_deck
        self.player1 = Player(p1_faction, is_ai=True if training_mode else p1_ai)
        self.player2 = Player(p2_faction, is_ai=True if training_mode else p2_ai)
        self.current_player = self.player1
        self.enemy_player = self.player2
        self.terrains = {'A': None, 'B': None, 'C': None}
        self.terrain_progress = {'A': 0, 'B': 0, 'C': 0}

    def print_q(self, text):
        if not self.quiet: print(text)

    def wait(self, sec):
        if not self.training_mode and not self.quiet: time.sleep(sec)

    def build_deck_from_ids(self, player, card_ids):
        """カードIDリストから固定デッキを復元する"""
        pool = [Card(row) for _, row in self.df.iterrows() if row['Faction'] == player.faction or row['Faction'] == player.faction.replace("軍", "")]
        events = [c for c in pool if c.type in ['イベント', 'アクシデント']]
        non_events = [c for c in pool if c.type not in ['イベント', 'アクシデント']]
        deck = []
        deck.extend(events)
        used = []
        for cid in card_ids:
            for c in non_events:
                if c.id == str(cid) and c not in used:
                    deck.append(c)
                    used.append(c)
                    break
        return deck

    async def setup_game(self):
        if self.player1.is_ai: await self.player1.brain.load_data()
        if self.player2.is_ai: await self.player2.brain.load_data()
        if self.training_mode or self.quiet:
            deck1 = self.build_deck_from_ids(self.player1, self.p1_preset_deck) if self.p1_preset_deck else self.build_deck_auto(self.player1, self.df)
            deck2 = self.build_deck_from_ids(self.player2, self.p2_preset_deck) if self.p2_preset_deck else self.build_deck_auto(self.player2, self.df)
        else:
            print("="*50)
            print(" 【戦車戦ボードゲーム - 陣営選択＆デッキ構築】")
            print("="*50)
            if self.p1_preset_deck:
                deck1 = self.build_deck_from_ids(self.player1, self.p1_preset_deck)
            elif self.player1.is_ai:
                deck1 = self.build_deck_auto(self.player1, self.df)
            else:
                deck1 = await self.build_player_deck(self.player1, self.df)
            if self.p2_preset_deck:
                deck2 = self.build_deck_from_ids(self.player2, self.p2_preset_deck)
                if not self.quiet: print(f"\n【チャレンジデッキ】{self.player2.faction} の登録デッキを配備しました。")
            elif self.player2.is_ai:
                if not self.quiet: print(f"\nAIが {self.player2.faction} のデッキを構築しています...")
                deck2 = self.build_deck_auto(self.player2, self.df)
                if not self.quiet: print("AIのデッキ構築が完了しました！\n")
            else:
                deck2 = await self.build_player_deck(self.player2, self.df)
        await self.setup_initial_board(self.player1, deck1)
        await self.setup_initial_board(self.player2, deck2)
        if self.player1.brain: self.player1.brain.record_deck(deck1)
        if self.player2.brain: self.player2.brain.record_deck(deck2)
        if random.choice([True, False]):
            self.current_player = self.player1; self.enemy_player = self.player2
        else:
            self.current_player = self.player2; self.enemy_player = self.player1
        try:
            import js
            dashboard = js.document.getElementById("fixed-dashboard")
            if dashboard: dashboard.innerText = "実戦フェイズ：初期配置完了"
        except: pass

    async def build_player_deck(self, player, all_cards):
        pool = [Card(row) for _, row in all_cards.iterrows() if row['Faction'] == player.faction or row['Faction'] == player.faction.replace("軍", "")]
        events = [c for c in pool if c.type in ['イベント', 'アクシデント']]
        non_events = [c for c in pool if c.type not in ['イベント', 'アクシデント']]
        deck = []
        deck.extend(events) 
        current_cost = 0
        
        while True:
            available_cards = {}
            for c in non_events:
                key = (c.name, c.type, c.cost)
                if key not in available_cards: available_cards[key] = []
                available_cards[key].append(c)
                
            in_deck_cards = {}
            for c in deck:
                if c.type not in ['イベント', 'アクシデント']:
                    key = (c.name, c.type, c.cost)
                    in_deck_cards[key] = in_deck_cards.get(key, 0) + 1
                    
            # ====================================================
            # ★ ここから：画面上部（ダッシュボード）への表示更新処理！
            # ====================================================
            board_str = f"=== 【{player.faction}】 現在の配備リスト ===\n"
            board_str += f"合計コスト: {current_cost} / 30\n\n"
            
            deck_display_list = []
            if not in_deck_cards:
                board_str += "  なし\n"
            else:
                d_idx = 1
                for key, count in in_deck_cards.items():
                    name, ctype, cost = key
                    board_str += f"  -{d_idx}: [{ctype}] {name} (コスト:{cost}) × {count}枚\n"
                    deck_display_list.append(key)
                    d_idx += 1
                    
            board_str += f"\n※[強制追加予定] イベントカード等: {len(events)}枚\n"
            
            try:
                import js
                dashboard = js.document.getElementById("fixed-dashboard")
                if dashboard: dashboard.innerText = board_str
            except Exception:
                pass
            # ====================================================

            print("\n" + "="*50)
            print(f"【デッキ構築：{player.faction}】 コスト: {current_cost} / 30")
            tank_count = len([c for c in deck if c.type == '戦車'])
            print(f"総枚数: {len(deck)}枚 (戦車: {tank_count}枚 / イベント: {len(events)}枚確定済)")
            
            print("\n[追加可能なカード]")
            display_list = []
            idx = 1
            for key, cards in available_cards.items():
                name, ctype, cost = key
                count = len(cards)
                display_list.append((key, cards))
                print(f"  {idx}: [{ctype}] {name} (コスト:{cost}) - 残り{count}枚")
                idx += 1
                
            print("-" * 50)
            print("番号: デッキに追加 / -番号: デッキから外す (例: -1) / 99: 構築完了")
            choice = (await safe_input("入力: ")).strip()
            
            if choice == '99':
                if tank_count < 3:
                    print("\n【！】ゲーム開始時の配置のため、戦車カードが最低3枚必要です！")
                    self.wait(1.5)
                    continue
                else:
                    print("\nデッキ構築が完了しました！")
                    break
                    
            is_remove = choice.startswith('-')
            if is_remove: choice = choice[1:]
            
            if choice.isdigit():
                parsed_idx = int(choice) - 1
                if is_remove:
                    if 0 <= parsed_idx < len(deck_display_list):
                        key_to_remove = deck_display_list[parsed_idx]
                        name, ctype, cost = key_to_remove
                        deck_target = [c for c in deck if c.name == name and c.type == ctype]
                        if deck_target:
                            removed_card = deck_target[0]
                            deck.remove(removed_card)
                            non_events.append(removed_card)
                            current_cost -= cost
                            print(f"\n{name} をデッキから外しました。")
                    else: print("\n無効な番号です。")
                else:
                    if 0 <= parsed_idx < len(display_list):
                        key, cards = display_list[parsed_idx]
                        name, ctype, cost = key
                        if current_cost + cost > 30:
                            print(f"\n【！】コスト上限(30)を超えるため追加できません！")
                        else:
                            card_to_add = cards[0]
                            deck.append(card_to_add)
                            non_events.remove(card_to_add)
                            current_cost += cost
                            print(f"\n{name} をデッキに追加しました。")
                    else: print("\n無効な番号です。")
            else: print("\n入力が正しくありません。")
            
        return deck

    def build_deck_auto(self, player, all_cards):
        pool = [Card(row) for _, row in all_cards.iterrows() if row['Faction'] == player.faction or row['Faction'] == player.faction.replace("軍", "")]
        events = [c for c in pool if c.type in ['イベント', 'アクシデント']]
        non_events = [c for c in pool if c.type not in ['イベント', 'アクシデント']]
        
        # 陣営によって選ぶテーマを完全に分離！
        if player.faction == "ドイツ軍":
            themes = ["重装甲大隊", "機動戦術"]
        else:
            themes = ["物量と陣地"]
            
        chosen_theme = random.choice(themes) 
        if player.is_ai and player.brain:
            state_str = "DeckBuild" 
            q_table = getattr(player.brain, 'q_table', {})
            if self.training_mode and random.random() < 0.2:
                chosen_theme = random.choice(themes)
            else:
                best_score = -9999
                for t in themes:
                    q_val = q_table.get(state_str, {}).get(t, 0.0)
                    final_score = q_val + random.uniform(0, 1) 
                    if final_score > best_score:
                        best_score = final_score
                        chosen_theme = t
            try: player.brain.record_action(state_str, chosen_theme)
            except: pass
            
        if player.is_ai: self.print_q(f"【AI構築】AIは過去の経験から『{chosen_theme}』テーマを選択しました！")
        
        card_scores = []
        deck_names_so_far = []
        for c in non_events:
            score = random.randint(1, 10)
            # 学習データからカードスコアを加算
            if player.brain:
                score += player.brain.get_card_score(c.name, deck_names_so_far)
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
        deck = []
        deck.extend(events)
        current_cost = 0
        added_tanks = 0
        for score, c in card_scores:
            if c.type == '戦車' and current_cost + c.cost <= 30:
                deck.append(c)
                current_cost += c.cost
                added_tanks += 1
                c.used_in_build = True
            else: c.used_in_build = False
        for score, c in card_scores:
            if not getattr(c, 'used_in_build', False):
                if current_cost + c.cost <= 30:
                    deck.append(c)
                    current_cost += c.cost
        return deck

    async def setup_initial_board(self, player, deck):
        tanks = [c for c in deck if c.type == '戦車']
        if player.is_ai or self.training_mode:
            random.shuffle(tanks)
            for i in range(3):
                if tanks:
                    tank = tanks.pop(0)
                    tank.is_face_up = False 
                    deck.remove(tank)
                    platoon_name = ['A', 'B', 'C'][i]
                    player.platoons[platoon_name].append(tank)
        else:
            self.print_q("\n" + "="*50)
            self.print_q(f"【初期配置フェイズ：{player.faction}】")
            self.print_q("各小隊(A, B, C)に配置する戦車をデッキから1枚ずつ選んでください。（裏向きで配置されます）")
            for p in ['A', 'B', 'C']:
                while True:
                    available_tanks = [c for c in deck if c.type == '戦車']
                    if not available_tanks: break
                    self.print_q(f"\n[小隊 {p} に配置する戦車を選択]")
                    for idx, t in enumerate(available_tanks):
                        self.print_q(f"  {idx + 1}: {t.name} (攻{t.attack}/防{t.defense})")
                    choice = await safe_input(f"小隊{p}に配置する番号を入力: ")
                    if choice.isdigit():
                        idx = int(choice) - 1
                        if 0 <= idx < len(available_tanks):
                            selected_tank = available_tanks[idx]
                            selected_tank.is_face_up = False
                            player.platoons[p].append(selected_tank)
                            deck.remove(selected_tank)
                            self.print_q(f"小隊{p}に {selected_tank.name} を配置しました。")
                            break
                        else: self.print_q("無効な番号です。")
                    else: self.print_q("数字を入力してください。")
        random.shuffle(deck)
        player.headquarters = deck
        for _ in range(4):
            if player.headquarters: player.hand.append(player.headquarters.pop(0))

    async def handle_platoon_annihilation(self, player, p):
        self.print_q(f"\n【小隊全滅】{player.faction}の小隊{p}が全滅し、陣地が空きました！")
        
        _enemy_ref = self.player1 if player == self.player2 else self.player2
        if _enemy_ref.brain: _enemy_ref.brain.add_intermediate_reward(0.3)
        if player.brain: player.brain.add_intermediate_reward(-0.3)
        # ==========================================
        # ★修正：全滅した瞬間に、その列の「進入済み」ステータスを完全に解除（自陣に戻す）
        # ==========================================
        player.advanced[p] = False 
        
        tanks_in_hand = [c for c in player.hand if c.type == '戦車']
        if not tanks_in_hand or any(att.name == '連合軍の慢心' for att in player.attachments[p]): return
            
        if player.is_ai or self.training_mode:
            deploy_tank = random.choice(tanks_in_hand)
            deploy_tank.is_face_up = False
            player.platoons[p].append(deploy_tank)
            player.hand.remove(deploy_tank)
            self.print_q(f"【AIの補充】ルール7.5(1)により、AIは空いた小隊{p}に手札から戦車を裏向きで配備しました！")
            
            # ★追加：もしこの空いた陣地に敵が進入していた場合、補充されたことで「押し返し」が発生する
            enemy = self.player1 if player == self.player2 else self.player2
            if enemy.advanced[p]:
                enemy.advanced[p] = False
                self.print_q(f"【押し返し】正面に戦車が補充されたため、進入していた敵部隊は押し返されました！")
        else:
            print(f"ルール7.5(1): 空いた自陣地(小隊{p})に手札から戦車カードを1枚直ちに配備できます。")
            print("--- 手札の戦車カード ---")
            for i, tc in enumerate(tanks_in_hand):
                print(f"{i+1}: {tc.name} (コスト:{tc.cost})")
            print("99: 配置しない")
            while True:
                ans = (await safe_input("配置する戦車の番号を入力 (99: 配置しない): ")).strip()
                if ans == '99': break
                if ans.isdigit():
                    idx = int(ans) - 1
                    if 0 <= idx < len(tanks_in_hand):
                        deploy_tank = tanks_in_hand[idx]
                        deploy_tank.is_face_up = False
                        player.platoons[p].append(deploy_tank)
                        player.hand.remove(deploy_tank)
                        print(f"空いた小隊{p}に {deploy_tank.name} を裏向きで配備しました！")
                        
                        # ★追加：押し返し処理
                        enemy = self.player1 if player == self.player2 else self.player2
                        if enemy.advanced[p]:
                            enemy.advanced[p] = False
                            print(f"【押し返し】正面に戦車が補充されたため、進入していた敵部隊は押し返されました！")
                        break
                    else: print("無効な番号です。")

    def format_card(self, card, is_enemy, html=False):
        if not card.is_face_up and is_enemy: text = "????"
        else:
            if card.type == '戦車' and "欺瞞" not in card.name and "ダミー" not in card.name: 
                text = f"{card.short_name}({card.attack}/{card.defense})"
            else: text = f"{card.short_name}"
        if html and not card.is_face_up: return f"<span style='color: white;'>{text}</span>"
        return text

    def get_column_mods(self, player, col):
        atk = 0; def_val = 0
        if any(att.name == '陣地構築' for att in player.attachments[col]): def_val += 2
        if any(att.name == 'パイパー戦闘団' for att in player.attachments[col]): atk += 2
        if any(e.name == 'Nuts!' for e in player.active_events): def_val += 2
        terrain = self.terrains[col]
        if terrain:
            if terrain.name == '深雪':
                if not any(e.name == 'アルデンヌの霧' for e in player.active_events): atk -= 2
            if hasattr(terrain, 'owner') and terrain.owner == player:
                if terrain.name == 'サン・ヴィット': def_val += 2
                elif terrain.name == 'バストーニュ': atk += 1; def_val += 2
            elif hasattr(terrain, 'faction') and terrain.faction == player.faction:
                if terrain.name == 'サン・ヴィット': def_val += 2
                elif terrain.name == 'バストーニュ': atk += 1; def_val += 2
        res = ""
        if atk > 0: res += f"攻+{atk}"
        elif atk < 0: res += f"攻{atk}"
        if def_val > 0: res += f"防+{def_val}"
        visual_len = sum(2 if unicodedata.east_asian_width(c) in 'FWA' else 1 for c in res)
        padding = max(0, 10 - visual_len)
        left_pad = padding // 2
        right_pad = padding - left_pad
        return (" " * left_pad) + res + (" " * right_pad)

    def show_battlefield(self):
        if self.quiet or self.training_mode: return
        top_player = self.player2; bottom_player = self.player1
        board_str = "=================== 戦場 ===================\n"
        board_str += f"【{top_player.faction}】 (司令部残り: {len(top_player.headquarters)}枚 / 捨て札: {len(top_player.discard_pile)}枚 / 手札: {len(top_player.hand)}枚)\n"
        if top_player.active_events:
            event_names = ", ".join([e.name for e in top_player.active_events])
            board_str += f"  <span style='color: #ff6666;'>[発動中イベント]: {event_names}</span>\n"
            
        for platoon in ['A', 'B', 'C']:
            status = " [進入済!]" if top_player.advanced[platoon] else ""
            if top_player.attachments[platoon]:
                status += f" (付与:{', '.join([c.name for c in top_player.attachments[platoon]])})"
            cards = ", ".join([self.format_card(c, is_enemy=top_player.is_ai, html=True) for c in top_player.platoons[platoon]])
            if not cards: cards = "(空)"
            if self.terrains[platoon] and ("陣地" in self.terrains[platoon].name or "ボックス陣地" in self.terrains[platoon].name) and not top_player.advanced[platoon]:
                if hasattr(self.terrains[platoon], 'owner') and self.terrains[platoon].owner == top_player: cards += "(射撃不可)"
            board_str += f"  列 {platoon}{status}: {cards}\n"
            
        board_str += "----------------- VS -----------------\n"
        for col in ['A', 'B', 'C']:
            ai_mod = self.get_column_mods(top_player, col); pl_mod = self.get_column_mods(bottom_player, col)
            top_stars = "★" * len(top_player.platoons[col]); bottom_stars = "★" * len(bottom_player.platoons[col])
            terrain_name = "平地"
            if self.terrains[col]:
                terrain_name = self.terrains[col].name
                if self.terrains[col].name in ['深雪', '森林'] and self.terrain_progress[col] > 0: terrain_name += f"(除去{self.terrain_progress[col]}/2)"
            center_text = f"{top_stars} {terrain_name} {bottom_stars}"
            center_visual_len = sum(2 if unicodedata.east_asian_width(c) in 'FWA' else 1 for c in center_text)
            center_padding = max(0, 24 - center_visual_len)
            center_left = center_padding // 2
            center_right = center_padding - center_left
            padded_center = (" " * center_left) + center_text + (" " * center_right)
            board_str += f"  [{ai_mod}] {padded_center} [{pl_mod}] (列 {col})\n"
        board_str += "--------------------------------------\n"
        
        for platoon in ['A', 'B', 'C']:
            status = " [進入済!]" if bottom_player.advanced[platoon] else ""
            if bottom_player.attachments[platoon]:
                status += f" (付与:{', '.join([c.name for c in bottom_player.attachments[platoon]])})"
            cards = ", ".join([self.format_card(c, is_enemy=bottom_player.is_ai, html=True) for c in bottom_player.platoons[platoon]])
            if not cards: cards = "(空)"
            if self.terrains[platoon] and ("陣地" in self.terrains[platoon].name or "ボックス陣地" in self.terrains[platoon].name) and not bottom_player.advanced[platoon]:
                if hasattr(self.terrains[platoon], 'owner') and self.terrains[platoon].owner == bottom_player: cards += "(射撃不可)"
            board_str += f"  列 {platoon}{status}: {cards}\n"
            
        if bottom_player.active_events:
            event_names = ", ".join([e.name for e in bottom_player.active_events])
            board_str += f"  <span style='color: #ff6666;'>[発動中イベント]: {event_names}</span>\n"
        board_str += f"【{bottom_player.faction}】 (司令部残り: {len(bottom_player.headquarters)}枚 / 捨て札: {len(bottom_player.discard_pile)}枚)\n"
        board_str += "============================================\n"
        
        if not bottom_player.is_ai:
            def get_east_asian_width_count(text):
                count = 0
                for c in text:
                    if unicodedata.east_asian_width(c) in 'FWA': count += 2
                    else: count += 1
                return count

            board_str += "【あなたの手札】:\n"
            hand_len = len(bottom_player.hand)
            if hand_len == 0: board_str += "  なし\n"
            else:
                for i in range(0, hand_len, 2):
                    c1 = bottom_player.hand[i]
                    s1 = f"  {i+1}: [{c1.type}] {c1.name}"
                    if c1.type == '戦車': s1 += f"({c1.attack}/{c1.defense})"
                    if i + 1 < hand_len:
                        c2 = bottom_player.hand[i+1]
                        s2 = f"{i+2}: [{c2.type}] {c2.name}"
                        if c2.type == '戦車': s2 += f"({c2.attack}/{c2.defense})"
                        visual_len = get_east_asian_width_count(s1)
                        pad = max(2, 25 - visual_len)
                        line_str = f"{s1}" + (" " * pad) + f"{s2}\n"
                    else: line_str = f"{s1}\n"
                    board_str += line_str

        try:
            import js
            dashboard = js.document.getElementById("fixed-dashboard")
            if dashboard: dashboard.innerHTML = f"<div style='white-space: pre-wrap; font-family: inherit;'>{board_str}</div>"
        except: pass

    def damage_hq(self, target_player, amount, is_special_effect=False):
        for _ in range(amount):
            if len(target_player.headquarters) > 0:
                card = target_player.headquarters.pop(0)
                card.is_face_up = False
                target_player.discard_pile.append(card)
                self.print_q(f"司令部のカードが1枚削られました！(残り: {len(target_player.headquarters)}枚)")
                if self.current_player != target_player and self.current_player.brain:
                    self.current_player.brain.add_intermediate_reward(0.15)
                if target_player.brain:
                    target_player.brain.add_intermediate_reward(-0.15)
            else:
                if is_special_effect:
                    self.print_q(f"\n★★★ 特殊勝利！ カード効果によって {target_player.faction} の山札を0未満（マイナス）にしました！ ★★★")
                    self.game_over = True
                    self.winner = self.current_player
                return

    async def get_reaction(self, player, card_name):
        valid_cards = [c for c in player.hand if c.name == card_name]
        if not valid_cards: return None
        if player.is_ai or self.training_mode: return valid_cards[0]
        else:
            print(f"\n=== リアクションのチャンス！ ===")
            print(f"敵の行動に対して、手札のリアクションカード【{card_name}】を使用できます。使用しますか？")
            print(f"1: はい\n99: いいえ")
            while True:
                choice = (await safe_input("番号を入力: ")).strip()
                if choice == '1': return valid_cards[0]
                elif choice == '99': return None

    async def show_discard_pile(self, player):
        print(f"\n=== 【{player.faction}】の捨て札 ===")
        if not player.discard_pile: print("  なし")
        else:
            tanks = [c for c in player.discard_pile if c.type == '戦車' and c.is_face_up]
            others = [c for c in player.discard_pile if c.type != '戦車' or not c.is_face_up]
            print("[復活可能な戦車（表向き）]")
            if tanks:
                for c in tanks: print(f"  - {c.name} (攻{c.attack}/防{c.defense}) {'[※重戦車]' if '重戦車' in c.traits else ''}")
            else: print("  なし")
            print("\n[その他の捨て札（裏向きのカード、戦術カードなど）]")
            if others:
                for c in others:
                    if not c.is_face_up: print(f"  - [裏向きのカード]")
                    else: print(f"  - [{c.type}] {c.name}")
            else: print("  なし")
        print("====================================")
        await safe_input("\n【Enterキーを押して戻る...】")

    async def play(self):
        turn_count = 0
        while not self.game_over and turn_count < 150:
            turn_count += 1
            self.print_q(f"\n\n↓↓↓↓↓ 【{self.current_player.faction}】のターンです ↓↓↓↓↓")
            if self.current_player.is_ai: await self.ai_take_turn() 
            else: await self.take_turn()    
            if self.game_over: break
            
            while len(self.current_player.hand) < 4 and len(self.current_player.headquarters) > 0:
                drawn = self.current_player.headquarters.pop(0)
                if drawn.type == 'アクシデント':
                    self.print_q(f"\n【アクシデント発生！】『{drawn.name}』が発生！")
                    for p_target in [self.current_player, self.enemy_player]:
                        while p_target.active_events:
                            old_ev = p_target.active_events.pop(0)
                            self.print_q(f"  -> 古いイベント/アクシデント『{old_ev.name}』は押し出され、除外されました。")
                    self.current_player.active_events.append(drawn)
                else:
                    self.current_player.hand.append(drawn)
                    self.print_q(f"補給：【{self.current_player.faction}】はカードをドローしました。")
            if self.game_over: break
            self.print_q("--------------------------------------------")
            self.print_q(f"【{self.current_player.faction}】のターン終了。プレイヤー交代。")
            if not self.training_mode and not self.quiet: await safe_input("\n【ターンの結果を確認したら Enter キーを押して次へ...】")
            self.current_player, self.enemy_player = self.enemy_player, self.current_player

        if turn_count >= 150: self.winner = "Draw"
        if self.winner == "Draw":
            r1, r2 = 0.3, 0.3
        elif self.winner == self.player1:
            r1, r2 = 1.0, -1.0
        else:
            r1, r2 = -1.0, 1.0
        if self.player1.brain: await self.player1.brain.learn(r1)
        if self.player2.brain: await self.player2.brain.learn(r2)
        if self.player1.brain: await self.player1.brain.learn_deck(self.winner == self.player1)
        if self.player2.brain: await self.player2.brain.learn_deck(self.winner == self.player2)
        if self.player1.brain: await self.player1.brain.save_player_patterns()
        if self.player2.brain: await self.player2.brain.save_player_patterns()
        return self.winner

    async def take_turn(self):
        while True:
            if self.game_over: return True
            self.show_battlefield()
            print("\n行動を選択してください:")
            print("1: 敵小隊を攻撃 (旋回砲塔の活用も可能)")
            print("2: 移動 (敵陣地への進入、または地形の除去)")
            print("3: 司令部(デッキ)を攻撃 (長射程による狙撃もこちら)")
            print("4: 戦術カード(地形・アクション・イベント)を使用する")
            print("5: 戦車カードを小隊に追加")
            print("6: 手札を1枚デッキの下に戻し、1枚引く")
            
            # クライフ作戦の発動メニュー（ドイツ軍にカードがある時だけ表示）
            if any(e.name == 'クライフ作戦' for e in self.current_player.active_events):
                print("7: 発動中のイベント能力を使用する (クライフ作戦)")
                
            print("8: 自分の捨て札を確認する")
            
            # パットン第3軍の終了メニュー（連合軍で、かつ発動中のみ表示）
            if self.current_player.faction == '連合軍' and any(e.name == 'パットン第3軍' for e in self.current_player.active_events):
                print("0: パットン第3軍の連続行動を終了する")
                
            print("99: 終了する（引き分けにしてゲームを終える）")
            
            success = False
            try:
                choice = (await safe_input(f"[{self.current_player.faction}] 番号を入力してください: ")).strip()

                # ----------------------------------------------------
                # ★ クライフ作戦の能力2（手札破壊）の処理
                # ----------------------------------------------------
                if choice == '7' and any(e.name == 'クライフ作戦' for e in self.current_player.active_events):
                    greif = next(e for e in self.current_player.active_events if e.name == 'クライフ作戦')
                    self.current_player.active_events.remove(greif)
                    self.current_player.discard_pile.append(greif)
                    self.print_q("\n【クライフ作戦 発動！】ドイツ軍はカードを破棄し、敵の手札を破壊します！")
                    for _ in range(2):
                        if self.enemy_player.hand:
                            discarded = random.choice(self.enemy_player.hand)
                            self.enemy_player.hand.remove(discarded)
                            self.enemy_player.discard_pile.append(discarded)
                            self.print_q(f"敵の手札から『{discarded.name}』が捨て札にされました！")
                    return True
                if choice == '99':
                    print(f"\n【投了】あなたは投了（引き分け）を選択しました。ゲーム終了です。")
                    self.game_over = True; self.winner = "Draw"; return True
                elif choice == '0':
                    if any(e.name == 'パットン第3軍' for e in self.current_player.active_events):
                        print("パットン第3軍の連続行動を終了し、ターンを終了します。")
                        return False
                    else:
                        print("\n【！】このゲームにパスはありません（ルール6.0）。行動できない場合は「99: 投了する」を選んでください。")
                        continue
                elif choice == '1': success = await self.action_attack(self.current_player, self.enemy_player)
                elif choice == '2': success = await self.action_move(self.current_player, self.enemy_player)
                elif choice == '3': success = await self.action_attack_hq(self.current_player, self.enemy_player)
                elif choice == '4': success = await self.action_play_tactical_card(self.current_player, self.enemy_player)
                elif choice == '5': success = await self.action_add_tank(self.current_player, self.enemy_player)
                elif choice == '6': success = await self.action_swap_card(self.current_player)
                elif choice == '8': await self.show_discard_pile(self.current_player); continue
                elif choice == '9': await self.show_discard_pile(self.enemy_player); continue
                else: print("正しい番号が入力されませんでした。"); continue
                # プレイヤーの行動を相手AIの学習データに記録
                if success and self.enemy_player.brain:
                    action_map = {'1':'attack','2':'move','3':'attack_hq','4':'play_tactical','5':'add_tank','6':'swap'}
                    self.enemy_player.brain.record_player_action(action_map.get(choice, choice))
                if not success: continue
                
                if success:
                    patton_active = any(e.name == 'パットン第3軍' for e in self.current_player.active_events)
                    if patton_active and choice in ['1', '3', '5']:
                        await safe_input("\n【行動結果を確認したら Enter を押して連続行動へ...】")
                        print("\n【パットン第3軍】効果適用中！続けて行動（配置や射撃）が可能です。（終了する場合は 0 を選択）")
                        continue
                    return True
            except Exception as e:
                print(f"\n【システムエラー】入力エラー、または処理中に問題が発生しました。")
                traceback.print_exc()

    async def action_attack_hq(self, attacker, defender):
        print("\n司令部を攻撃する小隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
        val = (await safe_input("番号を入力: ")).strip()
        if val == '1': p = 'A'
        elif val == '2': p = 'B'
        elif val == '3': p = 'C'
        elif val == '99': return False
        else: return False

        if p not in attacker.platoons or not attacker.platoons[p]:
            print("\n【！】無効な選択、またはその小隊に戦車がいません。")
            return False

        if any(att.name == 'ティーガーショック' for att in attacker.attachments[p]) and len(attacker.platoons[p]) < 3:
            print(f"\n【！】ティーガーショックの影響により、小隊車両が3両以上になるまで司令部攻撃を行えません！")
            return False

        has_long_range = any('長射程' in t for tank in attacker.platoons[p] for t in tank.traits)

        if attacker.advanced.get(p, False):
            return self.execute_attack_hq(attacker, defender, p, is_long_range=False)
        elif has_long_range and not defender.platoons[p] and not self.terrains[p]:
            if any(e.name == 'Nuts!' for e in defender.active_events):
                print(f"\n【！】敵のイベント『Nuts!』により、長射程能力が無効化されています！")
                return False
            return self.execute_attack_hq(attacker, defender, p, is_long_range=True)
        else: 
            if has_long_range:
                if defender.platoons[p]: print("\n【！】正面に敵がいるため、長射程で司令部を攻撃できません！")
                elif self.terrains[p]: print(f"\n【！】正面に地形（{self.terrains[p].name}）があり射線が通らないため、長射程で司令部を攻撃できません！")
                else: print("\n【！】その小隊は進入していません！")
            else: print("\n【！】その小隊は進入していません！（長射程も持っていません）")
            return False

    def execute_attack_hq(self, attacker, defender, p, is_long_range=False):
        if len(defender.headquarters) == 0:
            self.print_q(f"\n★★★ 決着！ 山札が0の状態で司令部を攻撃されました！ {attacker.faction} の勝利です！ ★★★")
            self.game_over = True; self.winner = attacker; return True
        if is_long_range:
            self.print_q(f"\n【長射程攻撃】小隊{p}の『長射程』を活かし、敵司令部を直接攻撃します！")
            self.damage_hq(defender, 1)
        else:
            self.print_q(f"\n小隊{p}が敵陣地から司令部を直接攻撃！")
            self.damage_hq(defender, 2)
        return True

    async def action_attack(self, attacker, defender):
        print("\n攻撃を指示する自軍の小隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
        val = (await safe_input("番号を入力: ")).strip()
        if val == '1': p = 'A'
        elif val == '2': p = 'B'
        elif val == '3': p = 'C'
        elif val == '99': return False
        else: return False

        if p in attacker.platoons and attacker.platoons[p]:
            has_turret = any('旋回砲塔' in t for tank in attacker.platoons[p] for t in tank.traits)
            if attacker.advanced[p] and not has_turret: 
                print("\n【！】進入済みですが、小隊に『旋回砲塔』を持つ戦車が含まれていないため攻撃できません！(司令部攻撃は【3】を選んでください)")
                return False
            if any(att.name == 'ティーガーショック' for att in attacker.attachments[p]) and len(attacker.platoons[p]) < 3:
                print(f"\n【！】ティーガーショックの影響により、小隊車両が3両以上になるまで射撃を行えません！")
                return False
            ignore_terrain = any(e.name == 'アルデンヌの霧' for e in attacker.active_events)
            if self.terrains[p] and '森林' in self.terrains[p].name and not ignore_terrain:
                print(f"\n【！】ルールにより『森林』がある列(小隊{p})からは射撃を行えません！")
                return False
                
            target_p = p
            if attacker.advanced[p]:
                valid_targets = [col for col in ['A', 'B', 'C'] if col != p and defender.platoons[col]]
                if not valid_targets:
                    print("\n【！】進入済みの列の正面には敵がおらず、他列にも敵がいないため攻撃できません！(司令部攻撃は【3】を選んでください)")
                    return False
                elif len(valid_targets) == 1:
                    target_p = valid_targets[0]
                    print(f"【旋回砲塔】攻撃可能な敵小隊が {target_p} 列のみのため、自動的に対象を『{target_p}』に設定しました。")
                else:
                    print(f"\n【進入済・旋回砲塔】攻撃対象の敵小隊列を選択してください (可能な列: {', '.join(valid_targets)} | 1: A / 2: B / 3: C / 99: 戻る)")
                    target_val = (await safe_input("番号を入力: ")).strip()
                    if target_val == '1': t_p = 'A'
                    elif target_val == '2': t_p = 'B'
                    elif target_val == '3': t_p = 'C'
                    elif target_val == '99': return False
                    else: return False
                    if t_p not in valid_targets: return False
                    target_p = t_p
            else:
                if has_turret:
                    valid_targets = []
                    if defender.platoons[p]: valid_targets.append(p)
                    for col in ['A', 'B', 'C']:
                        if col != p and defender.platoons[col] and defender.advanced[col]:
                            valid_targets.append(col)
                    if len(valid_targets) == 0: target_p = p 
                    elif len(valid_targets) == 1:
                        target_p = valid_targets[0]
                        if target_p != p: print(f"【旋回砲塔】攻撃可能な対象が列 {target_p} のみのため、自動的に対象を『{target_p}』に設定しました。")
                    else:
                        print(f"\n攻撃対象の敵小隊列を選択してください (可能な列: {', '.join(valid_targets)} | 1: A / 2: B / 3: C / 99: 戻る)")
                        target_val = (await safe_input("番号を入力: ")).strip()
                        if target_val == '1': t_p = 'A'
                        elif target_val == '2': t_p = 'B'
                        elif target_val == '3': t_p = 'C'
                        elif target_val == '99': return False
                        else: return False
                        if t_p not in valid_targets: return False
                        target_p = t_p
                else: target_p = p

            if target_p not in ['A', 'B', 'C']:
                print("無効な選択です。")
                return False
            if not defender.platoons[target_p]:
                print(f"\n【！】指定した列(小隊{target_p})に敵戦車がいません！\n(※敵がいない列から司令部への長射程攻撃を行う場合は、【3: 司令部を攻撃】を選んでください)")
                return False
            if p != target_p and not attacker.advanced[p]:
                if not defender.advanced[target_p]:
                    print(f"\n【！】未進入の部隊が他列を攻撃できるのは、対象が「自陣に進入済み」の敵小隊のみです！")
                    return False
            return await self.execute_attack(attacker, defender, p, target_p)
        else: 
            print("\n【！】無効な選択、またはその小隊に戦車がいません。")
            return False

    async def execute_attack(self, attacker, defender, atk_p, def_p):
        for card in attacker.platoons[atk_p]: card.is_face_up = True
        if defender.platoons[def_p]: defender.platoons[def_p][0].is_face_up = True
            
        atk_dummies = [c for c in attacker.platoons[atk_p] if "欺瞞" in c.name or "ダミー" in c.name]
        for d in atk_dummies:
            self.print_q(f"【罠消滅】攻撃側の『{d.name}』は正体を現し、直ちに廃棄されました！")
            attacker.platoons[atk_p].remove(d); attacker.discard_pile.append(d)
            
        dummies = [c for c in defender.platoons[def_p] if ("欺瞞" in c.name or "ダミー" in c.name) and c.is_face_up]
        for d in dummies:
            self.print_q(f"【ダミー消滅】防御側の『{d.name}』は正体を現し、直ちに廃棄されました！")
            defender.platoons[def_p].remove(d); defender.discard_pile.append(d)
            
        if not defender.platoons[def_p]:
            defender.advanced[def_p] = False
            self.print_q(f"\n【交戦結果】敵の列{def_p}はダミーのみでもぬけの殻でした！攻撃対象が存在しません。")
            await self.handle_platoon_annihilation(defender, def_p)
            return True

        target = defender.platoons[def_p][0]
        
        # ==========================================
        # ★ 修正：攻撃に参加できる戦車を厳密に判定！
        # ==========================================
        attacking_tanks = attacker.platoons[atk_p][:]
        is_flank_attack = (atk_p != def_p)
        
        if is_flank_attack:
            # 横方向からの射撃の場合、固定砲塔は一切参加できない（数にも含めない）
            attacking_tanks = [c for c in attacking_tanks if '固定砲塔' not in c.traits]
            if not attacking_tanks:
                self.print_q("【攻撃失敗】横方向への射撃のため、固定砲塔は参加できず、有効な戦力がありません！")
                return True
                
        atk_names = ", ".join([f"{c.name}(攻{c.attack})" for c in attacking_tanks])
        self.print_q(f"\n【交戦開始！】 {attacker.faction}の小隊{atk_p} [参加: {atk_names}] が、{defender.faction}の小隊{def_p} [表: {target.name}(防{target.defense})] を攻撃！")
        
        is_melee = attacker.advanced[atk_p] or defender.advanced[def_p]
        base_atk = 0
        
        if is_melee and not is_flank_attack:
            # 正面の近接戦闘の場合
            valid_atks = [int(c.attack) for c in attacking_tanks if '固定砲塔' not in c.traits]
            base_atk = max(valid_atks) if valid_atks else 0
            self.print_q(f"【乱戦ペナルティ】正面での近接戦闘のため、固定砲塔はベース攻撃力になれません。(ベース: {base_atk})")
        else:
            base_atk = max([int(c.attack) for c in attacking_tanks])

        # 参加可能な戦車の数だけでボーナスを計算
        atk_val = base_atk + (len(attacking_tanks) - 1)
        if any(att.name == 'パイパー戦闘団' for att in attacker.attachments[atk_p]): atk_val += 2
            
        patton = next((e for e in attacker.active_events if e.name == 'パットン第3軍'), None)
        patton_bonus_active = False
        if patton:
            if attacker.is_ai or self.training_mode:
                attacker.active_events.remove(patton); attacker.discard_pile.append(patton)
                atk_val += 3; patton_bonus_active = True
                self.print_q(">> パットンの効果で攻撃力が+3されました！")
            else:
                ans = (await safe_input("\n【パットン第3軍】このカードを捨て札にして攻撃力+3を得ますか？ (1: はい / 99: いいえ): ")).strip()
                if ans == '1':
                    attacker.active_events.remove(patton); attacker.discard_pile.append(patton)
                    atk_val += 3; patton_bonus_active = True
                    print(">> パットンの効果で攻撃力が+3されました！")

        valid_actions = [c for c in attacker.hand if c.name in ['奇襲', '近接航空支援', '壊乱', '強行軍']]
        filtered_actions = []
        for c in valid_actions:
            if c.name == '強行軍' and any('重戦車' in t for tank in attacker.platoons[atk_p] for t in tank.traits): continue
            filtered_actions.append(c)
        valid_actions = filtered_actions

        used_actions = []
        if valid_actions:
            if attacker.is_ai or self.training_mode:
                used_actions = [valid_actions[0]]
                self.print_q(f"【AI戦術】AIは射撃支援カード【{used_actions[0].name}】を使用しました！")
            else:
                while True:
                    print("\n=== 射撃支援のチャンス！ ===")
                    for i, c in enumerate(valid_actions): print(f"{i+1}: {c.name}を使用する")
                    print("99: 使用しない\n※複数使用する場合はカンマ区切りで入力（例: 1,3）")
                    choice = (await safe_input("番号を入力: ")).strip()
                    if choice == '99': break
                    temp_actions = []
                    parts = choice.split(',')
                    valid_input = True
                    for part in parts:
                        part = part.strip()
                        if part.isdigit():
                            idx = int(part) - 1
                            if 0 <= idx < len(valid_actions) and valid_actions[idx] not in temp_actions:
                                temp_actions.append(valid_actions[idx])
                            else: valid_input = False
                        else: valid_input = False
                    if not valid_input:
                        print("【！】入力が不正です。もう一度入力してください。")
                        continue
                    non_cas = [c for c in temp_actions if c.name != '近接航空支援']
                    if len(non_cas) > 1:
                        print("【！】『近接航空支援』以外の支援カードは、1回の攻撃につき1枚までしか使用できません！やり直してください。")
                        continue
                    used_actions = temp_actions
                    if used_actions:
                        print(f"アクションカード【{', '.join([c.name for c in used_actions])}】を使用しました！")
                    break
        
        active_actions = []
        if used_actions:
            for used_action in used_actions:
                reaction = None
                if used_action.name == '近接航空支援': reaction = await self.get_reaction(defender, '対空砲')
                elif used_action.name in ['奇襲', '強行軍']: reaction = await self.get_reaction(defender, '燃料切れ')
                if reaction:
                    self.print_q(f"\n【リアクション】{defender.faction}は『{reaction.name}』を使用して、敵の【{used_action.name}】を無効化しました！")
                    defender.hand.remove(reaction); defender.discard_pile.append(reaction)
                    attacker.hand.remove(used_action); attacker.discard_pile.append(used_action)
                else:
                    attacker.hand.remove(used_action); attacker.discard_pile.append(used_action)
                    active_actions.append(used_action)
                    if used_action.name == '奇襲': atk_val += 1
                    elif used_action.name == '近接航空支援': atk_val += 3

        ignore_terrain = any(e.name == 'アルデンヌの霧' for e in attacker.active_events)
        if self.terrains[atk_p] and '深雪' in self.terrains[atk_p].name:
            if ignore_terrain: self.print_q(f"【イベント効果】『アルデンヌの霧』により、深雪のペナルティを無効化しました！")
            else:
                self.print_q(f"【地形効果】自列の『深雪』により、攻撃力が -2 されます！")
                atk_val -= 2
            
        def_val_str = str(target.defense).split('-')
        if (is_flank_attack or is_melee) and len(def_val_str) > 1:
            def_val = int(def_val_str[1])
            self.print_q(f"【側面/接近戦】防御力は弱い方({def_val})が適用されます！")
        else: def_val = int(def_val_str[0])
        
        if any('傾斜装甲' in t for t in target.traits):
            reaction = await self.get_reaction(defender, '被弾経始')
            if reaction:
                self.print_q(f"\n【リアクション】{defender.faction}は『{reaction.name}』を使用し、防御力を+2しました！")
                defender.hand.remove(reaction); defender.discard_pile.append(reaction)
                def_val += 2
         
        if any(att.name == '陣地構築' for att in defender.attachments[def_p]): def_val += 2
        if any(e.name == 'Nuts!' for e in defender.active_events): def_val += 2
        if self.terrains[def_p] and getattr(self.terrains[def_p], 'owner', None) == defender:
            if self.terrains[def_p].name in ['サン・ヴィット', 'バストーニュ']: def_val += 2
        
        self.print_q(f"\n→ 最終計算！ 攻撃側攻撃力: {atk_val} VS 防御側防御力: {def_val}")
        
        for mc in [att for att in defender.attachments[def_p] if att.name == '連合軍の慢心']:
            defender.attachments[def_p].remove(mc); attacker.discard_pile.append(mc)
            self.print_q("【付与解除】射撃を受けたことにより、敵の『連合軍の慢心』が捨て札になりました！")

        if atk_val >= def_val:
            self.print_q(f"命中！敵列{def_p}の【{target.name}】を撃破しました！！")
            destroyed_tank = defender.platoons[def_p].pop(0)
            destroyed_tank.is_face_up = True 
            defender.discard_pile.append(destroyed_tank)
            
            if any(a.name == '壊乱' for a in active_actions) and defender.platoons[def_p]:
                self.print_q("【アクション効果】『壊乱』により、同一小隊の残りの敵戦車がすべて捨て札になります！")
                for t in defender.platoons[def_p]: t.is_face_up = True
                defender.discard_pile.extend(defender.platoons[def_p])
                defender.platoons[def_p] = []
                    
            if not defender.platoons[def_p]:
                defender.advanced[def_p] = False
                await self.handle_platoon_annihilation(defender, def_p)
                
                if not defender.platoons[def_p]:
                    if patton_bonus_active and not attacker.is_ai and not self.training_mode:
                        ans = (await safe_input(f"\n【パットン第3軍】効果で敵小隊を全滅させました！このまま敵陣地へ進入しますか？ (1: はい / 99: いいえ): ")).strip()
                        if ans == '1':
                            attacker.advanced[atk_p] = True
                            print(f"小隊{atk_p}が敵陣地へ進入しました！")
                            if len(defender.headquarters) == 0: self.game_over = True; self.winner = attacker
                    elif patton_bonus_active and (attacker.is_ai or self.training_mode):
                        attacker.advanced[atk_p] = True
                        self.print_q(f"小隊{atk_p}がパットンの効果で敵陣地へ進入しました！")
                        if len(defender.headquarters) == 0: self.game_over = True; self.winner = attacker

                if defender.attachments[def_p]:
                    for att in list(defender.attachments[def_p]):
                        defender.attachments[def_p].remove(att)
                        if att.faction == defender.faction: defender.discard_pile.append(att)
                        else: attacker.discard_pile.append(att)
                        self.print_q(f"【付与解除】対象小隊が全滅したため、『{att.name}』は捨て札になりました。")
                        if att.name == 'パイパー戦闘団':
                            self.print_q("【ペナルティ】パイパー戦闘団の全滅により、司令部にダメージ！")
                            self.damage_hq(defender, 1, is_special_effect=True)
                
                if self.terrains[def_p] and self.terrains[def_p].name in ['バストーニュ', 'サン・ヴィット']:
                    if getattr(self.terrains[def_p], 'owner', None) == defender:
                        discarded_terrain = self.terrains[def_p]; self.terrains[def_p] = None
                        defender.discard_pile.append(discarded_terrain)
                        self.print_q(f"【地形解除】防衛部隊が全滅したため、地形『{discarded_terrain.name}』は捨て札になりました。")
                        if discarded_terrain.name == 'バストーニュ':
                            self.print_q("【バストーニュ効果】敵戦車を撃破したため、敵司令部にダメージ！")
                            self.damage_hq(defender, 1, is_special_effect=True)
                        
            if any(a.name == '奇襲' for a in active_actions) and not defender.platoons[def_p]:
                if any(e.name == 'アルデンヌの霧' for e in attacker.active_events):
                    if not attacker.advanced[atk_p] and not defender.platoons[atk_p]:
                        do_advance = True
                        if not attacker.is_ai and not self.training_mode:
                            ans = await safe_input(f"\n【イベント効果】『アルデンヌの霧』により、小隊{atk_p}はそのまま敵陣地へ進入できます！進入しますか？ (1: はい / 99: いいえ): ")
                            do_advance = (ans.strip() == '1')
                        if do_advance:
                            self.print_q(f"小隊{atk_p}が敵陣地へ進入しました！")
                            attacker.advanced[atk_p] = True
                            for tank in attacker.platoons[atk_p]: tank.is_face_up = True
                            zinchi_cards = [att for att in attacker.attachments[atk_p] if att.name == '陣地構築']
                            for zc in zinchi_cards: attacker.attachments[atk_p].remove(zc); attacker.discard_pile.append(zc)
                            if len(defender.headquarters) == 0: self.game_over = True; self.winner = attacker

            if any(a.name == '強行軍' for a in active_actions) and not defender.platoons[def_p]:
                self.print_q("\n【アクション効果】『強行軍』により敵小隊が全滅しました！自軍の戦車を捨て札にして敵司令部を攻撃できます。")
                if attacker.is_ai or self.training_mode:
                    if len(attacker.platoons[atk_p]) > 1:
                        sac = attacker.platoons[atk_p].pop()
                        sac.is_face_up = True; attacker.discard_pile.append(sac)
                        self.print_q(f"AIは {sac.name} を捨て札にして、司令部にダメージを与えました！")
                        self.damage_hq(defender, 1, is_special_effect=True)
                        if not attacker.platoons[atk_p]: attacker.advanced[atk_p] = False
                else:
                    while attacker.platoons[atk_p]:
                        print("\n自軍小隊の戦車を捨て札にして司令部を攻撃しますか？")
                        for i, tank in enumerate(attacker.platoons[atk_p]): print(f"{i+1}: {tank.name} を捨て札にする")
                        ans = (await safe_input("番号を入力 (99: やめる): ")).strip()
                        if ans == '99': break
                        if ans.isdigit():
                            idx = int(ans) - 1
                            if 0 <= idx < len(attacker.platoons[atk_p]):
                                sac = attacker.platoons[atk_p].pop(idx)
                                sac.is_face_up = True; attacker.discard_pile.append(sac)
                                self.damage_hq(defender, 1, is_special_effect=True)
                                if not attacker.platoons[atk_p]: attacker.advanced[atk_p] = False
                                break
        else:
            self.print_q("弾かれた！装甲を抜けませんでした...")
            
        if self.terrains[atk_p] and '深雪' in self.terrains[atk_p].name and attacker.platoons[atk_p] and not ignore_terrain:
            lost_tank = attacker.platoons[atk_p].pop()
            lost_tank.is_face_up = True; attacker.discard_pile.append(lost_tank)
            self.print_q(f"【深雪のペナルティ】射撃の反動・被害により、自軍の {lost_tank.name} が捨て札になりました...")
            if not attacker.platoons[atk_p]:
                attacker.advanced[atk_p] = False
                await self.handle_platoon_annihilation(attacker, atk_p)
                if attacker.attachments[atk_p]:
                    for att in list(attacker.attachments[atk_p]):
                        attacker.attachments[atk_p].remove(att)
                        if att.faction == attacker.faction: attacker.discard_pile.append(att)
                        else: defender.discard_pile.append(att)
                        if att.name == 'パイパー戦闘団': self.damage_hq(attacker, 1, is_special_effect=True)
                if self.terrains[atk_p] and self.terrains[atk_p].name in ['バストーニュ', 'サン・ヴィット']:
                    if getattr(self.terrains[atk_p], 'owner', None) == attacker:
                        discarded_terrain = self.terrains[atk_p]; self.terrains[atk_p] = None
                        attacker.discard_pile.append(discarded_terrain)
        return True

    async def action_play_tactical_card(self, player, enemy):
        combat_only = ['奇襲', '強行軍', '壊乱', '近接航空支援']
        tactical_cards = [c for c in player.hand if (c.type in ['地形', 'イベント']) or (c.type == 'アクション' and c.name not in combat_only)]
        if not tactical_cards:
            print("\n【！】手札に『盤面に配置・発動』できるカードがありません。")
            return False
            
        print("\n--- 戦術カードの使用 ---")
        for i, c in enumerate(tactical_cards): print(f"{i+1}: [{c.type}] {c.name}")
        val = (await safe_input("使用するカードの番号を入力 (99: 戻る): ")).strip()
        if val == '99': return False
        
        if not val.isdigit() or int(val) - 1 < 0 or int(val) - 1 >= len(tactical_cards):
            print("無効な番号です。")
            return False
            
        card = tactical_cards[int(val) - 1]
        
        if card.type == 'イベント':
            for pl in [player, enemy]:
                if pl.active_events:
                    print(f"【イベント上書き】発動中だった『{pl.active_events[0].name}』は捨て札になりました！")
                    pl.discard_pile.extend(pl.active_events); pl.active_events.clear()
            player.active_events.append(card); player.hand.remove(card)
            print(f"\nイベントカード【{card.name}】を盤面に発動しました！")
            return True
            
        elif card.type == '地形':
            print("\n配置する列を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
            val_input = await safe_input("番号を入力: ")
            if val_input == '1': p = 'A'
            elif val_input == '2': p = 'B'
            elif val_input == '3': p = 'C'
            elif val_input == '99': return False
            else: return False

            if self.terrains[p] is not None or player.advanced[p] or enemy.advanced[p]:
                print("\n【！】その列には配置できません！")
                return False
            card.owner = player
            self.terrains[p] = card; self.terrain_progress[p] = 0; player.hand.remove(card)
            print(f"列{p}に地形【{card.name}】を配置しました！")
            return True
                
        elif card.type == 'アクション':
            if card.name == '空からの補給':
                tanks_in_discard = [c for c in player.discard_pile if c.type == '戦車' and '重戦車' not in c.traits and c.is_face_up]
                if not tanks_in_discard:
                    print("\n【！】捨て札置き場に復活可能な表向きの戦車がありません！")
                    return False
                
                reaction = await self.get_reaction(enemy, '対空砲')
                if reaction:
                    print(f"\n【リアクション】敵は『{reaction.name}』を使用し、空からの補給を撃ち落としました！")
                    enemy.hand.remove(reaction); enemy.discard_pile.append(reaction)
                    player.hand.remove(card); player.discard_pile.append(card)
                    return True

                print("\n配置先の小隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
                val_input = await safe_input("番号を入力: ")
                if val_input == '1': p = 'A'
                elif val_input == '2': p = 'B'
                elif val_input == '3': p = 'C'
                elif val_input == '99': return False
                else: return False

                if p in player.platoons:
                    revived_tanks = []
                    for _ in range(2):
                        if tanks_in_discard:
                            res = tanks_in_discard.pop(0)
                            player.discard_pile.remove(res); revived_tanks.append(res)
                    for t in revived_tanks:
                        t.is_face_up = False
                        player.platoons[p].append(t)
                        if enemy.advanced[p]: enemy.advanced[p] = False
                    player.hand.remove(card); player.discard_pile.append(card)
                    print(f"小隊{p}に {len(revived_tanks)} 両の戦車を復活配備しました！")
                    return True
                return False

            target_enemy = card.name in ['ティーガーショック', '連合軍の慢心']
            print("\n対象の小隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
            val_input = await safe_input("番号を入力: ")
            if val_input == '1': p = 'A'
            elif val_input == '2': p = 'B'
            elif val_input == '3': p = 'C'
            elif val_input == '99': return False
            else: return False

            if p in ['A', 'B', 'C']:
                target_platoons = enemy.platoons[p] if target_enemy else player.platoons[p]
                target_attachments = enemy.attachments[p] if target_enemy else player.attachments[p]

                if card.name in ['陣地構築', 'パイパー戦闘団'] and not player.platoons[p]:
                    print("\n【！】自軍のその小隊には戦車がいないため、付与できません！")
                    return False
                if card.name == 'ティーガーショック' and not enemy.platoons[p]:
                    print("\n【！】敵のその小隊には戦車がいないため、付与できません！")
                    return False
                if any(att.name == card.name for att in target_attachments):
                    print(f"\n【！】その小隊には既に『{card.name}』が付与されています！")
                    return False

                target_attachments.append(card)
                player.hand.remove(card)
                print(f"小隊{p}に【{card.name}】を付与しました！")

                # ----------------------------------------------------
                # ★ ここに陣地構築による不利なカードの除去処理を追加！
                # ----------------------------------------------------
                if card.name == '陣地構築':
                    bad_cards = [att for att in player.attachments[p] if att.name in ['連合軍の慢心', 'ティーガーショック']]
                    for bad in bad_cards:
                        player.attachments[p].remove(bad)
                        enemy.discard_pile.append(bad)
                        print(f"\n【陣地構築の効果】陣地を築いたことで、小隊{p}の不利な状態『{bad.name}』が取り除かれました！")
                # ----------------------------------------------------

                return True
            return False

    async def action_move(self, attacker, defender):
        print("\n移動を行う自軍の小隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
        val_input = await safe_input("番号を入力: ")
        if val_input == '1': p = 'A'
        elif val_input == '2': p = 'B'
        elif val_input == '3': p = 'C'
        elif val_input == '99': return False
        else: return False

        if p in attacker.platoons and attacker.platoons[p]:
            if any(att.name == 'ティーガーショック' for att in attacker.attachments[p]) and len(attacker.platoons[p]) < 3:
                print(f"\n【！】ティーガーショックの影響により、移動（地形除去や進入）はできません！")
                return False
            return self.execute_move(attacker, defender, p)
        else: 
            print("\n【！】無効な選択、またはその小隊に戦車がいません。")
            return False

    def execute_move(self, attacker, defender, p):
        if self.terrains[p] and self.terrains[p].name in ['深雪', '森林']:
            self.terrain_progress[p] += 1
            self.print_q(f"\n小隊{p}が地形『{self.terrains[p].name}』の突破/除去を試みました！(進行度: {self.terrain_progress[p]}/2)")
            if self.terrain_progress[p] >= 2:
                self.print_q(f"【地形除去】地形『{self.terrains[p].name}』を取り除きました！")
                removed = self.terrains[p]; self.terrains[p] = None; self.terrain_progress[p] = 0
                attacker.discard_pile.append(removed)
            return True
            
        if self.terrains[p] and self.terrains[p].name in ['バストーニュ', 'サン・ヴィット']:
            if getattr(self.terrains[p], 'owner', None) != attacker:
                self.print_q(f"\n【！】敵の拠点（{self.terrains[p].name}）は移動では除去できません！（戦闘で全滅させる必要があります）")
                return False

        if defender.platoons[p]: 
            self.print_q("\n【！】正面に敵がいるため進入できません！")
            return False
        elif attacker.advanced[p]: 
            self.print_q("\n【！】既に進入済みです！")
            return False
        else:
            attacker.advanced[p] = True
            for card in attacker.platoons[p]: card.is_face_up = True
            self.print_q(f"\n小隊{p}が敵陣地へ進入しました！")
            if attacker.brain: attacker.brain.add_intermediate_reward(0.2)
            if len(defender.headquarters) == 0:
                self.print_q("\n★★★ 決着！ 山札0の状態で陣地侵入を許しました！ ★★★")
                self.game_over = True; self.winner = attacker
            zinchi_cards = [att for att in attacker.attachments[p] if att.name == '陣地構築']
            for zc in zinchi_cards:
                attacker.attachments[p].remove(zc); attacker.discard_pile.append(zc)
                self.print_q("【付与解除】移動したため、『陣地構築』が捨て札になりました。")
            return True

    async def action_add_tank(self, player, enemy): 
        tanks = [c for c in player.hand if c.type == '戦車']
        if not tanks:
            print("\n【！】手札に戦車がありません。")
            return False
            
        print("\n追加先の小隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
        val_input = (await safe_input("番号を入力: ")).strip()
        if val_input == '1': p = 'A'
        elif val_input == '2': p = 'B'
        elif val_input == '3': p = 'C'
        elif val_input == '99': return False
        else: return False
        
        if p not in player.platoons:
            print("無効な小隊です。")
            return False

        if any(att.name == '連合軍の慢心' for att in player.attachments[p]):
            print(f"\n【！】『連合軍の慢心』の影響により、この小隊には手札から戦車を配置できません！")
            return False

        added_count = 0
        while True:
            current_tanks = [c for c in player.hand if c.type == '戦車']
            if not current_tanks:
                if added_count > 0: print("\n手札の戦車をすべて配置しました。")
                break
                
            print(f"\n--- 小隊{p}への追加配置（現在 {added_count} 両追加済み） ---")
            for i, c in enumerate(current_tanks): 
                print(f"{i+1}: {c.name} (攻{c.attack}/防{c.defense})")
            
            val = (await safe_input("追加する戦車の番号を入力 (99: 配置を終了してターンを進める): ")).strip()
            
            if val == '99': 
                if added_count == 0: return False
                break
            
            if val.isdigit():
                idx = int(val) - 1
                if 0 <= idx < len(current_tanks):
                    card = current_tanks[idx]
                    card.is_face_up = False
                    
                    if "欺瞞" in card.name or "ダミー" in card.name:
                        player.platoons[p].insert(0, card)
                        print(f"小隊{p}の先頭にダミー {card.name} を裏向きで追加配置しました！")
                    else:
                        if len(player.platoons[p]) > 0:
                            print(f"\n【配置位置の選択】現在の小隊{p}の並び:")
                            for pl_idx, t in enumerate(player.platoons[p]):
                                print(f"  {pl_idx + 1}番目 (現在の {t.name} の前)")
                            print(f"  {len(player.platoons[p]) + 1}番目 (最後尾に追加)")
                            
                            while True:
                                pos_val = (await safe_input(f"配置する位置を数字で入力してください (1〜{len(player.platoons[p]) + 1} / 99: この戦車の配置をやめる): ")).strip()
                                if pos_val == '99':
                                    card = None
                                    break
                                if pos_val.isdigit() and 1 <= int(pos_val) <= len(player.platoons[p]) + 1:
                                    insert_idx = int(pos_val) - 1
                                    player.platoons[p].insert(insert_idx, card)
                                    break
                                print("正しい番号を入力してください。")
                        else:
                            player.platoons[p].append(card)
                        if card is None:
                            print("配置をキャンセルしました。")
                            continue
                        print(f"小隊{p}に {card.name} を裏向きで追加配置しました！")

                    player.hand.remove(card)
                    added_count += 1
                    
                    # ----------------------------------------------------
                    # ★ クライフ作戦の能力1（戦車の強奪）の処理を追加
                    # ----------------------------------------------------
                    greif = next((e for e in enemy.active_events if e.name == 'クライフ作戦'), None)
                    if greif and player.faction == '連合軍' and not ("欺瞞" in card.name or "ダミー" in card.name):
                        print(f"\n【クライフ作戦 割り込み！】ドイツ軍は配置された『{card.name}』を奪い取ることができます！")
                        if enemy.is_ai:
                            # AIは空いている、または戦力が少ない陣地へ自動で奪う
                            target_p = min(['A', 'B', 'C'], key=lambda x: len(enemy.platoons[x]))
                            player.platoons[p].remove(card)
                            card.is_face_up = True
                            enemy.platoons[target_p].append(card)
                            print(f"AIは『{card.name}』を奪い、自軍の小隊{target_p}に表向きで配備しました！")
                        else:
                            ans = (await safe_input("この戦車を奪いますか？ (1: はい / 99: いいえ): ")).strip()
                            if ans == '1':
                                print("奪った戦車を配備する自軍の小隊を選んでください (1: A / 2: B / 3: C)")
                                while True:
                                    gp = (await safe_input("番号を入力: ")).strip()
                                    if gp in ['1', '2', '3']: break
                                    print("正しい番号を入力してください。")
                                target_p = 'A' if gp == '1' else 'B' if gp == '2' else 'C'
                                player.platoons[p].remove(card)
                                card.is_face_up = True
                                enemy.platoons[target_p].append(card)
                                print(f"『{card.name}』を奪い、自軍の小隊{target_p}に表向きで配備しました！")
                    # ----------------------------------------------------
                else:
                    print("無効な番号です。")
            else:
                print("数値を入力してください。")
                
        if added_count > 0:
            if enemy.advanced[p]:
                enemy.advanced[p] = False
                print(f"【押し返し】正面に戦車が配置されたため、敵の小隊{p}の進入状態は解除されました！")
            return True
        return False

    async def ai_take_turn(self):
        self.show_battlefield()
        self.print_q("\nAIが盤面を分析・計算中...（Q学習モード）")
        await asyncio.sleep(0.1)
        state_str = "Default"
        try: state_str = self.current_player.brain.get_abstract_state(self.current_player, self.enemy_player, self.terrains)
        except: pass
        
        platoons_with_tanks = [p for p in ['A', 'B', 'C'] if self.current_player.platoons[p]]
        can_attack_hq = []
        enemy_nuts = any(e.name == 'Nuts!' for e in self.enemy_player.active_events)
        for p in platoons_with_tanks:
            if any(att.name == 'ティーガーショック' for att in self.current_player.attachments[p]) and len(self.current_player.platoons[p]) < 3: continue
            if self.current_player.advanced[p]: can_attack_hq.append((p, False)) 
            else:
                has_long_range = any('長射程' in t for tank in self.current_player.platoons[p] for t in tank.traits)
                if has_long_range and not self.enemy_player.platoons[p] and not self.terrains[p] and not enemy_nuts:
                    can_attack_hq.append((p, True))

        combat_only = ['奇襲', '強行軍', '壊乱', '近接航空支援']
        tactical_cards = [c for c in self.current_player.hand if c.type in ['地形', 'アクション', 'イベント'] and c.name not in combat_only]
        valid_tacticals = []
        if tactical_cards:
            for c in tactical_cards:
                if c.name == '空からの補給':
                    if [dc for dc in self.current_player.discard_pile if dc.type == '戦車' and '重戦車' not in dc.traits and dc.is_face_up]: valid_tacticals.append(c)
                elif c.type == '地形':
                    if [col for col in ['A', 'B', 'C'] if self.terrains[col] is None and not self.current_player.advanced[col] and not self.enemy_player.advanced[col]]: valid_tacticals.append(c)
                elif c.name in ['陣地構築', 'パイパー戦闘団']:
                    mp_candidates = [mp for mp in ['A', 'B', 'C'] if self.current_player.platoons[mp] and not any(a.name == c.name for a in self.current_player.attachments[mp])]
                    if mp_candidates: valid_tacticals.append(c) 
                elif c.name in ['ティーガーショック', '連合軍の慢心']:
                    ep_candidates = [ep for ep in ['A', 'B', 'C'] if self.enemy_player.platoons[ep] and not any(a.name == c.name for a in self.enemy_player.attachments[ep])]
                    if ep_candidates: valid_tacticals.append(c) 
                else: valid_tacticals.append(c)

        can_move = []
        for p in platoons_with_tanks:
            if any(att.name == 'ティーガーショック' for att in self.current_player.attachments[p]) and len(self.current_player.platoons[p]) < 3: continue
            if self.terrains[p] and self.terrains[p].name in ['深雪', '森林']: can_move.append(p)
            elif not self.current_player.advanced[p] and not self.enemy_player.platoons[p]:
                if self.terrains[p] and self.terrains[p].name in ['バストーニュ', 'サン・ヴィット'] and getattr(self.terrains[p], 'owner', None) != self.current_player: continue
                can_move.append(p)

        can_attack = []
        ignore_terrain = any(e.name == 'アルデンヌの霧' for e in self.current_player.active_events)
        for p in platoons_with_tanks:
            has_turret = any('旋回砲塔' in t for tank in self.current_player.platoons[p] for t in tank.traits)
            if any(att.name == 'ティーガーショック' for att in self.current_player.attachments[p]) and len(self.current_player.platoons[p]) < 3: continue
            if self.terrains[p] and '森林' in self.terrains[p].name and not ignore_terrain: continue
            if self.current_player.advanced[p]:
                if has_turret:
                    for target_p in ['A', 'B', 'C']:
                        if target_p != p and self.enemy_player.platoons[target_p]: can_attack.append((p, target_p))
            else:
                if self.enemy_player.platoons[p]: can_attack.append((p, p))
                if has_turret:
                    for target_p in ['A', 'B', 'C']:
                        if target_p != p and self.enemy_player.platoons[target_p] and self.enemy_player.advanced[target_p]:
                            can_attack.append((p, target_p))

        tanks_in_hand = [c for c in self.current_player.hand if c.type == '戦車']
        valid_add_platoons = [p for p in ['A', 'B', 'C'] if not any(att.name == '連合軍の慢心' for att in self.current_player.attachments[p])]

        # ==========================================
        # ★ ここが消えてしまっていた大事な器です！
        # ==========================================
        evaluated_actions = []

        for p, is_lr in can_attack_hq: evaluated_actions.append(('attack_hq', (p, is_lr), 10000))
        
        # 攻撃の評価
        for atk_p, def_p in can_attack:
            attacker_tanks = self.current_player.platoons[atk_p]
            target_tank = self.enemy_player.platoons[def_p][0]
            
            participating_tanks = attacker_tanks[:]
            is_flank = (atk_p != def_p)
            if is_flank:
                participating_tanks = [c for c in participating_tanks if '固定砲塔' not in c.traits]
                
            if not participating_tanks: continue
            
            is_melee_combat = self.current_player.advanced[atk_p] or self.enemy_player.advanced[def_p]
            if is_melee_combat and not is_flank:
                valid_atks = [int(c.attack) for c in participating_tanks if '固定砲塔' not in c.traits]
                base_atk = max(valid_atks) if valid_atks else 0
            else:
                base_atk = max([int(c.attack) for c in participating_tanks])

            ai_atk_val = base_atk + len(participating_tanks) - 1
            if any(att.name == 'パイパー戦闘団' for att in self.current_player.attachments[atk_p]): ai_atk_val += 2
            
            def_val_str = str(target_tank.defense).split('-')
            def_val = int(def_val_str[1]) if (is_flank or is_melee_combat) and len(def_val_str) > 1 else int(def_val_str[0])
            if any(att.name == '陣地構築' for att in self.enemy_player.attachments[def_p]): def_val += 2
            
            score = 500 + (ai_atk_val - def_val) * 10 if ai_atk_val >= def_val else 10
            
            # 【最優先】自陣に進入してきた敵小隊への側面攻撃
            if self.enemy_player.advanced[def_p] and is_flank:
                score += 5000 
                
            evaluated_actions.append(('attack', (atk_p, def_p), score))

        # 戦車の配置評価
        for p in valid_add_platoons:
            for c in tanks_in_hand:
                score = 500 + int(c.attack) * 10 + int(str(c.defense).split('-')[0]) * 10
                if not self.current_player.platoons[p]: score += 300 
                if self.enemy_player.platoons[p]: score += 200 
                
                # 【次点】自陣に進入してきた敵小隊の正面への配置（押し返し）
                if self.enemy_player.advanced[p]:
                    score += 4000 
                    
                evaluated_actions.append(('add_tank', (p, c), score))

        # 戦術カードの評価（点数を平坦にし、AIの学習に委ねる）
        for c in valid_tacticals:
            if c.type == 'イベント': evaluated_actions.append(('play_tactical', c, 500))
            elif c.name == '空からの補給': evaluated_actions.append(('play_tactical', c, 500))
            elif c.name in ['ティーガーショック', '連合軍の慢心']:
                best_enemy_p = None; max_atk = -1
                for ep in ['A', 'B', 'C']:
                    if self.enemy_player.platoons[ep] and not any(a.name == c.name for a in self.enemy_player.attachments[ep]):
                        atk = sum([int(tank.attack) for tank in self.enemy_player.platoons[ep]])
                        if atk > max_atk: max_atk = atk; best_enemy_p = ep
                if best_enemy_p: evaluated_actions.append(('play_tactical_target', (c, best_enemy_p), 500))
            elif c.name in ['パイパー戦闘団', '陣地構築']:
                best_my_p = None; max_count = 0
                for mp in ['A', 'B', 'C']:
                    if len(self.current_player.platoons[mp]) > max_count and not any(a.name == c.name for a in self.current_player.attachments[mp]):
                        max_count = len(self.current_player.platoons[mp]); best_my_p = mp
                if best_my_p: evaluated_actions.append(('play_tactical_target', (c, best_my_p), 500))
            elif c.type == '地形': evaluated_actions.append(('play_tactical', c, 500))
            else: evaluated_actions.append(('play_tactical', c, 500))

        # 移動の評価
        for p in can_move:
            score = 300
            if not self.terrains[p] and not self.enemy_player.platoons[p]: score += 500 
            evaluated_actions.append(('move', p, score))

        if self.current_player.hand: evaluated_actions.append(('swap', None, 1))

        if not evaluated_actions:
            self.print_q("AIは何も行動できず投了しました。")
            self.game_over = True; self.winner = self.enemy_player; return False

        q_table = getattr(self.current_player.brain, 'q_table', {})
        best_action = None; best_score = -99999
        if self.training_mode and random.random() < 0.1: best_action = random.choice(evaluated_actions)
        else:
            for act in evaluated_actions:
                a_type = act[0]; base_score = act[2]; q_bonus = q_table.get(state_str, {}).get(a_type, 0.0)
                final_score = base_score + q_bonus + random.uniform(0, 5)
                if final_score > best_score: best_score = final_score; best_action = act
        
        action_type = best_action[0]; params = best_action[1]
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
            self.current_player.brain.record_action(state_str, action_type, detail)
        except: pass

        if action_type == 'attack_hq':
            p, is_lr = params
            self.print_q(f"AIは司令部への攻撃を選択！ (小隊{p})")
            self.execute_attack_hq(self.current_player, self.enemy_player, p, is_long_range=is_lr)
        elif action_type == 'play_tactical':
            c = params
            if c.type == 'イベント':
                self.print_q(f"AIはイベントカード【{c.name}】を発動しました！")
                for pl in [self.current_player, self.enemy_player]:
                    if pl.active_events: pl.discard_pile.extend(pl.active_events); pl.active_events.clear()
                self.current_player.active_events.append(c); self.current_player.hand.remove(c)
            elif c.type == '地形':
                empty_cols = [col for col in ['A', 'B', 'C'] if self.terrains[col] is None and not self.current_player.advanced[col] and not self.enemy_player.advanced[col]]
                col = random.choice(empty_cols) if empty_cols else 'A'
                c.owner = self.current_player
                self.print_q(f"AIは列{col}に地形【{c.name}】を配置しました！")
                self.terrains[col] = c; self.terrain_progress[col] = 0; self.current_player.hand.remove(c)
            elif c.name == '空からの補給':
                self.print_q(f"AIは【空からの補給】を使用しました！")
                reaction = await self.get_reaction(self.enemy_player, '対空砲')
                if reaction:
                    self.print_q(f"対空砲で撃ち落とされました！")
                    self.enemy_player.hand.remove(reaction); self.enemy_player.discard_pile.append(reaction)
                else:
                    tanks_in_discard = [dc for dc in self.current_player.discard_pile if dc.type == '戦車' and '重戦車' not in dc.traits and dc.is_face_up]
                    p = random.choice(valid_add_platoons) if valid_add_platoons else 'A'
                    revived_tanks = []
                    for _ in range(2):
                        if tanks_in_discard:
                            res = tanks_in_discard.pop(0)
                            self.current_player.discard_pile.remove(res); revived_tanks.append(res)
                    for t in revived_tanks:
                        t.is_face_up = False
                        self.current_player.platoons[p].append(t)
                        self.print_q(f"小隊{p}に【{t.name}】が復活配置されました！")
                        if self.enemy_player.advanced[p]: self.enemy_player.advanced[p] = False
                self.current_player.hand.remove(c); self.current_player.discard_pile.append(c)
        elif action_type == 'play_tactical_target':
            c, target_p = params
            target_enemy = c.name in ['ティーガーショック', '連合軍の慢心']
            if target_enemy: self.enemy_player.attachments[target_p].append(c)
            else: self.current_player.attachments[target_p].append(c)
            self.print_q(f"AIは小隊{target_p}に【{c.name}】を付与しました！")
            self.current_player.hand.remove(c)
        elif action_type == 'move':
            p = params
            self.print_q(f"AIは移動を選択しました！ (小隊{p})")
            self.execute_move(self.current_player, self.enemy_player, p)
        elif action_type == 'attack':
            atk_p, def_p = params
            self.print_q(f"AIは攻撃を選択！ (小隊{atk_p} -> 小隊{def_p})")
            await self.execute_attack(self.current_player, self.enemy_player, atk_p, def_p)
        elif action_type == 'add_tank':
            p, c = params
            self.print_q(f"AIは戦車カードを小隊{p}に追加しました！")
            c.is_face_up = False
            insert_idx = random.randint(0, len(self.current_player.platoons[p]))
            self.current_player.platoons[p].insert(insert_idx, c)
            self.current_player.hand.remove(c)
            if self.enemy_player.advanced[p]: self.enemy_player.advanced[p] = False
        elif action_type == 'swap':
            self.print_q("AIは手札を交換しました！")
            c = self.current_player.hand.pop(0)
            self.current_player.headquarters.append(c)
            self.current_player.hand.append(self.current_player.headquarters.pop(0))
        return False

# ---------------------------------------------
# 【Firebase連携ヘルパー】
# ---------------------------------------------
async def save_challenge_to_firebase(deck_name, player_name, faction, card_ids, win_rate, wins, losses, draws, game_version):
    """チャレンジデッキをFirestoreに保存"""
    import js
    from pyodide.ffi import to_js
    data = {
        "deck_name": deck_name,
        "player_name": player_name,
        "faction": faction,
        "card_ids": card_ids,
        "win_rate": win_rate,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "games_played": wins + losses + draws,
        "game_version": game_version,
        "created_at": str(js.Date.new().toISOString()),
        "human_challenges": 0,
        "human_wins": 0
    }
    js_data = to_js(data, dict_converter=js.Object.fromEntries)
    await js.window.db.collection("challenge_decks").add(js_data)

async def update_challenge_result(challenge_id, human_won):
    """挑戦結果をFirestoreに記録"""
    import js
    doc_ref = js.window.db.collection("challenge_decks").doc(challenge_id)
    increment = js.window.firebase.firestore.FieldValue.increment(1)
    update_data = {"human_challenges": increment}
    if human_won:
        update_data["human_wins"] = increment
    js_update = to_js(update_data, dict_converter=js.Object.fromEntries)
    await doc_ref.update(js_update)

async def async_main():
    import asyncio
    import js
    from pyodide.ffi import to_js

    # URLパラメータチェック（チャレンジモード）
    params = js.URLSearchParams.new(js.window.location.search)
    challenge_id = None
    raw = params.get("challenge")
    if raw is not None and str(raw) != "null" and str(raw).strip() != "":
        challenge_id = str(raw).strip()

    csv_file = "cards_west.csv"
    try: df = pd.read_csv(csv_file, encoding='utf-8-sig')
    except: df = pd.read_csv(csv_file, encoding='cp932')

    # === チャレンジモード（URLパラメータで飛んできた場合）===
    if challenge_id:
        try:
            print("\n" + "="*50)
            print("【チャレンジモード（西部戦線）】")
            print("="*50)
            print("\nデッキデータを読み込んでいます...")

            doc = await js.window.db.collection("challenge_decks").doc(challenge_id).get()
            if not doc.exists:
                print("\n[エラー] 指定されたデッキが見つかりません。")
                await safe_input("Enterで戻ります...")
                js.window.location.href = "../index.html"
                return

            deck_data = doc.data()
            enemy_faction = str(deck_data.faction)
            enemy_deck_name = str(deck_data.deck_name)
            enemy_player_name = str(deck_data.player_name)
            enemy_win_rate = float(deck_data.win_rate)
            # JSの配列をPythonリストに変換
            enemy_card_ids = [str(deck_data.card_ids[i]) for i in range(deck_data.card_ids.length)]

            print(f"\n★ 『{enemy_deck_name}』(by {enemy_player_name}) に挑戦！")
            print(f"  陣営: {enemy_faction} / AI勝率: {enemy_win_rate:.1f}%")

            # プレイヤーは反対陣営
            if enemy_faction == "ドイツ軍":
                player_faction = "連合軍"
            else:
                player_faction = "ドイツ軍"
            print(f"\nあなたは【{player_faction}】で戦います。")

            game = Game(df=df, p1_faction=player_faction, p2_faction=enemy_faction,
                        p1_ai=False, p2_ai=True, p2_preset_deck=enemy_card_ids)
            await game.setup_game()
            await game.play()

            # 結果をFirebaseに記録
            human_won = (game.winner == game.player1)
            try:
                increment = js.window.firebase.firestore.FieldValue.increment(1)
                update_data = {"human_challenges": increment}
                if human_won:
                    update_data["human_wins"] = increment
                js_update = to_js(update_data, dict_converter=js.Object.fromEntries)
                await js.window.db.collection("challenge_decks").doc(challenge_id).update(js_update)
                if human_won:
                    print("\n★★★ 勝利！チャレンジデッキを撃破しました！ ★★★")
                else:
                    print("\n--- 敗北... チャレンジデッキに負けました ---")
            except Exception as fe:
                print(f"\n(戦績の記録に失敗しました: {fe})")

            await safe_input("Enterで戻ります...")
            js.window.location.href = "../index.html"
            return

        except Exception as e:
            print(f"\n【エラー】チャレンジモードでエラーが発生しました: {e}")
            await safe_input("Enterで戻ります...")
            js.window.location.href = "../index.html"
            return

    # === 通常メニュー ===
    while True:
        try:
            print("\n" + "="*50)
            print("【作戦システム起動（西部戦線専用）】")
            print("="*50)

            print("\n【メニュー】")
            print("1: プレイヤー vs AI (コンピュータ)")
            print("2: チャレンジデッキを作る")
            print("0: 終了して『西部/アフリカ』選択に戻る")

            # 裏コマンド 'testai', 'trainai' は有効
            mode_choice = (await safe_input("形式を選んでください: ")).strip()

            # 0 を選んだらブラウザをリロードして最初の大元に戻る
            if mode_choice == '0':
                print("\n戦線選択画面に戻ります。リロード中...")
                js.window.location.href = "../index.html"
                return

            is_auto_training = (mode_choice == "trainai")
            is_test_ai = (mode_choice == "testai")

            # === チャレンジデッキ作成 ===
            if mode_choice == '2':
                print("\n" + "="*50)
                print("【チャレンジデッキ作成（西部戦線）】")
                print("="*50)

                faction_choice = await safe_input("陣営選択 (1: ドイツ / 2: 連合): ")
                if faction_choice == '1':
                    challenge_faction = "ドイツ軍"
                    opponent_faction = "連合軍"
                else:
                    challenge_faction = "連合軍"
                    opponent_faction = "ドイツ軍"

                # デッキ編集（既存UIを流用）
                print(f"\n【{challenge_faction}】のデッキを編成してください。")
                temp_game = Game(df=df, p1_faction=challenge_faction, p2_faction=opponent_faction)
                temp_player = Player(challenge_faction, is_ai=False)
                built_deck = await temp_game.build_player_deck(temp_player, df)

                # イベント/アクシデント以外のカードIDを抽出
                card_ids = [c.id for c in built_deck if c.type not in ['イベント', 'アクシデント']]

                player_name = (await safe_input("あなたの名前（ハンドルネーム）: ")).strip()
                if not player_name: player_name = "名無し"
                deck_name = (await safe_input("デッキ名: ")).strip()
                if not deck_name: deck_name = "無名デッキ"

                # AI 100回自動対戦
                print(f"\n『{deck_name}』の強さを測定します...")
                print("AI 100回自動対戦を開始します。しばらくお待ちください...\n")
                num_battles = 100
                p1_wins, p2_wins, draws = 0, 0, 0

                def show_challenge_progress(i):
                    done = i + 1
                    total = num_battles
                    pct = int(done / total * 100)
                    bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
                    rate = f"{p1_wins/done*100:.1f}%" if done > 0 else "-"
                    msg = (
                        f"【チャレンジデッキ測定中】\n\n"
                        f"  デッキ名: {deck_name}\n"
                        f"  陣営: {challenge_faction}\n\n"
                        f"  {done} / {total} 回  ({pct}%)\n"
                        f"  [{bar}]\n\n"
                        f"  デッキ勝利: {p1_wins}  ({rate})\n"
                        f"  AI勝利   : {p2_wins}\n"
                        f"  引き分け : {draws}\n"
                    )
                    try:
                        d = js.document.getElementById("fixed-dashboard")
                        if d: d.innerText = msg
                    except: pass

                for i in range(num_battles):
                    game = Game(df=df, p1_faction=challenge_faction, p2_faction=opponent_faction,
                                p1_ai=True, p2_ai=True, quiet_mode=True,
                                p1_preset_deck=card_ids)
                    await game.setup_game()
                    await game.play()

                    if game.winner == "Draw": draws += 1
                    elif game.winner == game.player1: p1_wins += 1
                    else: p2_wins += 1

                    if (i + 1) % 5 == 0 or i == num_battles - 1:
                        show_challenge_progress(i)
                        await asyncio.sleep(0)

                win_rate = round(p1_wins / num_battles * 100, 1)
                print(f"\n{'='*50}")
                print(f"【測定完了】")
                print(f"  デッキ名: {deck_name}")
                print(f"  作成者: {player_name}")
                print(f"  陣営: {challenge_faction}")
                print(f"  勝率: {win_rate}% ({p1_wins}勝 {p2_wins}敗 {draws}分)")
                print(f"{'='*50}")

                # Firebaseに保存
                print("\nチャレンジデッキを登録しています...")
                try:
                    await save_challenge_to_firebase(
                        deck_name, player_name, challenge_faction, card_ids,
                        win_rate, p1_wins, p2_wins, draws, "west"
                    )
                    print("\n★ 登録完了！ポータルのチャレンジ一覧に追加されました！")
                except Exception as fe:
                    print(f"\n[エラー] Firebase登録に失敗しました: {fe}")
                    print("Firebase設定を確認してください。")

                await safe_input("Enterで戻ります...")
                js.window.location.href = "../index.html"
                return

            elif is_auto_training:
                num_val = await safe_input("対戦回数を入力 (例: 100, 1000): ")
                if not num_val.isdigit(): continue
                
                num_battles = int(num_val)
                p1_wins, p2_wins, draws = 0, 0, 0

                # 進捗表示をダッシュボードに出す
                def show_progress(i):
                    done = i + 1
                    total = num_battles
                    pct = int(done / total * 100)
                    bar = "█" * (pct // 5) + "░" * (20 - pct // 5)
                    de_rate = f"{p1_wins/done*100:.1f}%" if done > 0 else "-"
                    us_rate = f"{p2_wins/done*100:.1f}%" if done > 0 else "-"
                    msg = (
                        f"【AI自動学習中】\n\n"
                        f"  {done} / {total} 回  ({pct}%)\n"
                        f"  [{bar}]\n\n"
                        f"  ドイツ軍 : {p1_wins}勝  ({de_rate})\n"
                        f"  連合軍   : {p2_wins}勝  ({us_rate})\n"
                        f"  引き分け : {draws}\n"
                    )
                    try:
                        import js
                        d = js.document.getElementById("fixed-dashboard")
                        if d: d.innerText = msg
                    except: pass

                for i in range(num_battles):
                    game = Game(df=df, p1_faction="ドイツ軍", p2_faction="連合軍", p1_ai=True, p2_ai=True, quiet_mode=True, training_mode=True)
                    await game.setup_game()
                    await game.play()
                    
                    if game.winner == "Draw": draws += 1
                    elif game.winner == game.player1: p1_wins += 1
                    else: p2_wins += 1

                    # 10回ごとに画面更新＆ログ出力
                    if (i + 1) % 10 == 0 or i == num_battles - 1:
                        show_progress(i)
                        print(f"  {i+1}/{num_battles}回完了  ドイツ:{p1_wins}勝 連合:{p2_wins}勝 引分:{draws}")
                        await asyncio.sleep(0)  # 画面を更新させる

                print(f"\n【学習完了】ドイツ:{p1_wins}勝 / 連合:{p2_wins}勝 / 引分:{draws}")

                # エクスポートボタンを表示
                try:
                    import js
                    btn_html = """
                    <div style='margin-top:20px;'>
                    <button id='export-btn' style='background:#00ff00;color:#000;border:none;padding:12px 24px;font-size:16px;cursor:pointer;font-family:monospace;'>
                    ★ 学習データをHTMLに焼き込んでエクスポート
                    </button>
                    </div>
                    """
                    d = js.document.getElementById("fixed-dashboard")
                    if d: d.innerHTML = d.innerText.replace('\n','<br>') + btn_html

                    # ボタンのクリック処理
                    def do_export(event):
                        try:
                            de_key = "panzer_waffe_ai_Panzerwaffe_west_ge"
                            us_key = "panzer_waffe_ai_Panzerwaffe_west_us"
                            de_data = js.localStorage.getItem(de_key) or "{}"
                            us_data = js.localStorage.getItem(us_key) or "{}"
                            
                            # 現在のHTMLを取得してデータを埋め込む
                            script_inject = f"""
<script id="ai-preload-data">
(function(){{
  var de = {de_data};
  var us = {us_data};
  try {{ localStorage.setItem("{de_key}", JSON.stringify(de)); }} catch(e){{}}
  try {{ localStorage.setItem("{us_key}", JSON.stringify(us)); }} catch(e){{}}
}})();
</script>"""
                            html = js.document.documentElement.outerHTML
                            # 既存の埋め込みデータがあれば削除
                            import re as _re
                            html = _re.sub(r'<script id="ai-preload-data">.*?</script>', '', html, flags=_re.DOTALL)
                            html = html.replace('</head>', script_inject + '\n</head>', 1)
                            
                            # ダウンロード
                            blob = js.Blob.new([html], {"type": "text/html"})
                            url = js.URL.createObjectURL(blob)
                            a = js.document.createElement("a")
                            a.href = url
                            a.download = "panzer_waffe_trained.html"
                            js.document.body.appendChild(a)
                            a.click()
                            js.document.body.removeChild(a)
                            js.URL.revokeObjectURL(url)
                        except Exception as ex:
                            print(f"エクスポートエラー: {ex}")

                    from pyodide.ffi import create_proxy
                    btn = js.document.getElementById("export-btn")
                    if btn: btn.onclick = create_proxy(do_export)
                except Exception as ex:
                    print(f"ボタン表示エラー: {ex}")
            else:
                p1_ai, p2_ai = False, False
                if is_test_ai:
                    p1_faction, p2_faction, p1_ai, p2_ai = "ドイツ軍", "連合軍", True, True
                else:
                    choice = await safe_input("陣営選択 (1: ドイツ / 2: 連合): ")
                    if choice == '1': p1_faction, p2_faction, p2_ai = "ドイツ軍", "連合軍", True
                    else: p1_faction, p2_faction, p1_ai = "連合軍", "ドイツ軍", True
                game = Game(df=df, p1_faction=p1_faction, p2_faction=p2_faction, p1_ai=p1_ai, p2_ai=p2_ai)
                await game.setup_game(); await game.play()

            # 対戦終了後、Enterを押すとリロードしてトップに戻る
            print("\n" + "!"*50)
            print("【全工程が終了】戦線選択（トップ）に戻ります。")
            print("!"*50)
            await safe_input("Enterを押すとリロードして最初に戻ります...")
            js.window.location.href = "../index.html"
            return

        except Exception as e:
            print(f"\n【通知】システムをリセットします: {e}")
            await asyncio.sleep(2)
            js.window.location.href = "../index.html"
            return

def main():
    import js
    js.window._game_task = asyncio.create_task(async_main())

if __name__ == "__main__":
    main()