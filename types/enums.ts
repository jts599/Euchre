/**
 * Relative player labels used by player implementations.
 */
export enum Player {
    Self = 'Self',
    LeftOpponent = 'LeftOpponent',
    RightOpponent = 'RightOpponent',
    Partner = 'Partner'
}

/**
 * Absolute table positions used by the game engine.
 */
export enum PositionalPlayer {
    North = 0,
    East = 1,
    South = 2,
    West = 3
}

/**
 * Card suits in a standard Euchre deck.
 */
export enum Suit {
    Hearts = 'Hearts',
    Diamonds = 'Diamonds',
    Clubs = 'Clubs',
    Spades = 'Spades'
}

/**
 * Card ranks in a standard Euchre deck.
 */
export enum Rank {
    Nine = '9',
    Ten = '10',
    Jack = 'J',
    Queen = 'Q',
    King = 'K',
    Ace = 'A'
}
