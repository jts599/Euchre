import { ssrModuleExportsKey } from "vite/module-runner";
import { ICard } from "../types/cards";
import { Rank, Suit } from "../types/enums";
import { IHandStatePublic } from "../types/handState";
import {
    ICardPlayRequest,
    IDealerDiscardRequest,
    IPlayer,
    ITrumpCardRequest,
    ITrumpCardResult,
    ITrumpChoice,
    ITrumpChoiceRequest,
    TrumpChoiceResult
} from "../types/player";
import { sleep } from "../players/helpers";

/**
 * Constructor options for `BasicAIPlayer`.
 */
export interface IBasicAIPlayerOptions {
    rng?: () => number;
}

const TRUMP_CHOICE_THRESHOLD = 15;
const ORDER_UP_THRESHOLD = 17;

const RANK_POINTS: Readonly<Record<Rank, number>> = {
    [Rank.Nine]: 1,
    [Rank.Ten]: 2,
    [Rank.Jack]: 3,
    [Rank.Queen]: 4,
    [Rank.King]: 5,
    [Rank.Ace]: 6
};

/**
 * Basic legal Euchre AI that uses simple card-strength heuristics.
 */
export class BasicAIPlayer implements IPlayer {
    private readonly rng: () => number;

    /**
     * Creates a basic AI player.
     *
     * @param options - Optional RNG for deterministic tie-breaking.
     * @sideEffects Stores the RNG for future decisions.
     */
    public constructor(options: IBasicAIPlayerOptions = {}) {
        this.rng = options.rng ?? Math.random;
    }

    /**
     * Decides whether to order up the proposed trump card.
     *
     * @param request - First-round trump order request.
     * @returns Decision to order up when hand strength meets a simple threshold.
     * @sideEffects None.
     */
    public async doYouWantThisTrump(request: ITrumpCardRequest): Promise<ITrumpCardResult> {
        const handStrength = scoreHandForTrump(getPublicHand(request.gameState.phase).hand, request.proposedTrumpCard.suit);
        await sleep(1000);
        
        return {
            pickItUp: handStrength >= ORDER_UP_THRESHOLD,
            goAlone: false
        };
    }

    /**
     * Chooses trump in round two or passes when not forced.
     *
     * @param request - Second-round trump choice request.
     * @returns Best available suit when strong enough or required; otherwise null.
     * @sideEffects None.
     */
    public async doYouWantToPickTrump(request: ITrumpChoiceRequest): Promise<TrumpChoiceResult> {
        const bestChoice = chooseBestTrump(getPublicHand(request.gameState.phase).hand, request.availableSuits, this.rng);

        if (bestChoice.strength < TRUMP_CHOICE_THRESHOLD && !request.mustChooseTrump) {
            return null;
        }
        await sleep(1000);
        return {
            suit: bestChoice.suit,
            goAlone: false
        } satisfies ITrumpChoice;
    }

    /**
     * Chooses a card to play from the legal cards supplied by the engine.
     *
     * @param request - Card-play request with legal cards already filtered.
     * @returns A legal card to play.
     * @throws Error when no legal cards are available.
     * @sideEffects None.
     */
    public async chooseCardToPlay(request: ICardPlayRequest): Promise<ICard> {
        const trump = getPublicHand(request.gameState.phase).trump;

        if (request.legalCards.length === 0) {
            throw new Error("BasicAIPlayer cannot choose from an empty legal card list.");
        }

        if (trump === undefined) {
            return chooseRandom(request.legalCards, this.rng);
        }
        await sleep(1000);
        return isLeading(request)
            ? chooseStrongestCard(request.legalCards, trump, this.rng)
            : chooseWeakestCard(request.legalCards, trump, this.rng);
    }

    /**
     * Chooses a dealer discard from the post-pickup hand.
     *
     * @param request - Dealer discard request.
     * @returns Weakest card in the current hand.
     * @throws Error when the hand is empty.
     * @sideEffects None.
     */
    public async chooseDealerDiscard(request: IDealerDiscardRequest): Promise<ICard> {
        const trump = getPublicHand(request.gameState.phase).trump ?? request.pickedUpCard.suit;

        await sleep(1000);
        return chooseWeakestCard(request.hand, trump, this.rng);
    }
}

/**
 * Extracts public hand state from a decision-time phase.
 *
 * @param phase - Public phase supplied in a player request.
 * @returns Public hand state for the AI perspective.
 * @throws Error when called with a terminal game phase.
 * @sideEffects None.
 */
function getPublicHand(phase: { hand?: IHandStatePublic; kind: string }): IHandStatePublic {
    if (phase.hand === undefined) {
        throw new Error(`BasicAIPlayer cannot make a decision during ${phase.kind}.`);
    }

    return phase.hand;
}

/**
 * Chooses the strongest available trump suit.
 *
 * @param hand - Player hand.
 * @param availableSuits - Suits legal to choose.
 * @param rng - RNG used for exact tie-breaking.
 * @returns Best suit and its strength.
 * @throws Error when no suits are available.
 * @sideEffects None.
 */
