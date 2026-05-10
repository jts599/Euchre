import { IPlayedCard } from "./cards";
import { GamePhasePrivate, GamePhasePublic, IGameStatePrivate, IGameStatePublic, Team } from "./gameState";
import { IHandStatePrivate, IHandStatePublic } from "./handState";
import { ICompletedTrickPrivate, ICompletedTrickPublic, ITrickStatePrivate, ITrickStatePublic } from "./trickState";
import { Player, PositionalPlayer } from "./enums";
import { toRelativePlayer } from "./playerPerspective";

/**
 * Converts private game state into legal public state for one player.
 *
 * @param privateState - Complete engine-owned game state.
 * @param perspective - Absolute seat receiving the public state.
 * @returns Public game state with all player identifiers made relative.
 * @throws Error when nested player conversion receives an invalid seat.
 * @sideEffects None.
 */
export function toPublicGameState(
    privateState: IGameStatePrivate,
    perspective: PositionalPlayer
): IGameStatePublic {
    return {
        config: privateState.config,
        handNumber: privateState.handNumber,
        dealer: toRelativePlayer(perspective, privateState.dealer),
        score: privateState.score,
        phase: toPublicGamePhase(privateState.phase, perspective)
    };
}

/**
 * Converts a private phase union into the matching public phase union.
 *
 * @param phase - Private phase state to convert.
 * @param perspective - Absolute seat receiving the public phase.
 * @returns Public phase state with hidden information removed.
 * @throws Error when an unsupported phase kind is provided.
 * @sideEffects None.
 */
export function toPublicGamePhase(phase: GamePhasePrivate, perspective: PositionalPlayer): GamePhasePublic {
    switch (phase.kind) {
        case "Dealing":
            return { kind: phase.kind, hand: toPublicHandState(phase.hand, perspective) };
        case "OrderingTrump":
            return {
                kind: phase.kind,
                hand: toPublicHandState(phase.hand, perspective),
                currentPlayer: toRelativePlayer(perspective, phase.currentPlayer),
                proposedTrumpCard: phase.proposedTrumpCard,
                passes: phase.passes.map((player) => toRelativePlayer(perspective, player))
            };
        case "DealerDiscard":
            return {
                kind: phase.kind,
                hand: toPublicHandState(phase.hand, perspective),
                dealer: toRelativePlayer(perspective, phase.hand.dealer),
                pickedUpCard: phase.pickedUpCard,
                ...(phase.hand.dealer === perspective ? { dealerHand: phase.dealerHand } : {})
            };
        case "ChoosingTrump":
            return {
                kind: phase.kind,
                hand: toPublicHandState(phase.hand, perspective),
                currentPlayer: toRelativePlayer(perspective, phase.currentPlayer),
                availableSuits: phase.availableSuits,
                mustChooseTrump: phase.mustChooseTrump,
                passes: phase.passes.map((player) => toRelativePlayer(perspective, player))
            };
        case "PlayingTrick":
            return {
                kind: phase.kind,
                hand: toPublicHandState(phase.hand, perspective),
                trick: toPublicTrickState(phase.trick, perspective)
            };
        case "ScoringHand":
            return {
                kind: phase.kind,
                hand: toPublicHandState(phase.hand, perspective),
                pointsAwarded: phase.pointsAwarded,
                scoringTeam: phase.scoringTeam,
                completedTricks: phase.completedTricks.map((trick) => toPublicCompletedTrick(trick, perspective))
            };
        case "GameComplete":
            return {
                kind: phase.kind,
                winner: phase.winner,
                finalScore: phase.finalScore
            };
    }
}

/**
 * Converts complete private hand state into legal public hand state.
 *
 * @param privateHand - Engine-owned hand state containing all hidden cards.
 * @param perspective - Absolute seat receiving the public hand state.
 * @returns Public hand state with only the perspective player's hand exposed.
 * @throws Error when nested player conversion receives an invalid seat.
 * @sideEffects None.
 */
export function toPublicHandState(
    privateHand: IHandStatePrivate,
    perspective: PositionalPlayer
): IHandStatePublic {
    return {
        hand: privateHand.hands[perspective],
        upCard: privateHand.upCard,
        dealer: toRelativePlayer(perspective, privateHand.dealer),
        playedCards: privateHand.playedCards.map((card) => toPublicPlayedCard(card, perspective)),
        completedTricks: privateHand.completedTricks.map((trick) => toPublicCompletedTrick(trick, perspective)),
        ...optionalProperty("trump", privateHand.trump),
        ...optionalProperty("maker", convertOptionalPlayer(privateHand.maker, perspective)),
        ...optionalProperty("goingAlone", convertOptionalPlayer(privateHand.goingAlone, perspective)),
        ...optionalProperty("turnedDownSuit", privateHand.turnedDownSuit)
    };
}

