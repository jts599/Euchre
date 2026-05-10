import { useEffect, useMemo } from "react";
import type { ReactElement } from "react";
import { runGame } from "../game";
import { BasicAIPlayer } from "../players";
import { PositionalPlayer } from "../types/enums";
import {
    ICardPlayRequest,
    IDealerDiscardRequest,
    IPlayer,
    IPlayerObserver,
    ITrumpCardRequest,
    ITrumpCardResult,
    ITrumpChoiceRequest,
    TrumpChoiceResult
} from "../types/player";
import { ICard } from "../types/cards";
import { IGameStatePublic } from "../types/gameState";
import { HumanPlayerController } from "./HumanPlayerController";
import { HumanPlayerView } from "./HumanPlayerView";

const DEMO_TARGET_SCORE = 10;

/**
 * Root React component for the local Euchre demo.
 *
 * @returns React application.
 */
export function App(): ReactElement {
    const controller = useMemo(() => new HumanPlayerController(), []);

    useEffect(() => {
        let active = true;

        void startDemoGame(controller, () => active);

        return () => {
            active = false;
            controller.reset();
        };
    }, [controller]);

    return <HumanPlayerView controller={controller} />;
}

/**
 * Starts a one-human, three-AI demo game.
 *
 * @param controller - Human player controller seated at South.
 * @param isActive - Returns whether this game run is still current.
 * @returns Promise that resolves after the demo game completes.
 * @sideEffects Runs game engine and updates controller through observer callbacks.
 */
async function startDemoGame(controller: HumanPlayerController, isActive: () => boolean): Promise<void> {
    const activeController = new ActiveHumanPlayerController(controller, isActive);
    const players: Readonly<Record<PositionalPlayer, IPlayer>> = {
        [PositionalPlayer.North]: new BasicAIPlayer(),
        [PositionalPlayer.East]: new BasicAIPlayer(),
        [PositionalPlayer.South]: activeController,
        [PositionalPlayer.West]: new BasicAIPlayer()
    };

    try {
        await runGame(players, {
            config: { targetScore: DEMO_TARGET_SCORE, stickTheDealer: true },
            playerObservers: {
                [PositionalPlayer.South]: activeController
            }
        });
    } catch (error) {
        if (error instanceof Error && (error.message === "Human player controller reset." || error.message === "Demo game stopped.")) {
            return;
        }

        throw error;
    }
}

/**
 * Guards the shared human controller from stale async game runs.
 */
class ActiveHumanPlayerController implements IPlayer, IPlayerObserver {
    private readonly controller: HumanPlayerController;
    private readonly isActive: () => boolean;

    /**
     * Creates a guard around one human controller.
     *
     * @param controller - Human controller used by the active game.
     * @param isActive - Predicate that is false after the owning effect cleans up.
     * @sideEffects Stores guard dependencies.
     */
    public constructor(controller: HumanPlayerController, isActive: () => boolean) {
        this.controller = controller;
        this.isActive = isActive;
    }

    /**
     * Forwards public state only while this game run is active.
     *
     * @param state - Public state for the human seat.
     * @sideEffects Updates the human controller when active.
     */
    public onStateChange(state: IGameStatePublic): void {
        if (this.isActive()) {
            this.controller.onStateChange(state);
        }
    }

    /**
     * Forwards first-round trump decisions for active game runs.
     *
     * @param request - Trump-card request.
     * @returns Human decision result.
     * @throws Error when this game run is no longer active.
     * @sideEffects May enqueue a human UI decision.
     */
    public doYouWantThisTrump(request: ITrumpCardRequest): Promise<ITrumpCardResult> {
        this.assertActive();

        return this.controller.doYouWantThisTrump(request);
    }

    /**
     * Forwards second-round trump decisions for active game runs.
     *
     * @param request - Trump-choice request.
     * @returns Human trump choice or pass.
     * @throws Error when this game run is no longer active.
     * @sideEffects May enqueue a human UI decision.
     */
    public doYouWantToPickTrump(request: ITrumpChoiceRequest): Promise<TrumpChoiceResult> {
        this.assertActive();

        return this.controller.doYouWantToPickTrump(request);
    }

    /**
     * Forwards play-card decisions for active game runs.
     *
     * @param request - Card-play request.
     * @returns Human-selected card.
     * @throws Error when this game run is no longer active.
     * @sideEffects May enqueue a human UI decision.
     */
    public chooseCardToPlay(request: ICardPlayRequest): Promise<ICard> {
        this.assertActive();

        return this.controller.chooseCardToPlay(request);
    }

    /**
     * Forwards dealer-discard decisions for active game runs.
     *
     * @param request - Dealer-discard request.
     * @returns Human-selected discard.
     * @throws Error when this game run is no longer active.
     * @sideEffects May enqueue a human UI decision.
     */
    public chooseDealerDiscard(request: IDealerDiscardRequest): Promise<ICard> {
        this.assertActive();

        return this.controller.chooseDealerDiscard(request);
    }

    /**
     * Stops stale game runs before they can touch the shared controller.
     *
     * @throws Error when this game run is no longer active.
     * @sideEffects None.
     */
    private assertActive(): void {
        if (!this.isActive()) {
            throw new Error("Demo game stopped.");
        }
    }
}
