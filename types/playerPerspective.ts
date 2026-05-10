import { Player, PositionalPlayer } from "./enums";

const TABLE_ORDER: readonly PositionalPlayer[] = [
    PositionalPlayer.North,
    PositionalPlayer.East,
    PositionalPlayer.South,
    PositionalPlayer.West
];

const RELATIVE_PLAYERS_BY_OFFSET: readonly Player[] = [
    Player.Self,
    Player.LeftOpponent,
    Player.Partner,
    Player.RightOpponent
];

/**
 * Converts an absolute table position into a player-relative label.
 *
 * @param perspective - Absolute seat of the player receiving state.
 * @param player - Absolute seat to convert.
 * @returns Relative label from the perspective seat.
 * @throws Error when either seat is not a known `PositionalPlayer` value.
 * @sideEffects None.
 */
export function toRelativePlayer(perspective: PositionalPlayer, player: PositionalPlayer): Player {
    const perspectiveIndex = getTableIndex(perspective);
    const playerIndex = getTableIndex(player);
    const offset = (playerIndex - perspectiveIndex + TABLE_ORDER.length) % TABLE_ORDER.length;
    const relativePlayer = RELATIVE_PLAYERS_BY_OFFSET[offset];

    if (relativePlayer === undefined) {
        throw new Error(`Unable to convert positional player offset ${offset}.`);
    }

    return relativePlayer;
}

/**
 * Converts a player-relative label into an absolute table position.
 *
 * @param perspective - Absolute seat of the player receiving state.
 * @param player - Relative label to convert.
 * @returns Absolute table position represented by the relative player label.
 * @throws Error when the perspective or relative player is unknown.
 * @sideEffects None.
 */
export function toPositionalPlayer(perspective: PositionalPlayer, player: Player): PositionalPlayer {
    const perspectiveIndex = getTableIndex(perspective);
    const playerOffset = RELATIVE_PLAYERS_BY_OFFSET.indexOf(player);

    if (playerOffset < 0) {
        throw new Error(`Unknown relative player: ${String(player)}`);
    }

    return TABLE_ORDER[(perspectiveIndex + playerOffset) % TABLE_ORDER.length] as PositionalPlayer;
}

/**
 * Returns the clockwise table index for a positional player.
 *
 * @param player - Absolute seat to locate.
 * @returns Zero-based clockwise table index.
 * @throws Error when the seat is not in the fixed table order.
 * @sideEffects None.
 */
function getTableIndex(player: PositionalPlayer): number {
    const playerIndex = TABLE_ORDER.indexOf(player);

    if (playerIndex < 0) {
        throw new Error(`Unknown positional player: ${String(player)}`);
    }

    return playerIndex;
}
