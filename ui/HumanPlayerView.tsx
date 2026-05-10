import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { ICard, IPlayedCard } from "../types/cards";
import { Player, Rank, Suit } from "../types/enums";
import { GamePhasePublic, IGameStatePublic, Team } from "../types/gameState";
import { IHandStatePublic } from "../types/handState";
import { ICompletedTrickPublic } from "../types/trickState";
import { OPPONENT_CARD_BACK_ASSET_URL, TEAMMATE_CARD_BACK_ASSET_URL, getCardAssetUrl } from "./cardAssets";
import { HumanPlayerController, HumanPlayerDecision } from "./HumanPlayerController";
import { useHumanPlayerController } from "./useHumanPlayerController";

declare global {
    interface Window {
        debugMode?: () => boolean;
    }
}

const TABLE_PLAYERS: readonly Player[] = [
    Player.Partner,
    Player.LeftOpponent,
    Player.RightOpponent,
    Player.Self
];

const DEFAULT_HUMAN_TEAM = Team.NorthSouth;
const DISPLAY_SUIT_ORDER: Readonly<Record<Suit, number>> = {
    [Suit.Hearts]: 0,
    [Suit.Diamonds]: 1,
    [Suit.Clubs]: 2,
    [Suit.Spades]: 3
};
const DISPLAY_RANK_ORDER: Readonly<Record<Rank, number>> = {
    [Rank.Nine]: 0,
    [Rank.Ten]: 1,
    [Rank.Jack]: 2,
    [Rank.Queen]: 3,
    [Rank.King]: 4,
    [Rank.Ace]: 5
};

type HandInteraction =
    | { kind: "display" }
    | { kind: "discard"; onChoose: (card: ICard) => void }
    | { kind: "play"; legalCards: readonly ICard[]; onChoose: (card: ICard) => void };
type PromptDecision = Extract<HumanPlayerDecision, { kind: "OrderTrump" | "ChooseTrump" }>;

/**
 * Props for the human player view.
 */
export interface IHumanPlayerViewProps {
    controller: HumanPlayerController;
    humanTeam?: Team;
}

/**
 * Renders public state and decision controls for one human player.
 *
 * @param props - Controller and optional human team.
 * @returns React view for the human player.
 * @sideEffects Subscribes to controller state and registers `window.debugMode`.
 */
export function HumanPlayerView({
    controller,
    humanTeam = DEFAULT_HUMAN_TEAM
}: IHumanPlayerViewProps): ReactElement {
    const snapshot = useHumanPlayerController(controller);
    const [debugEnabled, setDebugEnabled] = useState(false);
    const publicState = snapshot.publicState;

    useEffect(() => {
        window.debugMode = () => {
            let nextDebugEnabled = false;

            setDebugEnabled((currentDebugEnabled) => {
                nextDebugEnabled = !currentDebugEnabled;
                return nextDebugEnabled;
            });

            return nextDebugEnabled;
        };

        return () => {
            delete window.debugMode;
        };
    }, []);

    return (
        <main className={`app-shell ${debugEnabled ? "debug-layout" : ""}`}>
            {snapshot.error === undefined ? null : <p className="error" role="alert">{snapshot.error}</p>}
            {publicState === undefined ? (
                <EmptyTable />
            ) : (
                <GameStateDisplay
                    state={publicState}
                    decision={snapshot.pendingDecision}
                    controller={controller}
                    debugEnabled={debugEnabled}
                    humanTeam={humanTeam}
                />
            )}
        </main>
    );
}

/**
 * Renders the empty waiting table.
 *
 * @returns Empty table state.
 * @sideEffects None.
 */
function EmptyTable(): ReactElement {
    return (
        <section className="table-surface empty-table" aria-label="Euchre table">
            <div className="table-message">
                <h1>Euchre</h1>
                <p>No public state has been received yet.</p>
            </div>
        </section>
    );
}

/**
 * Renders the table and optional debug state card.
 *
 * @param props - Public state, controls, and display options.
 * @returns Table-first display.
 * @sideEffects None.
 */
