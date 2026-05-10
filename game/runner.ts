import { ICard, IPlayedCard } from "../types/cards";
import { PositionalPlayer, Suit } from "../types/enums";
import { GamePhasePrivate, IGameConfig, IGameStatePrivate, IGameStatePublic, Team } from "../types/gameState";
import { IHandStatePrivate } from "../types/handState";
import { IPlayer, IPlayerObserver } from "../types/player";
import { ICompletedTrickPrivate, ITrickStatePrivate } from "../types/trickState";
import { toPublicGameState } from "../types/stateConversion";
import { createDeck, dealCards, Rng, shuffleCards } from "./deck";
import { getPartner, getTeam, playersAfterDealer, POSITIONAL_PLAYERS, rotatePlayer } from "./positions";
import { cardsEqual, findCardIndex, formatCard, getLegalCards, getTrickWinner, removeCard, scoreHand } from "./rules";

const DEFAULT_CONFIG: IGameConfig = {
    targetScore: 10,
    stickTheDealer: false
};
const DEFAULT_CARD_PLAY_DELAY_MS = 1000;

/**
 * Players seated at each absolute position.
 */
export type PlayerSeats = Readonly<Record<PositionalPlayer, IPlayer>>;

/**
 * Options for running a full Euchre game.
 */
export interface IRunGameOptions {
    config?: Partial<IGameConfig>;
    cardPlayDelayMs?: number;
    dealer?: PositionalPlayer;
    rng?: Rng;
    onPrivateStateChange?: (state: IGameStatePrivate) => void | Promise<void>;
    onPublicStateChange?: (player: PositionalPlayer, state: IGameStatePublic) => void | Promise<void>;
    playerObservers?: Partial<Record<PositionalPlayer, IPlayerObserver>>;
}

/**
 * Result returned after a completed game.
 */
export interface IGameResult {
    finalState: IGameStatePrivate;
    winner: Team;
    finalScore: Readonly<Record<Team, number>>;
    handCount: number;
}

interface IRunContext {
    players: PlayerSeats;
    options: IRunGameOptions;
    config: IGameConfig;
    cardPlayDelayMs: number;
    rng: Rng;
}

interface IHandOutcome {
    state: IGameStatePrivate;
    score: Readonly<Record<Team, number>>;
    passedOut: boolean;
}

interface ITrumpSelection {
    hand: IHandStatePrivate;
    maker: PositionalPlayer;
    goingAlone?: PositionalPlayer;
    trump: Suit;
}

/**
 * Runs full Euchre hands until one team reaches the target score.
 *
 * @param players - Player implementations keyed by absolute table position.
 * @param options - Optional config, card-play delay, RNG, dealer, and state observers.
 * @returns Final state, winner, final score, and number of hands started.
 * @throws Error when a player makes an illegal decision.
 * @sideEffects Calls player methods and observer callbacks.
 */
export async function runGame(players: PlayerSeats, options: IRunGameOptions = {}): Promise<IGameResult> {
    const context = createRunContext(players, options);
    let score = createEmptyScore();
    let dealer = options.dealer ?? PositionalPlayer.North;
    let handNumber = 1;
    let state = createCompleteState(context.config, handNumber, dealer, score, Team.NorthSouth);

    while (!hasWinner(score, context.config)) {
        const outcome = await runHand(context, handNumber, dealer, score);
        state = outcome.state;
        score = outcome.score;
        dealer = rotatePlayer(dealer, 1);
        handNumber += 1;
    }

    const winner = getWinningTeam(score, context.config);
    state = createCompleteState(context.config, handNumber - 1, rotatePlayer(dealer, -1), score, winner);
    await emitState(context, state);

    return {
        finalState: state,
        winner,
        finalScore: score,
        handCount: handNumber - 1
    };
}

/**
 * Runs one hand from deal through scoring or pass-out.
 *
 * @param context - Runtime dependencies and callbacks.
 * @param handNumber - One-based hand number.
 * @param dealer - Dealer for this hand.
 * @param score - Score before the hand.
 * @returns Outcome state and updated score.
 * @throws Error when a player makes an illegal decision.
 * @sideEffects Calls player methods and observer callbacks.
 */
