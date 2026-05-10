import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ICard } from "../types/cards";
import { Player, Rank, Suit } from "../types/enums";
import { IGameStatePublic, Team } from "../types/gameState";
import { HumanPlayerController } from "../ui/HumanPlayerController";
import { HumanPlayerView } from "../ui/HumanPlayerView";

const jackSpades: ICard = { suit: Suit.Spades, rank: Rank.Jack };
const aceSpades: ICard = { suit: Suit.Spades, rank: Rank.Ace };
const nineHearts: ICard = { suit: Suit.Hearts, rank: Rank.Nine };
const tenHearts: ICard = { suit: Suit.Hearts, rank: Rank.Ten };

/**
 * Tests for the React-backed human player controller and view.
 */
describe("HumanPlayerController UI", () => {
    it("renders an order-up prompt and resolves the decision", async () => {
        const user = userEvent.setup();
        const controller = new HumanPlayerController();
        const promise = controller.doYouWantThisTrump({
            proposedTrumpCard: jackSpades,
            dealer: Player.Partner,
            gameState: createPublicState([nineHearts, tenHearts])
        });

        render(<HumanPlayerView controller={controller} />);
        await user.click(screen.getByRole("button", { name: "Order up" }));

        await expect(promise).resolves.toEqual({ pickItUp: true, goAlone: false });
        expect(screen.getByText("Waiting for your turn.")).toBeInTheDocument();
    });

    it("renders available trump suits and hides pass when trump is required", async () => {
        const user = userEvent.setup();
        const controller = new HumanPlayerController();
        const promise = controller.doYouWantToPickTrump({
            availableSuits: [Suit.Hearts, Suit.Clubs],
            mustChooseTrump: true,
            gameState: createPublicState([nineHearts, tenHearts])
        });

        render(<HumanPlayerView controller={controller} />);

        expect(screen.queryByRole("button", { name: "Pass" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: Suit.Clubs }));

        await expect(promise).resolves.toEqual({ suit: Suit.Clubs, goAlone: false });
    });

    it("allows passing when trump is optional", async () => {
        const user = userEvent.setup();
        const controller = new HumanPlayerController();
        const promise = controller.doYouWantToPickTrump({
            availableSuits: [Suit.Hearts, Suit.Clubs],
            mustChooseTrump: false,
            gameState: createPublicState([nineHearts, tenHearts])
        });

        render(<HumanPlayerView controller={controller} />);
        await user.click(screen.getByRole("button", { name: "Pass" }));

        await expect(promise).resolves.toBeNull();
    });

    it("resolves dealer discard from a clicked card", async () => {
        const user = userEvent.setup();
        const controller = new HumanPlayerController();
        const promise = controller.chooseDealerDiscard({
            hand: [nineHearts, tenHearts],
            pickedUpCard: jackSpades,
            gameState: createPublicState([nineHearts, tenHearts], Suit.Spades)
        });

        render(<HumanPlayerView controller={controller} />);
        await user.click(screen.getByRole("button", { name: "9 Hearts" }));

        await expect(promise).resolves.toEqual(nineHearts);
    });

    it("renders only legal play cards as selectable", async () => {
        const user = userEvent.setup();
        const controller = new HumanPlayerController();
        const promise = controller.chooseCardToPlay({
            hand: [aceSpades, nineHearts, tenHearts],
            legalCards: [nineHearts],
            gameState: createPlayingState([aceSpades, nineHearts, tenHearts])
        });

        render(<HumanPlayerView controller={controller} />);

        expect(screen.queryByRole("button", { name: "A Spades" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "9 Hearts" }));

        await expect(promise).resolves.toEqual(nineHearts);
    });

    it("updates displayed public state from observer updates", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPublicState([nineHearts, tenHearts], Suit.Hearts));
        });

        const gameScore = screen.getByLabelText("Game score");

        expect(screen.getByText("Cards dealt")).toBeInTheDocument();
        expect(within(gameScore).getByText("Game")).toBeInTheDocument();
        expect(within(gameScore).getByText("Your team")).toBeInTheDocument();
        expect(within(gameScore).getByText("Opponents")).toBeInTheDocument();
    });

    it("renders card backs for other seats from public state", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPublicState([nineHearts, tenHearts], Suit.Hearts));
        });

        expect(screen.getAllByAltText("Card back")).toHaveLength(15);
    });

    it("renders hand score from current trick counts", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPlayingState([aceSpades, nineHearts, tenHearts]));
        });

        const handScore = screen.getByLabelText("Hand score");

        expect(within(handScore).getByText("Hand")).toBeInTheDocument();
        expect(within(handScore).getByText("1")).toBeInTheDocument();
        expect(within(handScore).getByText("2")).toBeInTheDocument();
    });

    it("rotates side opponent hidden hands", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPublicState([nineHearts, tenHearts], Suit.Hearts));
        });

        expect(screen.getByLabelText("Left opponent hidden cards")).toHaveClass("sideways-backs");
        expect(screen.getByLabelText("Right opponent hidden cards")).toHaveClass("sideways-backs");
        expect(screen.getByLabelText("Partner hidden cards")).not.toHaveClass("sideways-backs");
    });

    it("renders the current trick card in the table", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPlayingState([aceSpades, nineHearts, tenHearts]));
        });

        expect(screen.getAllByAltText("A Spades").length).toBeGreaterThan(0);
        expect(screen.getByText("Current trick")).toBeInTheDocument();
    });

    it("toggles a debug state card from the browser console hook", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPlayingState([aceSpades, nineHearts, tenHearts]));
        });

        expect(screen.queryByLabelText("Debug state")).not.toBeInTheDocument();

        act(() => {
            window.debugMode?.();
        });

        const debugState = screen.getByLabelText("Debug state");

        expect(within(debugState).getByText("Phase")).toBeInTheDocument();
        expect(within(debugState).getByText("PlayingTrick")).toBeInTheDocument();
        expect(within(debugState).getByText("Game score")).toBeInTheDocument();

        act(() => {
            window.debugMode?.();
        });

        expect(screen.queryByLabelText("Debug state")).not.toBeInTheDocument();
    });
});

