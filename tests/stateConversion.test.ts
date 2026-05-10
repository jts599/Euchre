import { describe, expect, it } from "vitest";
import { ICard } from "../types/cards";
import { IGameStatePrivate, Team } from "../types/gameState";
import { IHandStatePrivate } from "../types/handState";
import { Player, PositionalPlayer, Rank, Suit } from "../types/enums";
import { toPublicGameState, toPublicHandState, toPublicTrickState } from "../types/stateConversion";

const nineHearts: ICard = { suit: Suit.Hearts, rank: Rank.Nine };
const tenHearts: ICard = { suit: Suit.Hearts, rank: Rank.Ten };
const jackHearts: ICard = { suit: Suit.Hearts, rank: Rank.Jack };
const queenHearts: ICard = { suit: Suit.Hearts, rank: Rank.Queen };
const kingHearts: ICard = { suit: Suit.Hearts, rank: Rank.King };
const aceHearts: ICard = { suit: Suit.Hearts, rank: Rank.Ace };
const jackSpades: ICard = { suit: Suit.Spades, rank: Rank.Jack };
const aceClubs: ICard = { suit: Suit.Clubs, rank: Rank.Ace };

/**
 * Unit tests for private engine state to public player-facing state conversion.
 */
describe("state conversion", () => {
    it("exposes only the perspective player's hand", () => {
        const publicHand = toPublicHandState(createHandState(), PositionalPlayer.South);

        expect(publicHand.hand).toEqual([jackHearts, queenHearts]);
        expect(publicHand).not.toHaveProperty("hands");
        expect(publicHand).not.toHaveProperty("kitty");
    });

    it("converts public hand player references into relative labels", () => {
        const publicHand = toPublicHandState(createHandState(), PositionalPlayer.South);

        expect(publicHand.dealer).toBe(Player.Partner);
        expect(publicHand.maker).toBe(Player.RightOpponent);
        expect(publicHand.goingAlone).toBe(Player.RightOpponent);
        expect(publicHand.playedCards).toEqual([
            { card: aceClubs, player: Player.RightOpponent }
        ]);
        expect(publicHand.completedTricks[0]).toEqual({
            leader: Player.Partner,
            winner: Player.RightOpponent,
            plays: [
                { card: nineHearts, player: Player.Partner },
                { card: aceClubs, player: Player.RightOpponent }
            ]
        });
    });

    it("converts trick state records into relative player keys", () => {
        const publicTrick = toPublicTrickState(
            {
                leader: PositionalPlayer.North,
                currentPlayer: PositionalPlayer.West,
                plays: [{ card: nineHearts, player: PositionalPlayer.North }],
                tricksTaken: {
                    [PositionalPlayer.North]: 1,
                    [PositionalPlayer.East]: 0,
                    [PositionalPlayer.South]: 2,
                    [PositionalPlayer.West]: 1
                }
            },
            PositionalPlayer.South
        );

        expect(publicTrick.leader).toBe(Player.Partner);
        expect(publicTrick.currentPlayer).toBe(Player.LeftOpponent);
        expect(publicTrick.tricksTaken).toEqual({
            [Player.Self]: 2,
            [Player.LeftOpponent]: 1,
            [Player.Partner]: 1,
            [Player.RightOpponent]: 0
        });
    });

    it("hides dealer discard hand from non-dealer perspectives", () => {
        const publicGame = toPublicGameState(createDealerDiscardGame(), PositionalPlayer.South);

        expect(publicGame.phase.kind).toBe("DealerDiscard");

        if (publicGame.phase.kind === "DealerDiscard") {
            expect(publicGame.phase.dealer).toBe(Player.Partner);
            expect(publicGame.phase.dealerHand).toBeUndefined();
            expect(publicGame.phase.pickedUpCard).toEqual(jackSpades);
        }
    });

    it("exposes dealer discard hand to the dealer perspective", () => {
        const publicGame = toPublicGameState(createDealerDiscardGame(), PositionalPlayer.North);

        expect(publicGame.phase.kind).toBe("DealerDiscard");

        if (publicGame.phase.kind === "DealerDiscard") {
            expect(publicGame.phase.dealer).toBe(Player.Self);
            expect(publicGame.phase.dealerHand).toEqual([nineHearts, tenHearts, jackSpades]);
        }
    });

    it("converts ordering trump phase state", () => {
        const publicGame = toPublicGameState(
            {
                config: { targetScore: 10, stickTheDealer: false },
                handNumber: 3,
                dealer: PositionalPlayer.North,
                score: createScore(),
                phase: {
                    kind: "OrderingTrump",
                    hand: createHandState(),
                    currentPlayer: PositionalPlayer.East,
                    proposedTrumpCard: jackSpades,
                    passes: [PositionalPlayer.South]
                }
            },
            PositionalPlayer.South
        );

        expect(publicGame.dealer).toBe(Player.Partner);
        expect(publicGame.phase.kind).toBe("OrderingTrump");

        if (publicGame.phase.kind === "OrderingTrump") {
            expect(publicGame.phase.currentPlayer).toBe(Player.RightOpponent);
            expect(publicGame.phase.proposedTrumpCard).toEqual(jackSpades);
            expect(publicGame.phase.passes).toEqual([Player.Self]);
        }
    });

    it("converts choosing trump phase state", () => {
        const publicGame = toPublicGameState(
            {
                config: { targetScore: 10, stickTheDealer: false },
                handNumber: 4,
                dealer: PositionalPlayer.North,
                score: createScore(),
                phase: {
                    kind: "ChoosingTrump",
                    hand: createHandState(),
                    currentPlayer: PositionalPlayer.North,
                    availableSuits: [Suit.Hearts, Suit.Diamonds, Suit.Clubs],
                    mustChooseTrump: true,
                    passes: [PositionalPlayer.East, PositionalPlayer.South, PositionalPlayer.West]
                }
            },
            PositionalPlayer.South
        );

        expect(publicGame.phase.kind).toBe("ChoosingTrump");

        if (publicGame.phase.kind === "ChoosingTrump") {
            expect(publicGame.phase.currentPlayer).toBe(Player.Partner);
            expect(publicGame.phase.availableSuits).not.toContain(Suit.Spades);
            expect(publicGame.phase.mustChooseTrump).toBe(true);
            expect(publicGame.phase.passes).toEqual([Player.RightOpponent, Player.Self, Player.LeftOpponent]);
        }
    });

    it("converts playing trick and game complete phases", () => {
        const playingGame = toPublicGameState(createPlayingTrickGame(), PositionalPlayer.South);
        const completeGame = toPublicGameState(createCompleteGame(), PositionalPlayer.South);

        expect(playingGame.phase.kind).toBe("PlayingTrick");
        expect(completeGame.phase.kind).toBe("GameComplete");

        if (playingGame.phase.kind === "PlayingTrick") {
            expect(playingGame.phase.trick.currentPlayer).toBe(Player.RightOpponent);
            expect(playingGame.phase.hand.trump).toBe(Suit.Spades);
        }

        if (completeGame.phase.kind === "GameComplete") {
            expect(completeGame.phase.winner).toBe(Team.NorthSouth);
            expect(completeGame.phase.finalScore[Team.NorthSouth]).toBe(10);
        }
    });
});

