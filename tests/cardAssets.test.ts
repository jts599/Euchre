import { describe, expect, it } from "vitest";
import { ICard } from "../types/cards";
import { Rank, Suit } from "../types/enums";
import { CARD_BACK_ASSET_URL, getCardAssetFileName, getCardAssetUrl } from "../ui/cardAssets";

const RANK_CASES: ReadonlyArray<{ rank: Rank; code: string }> = [
    { rank: Rank.Nine, code: "9" },
    { rank: Rank.Ten, code: "T" },
    { rank: Rank.Jack, code: "J" },
    { rank: Rank.Queen, code: "Q" },
    { rank: Rank.King, code: "K" },
    { rank: Rank.Ace, code: "A" }
];

const SUIT_CASES: ReadonlyArray<{ suit: Suit; code: string }> = [
    { suit: Suit.Hearts, code: "H" },
    { suit: Suit.Diamonds, code: "D" },
    { suit: Suit.Clubs, code: "C" },
    { suit: Suit.Spades, code: "S" }
];

/**
 * Tests for UI card asset mapping.
 */
describe("card assets", () => {
    it("maps every Euchre rank and suit to the SVG file naming convention", () => {
        for (const rankCase of RANK_CASES) {
            for (const suitCase of SUIT_CASES) {
                const card: ICard = { rank: rankCase.rank, suit: suitCase.suit };

                expect(getCardAssetFileName(card)).toBe(`${rankCase.code}${suitCase.code}.svg`);
            }
        }
    });

    it("returns URL values for visible cards and the shared card back", () => {
        expect(getCardAssetUrl({ rank: Rank.Ten, suit: Suit.Hearts })).toContain("TH.svg");
        expect(CARD_BACK_ASSET_URL).toContain("2B.svg");
    });
});
