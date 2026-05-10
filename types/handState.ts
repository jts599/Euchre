import { ICard, IPlayedCard } from "./cards";
import { Player, PositionalPlayer, Suit } from "./enums";
import { ICompletedTrickPrivate, ICompletedTrickPublic } from "./trickState";

/**
 * Complete hand-level state owned by the game engine.
 */
export interface IHandStatePrivate {
    hands: Readonly<Record<PositionalPlayer, readonly ICard[]>>;
    kitty: readonly ICard[];
    upCard: ICard;
    dealer: PositionalPlayer;
    playedCards: readonly IPlayedCard<PositionalPlayer>[];
    completedTricks: readonly ICompletedTrickPrivate[];
    trump?: Suit;
    maker?: PositionalPlayer;
    goingAlone?: PositionalPlayer;
    turnedDownSuit?: Suit;
}

/**
 * Legal hand-level information visible to one player perspective.
 */
export interface IHandStatePublic {
    hand: readonly ICard[];
    upCard?: ICard;
    dealer: Player;
    playedCards: readonly IPlayedCard<Player>[];
    completedTricks: readonly ICompletedTrickPublic[];
    trump?: Suit;
    maker?: Player;
    goingAlone?: Player;
    turnedDownSuit?: Suit;
}