/**
 * Creates a representative private hand state for conversion tests.
 *
 * @returns Private hand state containing hidden hands, public plays, and trump metadata.
 */
function createHandState(): IHandStatePrivate {
    return {
        hands: {
            [PositionalPlayer.North]: [nineHearts, tenHearts],
            [PositionalPlayer.East]: [kingHearts, aceHearts],
            [PositionalPlayer.South]: [jackHearts, queenHearts],
            [PositionalPlayer.West]: [jackSpades, aceClubs]
        },
        kitty: [jackSpades],
        upCard: jackSpades,
        dealer: PositionalPlayer.North,
        playedCards: [{ card: aceClubs, player: PositionalPlayer.East }],
        completedTricks: [
            {
                leader: PositionalPlayer.North,
                winner: PositionalPlayer.East,
                plays: [
                    { card: nineHearts, player: PositionalPlayer.North },
                    { card: aceClubs, player: PositionalPlayer.East }
                ]
            }
        ],
        trump: Suit.Spades,
        maker: PositionalPlayer.East,
        goingAlone: PositionalPlayer.East,
        turnedDownSuit: Suit.Diamonds
    };
}

/**
 * Creates a representative score record.
 *
 * @returns Private/public score record keyed by team.
 */
function createScore(): Readonly<Record<Team, number>> {
    return {
        [Team.NorthSouth]: 4,
        [Team.EastWest]: 6
    };
}

/**
 * Creates a private dealer-discard game state.
 *
 * @returns Private game state in the dealer-discard phase.
 */
function createDealerDiscardGame(): IGameStatePrivate {
    return {
        config: { targetScore: 10, stickTheDealer: false },
        handNumber: 2,
        dealer: PositionalPlayer.North,
        score: createScore(),
        phase: {
            kind: "DealerDiscard",
            hand: createHandState(),
            dealerHand: [nineHearts, tenHearts, jackSpades],
            pickedUpCard: jackSpades
        }
    };
}

/**
 * Creates a private playing-trick game state.
 *
 * @returns Private game state in the trick-play phase.
 */
function createPlayingTrickGame(): IGameStatePrivate {
    return {
        config: { targetScore: 10, stickTheDealer: false },
        handNumber: 5,
        dealer: PositionalPlayer.North,
        score: createScore(),
        phase: {
            kind: "PlayingTrick",
            hand: createHandState(),
            trick: {
                leader: PositionalPlayer.North,
                currentPlayer: PositionalPlayer.East,
                plays: [{ card: nineHearts, player: PositionalPlayer.North }],
                tricksTaken: {
                    [PositionalPlayer.North]: 1,
                    [PositionalPlayer.East]: 1,
                    [PositionalPlayer.South]: 0,
                    [PositionalPlayer.West]: 0
                }
            }
        }
    };
}

/**
 * Creates a private game-complete state.
 *
 * @returns Private game state in the terminal phase.
 */
function createCompleteGame(): IGameStatePrivate {
    return {
        config: { targetScore: 10, stickTheDealer: false },
        handNumber: 8,
        dealer: PositionalPlayer.West,
        score: {
            [Team.NorthSouth]: 10,
            [Team.EastWest]: 7
        },
        phase: {
            kind: "GameComplete",
            winner: Team.NorthSouth,
            finalScore: {
                [Team.NorthSouth]: 10,
                [Team.EastWest]: 7
            }
        }
    };
}
