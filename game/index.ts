export type { IGameResult, IRunGameOptions } from "./runner";
export { runGame } from "./runner";
export { createDeck, dealCards, shuffleCards } from "./deck";
export {
    cardsEqual,
    findCardIndex,
    formatCard,
    getEffectiveSuit,
    getLegalCards,
    getTrickWinner,
    removeCard,
    scoreHand
} from "./rules";