function chooseBestTrump(
    hand: readonly ICard[],
    availableSuits: readonly Suit[],
    rng: () => number
): { suit: Suit; strength: number } {
    if (availableSuits.length === 0) {
        throw new Error("BasicAIPlayer cannot choose trump from an empty suit list.");
    }

    return chooseBest(
        availableSuits.map((suit) => ({ suit, strength: scoreHandForTrump(hand, suit) })),
        (choice) => choice.strength,
        rng
    );
}

/**
 * Scores a hand for a potential trump suit.
 *
 * @param hand - Player hand.
 * @param trump - Candidate trump suit.
 * @returns Heuristic strength score.
 * @sideEffects None.
 */
function scoreHandForTrump(hand: readonly ICard[], trump: Suit): number {
    return hand.reduce((score, card) => score + scoreCardForTrump(card, trump), 0);
}

/**
 * Scores one card relative to a trump suit.
 *
 * @param card - Card to score.
 * @param trump - Candidate or active trump suit.
 * @returns Heuristic card strength.
 * @sideEffects None.
 */
function scoreCardForTrump(card: ICard, trump: Suit): number {
    if (isRightBower(card, trump)) {
        return 12;
    }

    if (isLeftBower(card, trump)) {
        return 10;
    }

    if (getEffectiveSuit(card, trump) === trump) {
        return 5 + RANK_POINTS[card.rank];
    }

    return card.rank === Rank.Ace ? 4 : RANK_POINTS[card.rank] - 1;
}

/**
 * Chooses the strongest card from candidates.
 *
 * @param cards - Candidate cards.
 * @param trump - Active trump suit.
 * @param rng - RNG used for exact tie-breaking.
 * @returns Strongest candidate card.
 * @throws Error when cards is empty.
 * @sideEffects None.
 */
function chooseStrongestCard(cards: readonly ICard[], trump: Suit, rng: () => number): ICard {
    return chooseBest(cards, (card) => scoreCardForTrump(card, trump), rng);
}

/**
 * Chooses the weakest card from candidates.
 *
 * @param cards - Candidate cards.
 * @param trump - Active trump suit.
 * @param rng - RNG used for exact tie-breaking.
 * @returns Weakest candidate card.
 * @throws Error when cards is empty.
 * @sideEffects None.
 */
function chooseWeakestCard(cards: readonly ICard[], trump: Suit, rng: () => number): ICard {
    return chooseBest(cards, (card) => -scoreCardForTrump(card, trump), rng);
}

/**
 * Selects a maximum-scoring candidate with random tie-breaking.
 *
 * @template T - Candidate type.
 * @param candidates - Values to choose from.
 * @param getScore - Scoring function where higher is better.
 * @param rng - RNG used for exact tie-breaking.
 * @returns Selected candidate.
 * @throws Error when candidates is empty.
 * @sideEffects None.
 */
function chooseBest<T>(candidates: readonly T[], getScore: (candidate: T) => number, rng: () => number): T {
    if (candidates.length === 0) {
        throw new Error("BasicAIPlayer cannot choose from an empty candidate list.");
    }

    const bestScore = Math.max(...candidates.map(getScore));
    const bestCandidates = candidates.filter((candidate) => getScore(candidate) === bestScore);

    return chooseRandom(bestCandidates, rng);
}

/**
 * Selects one candidate using the supplied RNG.
 *
 * @template T - Candidate type.
 * @param candidates - Values to choose from.
 * @param rng - RNG used to select an index.
 * @returns Selected candidate.
 * @throws Error when candidates is empty.
 * @sideEffects None.
 */
function chooseRandom<T>(candidates: readonly T[], rng: () => number): T {
    const candidate = candidates[Math.floor(rng() * candidates.length)];

    if (candidate === undefined) {
        throw new Error("BasicAIPlayer cannot choose from an empty candidate list.");
    }

    return candidate;
}

/**
 * Determines whether the AI is leading the current trick.
 *
 * @param request - Card-play request.
 * @returns True when no cards have been played in the current trick.
 * @sideEffects None.
 */
function isLeading(request: ICardPlayRequest): boolean {
    return request.gameState.phase.kind === "PlayingTrick" && request.gameState.phase.trick.plays.length === 0;
}

/**
 * Returns the card's effective suit after left-bower promotion.
 *
 * @param card - Card to evaluate.
 * @param trump - Active trump suit.
 * @returns Effective suit.
 * @sideEffects None.
 */
function getEffectiveSuit(card: ICard, trump: Suit): Suit {
    return isLeftBower(card, trump) ? trump : card.suit;
}

/**
 * Checks whether a card is the right bower.
 *
 * @param card - Card to evaluate.
 * @param trump - Active trump suit.
 * @returns True when the card is the trump jack.
 * @sideEffects None.
 */
function isRightBower(card: ICard, trump: Suit): boolean {
    return card.rank === Rank.Jack && card.suit === trump;
}

/**
 * Checks whether a card is the left bower.
 *
 * @param card - Card to evaluate.
 * @param trump - Active trump suit.
 * @returns True when the card is the same-color jack.
 * @sideEffects None.
 */
function isLeftBower(card: ICard, trump: Suit): boolean {
    return card.rank === Rank.Jack && card.suit === sameColorSuit(trump);
}

/**
 * Returns the same-color suit.
 *
 * @param suit - Suit to pair.
 * @returns Suit with the same color.
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
