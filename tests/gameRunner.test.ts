import { describe, expect, it } from "vitest";
import { ICard } from "../types/cards";
import { PositionalPlayer, Rank, Suit } from "../types/enums";
import { IGameStatePublic } from "../types/gameState";
import {
    ICardPlayRequest,
    IDealerDiscardRequest,
    IPlayer,
    ITrumpCardRequest,
    ITrumpCardResult,
    ITrumpChoiceRequest,
    TrumpChoiceResult
} from "../types/player";
import { runGame } from "../game";

const illegalCard: ICard = { suit: Suit.Spades, rank: Rank.Ace };

/**
 * Integration tests for the async game runner.
 */
describe("game runner", () => {
    it("runs a deterministic full game to completion", async () => {
        const result = await runGame(createPlayers({ orderUpSeat: PositionalPlayer.East }), {
            config: { targetScore: 1 },
            rng: () => 0
        });

        expect(result.finalState.phase.kind).toBe("GameComplete");
        expect(Math.max(...Object.values(result.finalScore))).toBeGreaterThanOrEqual(1);
        expect(result.handCount).toBe(1);
    });

    it("broadcasts public state for every player without hidden hands", async () => {
        const broadcasts: Array<{ player: PositionalPlayer; state: IGameStatePublic }> = [];

        await runGame(createPlayers({ orderUpSeat: PositionalPlayer.East }), {
            config: { targetScore: 1 },
            rng: () => 0,
            onPublicStateChange: (player, state) => {
                broadcasts.push({ player, state });
            }
        });

        const firstBroadcasts = broadcasts.slice(0, 4);

        expect(firstBroadcasts.map((broadcast) => broadcast.player)).toEqual([
            PositionalPlayer.North,
            PositionalPlayer.East,
            PositionalPlayer.South,
            PositionalPlayer.West
        ]);
        expect(firstBroadcasts.every((broadcast) => broadcast.state.phase.kind === "Dealing")).toBe(true);

        for (const broadcast of firstBroadcasts) {
            if (broadcast.state.phase.kind === "Dealing") {
                expect(broadcast.state.phase.hand.hand).toHaveLength(5);
                expect(broadcast.state.phase.hand).not.toHaveProperty("hands");
                expect(broadcast.state.phase.hand).not.toHaveProperty("kitty");
            }
        }
    });

    it("broadcasts an in-progress trick after the fourth card is accepted", async () => {
        const southStates: IGameStatePublic[] = [];

        await runGame(createPlayers({ orderUpSeat: PositionalPlayer.East }), {
            config: { targetScore: 1 },
            rng: () => 0,
            onPublicStateChange: (player, state) => {
                if (player === PositionalPlayer.South) {
                    southStates.push(state);
                }
            }
        });

        expect(southStates.some((state) => (
            state.phase.kind === "PlayingTrick" && state.phase.trick.plays.length === 4
        ))).toBe(true);
    });

    it("supports second-round trump selection after the upcard is turned down", async () => {
        const capturedSuits: Suit[][] = [];

        await runGame(createPlayers({
            chooseTrumpSeat: PositionalPlayer.East,
            onTrumpChoice: (request) => {
                capturedSuits.push([...request.availableSuits]);
            }
        }), {
            config: { targetScore: 1 },
            rng: () => 0
        });

        expect(capturedSuits.length).toBeGreaterThan(0);
        expect(capturedSuits[0]).not.toContain(Suit.Spades);
    });

    it("redeals with the next dealer after a passed-out hand", async () => {
        const result = await runGame(createPlayers({
            orderUpSeat: PositionalPlayer.East,
            passUntilHand: 2
        }), {
            config: { targetScore: 1 },
            dealer: PositionalPlayer.North,
            rng: () => 0
        });

        expect(result.handCount).toBe(2);
    });

    it("throws when the dealer discards a card not in hand", async () => {
        await expect(runGame(createPlayers({
            orderUpSeat: PositionalPlayer.East,
            discardCard: illegalCard
        }), {
            config: { targetScore: 1 },
            rng: () => 0
        })).rejects.toThrow(/Cannot discard/);
    });

    it("throws when a player chooses an unavailable trump suit", async () => {
        await expect(runGame(createPlayers({
            chooseTrumpSeat: PositionalPlayer.East,
            trumpSuit: Suit.Spades
        }), {
            config: { targetScore: 1 },
            rng: () => 0
        })).rejects.toThrow(/unavailable trump suit/);
    });

    it("throws when a player chooses an illegal card", async () => {
        await expect(runGame(createPlayers({
            orderUpSeat: PositionalPlayer.East,
            playCard: illegalCard
        }), {
            config: { targetScore: 1 },
            rng: () => 0
        })).rejects.toThrow(/not in hand|cannot legally play/);
    });
});