function GameStateDisplay({
    state,
    decision,
    controller,
    debugEnabled,
    humanTeam
}: {
    state: IGameStatePublic;
    decision: HumanPlayerDecision | undefined;
    controller: HumanPlayerController;
    debugEnabled: boolean;
    humanTeam: Team;
}): ReactElement {
    const hand = getPhaseHand(state.phase);

    if (hand === undefined) {
        return <TerminalState state={state} />;
    }

    return (
        <div className="table-layout">
            {debugEnabled ? <DebugStateCard state={state} hand={hand} humanTeam={humanTeam} /> : null}
            <TableView
                state={state}
                hand={hand}
                decision={decision}
                controller={controller}
                humanTeam={humanTeam}
            />
        </div>
    );
}

/**
 * Renders terminal game-complete state.
 *
 * @param props - Public state in a terminal phase.
 * @returns React terminal summary.
 * @sideEffects None.
 */
function TerminalState({ state }: { state: IGameStatePublic }): ReactElement {
    const phase = state.phase;

    return (
        <section className="table-surface terminal-table" aria-label="Euchre table">
            <div className="table-message">
                <h1>Game complete</h1>
                {phase.kind === "GameComplete" ? (
                    <>
                        <p>Winner: {formatTeam(phase.winner)}</p>
                        <p>Final score: {formatScore(phase.finalScore)}</p>
                    </>
                ) : null}
            </div>
        </section>
    );
}

/**
 * Renders the four-seat table and center trick.
 *
 * @param props - State, public hand, decision controls, and score perspective.
 * @returns Table view.
 * @sideEffects None.
 */
function TableView({
    state,
    hand,
    decision,
    controller,
    humanTeam
}: {
    state: IGameStatePublic;
    hand: IHandStatePublic;
    decision: HumanPlayerDecision | undefined;
    controller: HumanPlayerController;
    humanTeam: Team;
}): ReactElement {
    const plays = getCurrentTrickPlays(state.phase);
    const handInteraction = getHandInteraction(decision, controller);

    return (
        <section className="table-surface" aria-label="Euchre table">
            <ScoreOverlay
                ariaLabel="Hand score"
                className="hand-score-overlay"
                score={getHandScore(state.phase, hand)}
            />
            <ScoreOverlay
                ariaLabel="Game score"
                className="game-score-overlay"
                score={getTeamScore(state.score, humanTeam)}
            />
            <SeatPanel player={Player.Partner} hand={hand} state={state} />
            <SeatPanel player={Player.LeftOpponent} hand={hand} state={state} />
            <SeatPanel player={Player.RightOpponent} hand={hand} state={state} />
            <div className="trick-center" aria-label="Current trick">
                <div className="table-status">
                    <span className="eyebrow">Current trick</span>
                    <strong>{getTrickSummary(state.phase)}</strong>
                </div>
                <div className="trick-grid">
                    {TABLE_PLAYERS.map((player) => (
                        <TrickSlot
                            current={isCurrentTurn(state.phase, player)}
                            key={player}
                            player={player}
                            play={plays.find((candidate) => candidate.player === player)}
                        />
                    ))}
                </div>
                <DecisionControls controller={controller} decision={decision} />
            </div>
            <div className="self-seat" aria-label="Your hand">
                <SeatChips hand={hand} player={Player.Self} />
                <CardRow
                    cards={getDisplayHandCards(hand, decision)}
                    current={isCurrentTurn(state.phase, Player.Self)}
                    interaction={handInteraction}
                    trump={hand.trump}
                />
            </div>
        </section>
    );
}

/**
 * Renders a paired blue/red score overlay.
 *
 * @param props - Score label, values, CSS class, and accessible label.
 * @returns Score overlay.
 * @sideEffects None.
 */
function ScoreOverlay({
    ariaLabel,
    className,
    score
}: {
    ariaLabel: string;
    className: string;
    score: IRelativeScore;
}): ReactElement {
    return (
        <aside className={`score-overlay ${className}`} aria-label={ariaLabel}>
            <div className="score-pair">
                <ScorePill ariaLabel="Your team score" className="team-score-blue" value={score.yourTeam} />
                <ScorePill ariaLabel="Opponent score" className="team-score-red" value={score.opponents} />
            </div>
        </aside>
    );
}

