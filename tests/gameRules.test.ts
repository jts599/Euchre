import { describe, expect, it } from "vitest";
import { ICard } from "../types/cards";
import { PositionalPlayer, Rank, Suit } from "../types/enums";
import { Team } from "../types/gameState";
import { createDeck, dealCards, shuffleCards } from "../game/deck";
import { getEffectiveSuit, getLegalCards, getTrickWinner, scoreHand } from "../game/rules";

const jackClubs: ICard = { suit: Suit.Clubs, rank: Rank.Jack };
const jackSpades: ICard = { suit: Suit.Spades, rank: Rank.Jack };
const aceSpades: ICard = { suit: Suit.Spades, rank: Rank.Ace };
const aceHearts: ICard = { suit: Suit.Hearts, rank: Rank.Ace };
const kingHearts: ICard = { suit: Suit.Hearts, rank: Rank.King };
const nineHearts: ICard = { suit: Suit.Hearts, rank: Rank.Nine };

/**
 * Unit tests for pure Euchre rules.
 */
describe("game rules", () => {
    it("creates a 24-card Euchre deck with unique cards", () => {
        const deck = createDeck();
        const cardIds = deck.map((card) => `${card.rank}-${card.suit}`);

        expect(deck).toHaveLength(24);
        expect(new Set(cardIds).size).toBe(24);
    });

    it("shuffles and deals deterministically with an injected RNG", () => {
        const shuffledDeck = shuffleCards(createDeck(), () => 0);
        const deal = dealCards(shuffledDeck);

        expect(shuffledDeck[0]).toEqual({ suit: Suit.Hearts, rank: Rank.Ten });
        expect(deal.hands[PositionalPlayer.North]).toEqual(shuffledDeck.slice(0, 5));
        expect(deal.kitty).toEqual(shuffledDeck.slice(20));
    });

    it("treats the left bower as the trump suit", () => {
        expect(getEffectiveSuit(jackClubs, Suit.Spades)).toBe(Suit.Spades);
        expect(getEffectiveSuit(jackSpades, Suit.Spades)).toBe(Suit.Spades);
        expect(getEffectiveSuit(aceHearts, Suit.Spades)).toBe(Suit.Hearts);
    });

    it("filters legal cards by effective lead suit", () => {
        const hand = [jackClubs, aceHearts, nineHearts];

        expect(getLegalCards(hand, aceSpades, Suit.Spades)).toEqual([jackClubs]);
        expect(getLegalCards(hand, kingHearts, Suit.Spades)).toEqual([aceHearts, nineHearts]);
    });

    it("chooses trick winners using bowers, trump, and lead suit", () => {
        const winner = getTrickWinner(
            [
                { player: PositionalPlayer.North, card: aceSpades },
                { player: PositionalPlayer.East, card: jackClubs },
                { player: PositionalPlayer.South, card: jackSpades },
                { player: PositionalPlayer.West, card: aceHearts }
            ],
            Suit.Spades
        );

        expect(winner.player).toBe(PositionalPlayer.South);
    });

    it("scores maker points, lone sweeps, and euchres", () => {
        expect(scoreHand(PositionalPlayer.North, undefined, tricks(2, 0, 2, 1))).toEqual({
            scoringTeam: Team.NorthSouth,
            pointsAwarded: 1
        });
        expect(scoreHand(PositionalPlayer.North, undefined, tricks(3, 0, 2, 0))).toEqual({
            scoringTeam: Team.NorthSouth,
            pointsAwarded: 2
        });
        expect(scoreHand(PositionalPlayer.North, PositionalPlayer.North, tricks(3, 0, 2, 0))).toEqual({
            scoringTeam: Team.NorthSouth,
            pointsAwarded: 4
        });
        expect(scoreHand(PositionalPlayer.North, undefined, tricks(1, 2, 1, 1))).toEqual({
            scoringTeam: Team.EastWest,
            pointsAwarded: 2
        });
    });
});

/**
 * Creates trick counts for score tests.
 *
 * @param north - North tricks.
 * @param east - East tricks.
 * @param south - South tricks.
 * @param west - West tricks.
 * @returns Trick counts keyed by absolute player.
 * @sideEffects None.
 */
function tricks(
    north: number,
    east: number,
    south: number,
    west: number
): Readonly<Record<PositionalPlayer, number>> {
    return {
        [PositionalPlayer.North]: north,
        [PositionalPlayer.East]: east,
        [PositionalPlayer.South]: south,
        [PositionalPlayer.West]: west
    };
}
