import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { ICard, IPlayedCard } from "../types/cards";
import { Player, Suit } from "../types/enums";
import { GamePhasePublic, IGameStatePublic, Team } from "../types/gameState";
import { IHandStatePublic } from "../types/handState";
import { ICompletedTrickPublic } from "../types/trickState";
import { CARD_BACK_ASSET_URL, getCardAssetUrl } from "./cardAssets";
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

/**
 * Props for the human player view.
 */
export interface IHumanPlayerViewProps {
    controller: HumanPlayerController;
    humanTeam?: Team;
    onNewGame?: () => void;
}

/**
 * Renders public state and decision controls for one human player.
 *
 * @param props - Controller, optional human team, and optional reset callback.
 * @returns React view for the human player.
 * @sideEffects Subscribes to controller state and registers `window.debugMode`.
 */
export function HumanPlayerView({
    controller,
    humanTeam = DEFAULT_HUMAN_TEAM,
    onNewGame
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
                <EmptyTable onNewGame={onNewGame} />
            ) : (
                <GameStateDisplay
                    state={publicState}
                    decision={snapshot.pendingDecision}
                    controller={controller}
                    debugEnabled={debugEnabled}
                    humanTeam={humanTeam}
                    onNewGame={onNewGame}
                />
            )}
        </main>
    );
}

/**
 * Renders the empty waiting table.
 *
 * @param props - Optional reset callback.
 * @returns Empty table state.
 * @sideEffects None.
 */
function EmptyTable({ onNewGame }: { onNewGame: (() => void) | undefined }): ReactElement {
    return (
        <section className="table-surface empty-table" aria-label="Euchre table">
            <TableChrome phaseLabel="Waiting for game state" onNewGame={onNewGame} />
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
    humanTeam,
    onNewGame
}: {
    state: IGameStatePublic;
    decision: HumanPlayerDecision | undefined;
    controller: HumanPlayerController;
    debugEnabled: boolean;
    humanTeam: Team;
    onNewGame: (() => void) | undefined;
}): ReactElement {
    const hand = getPhaseHand(state.phase);

    if (hand === undefined) {
        return <TerminalState state={state} onNewGame={onNewGame} />;
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
                onNewGame={onNewGame}
            />
        </div>
    );
}

/**
 * Renders terminal game-complete state.
 *
 * @param props - Public state in a terminal phase and optional reset callback.
 * @returns React terminal summary.
 * @sideEffects None.
 */
function TerminalState({
    state,
    onNewGame
}: {
    state: IGameStatePublic;
    onNewGame: (() => void) | undefined;
}): ReactElement {
    const phase = state.phase;

    return (
        <section className="table-surface terminal-table" aria-label="Euchre table">
            <TableChrome phaseLabel={getPhaseLabel(state.phase)} onNewGame={onNewGame} />
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
    humanTeam,
    onNewGame
}: {
    state: IGameStatePublic;
    hand: IHandStatePublic;
    decision: HumanPlayerDecision | undefined;
    controller: HumanPlayerController;
    humanTeam: Team;
    onNewGame: (() => void) | undefined;
}): ReactElement {
    const plays = getCurrentTrickPlays(state.phase);

    return (
        <section className="table-surface" aria-label="Euchre table">
            <TableChrome phaseLabel={getPhaseLabel(state.phase)} onNewGame={onNewGame} />
            <ScoreOverlay
                ariaLabel="Hand score"
                className="hand-score-overlay"
                label="Hand"
                score={getHandScore(state.phase, hand)}
            />
            <ScoreOverlay
                ariaLabel="Game score"
                className="game-score-overlay"
                label="Game"
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
                        <TrickSlot key={player} player={player} play={plays.find((candidate) => candidate.player === player)} />
                    ))}
                </div>
                <DecisionControls controller={controller} decision={decision} />
            </div>
            <div className={`self-seat ${isCurrentTurn(state.phase, Player.Self) ? "current-turn" : ""}`}>
                <div className="seat-label-row">
                    <strong>You</strong>
                    <span>{getSelfActionLabel(decision)}</span>
                </div>
                <CardRow cards={hand.hand} legalCards={getLegalCardsForDecision(decision)} />
            </div>
        </section>
    );
}

/**
 * Renders top-level table controls and phase text.
 *
 * @param props - Phase label and optional reset callback.
 * @returns Table chrome element.
 * @sideEffects None.
 */
