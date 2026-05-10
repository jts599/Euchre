import { Rank, Suit } from './enums';

/**
 * A single card from a Euchre deck.
 */
export interface ICard {
    suit: Suit;
    rank: Rank;
}

/**
 * A card that has been played by either an absolute or relative player.
 *
 * @template TPlayer - The player identifier type used by the state layer.
 */
export interface IPlayedCard<TPlayer> {
    card: ICard;
    player: TPlayer;
}