interface IScriptOptions {
    orderUpSeat?: PositionalPlayer;
    chooseTrumpSeat?: PositionalPlayer;
    passUntilHand?: number;
    trumpSuit?: Suit;
    discardCard?: ICard;
    playCard?: ICard;
    onTrumpChoice?: (request: ITrumpChoiceRequest) => void;
}

/**
 * Creates scripted player implementations for runner tests.
 *
 * @param options - Script controls for player decisions.
 * @returns Player implementations keyed by absolute position.
 * @sideEffects None.
 */
function createPlayers(options: IScriptOptions): Readonly<Record<PositionalPlayer, IPlayer>> {
    return {
        [PositionalPlayer.North]: createPlayer(PositionalPlayer.North, options),
        [PositionalPlayer.East]: createPlayer(PositionalPlayer.East, options),
        [PositionalPlayer.South]: createPlayer(PositionalPlayer.South, options),
        [PositionalPlayer.West]: createPlayer(PositionalPlayer.West, options)
    };
}

/**
 * Creates one scripted player.
 *
 * @param seat - Absolute player position.
 * @param options - Script controls for decisions.
 * @returns Scripted player implementation.
 * @sideEffects None.
 */
function createPlayer(seat: PositionalPlayer, options: IScriptOptions): IPlayer {
    return {
        doYouWantThisTrump: async (request) => chooseUpcard(seat, request, options),
        doYouWantToPickTrump: async (request) => chooseTrump(seat, request, options),
        chooseDealerDiscard: async (request) => options.discardCard ?? chooseFirst(request.hand),
        chooseCardToPlay: async (request) => options.playCard ?? chooseFirst(request.legalCards)
    };
}

/**
 * Chooses whether to order up the upcard.
 *
 * @param seat - Player seat.
 * @param request - Trump-card request.
 * @param options - Script controls.
 * @returns Trump-card decision.
 * @sideEffects None.
 */
function chooseUpcard(
    seat: PositionalPlayer,
    request: ITrumpCardRequest,
    options: IScriptOptions
): ITrumpCardResult {
    const shouldWait = request.gameState.handNumber < (options.passUntilHand ?? 1);

    return {
        pickItUp: !shouldWait && options.orderUpSeat === seat,
        goAlone: false
    };
}

/**
 * Chooses second-round trump.
 *
 * @param seat - Player seat.
 * @param request - Trump-choice request.
 * @param options - Script controls.
 * @returns Trump choice or pass.
 * @sideEffects Calls optional capture callback.
 */
function chooseTrump(
    seat: PositionalPlayer,
    request: ITrumpChoiceRequest,
    options: IScriptOptions
): TrumpChoiceResult {
    options.onTrumpChoice?.(request);

    if (request.gameState.handNumber < (options.passUntilHand ?? 1)) {
        return null;
    }

    if (options.chooseTrumpSeat !== seat) {
        return request.mustChooseTrump ? { suit: request.availableSuits[0] as Suit, goAlone: false } : null;
    }

    return {
        suit: options.trumpSuit ?? request.availableSuits[0] as Suit,
        goAlone: false
    };
}

/**
 * Returns the first card in a non-empty list.
 *
 * @param cards - Candidate cards.
 * @returns First card.
 * @throws Error when the list is empty.
 * @sideEffects None.
 */
function chooseFirst(cards: readonly ICard[]): ICard {
    const card = cards[0];

    if (card === undefined) {
        throw new Error("Scripted player received no cards to choose from.");
    }

    return card;
}
