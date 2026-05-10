import { ICard, IPlayedCard } from "../types/cards";
import { PositionalPlayer, Rank, Suit } from "../types/enums";
import { Team } from "../types/gameState";
import { getTeam } from "./positions";

const CARD_POINTS: Readonly<Record<Rank, number>> = {
    [Rank.Nine]: 1,
    [Rank.Ten]: 2,
    [Rank.Jack]: 3,
    [Rank.Queen]: 4,
    [Rank.King]: 5,
    [Rank.Ace]: 6
};

/**
 * Checks whether two cards have the same rank and printed suit.
 *
 * @param firstCard - First card to compare.
 * @param secondCard - Second card to compare.
 * @returns True when rank and suit are equal.
 * @sideEffects None.
 */
export function cardsEqual(firstCard: ICard, secondCard: ICard): boolean {
    return firstCard.rank === secondCard.rank && firstCard.suit === secondCard.suit;
}

/**
 * Finds the first index of a card in a hand.
 *
 * @param hand - Cards to search.
 * @param card - Card to locate.
 * @returns Index of the card, or -1 when absent.
 * @sideEffects None.
 */
export function findCardIndex(hand: readonly ICard[], card: ICard): number {
    return hand.findIndex((handCard) => cardsEqual(handCard, card));
}

/**
 * Removes one matching card from a hand.
 *
 * @param hand - Source hand.
 * @param card - Card to remove.
 * @returns New hand without the first matching card.
 * @throws Error when the card is not present.
 * @sideEffects None.
 */
export function removeCard(hand: readonly ICard[], card: ICard): readonly ICard[] {
    const cardIndex = findCardIndex(hand, card);

    if (cardIndex < 0) {
        throw new Error(`Card ${formatCard(card)} is not in hand.`);
    }

    return [...hand.slice(0, cardIndex), ...hand.slice(cardIndex + 1)];
}

/**
 * Returns the card's effective suit after left-bower promotion.
 *
 * @param card - Card to evaluate.
 * @param trump - Current trump suit.
 * @returns Effective suit for follow-suit and trick comparison.
 * @sideEffects None.
 */
export function getEffectiveSuit(card: ICard, trump: Suit): Suit {
    return isLeftBower(card, trump) ? trump : card.suit;
}

/**
 * Returns legal cards for a trick play.
 *
 * @param hand - Player hand.
 * @param leadCard - First card in the trick, when any.
 * @param trump - Current trump suit.
 * @returns Legal cards respecting follow-suit.
 * @sideEffects None.
 */
export function getLegalCards(hand: readonly ICard[], leadCard: ICard | undefined, trump: Suit): readonly ICard[] {
    if (leadCard === undefined) {
        return hand;
    }

    const leadSuit = getEffectiveSuit(leadCard, trump);
    const followingCards = hand.filter((card) => getEffectiveSuit(card, trump) === leadSuit);

    return followingCards.length > 0 ? followingCards : hand;
}

/**
 * Determines the winning play for a completed trick.
 *
 * @param plays - Cards played to the trick in play order.
 * @param trump - Current trump suit.
 * @returns Winning played card.
 * @throws Error when the trick has no plays.
 * @sideEffects None.
 */
export function getTrickWinner(
    plays: readonly IPlayedCard<PositionalPlayer>[],
    trump: Suit
): IPlayedCard<PositionalPlayer> {
    const firstPlay = plays[0];

    if (firstPlay === undefined) {
        throw new Error("Cannot determine winner of an empty trick.");
    }

    const leadSuit = getEffectiveSuit(firstPlay.card, trump);

    return plays.reduce((winningPlay, currentPlay) => {
        return getCardPower(currentPlay.card, trump, leadSuit) > getCardPower(winningPlay.card, trump, leadSuit)
            ? currentPlay
            : winningPlay;
    }, firstPlay);
}

