import { describe, expect, it } from "vitest";
import { runGame } from "../game";
import { BasicAIPlayer } from "../players";
import { ICard } from "../types/cards";
import { Player, PositionalPlayer, Rank, Suit } from "../types/enums";
import { IGameStatePublic, Team } from "../types/gameState";
import { IPlayer } from "../types/player";

const jackSpades: ICard = { suit: Suit.Spades, rank: Rank.Jack };
const jackClubs: ICard = { suit: Suit.Clubs, rank: Rank.Jack };
const aceSpades: ICard = { suit: Suit.Spades, rank: Rank.Ace };
const nineHearts: ICard = { suit: Suit.Hearts, rank: Rank.Nine };
const tenHearts: ICard = { suit: Suit.Hearts, rank: Rank.Ten };
const queenDiamonds: ICard = { suit: Suit.Diamonds, rank: Rank.Queen };
const aceClubs: ICard = { suit: Suit.Clubs, rank: Rank.Ace };
const nineClubs: ICard = { suit: Suit.Clubs, rank: Rank.Nine };

/**
 * Unit and integration tests for the basic AI player.
 */
describe("BasicAIPlayer", () => {
    it("orders up strong proposed trump hands", async () => {
        const player = new BasicAIPlayer({ rng: () => 0 });
        const result = await player.doYouWantThisTrump({
            proposedTrumpCard: jackSpades,
            dealer: Player.Partner,
            gameState: createPublicState([jackSpades, jackClubs, aceSpades, nineHearts, tenHearts])
        });

        expect(result).toEqual({ pickItUp: true, goAlone: false });
    });

    it("passes weak proposed trump hands", async () => {
        const player = new BasicAIPlayer({ rng: () => 0 });
        const result = await player.doYouWantThisTrump({
            proposedTrumpCard: jackSpades,
            dealer: Player.Partner,
            gameState: createPublicState([nineHearts, tenHearts, queenDiamonds, aceClubs])
        });

        expect(result).toEqual({ pickItUp: false, goAlone: false });
    });

    it("chooses required trump from available suits", async () => {
        const player = new BasicAIPlayer({ rng: () => 0 });
        const result = await player.doYouWantToPickTrump({
            availableSuits: [Suit.Hearts, Suit.Diamonds, Suit.Clubs],
            mustChooseTrump: true,
            gameState: createPublicState([nineHearts, tenHearts, queenDiamonds])
        });

        expect(result).not.toBeNull();
        expect([Suit.Hearts, Suit.Diamonds, Suit.Clubs]).toContain(result?.suit);
        expect(result?.goAlone).toBe(false);
    });

    it("passes optional weak second-round trump choices", async () => {
        const player = new BasicAIPlayer({ rng: () => 0 });
        const result = await player.doYouWantToPickTrump({
            availableSuits: [Suit.Hearts, Suit.Diamonds, Suit.Clubs],
            mustChooseTrump: false,
            gameState: createPublicState([nineHearts, queenDiamonds, nineClubs])
        });

        expect(result).toBeNull();
    });

    it("discards a card from the provided hand", async () => {
        const hand = [jackSpades, nineHearts, tenHearts];
        const player = new BasicAIPlayer({ rng: () => 0 });
        const discard = await player.chooseDealerDiscard({
            hand,
            pickedUpCard: jackSpades,
            gameState: createPublicState(hand, Suit.Spades)
        });

        expect(hand).toContainEqual(discard);
        expect(discard).toEqual(nineHearts);
    });

    it("plays one of the legal cards", async () => {
        const legalCards = [nineHearts, tenHearts];
        const player = new BasicAIPlayer({ rng: () => 0 });
        const card = await player.chooseCardToPlay({
            hand: [jackSpades, ...legalCards],
            legalCards,
            gameState: createPlayingState([jackSpades, ...legalCards], Suit.Spades, false)
        });

        expect(legalCards).toContainEqual(card);
    });

    it("uses injected RNG for exact tie choices", async () => {
        const player = new BasicAIPlayer({ rng: () => 0.99 });
        const card = await player.chooseCardToPlay({
            hand: [nineHearts, tenHearts],
            legalCards: [nineHearts, tenHearts],
            gameState: createPublicState([nineHearts, tenHearts])
        });

        expect(card).toEqual(tenHearts);
    });

    it("can seat four AI players and complete a game", async () => {
        const players: Readonly<Record<PositionalPlayer, IPlayer>> = {
            [PositionalPlayer.North]: new BasicAIPlayer({ rng: () => 0 }),
            [PositionalPlayer.East]: new BasicAIPlayer({ rng: () => 0 }),
            [PositionalPlayer.South]: new BasicAIPlayer({ rng: () => 0 }),
            [PositionalPlayer.West]: new BasicAIPlayer({ rng: () => 0 })
        };

        const result = await runGame(players, {
            config: { targetScore: 1, stickTheDealer: true },
            rng: () => 0
        });

        expect(result.finalState.phase.kind).toBe("GameComplete");
        expect([Team.NorthSouth, Team.EastWest]).toContain(result.winner);
    });
});

/**
 * Creates a public game state for decision tests.
 *
 * @param hand - Cards visible to the AI.
 * @param trump - Optional active trump suit.
 * @returns Public game state with hand-bearing phase.
 * @sideEffects None.
 */
function createPublicState(hand: readonly ICard[], trump?: Suit): IGameStatePublic {
    return {
        config: { targetScore: 10, stickTheDealer: false },
        handNumber: 1,
        dealer: Player.Partner,
        score: {
            [Team.NorthSouth]: 0,
            [Team.EastWest]: 0
        },
        phase: {
            kind: "Dealing",
            hand: {
                hand,
                dealer: Player.Partner,
                playedCards: [],
                completedTricks: [],
                ...(trump === undefined ? {} : { trump })
            }
        }
    };
}

/**
 * Creates a public playing-trick state.
 *
 * @param hand - Cards visible to the AI.
 * @param trump - Active trump suit.
 * @param leading - Whether the AI is leading the trick.
 * @returns Public game state in the playing phase.
 * @sideEffects None.
 */
function createPlayingState(hand: readonly ICard[], trump: Suit, leading: boolean): IGameStatePublic {
    return {
        ...createPublicState(hand, trump),
        phase: {
            kind: "PlayingTrick",
            hand: {
                hand,
                dealer: Player.Partner,
                playedCards: [],
                completedTricks: [],
                trump
            },
            trick: {
                leader: Player.Self,
                currentPlayer: Player.Self,
                plays: leading ? [] : [{ player: Player.LeftOpponent, card: aceClubs }],
                tricksTaken: {
                    [Player.Self]: 0,
                    [Player.LeftOpponent]: 0,
                    [Player.Partner]: 0,
                    [Player.RightOpponent]: 0
                }
            }
        }
    };
}