/**
 * Renders one team score value.
 *
 * @param props - Label, numeric value, and color class.
 * @returns Score pill.
 * @sideEffects None.
 */
function ScorePill({
    ariaLabel,
    className,
    value
}: {
    ariaLabel: string;
    className: string;
    value: number;
}): ReactElement {
    return (
        <div className={`score-pill ${className}`} aria-label={ariaLabel}>
            <strong>{value}</strong>
        </div>
    );
}

/**
 * Renders an opponent or partner seat.
 *
 * @param props - Player seat, public hand state, and current public state.
 * @returns Seat panel with card backs and role badges.
 * @sideEffects None.
 */
function SeatPanel({
    player,
    hand,
    state
}: {
    player: Player;
    hand: IHandStatePublic;
    state: IGameStatePublic;
}): ReactElement {
    return (
        <div className={`seat-panel ${getSeatClass(player)}`} aria-label={`${formatPlayer(player)} seat`}>
            <SeatChips hand={hand} player={player} />
            <CardBackRow
                count={getVisibleBackCount(hand, state.phase, player)}
                current={isCurrentTurn(state.phase, player)}
                label={`${formatPlayer(player)} hidden cards`}
                player={player}
                sideways={isSideOpponent(player)}
            />
        </div>
    );
}

/**
 * Renders seat-level status chips without reintroducing visible seat labels.
 *
 * @param props - Current public hand and relative player seat.
 * @returns Reserved marker slot with dealer and trump-maker chips when applicable.
 * @sideEffects None.
 */
function SeatChips({
    hand,
    player
}: {
    hand: IHandStatePublic;
    player: Player;
}): ReactElement {
    const isDealer = hand.dealer === player;
    const makerTrump = hand.maker === player ? hand.trump : undefined;

    return (
        <div className={`seat-chips ${isSideOpponent(player) ? "side-seat-chips" : ""}`} aria-label={`${formatPlayer(player)} markers`}>
            {isDealer ? <span className="table-chip dealer-chip">Dealer</span> : null}
            {makerTrump === undefined ? null : <span className="table-chip trump-chip">{formatSuit(makerTrump)}</span>}
        </div>
    );
}

/**
 * Renders one current-trick slot.
 *
 * @param props - Relative player and optional played card.
 * @returns Trick slot.
 * @sideEffects None.
 */
function TrickSlot({
    current,
    player,
    play
}: {
    current: boolean;
    player: Player;
    play: IPlayedCard<Player> | undefined;
}): ReactElement {
    return (
        <div className={`trick-slot ${getSeatClass(player)}`}>
            {play === undefined ? (
                <span className={`empty-card-slot ${current ? "current-turn-glow" : ""}`} aria-hidden="true" />
            ) : (
                <CardImage card={play.card} current={current} size="small" />
            )}
        </div>
    );
}

/**
 * Renders the active decision prompt inside the table.
 *
 * @param props - Controller and pending decision.
 * @returns React decision controls.
 * @sideEffects None.
 */
function DecisionControls({
    controller,
    decision
}: {
    controller: HumanPlayerController;
    decision: HumanPlayerDecision | undefined;
}): ReactElement | null {
    if (decision === undefined || decision.kind === "DealerDiscard" || decision.kind === "PlayCard") {
        return null;
    }

    return (
        <section className="decision-controls active" aria-label="Decision">
            {renderDecision(controller, decision)}
        </section>
    );
}

/**
 * Renders decision-specific controls.
 *
 * @param controller - Human player controller.
 * @param decision - Pending decision.
 * @returns React controls for the decision.
 * @sideEffects None.
 */
