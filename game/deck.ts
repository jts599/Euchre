import { ICard } from "../types/cards";
import { PositionalPlayer, Rank, Suit } from "../types/enums";

/**
 * Random number generator used by the engine.
 */
export type Rng = () => number;

const SUITS: readonly Suit[] = [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades];
const RANKS: readonly Rank[] = [Rank.Nine, Rank.Ten, Rank.Jack, Rank.Queen, Rank.King, Rank.Ace];

/**
 * Creates a standard 24-card Euchre deck.
 *
 * @returns New deck containing 9 through Ace in all four suits.
 * @sideEffects None.
 */
export function createDeck(): ICard[] {
    return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

/**
 * Shuffles a deck using Fisher-Yates and an injectable RNG.
 *
 * @param cards - Cards to shuffle.
 * @param rng - Random number generator returning values in [0, 1).
 * @returns New shuffled card array.
 * @sideEffects None.
 */
export function shuffleCards(cards: readonly ICard[], rng: Rng): ICard[] {
    const shuffledCards = [...cards];

    for (let index = shuffledCards.length - 1; index > 0; index -= 1) {
        const targetIndex = Math.floor(rng() * (index + 1));
        const currentCard = shuffledCards[index] as ICard;
        shuffledCards[index] = shuffledCards[targetIndex] as ICard;
        shuffledCards[targetIndex] = currentCard;
    }

    return shuffledCards;
}

/**
 * Deals five cards to each player and leaves a four-card kitty.
 *
 * @param deck - Shuffled 24-card Euchre deck.
 * @returns Player hands and kitty.
 * @throws Error when the deck does not contain exactly 24 cards.
 * @sideEffects None.
 */
export function dealCards(deck: readonly ICard[]): {
    hands: Readonly<Record<PositionalPlayer, readonly ICard[]>>;
    kitty: readonly ICard[];
} {
    if (deck.length !== 24) {
        throw new Error(`Cannot deal Euchre hand from ${deck.length} cards.`);
    }

    return {
        hands: {
            [PositionalPlayer.North]: deck.slice(0, 5),
            [PositionalPlayer.East]: deck.slice(5, 10),
            [PositionalPlayer.South]: deck.slice(10, 15),
            [PositionalPlayer.West]: deck.slice(15, 20)
        },
        kitty: deck.slice(20)
    };
}
