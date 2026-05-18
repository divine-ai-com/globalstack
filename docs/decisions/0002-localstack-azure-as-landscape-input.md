# ADR 0002: LocalStack For Azure As Landscape Input

## Status

Accepted

## Context

LocalStack for Azure publishes a broad service index and coverage data. The user asked to use the existing exported LocalStack key where applicable, but also asked whether free official emulators exist and whether GlobalStack can fill missing Azure gaps itself.

## Decision

This repo treats LocalStack for Azure coverage as landscape input, not as the source of truth for GlobalStack behavior.

GlobalStack behavior must be backed by one of:

- an official Microsoft emulator test,
- a GlobalStack local facade with explicit support boundaries,
- a real Azure capture fixture replayed through conformance tests.

## Consequences

LocalStack for Azure can be tested as an optional backend, but its public coverage data does not automatically become a GlobalStack support claim. Generated docs must distinguish LocalStack landscape coverage from GlobalStack local behavior.
