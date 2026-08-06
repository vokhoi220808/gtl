# Verify System v15 Business Integrity

Verify System v15 upgrades the registry to schema v6 while preserving v14 actions and a legacy source copy.

## Core rules

- Lifecycle state machine: `draft`, `active`, `suspended`, `revoked`, `archived`.
- Draft records never return `GENUINE`; revoked records require `restore`.
- Immutable identity fields cannot be changed through metadata updates.
- `expectedRevision` / `expectedUpdatedAt` prevent stale writes.
- `Idempotency-Key` prevents duplicate mutations.
- Visibility supports `public-metadata`, `unlisted`, and `private`.
- Public responses redact email, phone, identifier, address, private notes, and private custom user fields.
- Admin secrets are accepted through `X-Verify-Admin-Secret` or Bearer authorization, not request bodies.
- GitHub, Redis, and local writes use compare-and-set behavior.
- Configured primary storage fails closed by default to prevent split-brain registries.
- Production auto-register is disabled unless explicitly enabled and requires an origin policy.
- RSA/ECDSA/Ed25519 signatures are preserved without truncation; unknown key IDs do not fall back to unrelated keys.

## Migration

Run an authenticated dry run first:

```json
{"action":"migrate","dryRun":true}
```

Then write schema v6:

```json
{"action":"migrate","resign":false}
```

Use `resign:true` only when the configured signing key or secret is authoritative for all migrated records.
