import { ICard } from "./cards";
import { IHandStatePrivate, IHandStatePublic } from "./handState";
import { ICompletedTrickPrivate, ICompletedTrickPublic, ITrickStatePrivate, ITrickStatePublic } from "./trickState";
import { Player, PositionalPlayer, Suit } from "./enums";

/**
 * Fixed team labels for a standard four-player Euchre table.
 */
export enum Team {
    NorthSouth = "NorthSouth",
    EastWest = "EastWest"
}

/**
 * Configurable rules for a standard Euchre game.
 */
export interface IGameConfig {
    targetScore: number;
    stickTheDealer: boolean;
}

/**
 * Complete private game state owned by the engine.
 */
export interface IGameStatePrivate {
    config: IGameConfig;
    handNumber: number;
    dealer: PositionalPlayer;
    score: Readonly<Record<Team, number>>;
    phase: GamePhasePrivate;
}

/**
 * Legal public game state exposed to one player perspective.
 */
export interface IGameStatePublic {
    config: IGameConfig;
    handNumber: number;
    dealer: Player;
    score: Readonly<Record<Team, number>>;
    phase: GamePhasePublic;
}

/**
 * Private state variants for every supported game phase.
 */
export type GamePhasePrivate =
    | IDealingPhasePrivate
    | IOrderingTrumpPhasePrivate
    | IDealerDiscardPhasePrivate
    | IChoosingTrumpPhasePrivate
    | IPlayingTrickPhasePrivate
    | IScoringHandPhasePrivate
    | IGameCompletePhasePrivate;

/**
 * Public state variants for every supported game phase.
 */
export type GamePhasePublic =
    | IDealingPhasePublic
    | IOrderingTrumpPhasePublic
    | IDealerDiscardPhasePublic
    | IChoosingTrumpPhasePublic
    | IPlayingTrickPhasePublic
    | IScoringHandPhasePublic
    | IGameCompletePhasePublic;

/**
 * Private phase while cards have been dealt and the upcard is known.
 */
export interface IDealingPhasePrivate {
    kind: "Dealing";
    hand: IHandStatePrivate;
}

/**
 * Public phase while cards have been dealt and the upcard is known.
 */
export interface IDealingPhasePublic {
    kind: "Dealing";
    hand: IHandStatePublic;
}

/**
 * Private first-round trump-ordering phase.
 */
export interface IOrderingTrumpPhasePrivate {
    kind: "OrderingTrump";
    hand: IHandStatePrivate;
    currentPlayer: PositionalPlayer;
    proposedTrumpCard: ICard;
    passes: readonly PositionalPlayer[];
}

/**
 * Public first-round trump-ordering phase.
 */
export interface IOrderingTrumpPhasePublic {
    kind: "OrderingTrump";
    hand: IHandStatePublic;
    currentPlayer: Player;
    proposedTrumpCard: ICard;
    passes: readonly Player[];
}

/**
 * Private dealer-discard phase after trump has been ordered.
 */
export interface IDealerDiscardPhasePrivate {
    kind: "DealerDiscard";
    hand: IHandStatePrivate;
    dealerHand: readonly ICard[];
    pickedUpCard: ICard;
}

/**
 * Public dealer-discard phase; dealer-only hand visibility is controlled by conversion.
 */
export interface IDealerDiscardPhasePublic {
    kind: "DealerDiscard";
    hand: IHandStatePublic;
    dealer: Player;
    dealerHand?: readonly ICard[];
    pickedUpCard: ICard;
}

/**
 * Private second-round trump-choice phase.
 */
export interface IChoosingTrumpPhasePrivate {
    kind: "ChoosingTrump";
    hand: IHandStatePrivate;
    currentPlayer: PositionalPlayer;
    availableSuits: readonly Suit[];
    mustChooseTrump: boolean;
    passes: readonly PositionalPlayer[];
}

/**
 * Public second-round trump-choice phase.
 */
export interface IChoosingTrumpPhasePublic {
    kind: "ChoosingTrump";
    hand: IHandStatePublic;
    currentPlayer: Player;
    availableSuits: readonly Suit[];
    mustChooseTrump: boolean;
    passes: readonly Player[];
}

/**
 * Private trick-play phase.
 */
export interface IPlayingTrickPhasePrivate {
    kind: "PlayingTrick";
    hand: IHandStatePrivate;
    trick: ITrickStatePrivate;
}

/**
 * Public trick-play phase.
 */
export interface IPlayingTrickPhasePublic {
    kind: "PlayingTrick";
    hand: IHandStatePublic;
    trick: ITrickStatePublic;
}

/**
 * Private hand-scoring phase.
 */
export interface IScoringHandPhasePrivate {
    kind: "ScoringHand";
    hand: IHandStatePrivate;
    pointsAwarded: number;
    scoringTeam: Team;
    completedTricks: readonly ICompletedTrickPrivate[];
}

/**
 * Public hand-scoring phase.
 */
export interface IScoringHandPhasePublic {
    kind: "ScoringHand";
    hand: IHandStatePublic;
    pointsAwarded: number;
    scoringTeam: Team;
    completedTricks: readonly ICompletedTrickPublic[];
}

/**
 * Private terminal game-complete phase.
 */
export interface IGameCompletePhasePrivate {
    kind: "GameComplete";
    winner: Team;
    finalScore: Readonly<Record<Team, number>>;
}

/**
 * Public terminal game-complete phase.
 */
export interface IGameCompletePhasePublic {
    kind: "GameComplete";
    winner: Team;
    finalScore: Readonly<Record<Team, number>>;
}
