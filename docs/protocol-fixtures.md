# Protocol Fixtures

## Trust Model

Protocol fixtures are sanitized evidence for the unofficial COROS Training Hub
web protocol. Public capabilities are deny-by-default and are derived only from
fixtures for the active region that:

- parse successfully;
- set `verifiedOutcome` to `true`;
- use the exact expected scenario;
- contain the required method and endpoint;
- record HTTP status 200 and provider result `0000`.

Implementation code, upstream behavior, an unreviewed recorder output, or a
successful operator action without a checked fixture is not capability
evidence.

## Recorder Shape

Recorder output includes:

```json
{
  "fixtureId": "synthetic-fixture-id",
  "protocolVersion": "training-hub-web-v1",
  "observedAt": "2030-01-15T10:00:00.000Z",
  "region": "eu",
  "accountAliasHash": "sha256-of-local-alias",
  "scenario": "run-simple-time",
  "schemaFingerprint": "synthetic-schema-hash",
  "captures": []
}
```

Each capture records sequence, method, sanitized URL, content-type-only
headers, sanitized request and response bodies, response status, schema hashes,
and capture time.

Arbitrary string values, including workout names and descriptions, are replaced
with schema placeholders. Capability inference additionally requires the
fixture region and every captured hostname to match the configured COROS region.

Before verification, an operator must confirm the intended provider outcome and
add the minimal review metadata required by the capability parser:

```json
{
  "verifiedOutcome": true,
  "captures": [
    {
      "method": "POST",
      "url": "https://teameuapi.coros.com/training/program/add",
      "responseStatus": 200,
      "responseResult": "0000"
    }
  ]
}
```

Keep richer sanitized captures when they are safe; do not replace observed data
with guessed payloads.

## Current Evidence

The repository contains the original EU operator schedule fixture:

```text
fixtures/protocol/eu/workout-schedule.operator-20260720.json
```

It verifies successful calls to:

- `/training/program/estimate`
- `/training/program/calculate`
- `/training/schedule/update`

Additional live fixtures recorded on 2026-07-24 confirm:

- calculate/add/query/delete for a disposable simple running workout;
- an indoor-bike power range surviving a library round-trip;
- a running repeat group and heart-rate range surviving a round-trip.

The REST adapter was then exercised against the same account: create, get,
idempotent create, delete, bike power, running repeat/HR and schedule all
completed successfully. The scheduled research entry was removed with the
confirmed `status=3` protocol and the library entry was deleted.

Update is deliberately not verified: a live `program/add` request carrying an
existing workout ID did not preserve that ID and produced a duplicate. Both
research entities were removed.

## Required Fixture Set

To enable the current library operations for a region:

| Capability | Required verified fixture evidence |
| --- | --- |
| Create and library query | `run-simple-time`: POST `/training/program/calculate`, POST `/training/program/add` and POST `/training/program/query` |
| Update | `workout-update`: POST `/training/program/add`, plus the verified library query above |
| Delete | `workout-delete`: POST `/training/program/delete` |
| Schedule | `workout-schedule`: POST `/training/schedule/update`, plus the verified library query above |

Provider protocol changes require new captures and review. Preserve older
fixtures for traceability; do not silently rewrite them to match new code.

## Research Sources

The implementation was compared with
[`rowlando/coros-workout-mcp`](https://github.com/rowlando/coros-workout-mcp)
and [`cygnusb/coros-mcp`](https://github.com/cygnusb/coros-mcp). Both
repositories were MIT-licensed when reviewed on 2026-07-24. Their models and
endpoint names are research hints only: no capability is enabled from source
code alone, and no recorded credentials or payloads were imported.

## Sanitization Review

Reject a fixture if it contains credentials, authorization or cookie values,
email addresses, account names, provider user/team/device IDs, health data, GPS
data, or opaque long token-like strings. URLs must redact identity and secret
query parameters. The checked-in fixture must be useful as schema evidence
without identifying an athlete or operator.
