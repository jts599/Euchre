import { ICard } from "./cards";
import { Player,Suit } from "./enums";
import { IGameStatePublic } from "./gameState";

/**
 * Player response for a first-round trump order decision.
 */
export interface ITrumpCardResult {
    pickItUp: boolean;
    goAlone: boolean;
}

/**
 * Player-facing request for deciding whether the dealer should pick up the upcard.
 */
export interface ITrumpCardRequest {
    proposedTrumpCard: ICard;
    dealer: Player;
    gameState: IGameStatePublic;
}

/**
 * Player-facing request for choosing trump in the second ordering round.
 */
export interface ITrumpChoiceRequest {
    availableSuits: Suit[];
    
    /**
     * True when this player must choose trump, such as stick-the-dealer.
     */
    mustChooseTrump: boolean;
    gameState: IGameStatePublic;
}

/**
 * Player response for a second-round trump choice.
 */
export interface ITrumpChoice {
    suit: Suit;
    goAlone: boolean;
}

export type TrumpChoiceResult = ITrumpChoice | null;

/**
 * Player-facing request for choosing a card to play.
 */
export interface ICardPlayRequest {
    hand: readonly ICard[];
    legalCards: readonly ICard[];
    gameState: IGameStatePublic;
}

/**
 * Player-facing request for discarding after picking up the trump card.
 */
export interface IDealerDiscardRequest {
    hand: readonly ICard[];
    pickedUpCard: ICard;
    gameState: IGameStatePublic;
}

/**
 * Decision contract implemented by a Euchre-playing strategy.
 */
export interface IPlayer {
    doYouWantThisTrump(proposal: ITrumpCardRequest): Promise<ITrumpCardResult>;
    doYouWantToPickTrump(proposal: ITrumpChoiceRequest): Promise<TrumpChoiceResult>;
    chooseCardToPlay(request: ICardPlayRequest): Promise<ICard>;
    chooseDealerDiscard(request: IDealerDiscardRequest): Promise<ICard>;
}

/**
 * Optional observer contract for UI or network clients receiving public state updates.
 */
export interface IPlayerObserver {
    onStateChange(state: IGameStatePublic): void | Promise<void>;
}
