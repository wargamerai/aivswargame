import pandas as pd
import random
import time
import unicodedata
import os
import sys
import traceback
import asyncio

import re

# ---------------------------------------------
# 【表示の配線】
# ---------------------------------------------
import builtins

if not hasattr(builtins, "_real_print"):
    builtins._real_print = builtins.print

_menu_lines = []
_last_menu = ("", [])

def print(*args, **kwargs):
    builtins._real_print(*args, **kwargs)
    try:
        import js
    except ImportError:
        return
    for line in " ".join(map(str, args)).splitlines():
        line = line.strip()
        if not line or all(c in "=!- " for c in line):
            continue
        _menu_lines.append(line)
        if re.match(r"-?\d+[：:]", line):
            continue
        node = js.document.createElement("div")
        node.textContent = line
        log = js.document.getElementById("output-area")
        if log is not None:
            log.appendChild(node)
            log.parentElement.scrollTop = log.parentElement.scrollHeight

def menu_options(lines, prompt):
    options = {}
    for line in [*lines, prompt]:
        numbered = re.fullmatch(r"(-?\d+)[：:]\s*(.+)", line)
        position = re.fullmatch(r"(\d+)番目\s*\((.+)\)", line)
        if numbered and not re.search(r" / \d+:", line):
            options[numbered[1]] = numbered[2]
        if position:
            options[position[1]] = position[2]
        for group in re.findall(r"\(([^()]*)\)", line):
            for piece in group.split(" / "):
                item = re.fullmatch(r"\s*(-?\d+):\s*(.+)", piece)
                if item:
                    options[item[1]] = item[2]
    return list(options.items())

async def safe_input(prompt_text="", choices=None, multiple=False, view=""):
    import js
    import json
    panel = js.document.getElementById("choice-panel")
    global _last_menu
    if choices is None:
        choices = menu_options(_menu_lines, prompt_text)
        if not choices and _last_menu[0] == prompt_text:
            choices = _last_menu[1]
    _menu_lines.clear()
    if "Enter" in prompt_text:
        choices = [("", "次へ")]
    _last_menu = (prompt_text, choices)
    prompt = re.sub(r"\([^()]*\d+[:：][^()]*\)", "", prompt_text).strip(" \n>:：")
    if not prompt or prompt in ("入力", "番号を入力", "番号を入力してください"):
        prompt = "選択してください"
    panel.dataset.view = view
    try:
        return str(await js.pwChoose(prompt, json.dumps(choices, ensure_ascii=False), multiple))
    finally:
        _menu_lines.clear()


