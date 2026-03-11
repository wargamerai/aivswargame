import pandas as pd
import random
import time
import os
import sys
import traceback
import asyncio

from ai_system import AI_Brain
try:
    from game_effects import GameEffects
except ImportError:
    pass

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
            # 最新の出力は黄色にする
            new_line.style.color = "#ffff88" 
            # 識別用の目印(クラス)をつける
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
            if not inp:
                print("[システム] エラー：入力欄(user-input)が見つかりません。")
                return
                
            val = inp.value
            inp.value = "" 
            
            # ★追加：色の段階的な変更処理（入力確定時に実行）
            try:
                output_area = js.document.getElementById("output-area")
                if output_area:
                    # 1. すでに赤(log-old)のものを白(通常)にする
                    old_nodes = list(output_area.getElementsByClassName("log-old"))
                    for node in old_nodes:
                        node.style.color = ""
                        node.classList.remove("log-old")
                    
                    # 2. 現在黄色(log-new)のものを赤(log-old)にする
                    new_nodes = list(output_area.getElementsByClassName("log-new"))
                    for node in new_nodes:
                        node.style.color = "#ff8888"  # 見やすい赤色
                        node.classList.remove("log-new")
                        node.classList.add("log-old")
            except Exception:
                pass
            
            future.set_result(val)
        except Exception as e:
            print(f"[システム] 入力処理中にエラーが発生しました: {e}")

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
        else:
            self.short_name = self.name
            
        if pd.notna(row['Attack']) and str(row['Attack']).strip() != '':
            self.attack = str(int(float(row['Attack'])))
        else: self.attack = "0"
        if pd.notna(row['Defense']) and str(row['Defense']).strip() != '':
            self.defense = str(row['Defense'])
        else: self.defense = "0"
        if pd.notna(row['Cost']) and str(row['Cost']).strip() != '':
            self.cost = int(float(row['Cost']))
        else: self.cost = 0
            
        self.traits = []
        for col in ['Trait_Fixed', 'Trait1', 'Trait2', 'Trait3', 'Trait4', 'Trait5', 'Trait6']:
            if col in row and pd.notna(row[col]) and str(row[col]).strip():
                self.traits.append(str(row[col]).strip())
                
        self.is_face_up = True 
        self.owner = None # ★追加：地形カードなどの持ち主を記憶するため

class Player:
    def __init__(self, faction_name, is_ai=False):
        self.faction = faction_name
        self.is_ai = is_ai 
        
        # ▼ アフリカ戦線用のセーブファイル名を直接指定する
        if faction_name == "ドイツ軍":
            file_id = "Panzerwaffe_africa_ge"
        else:
            file_id = "Panzerwaffe_africa_uk"
            
        # ▼ 上で決めた英語のファイル名で読み込む
        self.brain = AI_Brain(file_id) if is_ai else None 
        
        self.headquarters = [] 
        self.hand = []
        self.discard_pile = []
        self.platoons = {'A': [], 'B': [], 'C': []} 
        self.advanced = {'A': False, 'B': False, 'C': False} 
        self.attachments = {'A': [], 'B': [], 'C': []} 
        self.active_events = []

