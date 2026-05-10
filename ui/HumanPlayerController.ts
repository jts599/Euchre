import { ICard } from "../types/cards";
import { Suit } from "../types/enums";
import { IGameStatePublic } from "../types/gameState";
import {
    ICardPlayRequest,
    IDealerDiscardRequest,
    IPlayer,
    IPlayerObserver,
    ITrumpCardRequest,
    ITrumpCardResult,
    ITrumpChoice,
    ITrumpChoiceRequest,
    TrumpChoiceResult
} from "../types/player";

/**
 * Pending human decision variants exposed to React.
 */
export type HumanPlayerDecision =
    | { kind: "OrderTrump"; request: ITrumpCardRequest }
    | { kind: "ChooseTrump"; request: ITrumpChoiceRequest }
    | { kind: "DealerDiscard"; request: IDealerDiscardRequest }
    | { kind: "PlayCard"; request: ICardPlayRequest };

/**
 * Snapshot consumed by React views.
 */
export interface IHumanPlayerSnapshot {
    publicState?: IGameStatePublic;
    pendingDecision?: HumanPlayerDecision;
    error?: string;
}

type Listener = () => void;
type Resolver = (value: ITrumpCardResult | TrumpChoiceResult | ICard) => void;

/**
 * React-friendly human player bridge implementing the engine player contracts.
 */
export class HumanPlayerController implements IPlayer, IPlayerObserver {
    private snapshot: IHumanPlayerSnapshot = {};
    private readonly listeners: Set<Listener> = new Set();
    private pendingResolver: Resolver | undefined;
    private pendingRejecter: ((reason?: unknown) => void) | undefined;

