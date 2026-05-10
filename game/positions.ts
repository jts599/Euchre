import { PositionalPlayer } from "../types/enums";
import { Team } from "../types/gameState";

/**
 * Clockwise order of absolute table positions.
 */
export const POSITIONAL_PLAYERS: readonly PositionalPlayer[] = [
    PositionalPlayer.North,
    PositionalPlayer.East,
    PositionalPlayer.South,
    PositionalPlayer.West
];

/**
 * Returns the player at a clockwise offset from a starting position.
 *
 * @param player - Starting absolute table position.
 * @param offset - Clockwise offset to apply.
 * @returns Absolute table position at the offset.
 * @sideEffects None.
 */
export function rotatePlayer(player: PositionalPlayer, offset: number): PositionalPlayer {
    return ((player + offset + POSITIONAL_PLAYERS.length) % POSITIONAL_PLAYERS.length) as PositionalPlayer;
}

/**
 * Returns the ordered players who act after a dealer.
 *
 * @param dealer - Dealer for the hand.
 * @returns Four players, starting left of dealer and ending with dealer.
 * @sideEffects None.
 */
export function playersAfterDealer(dealer: PositionalPlayer): readonly PositionalPlayer[] {
    return [1, 2, 3, 4].map((offset) => rotatePlayer(dealer, offset));
}

/**
 * Returns the fixed partner for a player.
 *
 * @param player - Absolute table position.
 * @returns Partner across the table.
 * @sideEffects None.
 */
export function getPartner(player: PositionalPlayer): PositionalPlayer {
    return rotatePlayer(player, 2);
}

/**
 * Returns the fixed team for a player.
 *
 * @param player - Absolute table position.
 * @returns Team containing the player.
 * @sideEffects None.
 */
export function getTeam(player: PositionalPlayer): Team {
    return player === PositionalPlayer.North || player === PositionalPlayer.South
        ? Team.NorthSouth
        : Team.EastWest;
}
