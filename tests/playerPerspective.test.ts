import { describe, expect, it } from "vitest";
import { Player, PositionalPlayer } from "../types/enums";
import { toPositionalPlayer, toRelativePlayer } from "../types/playerPerspective";

const positionalPlayers = [
    PositionalPlayer.North,
    PositionalPlayer.East,
    PositionalPlayer.South,
    PositionalPlayer.West
] as const;

const relativePlayers = [
    Player.Self,
    Player.LeftOpponent,
    Player.Partner,
    Player.RightOpponent
] as const;

/**
 * Unit tests for absolute-to-relative player mapping.
 */
describe("player perspective conversion", () => {
    it("maps each perspective seat to Self", () => {
        for (const perspective of positionalPlayers) {
            expect(toRelativePlayer(perspective, perspective)).toBe(Player.Self);
        }
    });

    it("maps North's clockwise table positions to relative players", () => {
        expect(toRelativePlayer(PositionalPlayer.North, PositionalPlayer.East)).toBe(Player.LeftOpponent);
        expect(toRelativePlayer(PositionalPlayer.North, PositionalPlayer.South)).toBe(Player.Partner);
        expect(toRelativePlayer(PositionalPlayer.North, PositionalPlayer.West)).toBe(Player.RightOpponent);
    });

    it("rotates relative mapping for every perspective", () => {
        expect(toRelativePlayer(PositionalPlayer.East, PositionalPlayer.South)).toBe(Player.LeftOpponent);
        expect(toRelativePlayer(PositionalPlayer.South, PositionalPlayer.West)).toBe(Player.LeftOpponent);
        expect(toRelativePlayer(PositionalPlayer.West, PositionalPlayer.North)).toBe(Player.LeftOpponent);
    });

    it("maps North's relative players back to absolute table positions", () => {
        expect(toPositionalPlayer(PositionalPlayer.North, Player.Self)).toBe(PositionalPlayer.North);
        expect(toPositionalPlayer(PositionalPlayer.North, Player.LeftOpponent)).toBe(PositionalPlayer.East);
        expect(toPositionalPlayer(PositionalPlayer.North, Player.Partner)).toBe(PositionalPlayer.South);
        expect(toPositionalPlayer(PositionalPlayer.North, Player.RightOpponent)).toBe(PositionalPlayer.West);
    });

    it("round trips every positional seat through relative conversion", () => {
        for (const perspective of positionalPlayers) {
            for (const player of positionalPlayers) {
                const relativePlayer = toRelativePlayer(perspective, player);

                expect(toPositionalPlayer(perspective, relativePlayer)).toBe(player);
            }
        }
    });

    it("round trips every relative player through positional conversion", () => {
        for (const perspective of positionalPlayers) {
            for (const player of relativePlayers) {
                const positionalPlayer = toPositionalPlayer(perspective, player);

                expect(toRelativePlayer(perspective, positionalPlayer)).toBe(player);
            }
        }
    });
});