/**
 * Scores a completed hand.
 *
 * @param maker - Player who chose trump.
 * @param goingAlone - Player going alone, when any.
 * @param tricksTaken - Tricks taken by each absolute player.
 * @returns Team and points awarded for the hand.
 * @sideEffects None.
 */
export function scoreHand(
    maker: PositionalPlayer,
    goingAlone: PositionalPlayer | undefined,
    tricksTaken: Readonly<Record<PositionalPlayer, number>>
): { scoringTeam: Team; pointsAwarded: number } {
    const makerTeam = getTeam(maker);
    const makerTricks = sumTeamTricks(makerTeam, tricksTaken);

    if (makerTricks < 3) {
        return { scoringTeam: opposingTeam(makerTeam), pointsAwarded: 2 };
    }

    if (makerTricks === 5) {
        return { scoringTeam: makerTeam, pointsAwarded: goingAlone === undefined ? 2 : 4 };
    }

    return { scoringTeam: makerTeam, pointsAwarded: 1 };
}

/**
 * Formats a card for validation errors.
 *
 * @param card - Card to format.
 * @returns Compact card label.
 * @sideEffects None.
 */
export function formatCard(card: ICard): string {
    return `${card.rank} of ${card.suit}`;
}

/**
 * Returns the same-color suit for bower rules.
 *
 * @param suit - Suit to pair.
 * @returns Suit of the same color.
 * @sideEffects None.
 */
function sameColorSuit(suit: Suit): Suit {
    switch (suit) {
        case Suit.Hearts:
            return Suit.Diamonds;
        case Suit.Diamonds:
            return Suit.Hearts;
        case Suit.Clubs:
            return Suit.Spades;
        case Suit.Spades:
            return Suit.Clubs;
    }
}

/**
 * Checks whether a card is the left bower for trump.
 *
 * @param card - Card to evaluate.
 * @param trump - Current trump suit.
 * @returns True when card is the same-color jack.
 * @sideEffects None.
 */
function isLeftBower(card: ICard, trump: Suit): boolean {
    return card.rank === Rank.Jack && card.suit === sameColorSuit(trump);
}

/**
 * Checks whether a card is the right bower for trump.
 *
 * @param card - Card to evaluate.
 * @param trump - Current trump suit.
 * @returns True when card is the trump jack.
 * @sideEffects None.
 */
function isRightBower(card: ICard, trump: Suit): boolean {
    return card.rank === Rank.Jack && card.suit === trump;
}

/**
 * Returns comparable trick power for one card.
 *
 * @param card - Card to score.
 * @param trump - Current trump suit.
 * @param leadSuit - Effective lead suit.
 * @returns Numeric power where higher wins.
 * @sideEffects None.
 */
function getCardPower(card: ICard, trump: Suit, leadSuit: Suit): number {
    if (isRightBower(card, trump)) {
        return 200;
    }

    if (isLeftBower(card, trump)) {
        return 199;
    }

    if (getEffectiveSuit(card, trump) === trump) {
        return 100 + CARD_POINTS[card.rank];
    }

    if (getEffectiveSuit(card, trump) === leadSuit) {
        return CARD_POINTS[card.rank];
    }

    return 0;
}

/**
 * Sums tricks for one fixed partnership.
 *
 * @param team - Team to sum.
 * @param tricksTaken - Trick counts keyed by absolute player.
 * @returns Total tricks for the team.
 * @sideEffects None.
 */
function sumTeamTricks(team: Team, tricksTaken: Readonly<Record<PositionalPlayer, number>>): number {
    if (team === Team.NorthSouth) {
        return tricksTaken[PositionalPlayer.North] + tricksTaken[PositionalPlayer.South];
    }

    return tricksTaken[PositionalPlayer.East] + tricksTaken[PositionalPlayer.West];
}

/**
 * Returns the opposing fixed partnership.
 *
 * @param team - Team to oppose.
 * @returns Opposing team.
 * @sideEffects None.
 */
function opposingTeam(team: Team): Team {
    return team === Team.NorthSouth ? Team.EastWest : Team.NorthSouth;
}