/**
 * Converts private current-trick state into public current-trick state.
 *
 * @param privateTrick - Engine-owned current trick state.
 * @param perspective - Absolute seat receiving the public trick state.
 * @returns Public trick state with relative player identifiers.
 * @throws Error when nested player conversion receives an invalid seat.
 * @sideEffects None.
 */
export function toPublicTrickState(
    privateTrick: ITrickStatePrivate,
    perspective: PositionalPlayer
): ITrickStatePublic {
    return {
        leader: toRelativePlayer(perspective, privateTrick.leader),
        currentPlayer: toRelativePlayer(perspective, privateTrick.currentPlayer),
        plays: privateTrick.plays.map((card) => toPublicPlayedCard(card, perspective)),
        tricksTaken: toPublicPlayerRecord(privateTrick.tricksTaken, perspective)
    };
}

/**
 * Converts a completed private trick into public relative form.
 *
 * @param privateTrick - Completed trick using absolute table positions.
 * @param perspective - Absolute seat receiving the public trick.
 * @returns Completed trick using relative player labels.
 * @throws Error when nested player conversion receives an invalid seat.
 * @sideEffects None.
 */
export function toPublicCompletedTrick(
    privateTrick: ICompletedTrickPrivate,
    perspective: PositionalPlayer
): ICompletedTrickPublic {
    return {
        leader: toRelativePlayer(perspective, privateTrick.leader),
        winner: toRelativePlayer(perspective, privateTrick.winner),
        plays: privateTrick.plays.map((card) => toPublicPlayedCard(card, perspective))
    };
}

/**
 * Converts a played card from absolute to relative player labels.
 *
 * @param playedCard - Played card using absolute table positions.
 * @param perspective - Absolute seat receiving the public played card.
 * @returns Played card using a relative player label.
 * @throws Error when player conversion receives an invalid seat.
 * @sideEffects None.
 */
export function toPublicPlayedCard(
    playedCard: IPlayedCard<PositionalPlayer>,
    perspective: PositionalPlayer
): IPlayedCard<Player> {
    return {
        card: playedCard.card,
        player: toRelativePlayer(perspective, playedCard.player)
    };
}

/**
 * Converts a positional-player keyed record into a relative-player keyed record.
 *
 * @param record - Record keyed by absolute table positions.
 * @param perspective - Absolute seat receiving the public record.
 * @returns Record keyed by relative player labels.
 * @throws Error when player conversion receives an invalid seat.
 * @sideEffects None.
 */
export function toPublicPlayerRecord<T>(
    record: Readonly<Record<PositionalPlayer, T>>,
    perspective: PositionalPlayer
): Readonly<Record<Player, T>> {
    return {
        [Player.Self]: record[perspective],
        [Player.LeftOpponent]: record[toAbsoluteOffset(perspective, 1)],
        [Player.Partner]: record[toAbsoluteOffset(perspective, 2)],
        [Player.RightOpponent]: record[toAbsoluteOffset(perspective, 3)]
    };
}

/**
 * Converts an optional private player value into public relative form.
 *
 * @param player - Optional absolute seat to convert.
 * @param perspective - Absolute seat receiving public state.
 * @returns Relative player label when the source value exists.
 * @throws Error when player conversion receives an invalid seat.
 * @sideEffects None.
 */
function convertOptionalPlayer(player: PositionalPlayer | undefined, perspective: PositionalPlayer): Player | undefined {
    return player === undefined ? undefined : toRelativePlayer(perspective, player);
}

/**
 * Returns the absolute player at a clockwise offset from a perspective.
 *
 * @param perspective - Absolute seat used as the starting point.
 * @param offset - Clockwise offset from the starting seat.
 * @returns Absolute seat at the requested offset.
 * @sideEffects None.
 */
function toAbsoluteOffset(perspective: PositionalPlayer, offset: number): PositionalPlayer {
    return ((perspective + offset) % 4) as PositionalPlayer;
}

/**
 * Builds an object containing one optional property only when the value exists.
 *
 * @param key - Property name to include when `value` is defined.
 * @param value - Optional property value.
 * @returns Empty object when value is undefined; otherwise a single-property object.
 * @sideEffects None.
 */
function optionalProperty<TKey extends string, TValue>(
    key: TKey,
    value: TValue | undefined
): Partial<Record<TKey, TValue>> {
    return value === undefined ? {} : { [key]: value } as Record<TKey, TValue>;
}
