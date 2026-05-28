# Cloud Storage Module

This module owns every Cloud Storage concern:

- `service.mjs`: local GlobalStack route and lifecycle surface
- `routes.mjs`: Google Cloud Storage JSON API route handlers
- `store.mjs`: filesystem-backed bucket/object metadata and content state
- `errors.mjs`: Cloud Storage specific Google error shapes
- `google-api.mjs`: real-GCP API wrapper used by capture and differential tests
- future `engine.mjs`: real object-store runtime adapter

Generic HTTP/auth/capture utilities stay outside this directory. Service-specific
behavior stays here so Storage can evolve independently from Pub/Sub,
Firestore, KMS, and the rest of the GCP service catalog.