function renderDecision(controller: HumanPlayerController, decision: PromptDecision): ReactElement {
    switch (decision.kind) {
        case "OrderTrump":
            return (
                <div className="decision-content">
                    <div className="decision-card">
                        <CardImage card={decision.request.proposedTrumpCard} size="medium" />
                        <p>Order up {formatCardLong(decision.request.proposedTrumpCard)} to {formatPlayer(decision.request.dealer)}?</p>
                    </div>
                    <div className="button-row">
                        <button type="button" onClick={() => controller.resolveOrderTrump(true)}>Order up</button>
                        <button type="button" onClick={() => controller.resolveOrderTrump(false)}>Pass</button>
                    </div>
                </div>
            );
        case "ChooseTrump":
            return (
                <div className="decision-content">
                    <p>{decision.request.mustChooseTrump ? "Choose trump. Stick the dealer is active." : "Choose trump or pass."}</p>
                    <div className="button-row">
                        {decision.request.availableSuits.map((suit) => (
                            <button key={suit} type="button" onClick={() => controller.resolveTrumpChoice(suit)}>
                                {formatSuit(suit)}
                            </button>
                        ))}
                        {decision.request.mustChooseTrump ? null : (
                            <button type="button" onClick={() => controller.passTrump()}>Pass</button>
                        )}
                    </div>
                </div>
            );
    }
}

/**
 * Renders the optional debug state card.
 *
 * @param props - Current public state, hand state, and scoring perspective.
 * @returns Debug state card.
 * @sideEffects None.
 */
function DebugStateCard({
    state,
    hand,
    humanTeam
}: {
    state: IGameStatePublic;
    hand: IHandStatePublic;
    humanTeam: Team;
}): ReactElement {
    const handScore = getHandScore(state.phase, hand);
    const teamScore = getTeamScore(state.score, humanTeam);

    return (
        <aside className="debug-state-card" aria-label="Debug state">
            <h2>State</h2>
            <dl>
                <DebugRow label="Phase" value={state.phase.kind} />
                <DebugRow label="Hand" value={String(state.handNumber)} />
                <DebugRow label="Dealer" value={formatPlayer(state.dealer)} />
                <DebugRow label="Trump" value={hand.trump ?? "Not chosen"} />
                <DebugRow label="Maker" value={hand.maker === undefined ? "None" : formatPlayer(hand.maker)} />
                <DebugRow label="Alone" value={hand.goingAlone === undefined ? "None" : formatPlayer(hand.goingAlone)} />
                <DebugRow label="Turn" value={getTurnLabel(state.phase)} />
                <DebugRow label="Hand score" value={`${handScore.yourTeam} - ${handScore.opponents}`} />
                <DebugRow label="Game score" value={`${teamScore.yourTeam} - ${teamScore.opponents}`} />
                <DebugRow label="Upcard" value={hand.upCard === undefined ? "None" : formatCardShort(hand.upCard)} />
                <DebugRow label="Tricks" value={String(hand.completedTricks.length)} />
                <DebugRow label="Current plays" value={formatCurrentPlays(state.phase)} />
            </dl>
        </aside>
    );
}

/**
 * Renders one debug metadata row.
 *
 * @param props - Row label and value.
 * @returns Definition-list row.
 * @sideEffects None.
 */
function DebugRow({ label, value }: { label: string; value: string }): ReactElement {
    return (
        <div className="debug-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
        </div>
    );
}

/**
 * Renders the sorted human hand row.
 *
 * @param props - Cards, current turn state, interaction mode, and active trump.
 * @returns React hand row with display-only, discard, or play-card behavior.
 * @sideEffects None.
 */
function CardRow({
    cards,
    current = false,
    interaction = { kind: "display" },
    trump
}: {
    cards: readonly ICard[];
    current?: boolean | undefined;
    interaction?: HandInteraction | undefined;
    trump?: Suit | undefined;
}): ReactElement {
    return (
        <div className={`card-row ${current ? "current-turn-glow" : ""}`}>
            {sortCardsForDisplay(cards, trump).map((card, index) => (
                <CardRowItem
                    card={card}
                    interaction={interaction}
                    key={`${card.rank}-${card.suit}-${index}`}
                />
            ))}
        </div>
    );
}

/**
 * Renders one card in the human hand row.
 *
 * @param props - Card and current interaction mode.
 * @returns Display-only card or clickable/disabled card button.
 * @sideEffects None.
 */
