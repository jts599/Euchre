# Repository Instructions

## Project Shape

This repository is currently a small TypeScript model for Euchre game state and player decision contracts. The active source lives under `types/`.

## Domain Conventions

- `PositionalPlayer` is the absolute table position used for internal game representation (`North`, `East`, `South`, `West`).
- `Player` is relative to the player implementation that is choosing cards or trump (`Self`, `LeftOpponent`, `RightOpponent`, `Partner`).
- Keep internal state that depends on table position keyed by `PositionalPlayer`.
- Keep public player-facing requests and decision logic expressed in relative `Player` terms.

## Code Style

- Prefer small, focused TypeScript interfaces and helper functions.
- Keep enum and interface names descriptive and domain-oriented.
- Use exported types from `types/enums.ts` rather than duplicating string or numeric literals.
- Add documentation when behavior or conversions are non-obvious, especially for absolute-to-relative player mapping.

## Verification

There is no package manager or test runner configured yet. When one is added, document the install and test commands here.