_BEST_DECKS = None

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
        self.terrain_mover = {'A': None, 'B': None, 'C': None}   # 地形を取り除こうとしている陣営（同じ小隊が2回移動で除去 8.1(1)）
        self.turn_no = 0
        self.battle = None

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
        if random.choice([True, False]):
            self.current_player = self.player1; self.enemy_player = self.player2
        else:
            self.current_player = self.player2; self.enemy_player = self.player1
        if not self.quiet:
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
                    
            import js
            from html import escape

            deck_display_list = list(in_deck_cards)
            cards_html = "".join(self.card_html(card) for card in deck if card not in events)
            dashboard = js.document.getElementById("fixed-dashboard")
            dashboard.innerHTML = (
                f"<div class='deck-board'><h2>{escape(player.faction)}</h2>"
                f"<div class='budget'><strong>{current_cost} / 30</strong>"
                f"<progress max='30' value='{current_cost}'></progress></div>"
                f"<p>戦車 {sum(card.type == '戦車' for card in deck)} / 最低3枚"
                f" · イベント等 {len(events)}枚</p>"
                f"<div class='cards'>{cards_html}</div></div>"
            )

            tank_count = len([c for c in deck if c.type == '戦車'])
            print(f"総枚数: {len(deck)}枚 (戦車: {tank_count}枚 / イベント: {len(events)}枚確定済)")
            
            print("\n[追加可能なカード]")
            display_list = []
            idx = 1
            for key, cards in available_cards.items():
                name, ctype, cost = key
                display_list.append((key, cards))
                idx += 1
                
            choices = [
                (str(i), f"{name}｜{ctype}｜コスト {cost}｜残り {len(cards)}")
                for i, ((name, ctype, cost), cards) in enumerate(display_list, 1)
                if current_cost + cost <= 30
            ]
            choices += [
                (str(-i), f"{name} を外す")
                for i, (name, ctype, cost) in enumerate(deck_display_list, 1)
            ]
            if tank_count >= 3:
                choices.append(("99", "デッキを確定"))
            choice = await safe_input(f"デッキ構築 · {player.faction}", choices, view="deck")
            
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

    def load_best_decks(self):
        """前もって探しておいた強いデッキ（decks_west.json）を読む"""
        global _BEST_DECKS
        if _BEST_DECKS is None:
            _BEST_DECKS = {}
            import json
            for path in ['decks_west.json', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'decks_west.json')]:
                try:
                    with open(path, encoding='utf-8') as f: _BEST_DECKS = json.load(f); break
                except Exception: pass
        return _BEST_DECKS

    def build_deck_auto(self, player, all_cards):
        best = self.load_best_decks().get(player.faction) if (player.is_ai and not self.training_mode) else None
        if best:
            top = best[:6]
            pick = random.choices(top, weights=[max(0.05, d['win']) for d in top])[0]
            self.print_q(f"【AI構築】AIは、前もって探しておいた強いデッキの1つを使います（試験での勝率 {round(pick['win'] * 100)}%）。")
            return self.build_deck_from_ids(player, pick['ids'])
        pool = [Card(row) for _, row in all_cards.iterrows() if row['Faction'] == player.faction or row['Faction'] == player.faction.replace("軍", "")]
        events = [c for c in pool if c.type in ['イベント', 'アクシデント']]
        non_events = [c for c in pool if c.type not in ['イベント', 'アクシデント']]
        
        # 陣営によって選ぶテーマを完全に分離！
        if player.faction == "ドイツ軍":
            themes = ["重装甲大隊", "機動戦術"]
        else:
            themes = ["物量と陣地"]
            
        chosen_theme = random.choice(themes) 
        card_scores = []
        for c in non_events:
            score = random.randint(1, 10)
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
                    choice = await safe_input(f"小隊 {p} の戦車を選ぶ")
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
        self.print_q(f"\n【小隊全滅】{player.faction}の小隊{p}が全滅し、陣地が空きました！（自分の手番に、手札の戦車をここへ出せます 7.5(1)）")
        player.advanced[p] = False

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

    # ---- 戦場の表示（カード風の HTML）----
    TRAIT_ICON = {'重戦車': ('重', 't-heavy'), '長射程': ('長', 't-long'), '傾斜装甲': ('傾', 't-slope'), '高機動': ('機', 't-mob'), '固定砲塔': ('固', 't-fixed')}

    def card_html(self, card, hidden=False, num=None, small=False):
        import html as _h
        if hidden:
            return "<div class='pc back'><div class='bk'>?</div></div>"
        ty = card.type
        tcls = {'戦車': 'tank', 'アクション': 'act', 'リアクション': 'react', '地形': 'terr', 'イベント': 'evt', 'アクシデント': 'evt'}.get(ty, 'other')
        fac = 'de' if 'ドイツ' in str(card.faction) else 'us'
        is_tank = ty == '戦車' and "欺瞞" not in card.name and "ダミー" not in card.name
        nm = _h.escape(card.short_name if (is_tank and not num) else card.name)
        icons = ""
        if ty == '戦車':
            for t in card.traits:
                t = t.strip()
                if t in self.TRAIT_ICON:
                    ch, cl = self.TRAIT_ICON[t]
                    icons += f"<span class='ti {cl}' title='{t}'>{ch}</span>"
        desc = _h.escape(" / ".join([t for t in card.traits if t not in self.TRAIT_ICON]), quote=True)
        stats = f"<div class='st'><span class='atk'>{card.attack}</span><span class='def'>{_h.escape(card.defense)}</span></div>" if is_tank else f"<div class='ty'>{ty}</div>"
        face = "" if card.is_face_up else "<span class='fd' title='裏向き'>裏</span>"
        photo = {"6号": "tiger.jpg", "M4/Jumnbo": "sherman.jpg"}.get(card.name)
        art = f"<img class='card-photo' src='{photo}' alt=''>" if photo else ""
        cost = f"<span class='cost'>{card.cost}</span>" if num is not None else ""
        return (f"<div class='pc {tcls} {fac}{' down' if not card.is_face_up else ''}' title='{_h.escape(card.name)}{(chr(10) + desc) if desc else ''}'>"
                f"{cost}{art}<div class='nm'>{nm}</div>{stats}<div class='ic'>{icons}{face}</div></div>")

    def platoon_html(self, player, col, hide, foe=False):
        import html as _h
        cards = player.platoons[col]
        badges = ""
        if player.advanced[col]: badges += "<span class='bd adv'>敵陣地に進入</span>"
        for a in player.attachments[col]: badges += f"<span class='bd att' title='{_h.escape(' / '.join(a.traits), quote=True)}'>{_h.escape(a.name)}</span>"
        t = self.terrains[col]
        if t and ("陣地" in t.name) and not player.advanced[col] and getattr(t, 'owner', None) == player:
            badges += "<span class='bd nofire'>射撃不可</span>"
        body = "".join(self.card_html(c, hidden=(hide and not c.is_face_up)) for c in cards) or "<div class='empty'>（空）</div>"
        return f"<div class='plt {'foe' if foe else 'me'}'><div class='ph'><b>{'敵 ' if foe else ''}小隊{col}</b><span class='cnt'>{len(cards)}両</span>{badges}</div><div class='cards'>{body}</div></div>"

    def side_html(self, player, hand_count=True, top=True):
        import html as _h
        hq = len(player.headquarters)
        fac = 'de' if 'ドイツ' in player.faction else 'us'
        ev = "".join(f"<span class='evc' title='{_h.escape(' / '.join(e.traits), quote=True)}'>{_h.escape(e.name)}</span>" for e in player.active_events)
        hand = f"　手札 {len(player.hand)}" if hand_count else ""
        bar = "".join("<i class='on'></i>" if i < hq else "<i></i>" for i in range(max(hq, 10)))
        return (f"<div class='side {fac}'><span class='fn'>{_h.escape(player.faction)}{'（AI）' if player.is_ai else '（あなた）'}</span>"
                f"<span class='hq' title='司令部の残り'>司令部 <b>{hq}</b> <span class='hqbar'>{bar}</span></span>"
                f"<span class='sub'>捨て札 {len(player.discard_pile)}{hand}</span>{ev}</div>")

    def show_battlefield(self):
        if self.quiet or self.training_mode: return
        import html as _h
        top_player = self.player2; bottom_player = self.player1
        active = _h.escape(self.current_player.faction)
        h = f"<div class='pw'><div class='turn-strip'><b>ターン {self.turn_no}</b><span>{active}の手番</span></div>"
        if self.battle:
            origin, target_col, target, attack, defense = self.battle
            outcome = "交戦中" if defense is None else ("撃破" if attack >= defense else "撃破できず")
            stats = "" if defense is None else f"<strong>攻 {attack}</strong><strong>防 {defense}</strong>"
            h += (
                f"<div class='engagement'><span>小隊 {origin} → {target_col} · {_h.escape(target)}</span>"
                f"{stats}<b>{outcome}</b></div>"
            )
        h += self.side_html(top_player, True, True)
        h += "<div class='field'>"
        for col in ['A', 'B', 'C']:
            engaged = " engaged" if self.battle and col in self.battle[:2] else ""
            h += f"<div class='lane{engaged}' data-column='{col}'>"
            h += self.platoon_html(top_player, col, hide=top_player.is_ai, foe=True)
            t = self.terrains[col]
            tn = "平地"; tcls = "plain"; tt = ""
            if t:
                tn = t.name; tcls = "has"; tt = _h.escape(" / ".join(t.traits), quote=True)
                if t.name in ['深雪', '森林'] and self.terrain_progress[col] > 0: tn += f"（除去 {self.terrain_progress[col]}/2）"
            m_top = self.get_column_mods(top_player, col).strip(); m_bot = self.get_column_mods(bottom_player, col).strip()
            h += (f"<div class='terrain {tcls}' title='{tt}'><span class='mod'>{m_top}</span>"
                  f"<span class='tn'>{_h.escape(tn)}</span><span class='mod'>{m_bot}</span></div>")
            h += self.platoon_html(bottom_player, col, hide=bottom_player.is_ai)
            h += "</div>"
        h += "</div>"
        h += self.side_html(bottom_player, False, False)
        if not bottom_player.is_ai:
            h += "<div class='handh'>あなたの手札</div><div class='hand'>"
            if not bottom_player.hand: h += "<div class='empty'>なし</div>"
            for i, c in enumerate(bottom_player.hand):
                h += self.card_html(c, num=i + 1)
            h += "</div>"
        h += "</div>"
        try:
            import js
            dashboard = js.document.getElementById("fixed-dashboard")
            if dashboard: dashboard.innerHTML = h
        except: pass

    def damage_hq(self, target_player, amount, is_special_effect=False):
        for _ in range(amount):
            if len(target_player.headquarters) > 0:
                card = target_player.headquarters.pop(0)
                card.is_face_up = False
                target_player.discard_pile.append(card)
                self.print_q(f"司令部のカードが1枚削られました！(残り: {len(target_player.headquarters)}枚)")
            else:
                if is_special_effect:
                    # ルール10.0(2): デッキが0枚の状態で「司令部からカードを捨て札にする」効果が発動したら、その対象のプレイヤーの敗北
                    self.print_q(f"\n★★★ 決着！ 司令部が0枚の {target_player.faction} に、司令部を捨て札にする効果が発動しました。{target_player.faction} の敗北です！ ★★★")
                    self.game_over = True
                    self.winner = self.other(target_player)
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

    async def action_swap_card(self, player):
        """手札を1枚デッキの下に戻し、1枚引く"""
        if not player.hand:
            print("\n手札がありません。")
            return False
        if not player.headquarters:
            print("\nデッキにカードがありません。")
            return False
        print("\n--- 手札交換 ---")
        print("デッキの下に戻すカードを選んでください:")
        for i, c in enumerate(player.hand):
            if c.type == '戦車':
                print(f"  {i+1}: [{c.type}] {c.name} (攻{c.attack}/防{c.defense})")
            else:
                print(f"  {i+1}: [{c.type}] {c.name}")
        choice = await safe_input("\n> 番号を入力 (99: 戻る): ")
        if choice == '99': return False
        try:
            idx = int(choice) - 1
            if idx < 0 or idx >= len(player.hand): print("無効な番号です。"); return False
        except ValueError: print("無効な入力です。"); return False
        returned_card = player.hand.pop(idx)
        player.headquarters.append(returned_card)
        drawn_card = player.headquarters.pop(0)
        if drawn_card.type == 'アクシデント':
            self.print_q(f"\n【アクシデント発生！】『{drawn_card.name}』が発生！")
            for p_target in [player, self.enemy_player if player == self.current_player else self.current_player]:
                while p_target.active_events:
                    old_ev = p_target.active_events.pop(0)
                    self.print_q(f"  -> 古いイベント/アクシデント『{old_ev.name}』は押し出され、除外されました。")
            player.active_events.append(drawn_card)
            print(f"\n『{returned_card.name}』をデッキに戻しましたが、アクシデント『{drawn_card.name}』を引きました！")
        else:
            player.hand.append(drawn_card)
            print(f"\n『{returned_card.name}』をデッキに戻し、新しいカードを引きました。")
        return True

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
            self.turn_no = turn_count
            self.battle = None
            self.print_q(f"\n\n↓↓↓↓↓ 【{self.current_player.faction}】のターンです ↓↓↓↓↓")
            if self.current_player.is_ai: await self.ai_take_turn() 
            else: await self.take_turn()    
            if self.game_over: break
            
            do_refill = True
            if not self.current_player.is_ai and not self.training_mode and not self.quiet and len(self.current_player.hand) < 4 and self.current_player.headquarters:
                self.show_battlefield()
                ans = (await safe_input(f"\n手札を4枚まで補充しますか？（今の手札 {len(self.current_player.hand)}枚・司令部 {len(self.current_player.headquarters)}枚） (1: 補充する / 99: しない): ")).strip()
                do_refill = (ans != '99')
            while do_refill and len(self.current_player.hand) < 4 and len(self.current_player.headquarters) > 0:
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
            if not self.training_mode and not self.quiet:
                self.show_battlefield()
                await safe_input("ターン終了", [("", "次の手番")])
            self.current_player, self.enemy_player = self.enemy_player, self.current_player

        if turn_count >= 150: self.winner = "Draw"
        return self.winner

    async def take_turn(self):
        combo = None   # パットン第3軍の能力1で、続けて行える行動
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
                
            print("8: 自分の捨て札を見る")
            print("9: 敵の捨て札を見る")
            
            # パットン第3軍の終了メニュー（連合軍で、かつ発動中のみ表示）
            if combo is not None:
                print("0: パットン第3軍の続けての行動をやめて、手番を終える")
                
            print("99: 終了する（引き分けにしてゲームを終える）")
            
            success = False
            try:
                choice = await safe_input("行動を選ぶ")
                if combo is not None and choice not in combo + ['0', '8', '9', '99']:
                    print(f"\n【パットン第3軍】今は{'戦車の配置（5）' if combo == ['5'] else '射撃（1 または 3）'}だけ行えます。終える場合は 0 を選んでください。")
                    continue

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
                    if combo is not None:
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
                if not success: continue
                if self.game_over: return True
                if combo is None and choice in ['1', '3', '5'] and self.patton_multi(self.current_player):
                    combo = ['5'] if choice in ['1', '3'] else ['1', '3']
                    label = '戦車の配置（5）' if combo == ['5'] else '射撃（1 または 3）'
                    self.show_battlefield()
                    ans = (await safe_input(f"\n【パットン第3軍】続けて{label}も行えます。行いますか？ (1: はい / 99: いいえ): ")).strip()
                    if ans == '1': continue
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

    async def action_attack(self, attacker, defender, preset_p=None):
        if preset_p: p = preset_p
        else:
            print("\n攻撃を指示する自軍の小隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
            val = (await safe_input("番号を入力: ")).strip()
            p = {'1': 'A', '2': 'B', '3': 'C'}.get(val)
            if p is None: return False

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
                # ルール7.1※: 敵陣地に進入した戦車は、自陣地に進入している敵戦車を攻撃できない
                valid_targets = [col for col in ['A', 'B', 'C'] if col != p and defender.platoons[col] and not defender.advanced[col]]
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

    # ---- ルール処理の補助 ----
    def other(self, player):
        return self.player1 if player == self.player2 else self.player2

    def same_side(self, card, player):
        return card.faction == player.faction or card.faction == player.faction.replace("軍", "")

    def fog_on(self):
        return any(e.name == 'アルデンヌの霧' for pl in (self.player1, self.player2) for e in pl.active_events)

    def patton_multi(self, player):
        # パットン第3軍 能力1: 出した次の手番から、複数の小隊への配置・配置と射撃の同時実行ができる
        return player.faction == '連合軍' and any(e.name == 'パットン第3軍' and getattr(e, 'played_turn', 10 ** 9) < self.turn_no for e in player.active_events)

    def tiger_blocked(self, player, p):
        return any(att.name == 'ティーガーショック' for att in player.attachments[p]) and len(player.platoons[p]) < 3

    def can_advance(self, player, enemy, p):
        # ルール7.2: 地形がなく、正面に敵小隊がいない時だけ
        return bool(player.platoons[p]) and not player.advanced[p] and not enemy.platoons[p] and not self.terrains[p] and not self.tiger_blocked(player, p)

    def discard_attachments_on_advance(self, player, p):
        # ルール7.2: 敵陣地へ進入した小隊の戦車以外のカードは捨て札
        for att in list(player.attachments[p]):
            player.attachments[p].remove(att)
            (player if self.same_side(att, player) else self.other(player)).discard_pile.append(att)
            self.print_q(f"【付与解除】敵陣地へ進入したため、『{att.name}』は捨て札になりました。")

    def do_advance(self, attacker, defender, p):
        attacker.advanced[p] = True
        for card in attacker.platoons[p]: card.is_face_up = True
        self.print_q(f"\n小隊{p}が敵陣地へ進入しました！")
        self.discard_attachments_on_advance(attacker, p)
        if len(defender.headquarters) == 0:
            self.print_q("\n★★★ 決着！ 山札0の状態で陣地侵入を許しました！ ★★★")
            self.game_over = True; self.winner = attacker

    async def platoon_lost_cleanup(self, player, col):
        # 小隊の戦車が全てなくなった時の後始末（付与カード・パイパー戦闘団・バストーニュ/サン・ヴィット）
        player.advanced[col] = False
        if self.terrain_mover.get(col) == player.faction: self.terrain_progress[col] = 0; self.terrain_mover[col] = None
        await self.handle_platoon_annihilation(player, col)
        for att in list(player.attachments[col]):
            player.attachments[col].remove(att)
            mine = self.same_side(att, player)
            (player if mine else self.other(player)).discard_pile.append(att)
            self.print_q(f"【付与解除】小隊{col}の戦車がなくなったため、『{att.name}』は捨て札になりました。")
            if att.name == 'パイパー戦闘団' and mine:
                self.print_q("【パイパー戦闘団】小隊の戦車が全てなくなったため、自分の司令部のカードを1枚捨て札にします！")
                self.damage_hq(player, 1, is_special_effect=True)
        t = self.terrains[col]
        if t and t.name in ['バストーニュ', 'サン・ヴィット'] and getattr(t, 'owner', None) == player:
            self.terrains[col] = None
            player.discard_pile.append(t)
            self.print_q(f"【地形解除】小隊{col}が全滅したため、地形『{t.name}』は捨て札になりました。")

    async def greif_check(self, deployer, cards):
        # クライフ作戦 能力1: アメリカ軍が戦車を配置した時、そのうちの1枚をドイツ軍が選び、表向きにしてドイツ軍が指定した(アメリカ軍の)小隊に移動させる
        german = self.other(deployer)
        if deployer.faction != '連合軍' or not any(e.name == 'クライフ作戦' for e in german.active_events): return
        cands = [(c, col) for c in cards for col in ['A', 'B', 'C'] if c in deployer.platoons[col]]
        if not cands: return
        def dests(col): return [d for d in ['A', 'B', 'C'] if d != col and not german.advanced[d]]
        pick = None
        if german.is_ai or self.training_mode:
            c, col = max(cands, key=lambda x: int(x[0].attack))
            ds = dests(col)
            if ds: pick = (c, col, random.choice(ds))
        else:
            print("\n【クライフ作戦 能力1】アメリカ軍が戦車を配置しました。そのうち1枚を選び、表向きにして、アメリカ軍の別の小隊へ移動させます。")
            for i, (c, col) in enumerate(cands): print(f"{i + 1}: 小隊{col}の {c.name} (攻{c.attack}/防{c.defense})")
            while True:
                ans = (await safe_input("移動させる戦車の番号 (99: 使わない): ")).strip()
                if ans == '99': return
                if ans.isdigit() and 0 <= int(ans) - 1 < len(cands): break
            c, col = cands[int(ans) - 1]
            ds = dests(col)
            if not ds: print("移動させられる小隊がありません。"); return
            while True:
                d = (await safe_input("移動先の小隊", [(col, f"小隊 {col}") for col in ds])).strip().upper()
                if d in ds: break
            pick = (c, col, d)
        if not pick: return
        c, col, d = pick
        deployer.platoons[col].remove(c)
        c.is_face_up = True
        deployer.platoons[d].append(c)
        self.print_q(f"【クライフ作戦】ドイツ軍は、アメリカ軍の小隊{col}に配置された『{c.name}』を表向きにして、小隊{d}へ移動させました！")
        if not deployer.platoons[col]: deployer.advanced[col] = False

    async def execute_attack(self, attacker, defender, atk_p, def_p):
        for card in attacker.platoons[atk_p]: card.is_face_up = True
        # ルール7.1: 攻撃する敵小隊に裏返しのカードがある場合、直ちに全てのカードを表面にする
        for card in defender.platoons[def_p]: card.is_face_up = True

        atk_dummies = [c for c in attacker.platoons[atk_p] if "欺瞞" in c.name or "ダミー" in c.name]
        for d in atk_dummies:
            self.print_q(f"【罠消滅】攻撃側の『{d.name}』は正体を現し、直ちに廃棄されました！")
            attacker.platoons[atk_p].remove(d); attacker.discard_pile.append(d)
        dummies = [c for c in defender.platoons[def_p] if ("欺瞞" in c.name or "ダミー" in c.name) and c.is_face_up]
        for d in dummies:
            self.print_q(f"【ダミー消滅】防御側の『{d.name}』は正体を現し、直ちに廃棄されました！")
            defender.platoons[def_p].remove(d); defender.discard_pile.append(d)
        if not defender.platoons[def_p]:
            self.print_q(f"\n【交戦結果】敵の列{def_p}はダミーのみでもぬけの殻でした！攻撃対象が存在しません。")
            await self.platoon_lost_cleanup(defender, def_p)
            return True

        target = defender.platoons[def_p][0]
        attacking_tanks = attacker.platoons[atk_p][:]
        is_flank_attack = (atk_p != def_p)
        is_melee = attacker.advanced[atk_p] or defender.advanced[def_p]
        if is_flank_attack or is_melee:
            # ルール7.1(2)(3)※: 固定砲塔の戦車は攻撃に参加できない（最大攻撃力にも、台数にも数えない）
            excluded = [c for c in attacking_tanks if '固定砲塔' in c.traits]
            attacking_tanks = [c for c in attacking_tanks if '固定砲塔' not in c.traits]
            if not attacking_tanks:
                self.print_q("【攻撃失敗】固定砲塔の戦車は、敵陣地からの攻撃や、自陣地に入った敵への攻撃に参加できません！")
                return True
            if excluded: self.print_q(f"【固定砲塔】{', '.join(c.name for c in excluded)} は攻撃に参加できません。")

        atk_names = ", ".join([f"{c.name}(攻{c.attack})" for c in attacking_tanks])
        self.battle = (atk_p, def_p, target.name, None, None)
        self.show_battlefield()
        self.print_q(f"\n【交戦開始！】 {attacker.faction}の小隊{atk_p} [参加: {atk_names}] が、{defender.faction}の小隊{def_p} [表: {target.name}(防{target.defense})] を攻撃！")

        atk_val = max(int(c.attack) for c in attacking_tanks) + (len(attacking_tanks) - 1)
        if any(att.name == 'パイパー戦闘団' for att in attacker.attachments[atk_p]): atk_val += 2
        bt = self.terrains[atk_p]
        if bt and bt.name == 'バストーニュ' and getattr(bt, 'owner', None) == attacker:
            atk_val += 1
            self.print_q("【地形効果】『バストーニュ』により、攻撃力が +1 されます！")

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

        fog = self.fog_on()
        valid_actions = []
        for c in attacker.hand:
            if c.name not in ['奇襲', '近接航空支援', '壊乱', '強行軍']: continue
            if c.name == '強行軍' and any('重戦車' in t for tank in attacker.platoons[atk_p] for t in tank.traits): continue
            if c.name == '近接航空支援' and fog: continue   # アルデンヌの霧が場に出ている時は使用できない
            valid_actions.append(c)
        if fog and any(c.name == '近接航空支援' for c in attacker.hand) and not (attacker.is_ai or self.training_mode):
            print("（『アルデンヌの霧』が場に出ているため、近接航空支援は使えません）")

        used_actions = []
        if valid_actions:
            if attacker.is_ai or self.training_mode:
                used_actions = [valid_actions[0]]
                self.print_q(f"【AI戦術】AIは射撃支援カード【{used_actions[0].name}】を使用しました！")
            else:
                while True:
                    print("\n=== 射撃支援のチャンス！ ===")
                    for i, c in enumerate(valid_actions): print(f"{i+1}: {c.name}を使用する")
                    print("99: 使用しない\n※近接航空支援だけは何枚でも一緒に使えます（カンマ区切り 例: 1,3）。ほかのカードは1枚だけで、近接航空支援と混ぜて使うことはできません。")
                    choice = (await safe_input("攻撃に使うカード", multiple=True)).strip()
                    if choice == '99': break
                    temp_actions = []
                    valid_input = True
                    for part in choice.split(','):
                        part = part.strip()
                        if part.isdigit() and 0 <= int(part) - 1 < len(valid_actions) and valid_actions[int(part) - 1] not in temp_actions:
                            temp_actions.append(valid_actions[int(part) - 1])
                        else: valid_input = False
                    if not valid_input:
                        print("【！】入力が不正です。もう一度入力してください。")
                        continue
                    non_cas = [c for c in temp_actions if c.name != '近接航空支援']
                    if len(non_cas) > 1:
                        print("【！】『近接航空支援』以外の支援カードは、1回の攻撃につき1枚までしか使用できません！やり直してください。")
                        continue
                    if non_cas and len(temp_actions) > len(non_cas):
                        print("【！】『近接航空支援』とほかのアクションカードを混ぜて使うことはできません！やり直してください。")
                        continue
                    used_actions = temp_actions
                    if used_actions: print(f"アクションカード【{', '.join([c.name for c in used_actions])}】を使用しました！")
                    break

        active_actions = []
        for used_action in used_actions:
            reaction = None
            if used_action.name == '近接航空支援': reaction = await self.get_reaction(defender, '対空砲')
            elif used_action.name in ['奇襲', '強行軍']: reaction = await self.get_reaction(defender, '燃料切れ')
            attacker.hand.remove(used_action); attacker.discard_pile.append(used_action)
            if reaction:
                self.print_q(f"\n【リアクション】{defender.faction}は『{reaction.name}』を使用して、敵の【{used_action.name}】を無効化しました！")
                defender.hand.remove(reaction); defender.discard_pile.append(reaction)
            else:
                active_actions.append(used_action)
                if used_action.name == '奇襲':
                    atk_val += 1
                    if fog:
                        atk_val += 1
                        self.print_q("【奇襲】『アルデンヌの霧』が出ているため、攻撃力がさらに +1 されます！")
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

        self.battle = (atk_p, def_p, target.name, atk_val, def_val)
        self.print_q(f"\n→ 最終計算！ 攻撃側攻撃力: {atk_val} VS 防御側防御力: {def_val}")

        for mc in [att for att in defender.attachments[def_p] if att.name == '連合軍の慢心']:
            defender.attachments[def_p].remove(mc); attacker.discard_pile.append(mc)
            self.print_q("【付与解除】射撃を受けたことにより、敵の『連合軍の慢心』が捨て札になりました！")

        if atk_val >= def_val:
            self.print_q(f"命中！敵列{def_p}の【{target.name}】を撃破しました！！")
            destroyed_tank = defender.platoons[def_p].pop(0)
            destroyed_tank.is_face_up = True
            defender.discard_pile.append(destroyed_tank)

            # バストーニュ: この列の自軍小隊が敵戦車を撃破したら、敵司令部のカード1枚を裏向きで捨て札
            if bt and bt.name == 'バストーニュ' and getattr(bt, 'owner', None) == attacker:
                self.print_q("【バストーニュ効果】敵戦車を撃破したため、敵司令部のカードを1枚捨て札にします！")
                self.damage_hq(defender, 1, is_special_effect=True)
                if self.game_over: return True

            if any(a.name == '壊乱' for a in active_actions) and defender.platoons[def_p]:
                self.print_q("【アクション効果】『壊乱』により、同一小隊の残りの敵戦車がすべて捨て札になります！")
                for t in defender.platoons[def_p]: t.is_face_up = True
                defender.discard_pile.extend(defender.platoons[def_p])
                defender.platoons[def_p] = []

            # サン・ヴィット: 撃破されたら、射撃してきた敵戦車を1両選んで捨て札にできる（10.0(4)）
            sv = self.terrains[def_p]
            if sv and sv.name == 'サン・ヴィット' and getattr(sv, 'owner', None) == defender:
                cands = [c for c in attacking_tanks if c in attacker.platoons[atk_p]]
                pick = None
                if cands:
                    if defender.is_ai or self.training_mode:
                        pick = max(cands, key=lambda c: (int(c.attack), c.cost))
                    else:
                        print("\n【サン・ヴィット】撃ってきた敵戦車を1両選んで捨て札にできます。")
                        for i, c in enumerate(cands): print(f"{i+1}: {c.name} (攻{c.attack}/防{c.defense})")
                        while True:
                            ans = (await safe_input("番号を入力 (99: しない): ")).strip()
                            if ans == '99': break
                            if ans.isdigit() and 0 <= int(ans) - 1 < len(cands): pick = cands[int(ans) - 1]; break
                if pick:
                    attacker.platoons[atk_p].remove(pick); pick.is_face_up = True; attacker.discard_pile.append(pick)
                    self.print_q(f"【サン・ヴィット効果】反撃により、{attacker.faction}の『{pick.name}』が捨て札になりました！")
                    if not attacker.platoons[atk_p]: await self.platoon_lost_cleanup(attacker, atk_p)

            if not defender.platoons[def_p]:
                await self.platoon_lost_cleanup(defender, def_p)
                if self.game_over: return True
                if patton_bonus_active and self.can_advance(attacker, defender, atk_p):
                    go = True
                    if not attacker.is_ai and not self.training_mode:
                        go = (await safe_input(f"\n【パットン第3軍】効果で敵小隊を全滅させました！このまま敵陣地へ進入しますか？ (1: はい / 99: いいえ): ")).strip() == '1'
                    if go: self.do_advance(attacker, defender, atk_p)

            if any(a.name == '奇襲' for a in active_actions) and not defender.platoons[def_p] and any(e.name == 'アルデンヌの霧' for e in attacker.active_events):
                if self.can_advance(attacker, defender, atk_p):
                    go = True
                    if not attacker.is_ai and not self.training_mode:
                        go = (await safe_input(f"\n【イベント効果】『アルデンヌの霧』により、小隊{atk_p}はそのまま敵陣地へ進入できます！進入しますか？ (1: はい / 99: いいえ): ")).strip() == '1'
                    if go: self.do_advance(attacker, defender, atk_p)

            if any(a.name == '強行軍' for a in active_actions) and not defender.platoons[def_p] and attacker.platoons[atk_p]:
                self.print_q("\n【アクション効果】『強行軍』により敵小隊が全滅しました！自軍の戦車を何枚でも捨て札にして、その枚数だけ敵司令部を攻撃できます。")
                if attacker.is_ai or self.training_mode:
                    if len(attacker.platoons[atk_p]) > 1:
                        sac = attacker.platoons[atk_p].pop()
                        sac.is_face_up = True; attacker.discard_pile.append(sac)
                        self.print_q(f"AIは {sac.name} を捨て札にして、司令部にダメージを与えました！")
                        self.damage_hq(defender, 1, is_special_effect=True)
                else:
                    while attacker.platoons[atk_p] and not self.game_over:
                        print("\n自軍小隊の戦車を捨て札にして司令部を攻撃しますか？（何枚でも）")
                        for i, tank in enumerate(attacker.platoons[atk_p]): print(f"{i+1}: {tank.name} を捨て札にする")
                        ans = (await safe_input("番号を入力 (99: やめる): ")).strip()
                        if ans == '99': break
                        if ans.isdigit() and 0 <= int(ans) - 1 < len(attacker.platoons[atk_p]):
                            sac = attacker.platoons[atk_p].pop(int(ans) - 1)
                            sac.is_face_up = True; attacker.discard_pile.append(sac)
                            self.damage_hq(defender, 1, is_special_effect=True)
                if not attacker.platoons[atk_p] and not self.game_over: await self.platoon_lost_cleanup(attacker, atk_p)
        else:
            self.print_q("弾かれた！装甲を抜けませんでした...")

        if self.game_over: return True
        if self.terrains[atk_p] and '深雪' in self.terrains[atk_p].name and attacker.platoons[atk_p] and not ignore_terrain:
            lost_tank = attacker.platoons[atk_p].pop()
            lost_tank.is_face_up = True; attacker.discard_pile.append(lost_tank)
            self.print_q(f"【深雪のペナルティ】射撃の反動・被害により、自軍の {lost_tank.name} が捨て札になりました...")
            if not attacker.platoons[atk_p]: await self.platoon_lost_cleanup(attacker, atk_p)
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
            card.played_turn = self.turn_no
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
            self.terrains[p] = card; self.terrain_progress[p] = 0; self.terrain_mover[p] = None; player.hand.remove(card)
            print(f"列{p}に地形【{card.name}】を配置しました！")
            return True
                
        elif card.type == 'アクション':
            if card.name == '空からの補給':
                tanks_in_discard = [c for c in player.discard_pile if c.type == '戦車' and '重戦車' not in c.traits and c.is_face_up]
                if not tanks_in_discard:
                    print("\n【！】捨て札置き場に復活可能な表向きの戦車がありません！")
                    return False
                if all(any(att.name == '連合軍の慢心' for att in player.attachments[x]) for x in ['A', 'B', 'C']):
                    print("\n【！】全ての小隊に『連合軍の慢心』が付いているため、配置できる小隊がありません！")
                    return False
                
                reaction = await self.get_reaction(enemy, '対空砲')
                if reaction:
                    print(f"\n【リアクション】敵は『{reaction.name}』を使用し、空からの補給を撃ち落としました！")
                    enemy.hand.remove(reaction); enemy.discard_pile.append(reaction)
                    player.hand.remove(card); player.discard_pile.append(card)
                    return True

                print("\n配置先の小隊を選択してください (1: A / 2: B / 3: C)")
                while True:
                    p = {'1': 'A', '2': 'B', '3': 'C'}.get((await safe_input("番号を入力: ")).strip())
                    if p is None: continue
                    if any(att.name == '連合軍の慢心' for att in player.attachments[p]):
                        print("【！】『連合軍の慢心』が付いている小隊には配置できません（10.0(3)）。"); continue
                    break
                revived_tanks = []
                while len(revived_tanks) < 2 and tanks_in_discard:
                    if len(tanks_in_discard) == 1 and not revived_tanks: pick = tanks_in_discard[0]
                    else:
                        print(f"\n復活させる戦車を選んでください（{len(revived_tanks) + 1}両目）")
                        for i, t in enumerate(tanks_in_discard): print(f"{i+1}: {t.name} (攻{t.attack}/防{t.defense})")
                        a = (await safe_input("番号を入力 (99: ここまでにする): ")).strip()
                        if a == '99' and revived_tanks: break
                        if not a.isdigit() or not (0 <= int(a) - 1 < len(tanks_in_discard)): continue
                        pick = tanks_in_discard[int(a) - 1]
                    tanks_in_discard.remove(pick); player.discard_pile.remove(pick); revived_tanks.append(pick)
                for t in revived_tanks:
                    t.is_face_up = False
                    player.platoons[p].append(t)
                if enemy.advanced[p] and revived_tanks:
                    enemy.advanced[p] = False
                    print(f"【押し返し】正面に戦車が配置されたため、敵の小隊{p}は元の位置に押し返されました！")
                player.hand.remove(card); player.discard_pile.append(card)
                print(f"小隊{p}に {len(revived_tanks)} 両の戦車を復活配備しました！")
                await self.greif_check(player, revived_tanks)
                return True

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
        t = self.terrains[p]
        if t and t.name in ['バストーニュ', 'サン・ヴィット']:
            self.print_q(f"\n【！】『{t.name}』は移動では取り除けません（その列のアメリカ軍小隊が全滅した時だけ捨て札になります 8.1(2)）。地形がある間は敵陣地へも進入できません！")
            return False
        if t:
            # ルール8.1(1): 移動を命じた小隊の戦車は全て表にする。同じ小隊に2回移動を命じると地形を取り除ける
            for card in attacker.platoons[p]: card.is_face_up = True
            if self.terrain_mover.get(p) != attacker.faction:
                self.terrain_mover[p] = attacker.faction; self.terrain_progress[p] = 0
            self.terrain_progress[p] += 1
            self.print_q(f"\n小隊{p}が地形『{t.name}』の突破/除去を試みました！(進行度: {self.terrain_progress[p]}/2)")
            if self.terrain_progress[p] >= 2:
                self.print_q(f"【地形除去】地形『{t.name}』を取り除きました！")
                self.terrains[p] = None; self.terrain_progress[p] = 0; self.terrain_mover[p] = None
                (getattr(t, 'owner', None) or attacker).discard_pile.append(t)
            return True
        if defender.platoons[p]:
            self.print_q("\n【！】正面に敵がいるため進入できません！")
            return False
        if attacker.advanced[p]:
            self.print_q("\n【！】既に進入済みです！")
            return False
        self.do_advance(attacker, defender, p)
        return True

    async def _deploy_into(self, player, p):
        """手札の戦車を小隊pに何枚でも出す。出したカードのリストを返す"""
        added = []
        while True:
            current_tanks = [c for c in player.hand if c.type == '戦車']
            if not current_tanks:
                if added: print("\n手札の戦車をすべて配置しました。")
                break
            print(f"\n--- 小隊{p}への追加配置（現在 {len(added)} 両追加済み） ---")
            for i, c in enumerate(current_tanks):
                print(f"{i+1}: {c.name} (攻{c.attack}/防{c.defense}){'［高機動］' if '高機動' in c.traits else ''}")
            val = (await safe_input("追加する戦車の番号を入力 (99: この小隊への配置を終える): ")).strip()
            if val == '99': break
            if not val.isdigit() or not (0 <= int(val) - 1 < len(current_tanks)):
                print("無効な番号です。"); continue
            card = current_tanks[int(val) - 1]
            face_up = False
            if '高機動' in card.traits:
                ans = (await safe_input("【高機動】表向きで配置しますか？ 表向きなら、この小隊はただちに射撃できます (1: 表向き / 99: 裏向き): ")).strip()
                face_up = (ans == '1')
            if len(player.platoons[p]) > 0:
                print(f"\n【配置位置の選択】現在の小隊{p}の並び（1番目が先頭）:")
                for pl_idx, t in enumerate(player.platoons[p]): print(f"  {pl_idx + 1}番目 (現在の {t.name} の前)")
                print(f"  {len(player.platoons[p]) + 1}番目 (最後尾に追加)")
                insert_idx = None
                while True:
                    pos_val = (await safe_input(f"配置する位置を数字で入力してください (1〜{len(player.platoons[p]) + 1} / 99: この戦車の配置をやめる): ")).strip()
                    if pos_val == '99': break
                    if pos_val.isdigit() and 1 <= int(pos_val) <= len(player.platoons[p]) + 1: insert_idx = int(pos_val) - 1; break
                    print("正しい番号を入力してください。")
                if insert_idx is None: print("配置をキャンセルしました。"); continue
            else: insert_idx = 0
            card.is_face_up = face_up
            player.platoons[p].insert(insert_idx, card)
            player.hand.remove(card)
            added.append(card)
            print(f"小隊{p}に {card.name} を{'表' if face_up else '裏'}向きで追加配置しました！")
        return added

    async def action_add_tank(self, player, enemy):
        if not [c for c in player.hand if c.type == '戦車']:
            print("\n【！】手札に戦車がありません。")
            return False
        multi = self.patton_multi(player)
        deployed = []; used = []
        while True:
            if not [c for c in player.hand if c.type == '戦車']: break
            if used:
                ans = (await safe_input("\n【パットン第3軍】続けて別の小隊にも戦車を配置しますか？ (1: はい / 99: いいえ): ")).strip()
                if ans != '1': break
            print("\n追加先の小隊を選択してください (1: A / 2: B / 3: C / 99: 戻る)")
            v = (await safe_input("番号を入力: ")).strip()
            p = {'1': 'A', '2': 'B', '3': 'C'}.get(v)
            if p is None:
                if used: break
                return False
            if p in used: print("その小隊には、もう配置しました。"); continue
            if any(att.name == '連合軍の慢心' for att in player.attachments[p]):
                print(f"\n【！】『連合軍の慢心』の影響により、この小隊には手札から戦車を配置できません！")
                if used: continue
                return False
            got = await self._deploy_into(player, p)
            if got:
                deployed += got; used.append(p)
                if enemy.advanced[p]:
                    enemy.advanced[p] = False
                    print(f"【押し返し】正面に戦車が配置されたため、敵の小隊{p}は元の位置に押し返されました！")
            elif not used: return False
            if not multi: break
        if not deployed: return False
        await self.greif_check(player, deployed)
        # 7.6 高機動: 表向きで配置した小隊はただちに射撃できる
        for p in ['A', 'B', 'C']:
            if self.game_over: break
            if any(c in player.platoons[p] and c.is_face_up and '高機動' in c.traits for c in deployed):
                ans = (await safe_input(f"\n【高機動】小隊{p}はただちに射撃できます。射撃しますか？ (1: はい / 99: いいえ): ")).strip()
                if ans == '1': await self.action_attack(player, enemy, preset_p=p)
        return True

    # ================= AI：手を選ぶたびに先を試して決める =================
    search_seconds = 2.5      # 1手を考える時間（秒）
    search_depth = 8          # 何手番先まで試すか
    search_n = None           # 回数で止める時（デッキ探し用）

    def ai_candidates(self):
        """今の手番で AI が選べる手を (種類, 中身, 目安の点数) のリストで返す"""
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
                    if [dc for dc in self.current_player.discard_pile if dc.type == '戦車' and '重戦車' not in dc.traits and dc.is_face_up] and [x for x in ['A', 'B', 'C'] if not any(att.name == '連合軍の慢心' for att in self.current_player.attachments[x])]: valid_tacticals.append(c)
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
            if self.terrains[p] and self.terrains[p].name in ['バストーニュ', 'サン・ヴィット']: continue
            if self.terrains[p]: can_move.append(p)
            elif not self.current_player.advanced[p] and not self.enemy_player.platoons[p]:
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
                        if target_p != p and self.enemy_player.platoons[target_p] and not self.enemy_player.advanced[target_p]: can_attack.append((p, target_p))
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
            if not target_tank.is_face_up and not getattr(self, 'is_sim', False): def_val = 4   # 裏向きの敵戦車の中身は見ない
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

        if self.current_player.hand and self.current_player.headquarters: evaluated_actions.append(('swap', None, 1))

        return evaluated_actions

    async def ai_execute(self, best_action):
        action_type = best_action[0]; params = best_action[1]
        valid_add_platoons = [p for p in ['A', 'B', 'C'] if not any(att.name == '連合軍の慢心' for att in self.current_player.attachments[p])]
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
                c.played_turn = self.turn_no
                self.current_player.active_events.append(c); self.current_player.hand.remove(c)
            elif c.type == '地形':
                empty_cols = [col for col in ['A', 'B', 'C'] if self.terrains[col] is None and not self.current_player.advanced[col] and not self.enemy_player.advanced[col]]
                col = random.choice(empty_cols) if empty_cols else 'A'
                c.owner = self.current_player
                self.print_q(f"AIは列{col}に地形【{c.name}】を配置しました！")
                self.terrains[col] = c; self.terrain_progress[col] = 0; self.terrain_mover[col] = None; self.current_player.hand.remove(c)
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
                    await self.greif_check(self.current_player, revived_tanks)
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
            fast = '高機動' in c.traits
            c.is_face_up = fast
            insert_idx = 0 if fast else random.randint(0, len(self.current_player.platoons[p]))
            self.current_player.platoons[p].insert(insert_idx, c)
            self.current_player.hand.remove(c)
            if self.enemy_player.advanced[p]: self.enemy_player.advanced[p] = False
            await self.greif_check(self.current_player, [c])
            # 7.6 高機動: 表向きで配置した小隊はただちに射撃できる
            if fast and c in self.current_player.platoons[p] and self.enemy_player.platoons[p] and not self.current_player.advanced[p] and not self.tiger_blocked(self.current_player, p):
                if not (self.terrains[p] and '森林' in self.terrains[p].name and not any(e.name == 'アルデンヌの霧' for e in self.current_player.active_events)):
                    self.print_q(f"【高機動】AIの小隊{p}は、配置したばかりの {c.name} とともにただちに射撃します！")
                    await self.execute_attack(self.current_player, self.enemy_player, p, p)
        elif action_type == 'swap':
            self.print_q("AIは手札を交換しました！")
            c = self.current_player.hand.pop(0)
            self.current_player.headquarters.append(c)
            self.current_player.hand.append(self.current_player.headquarters.pop(0))
        return False

    def act_sig(self, a):
        def cs(x): return f"{x.faction}{x.id}" if isinstance(x, Card) else str(x)
        t, prm = a[0], a[1]
        if isinstance(prm, tuple): return t + '|' + '|'.join(cs(x) for x in prm)
        return t + '|' + ('' if prm is None else cs(prm))

    def heuristic_pick(self, acts):
        best = None; best_score = -10 ** 9
        for act in acts:
            sc = act[2] + random.uniform(0, 5)
            if sc > best_score: best_score = sc; best = act
        return best

    def sim_clone(self):
        import copy
        saved = self.df
        self.df = None
        try: g = copy.deepcopy(self)
        finally: self.df = saved
        g.quiet = True; g.training_mode = True; g.is_sim = True
        g.player1.is_ai = True; g.player2.is_ai = True
        return g

    def determinize(self, me):
        """見えない情報（相手の手札・司令部・裏向きの戦車、自分の司令部の順番）をランダムに当てはめ直す"""
        opp = self.other(me)
        slots = [(col, i) for col in ['A', 'B', 'C'] for i, c in enumerate(opp.platoons[col]) if not c.is_face_up]
        pool = opp.hand + opp.headquarters + [opp.platoons[col][i] for col, i in slots]
        random.shuffle(pool)
        for col, i in slots:
            t = next(c for c in pool if c.type == '戦車')
            pool.remove(t); t.is_face_up = False; opp.platoons[col][i] = t
        nh = len(opp.hand)
        opp.hand = pool[:nh]; opp.headquarters = pool[nh:]
        random.shuffle(me.headquarters)

    def sim_value(self, me):
        import math
        if self.game_over:
            if self.winner == "Draw" or self.winner is None: return 0.5
            return 1.0 if self.winner is me else 0.0
        opp = self.other(me)
        def side(pl, en):
            tanks = [c for col in ['A', 'B', 'C'] for c in pl.platoons[col]]
            v = len(pl.headquarters) * 1.0 + len(tanks) * 1.2 + sum(int(c.attack) for c in tanks) * 0.15 + len(pl.hand) * 0.3
            v += sum(1 for col in ['A', 'B', 'C'] if pl.advanced[col]) * (6.0 if len(en.headquarters) <= 2 else 2.5)
            return v
        x = side(me, opp) - side(opp, me)
        return 1.0 / (1.0 + math.exp(-0.25 * x))

    async def sim_end_turn(self):
        cp = self.current_player
        while len(cp.hand) < 4 and cp.headquarters:
            drawn = cp.headquarters.pop(0)
            if drawn.type == 'アクシデント':
                for pt in [cp, self.enemy_player]:
                    while pt.active_events: pt.active_events.pop(0)
                cp.active_events.append(drawn)
            else: cp.hand.append(drawn)
        self.current_player, self.enemy_player = self.enemy_player, self.current_player
        self.turn_no += 1

    async def rollout(self, sig, me_is_p1):
        g = self.sim_clone()
        me = g.player1 if me_is_p1 else g.player2
        g.determinize(me)
        acts = g.ai_candidates()
        a = next((x for x in acts if g.act_sig(x) == sig), None)
        if a is None: return 0.5
        await g.ai_execute(a)
        if not g.game_over: await g.sim_end_turn()
        for _ in range(self.search_depth):
            if g.game_over: break
            acts = g.ai_candidates()
            if not acts: g.game_over = True; g.winner = g.enemy_player; break
            await g.ai_execute(g.heuristic_pick(acts))
            if g.game_over: break
            await g.sim_end_turn()
        return g.sim_value(me)

    async def ai_search(self, acts):
        import math
        acts = sorted(acts, key=lambda a: -a[2])
        # 同じ中身の手はまとめる
        seen = set(); uniq = []
        for a in acts:
            sg = self.act_sig(a)
            if sg not in seen: seen.add(sg); uniq.append(a)
        acts = uniq[:10]
        if len(acts) == 1: return acts[0]
        sigs = [self.act_sig(a) for a in acts]
        tot = [0.0] * len(acts); cnt = [0] * len(acts)
        me_is_p1 = self.current_player is self.player1
        t0 = time.time(); n = 0
        while ((n < self.search_n) if self.search_n else (time.time() - t0 < self.search_seconds or n < 2 * len(acts))) and n < 3000:
            if n < 2 * len(acts): k = n % len(acts)
            else: k = max(range(len(acts)), key=lambda j: tot[j] / cnt[j] + 0.6 * math.sqrt(math.log(n) / cnt[j]))
            tot[k] += await self.rollout(sigs[k], me_is_p1); cnt[k] += 1; n += 1
            if n % 10 == 0: await asyncio.sleep(0)
        best = max(range(len(acts)), key=lambda j: (tot[j] / cnt[j], cnt[j]))
        self.last_search = {'n': n, 'rate': tot[best] / cnt[best]}
        return acts[best]

    async def ai_take_turn(self):
        self.show_battlefield()
        use_search = not self.training_mode and not self.quiet and getattr(self, 'search_enabled', True)
        self.print_q("\nAIが先を読んでいます..." if use_search else "\nAIが盤面を分析中...")
        if not self.quiet: await asyncio.sleep(0.1)
        acts = self.ai_candidates()
        if not acts:
            self.print_q("AIは何も行動できず投了しました。")
            self.game_over = True; self.winner = self.enemy_player; return False
        if use_search or getattr(self, 'force_search', False):
            best = await self.ai_search(acts)
            ls = getattr(self, 'last_search', None)
            if ls and not self.quiet: self.print_q(f"（AI: {ls['n']}通りの展開を試し、見込み勝率 {round(ls['rate'] * 100)}% の手を選びました）")
        else:
            best = self.heuristic_pick(acts)
        return await self.ai_execute(best)


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
                js.window.location.href = "../index1.html"
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
            js.window.location.href = "../index1.html"
            return

        except Exception as e:
            print(f"\n【エラー】チャレンジモードでエラーが発生しました: {e}")
            await safe_input("Enterで戻ります...")
            js.window.location.href = "../index1.html"
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

            mode_choice = await safe_input("西部戦線 1944", [
                ("1", "AIと対戦"), ("2", "チャレンジデッキを作る"), ("0", "作戦司令室に戻る")
            ], view="start")

            # 0 を選んだらブラウザをリロードして最初の大元に戻る
            if mode_choice == '0':
                print("\n戦線選択画面に戻ります。リロード中...")
                js.window.location.href = "../index1.html"
                return

            is_test_ai = (mode_choice == "testai")

            # === チャレンジデッキ作成 ===
            if mode_choice == '2':
                print("\n" + "="*50)
                print("【チャレンジデッキ作成（西部戦線）】")
                print("="*50)

                faction_choice = await safe_input("陣営を選ぶ", [("1", "ドイツ軍"), ("2", "連合軍")], view="faction")
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

                player_name = (await safe_input("あなたの名前（ハンドルネーム、8文字以内）: ")).strip()
                if not player_name: player_name = "名無し"
                player_name = player_name[:8]

                while True:
                    deck_name = (await safe_input("デッキ名（8文字以内）: ")).strip()
                    if not deck_name: deck_name = "無名デッキ"
                    if len(deck_name) <= 8: break
                    print(f"デッキ名が長すぎます（{len(deck_name)}文字）。8文字以内にしてください。")

                # AI 30回自動対戦
                print(f"\n『{deck_name}』の強さを測定します...")
                print("AI 30回自動対戦を開始します。しばらくお待ちください...\n")
                num_battles = 30
                p1_wins, p2_wins, draws = 0, 0, 0

                def show_challenge_progress(i):
                    done = i + 1
                    pct = int(done / num_battles * 100)
                    rate = f"{p1_wins/done*100:.0f}%" if done > 0 else "-"
                    msg = f"測定中... {pct}%  (勝率{rate})"
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
                js.window.location.href = "../index1.html"
                return

            else:
                p1_ai, p2_ai = False, False
                if is_test_ai:
                    p1_faction, p2_faction, p1_ai, p2_ai = "ドイツ軍", "連合軍", True, True
                else:
                    choice = await safe_input("陣営を選ぶ", [("1", "ドイツ軍"), ("2", "連合軍")], view="faction")
                    if choice == '1': p1_faction, p2_faction, p2_ai = "ドイツ軍", "連合軍", True
                    else: p1_faction, p2_faction, p2_ai = "連合軍", "ドイツ軍", True
                game = Game(df=df, p1_faction=p1_faction, p2_faction=p2_faction, p1_ai=p1_ai, p2_ai=p2_ai)
                await game.setup_game()
                winner = await game.play()
                game.show_battlefield()
                result = "引き分け" if winner == "Draw" else f"{winner.faction}の勝利"
                await safe_input(result, [("", "タイトルに戻る")], view="result")
                js.window.location.reload()
                return

            # 対戦終了後、Enterを押すとリロードしてトップに戻る
        except Exception as e:
            print(f"\n【通知】システムをリセットします: {e}")
            await asyncio.sleep(2)
            js.window.location.href = "../index1.html"
            return

def main():
    import js
    js.window._game_task = asyncio.create_task(async_main())

if __name__ == "__main__":
    main()