async function runHand(
    context: IRunContext,
    handNumber: number,
    dealer: PositionalPlayer,
    score: Readonly<Record<Team, number>>
): Promise<IHandOutcome> {
    const hand = createHand(dealer, context.rng);
    await emitState(context, createGameState(context.config, handNumber, dealer, score, { kind: "Dealing", hand }));

    const selection = await chooseTrump(context, handNumber, dealer, score, hand);

    if (selection === undefined) {
        return {
            state: createGameState(context.config, handNumber, dealer, score, { kind: "Dealing", hand }),
            score,
            passedOut: true
        };
    }

    const playResult = await playHand(context, handNumber, dealer, score, selection);
    const scoring = scoreHand(selection.maker, selection.goingAlone, playResult.tricksTaken);
    const updatedScore = addScore(score, scoring.scoringTeam, scoring.pointsAwarded);
    const scoringState = createGameState(context.config, handNumber, dealer, updatedScore, {
        kind: "ScoringHand",
        hand: playResult.hand,
        pointsAwarded: scoring.pointsAwarded,
        scoringTeam: scoring.scoringTeam,
        completedTricks: playResult.completedTricks
    });
    await emitState(context, scoringState);

    return { state: scoringState, score: updatedScore, passedOut: false };
}

/**
 * Runs both trump-selection rounds for a hand.
 *
 * @param context - Runtime dependencies and callbacks.
 * @param handNumber - One-based hand number.
 * @param dealer - Dealer for this hand.
 * @param score - Current score.
 * @param hand - Dealt hand state.
 * @returns Trump selection or undefined when the hand passes out.
 * @throws Error when a player returns illegal trump or discard decisions.
 * @sideEffects Calls player methods and observer callbacks.
 */
async function chooseTrump(
    context: IRunContext,
    handNumber: number,
    dealer: PositionalPlayer,
    score: Readonly<Record<Team, number>>,
    hand: IHandStatePrivate
): Promise<ITrumpSelection | undefined> {
    const firstRound = await orderUpRound(context, handNumber, dealer, score, hand);

    if (firstRound !== undefined) {
        return firstRound;
    }

    return chooseTrumpRound(context, handNumber, dealer, score, {
        ...hand,
        turnedDownSuit: hand.upCard.suit
    });
}

/**
 * Runs first-round upcard ordering.
 *
 * @param context - Runtime dependencies and callbacks.
 * @param handNumber - One-based hand number.
 * @param dealer - Dealer for this hand.
 * @param score - Current score.
 * @param hand - Dealt hand state.
 * @returns Trump selection or undefined when all players pass.
 * @throws Error when dealer discard is illegal.
 * @sideEffects Calls player methods and observer callbacks.
 */
async function orderUpRound(
    context: IRunContext,
    handNumber: number,
    dealer: PositionalPlayer,
    score: Readonly<Record<Team, number>>,
    hand: IHandStatePrivate
): Promise<ITrumpSelection | undefined> {
    const passes: PositionalPlayer[] = [];

    for (const player of playersAfterDealer(dealer)) {
        const state = createGameState(context.config, handNumber, dealer, score, {
            kind: "OrderingTrump",
            hand,
            currentPlayer: player,
            proposedTrumpCard: hand.upCard,
            passes
        });
        await emitState(context, state);

        const result = await context.players[player].doYouWantThisTrump({
            proposedTrumpCard: hand.upCard,
            dealer: toPublicGameState(state, player).dealer,
            gameState: toPublicGameState(state, player)
        });

        if (!result.pickItUp) {
            passes.push(player);
            continue;
        }

        const goingAlone = result.goAlone ? player : undefined;
        const pickedUpHand = addCardToHand(hand, dealer, hand.upCard, hand.upCard.suit, player, goingAlone);

        return discardForDealer(context, handNumber, dealer, score, pickedUpHand, hand.upCard);
    }

    return undefined;
}

/**
 * Runs dealer discard after the upcard is ordered.
 *
 * @param context - Runtime dependencies and callbacks.
 * @param handNumber - One-based hand number.
 * @param dealer - Dealer for this hand.
 * @param score - Current score.
 * @param hand - Hand after dealer picked up the upcard.
 * @param pickedUpCard - Upcard added to dealer hand.
 * @returns Trump selection after dealer discard.
 * @throws Error when dealer discards a card not in hand.
 * @sideEffects Calls dealer player method and observer callbacks.
 */
