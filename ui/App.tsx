import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { runGame } from "../game";
import { BasicAIPlayer } from "../players";
import { PositionalPlayer } from "../types/enums";
import { IPlayer } from "../types/player";
import { HumanPlayerController } from "./HumanPlayerController";
import { HumanPlayerView } from "./HumanPlayerView";

/**
 * Root React component for the local Euchre demo.
 *
 * @returns React application.
 */
export function App(): ReactElement {
    const [gameId, setGameId] = useState(0);
    const controller = useMemo(() => new HumanPlayerController(), [gameId]);
    const startedGameId = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (startedGameId.current === gameId) {
            return;
        }

        startedGameId.current = gameId;
        void startDemoGame(controller);

        return () => {
            controller.reset();
        };
    }, [controller, gameId]);

    return <HumanPlayerView controller={controller} onNewGame={() => setGameId((currentGameId) => currentGameId + 1)} />;
}

/**
 * Starts a one-human, three-AI demo game.
 *
 * @param controller - Human player controller seated at South.
 * @returns Promise that resolves after the demo game completes.
 * @sideEffects Runs game engine and updates controller through observer callbacks.
 */
async function startDemoGame(controller: HumanPlayerController): Promise<void> {
    const players: Readonly<Record<PositionalPlayer, IPlayer>> = {
        [PositionalPlayer.North]: new BasicAIPlayer(),
        [PositionalPlayer.East]: new BasicAIPlayer(),
        [PositionalPlayer.South]: controller,
        [PositionalPlayer.West]: new BasicAIPlayer()
    };

    try {
        await runGame(players, {
            config: { targetScore: 1, stickTheDealer: true },
            playerObservers: {
                [PositionalPlayer.South]: controller
            }
        });
    } catch (error) {
        if (error instanceof Error && error.message === "Human player controller reset.") {
            return;
        }

        throw error;
    }
}