    /**
     * Subscribes to controller snapshot changes.
     *
     * @param listener - Callback fired after snapshot updates.
     * @returns Unsubscribe callback.
     * @sideEffects Stores listener until unsubscribed.
     */
    public subscribe(listener: Listener): () => void {
        this.listeners.add(listener);

        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Returns the current controller snapshot.
     *
     * @returns Latest public state, pending decision, and error state.
     * @sideEffects None.
     */
    public getSnapshot(): IHumanPlayerSnapshot {
        return this.snapshot;
    }

    /**
     * Stores public state updates sent by the game engine.
     *
     * @param state - Latest public game state for this human perspective.
     * @sideEffects Updates snapshot and notifies subscribers.
     */
    public onStateChange(state: IGameStatePublic): void {
        this.setSnapshot({ ...this.snapshot, publicState: state });
    }

    /**
     * Enqueues a first-round order-up prompt.
     *
     * @param request - Trump card decision request.
     * @returns Promise resolved by `resolveOrderTrump`.
     * @throws Error when another decision is already pending.
     * @sideEffects Updates pending decision state.
     */
    public doYouWantThisTrump(request: ITrumpCardRequest): Promise<ITrumpCardResult> {
        return this.enqueueDecision({ kind: "OrderTrump", request }) as Promise<ITrumpCardResult>;
    }

    /**
     * Enqueues a second-round trump-choice prompt.
     *
     * @param request - Trump choice request.
     * @returns Promise resolved by `resolveTrumpChoice` or `passTrump`.
     * @throws Error when another decision is already pending.
     * @sideEffects Updates pending decision state.
     */
    public doYouWantToPickTrump(request: ITrumpChoiceRequest): Promise<TrumpChoiceResult> {
        return this.enqueueDecision({ kind: "ChooseTrump", request }) as Promise<TrumpChoiceResult>;
    }

    /**
     * Enqueues a card-play prompt.
     *
     * @param request - Card play request.
     * @returns Promise resolved by `chooseCardToPlayFromUi`.
     * @throws Error when another decision is already pending.
     * @sideEffects Updates pending decision state.
     */
    public chooseCardToPlay(request: ICardPlayRequest): Promise<ICard> {
        return this.enqueueDecision({ kind: "PlayCard", request }) as Promise<ICard>;
    }

    /**
     * Enqueues a dealer-discard prompt.
     *
     * @param request - Dealer discard request.
     * @returns Promise resolved by `chooseDealerDiscardFromUi`.
     * @throws Error when another decision is already pending.
     * @sideEffects Updates pending decision state.
     */
    public chooseDealerDiscard(request: IDealerDiscardRequest): Promise<ICard> {
        return this.enqueueDecision({ kind: "DealerDiscard", request }) as Promise<ICard>;
    }

    /**
     * Resolves the order-up prompt.
     *
     * @param pickItUp - Whether the dealer should pick up.
     * @throws Error when the pending decision is not an order-up prompt.
     * @sideEffects Resolves pending promise and clears prompt.
     */
    public resolveOrderTrump(pickItUp: boolean): void {
        this.resolveDecision("OrderTrump", { pickItUp, goAlone: false });
    }

    /**
     * Resolves the trump-choice prompt with a selected suit.
     *
     * @param suit - Selected trump suit.
     * @throws Error when suit is unavailable or no trump-choice prompt is pending.
     * @sideEffects Resolves pending promise and clears prompt.
     */
    public resolveTrumpChoice(suit: Suit): void {
        const decision = this.requirePendingDecision("ChooseTrump");

        if (!decision.request.availableSuits.includes(suit)) {
            throw new Error(`Suit ${suit} is not available.`);
        }

        this.resolveDecision("ChooseTrump", { suit, goAlone: false } satisfies ITrumpChoice);
    }

    /**
     * Resolves the trump-choice prompt as a pass.
     *
     * @throws Error when passing is not allowed or no trump-choice prompt is pending.
     * @sideEffects Resolves pending promise and clears prompt.
     */
    public passTrump(): void {
        const decision = this.requirePendingDecision("ChooseTrump");

        if (decision.request.mustChooseTrump) {
            throw new Error("Cannot pass when trump choice is required.");
        }

        this.resolveDecision("ChooseTrump", null);
    }

    /**
     * Resolves a card-play prompt.
     *
     * @param card - Legal card selected by the user.
     * @throws Error when card is not legal or no play prompt is pending.
     * @sideEffects Resolves pending promise and clears prompt.
     */
    public chooseCardToPlayFromUi(card: ICard): void {
        const decision = this.requirePendingDecision("PlayCard");

        if (!decision.request.legalCards.some((legalCard) => cardsEqual(legalCard, card))) {
            throw new Error("Selected card is not legal to play.");
        }

        this.resolveDecision("PlayCard", card);
    }

    /**
     * Resolves a dealer-discard prompt.
     *
     * @param card - Card selected by the dealer to discard.
     * @throws Error when card is not in the dealer hand or no discard prompt is pending.
     * @sideEffects Resolves pending promise and clears prompt.
     */
    public chooseDealerDiscardFromUi(card: ICard): void {
        const decision = this.requirePendingDecision("DealerDiscard");

        if (!decision.request.hand.some((handCard) => cardsEqual(handCard, card))) {
            throw new Error("Selected card is not in the dealer hand.");
        }

        this.resolveDecision("DealerDiscard", card);
    }

    /**
     * Clears the controller and rejects any pending decision.
     *
     * @sideEffects Rejects pending promise and notifies subscribers.
     */
    public reset(): void {
        this.pendingRejecter?.(new Error("Human player controller reset."));
        this.pendingResolver = undefined;
        this.pendingRejecter = undefined;
        this.setSnapshot({});
    }

    /**
     * Creates a pending decision promise.
     *
     * @param decision - Decision request to expose to the UI.
     * @returns Promise resolved by a matching UI action.
     * @throws Error when another decision is already pending.
     * @sideEffects Stores promise callbacks and notifies subscribers.
     */
    private enqueueDecision(decision: HumanPlayerDecision): Promise<ITrumpCardResult | TrumpChoiceResult | ICard> {
        if (this.pendingResolver !== undefined) {
            const error = new Error("HumanPlayerController already has a pending decision.");
            this.setSnapshot({ ...this.snapshot, error: error.message });

            throw error;
        }

        return new Promise((resolve, reject) => {
            this.pendingResolver = resolve;
            this.pendingRejecter = reject;
            this.setSnapshot({
                ...this.snapshot,
                publicState: decision.request.gameState,
                pendingDecision: decision
            });
        });
    }

    /**
     * Resolves the active decision after validating its kind.
     *
     * @param kind - Expected pending decision kind.
     * @param value - Value to resolve to the engine.
     * @throws Error when the expected decision is not pending.
     * @sideEffects Resolves promise and clears pending decision.
     */
    private resolveDecision(kind: HumanPlayerDecision["kind"], value: ITrumpCardResult | TrumpChoiceResult | ICard): void {
        this.requirePendingDecision(kind);
        this.pendingResolver?.(value);
        this.pendingResolver = undefined;
        this.pendingRejecter = undefined;
        const { pendingDecision: _pendingDecision, error: _error, ...remainingSnapshot } = this.snapshot;
        this.setSnapshot(remainingSnapshot);
    }

    /**
     * Validates and returns the current pending decision.
     *
     * @param kind - Expected pending decision kind.
     * @returns Pending decision of the requested kind.
     * @throws Error when no matching decision is pending.
     * @sideEffects None.
     */
    private requirePendingDecision<TKind extends HumanPlayerDecision["kind"]>(
        kind: TKind
    ): Extract<HumanPlayerDecision, { kind: TKind }> {
        const decision = this.snapshot.pendingDecision;

        if (decision?.kind !== kind) {
            throw new Error(`Expected pending ${kind} decision.`);
        }

        return decision as Extract<HumanPlayerDecision, { kind: TKind }>;
    }

    /**
     * Updates the snapshot and notifies subscribers.
     *
     * @param snapshot - Replacement snapshot.
     * @sideEffects Notifies all listeners.
     */
    private setSnapshot(snapshot: IHumanPlayerSnapshot): void {
        this.snapshot = snapshot;
        this.listeners.forEach((listener) => listener());
    }
}

/**
 * Checks whether two cards have the same rank and suit.
 *
 * @param firstCard - First card.
 * @param secondCard - Second card.
 * @returns True when cards match.
 * @sideEffects None.
 */
function cardsEqual(firstCard: ICard, secondCard: ICard): boolean {
    return firstCard.rank === secondCard.rank && firstCard.suit === secondCard.suit;
}