function CardRowItem({
    card,
    interaction
}: {
    card: ICard;
    interaction: HandInteraction;
}): ReactElement {
    if (interaction.kind === "display") {
        return <CardImage card={card} />;
    }

    const enabled = interaction.kind === "discard" || interaction.legalCards.some((legalCard) => cardsEqual(legalCard, card));
    const onChoose = interaction.onChoose;

    return (
        <button
            aria-label={formatCardLong(card)}
            className="playing-card-button"
            disabled={!enabled}
            type="button"
            onClick={() => onChoose(card)}
        >
            <CardImage card={card} disabled={!enabled} legal={enabled} />
        </button>
    );
}

/**
 * Renders one visible card SVG.
 *
 * @param props - Card, size, and legal-state styling flag.
 * @returns Card image element.
 * @sideEffects Loads a local SVG asset in the browser.
 */
function CardImage({
    card,
    current = false,
    disabled = false,
    size = "normal",
    legal = false
}: {
    card: ICard;
    current?: boolean | undefined;
    disabled?: boolean | undefined;
    size?: "small" | "normal" | "medium" | undefined;
    legal?: boolean | undefined;
}): ReactElement {
    return (
        <img
            alt={formatCardLong(card)}
            className={`playing-card ${size === "small" ? "small-card" : ""} ${size === "medium" ? "medium-card" : ""} ${legal ? "legal-card" : ""} ${disabled ? "disabled-card" : ""} ${current ? "current-turn-glow" : ""}`}
            src={getCardAssetUrl(card)}
        />
    );
}

/**
 * Renders card backs for hidden hands.
 *
 * @param props - Number, label, and orientation of backs to render.
 * @returns Row of card-back SVGs.
 * @sideEffects Loads a local SVG asset in the browser.
 */
function CardBackRow({
    count,
    current = false,
    label,
    player,
    sideways
}: {
    count: number;
    current?: boolean | undefined;
    label: string;
    player: Player;
    sideways: boolean;
}): ReactElement {
    const backs = Array.from({ length: count }, (_, index) => index);
    const backAssetUrl = getCardBackAssetUrl(player);
    const backClass = isHumanSide(player) ? "team-card-back" : "opponent-card-back";

    return (
        <div className={`back-row ${sideways ? "sideways-backs" : ""} ${current ? "current-turn-glow" : ""}`} aria-label={label}>
            {backs.map((index) => (
                <img alt="Card back" className={`playing-card card-back small-card ${backClass}`} key={index} src={backAssetUrl} />
            ))}
        </div>
    );
}

/**
 * Relative score values for the human perspective.
 */
interface IRelativeScore {
    yourTeam: number;
    opponents: number;
}

/**
 * Returns the current hand's trick score from the available public phase.
 *
 * @param phase - Public game phase.
 * @param hand - Public hand state.
 * @returns Relative trick score for the hand.
 * @sideEffects None.
 */
function getHandScore(phase: GamePhasePublic, hand: IHandStatePublic): IRelativeScore {
    if (phase.kind === "PlayingTrick") {
        return aggregateTrickCounts(Object.entries(phase.trick.tricksTaken) as Array<[Player, number]>);
    }

    return aggregateCompletedTricks(hand.completedTricks);
}

/**
 * Aggregates game score into human and opponent team values.
 *
 * @param score - Absolute team score record.
 * @param humanTeam - Team containing the human player.
 * @returns Relative game score.
 * @sideEffects None.
 */
function getTeamScore(score: Readonly<Record<Team, number>>, humanTeam: Team): IRelativeScore {
    const opponentTeam = humanTeam === Team.NorthSouth ? Team.EastWest : Team.NorthSouth;

    return {
        yourTeam: score[humanTeam],
        opponents: score[opponentTeam]
    };
}

/**
 * Aggregates completed-trick winners into a relative score.
 *
 * @param completedTricks - Completed trick history.
 * @returns Relative trick score.
 * @sideEffects None.
 */
function aggregateCompletedTricks(completedTricks: readonly ICompletedTrickPublic[]): IRelativeScore {
    return aggregateTrickCounts(completedTricks.map((trick) => [trick.winner, 1]));
}

/**
 * Aggregates per-player trick counts into team totals.
 *
 * @param counts - Relative player/count pairs.
 * @returns Relative trick score.
 * @sideEffects None.
 */