class Game:
    def __init__(self, df, p1_f, p2_f, campaign_prefix, p1_ai=False, p2_ai=False, quiet=False, training=False):
        self.df = df
        self.quiet = quiet
        self.training_mode = training
        self.game_over = False
        self.winner = None
        # Playerに渡す引数を2つ（陣営名, AIフラグ）に整理
        self.player1 = Player(p1_f, is_ai=p1_ai or training)
        self.player2 = Player(p2_f, is_ai=p2_ai or training)
        self.current_player = self.player1
        self.enemy_player = self.player2
        self.terrains = {'A': None, 'B': None, 'C': None}
        self.terrain_progress = {'A': 0, 'B': 0, 'C': 0}

    def print_q(self, text):
        if not self.quiet: print(text)

    async def safe_input_method(self, prompt_text=""):
        return await safe_input(prompt_text)

    # ==========================================
    # 1. デッキ構築フェーズ
    # ==========================================
    async def build_deck(self, player):
        pool = [Card(row) for _, row in self.df.iterrows() if row['Faction'] == player.faction or row['Faction'] == player.faction.replace("軍", "")]
        player.headquarters = []
        
        if not pool:
            self.print_q(f"[警告] CSVデータ内に『{player.faction}』のカードが1枚も見つかりません！")
            return
            
        events_accidents = [c for c in pool if c.type in ['イベント', 'アクシデント']]
        available_pool = [c for c in pool if c.type not in ['イベント', 'アクシデント']]

        if player.is_ai or self.training_mode:
            # 陣営ごとの簡易テーマ（方針）設定
            if player.faction == "ドイツ軍":
                themes = ["戦車メイン", "罠メイン"]
            else:
                themes = ["物量メイン", "陣地メイン"]

            chosen_theme = random.choice(themes)
            if player.brain:
                state_str = "DeckBuild_Africa"
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

            if not self.quiet:
                self.print_q(f"【AI構築】AIは過去の経験から『{chosen_theme}』方針をベースにデッキを編成します！")

            card_scores = []
            deck_names_so_far = []
            for c in available_pool:
                score = random.randint(1, 15) # ランダムな揺らぎ（アレンジ要素）
                if player.brain:
                    score += player.brain.get_card_score(c.name, deck_names_so_far)
                if chosen_theme == "戦車メイン":
                    if c.type == '戦車': score += 50
                    elif "イタリア軍" in c.name or "伊戦車" in c.name: score += 30
                elif chosen_theme == "罠メイン":
                    if "8.8cm" in c.name or "高射砲" in c.name or "欺瞞" in c.name or "ダミー" in c.name: score += 80
                    elif c.type == '戦車' and c.cost <= 3: score += 30
                elif chosen_theme == "物量メイン":
                    if c.type == '戦車' and c.cost <= 3: score += 50
                    elif "圧倒的物量" in c.name or "物量" in c.name or "迂回戦術" in c.name: score += 40
                elif chosen_theme == "陣地メイン":
                    if c.type == '地形' or "陣地" in c.name: score += 80
                    elif c.type == '戦車' and c.cost >= 4: score += 40
                
                card_scores.append((score, c))
            
            card_scores.sort(key=lambda x: x[0], reverse=True)
            deck = []
            total_cost = 0
            for s, c in card_scores:
                if total_cost + c.cost <= 30:
                    deck.append(c)
                    total_cost += c.cost
            
            deck.extend(events_accidents)
            player.headquarters = deck
            return

        deck = []
        total_cost = 0
        current_available_pool = available_pool.copy()

        while True:
            in_deck_cards = {}
            for c in deck:
                key = (c.name, c.type, c.cost, c.attack, c.defense)
                in_deck_cards[key] = in_deck_cards.get(key, 0) + 1

            board_str = f"=== 【{player.faction}】 現在の配備リスト ===\n"
            board_str += f"合計コスト: {total_cost} / 30\n\n"

            deck_display_list = []
            if not in_deck_cards:
                board_str += "  なし\n"
            else:
                d_idx = 1
                for key, count in in_deck_cards.items():
                    name, ctype, cost, atk, def_val = key
                    board_str += f"  -{d_idx}: [{ctype}] {name} (コスト:{cost}) × {count}枚\n"
                    deck_display_list.append(key)
                    d_idx += 1
            
            board_str += f"\n※[強制追加予定] イベント・アクシデントカード: {len(events_accidents)}枚\n"

            try:
                import js
                dashboard = js.document.getElementById("fixed-dashboard")
                if dashboard: dashboard.innerText = board_str
            except: pass

            self.print_q(f"\n=== {player.faction} デッキ編成 ===")
            self.print_q(f"現在の合計コスト: {total_cost} / 30")
            
            available_cards = {}
            for c in current_available_pool:
                key = (c.name, c.type, c.cost, c.attack, c.defense)
                if key not in available_cards: available_cards[key] = []
                available_cards[key].append(c)

            self.print_q("\n[配備可能な部隊・戦術一覧]")
            display_list = []
            idx = 1
            for key, cards in available_cards.items():
                name, ctype, cost, atk, def_val = key
                count = len(cards)
                display_list.append((key, cards))
                self.print_q(f"  {idx}: [{ctype}] {name} (攻:{atk} 防:{def_val} / コスト:{cost}) - 残り{count}枚")
                idx += 1

            self.print_q("-" * 50)
            self.print_q("番号: 配備する / -番号: 配備を外す (例: -1) / 99: 編成完了")
            val = await self.safe_input_method("入力: ")
            choice = val.strip()

            if choice == '99':
                if len(deck) > 0:
                    self.print_q(f"\n現在の {len(deck)} 枚（合計コスト: {total_cost}）でデッキ編成を完了します。")
                    break
                else:
                    self.print_q("\n【！】最低でも1枚は部隊を編成してください。")
                    continue

            is_remove = choice.startswith('-')
            choice_numStr = choice[1:] if is_remove else choice

            if choice_numStr.isdigit():
                parsed_idx = int(choice_numStr) - 1
                if is_remove:
                    if 0 <= parsed_idx < len(deck_display_list):
                        key_to_remove = deck_display_list[parsed_idx]
                        name, ctype, cost, atk, def_val = key_to_remove
                        target_card = next((c for c in deck if c.name == name and c.type == ctype), None)
                        if target_card:
                            deck.remove(target_card)
                            current_available_pool.append(target_card)
                            total_cost -= cost
                            self.print_q(f"\n『{name}』を配備リストから外しました。")
                    else:
                        self.print_q("\n[!] 無効な番号です。上画面のリストにある番号をマイナス付きで指定してください。")
                else:
                    if 0 <= parsed_idx < len(display_list):
                        key, cards = display_list[parsed_idx]
                        name, ctype, cost, atk, def_val = key
                        if total_cost + cost > 30:
                            self.print_q(f"\n[!] コストオーバーです！（現在 {total_cost} + 追加 {cost} > 30）")
                        else:
                            card_to_add = cards[0]
                            deck.append(card_to_add)
                            current_available_pool.remove(card_to_add)
                            total_cost += cost
                            self.print_q(f"\n-> 『{name}』を配備しました！")
                    else:
                        self.print_q("\n[!] 無効な番号です。一覧にある数字を入力してください。")
            else:
                self.print_q("\n[!] 入力が正しくありません。")

        deck.extend(events_accidents)
        player.headquarters = deck
        self.print_q(f"=== {player.faction} デッキ構築完了 ===")

    # ==========================================
    # 2. 初期配置フェイズ
    # ==========================================
    async def setup_initial_board(self, player):
        if player.is_ai:
            await player.brain.load_data()

        tanks = [c for c in player.headquarters if c.type == '戦車']
        if player.is_ai or self.training_mode:
            random.shuffle(tanks)
            for i in range(3):
                if tanks:
                    tank = tanks.pop(0)
                    tank.is_face_up = False 
                    player.headquarters.remove(tank)
                    platoon_name = ['A', 'B', 'C'][i]
                    player.platoons[platoon_name].append(tank)
        else:
            self.print_q("\n" + "="*50)
            self.print_q(f"【初期配置フェイズ：{player.faction}】")
            self.print_q("各列に配置する戦車をデッキから1枚ずつ選んでください。（裏向きで配置されます）")
            for p in ['A', 'B', 'C']:
                while True:
                    available_tanks = [c for c in player.headquarters if c.type == '戦車']
                    if not available_tanks: break
                    self.print_q(f"\n[列 {p} に配置する戦車を選択]")
                    for idx, t in enumerate(available_tanks):
                        self.print_q(f"  {idx + 1}: {t.name} (攻{t.attack}/防{t.defense})")
                    choice = await self.safe_input_method(f"列{p}に配置する番号を入力: ")
                    if choice.isdigit():
                        idx = int(choice) - 1
                        if 0 <= idx < len(available_tanks):
                            selected_tank = available_tanks[idx]
                            selected_tank.is_face_up = False
                            player.platoons[p].append(selected_tank)
                            player.headquarters.remove(selected_tank)
                            self.print_q(f"列{p}に {selected_tank.name} を配置しました。")
                            break
                        else: self.print_q("無効な番号です。")
                    else: self.print_q("数字を入力してください。")

        random.shuffle(player.headquarters)
        for _ in range(4):
            if player.headquarters:
                player.hand.append(player.headquarters.pop(0))

    # ==========================================
    # 3. 戦闘進行フェイズ
    # ==========================================
    def damage_hq(self, target_player, amount):
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
                self.game_over = True
                self.winner = self.current_player
                return

    def format_card(self, card, is_enemy, html=False):
        # ★ 敵の裏向きは「????」のみにする
        if not card.is_face_up and is_enemy: 
            text = "????"
        else:
            # ★ 「表」「裏」の文字を完全に消してスッキリさせる
            if card.type == '戦車' and "欺瞞" not in card.name and "ダミー" not in card.name: 
                text = f"{card.short_name}({card.attack}/{card.defense})"
            else:
                text = f"{card.short_name}"
                
        # ★ 裏向きのカードは白文字タグで囲む
        if html and not card.is_face_up:
            return f"<span style='color: white;'>{text}</span>"
        return text

    def show_battlefield(self):
        if self.quiet or self.training_mode: return
        
        top_player = self.player2
        bottom_player = self.player1
        
        board_str = ""
        board_str += "=================== 戦場 ===================\n"
        board_str += f"【{top_player.faction}】 (司令部残り: {len(top_player.headquarters)}枚 / 捨て札: {len(top_player.discard_pile)}枚 / 手札: {len(top_player.hand)}枚)\n"
        if top_player.active_events:
            event_names = ", ".join([e.name for e in top_player.active_events])
            # ★ 発動中イベントを赤文字にする
            board_str += f"  <span style='color: #ff6666;'>[発動中イベント]: {event_names}</span>\n"
            
        for platoon in ['A', 'B', 'C']:
            status = " [進入済!]" if top_player.advanced[platoon] else ""
            if top_player.attachments[platoon]:
                att_names = [c.name for c in top_player.attachments[platoon]]
                if any("伊戦車" in n or "イタリア軍戦車隊" in n for n in att_names):
                    status += " (装備:伊戦車)"
                else:
                    status += f" (装備:{', '.join(att_names)})"
                    
            cards = ", ".join([self.format_card(c, is_enemy=top_player.is_ai, html=True) for c in top_player.platoons[platoon]])
            if not cards: cards = "(空)"
            
            if self.terrains[platoon] and ("陣地" in self.terrains[platoon].name or "ボックス陣地" in self.terrains[platoon].name) and not top_player.advanced[platoon]:
                if hasattr(self.terrains[platoon], 'owner') and self.terrains[platoon].owner == top_player:
                    cards += "(射撃不可)"
                
            board_str += f"  列 {platoon}{status}: {cards}\n"
            
        board_str += "----------------- VS -----------------\n"
        for col in ['A', 'B', 'C']:
            top_stars = "★" * len(top_player.platoons[col])
            bottom_stars = "★" * len(bottom_player.platoons[col])
            
            terrain_name = "平地"
            if self.terrains[col]:
                terrain_name = self.terrains[col].name
                if "陣地" in terrain_name or "ボックス陣地" in terrain_name:
                    if hasattr(self.terrains[col], 'owner'):
                        if self.terrains[col].owner == top_player and not top_player.advanced[col]: 
                            top_stars += " +2"
                        if self.terrains[col].owner == bottom_player and not bottom_player.advanced[col]: 
                            bottom_stars += " +2"

            if any("伊戦車" in c.name or "イタリア軍戦車隊" in c.name for c in top_player.attachments[col]):
                top_stars += "/+1" if "+2" in top_stars else " +2/+1"
            if any("伊戦車" in c.name or "イタリア軍戦車隊" in c.name for c in bottom_player.attachments[col]):
                bottom_stars += "/+1" if "+2" in bottom_stars else " +2/+1"
                    
            board_str += f"  (列 {col}) 敵:{top_stars:<13} | {terrain_name:<9} | 自:{bottom_stars:<13}\n"
        board_str += "--------------------------------------\n"
        
        for platoon in ['A', 'B', 'C']:
            status = " [進入済!]" if bottom_player.advanced[platoon] else ""
            if bottom_player.attachments[platoon]:
                att_names = [c.name for c in bottom_player.attachments[platoon]]
                if any("伊戦車" in n or "イタリア軍戦車隊" in n for n in att_names):
                    status += " (装備:伊戦車)"
                else:
                    status += f" (装備:{', '.join(att_names)})"
                    
            cards = ", ".join([self.format_card(c, is_enemy=bottom_player.is_ai, html=True) for c in bottom_player.platoons[platoon]])
            if not cards: cards = "(空)"
            
            if self.terrains[platoon] and ("陣地" in self.terrains[platoon].name or "ボックス陣地" in self.terrains[platoon].name) and not bottom_player.advanced[platoon]:
                if hasattr(self.terrains[platoon], 'owner') and self.terrains[platoon].owner == bottom_player:
                    cards += "(射撃不可)"
                
            board_str += f"  列 {platoon}{status}: {cards}\n"
            
        if bottom_player.active_events:
            event_names = ", ".join([e.name for e in bottom_player.active_events])
            # ★ 発動中イベントを赤文字にする
            board_str += f"  <span style='color: #ff6666;'>[発動中イベント]: {event_names}</span>\n"
            
        board_str += f"【{bottom_player.faction}】 (司令部残り: {len(bottom_player.headquarters)}枚 / 捨て札: {len(bottom_player.discard_pile)}枚)\n"
        board_str += "============================================\n"
        
        if not bottom_player.is_ai:
            def get_east_asian_width_count(text):
                import unicodedata
                count = 0
                for c in text:
                    if unicodedata.east_asian_width(c) in 'FWA': count += 2
                    else: count += 1
                return count

            board_str += "【あなたの手札】:\n"
            hand_len = len(bottom_player.hand)
            
            if hand_len == 0:
                board_str += "  なし\n"
            else:
                for i in range(0, hand_len, 2):
                    c1 = bottom_player.hand[i]
                    s1 = f"  {i+1}: [{c1.type}] {c1.name}"
                    if c1.type == '戦車':
                        s1 += f"({c1.attack}/{c1.defense})"
                        
                    if i + 1 < hand_len:
                        c2 = bottom_player.hand[i+1]
                        s2 = f"{i+2}: [{c2.type}] {c2.name}"
                        if c2.type == '戦車':
                            s2 += f"({c2.attack}/{c2.defense})"
                            
                        visual_len = get_east_asian_width_count(s1)
                        pad = max(2, 25 - visual_len)
                        line_str = f"{s1}" + (" " * pad) + f"{s2}\n"
                    else:
                        line_str = f"{s1}\n"
                        
                    board_str += line_str

        try:
            import js
            dashboard = js.document.getElementById("fixed-dashboard")
            if dashboard:
                # ★ タグをブラウザに解釈させるため innerHTML で出力
                dashboard.innerHTML = f"<div style='white-space: pre-wrap; font-family: inherit;'>{board_str}</div>"
        except: pass

    # （緊急配備ルールは残す方針）
    async def check_and_emergency_deploy(self, player, col):
        if not player.platoons[col]:
            tanks_in_hand = [c for c in player.hand if c.type == '戦車']
            if tanks_in_hand:
                if player.is_ai:
                    import random
                    if random.random() < 0.8: 
                        c = random.choice(tanks_in_hand)
                        c.is_face_up = False
                        player.platoons[col].append(c)
                        player.hand.remove(c)
                        self.print_q(f"【緊急配備】AIは空になった列{col}に手札から戦車を補充しました！")
                else:
                    self.print_q(f"\n【緊急補充のチャンス】列{col}が空になりました！")
                    ans = await self.safe_input_method("手札から戦車を直ちに補充しますか？ (1: はい / 99: いいえ): ")
                    if ans == '1':
                        while True:
                            current_tanks = [c for c in player.hand if c.type == '戦車']
                            if not current_tanks: break
                            self.print_q(f"\n[列{col}に補充する戦車を選択]")
                            for i, c in enumerate(current_tanks):
                                self.print_q(f"  {i+1}: {c.name} (攻{c.attack}/防{c.defense})")
                            val = await self.safe_input_method("補充する戦車の番号を入力 (99: やめる): ")
                            if val == '99': break
                            if val.isdigit() and 1 <= int(val) <= len(current_tanks):
                                card = current_tanks[int(val)-1]
                                card.is_face_up = False
                                player.platoons[col].append(card)
                                player.hand.remove(card)
                                self.print_q(f"【緊急配備】列{col}に {card.name} を裏向きで補充しました！")
                                break
                            else:
                                self.print_q("無効な番号です。")


    async def play(self):
        turn_count = 0
        while not self.game_over and turn_count < 80:
            turn_count += 1
            self.print_q(f"\n\n↓↓↓↓↓ 【{self.current_player.faction}】のターンです ↓↓↓↓↓")
            
            if self.current_player.is_ai:
                await self.ai_take_turn() 
            else:
                await self.take_turn()    
                
            if self.game_over: break
            
            while len(self.current_player.hand) < 4 and len(self.current_player.headquarters) > 0:
                drawn = self.current_player.headquarters.pop(0)
                
                if drawn.type == 'アクシデント':
                    self.print_q(f"\n【アクシデント発生！】『{drawn.name}』が発生！")
                    for p_target in [self.current_player, self.enemy_player]:
                        while p_target.active_events:
                            old_ev = p_target.active_events.pop(0)
                            self.print_q(f"  -> 古いイベント/アクシデント『{old_ev.name}』は押し出され、ゲームから完全に除外されました。")
                    
                    self.current_player.active_events.append(drawn)
                else:
                    self.current_player.hand.append(drawn)
                    self.print_q(f"補給：【{self.current_player.faction}】はカードをドローしました。")
            
            if self.game_over: break
                
            self.print_q("--------------------------------------------")
            self.print_q(f"【{self.current_player.faction}】のターン終了。プレイヤー交代。")
            
            if not self.training_mode:
                await safe_input("\n【ターンの結果を確認したら Enter キーを押して次へ...】")
            
            temp = self.current_player
            self.current_player = self.enemy_player
            self.enemy_player = temp

        if turn_count >= 150:
            self.winner = "Draw"
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

    async def take_turn(self):
        GameEffects.check_auto_play_debuffs(self.current_player, self)
        attack_count = 0
        
        while True:
            if self.game_over: return True
            self.show_battlefield()
            
            is_fox_active = any(e.name in ["砂漠の狐", "ロンメル"] for e in self.current_player.active_events)
            
            if attack_count == 1 and is_fox_active:
                self.print_q("\n【砂漠の狐 効果中！】敵部隊への追加射撃が《1回だけ》可能です。（合計2回）")
                self.print_q("1: 敵部隊を攻撃する")
                self.print_q("99: 追加攻撃せずにターンを終了する")
                choice = await self.safe_input_method(f"[{self.current_player.faction}] 番号を入力してください: ")
                choice = choice.strip()
                
                success = False
                if choice == '99': return True
                elif choice == '1': success = await self.action_attack(self.current_player, self.enemy_player)
                else:
                    self.print_q("正しい番号が入力されませんでした。")
                    continue
                    
                if success:
                    if not self.training_mode:
                        await self.safe_input_method("\n【攻撃の結果を確認したら Enter を押してください...】")
                    return True
                continue

            self.print_q("\n行動を選択してください:")
            self.print_q("1: 敵部隊を攻撃")
            self.print_q("2: 移動 (敵陣地への進入、または地形の除去)")
            self.print_q("3: 司令部(デッキ)を攻撃")
            self.print_q("4: 戦術カード(地形・アクション・イベント)を使用する")
            self.print_q("5: 戦車カードを列に追加")
            self.print_q("6: 手札を1枚デッキの下に戻し、1枚引く")
            self.print_q("99: 終了する（引き分けにしてゲームを終える）")
            
            choice = await self.safe_input_method(f"[{self.current_player.faction}] 番号を入力してください: ")
            choice = choice.strip()

            success = False
            valid_choice = True
            if choice == '99':
                self.print_q(f"\n【投了】あなたは投了（引き分け）を選択しました。ゲーム終了です。")
                self.game_over = True
                self.winner = "Draw"
                return True
            elif choice == '1': success = await self.action_attack(self.current_player, self.enemy_player)
            elif choice == '2': success = await self.action_move(self.current_player, self.enemy_player)
            elif choice == '3': success = await self.action_attack_hq(self.current_player, self.enemy_player)
            elif choice == '4': success = await self.action_play_tactical_card(self.current_player, self.enemy_player)
            elif choice == '5': success = await self.action_add_tank(self.current_player, self.enemy_player)
            elif choice == '6': success = await self.action_swap_card(self.current_player)
            else:
                valid_choice = False
                self.print_q("正しい番号が入力されませんでした。")
                continue

            if success and self.enemy_player.brain:
                action_map = {'1':'attack','2':'move','3':'attack_hq','4':'play_tactical','5':'add_tank','6':'swap'}
                self.enemy_player.brain.record_player_action(action_map.get(choice, choice))

            if not success:
                continue
            
            if success:
                if choice in ['1', '3'] and not self.training_mode:
                    await self.safe_input_method("\n【攻撃の結果を確認したら Enter を押してください...】")

                if choice in ['1', '3'] and is_fox_active and attack_count == 0:
                    attack_count += 1
                    self.print_q("\n【砂漠の狐】連続攻撃のチャンスです！")
                    continue
                return True

    async def action_attack_hq(self, attacker, defender):
        if any("慢性的補給不足" in e.name for e in attacker.active_events):
            self.print_q("【慢性的補給不足】現在、射撃ができないため司令部への攻撃もできません！")
            return False

        self.print_q("\n司令部を攻撃する部隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
        val_input = await self.safe_input_method("番号を入力: ")
        if val_input == '1': p = 'A'
        elif val_input == '2': p = 'B'
        elif val_input == '3': p = 'C'
        elif val_input == '99': return False
        else: return False
        
        if p not in attacker.platoons or not attacker.platoons[p]:
            self.print_q("\n【！】無効な選択、またはその列に戦車がいません。")
            return False
            
        real_tanks = [c for c in attacker.platoons[p] if c.type == '戦車' and "欺瞞" not in c.name and "ダミー" not in c.name]
        if not real_tanks:
            self.print_q("\n【！】本物の戦車が存在しないため、攻撃・射撃指示は出せません！")
            return False

        has_long_range = any('長射程' in t for tank in attacker.platoons[p] for t in tank.traits)

        if attacker.advanced.get(p, False):
            self.print_q(f"\n列{p}が敵陣地から司令部を直接攻撃！")
            self.damage_hq(defender, 2)
            return True
        elif has_long_range and not defender.platoons[p] and not self.terrains[p]:
            self.print_q(f"\n【長射程攻撃】列{p}の『長射程』を活かし、敵司令部を直接攻撃します！")
            self.damage_hq(defender, 1)
            return True
        else:
            self.print_q("\n【！】進入していないか、長射程攻撃の条件を満たしていません！")
            return False

    async def action_attack(self, attacker, defender):
        if any(e.name == "慢性的補給不足" for e in attacker.active_events):
            self.print_q("【慢性的補給不足】現在、射撃を行うことができません！")
            return False
            
        self.print_q("\n攻撃を指示する部隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
        val_input = await self.safe_input_method("番号を入力: ")
        if val_input == '1': p = 'A'
        elif val_input == '2': p = 'B'
        elif val_input == '3': p = 'C'
        elif val_input == '99': return False
        else: return False
        
        if p not in attacker.platoons or not attacker.platoons[p]:
            self.print_q("\n【！】無効な選択、またはその列に戦車がいません。")
            return False
            
        real_tanks = [c for c in attacker.platoons[p] if c.type == '戦車' and "欺瞞" not in c.name and "ダミー" not in c.name]
        if not real_tanks:
            self.print_q("\n【！】本物の戦車が存在しないため、攻撃指示は出せません！")
            return False

        # ★攻撃側は全員オープンになる
        for card in attacker.platoons[p]:
            card.is_face_up = True
            
        atk_dummies = [c for c in attacker.platoons[p] if "欺瞞" in c.name or "ダミー" in c.name or "8.8cm" in c.name or "高射砲" in c.name]
        for d in atk_dummies:
            self.print_q(f"【罠消滅】攻撃指示を受けた『{d.name}』は正体を現し、直ちに廃棄されました！")
            attacker.platoons[p].remove(d)
            attacker.discard_pile.append(d)

        # 陣地の効果判定（自分が配置した陣地にいる場合のみ射撃不可）
        if self.terrains[p] and ("陣地" in self.terrains[p].name or "ボックス陣地" in self.terrains[p].name):
            if hasattr(self.terrains[p], 'owner') and self.terrains[p].owner == attacker:
                self.print_q("\n【！】ボックス陣地に配置されている部隊は、陣地にこもっているため射撃ができません！")
                return False

        has_turret = not any('固定砲塔' in t for tank in attacker.platoons[p] for t in tank.traits)
        target_p = p

        if attacker.advanced[p]:
            valid_targets = [col for col in ['A', 'B', 'C'] if col != p and defender.platoons[col] and not defender.advanced[col]]
            if not valid_targets:
                self.print_q("\n【！】進入済みの列の正面には敵がおらず、他に攻撃可能な敵陣の部隊もいないため攻撃できません！")
                return False
            if len(valid_targets) == 1:
                target_p = valid_targets[0]
            else:
                self.print_q(f"\n攻撃対象を選択してください (可能な列: {', '.join(valid_targets)} | 1: A / 2: B / 3: C / 99: 戻る)")
                val_input = await self.safe_input_method("番号を入力: ")
                if val_input == '1': target_val = 'A'
                elif val_input == '2': target_val = 'B'
                elif val_input == '3': target_val = 'C'
                else: return False
                
                if target_val not in valid_targets: return False
                target_p = target_val
        else:
            if has_turret:
                valid_targets = []
                if defender.platoons[p]: valid_targets.append(p)
                for col in ['A', 'B', 'C']:
                    if col != p and defender.platoons[col] and defender.advanced[col]:
                        valid_targets.append(col)
                        
                if len(valid_targets) == 0:
                    target_p = p
                elif len(valid_targets) == 1:
                    target_p = valid_targets[0]
                else:
                    self.print_q(f"\n攻撃対象を選択してください (可能な列: {', '.join(valid_targets)} | 1: A / 2: B / 3: C / 99: 戻る)")
                    val_input = await self.safe_input_method("番号を入力: ")
                    if val_input == '1': target_val = 'A'
                    elif val_input == '2': target_val = 'B'
                    elif val_input == '3': target_val = 'C'
                    else: return False
                    
                    if target_val not in valid_targets: return False
                    target_p = target_val

        if not defender.platoons[target_p]:
            self.print_q("\n【！】指定した列に敵戦車がいません！")
            return False

        return await self.execute_attack(attacker, defender, p, target_p)

    async def execute_attack(self, attacker, defender, atk_p, def_p):
        # 攻撃側は全員表になる
        for card in attacker.platoons[atk_p]: card.is_face_up = True
        
        # ★修正：防御側は「先頭の戦車だけ」が表になる
        if defender.platoons[def_p]:
            defender.platoons[def_p][0].is_face_up = True
        
        # 攻撃側の罠消滅
        atk_dummies = [c for c in attacker.platoons[atk_p] if "欺瞞" in c.name or "ダミー" in c.name or "8.8cm" in c.name or "高射砲" in c.name]
        for d in atk_dummies:
            self.print_q(f"【罠消滅】攻撃側の『{d.name}』は正体を現し、直ちに廃棄されました！")
            attacker.platoons[atk_p].remove(d)
            attacker.discard_pile.append(d)
        
        # ★修正：防御側のダミー消滅（表になった先頭のダミーのみ消える）
        dummies = [c for c in defender.platoons[def_p] if ("欺瞞" in c.name or "ダミー" in c.name) and c.is_face_up]
        for d in dummies:
            self.print_q(f"【ダミー消滅】防御側の『{d.name}』は正体を現し、直ちに廃棄されました！")
            defender.platoons[def_p].remove(d)
            defender.discard_pile.append(d)
            
        if not defender.platoons[def_p]:
            defender.advanced[def_p] = False
            self.print_q(f"\n【交戦結果】敵の列{def_p}はダミーのみでもぬけの殻でした！攻撃対象が存在しません。")
            if self.terrains[def_p] and ("陣地" in self.terrains[def_p].name or "ボックス陣地" in self.terrains[def_p].name):
                self.print_q("【ボックス陣地】守備隊がいなくなったため、陣地も破棄（捨て札）されます！")
                removed_fort = self.terrains[def_p]
                self.terrains[def_p] = None
                defender.discard_pile.append(removed_fort)
            await self.check_and_emergency_deploy(defender, def_p)
            return True

        target = defender.platoons[def_p][0]
        
        atk_names = ", ".join([f"{c.name}(攻{c.attack})" for c in attacker.platoons[atk_p] if c.type == '戦車' and "欺瞞" not in c.name and "ダミー" not in c.name])
        self.print_q(f"\n【交戦開始！】 {attacker.faction}の列{atk_p} [表: {atk_names}] が、{defender.faction}の列{def_p} [表: {target.name}(防{target.defense})] を攻撃！")
        
        # 先頭が高射砲だった場合の罠発動処理
        if "8.8cm" in target.name or "高射砲" in target.name:
            self.print_q(f"【罠発動！】{target.name} が待ち構えていた！")
            barrage_cards = [c for c in attacker.hand if "弾幕射撃" in c.name]
            if barrage_cards:
                self.print_q("【弾幕射撃】アクションを使用！8.8cm高射砲を迎撃します！")
                attacker.hand.remove(barrage_cards[0])
                attacker.discard_pile.append(barrage_cards[0])
                if any("遅延" in e.name for e in attacker.active_events + defender.active_events):
                    self.print_q("【レンドリースの遅延】弾幕射撃の威力が半減！8.8cm高射砲の攻撃力が半減(4)になります！")
                    trap_dmg = 4
                else:
                    self.print_q("【弾幕射撃】8.8cm高射砲の攻撃を完全無効化しました！")
                    trap_dmg = 0
            else:
                trap_dmg = 8
            
            if trap_dmg > 0:
                current_dmg = 0
                while current_dmg < trap_dmg and attacker.platoons[atk_p]:
                    sac = attacker.platoons[atk_p].pop(0)
                    def_str = str(sac.defense).split('-')[0]
                    current_dmg += int(def_str) if def_str.isdigit() else 0
                    attacker.discard_pile.append(sac)
                    self.print_q(f"8.8cm高射砲の直撃: {sac.name} を撃破！")
            
            defender.platoons[def_p].pop(0)
            defender.discard_pile.append(target)
            
            if not attacker.platoons[atk_p]:
                attacker.advanced[atk_p] = False
                await self.check_and_emergency_deploy(attacker, atk_p)
            await self.check_and_emergency_deploy(defender, def_p)
            return True
            
        is_melee = attacker.advanced[atk_p] or defender.advanced[def_p]
        base_atk = 0
        
        attacking_tanks = [c for c in attacker.platoons[atk_p] if c.type == '戦車' and "欺瞞" not in c.name and "ダミー" not in c.name]
        
        if not attacking_tanks:
            self.print_q("【攻撃失敗】この部隊には本物の戦車がいません！（手番を消費します）")
            return True
            
        if is_melee:
            valid_atks = [int(c.attack) for c in attacking_tanks if '固定砲塔' not in c.traits]
            if valid_atks: base_atk = max(valid_atks)
            self.print_q(f"【乱戦ペナルティ】固定砲塔は最大攻撃力として使用できません。ベース攻撃力: {base_atk}")
        else:
            base_atk = max([int(c.attack) for c in attacking_tanks])

        atk_val = base_atk + (len(attacking_tanks) - 1)
        
        if any("伊戦車" in c.name or "イタリア軍戦車隊" in c.name for c in attacker.attachments.get(atk_p, [])):
            atk_val += 2
            self.print_q("【イタリア軍戦車隊】攻撃力+2！")
            
        bersaglieri_cards = [c for c in attacker.hand if "ベルザリエーリ" in c.name]
        if bersaglieri_cards:
            target_card = bersaglieri_cards[0]
            if attacker.is_ai:
                use_b = '1'
            else:
                use_b = await self.safe_input_method("手札に【ベルザリエーリ】があります。使用して攻撃力を上げますか？ (1: はい / 99: いいえ): ")
                
            if use_b == '1' and target_card in attacker.hand:
                self.print_q("【ベルザリエーリ】手札から使用！攻撃力+1！")
                atk_val += 1
                if len(defender.platoons[def_p]) >= 5:
                    self.print_q("【ベルザリエーリ】敵部隊が5両以上のため、さらに攻撃力+1！")
                    atk_val += 1
                attacker.hand.remove(target_card)
                attacker.discard_pile.append(target_card)
            
        is_flank_attack = (atk_p != def_p)
        def_val_str = str(target.defense).split('-')
        if (is_flank_attack or is_melee) and len(def_val_str) > 1:
            def_val = int(def_val_str[1])
            self.print_q(f"【側面/接近戦】防御力は弱い方({def_val})が適用されます！")
        else:
            def_val = int(def_val_str[0])
            
        # ★防御力アップも、陣地の持ち主のみに適用
        if self.terrains[def_p] and ("陣地" in self.terrains[def_p].name or "ボックス陣地" in self.terrains[def_p].name) and not defender.advanced[def_p]:
            if hasattr(self.terrains[def_p], 'owner') and self.terrains[def_p].owner == defender:
                def_val += 2
                self.print_q("【ボックス陣地】陣地効果で防御力+2！")
            
        if any("伊戦車" in c.name or "イタリア軍戦車隊" in c.name for c in defender.attachments.get(def_p, [])):
            def_val += 1
            self.print_q("【イタリア軍戦車隊】防御力+1！")

        self.print_q(f"\n→ 攻撃側攻撃力: {atk_val} VS 防御側防御力: {def_val}")

        if atk_val >= def_val:
            self.print_q(f"命中！敵列{def_p}の【{target.name}】を撃破対象にしました！！")
            
            targets_to_destroy = [target]
            used_overwhelming = False
            
            is_delayed = any("遅延" in e.name for e in attacker.active_events + defender.active_events)
            
            extra_kill_cards = []
            if not is_delayed:
                extra_kill_cards = [c for c in attacker.hand if "圧倒的物量" in c.name or "物量" in c.name]
            
            flank_cards = [c for c in attacker.hand if "迂回戦術" in c.name]
            
            if extra_kill_cards and len(defender.platoons[def_p]) > 1:
                target_card = extra_kill_cards[0]
                if attacker.is_ai:
                    use_ex = '1'
                else:
                    use_ex = await self.safe_input_method("手札に【圧倒的物量】があります。使用して追加で1枚破壊しますか？ (1: はい / 99: いいえ): ")
                
                if use_ex == '1':
                    self.print_q("【圧倒的物量】手札から使用！追加でもう1枚を破壊対象にします！")
                    attacker.hand.remove(target_card)
                    attacker.discard_pile.append(target_card)
                    # 追加の対象も表にする
                    defender.platoons[def_p][1].is_face_up = True
                    targets_to_destroy.append(defender.platoons[def_p][1])
                    used_overwhelming = True

            if flank_cards and not used_overwhelming:
                target_card = flank_cards[0]
                if attacker.is_ai:
                    use_fl = '1'
                else:
                    use_fl = await self.safe_input_method("手札に【迂回戦術】があります。使用して敵司令部にダメージを与えますか？ (1: はい / 99: いいえ): ")
                
                if use_fl == '1':
                    burn_amount = target.cost
                    self.print_q(f"【迂回戦術】手札から使用！撃破した戦車のコスト({burn_amount})分、敵司令部を削ります！")
                    attacker.hand.remove(target_card)
                    attacker.discard_pile.append(target_card)
                    self.damage_hq(defender, burn_amount)

            actual_destroyed = []
            
            for t in targets_to_destroy:
                save_cards = [c for c in defender.hand if "4スペツィアル" in c.name or "4号スペツィアル" in c.name]
                is_saved = False
                
                if save_cards and ("4F" in t.name or "4号F" in t.name):
                    sacrifices = [i for i, c in enumerate(defender.platoons[def_p]) if c not in targets_to_destroy and ("3H" in c.name or "3J" in c.name or "4E" in c.name or "3号" in c.name or "4号" in c.name)]
                    
                    if sacrifices:
                        if defender.is_ai:
                            use_save = '1'
                            sac_idx = sacrifices[0]
                        else:
                            use_save = await self.safe_input_method(f"手札に【4号スペツィアル】があります。味方を犠牲にして {t.name} の撃破を無効化しますか？ (1: はい / 99: いいえ): ")
                            if use_save == '1':
                                self.print_q(f"\n身代わりにする戦車を選んでください:")
                                valid_choices = []
                                for idx in sacrifices:
                                    sac_c = defender.platoons[def_p][idx]
                                    self.print_q(f"  {idx+1}番目: {sac_c.name}")
                                    valid_choices.append(str(idx+1))
                                    
                                while True:
                                    sac_input = await self.safe_input_method("犠牲にする戦車の番号を入力: ")
                                    if sac_input in valid_choices:
                                        sac_idx = int(sac_input) - 1
                                        break
                                    self.print_q("無効な番号です。リストにある番号を入力してください。")
                                    
                        if use_save == '1':
                            sac_tank = defender.platoons[def_p][sac_idx]
                            sac_tank.is_face_up = True
                            actual_destroyed.append(sac_tank)
                            targets_to_destroy.append(sac_tank) 
                            
                            target_card = save_cards[0]
                            defender.hand.remove(target_card)
                            defender.discard_pile.append(target_card)
                            
                            self.print_q(f"【4号スペツィアル】『{sac_tank.name}』を身代わりの犠牲にして、{t.name} の撃破を無効化しました！")
                            is_saved = True
                
                if not is_saved:
                    actual_destroyed.append(t)

            for t in actual_destroyed.copy():
                if any("伊戦車" in att.name or "イタリア軍戦車隊" in att.name for att in defender.attachments.get(def_p, [])):
                    if defender.is_ai:
                        use_shield = '1'
                    else:
                        use_shield = await self.safe_input_method(f"列{def_p}に【イタリア軍戦車隊】が装備されています。装甲を犠牲にして {t.name} の撃破を無効化しますか？ (1: はい / 99: いいえ): ")
                    
                    if use_shield == '1':
                        shield_card = next(att for att in defender.attachments[def_p] if "伊戦車" in att.name or "イタリア軍戦車隊" in att.name)
                        defender.attachments[def_p].remove(shield_card)
                        defender.discard_pile.append(shield_card)
                        actual_destroyed.remove(t)
                        # ★修正：テキスト変更
                        self.print_q(f"【イタリア軍戦車隊を使用】{t.name} の撃破を無効化しました！イタリア軍戦車隊は捨て札にします。")

            for t in actual_destroyed:
                if t in defender.platoons[def_p]:
                    defender.platoons[def_p].remove(t)
                    t.is_face_up = True
                    defender.discard_pile.append(t)
                    self.print_q(f"  -> {t.name} が破壊されました！")
                    
            if not defender.platoons[def_p]:
                defender.advanced[def_p] = False
                self.print_q(f"【部隊全滅】{defender.faction}の列{def_p}が全滅しました！")
                if self.current_player.brain: self.current_player.brain.add_intermediate_reward(0.3)
                if defender.brain: defender.brain.add_intermediate_reward(-0.3)
                if self.terrains[def_p] and ("陣地" in self.terrains[def_p].name or "ボックス陣地" in self.terrains[def_p].name):
                    self.print_q("【ボックス陣地】守備隊が全滅したため、陣地も破棄（捨て札）されます！")
                    removed_fort = self.terrains[def_p]
                    self.terrains[def_p] = None
                    defender.discard_pile.append(removed_fort)
                await self.check_and_emergency_deploy(defender, def_p)
        else:
            self.print_q("弾かれた！装甲を抜けませんでした...")

        is_delayed = any("遅延" in e.name for e in attacker.active_events + defender.active_events)
        if not is_delayed:
            counter_cards = [c for c in defender.hand if "反撃" in c.name]
            if counter_cards and defender.platoons[def_p]:
                if defender.is_ai:
                    surviving_tanks = [c for c in defender.platoons[def_p] if c.type == '戦車' and "欺瞞" not in c.name and "ダミー" not in c.name]
                    if not surviving_tanks:
                        use_c = '99'
                    else:
                        is_melee_counter = attacker.advanced[atk_p] or defender.advanced[def_p]
                        if is_melee_counter:
                            valid_atks = [int(c.attack) for c in surviving_tanks if '固定砲塔' not in c.traits]
                            c_base_atk = max(valid_atks) if valid_atks else 0
                        else:
                            c_base_atk = max([int(c.attack) for c in surviving_tanks])
                        
                        c_atk_val = c_base_atk + (len(surviving_tanks) - 1)
                        if any("伊戦車" in c.name or "イタリア軍戦車隊" in c.name for c in defender.attachments.get(def_p, [])):
                            c_atk_val += 2
                        
                        target_atk_tank = attacker.platoons[atk_p][0]
                        c_def_val_str = str(target_atk_tank.defense).split('-')
                        is_flank = (atk_p != def_p)
                        if (is_flank or is_melee_counter) and len(c_def_val_str) > 1:
                            c_def_val = int(c_def_val_str[1])
                        else:
                            c_def_val = int(c_def_val_str[0])
                            
                        # 陣地の持ち主判定を追加
                        if self.terrains[atk_p] and ("陣地" in self.terrains[atk_p].name or "ボックス陣地" in self.terrains[atk_p].name) and not attacker.advanced[atk_p]:
                            if hasattr(self.terrains[atk_p], 'owner') and self.terrains[atk_p].owner == attacker:
                                c_def_val += 2
                                
                        if any("伊戦車" in c.name or "イタリア軍戦車隊" in c.name for c in attacker.attachments.get(atk_p, [])):
                            c_def_val += 1
                            
                        if c_atk_val >= c_def_val:
                            use_c = '1'
                        else:
                            use_c = '99'
                else:
                    use_c = await self.safe_input_method("手札に【反撃】カードがあります。使用して反撃しますか？ (1: はい / 99: いいえ): ")
                
                if use_c == '1':
                    self.print_q(f"【反撃！】生き残った列{def_p}が、そのまま敵列{atk_p}へ射撃を返します！")
                    defender.hand.remove(counter_cards[0])
                    defender.discard_pile.append(counter_cards[0])
                    await self.execute_attack(defender, attacker, def_p, atk_p)

        return True

    async def action_move(self, attacker, defender):
        self.print_q("\n移動を行う部隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
        val_input = await self.safe_input_method("番号を入力: ")
        if val_input == '1': p = 'A'
        elif val_input == '2': p = 'B'
        elif val_input == '3': p = 'C'
        elif val_input == '99': return False
        else: return False
        if p not in attacker.platoons or not attacker.platoons[p]:
            self.print_q("\n【！】無効な選択、またはその列に戦車がいません。")
            return False

        real_tanks = [c for c in attacker.platoons[p] if c.type == '戦車' and "欺瞞" not in c.name and "ダミー" not in c.name]
        if not real_tanks:
            self.print_q("\n【！】本物の戦車が存在しないため、移動指示は出せません！")
            return False

        for card in attacker.platoons[p]:
            card.is_face_up = True
            
        move_dummies = [c for c in attacker.platoons[p] if "欺瞞" in c.name or "ダミー" in c.name or "8.8cm" in c.name or "高射砲" in c.name]
        for d in move_dummies:
            self.print_q(f"【罠消滅】移動した部隊の『{d.name}』は正体を現し、直ちに廃棄されました！")
            attacker.platoons[p].remove(d)
            attacker.discard_pile.append(d)

        if self.terrains[p]:
            t_name = self.terrains[p].name
            if "悪魔の園" in t_name or "陣地" in t_name:
                if "悪魔の園" in t_name:
                    if len(attacker.platoons[p]) <= 3:
                        self.print_q("【悪魔の園】侵入するには戦車3枚の犠牲が必要です。部隊の数が足りません！")
                        return False
                    self.print_q("【悪魔の園】強行突破！味方戦車3枚を犠牲にして敵陣地に進入します！")
                    
                    for step in range(3):
                        if attacker.is_ai:
                            sac = attacker.platoons[p].pop(0)
                        else:
                            self.print_q(f"\n[犠牲にする戦車を選択: {step+1}/3両目]")
                            for i, t in enumerate(attacker.platoons[p]):
                                self.print_q(f"  {i+1}: {t.name} (攻{t.attack}/防{t.defense})")
                            
                            while True:
                                sac_idx_str = await self.safe_input_method("犠牲にする戦車の番号を入力: ")
                                if sac_idx_str.isdigit() and 1 <= int(sac_idx_str) <= len(attacker.platoons[p]):
                                    sac_idx = int(sac_idx_str) - 1
                                    sac = attacker.platoons[p].pop(sac_idx)
                                    break
                                self.print_q("無効な番号です。")
                        
                        attacker.discard_pile.append(sac)
                        self.print_q(f" -> {sac.name} を犠牲にしました。")
                        
                    attacker.advanced[p] = True
                    for card in attacker.platoons[p]: card.is_face_up = True
                    
                    if not attacker.platoons[p]:
                        attacker.advanced[p] = False
                        await self.check_and_emergency_deploy(attacker, p)
                        
                    return True
                else: 
                    self.print_q(f"【！】地形『{t_name}』は移動コマンドでは除去（乗り換え）できません！")
                    return False
            else:
                self.print_q(f"【地形除去】地形『{t_name}』を取り除きました！")
                removed = self.terrains[p]
                self.terrains[p] = None
                attacker.discard_pile.append(removed)
                return True

        if defender.platoons[p]: 
            self.print_q("\n【！】正面に敵がいるため進入できません！")
            return False
        elif attacker.advanced[p]: 
            self.print_q("\n【！】既に進入済みです！")
            return False
        else:
            attacker.advanced[p] = True
            for card in attacker.platoons[p]: card.is_face_up = True
            self.print_q(f"\n列{p}が敵陣地へ進入しました！")
            if attacker.brain: attacker.brain.add_intermediate_reward(0.2)
            if len(defender.headquarters) == 0:
                self.print_q("\n★★★ 決着！ 山札0の状態で陣地侵入を許しました！ ★★★")
                self.game_over = True
                self.winner = attacker
            return True

    async def action_play_tactical_card(self, player, enemy):
        tactical_cards = [c for c in player.hand if c.type in ['地形', 'アクション', 'イベント']]
        if not tactical_cards:
            self.print_q("\n【！】手札に使用できる戦術・地形・イベントカードがありません。")
            return False
            
        self.print_q("\n--- 戦術カードの使用（99: 戻る） ---")
        for i, c in enumerate(tactical_cards): self.print_q(f"{i+1}: [{c.type}] {c.name}")
        val = await self.safe_input_method("使用するカードの番号を入力: ")
        if val == '99': return False
        
        if not val.isdigit():
            self.print_q("無効な番号です。")
            return False
            
        idx = int(val) - 1
        if idx < 0 or idx >= len(tactical_cards):
            self.print_q("無効な番号です。")
            return False
            
        card = tactical_cards[idx]
        
        if card.name in ["迂回戦術", "圧倒的物量", "物量", "ベルザリエーリ", "弾幕射撃", "反撃", "4号スペツィアル", "4スペツィアル"]:
            self.print_q(f"\n【！】『{card.name}』はここでは使えません。条件を満たした時（攻撃時や防御時など）に自動で選択肢が出ます！")
            return False
            
        if "チャーチル" in card.name:
            limit = 1 if any(e.name == "モンティ" for e in player.active_events) else 2
            targets = [dc for dc in player.discard_pile if dc.is_face_up and dc.type not in ['戦車', 'イベント', 'アクシデント'] and "チャーチル" not in dc.name]
            
            if not targets:
                self.print_q(f"【{card.name}】回収できるカードがありませんでした。")
                player.discard_pile.append(card)
                player.hand.remove(card)
                return True

            if limit == 1:
                self.print_q("【モンティ連携】モンティが場にいるため、1枚を司令部に戻します。")

            if player.is_ai:
                import random
                chosen = random.sample(targets, min(limit, len(targets)))
            else:
                chosen = []
                for _ in range(limit):
                    current_targets = [dc for dc in player.discard_pile if dc.is_face_up and dc.type not in ['戦車', 'イベント', 'アクシデント'] and "チャーチル" not in dc.name and dc not in chosen]
                    if not current_targets: break
                    
                    self.print_q(f"\n【{card.name}】山札の一番下に戻すカードを選んでください（現在 {len(chosen)}/{limit} 枚選択中）")
                    for i, t in enumerate(current_targets):
                        self.print_q(f"  {i+1}: [{t.type}] {t.name}")
                    
                    val = await self.safe_input_method("戻すカードの番号を入力 (99: 選択を終了する): ")
                    if val == '99': break
                    
                    if val.isdigit() and 1 <= int(val) <= len(current_targets):
                        chosen.append(current_targets[int(val)-1])
                    else:
                        self.print_q("無効な番号です。")
                        
            if chosen:
                for c in chosen:
                    player.discard_pile.remove(c)
                    player.headquarters.append(c) 
                    self.print_q(f"  -> 『{c.name}』を司令部(山札)の一番下に戻しました。")

            player.discard_pile.append(card)
            player.hand.remove(card)
            return True
        
        if "8.8cm" in card.name or "高射砲" in card.name or "欺瞞" in card.name or "ダミー" in card.name:
            valid_cols = [col for col in ['A', 'B', 'C'] if not enemy.advanced[col]]
            if not valid_cols:
                self.print_q("\n【！】全ての列が進入されているため、罠を配置できません！")
                return False
                
            self.print_q(f"\n【罠配備】{card.name} の配備先を選択してください (可能な列: {', '.join(valid_cols)} | 1: A / 2: B / 3: C / 99: 戻る)")
            val_input = await self.safe_input_method("番号を入力: ")
            if val_input == '1': p = 'A'
            elif val_input == '2': p = 'B'
            elif val_input == '3': p = 'C'
            else: return False
            
            if p not in valid_cols:
                self.print_q("\n【！】敵に進入されている列には配備できません！")
                return False
                
            card.is_face_up = False
            
            if "欺瞞" in card.name or "ダミー" in card.name:
                player.platoons[p].insert(0, card)
                self.print_q(f"列{p}の先頭に {card.name} を裏向きで配備しました！")
            else:
                if len(player.platoons[p]) > 0:
                    self.print_q(f"\n【配置位置の選択】現在の列{p}の並び:")
                    for pl_idx, t in enumerate(player.platoons[p]):
                        self.print_q(f"  {pl_idx + 1}番目 (現在の {t.name} の前)")
                    self.print_q(f"  {len(player.platoons[p]) + 1}番目 (最後尾に追加)")
                    
                    while True:
                        pos_val = await self.safe_input_method(f"配置する位置を数字で入力してください (1〜{len(player.platoons[p]) + 1}): ")
                        if pos_val.isdigit() and 1 <= int(pos_val) <= len(player.platoons[p]) + 1:
                            insert_idx = int(pos_val) - 1
                            player.platoons[p].insert(insert_idx, card)
                            break
                        self.print_q("正しい番号を入力してください。")
                else:
                    player.platoons[p].append(card)
                self.print_q(f"列{p}に {card.name} を裏向きで配備しました！")
                
            player.hand.remove(card)
            return True
            
        if card.type == '地形':
            self.print_q("\n配置先を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
            val_input = await self.safe_input_method("番号を入力: ")
            if val_input == '1': p = 'A'
            elif val_input == '2': p = 'B'
            elif val_input == '3': p = 'C'
            else: return False
            if self.terrains[p] is not None or player.advanced[p] or enemy.advanced[p]:
                self.print_q("\n【！】その列には配置できません！")
                return False
            if "陣地" in card.name or "ボックス陣地" in card.name:
                real_tanks = [c for c in player.platoons[p] if c.type == '戦車' and "欺瞞" not in c.name and "ダミー" not in c.name]
                if not real_tanks:
                    self.print_q("【！】本物の戦車がいない部隊にはボックス陣地は配置できません！")
                    return False

            # ★修正：陣地の持ち主を記録する
            card.owner = player
            self.terrains[p] = card
            player.hand.remove(card)
            self.print_q(f"列{p}に地形【{card.name}】を配置しました！")
            return True
            
        else:
            if "鹵獲戦車" in card.name:
                enemy_tanks = [c for c in enemy.discard_pile if c.type == '戦車' and c.is_face_up]
                if not enemy_tanks:
                    self.print_q("\n【鹵獲戦車 失敗...】敵の捨て札に奪える戦車がありませんでした。")
                    player.discard_pile.append(card)
                    player.hand.remove(card)
                    return True
                    
                self.print_q("\n【鹵獲戦車】敵の捨て札から奪う戦車を選択してください:")
                for i, t in enumerate(enemy_tanks):
                    self.print_q(f"  {i+1}: {t.name} (攻{t.attack}/防{t.defense})")
                    
                while True:
                    t_idx_str = await self.safe_input_method("奪う戦車の番号を入力 (99: 戻る): ")
                    if t_idx_str == '99': return False
                    if t_idx_str.isdigit() and 1 <= int(t_idx_str) <= len(enemy_tanks):
                        t_idx = int(t_idx_str) - 1
                        captured = enemy_tanks[t_idx]
                        break
                    self.print_q("無効な番号です。")
                    
                self.print_q(f"\n奪った『{captured.name}』の配備先を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
                val_input = await self.safe_input_method("番号を入力: ")
                if val_input == '1': val = 'A'
                elif val_input == '2': val = 'B'
                elif val_input == '3': val = 'C'
                elif val_input == '99': return False
                else:
                    self.print_q("無効な選択です。")
                    return False
                
                enemy.discard_pile.remove(captured)
                self.print_q(f"\n【鹵獲戦車 成功！】敵の捨て札から『{captured.name}』を奪い取りました！")
                captured.is_face_up = False
                
                if len(player.platoons[val]) > 0:
                    self.print_q(f"\n【配置位置の選択】現在の列{val}の並び:")
                    for pl_idx, t in enumerate(player.platoons[val]):
                        self.print_q(f"  {pl_idx + 1}番目 (現在の {t.name} の前)")
                    self.print_q(f"  {len(player.platoons[val]) + 1}番目 (最後尾に追加)")
                    
                    while True:
                        pos_val = await self.safe_input_method(f"配置する位置を数字で入力してください (1〜{len(player.platoons[val]) + 1}): ")
                        if pos_val.isdigit() and 1 <= int(pos_val) <= len(player.platoons[val]) + 1:
                            insert_idx = int(pos_val) - 1
                            player.platoons[val].insert(insert_idx, captured)
                            break
                        self.print_q("正しい番号を入力してください。")
                else:
                    player.platoons[val].append(captured)
                
                self.print_q(f"奪った {captured.name} を列{val}に裏向きで配備しました！")
                player.discard_pile.append(card)
                player.hand.remove(card)
                return True
                
            elif "砂漠の狐" in card.name or "ロンメル" in card.name:
                self.print_q("\n【砂漠の狐】全戦車部隊の再配置を行います！")
                
                ans = await self.safe_input_method("現在の配置をリセットして再配置しますか？ (1: 再配置する / 99: このままでいい(スキップ)): ")
                
                if ans == '1':
                    advanced_memory = {p: player.advanced[p] for p in ['A', 'B', 'C']}
                    
                    temp_pool = []
                    for p in ['A', 'B', 'C']:
                        temp_pool.extend(player.platoons[p])
                        player.platoons[p] = []
                    
                    while temp_pool:
                        self.print_q(f"\n[残り再配置待ち: {len(temp_pool)}両]")
                        for i, t in enumerate(temp_pool):
                            self.print_q(f"  {i+1}: {t.name} (攻{t.attack}/防{t.defense})")
                        
                        self.print_q("  99: 配置を最初からやり直す")
                        t_idx_str = await self.safe_input_method("配置する戦車の番号を入力 (99: リセット): ")
                        
                        if t_idx_str == '99':
                            self.print_q("\n【やり直し】配置をリセットし、最初からやり直します。")
                            for p in ['A', 'B', 'C']:
                                temp_pool.extend(player.platoons[p])
                                player.platoons[p] = []
                            continue
                            
                        if not t_idx_str.isdigit() or not (1 <= int(t_idx_str) <= len(temp_pool)):
                            self.print_q("無効な番号です。")
                            continue
                        
                        t_idx = int(t_idx_str) - 1
                        target_tank = temp_pool.pop(t_idx)
                        
                        self.print_q(f"\n『{target_tank.name}』の配置先を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
                        dst_input = await self.safe_input_method("番号を入力: ")
                        
                        if dst_input == '99':
                            self.print_q("戦車の選択をキャンセルしました。")
                            temp_pool.insert(t_idx, target_tank)
                            continue
                            
                        if dst_input == '1': dst_val = 'A'
                        elif dst_input == '2': dst_val = 'B'
                        elif dst_input == '3': dst_val = 'C'
                        else: dst_val = 'X'
                        
                        if dst_val in ['A', 'B', 'C']:
                            player.platoons[dst_val].append(target_tank)
                            self.print_q(f"『{target_tank.name}』を列{dst_val}に配置しました。")
                        else:
                            self.print_q("無効な選択です。やり直します。")
                            temp_pool.insert(t_idx, target_tank)
                    
                    for p in ['A', 'B', 'C']:
                        if player.platoons[p]:
                            if advanced_memory[p]:
                                player.advanced[p] = True
                            if enemy.advanced[p]:
                                enemy.advanced[p] = False
                                self.print_q(f"【押し返し】列{p}に部隊が再配置されたため、敵の進入状態が解除されました！")
                        else:
                            player.advanced[p] = False
                    
                    self.print_q("【砂漠の狐】全部隊の再配置が完了しました！")
                else:
                    self.print_q("再配置をスキップしました。")
                
                if card.type == 'イベント':
                    self.print_q(f"【イベント発動】『{card.name}』が場に配置されます！")
                    for p_target in [player, enemy]:
                        while p_target.active_events:
                            old_ev = p_target.active_events.pop(0)
                            self.print_q(f"  -> 古いイベント/アクシデント『{old_ev.name}』は押し出され、ゲームから完全に除外されました。")
                    player.active_events.append(card)
                else:
                    player.discard_pile.append(card)
                    
                player.hand.remove(card)
                return True

            elif "伊戦車" in card.name or "イタリア軍戦車隊" in card.name:
                self.print_q(f"\n【{card.name}】味方の部隊を強化（装備）します。")
                self.print_q("強化する部隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
                val_input = await self.safe_input_method("番号を入力: ")
                if val_input == '1': val = 'A'
                elif val_input == '2': val = 'B'
                elif val_input == '3': val = 'C'
                elif val_input == '99': return False
                else: val = 'X'
                
                if val in ['A', 'B', 'C'] and player.platoons[val]:
                    if any("伊戦車" in att.name or "イタリア軍戦車隊" in att.name for att in player.attachments[val]):
                        self.print_q(f"【！】列{val}には既にイタリア軍戦車隊が装備されています。重ねて装備はできません！")
                        return False

                    player.attachments[val].append(card)
                    player.hand.remove(card)
                    self.print_q(f"列{val}に【{card.name}】を装備し、常時強化状態にしました！")
                    return True
                else:
                    self.print_q("無効な選択、または戦車がいません。")
                    return False

            elif card.type == 'イベント':
                self.print_q(f"\n【イベント発動】『{card.name}』を場に配置します！")
                for p_target in [player, enemy]:
                    while p_target.active_events:
                        old_ev = p_target.active_events.pop(0)
                        self.print_q(f"  -> 古いイベント/アクシデント『{old_ev.name}』は押し出され、ゲームから完全に除外されました。")
                player.active_events.append(card)
                
                if card.name == "モンティ":
                    targets = [dc for dc in player.discard_pile if dc.is_face_up and dc.type not in ['イベント', 'アクシデント']]
                    if not targets:
                        self.print_q("【モンティ】捨て札に回収できるカードがありませんでした。")
                    else:
                        if player.is_ai:
                            import random
                            chosen = random.sample(targets, min(3, len(targets)))
                        else:
                            chosen = []
                            for _ in range(3):
                                current_targets = [dc for dc in player.discard_pile if dc.is_face_up and dc.type not in ['イベント', 'アクシデント'] and dc not in chosen]
                                if not current_targets: break
                                
                                self.print_q(f"\n【モンティ】山札に戻してシャッフルするカードを選んでください（現在 {len(chosen)}/3 枚選択中）")
                                for i, t in enumerate(current_targets):
                                    self.print_q(f"  {i+1}: [{t.type}] {t.name}")
                                
                                val = await self.safe_input_method("戻すカードの番号を入力 (99: 選択を終了してシャッフルする): ")
                                if val == '99': break
                                
                                if val.isdigit() and 1 <= int(val) <= len(current_targets):
                                    chosen.append(current_targets[int(val)-1])
                                else:
                                    self.print_q("無効な番号です。")
                                    
                        if chosen:
                            for c in chosen:
                                player.discard_pile.remove(c)
                                player.headquarters.append(c)
                            self.print_q(f"あなたは捨て札から {len(chosen)} 枚のカードを司令部に戻しました。")
                            import random
                            random.shuffle(player.headquarters)
                            self.print_q("司令部のカードをシャッフルしました！")

                player.hand.remove(card)
                return True

            elif "頼りになるハニー" in card.name:
                self.print_q("\n【頼りになるハニー】偵察を行う敵の部隊を選択します。")
                self.print_q("偵察する敵部隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
                val_input = await self.safe_input_method("番号を入力: ")
                if val_input == '1': val = 'A'
                elif val_input == '2': val = 'B'
                elif val_input == '3': val = 'C'
                elif val_input == '99': return False
                else:
                    self.print_q("無効な選択です。")
                    return False
                
                if val in ['A', 'B', 'C'] and enemy.platoons[val]:
                    hidden_tanks = [t for t in enemy.platoons[val] if not t.is_face_up]
                    if hidden_tanks:
                        if player.is_ai:
                            target = hidden_tanks[0]
                        else:
                            self.print_q(f"\n列{val}の裏向きの戦車一覧:")
                            for i, t in enumerate(hidden_tanks):
                                self.print_q(f"  {i+1}: ?????裏")
                                
                            while True:
                                t_idx_str = await self.safe_input_method("偵察して表にする戦車の番号を入力 (99: 戻る): ")
                                if t_idx_str == '99': return False
                                if t_idx_str.isdigit() and 1 <= int(t_idx_str) <= len(hidden_tanks):
                                    target = hidden_tanks[int(t_idx_str) - 1]
                                    break
                                self.print_q("無効な番号です。")
                                
                        target.is_face_up = True
                        self.print_q(f"【偵察成功】列{val}の戦車の正体は『{target.name}』でした！")
                        if "8.8cm" in target.name or "高射砲" in target.name or "欺瞞" in target.name or "ダミー" in target.name:
                            self.print_q(f"【罠除去】罠だと看破されたため、即座に除去されました！")
                            enemy.platoons[val].remove(target)
                            enemy.discard_pile.append(target)
                    else:
                        self.print_q(f"列{val}には裏向きの戦車がいませんでした。")
                        return False
                else:
                    self.print_q("無効な選択、または敵がいません。")
                    return False
                
                stuart_cards = [c for c in player.hand if "スチュアート" in c.name or "Stuart" in c.name or "St" in c.name]
                if stuart_cards:
                    if player.is_ai:
                        use_s = '1'
                    else:
                        use_s = await self.safe_input_method("手札の『スチュアート』を捨てて、山札から1枚ドローしますか？ (1: はい / 99: いいえ): ")
                    
                    if use_s == '1':
                        discard_target = stuart_cards[0]
                        player.hand.remove(discard_target)
                        player.discard_pile.append(discard_target)
                        self.print_q(f"【追加効果】『{discard_target.name}』を捨て札にしました！")
                        
                        if player.headquarters:
                            drawn = player.headquarters.pop(0)
                            player.hand.append(drawn)
                            self.print_q("司令部(山札)からカードを1枚ドローしました！")
                        else:
                            self.print_q("しかし、司令部(山札)が空でした……。")
                
                player.discard_pile.append(card)
                player.hand.remove(card)
                return True

            elif "イタリア軍奮闘" in card.name:
                self.print_q("\n【イタリア軍奮闘】対象とする敵部隊を選択してください。")
                self.print_q("対象の敵部隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
                val_input = await self.safe_input_method("番号を入力: ")
                if val_input == '1': val = 'A'
                elif val_input == '2': val = 'B'
                elif val_input == '3': val = 'C'
                elif val_input == '99': return False
                else:
                    self.print_q("無効な選択です。")
                    return False
                
                if val in ['A', 'B', 'C'] and enemy.platoons[val]:
                    if any("慢性的補給不足" in e.name for e in player.active_events):
                        self.print_q("（※慢性的補給不足のため、破壊ではなく『表向きにする』効果になります）")
                        hidden_tanks = [t for t in enemy.platoons[val] if not t.is_face_up]
                        if hidden_tanks:
                            target = hidden_tanks[0]
                            target.is_face_up = True
                            self.print_q(f"【イタリア軍奮闘】敵の {target.name} を表向きにしました！")
                            if "8.8cm" in target.name or "高射砲" in target.name or "欺瞞" in target.name or "ダミー" in target.name:
                                self.print_q(f"【罠消滅】罠だと看破されたため、直ちに廃棄されました！")
                                enemy.platoons[val].remove(target)
                                enemy.discard_pile.append(target)
                        else:
                            self.print_q("裏向きの敵がいませんでした。")
                            return False
                    else:
                        self.print_q(f"敵の列{val}の戦車一覧:")
                        for i, t in enumerate(enemy.platoons[val]):
                            # ★修正：裏面のカードは中身を隠して表示する
                            disp_name = self.format_card(t, is_enemy=True)
                            self.print_q(f"  {i+1}: {disp_name}")
                        t_idx_str = await self.safe_input_method("破壊する戦車の番号を入力 (99: 戻る): ")
                        
                        if t_idx_str == '99':
                            return False
                            
                        if t_idx_str.isdigit() and 1 <= int(t_idx_str) <= len(enemy.platoons[val]):
                            t_idx = int(t_idx_str) - 1
                            target = enemy.platoons[val].pop(t_idx)
                            target.is_face_up = True
                            enemy.discard_pile.append(target)
                            self.print_q(f"【イタリア軍奮闘】敵の {target.name} を破壊しました！")
                            
                            if not enemy.platoons[val]:
                                enemy.advanced[val] = False
                                if self.terrains[val] and ("陣地" in self.terrains[val].name or "ボックス陣地" in self.terrains[val].name):
                                    removed_fort = self.terrains[val]
                                    self.terrains[val] = None
                                    enemy.discard_pile.append(removed_fort)
                                    self.print_q("【ボックス陣地】守備隊が全滅したため、陣地も破棄されました！")
                                await self.check_and_emergency_deploy(enemy, val)
                        else:
                            self.print_q("無効な番号のため失敗しました。")
                            return False
                else:
                    self.print_q("無効な選択、または敵がいません。")
                    return False
                    
                player.discard_pile.append(card)
                player.hand.remove(card) 
                return True

            else:
                res = await GameEffects.play_tactical_card(player, enemy, card, None, self)
                if res is False:
                    return False
                if card in player.hand:
                    player.hand.remove(card)
                return True

    async def action_add_tank(self, player, enemy): 
        tanks = [c for c in player.hand if c.type == '戦車']
        if not tanks:
            self.print_q("\n【！】手札に戦車がありません。")
            return False
            
        self.print_q("\n追加先を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
        p_input = await self.safe_input_method("番号を入力: ")
        if p_input == '1': p = 'A'
        elif p_input == '2': p = 'B'
        elif p_input == '3': p = 'C'
        elif p_input == '99': return False
        else: return False

        added_count = 0
        while True:
            current_tanks = [c for c in player.hand if c.type == '戦車']
            if not current_tanks:
                if added_count > 0: self.print_q("\n手札の戦車をすべて配置しました。")
                break
                
            self.print_q(f"\n--- 列{p}への追加配置（現在 {added_count} 枚追加済み） ---")
            for i, c in enumerate(current_tanks): 
                self.print_q(f"{i+1}: {c.name} (攻{c.attack}/防{c.defense})")
            
            val = await self.safe_input_method("追加する戦車の番号を入力 (99: 配置を終了してターンを進める): ")
            
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
                        self.print_q(f"列{p}の先頭にダミー {card.name} を裏向きで追加配置しました！")
                    else:
                        if len(player.platoons[p]) > 0:
                            self.print_q(f"\n【配置位置の選択】現在の列{p}の並び:")
                            for pl_idx, t in enumerate(player.platoons[p]):
                                self.print_q(f"  {pl_idx + 1}番目 (現在の {t.name} の前)")
                            self.print_q(f"  {len(player.platoons[p]) + 1}番目 (最後尾に追加)")
                            
                            while True:
                                pos_val = await self.safe_input_method(f"配置する位置を数字で入力してください (1〜{len(player.platoons[p]) + 1} / 99: この戦車の配置をやめる): ")
                                if pos_val == '99':
                                    card = None
                                    break
                                if pos_val.isdigit() and 1 <= int(pos_val) <= len(player.platoons[p]) + 1:
                                    insert_idx = int(pos_val) - 1
                                    player.platoons[p].insert(insert_idx, card)
                                    break
                                self.print_q("正しい番号を入力してください。")
                        else:
                            player.platoons[p].append(card)
                        if card is None:
                            self.print_q("配置をキャンセルしました。")
                            continue
                        self.print_q(f"列{p}に {card.name} を裏向きで追加配置しました！")
                        
                    player.hand.remove(card)
                    added_count += 1
                else:
                    self.print_q("無効な番号です。")
            else:
                self.print_q("数値を入力してください。")
                
        if added_count > 0:
            if enemy.advanced[p]:
                enemy.advanced[p] = False
                self.print_q(f"【押し返し】正面に戦車が配置されたため、敵の列{p}の進入状態は解除されました！")
            return True
        return False

    async def action_swap_card(self, player):
        self.print_q("\n--- 手札の交換（やめる場合は X を入力） ---")
        for i, c in enumerate(player.hand): self.print_q(f"{i+1}: {c.name}")
        val = (await self.safe_input_method("デッキの底に戻すカードの番号を入力: ")).upper()
        if val == 'X': return False
        
        if val.isdigit():
            idx = int(val) - 1
            if idx < 0 or idx >= len(player.hand): return False
                
            card = player.hand.pop(idx)
            player.headquarters.append(card)
            
            if player.headquarters:
                player.hand.append(player.headquarters.pop(0))
            self.print_q("カードを交換しました。")
            return True
        return False

    async def ai_take_turn(self):
        attack_count = 0
        
        while True:
            if self.game_over: return
            self.show_battlefield()
            if not self.training_mode:
                self.print_q("\nAIが行動を計算中...")
                await asyncio.sleep(0.5)
            
            state_str = "Default"
            try: state_str = self.current_player.brain.get_abstract_state(self.current_player, self.enemy_player, self.terrains)
            except: pass
            
            platoons_with_real_tanks = [p for p in ['A', 'B', 'C'] if any(c.type == '戦車' and "欺瞞" not in c.name and "ダミー" not in c.name for c in self.current_player.platoons[p])]
            evaluated_actions = []
            is_fox_active = any(e.name in ["砂漠の狐", "ロンメル"] for e in self.current_player.active_events)

            if not (attack_count == 1 and is_fox_active):
                for p in platoons_with_real_tanks:
                    if self.current_player.advanced[p]:
                        evaluated_actions.append(('attack_hq', p, 10000))
                    else:
                        has_long_range = any('長射程' in t for tank in self.current_player.platoons[p] for t in tank.traits)
                        if has_long_range and not self.enemy_player.platoons[p] and not self.terrains[p]:
                            evaluated_actions.append(('attack_hq', p, 10000))

            for p in platoons_with_real_tanks:
                if self.terrains[p] and ("陣地" in self.terrains[p].name or "ボックス陣地" in self.terrains[p].name):
                    if hasattr(self.terrains[p], 'owner') and self.terrains[p].owner == self.current_player:
                        continue

                atk_tanks = [c for c in self.current_player.platoons[p] if c.type == '戦車' and "欺瞞" not in c.name and "ダミー" not in c.name]
                if not atk_tanks: continue
                
                base_atk = max([int(c.attack) for c in atk_tanks])
                atk_val = base_atk + (len(atk_tanks) - 1)
                if any("伊戦車" in att.name or "イタリア軍戦車隊" in att.name for att in self.current_player.attachments.get(p, [])):
                    atk_val += 2

                if self.current_player.advanced[p]:
                    for target_p in ['A', 'B', 'C']:
                        if target_p != p and self.enemy_player.platoons[target_p] and not self.enemy_player.advanced[target_p]:
                            def_target = self.enemy_player.platoons[target_p][0]
                            def_val_str = str(def_target.defense).split('-')
                            def_val = int(def_val_str[1]) if len(def_val_str) > 1 else int(def_val_str[0])
                            
                            if self.terrains[target_p] and ("陣地" in self.terrains[target_p].name or "ボックス陣地" in self.terrains[target_p].name) and not self.enemy_player.advanced[target_p]:
                                if hasattr(self.terrains[target_p], 'owner') and self.terrains[target_p].owner == self.enemy_player:
                                    def_val += 2
                            if any("伊戦車" in att.name or "イタリア軍戦車隊" in att.name for att in self.enemy_player.attachments.get(target_p, [])): def_val += 1
                            
                            if atk_val >= def_val or "8.8cm" in def_target.name or "高射砲" in def_target.name or "欺瞞" in def_target.name or "ダミー" in def_target.name:
                                evaluated_actions.append(('attack', (p, target_p, False), 500))
                            if any("ベルザリエーリ" in c.name for c in self.current_player.hand) and (atk_val + 1 >= def_val):
                                evaluated_actions.append(('attack', (p, target_p, True), 500))
                else:
                    # ① 真正面の敵への攻撃（平坦：500点）
                    if self.enemy_player.platoons[p]:
                        def_target = self.enemy_player.platoons[p][0]
                        def_val_str = str(def_target.defense).split('-')
                        def_val = int(def_val_str[0])
                        if self.terrains[p] and ("陣地" in self.terrains[p].name or "ボックス陣地" in self.terrains[p].name) and not self.enemy_player.advanced[p]:
                            if hasattr(self.terrains[p], 'owner') and self.terrains[p].owner == self.enemy_player:
                                def_val += 2
                        if any("伊戦車" in att.name or "イタリア軍戦車隊" in att.name for att in self.enemy_player.attachments.get(p, [])): def_val += 1
                        
                        if atk_val >= def_val or "8.8cm" in def_target.name or "高射砲" in def_target.name or "欺瞞" in def_target.name or "ダミー" in def_target.name:
                            evaluated_actions.append(('attack', (p, p, False), 500))
                        if any("ベルザリエーリ" in c.name for c in self.current_player.hand) and (atk_val + 1 >= def_val):
                            evaluated_actions.append(('attack', (p, p, True), 500))

                    # ② 横方向への迎撃
                    has_turret = not any('固定砲塔' in t for tank in atk_tanks for t in tank.traits)
                    if has_turret:
                        for target_p in ['A', 'B', 'C']:
                            if target_p != p and self.enemy_player.platoons[target_p] and self.enemy_player.advanced[target_p]:
                                def_target = self.enemy_player.platoons[target_p][0]
                                def_val_str = str(def_target.defense).split('-')
                                def_val = int(def_val_str[1]) if len(def_val_str) > 1 else int(def_val_str[0])
                                
                                if any("伊戦車" in att.name or "イタリア軍戦車隊" in att.name for att in self.enemy_player.attachments.get(target_p, [])): def_val += 1
                                
                                # 【最優先から次点へ】横撃ちは 4000点
                                if atk_val >= def_val or "8.8cm" in def_target.name or "高射砲" in def_target.name or "欺瞞" in def_target.name or "ダミー" in def_target.name:
                                    evaluated_actions.append(('attack', (p, target_p, False), 4000))
                                if any("ベルザリエーリ" in c.name for c in self.current_player.hand) and (atk_val + 1 >= def_val):
                                    evaluated_actions.append(('attack', (p, target_p, True), 4000))

            if not (attack_count == 1 and is_fox_active):
                for p in platoons_with_real_tanks:
                    if self.terrains[p] and ("陣地" in self.terrains[p].name or "ボックス陣地" in self.terrains[p].name): continue
                    if not self.current_player.advanced[p] and not self.enemy_player.platoons[p]:
                        evaluated_actions.append(('move', p, 500))

                tanks_in_hand = [c for c in self.current_player.hand if c.type == '戦車']
                for p in ['A', 'B', 'C']:
                    for c in tanks_in_hand:
                        score = 500
                        # 【最優先へ変更！】正面押し出し（敵が進入している列への配置）は 5000点
                        if self.enemy_player.advanced[p]:
                            score = 5000
                        evaluated_actions.append(('add_tank', (p, c), score))

                tacticals = [c for c in self.current_player.hand if c.type in ['地形', 'アクション', 'イベント']]
                for c in tacticals:
                    if c.name in ["迂回戦術", "圧倒的物量", "物量", "ベルザリエーリ", "弾幕射撃", "反撃", "4号スペツィアル", "4スペツィアル"]:
                        continue 
                    
                    if "モンティ" in c.name or "チャーチル" in c.name:
                        evaluated_actions.append(('play_tactical', (c, None), 500))
                        continue
                        
                    if "イタリア軍奮闘" in c.name:
                        for col in ['A', 'B', 'C']:
                            if self.enemy_player.platoons[col]:
                                evaluated_actions.append(('play_tactical', (c, col), 500))
                        continue

                    if "鹵獲戦車" in c.name:
                        enemy_tanks = [dc for dc in self.enemy_player.discard_pile if dc.type == '戦車' and dc.is_face_up]
                        if enemy_tanks:
                            for col in ['A', 'B', 'C']:
                                evaluated_actions.append(('play_tactical', (c, col), 500))
                        continue
                        
                    is_trap = any(trap_name in c.name for trap_name in ["8.8cm", "高射砲", "欺瞞", "ダミー"])
                    if is_trap:
                        for col in ['A', 'B', 'C']:
                            if not self.enemy_player.advanced[col]:
                                evaluated_actions.append(('play_tactical', (c, col), 500))
                        continue

                    if c.type == '地形':
                        for col in ['A', 'B', 'C']:
                            if self.terrains[col] is None and not self.current_player.advanced[col] and not self.enemy_player.advanced[col]:
                                if "陣地" in c.name or "ボックス陣地" in c.name:
                                    if not any(tank.type == '戦車' and "欺瞞" not in tank.name and "ダミー" not in tank.name for tank in self.current_player.platoons[col]):
                                        continue
                                evaluated_actions.append(('play_tactical', (c, col), 500))
                        continue

                    if "伊戦車" in c.name or "イタリア軍戦車隊" in c.name:
                        for col in ['A', 'B', 'C']:
                            if self.current_player.platoons[col] and not any("伊戦車" in att.name or "イタリア軍戦車隊" in att.name for att in self.current_player.attachments[col]):
                                evaluated_actions.append(('play_tactical', (c, col), 500))
                        continue

                    if "頼りになるハニー" in c.name:
                        for col in ['A', 'B', 'C']:
                            if any(not t.is_face_up for t in self.enemy_player.platoons[col]):
                                evaluated_actions.append(('play_tactical', (c, col), 500))
                        continue

                    evaluated_actions.append(('play_tactical', (c, None), 500))

                if self.current_player.hand:
                    evaluated_actions.append(('swap', None, 500))

            if not evaluated_actions:
                if attack_count == 1: return 
                self.print_q("AIは何も行動できずターンを終了、または投了しました。")
                self.game_over = True
                self.winner = self.enemy_player
                return

            import random
            max_score = max([act[2] for act in evaluated_actions])
            best_candidates = [act for act in evaluated_actions if act[2] == max_score]
            best_action = random.choice(best_candidates) 
            
            action_type_raw = best_action[0]
            params = best_action[1]
            action_id = action_type_raw
            if action_type_raw == 'play_tactical':
                action_id = f"play_tactical_{params[0].name}_{params[1]}"
            elif action_type_raw == 'add_tank':
                action_id = f"add_tank_{params[0]}"
            elif action_type_raw in ['attack', 'move', 'attack_hq']:
                action_id = f"{action_type_raw}_{params[0] if isinstance(params, tuple) else params}"
                
            try: self.current_player.brain.record_action(state_str, action_id)
            except: pass

            if action_type_raw == 'attack_hq':
                self.print_q(f"AIは司令部への攻撃を選択！ (列{params})")
                self.damage_hq(self.enemy_player, 1 if not self.current_player.advanced.get(params, False) else 2)

            elif action_type_raw == 'attack':
                atk_p, def_p, use_bersa = params
                
                hidden_bersa = []
                if not use_bersa:
                    hidden_bersa = [c for c in self.current_player.hand if "ベルザリエーリ" in c.name]
                    for c in hidden_bersa: self.current_player.hand.remove(c)

                self.print_q(f"AIは攻撃を選択！ (列{atk_p} -> 列{def_p})")
                await self.execute_attack(self.current_player, self.enemy_player, atk_p, def_p)
                
                for c in hidden_bersa: self.current_player.hand.append(c)

            elif action_type_raw == 'move':
                p = params
                self.print_q(f"AIは移動を選択しました！ (列{p})")
                if self.terrains[p]:
                    removed = self.terrains[p]
                    self.terrains[p] = None
                    self.current_player.discard_pile.append(removed)
                    self.print_q(f"地形『{removed.name}』を除去しました。")
                else:
                    self.current_player.advanced[p] = True
                    self.print_q(f"列{p}が敵陣地に進入しました！")

            elif action_type_raw == 'add_tank':
                p, c = params
                self.print_q(f"AIは戦車カードを列{p}に追加しました！")
                c.is_face_up = False
                platoon = self.current_player.platoons[p]
                if "欺瞞" in c.name or "ダミー" in c.name:
                    platoon.insert(0, c)
                else:
                    platoon.append(c)
                self.current_player.hand.remove(c)
                if self.enemy_player.advanced[p]: self.enemy_player.advanced[p] = False

            elif action_type_raw == 'play_tactical':
                c, col = params
                is_trap = any(trap_name in c.name for trap_name in ["8.8cm", "高射砲", "欺瞞", "ダミー"])
                
                if is_trap:
                    self.print_q(f"AIは戦車カードを列{col}に追加しました！")
                    c.is_face_up = False
                    platoon = self.current_player.platoons[col]
                    if "欺瞞" in c.name or "ダミー" in c.name:
                        platoon.insert(0, c)
                    else:
                        if len(platoon) > 0:
                            import random
                            if random.random() < 0.7:
                                platoon.insert(0, c) 
                            else:
                                platoon.insert(random.randint(1, len(platoon)), c)
                        else:
                            platoon.append(c)
                    self.current_player.hand.remove(c)
                elif "チャーチル" in c.name:
                    self.print_q(f"AIはカード【{c.name}】を使用しました！")
                    limit = 1 if any(e.name == "モンティ" for e in self.current_player.active_events) else 2
                    if limit == 1:
                        self.print_q("【モンティ連携】モンティが場にいるため、カードを1枚選びます。")
                    targets = [dc for dc in self.current_player.discard_pile if dc.is_face_up and dc.type not in ['戦車', 'イベント', 'アクシデント'] and "チャーチル" not in dc.name]
                    import random
                    if targets:
                        chosen = random.sample(targets, min(limit, len(targets)))
                        for rec in chosen:
                            self.current_player.discard_pile.remove(rec)
                            self.current_player.headquarters.append(rec)
                        self.print_q(f"AIは捨て札から {len(chosen)} 枚のカードを司令部の一番下に戻しました。")
                    self.current_player.discard_pile.append(c)
                    self.current_player.hand.remove(c)
                else:
                    self.print_q(f"AIはカード【{c.name}】を使用しました！")
                    if c.type == '地形':
                        c.owner = self.current_player # ★追加
                        self.terrains[col] = c
                        self.current_player.hand.remove(c)
                    elif c.type == 'イベント':
                        for p_target in [self.current_player, self.enemy_player]:
                            while p_target.active_events:
                                old_ev = p_target.active_events.pop(0)
                                self.print_q(f"  -> 古いイベント/アクシデント『{old_ev.name}』はゲームから完全に除外されました。")
                        self.current_player.active_events.append(c)
                        
                        if c.name == "モンティ":
                            targets = [dc for dc in self.current_player.discard_pile if dc.is_face_up and dc.type not in ['イベント', 'アクシデント']]
                            import random
                            if targets:
                                chosen = random.sample(targets, min(3, len(targets)))
                                for rec in chosen:
                                    self.current_player.discard_pile.remove(rec)
                                    self.current_player.headquarters.append(rec)
                                self.print_q(f"AIは捨て札から {len(chosen)} 枚のカードを司令部に戻しました。")
                                random.shuffle(self.current_player.headquarters)
                                self.print_q("AIは司令部をシャッフルしました。")
                        self.current_player.hand.remove(c)
                    elif "伊戦車" in c.name or "イタリア軍戦車隊" in c.name:
                        self.current_player.attachments[col].append(c)
                        self.print_q(f"AIは列{col}に【{c.name}】を装備しました！")
                        self.current_player.hand.remove(c)
                    elif "イタリア軍奮闘" in c.name:
                        val = col 
                        if any("慢性的補給不足" in e.name for e in self.current_player.active_events):
                            hidden_tanks = [t for t in self.enemy_player.platoons[val] if not t.is_face_up]
                            if hidden_tanks:
                                import random
                                target = random.choice(hidden_tanks)
                                target.is_face_up = True
                                self.print_q(f"【イタリア軍奮闘】敵の {target.name} を表向きにしました！")
                                if "8.8cm" in target.name or "高射砲" in target.name or "欺瞞" in target.name or "ダミー" in target.name:
                                    self.print_q(f"【罠消滅】罠だと看破されたため、直ちに廃棄されました！")
                                    self.enemy_player.platoons[val].remove(target)
                                    self.enemy_player.discard_pile.append(target)
                        else:
                            visible_tanks = [t for t in self.enemy_player.platoons[val] if t.is_face_up]
                            if visible_tanks:
                                best_t = None
                                max_val = -1
                                for t in visible_tanks:
                                    v = int(t.attack) + int(str(t.defense).split('-')[0])
                                    if v > max_val: 
                                        max_val = v
                                        best_t = t
                                target = best_t
                            else:
                                import random
                                target = random.choice(self.enemy_player.platoons[val])
                                
                            self.enemy_player.platoons[val].remove(target)
                            target.is_face_up = True
                            self.enemy_player.discard_pile.append(target)
                            self.print_q(f"【イタリア軍奮闘】AIは敵の列{val}の脅威である {target.name} を破壊しました！")
                            
                            if not self.enemy_player.platoons[val]:
                                self.enemy_player.advanced[val] = False
                                if self.terrains[val] and ("陣地" in self.terrains[val].name or "ボックス陣地" in self.terrains[val].name):
                                    removed_fort = self.terrains[val]
                                    self.terrains[val] = None
                                    self.enemy_player.discard_pile.append(removed_fort)
                                    self.print_q("【ボックス陣地】守備隊が全滅したため、陣地も破棄されました！")
                                await self.check_and_emergency_deploy(self.enemy_player, val)
                        self.current_player.discard_pile.append(c)
                        self.current_player.hand.remove(c)
                    elif "頼りになるハニー" in c.name:
                        val = col
                        hidden_tanks = [t for t in self.enemy_player.platoons[val] if not t.is_face_up]
                        import random
                        target = random.choice(hidden_tanks)
                        target.is_face_up = True
                        self.print_q(f"【偵察成功】列{val}の戦車の正体は『{target.name}』でした！")
                        if "8.8cm" in target.name or "高射砲" in target.name or "欺瞞" in target.name or "ダミー" in target.name:
                            self.print_q(f"【罠除去】罠だと看破されたため、即座に除去されました！")
                            self.enemy_player.platoons[val].remove(target)
                            self.enemy_player.discard_pile.append(target)
                        
                        stuart_cards = [s for s in self.current_player.hand if "スチュアート" in s.name or "Stuart" in s.name or "St" in s.name]
                        if stuart_cards:
                            discard_target = stuart_cards[0]
                            self.current_player.hand.remove(discard_target)
                            self.current_player.discard_pile.append(discard_target)
                            self.print_q(f"【追加効果】手札の『{discard_target.name}』を捨てて1枚ドロー！")
                            if self.current_player.headquarters:
                                self.current_player.hand.append(self.current_player.headquarters.pop(0))
                        self.current_player.discard_pile.append(c)
                        self.current_player.hand.remove(c)
                    elif "砂漠の狐" in c.name or "ロンメル" in c.name:
                        self.print_q("【砂漠の狐】AIが全戦車部隊の再配置を行います！")
                        advanced_memory = {p: self.current_player.advanced[p] for p in ['A', 'B', 'C']}
                        temp_pool = []
                        for p in ['A', 'B', 'C']:
                            temp_pool.extend(self.current_player.platoons[p])
                            self.current_player.platoons[p] = []
                        
                        import random
                        random.shuffle(temp_pool)
                        
                        for _ in range(2):
                            for p in ['A', 'B', 'C']:
                                if temp_pool and len(self.current_player.platoons[p]) < 2:
                                    self.current_player.platoons[p].append(temp_pool.pop(0))
                                    
                        while temp_pool:
                            best_p = 'A'
                            max_e = -1
                            for p in ['A', 'B', 'C']:
                                e_count = len(self.enemy_player.platoons[p])
                                if e_count > max_e:
                                    max_e = e_count
                                    best_p = p
                                elif e_count == max_e:
                                    best_p = random.choice([best_p, p])
                            self.current_player.platoons[best_p].append(temp_pool.pop(0))
                            
                        for p in ['A', 'B', 'C']:
                            if self.current_player.platoons[p]:
                                if advanced_memory[p]: self.current_player.advanced[p] = True
                                if self.enemy_player.advanced[p]:
                                    self.enemy_player.advanced[p] = False
                                    self.print_q(f"【押し返し】列{p}に部隊が再配置されたため、敵の進入状態が解除されました！")
                            else:
                                self.current_player.advanced[p] = False
                                
                        for p_target in [self.current_player, self.enemy_player]:
                            while p_target.active_events:
                                old_ev = p_target.active_events.pop(0)
                                self.print_q(f"  -> 古いイベント/アクシデント『{old_ev.name}』はゲームから完全に除外されました。")
                        self.current_player.active_events.append(c)
                        self.current_player.hand.remove(c)
                    elif "鹵獲戦車" in c.name:
                        enemy_tanks = [dc for dc in self.enemy_player.discard_pile if dc.type == '戦車' and dc.is_face_up]
                        if enemy_tanks:
                            best_tank = max(enemy_tanks, key=lambda t: int(t.attack) + int(str(t.defense).split('-')[0]))
                            self.enemy_player.discard_pile.remove(best_tank)
                            best_tank.is_face_up = False
                            
                            platoon = self.current_player.platoons[col]
                            if len(platoon) == 0:
                                platoon.append(best_tank)
                            else:
                                front_tank = platoon[0]
                                cap_val = int(best_tank.attack) + int(str(best_tank.defense).split('-')[0])
                                front_val = int(front_tank.attack) + int(str(front_tank.defense).split('-')[0])
                                if cap_val > front_val:
                                    platoon.insert(0, best_tank)
                                else:
                                    platoon.append(best_tank)
                                    
                            self.print_q(f"【鹵獲戦車】AIは敵の捨て札から最大の脅威『{best_tank.name}』を奪い、列{col}に配備しました！")
                        self.current_player.discard_pile.append(c)
                        self.current_player.hand.remove(c)
                    else:
                        import game_effects 
                        await game_effects.GameEffects.play_tactical_card(self.current_player, self.enemy_player, c, col, self)
                        if c in self.current_player.hand: self.current_player.hand.remove(c)

            elif action_type_raw == 'swap':
                self.print_q("AIは手札を交換しました！")
                c = self.current_player.hand.pop(0)
                self.current_player.headquarters.append(c)
                if self.current_player.headquarters:
                    self.current_player.hand.append(self.current_player.headquarters.pop(0))
            
            if action_type_raw in ['attack', 'attack_hq'] and not self.training_mode:
                await self.safe_input_method("\n【AIの攻撃結果を確認したら Enter を押してください...】")

            if action_type_raw in ['attack', 'attack_hq']:
                if attack_count == 0 and is_fox_active:
                    attack_count += 1
                    self.print_q("\n【砂漠の狐】AIが連続攻撃を仕掛けてきます！")
                    continue
            return

    # ==========================================
    # ゲーム進行制御
    # ==========================================
    async def start_game(self):
        self.print_q("\n作戦準備を開始します……")
        await self.build_deck(self.player1)
        
        self.print_q("\n続いて敵軍(AI)の配備を行います……")
        await self.build_deck(self.player2)
        
        self.print_q("\n両軍のデッキ配備が完了しました。")
        
        try:
            import js
            dashboard = js.document.getElementById("fixed-dashboard")
            if dashboard: dashboard.innerText = "実戦フェイズ：初期配置"
        except: pass

        await self.setup_initial_board(self.player1)
        await self.setup_initial_board(self.player2)
        if self.player1.brain: self.player1.brain.record_deck(list(self.player1.headquarters) + list(self.player1.hand))
        if self.player2.brain: self.player2.brain.record_deck(list(self.player2.headquarters) + list(self.player2.hand))
        
        self.print_q("\n★★★ 戦闘開始！ ★★★")
        await self.play()

# ==========================================
# ゲーム起動用のメイン関数
# ==========================================////////////////////////////////////////////////
# ==========================================
# ゲーム起動用のメイン関数（終了・完了時に自動でリロードしてトップに戻る）
# ==========================================
async def async_main():
    import js
    while True:
        try:
            print("\n" + "="*50)
            print("【作戦システム起動（アフリカ戦線専用）】")
            print("="*50)
            
            print("\n【メニュー】")
            print("1: プレイヤー vs AI (コンピュータ)")
            print("0: 終了して『西部/アフリカ』選択に戻る")
            
            mode_choice = (await safe_input("形式を選んでください: ")).strip()
            
            # 0 を選んだらブラウザをリロードして大元のトップ（戦線選択）に戻る
            if mode_choice == '0':
                print("\n戦線選択画面に戻ります。リロード中...")
                js.window.location.href = "../index.html"
                return 

            is_auto_training = (mode_choice == "trainai")
            is_test_ai = (mode_choice == "testai")
            csv_file = "cards_africa.csv"
            campaign_prefix = "africa"
            df = pd.read_csv(csv_file, encoding='utf-8-sig')
            
            if is_auto_training:
                num_val = await safe_input("対戦回数を入力 (例: 10, 100): ")
                if not num_val.isdigit():
                    continue
                num_battles = int(num_val)
                p1_wins, p2_wins, draws = 0, 0, 0
                for i in range(num_battles):
                    game = Game(df=df, p1_f="ドイツ軍", p2_f="連合軍", campaign_prefix=campaign_prefix, p1_ai=True, p2_ai=True, quiet=True, training=True)
                    await game.start_game()
                    if game.winner == "Draw":
                        draws += 1
                        r1, r2 = 0.3, 0.3
                    elif game.winner == game.player1:
                        p1_wins += 1
                        r1, r2 = 1.0, -1.0
                    else:
                        p2_wins += 1
                        r1, r2 = -1.0, 1.0
                    if game.player1.brain: await game.player1.brain.learn(r1)
                    if game.player2.brain: await game.player2.brain.learn(r2)
                print(f"\n【学習結果】ドイツ:{p1_wins}勝 / 連合:{p2_wins}勝 / 引分:{draws}")
            else:
                p1_ai, p2_ai = False, False
                if is_test_ai:
                    p1_faction, p2_faction, p1_ai, p2_ai = "ドイツ軍", "連合軍", True, True
                else:
                    choice = await safe_input("陣営選択 (1: ドイツ / 2: 連合): ")
                    if choice == '1': p1_faction, p2_faction, p2_ai = "ドイツ軍", "連合軍", True
                    else: p1_faction, p2_faction, p1_ai = "連合軍", "ドイツ軍", True
                game = Game(df=df, p1_f=p1_faction, p2_f=p2_faction, campaign_prefix=campaign_prefix, p1_ai=p1_ai, p2_ai=p2_ai)
                await game.start_game()

            # 対戦や学習の全工程が終了したら、確認後にリロードしてトップに戻る
            print("\n" + "!"*50)
            print("【全行程が終了】戦線選択（トップ）に戻ります。")
            print("!"*50)
            await safe_input("Enterを押すとページをリロードして最初に戻ります...")
            js.window.location.href = "../index.html"
            return

        except Exception as e:
            print(f"\n【通知】システムをリセットします: {e}")
            await asyncio.sleep(2)
            js.window.location.href = "../index.html"
            return

def main():
    import asyncio
    import js
    js.window._game_task = asyncio.create_task(async_main())

if __name__ == "__main__":
    main()