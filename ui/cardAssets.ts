import { ICard } from "../types/cards";
import { Rank, Suit } from "../types/enums";

/**
 * URL for the opponent card-back SVG asset.
 */
export const OPPONENT_CARD_BACK_ASSET_URL = new URL("./assets/cards/2B.svg", import.meta.url).href;

/**
 * URL for the teammate card-back SVG asset.
 */
export const TEAMMATE_CARD_BACK_ASSET_URL = new URL("./assets/cards/2B-blue.svg", import.meta.url).href;

/**
 * Returns the SVG asset URL for one standalone suit symbol.
 *
 * @param suit - Suit to map to a local symbol asset.
 * @returns Browser-resolvable SVG URL for the suit symbol.
 * @sideEffects None.
 */
export function getSuitAssetUrl(suit: Suit): string {
    return new URL(`./assets/suits/${getSuitAssetFileName(suit)}`, import.meta.url).href;
}

/**
 * Returns the SVG asset URL for one visible card.
 *
 * @param card - Card to map to an SVG asset.
 * @returns Browser-resolvable SVG URL for the card.
 * @sideEffects None.
 */
export function getCardAssetUrl(card: ICard): string {
    return new URL(`./assets/cards/${getCardAssetFileName(card)}`, import.meta.url).href;
}

/**
 * Returns the SVG file name for one visible card.
 *
 * @param card - Card to map to the local asset naming convention.
 * @returns SVG file name using rank prefix and suit suffix.
 * @sideEffects None.
 */
export function getCardAssetFileName(card: ICard): string {
    return `${getRankAssetCode(card.rank)}${getSuitAssetCode(card.suit)}.svg`;
}

/**
 * Returns the rank code used by the SVG card assets.
 *
 * @param rank - Euchre card rank.
 * @returns Single-character rank asset code.
 * @sideEffects None.
 */
function getRankAssetCode(rank: Rank): string {
    return rank === Rank.Ten ? "T" : rank;
}

/**
 * Returns the suit code used by the SVG card assets.
 *
 * @param suit - Card suit.
 * @returns Single-character suit asset code.
 * @sideEffects None.
 */
function getSuitAssetCode(suit: Suit): string {
    switch (suit) {
        case Suit.Hearts:
            return "H";
        case Suit.Diamonds:
            return "D";
        case Suit.Clubs:
            return "C";
        case Suit.Spades:
            return "S";
    }
}

/**
 * Returns the suit symbol file name for a suit.
 *
 * @param suit - Suit to map to the local symbol asset naming convention.
 * @returns SVG file name for the suit symbol.
 * @sideEffects None.
 */
function getSuitAssetFileName(suit: Suit): string {
    switch (suit) {
        case Suit.Hearts:
            return "hearts.svg";
        case Suit.Diamonds:
            return "diamonds.svg";
        case Suit.Clubs:
            return "clubs.svg";
        case Suit.Spades:
            return "spades.svg";
    }
}