/**
 * Creates a hand-bearing public state for UI tests.
 *
 * @param hand - Cards visible to the human player.
 * @param trump - Optional trump suit.
 * @returns Public game state.
 * @sideEffects None.
 */
function createPublicState(hand: readonly ICard[], trump?: Suit): IGameStatePublic {
    return {
        config: { targetScore: 10, stickTheDealer: false },
        handNumber: 1,
        dealer: Player.Partner,
        score: {
            [Team.NorthSouth]: 1,
            [Team.EastWest]: 2
        },
        phase: {
            kind: "Dealing",
            hand: {
                hand,
                upCard: jackSpades,
                dealer: Player.Partner,
                playedCards: [],
                completedTricks: [],
                ...(trump === undefined ? {} : { trump })
            }
        }
    };
}

/**
 * Creates a playing-trick public state for UI tests.
 *
 * @param hand - Cards visible to the human player.
 * @returns Public game state in trick play.
 * @sideEffects None.
 */
function createPlayingState(hand: readonly ICard[]): IGameStatePublic {
    return {
        ...createPublicState(hand, Suit.Spades),
        phase: {
            kind: "PlayingTrick",
            hand: {
                hand,
                upCard: jackSpades,
                dealer: Player.Partner,
                playedCards: [],
                completedTricks: [],
                trump: Suit.Spades
            },
            trick: {
                leader: Player.LeftOpponent,
                currentPlayer: Player.Self,
                plays: [{ player: Player.LeftOpponent, card: aceSpades }],
                tricksTaken: {
                    [Player.Self]: 1,
                    [Player.LeftOpponent]: 2,
                    [Player.Partner]: 0,
                    [Player.RightOpponent]: 0
                }
            }
        }
    };
}
