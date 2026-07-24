# Security

## Boundary

This project integrates with an unofficial COROS Training Hub web protocol.
Treat provider endpoints, payloads, and session semantics as unstable and
untrusted. The local wrapper is intended for a trusted service on the same host;
it binds to `127.0.0.1`, not a public interface.

## Authentication And Secrets

- Every wrapper route uses a bearer `COROS_SERVICE_TOKEN`.
- Compare service tokens through the existing timing-safe guard.
- Never place a real service token in Bruno files, fixtures, logs, or source
  control.
- Athletes authenticate in a local headed COROS browser. The application never
  asks for or stores their email, password, CAPTCHA, or 2FA response.
- Remote browser authentication is unavailable until an
  `InteractiveAuthProvider` is implemented and reviewed.
- COROS access tokens and provider user IDs are stored only in the encrypted
  session vault.

Use a unique 32-byte `COROS_SESSION_ENCRYPTION_KEY` per environment. Restrict
access to the vault, mapping file, and audit file. Rotate the service token and
encryption key through the deployment secret manager, not through repository
files.

## Write Controls

Writes require all applicable controls:

1. A valid service bearer token.
2. A connected athlete session.
3. `COROS_WRITE_API_ENABLED=true`.
4. A verified region-specific protocol capability.
5. For update, delete, and schedule, a local mapping proving that this
   application created the workout.

The current EU fixtures enable only the explicitly verified workout shapes.
Update and all other unverified dimensions remain unavailable even when the
write flag is enabled.

Writes are serialized per account. Ambiguous failed writes are not retried.
Create supports idempotency keys and rejects key reuse with changed content.
Rate limits are enforced per account.

## Recorder Controls

Protocol recording is disabled by default and requires both an environment flag
and an explicit command confirmation. Use a dedicated research account and
disposable test entities.

The recorder:

- captures only `/training/` XHR/fetch traffic on `coros.com`;
- keeps only the content-type request header;
- redacts secret and identity fields recursively;
- redacts sensitive URL query parameters;
- rejects bodies that still appear to contain email or token-like values;
- blocks deletion of entities not created during the same run;
- writes fixtures with mode `0600`.

These controls reduce exposure but do not replace manual review. Never commit a
new fixture before checking every URL, body, header, and free-text field.

## Data Minimization

Use opaque application aliases for `accountId`. Do not use emails or COROS IDs.
Audit records hash account aliases and contain operation metadata, timestamps,
request fingerprints, result, and safe identifiers; they must not contain
tokens or raw provider payloads.

Do not record or fixture real activities, GPS tracks, health data, athlete
names, team names, device IDs, or free text copied from a real account.

## Incident Response

If a credential or identity value is exposed:

1. Stop the affected service and disable write/recorder flags.
2. Revoke the COROS session by signing out through COROS and delete the local
   session.
3. Rotate the service token and, if the vault may be exposed, the encryption
   key after invalidating stored sessions.
4. Remove the sensitive artifact from the working tree and repository history
   according to the host project's incident process.
5. Review audit records and provider state for ambiguous or unauthorized
   writes.
