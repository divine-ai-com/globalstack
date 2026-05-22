# Emulator App

This app is the product runtime entrypoint for the GlobalStack Azure emulator.

Use it as the release-facing boundary for the first-party emulator process. Core runtime logic still lives under `packages/`, while this app owns the runnable server surface.
