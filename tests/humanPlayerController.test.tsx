import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ICard } from "../types/cards";
import { Player, Rank, Suit } from "../types/enums";
import { IGameStatePublic, Team } from "../types/gameState";
import { HumanPlayerController } from "../ui/HumanPlayerController";
import { HumanPlayerView } from "../ui/HumanPlayerView";

const jackSpades: ICard = { suit: Suit.Spades, rank: Rank.Jack };
const jackDiamonds: ICard = { suit: Suit.Diamonds, rank: Rank.Jack };
const aceSpades: ICard = { suit: Suit.Spades, rank: Rank.Ace };
const nineHearts: ICard = { suit: Suit.Hearts, rank: Rank.Nine };
const tenHearts: ICard = { suit: Suit.Hearts, rank: Rank.Ten };
const kingClubs: ICard = { suit: Suit.Clubs, rank: Rank.King };

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
        expect(screen.queryByLabelText("Decision")).not.toBeInTheDocument();
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

    it("resolves dealer discard from the normal hand row", async () => {
        const user = userEvent.setup();
        const controller = new HumanPlayerController();
        const promise = controller.chooseDealerDiscard({
            hand: [nineHearts, tenHearts],
            pickedUpCard: jackSpades,
            gameState: createPublicState([nineHearts, tenHearts], Suit.Spades)
        });

        render(<HumanPlayerView controller={controller} />);
        const hand = screen.getByLabelText("Your hand");

        expect(screen.queryByText(/Discard one card/)).not.toBeInTheDocument();
        expect(within(hand).getByRole("button", { name: "9 Hearts" })).toBeEnabled();
        expect(within(hand).getByRole("button", { name: "10 Hearts" })).toBeEnabled();
        await user.click(within(hand).getByRole("button", { name: "9 Hearts" }));

        await expect(promise).resolves.toEqual(nineHearts);
    });

    it("greys illegal play cards and keeps legal hand cards selectable", async () => {
        const user = userEvent.setup();
        const controller = new HumanPlayerController();
        const promise = controller.chooseCardToPlay({
            hand: [aceSpades, nineHearts, tenHearts],
            legalCards: [nineHearts],
            gameState: createPlayingState([aceSpades, nineHearts, tenHearts])
        });

        render(<HumanPlayerView controller={controller} />);
        const hand = screen.getByLabelText("Your hand");
        const illegalCard = within(hand).getByRole("button", { name: "A Spades" });
        const legalCard = within(hand).getByRole("button", { name: "9 Hearts" });

        expect(screen.queryByText("Play a legal card.")).not.toBeInTheDocument();
        expect(illegalCard).toBeDisabled();
        expect(within(illegalCard).getByRole("img", { name: "A Spades" })).toHaveClass("disabled-card");
        expect(legalCard).toBeEnabled();
        await user.click(legalCard);

        await expect(promise).resolves.toEqual(nineHearts);
    });

    it("updates displayed public state from observer updates", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPublicState([nineHearts, tenHearts], Suit.Hearts));
        });

        const gameScore = screen.getByLabelText("Game score");

        expect(screen.queryByRole("heading", { name: "Euchre" })).not.toBeInTheDocument();
        expect(screen.queryByText("Cards dealt")).not.toBeInTheDocument();
        expect(within(gameScore).queryByText("Game")).not.toBeInTheDocument();
        expect(within(gameScore).queryByText("Your team")).not.toBeInTheDocument();
        expect(within(gameScore).queryByText("Opponents")).not.toBeInTheDocument();
        expect(within(gameScore).getByLabelText("Your team score")).toHaveTextContent("1");
        expect(within(gameScore).getByLabelText("Opponent score")).toHaveTextContent("2");
    });

    it("renders team-colored card backs for other seats from public state", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPublicState([nineHearts, tenHearts], Suit.Hearts));
        });

        expect(screen.getAllByAltText("Card back")).toHaveLength(15);
        expect(getFirstCardBack("Partner hidden cards")).toHaveClass("team-card-back");
        expect(getFirstCardBack("Left opponent hidden cards")).toHaveClass("opponent-card-back");
        expect(getFirstCardBack("Right opponent hidden cards")).toHaveClass("opponent-card-back");
    });

    it("sorts the displayed hand by suit and rank before trump is chosen", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPublicState([aceSpades, tenHearts, nineHearts, kingClubs]));
        });

        expect(getVisibleHandCardLabels()).toEqual(["9 Hearts", "10 Hearts", "K Clubs", "A Spades"]);
    });

    it("sorts the displayed hand by effective suit after trump is chosen", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPublicState([aceSpades, jackDiamonds, tenHearts, nineHearts], Suit.Hearts));
        });

        expect(getVisibleHandCardLabels()).toEqual(["9 Hearts", "10 Hearts", "J Diamonds", "A Spades"]);
    });

    it("renders hand score from current trick counts", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPlayingState([aceSpades, nineHearts, tenHearts]));
        });

        const handScore = screen.getByLabelText("Hand score");

        expect(within(handScore).queryByText("Hand")).not.toBeInTheDocument();
        expect(within(handScore).getByText("1")).toBeInTheDocument();
        expect(within(handScore).getByText("2")).toBeInTheDocument();
    });

    it("stacks and rotates side opponent hidden hands", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPublicState([nineHearts, tenHearts], Suit.Hearts));
        });

        expect(screen.getByLabelText("Left opponent hidden cards")).toHaveClass("sideways-backs");
        expect(screen.getByLabelText("Right opponent hidden cards")).toHaveClass("sideways-backs");
        expect(screen.getByLabelText("Partner hidden cards")).not.toHaveClass("sideways-backs");
    });

    it("renders dealer and maker trump chips without visible seat labels", () => {
        const controller = new HumanPlayerController();

        render(<HumanPlayerView controller={controller} />);
        act(() => {
            controller.onStateChange(createPublicState([nineHearts, tenHearts], Suit.Hearts));
        });

        expect(screen.getByText("Dealer")).toBeInTheDocument();
        expect(screen.getByText(Suit.Hearts)).toBeInTheDocument();
        expect(screen.queryByText("Partner")).not.toBeInTheDocument();
        expect(screen.queryByText("Left opponent")).not.toBeInTheDocument();
        expect(screen.queryByText("Right opponent")).not.toBeInTheDocument();
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
 * Returns rendered card labels from the human hand area.
 *
 * @returns Card image alt text in visual hand order.
 * @sideEffects Reads the rendered DOM.
 */
function getVisibleHandCardLabels(): string[] {
    const hand = screen.getByLabelText("Your hand");
    const images = within(hand).getAllByRole("img");

    return images.map((image) => image.getAttribute("alt") ?? "");
}

/**
 * Returns the first card back from a labelled hidden hand.
 *
 * @param label - Accessible label for the hidden hand.
 * @returns First card-back image.
 * @throws Error when the hand has no card backs.
 * @sideEffects Reads the rendered DOM.
 */
function getFirstCardBack(label: string): HTMLElement {
    const cardBack = within(screen.getByLabelText(label)).getAllByAltText("Card back")[0];

    if (cardBack === undefined) {
        throw new Error(`${label} did not render any card backs.`);
    }

    return cardBack;
}

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
                ...(trump === undefined ? {} : { maker: Player.LeftOpponent, trump })
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