function aggregateTrickCounts(counts: readonly (readonly [Player, number])[]): IRelativeScore {
    return counts.reduce<IRelativeScore>((score, [player, count]) => {
        if (isHumanSide(player)) {
            return { ...score, yourTeam: score.yourTeam + count };
        }

        return { ...score, opponents: score.opponents + count };
    }, { yourTeam: 0, opponents: 0 });
}

/**
 * Returns the public hand state from phases that include one.
 *
 * @param phase - Public game phase.
 * @returns Public hand state when present.
 * @sideEffects None.
 */
function getPhaseHand(phase: GamePhasePublic): IHandStatePublic | undefined {
    return "hand" in phase ? phase.hand : undefined;
}

/**
 * Returns the active turn label for status display.
 *
 * @param phase - Public game phase.
 * @returns Current turn label.
 * @sideEffects None.
 */
function getTurnLabel(phase: GamePhasePublic): string {
    switch (phase.kind) {
        case "OrderingTrump":
        case "ChoosingTrump":
            return formatPlayer(phase.currentPlayer);
        case "PlayingTrick":
            return formatPlayer(phase.trick.currentPlayer);
        case "DealerDiscard":
            return formatPlayer(phase.dealer);
        default:
            return "None";
    }
}

/**
 * Returns a compact trick status line.
 *
 * @param phase - Public game phase.
 * @returns Trick summary.
 * @sideEffects None.
 */
function getTrickSummary(phase: GamePhasePublic): string {
    if (phase.kind !== "PlayingTrick") {
        return "Waiting for trick play";
    }

    return `${formatPlayer(phase.trick.currentPlayer)} to play`;
}

/**
 * Returns current trick plays when available.
 *
 * @param phase - Public game phase.
 * @returns Current trick plays or an empty list.
 * @sideEffects None.
 */
function getCurrentTrickPlays(phase: GamePhasePublic): readonly IPlayedCard<Player>[] {
    return phase.kind === "PlayingTrick" ? phase.trick.plays : [];
}

/**
 * Formats the in-progress trick plays for the debug card.
 *
 * @param phase - Public game phase.
 * @returns Compact current-play text.
 * @sideEffects None.
 */
function formatCurrentPlays(phase: GamePhasePublic): string {
    const plays = getCurrentTrickPlays(phase);

    if (plays.length === 0) {
        return "None";
    }

    return plays.map((play) => `${formatPlayer(play.player)} ${formatCardShort(play.card)}`).join(", ");
}

/**
 * Checks whether a relative player is currently acting.
 *
 * @param phase - Public game phase.
 * @param player - Relative player to check.
 * @returns True when the player is the current actor.
 * @sideEffects None.
 */
function isCurrentTurn(phase: GamePhasePublic, player: Player): boolean {
    return getCurrentTurnPlayer(phase) === player;
}

/**
 * Returns the current acting player, when a phase has one.
 *
 * @param phase - Public game phase.
 * @returns Current relative player or undefined.
 * @sideEffects None.
 */
function getCurrentTurnPlayer(phase: GamePhasePublic): Player | undefined {
    switch (phase.kind) {
        case "OrderingTrump":
        case "ChoosingTrump":
            return phase.currentPlayer;
        case "DealerDiscard":
            return phase.dealer;
        case "PlayingTrick":
            return phase.trick.currentPlayer;
        default:
            return undefined;
    }
}

/**
 * Returns how the human hand row should behave for the current decision.
 *
 * @param decision - Pending decision, if any.
 * @param controller - Human player controller used to resolve card choices.
 * @returns Display, discard, or play interaction mode.
 * @sideEffects None.
 */
function getHandInteraction(decision: HumanPlayerDecision | undefined, controller: HumanPlayerController): HandInteraction {
    switch (decision?.kind) {
        case "DealerDiscard":
            return { kind: "discard", onChoose: (card) => controller.chooseDealerDiscardFromUi(card) };
        case "PlayCard":
            return {
                kind: "play",
                legalCards: decision.request.legalCards,
                onChoose: (card) => controller.chooseCardToPlayFromUi(card)
            };
        default:
            return { kind: "display" };
    }
}