function TableChrome({
    phaseLabel,
    onNewGame
}: {
    phaseLabel: string;
    onNewGame: (() => void) | undefined;
}): ReactElement {
    return (
        <div className="table-chrome">
            <div>
                <h1>Euchre</h1>
                <p>{phaseLabel}</p>
            </div>
            <button type="button" onClick={onNewGame} disabled={onNewGame === undefined}>
                New game
            </button>
        </div>
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
    label,
    score
}: {
    ariaLabel: string;
    className: string;
    label: string;
    score: IRelativeScore;
}): ReactElement {
    return (
        <aside className={`score-overlay ${className}`} aria-label={ariaLabel}>
            <span className="score-title">{label}</span>
            <div className="score-pair">
                <ScorePill className="team-score-blue" label="Your team" value={score.yourTeam} />
                <ScorePill className="team-score-red" label="Opponents" value={score.opponents} />
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
    className,
    label,
    value
}: {
    className: string;
    label: string;
    value: number;
}): ReactElement {
    return (
        <div className={`score-pill ${className}`}>
            <span>{label}</span>
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
        <div className={`seat-panel ${getSeatClass(player)} ${isCurrentTurn(state.phase, player) ? "current-turn" : ""}`}>
            <div className="seat-label-row">
                <strong>{formatPlayer(player)}</strong>
                <span>{getSeatRoleLabel(hand, player)}</span>
            </div>
            <CardBackRow
                count={getVisibleBackCount(hand, state.phase, player)}
                label={`${formatPlayer(player)} hidden cards`}
                sideways={isSideOpponent(player)}
            />
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
    player,
    play
}: {
    player: Player;
    play: IPlayedCard<Player> | undefined;
}): ReactElement {
    return (
        <div className={`trick-slot ${getSeatClass(player)}`}>
            <span>{formatPlayer(player)}</span>
            {play === undefined ? <span className="empty-card-slot" aria-hidden="true" /> : <CardImage card={play.card} size="small" />}
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
}): ReactElement {
    if (decision === undefined) {
        return (
            <section className="decision-controls" aria-label="Decision">
                <p>Waiting for your turn.</p>
            </section>
        );
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
function renderDecision(controller: HumanPlayerController, decision: HumanPlayerDecision): ReactElement {
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
        case "DealerDiscard":
            return (
                <div className="decision-content">
                    <p>Discard one card after picking up {formatCardLong(decision.request.pickedUpCard)}.</p>
                    <CardButtonRow cards={decision.request.hand} onChoose={(card) => controller.chooseDealerDiscardFromUi(card)} />
                </div>
            );
        case "PlayCard":
            return (
                <div className="decision-content">
                    <p>Play a legal card.</p>
                    <CardButtonRow cards={decision.request.legalCards} onChoose={(card) => controller.chooseCardToPlayFromUi(card)} />
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
 * Renders visible cards as display-only elements.
 *
 * @param props - Cards and optional legal-card highlight set.
 * @returns React row of SVG cards.
 * @sideEffects None.
 */
function CardRow({
    cards,
    legalCards
}: {
    cards: readonly ICard[];
    legalCards?: readonly ICard[] | undefined;
}): ReactElement {
    return (
        <div className="card-row">
            {cards.map((card, index) => (
                <CardImage
                    card={card}
                    key={`${card.rank}-${card.suit}-${index}`}
                    legal={legalCards?.some((legalCard) => cardsEqual(legalCard, card))}
                />
            ))}
        </div>
    );
}

/**
 * Renders visible cards as selection buttons.
 *
 * @param props - Cards and selection callback.
 * @returns React row of card buttons.
 * @sideEffects None.
 */
function CardButtonRow({
    cards,
    onChoose
}: {
    cards: readonly ICard[];
    onChoose: (card: ICard) => void;
}): ReactElement {
    return (
        <div className="card-row">
            {cards.map((card, index) => (
                <button
                    aria-label={formatCardLong(card)}
                    className="playing-card-button"
                    key={`${card.rank}-${card.suit}-${index}`}
                    type="button"
                    onClick={() => onChoose(card)}
                >
                    <CardImage card={card} />
                </button>
            ))}
        </div>
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
    size = "normal",
    legal = false
}: {
    card: ICard;
    size?: "small" | "normal" | "medium" | undefined;
    legal?: boolean | undefined;
}): ReactElement {
    return (
        <img
            alt={formatCardLong(card)}
            className={`playing-card ${size === "small" ? "small-card" : ""} ${size === "medium" ? "medium-card" : ""} ${legal ? "legal-card" : ""}`}
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
    label,
    sideways
}: {
    count: number;
    label: string;
    sideways: boolean;
}): ReactElement {
    const backs = Array.from({ length: count }, (_, index) => index);

    return (
        <div className={`back-row ${sideways ? "sideways-backs" : ""}`} aria-label={label}>
            {backs.map((index) => (
                <img alt="Card back" className="playing-card card-back small-card" key={index} src={CARD_BACK_ASSET_URL} />
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
 * Returns a high-level label for the current phase.
 *
 * @param phase - Public game phase.
 * @returns Human-readable phase label.
 * @sideEffects None.
 */
function getPhaseLabel(phase: GamePhasePublic): string {
    switch (phase.kind) {
        case "Dealing":
            return "Cards dealt";
        case "OrderingTrump":
            return `${formatPlayer(phase.currentPlayer)} deciding on the upcard`;
        case "DealerDiscard":
            return "Dealer discarding";
        case "ChoosingTrump":
            return `${formatPlayer(phase.currentPlayer)} choosing trump`;
        case "PlayingTrick":
            return `${formatPlayer(phase.trick.currentPlayer)} to play`;
        case "ScoringHand":
            return `${formatTeam(phase.scoringTeam)} scored ${phase.pointsAwarded}`;
        case "GameComplete":
            return `Game complete: ${formatTeam(phase.winner)} won`;
    }
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
 * Returns legal cards from a pending play decision.
 *
 * @param decision - Current pending decision.
 * @returns Legal play cards when the user is playing a card.
 * @sideEffects None.
 */
function getLegalCardsForDecision(decision: HumanPlayerDecision | undefined): readonly ICard[] | undefined {
    return decision?.kind === "PlayCard" ? decision.request.legalCards : undefined;
}

/**
 * Returns a label for the self hand action hint.
 *
 * @param decision - Current pending decision.
 * @returns Short action label.
 * @sideEffects None.
 */
function getSelfActionLabel(decision: HumanPlayerDecision | undefined): string {
    return decision?.kind === "PlayCard" ? "Your play" : "Your hand";
}

/**
 * Returns a short role badge for one seat.
 *
 * @param hand - Current public hand state.
 * @param player - Relative player to label.
 * @returns Dealer, maker, alone, or empty label.
 * @sideEffects None.
 */
function getSeatRoleLabel(hand: IHandStatePublic, player: Player): string {
    if (hand.goingAlone === player) {
        return "Going alone";
    }

    if (hand.maker === player) {
        return "Maker";
    }

    if (hand.dealer === player) {
        return "Dealer";
    }

    return "";
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