async function discardForDealer(
    context: IRunContext,
    handNumber: number,
    dealer: PositionalPlayer,
    score: Readonly<Record<Team, number>>,
    hand: IHandStatePrivate,
    pickedUpCard: ICard
): Promise<ITrumpSelection> {
    const dealerHand = hand.hands[dealer];
    const state = createGameState(context.config, handNumber, dealer, score, {
        kind: "DealerDiscard",
        hand,
        dealerHand,
        pickedUpCard
    });
    await emitState(context, state);

    const discard = await context.players[dealer].chooseDealerDiscard({
        hand: dealerHand,
        pickedUpCard,
        gameState: toPublicGameState(state, dealer)
    });

    assertCardInHand(dealerHand, discard, "discard");

    return {
        hand: replaceHand(hand, dealer, removeCard(dealerHand, discard)),
        maker: hand.maker as PositionalPlayer,
        trump: hand.trump as Suit,
        ...optionalPlayer("goingAlone", hand.goingAlone)
    };
}

/**
 * Runs second-round trump selection.
 *
 * @param context - Runtime dependencies and callbacks.
 * @param handNumber - One-based hand number.
 * @param dealer - Dealer for this hand.
 * @param score - Current score.
 * @param hand - Hand after upcard was turned down.
 * @returns Trump selection or undefined when the hand passes out.
 * @throws Error when a player returns an illegal suit.
 * @sideEffects Calls player methods and observer callbacks.
 */
async function chooseTrumpRound(
    context: IRunContext,
    handNumber: number,
    dealer: PositionalPlayer,
    score: Readonly<Record<Team, number>>,
    hand: IHandStatePrivate
): Promise<ITrumpSelection | undefined> {
    const availableSuits = getAvailableSuits(hand.upCard.suit);
    const passes: PositionalPlayer[] = [];

    for (const player of playersAfterDealer(dealer)) {
        const mustChooseTrump = context.config.stickTheDealer && player === dealer;
        const state = createGameState(context.config, handNumber, dealer, score, {
            kind: "ChoosingTrump",
            hand,
            currentPlayer: player,
            availableSuits,
            mustChooseTrump,
            passes
        });
        await emitState(context, state);

        const result = await context.players[player].doYouWantToPickTrump({
            availableSuits: [...availableSuits],
            mustChooseTrump,
            gameState: toPublicGameState(state, player)
        });

        if (result === null) {
            assertMayPass(player, mustChooseTrump);
            passes.push(player);
            continue;
        }

        assertSuitAvailable(player, result.suit, availableSuits);

        return {
            hand: { ...hand, trump: result.suit, maker: player, ...optionalPlayer("goingAlone", result.goAlone ? player : undefined) },
            maker: player,
            trump: result.suit,
            ...optionalPlayer("goingAlone", result.goAlone ? player : undefined)
        };
    }

    return undefined;
}

/**
 * Plays five tricks after trump has been selected.
 *
 * @param context - Runtime dependencies and callbacks.
 * @param handNumber - One-based hand number.
 * @param dealer - Dealer for this hand.
 * @param score - Current score.
 * @param selection - Trump and hand state selected during bidding.
 * @returns Final hand state, completed tricks, and trick counts.
 * @throws Error when a player returns an illegal card.
 * @sideEffects Calls player methods and observer callbacks.
 */
async function playHand(
    context: IRunContext,
    handNumber: number,
    dealer: PositionalPlayer,
    score: Readonly<Record<Team, number>>,
    selection: ITrumpSelection
): Promise<{
    hand: IHandStatePrivate;
    completedTricks: readonly ICompletedTrickPrivate[];
    tricksTaken: Readonly<Record<PositionalPlayer, number>>;
}> {
    const sittingOut = selection.goingAlone === undefined ? undefined : getPartner(selection.goingAlone);
    let hand = selection.hand;
    let leader = rotatePlayer(dealer, 1);
    let tricksTaken = createEmptyTricks();
    const completedTricks: ICompletedTrickPrivate[] = [];

    for (let trickIndex = 0; trickIndex < 5; trickIndex += 1) {
        const outcome = await playTrick(context, handNumber, dealer, score, hand, leader, selection.trump, tricksTaken, sittingOut);
        hand = outcome.hand;
        tricksTaken = incrementTricks(tricksTaken, outcome.completedTrick.winner);
        completedTricks.push(outcome.completedTrick);
        hand = { ...hand, completedTricks, playedCards: [...hand.playedCards, ...outcome.completedTrick.plays] };
        leader = outcome.completedTrick.winner;
    }

    return { hand, completedTricks, tricksTaken };
}

