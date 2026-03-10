import random

class GameEffects:
    # --- 【地形・アクシデント関連】 ---
    @staticmethod
    def check_auto_play_debuffs(player, game):
        """手札に入った瞬間に強制発動するアクシデント"""
        for card in player.hand[:]:
            if card.name in ["慢性的補給不足", "レンドリースの遅延"]:
                player.active_events.append(card)
                player.hand.remove(card)
                game.print_q(f"【アクシデント発生！】手札の『{card.name}』が強制的に場に出ました！")

    # --- 【アクション・イベントカード使用時の処理】 ---
    @staticmethod
    async def play_tactical_card(player, enemy, card, col, game):
        """戦術カード（アクション・イベント）を使用時の分岐処理"""
        
        # モンティ
        if card.name == "モンティ":
            targets = [dc for dc in player.discard_pile if dc.is_face_up and dc.name != "チャーチルが来た"]
            if not targets:
                game.print_q("\n【！】捨て札に戻せるカードが1枚もありません。使用をキャンセルします。")
                return False # キャンセル扱い
                
            game.print_q("\n【モンティ】捨て札から司令部に戻すカードを最大3枚選びます。")
            restored_count = 0
            
            if player.is_ai:
                for _ in range(min(3, len(targets))):
                    c = targets.pop(0)
                    player.headquarters.append(c)
                    player.discard_pile.remove(c)
                    restored_count += 1
            else:
                while restored_count < 3 and targets:
                    game.print_q(f"\n[戻せるカード残り: {3 - restored_count} 枚] 対象の捨て札:")
                    for i, t in enumerate(targets):
                        game.print_q(f"  {i+1}: [{t.type}] {t.name}")
                    
                    val = (await game.safe_input_method("戻すカードの番号を入力 (Xで選択終了): ")).upper()
                    if val == 'X':
                        if restored_count == 0:
                            game.print_q("1枚も選ばれませんでした。使用をキャンセルします。")
                            return False
                        break
                    
                    if val.isdigit() and 1 <= int(val) <= len(targets):
                        idx = int(val) - 1
                        selected = targets.pop(idx)
                        player.headquarters.append(selected)
                        player.discard_pile.remove(selected)
                        restored_count += 1
                        game.print_q(f" -> 『{selected.name}』を司令部に戻しましたわ。")
                    else:
                        game.print_q("無効な番号です。")
            
            if restored_count > 0:
                random.shuffle(player.headquarters)
                game.print_q(f"計 {restored_count} 枚を戻して、司令部をシャッフルしました！")
            
            player.active_events.append(card)
            if card in player.hand:
                player.hand.remove(card) # 手札から確実に消す
            game.print_q("【モンティ】悪魔の園を無効化する状態になりました！")
            return True

        # チャーチルが来た
        elif card.name == "チャーチルが来た":
            limit = 2 # ★モンティによる制限を解除し、常に2枚までとしました
            targets = [dc for dc in player.discard_pile if dc.is_face_up and dc.type not in ['戦車', 'イベント', 'アクシデント'] and dc.name != "チャーチルが来た"]
            
            if not targets:
                game.print_q("\n【！】捨て札に戻せるカードが1枚もありません。使用をキャンセルします。")
                return False # キャンセル扱い（手番を消費しない）

            game.print_q(f"\n【チャーチルが来た】捨て札から戦車以外のカードを最大{limit}枚選び、司令部の底に戻します。")
            restored_count = 0
            
            if player.is_ai:
                for _ in range(min(limit, len(targets))):
                    c = targets.pop(0)
                    player.headquarters.insert(0, c)
                    player.discard_pile.remove(c)
                    restored_count += 1
            else:
                while restored_count < limit and targets:
                    game.print_q(f"\n[戻せるカード残り: {limit - restored_count} 枚] 対象の捨て札:")
                    for i, t in enumerate(targets):
                        game.print_q(f"  {i+1}: [{t.type}] {t.name}")
                    
                    val = (await game.safe_input_method("戻すカードの番号を入力 (Xで選択終了): ")).upper()
                    if val == 'X':
                        if restored_count == 0:
                            game.print_q("1枚も選ばれませんでした。使用をキャンセルします。")
                            return False # キャンセル扱い
                        break
                    
                    if val.isdigit() and 1 <= int(val) <= len(targets):
                        idx = int(val) - 1
                        selected = targets.pop(idx)
                        player.headquarters.insert(0, selected)
                        player.discard_pile.remove(selected)
                        restored_count += 1
                        game.print_q(f" -> 『{selected.name}』を司令部の底に戻しましたわ。")
                    else:
                        game.print_q("無効な番号です。")
            
            player.discard_pile.append(card)
            if card in player.hand:
                player.hand.remove(card) # 手札から確実に消す

            if restored_count > 0:
                game.print_q(f"計 {restored_count} 枚を司令部の底に戻しました！")
            else:
                game.print_q("戻せるカードがありませんでした。")
            
            return True

        return False

    # --- 【リアクション・戦闘割り込み処理】 ---
    @staticmethod
    async def process_counter_attack(defender, def_p, attacker, atk_p, game):
        """反撃の処理"""
        if any(e.name == "レンドリースの遅延" for e in defender.active_events):
            return False
            
        counter_cards = [c for c in defender.hand if c.name == "反撃"]
        if counter_cards and defender.platoons[def_p]:
            if defender.is_ai:
                use_c = 'Y' # AIは持っていれば自動で反撃します
            else:
                use_c = (await game.safe_input_method("手札に【反撃】カードがあります。使用して反撃しますか？ (Y/N): ")).upper()
                
            if use_c == 'Y':
                game.print_q(f"【反撃！】生き残った小隊{def_p}が、そのまま敵小隊{atk_p}へ射撃を返します！")
                defender.hand.remove(counter_cards[0])
                defender.discard_pile.append(counter_cards[0])
                return True
        return False