/**
 * Returns the card list that should be visible in the human hand row.
 *
 * @param hand - Current public hand.
 * @param decision - Pending decision, if any.
 * @returns Dealer discard hand when discarding, otherwise the public hand.
 * @sideEffects None.
 */
function getDisplayHandCards(hand: IHandStatePublic, decision: HumanPlayerDecision | undefined): readonly ICard[] {
    return decision?.kind === "DealerDiscard" ? decision.request.hand : hand.hand;
}

/**
 * Returns the hidden-card back asset for a relative player.
 *
 * @param player - Relative player whose hidden card back is being rendered.
 * @returns Teammate or opponent card-back URL.
 * @sideEffects None.
 */
function getCardBackAssetUrl(player: Player): string {
    return isHumanSide(player) ? TEAMMATE_CARD_BACK_ASSET_URL : OPPONENT_CARD_BACK_ASSET_URL;
}

/**
 * Returns the inferred number of hidden cards for another player.
 *
 * @param hand - Public hand state.
 * @param phase - Current phase.
 * @param player - Relative player to count.
 * @returns Count of card backs to render.
 * @sideEffects None.
 */
function getVisibleBackCount(hand: IHandStatePublic, phase: GamePhasePublic, player: Player): number {
    if (isSittingOut(hand.goingAlone, player)) {
        return 0;
    }

    const playsByPlayer = getPlayedCardsForCount(hand, phase).filter((play) => play.player === player).length;

    return Math.max(0, 5 - playsByPlayer);
}

/**
 * Returns public played cards used for hidden-hand count inference.
 *
 * @param hand - Public hand state.
 * @param phase - Current phase.
 * @returns Completed and in-progress played cards without duplicate completed trick plays.
 * @sideEffects None.
 */
function getPlayedCardsForCount(hand: IHandStatePublic, phase: GamePhasePublic): readonly IPlayedCard<Player>[] {
    return phase.kind === "PlayingTrick" ? [...hand.playedCards, ...phase.trick.plays] : hand.playedCards;
}

/**
 * Checks whether a player sits out because their partner is going alone.
 *
 * @param goingAlone - Player going alone, when any.
 * @param player - Player to check.
 * @returns True when the player should have no card backs.
 * @sideEffects None.
 */
function isSittingOut(goingAlone: Player | undefined, player: Player): boolean {
    return goingAlone !== undefined && getPartner(goingAlone) === player;
}

/**
 * Returns the relative partner for a player.
 *
 * @param player - Relative player.
 * @returns Relative partner.
 * @sideEffects None.
 */
function getPartner(player: Player): Player {
    switch (player) {
        case Player.Self:
            return Player.Partner;
        case Player.Partner:
            return Player.Self;
        case Player.LeftOpponent:
            return Player.RightOpponent;
        case Player.RightOpponent:
            return Player.LeftOpponent;
    }
}

/**
 * Checks whether a player belongs to the human side.
 *
 * @param player - Relative player.
 * @returns True for self and partner.
 * @sideEffects None.
 */
function isHumanSide(player: Player): boolean {
    return player === Player.Self || player === Player.Partner;
}

/**
 * Checks whether a seat is one of the side opponents.
 *
 * @param player - Relative player.
 * @returns True for left or right opponent seats.
 * @sideEffects None.
 */
function isSideOpponent(player: Player): boolean {
    return player === Player.LeftOpponent || player === Player.RightOpponent;
}

/**
 * Returns the CSS seat class for a relative player.
 *
 * @param player - Relative player.
 * @returns Seat position class.
 * @sideEffects None.
 */
function getSeatClass(player: Player): string {
    switch (player) {
        case Player.Self:
            return "seat-self";
        case Player.Partner:
            return "seat-partner";
        case Player.LeftOpponent:
            return "seat-left";
        case Player.RightOpponent:
            return "seat-right";
    }
}

/**
 * Formats a relative player label.
 *
 * @param player - Relative player.
 * @returns Human-readable player label.
 * @sideEffects None.
 */
function formatPlayer(player: Player): string {
    switch (player) {
        case Player.Self:
            return "You";
        case Player.Partner:
            return "Partner";
        case Player.LeftOpponent:
            return "Left opponent";
        case Player.RightOpponent:
            return "Right opponent";
    }
}