/**
 * Plays one trick.
 *
 * @param context - Runtime dependencies and callbacks.
 * @param handNumber - One-based hand number.
 * @param dealer - Dealer for this hand.
 * @param score - Current score.
 * @param hand - Current hand state.
 * @param leader - Trick leader.
 * @param trump - Current trump suit.
 * @param tricksTaken - Trick counts before this trick.
 * @param sittingOut - Alone player's partner, when any.
 * @returns Updated hand and completed trick.
 * @throws Error when a player returns an illegal card.
 * @sideEffects Calls player methods and observer callbacks.
 */
async function playTrick(
    context: IRunContext,
    handNumber: number,
    dealer: PositionalPlayer,
    score: Readonly<Record<Team, number>>,
    hand: IHandStatePrivate,
    leader: PositionalPlayer,
    trump: Suit,
    tricksTaken: Readonly<Record<PositionalPlayer, number>>,
    sittingOut: PositionalPlayer | undefined
): Promise<{ hand: IHandStatePrivate; completedTrick: ICompletedTrickPrivate }> {
    let currentHand = hand;
    const plays: IPlayedCard<PositionalPlayer>[] = [];

    for (const player of trickPlayers(leader, sittingOut)) {
        const legalCards = getLegalCards(currentHand.hands[player], plays[0]?.card, trump);
        const trick: ITrickStatePrivate = { leader, currentPlayer: player, plays, tricksTaken };
        const state = createGameState(context.config, handNumber, dealer, score, {
            kind: "PlayingTrick",
            hand: currentHand,
            trick
        });
        await emitState(context, state);

        const chosenCard = await context.players[player].chooseCardToPlay({
            hand: currentHand.hands[player],
            legalCards,
            gameState: toPublicGameState(state, player)
        });
        assertLegalPlay(player, currentHand.hands[player], legalCards, chosenCard);
        plays.push({ player, card: chosenCard });
        currentHand = replaceHand(currentHand, player, removeCard(currentHand.hands[player], chosenCard));
        await emitState(context, createGameState(context.config, handNumber, dealer, score, {
            kind: "PlayingTrick",
            hand: currentHand,
            trick: { leader, currentPlayer: player, plays, tricksTaken }
        }));
        await delayAfterCardPlayed(context.cardPlayDelayMs);
    }

    const winningPlay = getTrickWinner(plays, trump);

    return {
        hand: currentHand,
        completedTrick: { leader, winner: winningPlay.player, plays }
    };
}

/**
 * Emits private and per-player public state snapshots.
 *
 * @param context - Runtime dependencies and callbacks.
 * @param state - Private state to broadcast.
 * @returns Promise that resolves after all observers have run.
 * @sideEffects Calls observer callbacks.
 */
async function emitState(context: IRunContext, state: IGameStatePrivate): Promise<void> {
    await context.options.onPrivateStateChange?.(state);

    for (const player of POSITIONAL_PLAYERS) {
        const publicState = toPublicGameState(state, player);
        await context.options.onPublicStateChange?.(player, publicState);
        await context.options.playerObservers?.[player]?.onStateChange(publicState);
    }
}

/**
 * Creates runtime context with defaults applied.
 *
 * @param players - Player implementations keyed by seat.
 * @param options - Caller-provided runtime options.
 * @returns Runtime context.
 * @sideEffects None.
 */
function createRunContext(players: PlayerSeats, options: IRunGameOptions): IRunContext {
    return {
        players,
        options,
        config: { ...DEFAULT_CONFIG, ...options.config },
        cardPlayDelayMs: options.cardPlayDelayMs ?? DEFAULT_CARD_PLAY_DELAY_MS,
        rng: options.rng ?? Math.random
    };
}

/**
 * Waits after an accepted card play so observers can display the played card.
 *
 * @param delayMs - Milliseconds to wait; zero or negative values skip the delay.
 * @returns Promise resolved after the configured delay.
 * @sideEffects Schedules a timer when delay is positive.
 */
