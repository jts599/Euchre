import { ICard } from "./cards";
import { IPlayedCard } from "./cards";
import { Player, PositionalPlayer } from "./enums";

/**
 * A completed trick tracked with absolute engine positions.
 */
export interface ICompletedTrickPrivate {
    leader: PositionalPlayer;
    winner: PositionalPlayer;
    plays: readonly IPlayedCard<PositionalPlayer>[];
}

/**
 * A completed trick exposed from one player's perspective.
 */
export interface ICompletedTrickPublic {
    leader: Player;
    winner: Player;
    plays: readonly IPlayedCard<Player>[];
}

/**
 * Current trick state owned by the game engine.
 */
export interface ITrickStatePrivate {
    leader: PositionalPlayer;
    currentPlayer: PositionalPlayer;
    plays: readonly IPlayedCard<PositionalPlayer>[];
    tricksTaken: Readonly<Record<PositionalPlayer, number>>;
}

/**
 * Current trick state visible to one player perspective.
 */
export interface ITrickStatePublic {
    leader: Player;
    currentPlayer: Player;
    plays: readonly IPlayedCard<Player>[];
    tricksTaken: Readonly<Record<Player, number>>;
}
