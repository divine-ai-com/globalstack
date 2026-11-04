# Azure Control Plane

Owns the GlobalStack Azure management-plane surface.

Key responsibilities:

- Azure-shaped ARM routing
- provider-validation shaping from captured Azure behavior
- fail-closed handling for unsupported resource and action routes

Primary entrypoints live under `src/server.mjs` and `src/provider-validation.mjs`.