async function delayAfterCardPlayed(delayMs: number): Promise<void> {
    if (delayMs <= 0) {
        return;
    }

    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

/**
 * Creates the initial private hand state from a shuffled deal.
 *
 * @param dealer - Dealer for the hand.
 * @param rng - Random number generator for shuffling.
 * @returns Private hand state.
 * @sideEffects None.
 */
function createHand(dealer: PositionalPlayer, rng: Rng): IHandStatePrivate {
    const deal = dealCards(shuffleCards(createDeck(), rng));
    const upCard = deal.kitty[0];

    if (upCard === undefined) {
        throw new Error("Dealt hand did not produce an upcard.");
    }

    return {
        hands: deal.hands,
        kitty: deal.kitty,
        upCard,
        dealer,
        playedCards: [],
        completedTricks: []
    };
}

/**
 * Creates a private game state object.
 *
 * @param config - Game configuration.
 * @param handNumber - One-based hand number.
 * @param dealer - Dealer for the hand.
 * @param score - Current score.
 * @param phase - Current game phase.
 * @returns Private game state.
 * @sideEffects None.
 */
function createGameState(
    config: IGameConfig,
    handNumber: number,
    dealer: PositionalPlayer,
    score: Readonly<Record<Team, number>>,
    phase: GamePhasePrivate
): IGameStatePrivate {
    return { config, handNumber, dealer, score, phase };
}

/**
 * Creates a terminal private game state.
 *
 * @param config - Game configuration.
 * @param handNumber - Final hand number.
 * @param dealer - Final dealer.
 * @param score - Final score.
 * @param winner - Winning team.
 * @returns Terminal private state.
 * @sideEffects None.
 */
function createCompleteState(
    config: IGameConfig,
    handNumber: number,
    dealer: PositionalPlayer,
    score: Readonly<Record<Team, number>>,
    winner: Team
): IGameStatePrivate {
    return createGameState(config, handNumber, dealer, score, {
        kind: "GameComplete",
        winner,
        finalScore: score
    });
}

/**
 * Adds a card to one player's hand and stores trump metadata.
 *
 * @param hand - Existing private hand state.
 * @param player - Player receiving the card.
 * @param card - Card to add.
 * @param trump - Trump suit selected.
 * @param maker - Player who selected trump.
 * @param goingAlone - Alone player, when any.
 * @returns Updated hand state.
 * @sideEffects None.
 */
function addCardToHand(
    hand: IHandStatePrivate,
    player: PositionalPlayer,
    card: ICard,
    trump: Suit,
    maker: PositionalPlayer,
    goingAlone: PositionalPlayer | undefined
): IHandStatePrivate {
    return {
        ...replaceHand(hand, player, [...hand.hands[player], card]),
        trump,
        maker,
        ...optionalPlayer("goingAlone", goingAlone)
    };
}

/**
 * Replaces one player's hand.
 *
 * @param hand - Existing private hand state.
 * @param player - Player whose hand should be replaced.
 * @param cards - Replacement cards.
 * @returns Updated hand state.
 * @sideEffects None.
 */
function replaceHand(hand: IHandStatePrivate, player: PositionalPlayer, cards: readonly ICard[]): IHandStatePrivate {
    return {
        ...hand,
        hands: {
            ...hand.hands,
            [player]: cards
        }
    };
}

/**
 * Returns non-turned-down suits for second-round bidding.
 *
 * @param turnedDownSuit - Suit of the upcard turned down.
 * @returns Available suits.
 * @sideEffects None.
 */
function getAvailableSuits(turnedDownSuit: Suit): readonly Suit[] {
    return [Suit.Hearts, Suit.Diamonds, Suit.Clubs, Suit.Spades].filter((suit) => suit !== turnedDownSuit);
}

/**
 * Returns the players active in one trick from the leader.
 *
 * @param leader - Trick leader.
 * @param sittingOut - Player skipped due to partner going alone.
 * @returns Active trick players in clockwise order.
 * @sideEffects None.
 */
function trickPlayers(leader: PositionalPlayer, sittingOut: PositionalPlayer | undefined): readonly PositionalPlayer[] {
    return [0, 1, 2, 3]
        .map((offset) => rotatePlayer(leader, offset))
        .filter((player) => player !== sittingOut);
}

/**
 * Creates a zero score record.
 *
 * @returns Score record with both teams at zero.
 * @sideEffects None.
 */
function createEmptyScore(): Readonly<Record<Team, number>> {
    return {
        [Team.NorthSouth]: 0,
        [Team.EastWest]: 0
    };
}

/**
 * Creates a zero trick-count record.
 *
 * @returns Trick-count record for all seats.
 * @sideEffects None.
 */
function createEmptyTricks(): Readonly<Record<PositionalPlayer, number>> {
    return {
        [PositionalPlayer.North]: 0,
        [PositionalPlayer.East]: 0,
        [PositionalPlayer.South]: 0,
        [PositionalPlayer.West]: 0
    };
}

/**
 * Adds points to one team.
 *
 * @param score - Existing score.
 * @param team - Team receiving points.
 * @param points - Points to add.
 * @returns Updated score.
 * @sideEffects None.
 */
function addScore(score: Readonly<Record<Team, number>>, team: Team, points: number): Readonly<Record<Team, number>> {
    return {
        ...score,
        [team]: score[team] + points
    };
}

/**
 * Increments one player's trick count.
 *
 * @param tricksTaken - Existing trick counts.
 * @param player - Trick winner.
 * @returns Updated trick counts.
 * @sideEffects None.
 */
function incrementTricks(
    tricksTaken: Readonly<Record<PositionalPlayer, number>>,
    player: PositionalPlayer
): Readonly<Record<PositionalPlayer, number>> {
    return {
        ...tricksTaken,
        [player]: tricksTaken[player] + 1
    };
}

/**
 * Checks whether the current score has a winner.
 *
 * @param score - Current score.
 * @param config - Game configuration.
 * @returns True when any team reached target score.
 * @sideEffects None.
 */
function hasWinner(score: Readonly<Record<Team, number>>, config: IGameConfig): boolean {
    return score[Team.NorthSouth] >= config.targetScore || score[Team.EastWest] >= config.targetScore;
}

/**
 * Returns the winning team from a completed score.
 *
 * @param score - Completed score.
 * @param config - Game configuration.
 * @returns Winning team.
 * @throws Error when no team has reached target score.
 * @sideEffects None.
 */
function getWinningTeam(score: Readonly<Record<Team, number>>, config: IGameConfig): Team {
    if (score[Team.NorthSouth] >= config.targetScore) {
        return Team.NorthSouth;
    }

    if (score[Team.EastWest] >= config.targetScore) {
        return Team.EastWest;
    }

    throw new Error(`No team has reached ${config.targetScore} points.`);
}

/**
 * Verifies that a card is present in a hand.
 *
 * @param hand - Hand to inspect.
 * @param card - Card to validate.
 * @param action - Action name for error messages.
 * @throws Error when card is absent.
 * @sideEffects None.
 */
function assertCardInHand(hand: readonly ICard[], card: ICard, action: string): void {
    if (findCardIndex(hand, card) < 0) {
        throw new Error(`Cannot ${action} ${formatCard(card)} because it is not in hand.`);
    }
}

/**
 * Verifies that a player may pass in trump selection.
 *
 * @param player - Player attempting to pass.
 * @param mustChooseTrump - Whether this player is forced to pick trump.
 * @throws Error when a forced player passes.
 * @sideEffects None.
 */
function assertMayPass(player: PositionalPlayer, mustChooseTrump: boolean): void {
    if (mustChooseTrump) {
        throw new Error(`Player ${PositionalPlayer[player]} must choose trump.`);
    }
}

/**
 * Verifies that a selected suit is available.
 *
 * @param player - Player choosing trump.
 * @param suit - Suit selected.
 * @param availableSuits - Legal second-round suits.
 * @throws Error when suit is unavailable.
 * @sideEffects None.
 */
function assertSuitAvailable(player: PositionalPlayer, suit: Suit, availableSuits: readonly Suit[]): void {
    if (!availableSuits.includes(suit)) {
        throw new Error(`Player ${PositionalPlayer[player]} chose unavailable trump suit ${suit}.`);
    }
}

/**
 * Verifies that a selected card is legal to play.
 *
 * @param player - Player choosing a card.
 * @param hand - Current player hand.
 * @param legalCards - Legal cards for this turn.
 * @param chosenCard - Player-selected card.
 * @throws Error when the selected card is absent or illegal.
 * @sideEffects None.
 */
function assertLegalPlay(
    player: PositionalPlayer,
    hand: readonly ICard[],
    legalCards: readonly ICard[],
    chosenCard: ICard
): void {
    assertCardInHand(hand, chosenCard, "play");

    if (!legalCards.some((card) => cardsEqual(card, chosenCard))) {
        throw new Error(`Player ${PositionalPlayer[player]} cannot legally play ${formatCard(chosenCard)}.`);
    }
}

/**
 * Builds an optional player property only when the value exists.
 *
 * @param key - Property name.
 * @param value - Optional player value.
 * @returns Empty object or one-property object.
 * @sideEffects None.
 */
function optionalPlayer<TKey extends string>(
    key: TKey,
    value: PositionalPlayer | undefined
): Partial<Record<TKey, PositionalPlayer>> {
    return value === undefined ? {} : { [key]: value } as Record<TKey, PositionalPlayer>;
}