/**
 * Formats a team label.
 *
 * @param team - Team enum value.
 * @returns Human-readable team label.
 * @sideEffects None.
 */
function formatTeam(team: Team): string {
    return team === Team.NorthSouth ? "North/South" : "East/West";
}

/**
 * Formats a score record.
 *
 * @param score - Team score record.
 * @returns Compact score string.
 * @sideEffects None.
 */
function formatScore(score: Readonly<Record<Team, number>>): string {
    return `${score[Team.NorthSouth]} - ${score[Team.EastWest]}`;
}

/**
 * Formats a card for compact metadata.
 *
 * @param card - Card to format.
 * @returns Short readable card label.
 * @sideEffects None.
 */
function formatCardShort(card: ICard): string {
    return `${card.rank}${getSuitInitial(card.suit)}`;
}

/**
 * Formats a card for accessible labels and prompts.
 *
 * @param card - Card to format.
 * @returns Long readable card label.
 * @sideEffects None.
 */
function formatCardLong(card: ICard): string {
    return `${formatRank(card.rank)} ${formatSuit(card.suit)}`;
}

/**
 * Formats a rank label.
 *
 * @param rank - Card rank.
 * @returns Human-readable rank.
 * @sideEffects None.
 */
function formatRank(rank: ICard["rank"]): string {
    return rank === "10" ? "10" : rank;
}

/**
 * Formats a suit label.
 *
 * @param suit - Card suit.
 * @returns Suit label.
 * @sideEffects None.
 */
function formatSuit(suit: Suit): string {
    return suit;
}

/**
 * Returns one-letter suit initial for compact card labels.
 *
 * @param suit - Card suit.
 * @returns One-letter suit code.
 * @sideEffects None.
 */
function getSuitInitial(suit: Suit): string {
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
 * Returns a new hand sorted for display by effective suit, then rank.
 *
 * @param cards - Cards to display without mutating the source order.
 * @param trump - Active trump suit, when known.
 * @returns Cards ordered by suit group and rank within each suit.
 * @sideEffects None.
 */
function sortCardsForDisplay(cards: readonly ICard[], trump: Suit | undefined): readonly ICard[] {
    return [...cards].sort((firstCard, secondCard) => compareCardsForDisplay(firstCard, secondCard, trump));
}

/**
 * Compares two cards by display suit and rank.
 *
 * @param firstCard - First card to compare.
 * @param secondCard - Second card to compare.
 * @param trump - Active trump suit, when known.
 * @returns Negative, zero, or positive value for Array.sort.
 * @sideEffects None.
 */
function compareCardsForDisplay(firstCard: ICard, secondCard: ICard, trump: Suit | undefined): number {
    const suitDifference = DISPLAY_SUIT_ORDER[getDisplaySuit(firstCard, trump)] - DISPLAY_SUIT_ORDER[getDisplaySuit(secondCard, trump)];

    if (suitDifference !== 0) {
        return suitDifference;
    }

    return DISPLAY_RANK_ORDER[firstCard.rank] - DISPLAY_RANK_ORDER[secondCard.rank];
}

/**
 * Returns the suit bucket a card should occupy in the player's display hand.
 *
 * @param card - Card to bucket.
 * @param trump - Active trump suit, when known.
 * @returns Effective suit for sorting, including left-bower promotion.
 * @sideEffects None.
 */
function getDisplaySuit(card: ICard, trump: Suit | undefined): Suit {
    if (trump === undefined) {
        return card.suit;
    }

    return isLeftBower(card, trump) ? trump : card.suit;
}

/**
 * Checks whether a card is the left bower for the active trump suit.
 *
 * @param card - Card to evaluate.
 * @param trump - Active trump suit.
 * @returns True when the card is the jack of the same-color suit.
 * @sideEffects None.
 */
function isLeftBower(card: ICard, trump: Suit): boolean {
    return card.rank === Rank.Jack && card.suit === sameColorSuit(trump);
}

/**
 * Returns the other suit of the same color.
 *
 * @param suit - Suit to pair by color.
 * @returns Same-color suit.
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
