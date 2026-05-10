import { useSyncExternalStore } from "react";
import { HumanPlayerController, IHumanPlayerSnapshot } from "./HumanPlayerController";

/**
 * Subscribes React components to a human player controller.
 *
 * @param controller - Controller to subscribe to.
 * @returns Current controller snapshot.
 * @sideEffects Registers a React external-store subscription.
 */
export function useHumanPlayerController(controller: HumanPlayerController): IHumanPlayerSnapshot {
    return useSyncExternalStore(
        (listener) => controller.subscribe(listener),
        () => controller.getSnapshot(),
        () => controller.getSnapshot()
    );
}
