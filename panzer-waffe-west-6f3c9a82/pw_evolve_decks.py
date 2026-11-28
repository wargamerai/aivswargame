"""Evaluate deck changes and tactical search in reproducible self-play."""
import argparse
import asyncio
import json
from pathlib import Path
import random

import pandas as pd

from main import Card, Game

ROOT = Path(__file__).resolve().parent
SIDES = {"ドイツ軍": "ドイツ", "連合軍": "連合軍"}


async def match(cards, decks, seed, search_side=None, rollouts=0):
    random.seed(seed)
    game = Game(cards, p1_ai=True, p2_ai=True, quiet_mode=True,
                p1_preset_deck=decks["ドイツ軍"], p2_preset_deck=decks["連合軍"])
    game.search_n = rollouts
    game.search_depth = 2
    original = game.ai_take_turn

    async def take_turn():
        game.force_search = game.current_player.faction == search_side
        return await original()

    game.ai_take_turn = take_turn
    await game.setup_game()
    winner = await game.play()
    return getattr(winner, "faction", "Draw")


def score(winner, side):
    return 0.5 if winner == "Draw" else float(winner == side)


def candidates(pool, original, count, rng):
    by_id = {card.id: card for card in pool}
    for _ in range(count):
        deck = list(original)
        for card_id in rng.sample(deck, min(len(deck), rng.randint(1, 4))):
            deck.remove(card_id)
        choices = [card for card in pool if card.id not in deck]
        rng.shuffle(choices)
        budget = 30 - sum(by_id[card_id].cost for card_id in deck)
        for card in choices:
            if card.cost <= budget:
                deck.append(card.id)
                budget -= card.cost
        if sum(by_id[card_id].type == "戦車" for card_id in deck) >= 3:
            yield deck


async def evaluate(args):
    cards = pd.read_csv(ROOT / "cards_west.csv")
    known = json.loads((ROOT / "decks_west.json").read_text())
    base = {side: known[side][0]["ids"] for side in SIDES}
    rng = random.Random(args.seed)
    train_seeds = range(args.seed, args.seed + args.games)
    test_seeds = range(args.seed + 10000, args.seed + 10000 + args.games)
    results = {}
    for side, faction in SIDES.items():
        enemy = next(name for name in SIDES if name != side)
        pool = [Card(row) for _, row in cards.iterrows()
                if row["Faction"] == faction and row["Type"] not in ("イベント", "アクシデント")]

        async def trial(deck, seeds, search=False):
            total = 0
            for seed in seeds:
                opponent = known[enemy][seed % len(known[enemy])]["ids"]
                lineup = {side: deck, enemy: opponent}
                winner = await match(cards, lineup, seed, side if search else None, args.rollouts)
                total += score(winner, side)
            return total / args.games

        baseline = base[side]
        best = baseline
        best_score = await trial(baseline, train_seeds)
        for deck in candidates(pool, baseline, args.candidates, rng):
            rating = await trial(deck, train_seeds)
            if rating > best_score:
                best, best_score = deck, rating
        results[side] = {
            "baseline": await trial(baseline, test_seeds),
            "candidate": await trial(best, test_seeds),
            "search": await trial(baseline, test_seeds, search=True),
            "candidate_ids": best,
            "games_per_comparison": args.games,
        }
        print(side, results[side], flush=True)
    if args.output:
        args.output.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--games", type=int, default=24)
    parser.add_argument("--candidates", type=int, default=20)
    parser.add_argument("--rollouts", type=int, default=30)
    parser.add_argument("--seed", type=int, default=1944)
    parser.add_argument("--output", type=Path)
    options = parser.parse_args()
    if min(options.games, options.rollouts) < 1 or options.candidates < 0:
        parser.error("games and rollouts must be positive, candidates must be nonnegative")
    asyncio.run(evaluate(options))
