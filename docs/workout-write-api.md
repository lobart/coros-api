# Workout Write API

## Status

This module wraps an unofficial COROS Training Hub web protocol. It is not a
COROS public API and may change without notice.

The HTTP service listens on `127.0.0.1` and exposes account-scoped routes under:

```text
/api/v1/coros/accounts/{accountId}
```

Every route requires `Authorization: Bearer <COROS_SERVICE_TOKEN>`. The
`accountId` is an application-owned alias, not a COROS user ID.

The checked-in fixture set does not currently enable workout-library CRUD.
`createWorkout`, `updateWorkout`, and `deleteWorkout` remain `false` until this
fork has its own verified, sanitized fixtures for those operations. The one
operator fixture confirms a schedule write, but `scheduleWorkout` also requires
a verified workout-library query fixture and therefore remains `false`.

Use `GET .../capabilities` as the runtime source of truth. Do not infer support
from implemented code or from the presence of a Bruno request.

## Routes

| Method | Route | Purpose | Current fixture gate |
| --- | --- | --- | --- |
| `GET` | `/status` | Return local connection status | Authenticated service caller |
| `GET` | `/capabilities` | Return region-specific verified capabilities | Connected account |
| `GET` | `/workouts` | List workout-library summaries | `createWorkout` |
| `GET` | `/workouts/{workoutId}` | Return a mapped structured workout | `createWorkout` |
| `POST` | `/workouts` | Create a workout | Write flag and `createWorkout` |
| `PUT` | `/workouts/{workoutId}` | Update an externally managed workout | Write flag and `updateWorkout` |
| `DELETE` | `/workouts/{workoutId}` | Delete an externally managed workout | Write flag and `deleteWorkout` |
| `POST` | `/workouts/{workoutId}/schedule` | Schedule an externally managed workout | Write flag and `scheduleWorkout` |

Although list and get are reads, the current implementation gates them on
`createWorkout` because the verified create contract must include
`/training/program/query`.

## Capability Rules

Capabilities are calculated independently for each COROS region from sanitized
fixtures whose `verifiedOutcome` is `true`.

- Create requires successful `run-simple-time` captures for both
  `/training/program/add` and `/training/program/query`.
- Update requires successful `workout-update` `/training/program/add` plus the
  verified library query.
- Delete requires successful `workout-delete`
  `/training/program/delete`.
- Schedule requires successful `workout-schedule`
  `/training/schedule/update` plus the verified library query.
- A successful capture means HTTP 200 and provider result `0000`.

`COROS_WRITE_API_ENABLED=true` is a second, independent write gate. Enabling the
flag cannot override missing fixture capabilities.

## Workout Contract

Create accepts:

```json
{
  "sport": "run",
  "name": "Example aerobic run",
  "description": "Synthetic example",
  "steps": [
    {
      "kind": "work",
      "durationType": "time",
      "durationValue": 1800,
      "target": { "type": "none" }
    }
  ],
  "expectedDurationSeconds": 1800,
  "externalSource": "bruno-example",
  "externalWorkoutId": "example-run-001"
}
```

Supported domain values are:

- Sports: `run`, `indoor_run`, `trail_run`, `bike`, `indoor_bike`,
  `pool_swim`.
- Step kinds: `warmup`, `work`, `recovery`, `cooldown`, `rest`, `repeat`.
- Durations: `time`, `distance`, `open`.
- Targets: `none`, `heart_rate`, `pace`, `effort_pace`, `power`, `cadence`.

This is a validation model, not a statement of verified provider support.
Current provider mapping accepts only time-based non-repeat steps and
time-based children inside repeat groups. Target compatibility is validated by
sport. At most 100 effective steps and two levels of repeat nesting are
accepted.

When `expectedDurationSeconds` is present, it must exactly match the sum of
time-based steps, including repeats. Update uses the same workout fields but
does not accept `externalSource` or `externalWorkoutId`.

Create accepts an optional `Idempotency-Key`. Reusing a key with identical
content returns the mapped workout; reusing it with different content returns a
conflict. The key is reserved before the provider write. If the response is
ambiguous, the reservation remains pending and another create is blocked until
an operator reconciles provider state. Update, delete, and schedule are allowed
only for confirmed workouts recorded in the local mapping store as externally
managed.

Sport, repeat shape, open steps and every target type are checked against
separate fixture-backed capabilities. A confirmed simple running create never
implicitly enables cycling, swimming, repeats, power or cadence targets.

Schedule accepts:

```json
{
  "scheduled_date": "2030-01-15",
  "timezone": "Europe/Moscow"
}
```

`scheduled_date` is ISO `YYYY-MM-DD`; `timezone` must be a valid IANA time-zone
name. Scheduling the same mapped workout for the same date is idempotent.

## Errors

Integration errors use:

```json
{
  "code": "COROS_WRITE_CAPABILITY_UNAVAILABLE",
  "message": "Human-readable detail",
  "retryable": false,
  "requires_user_interaction": false
}
```

Important statuses are `401` for missing/expired athlete sessions, `404` for a
missing workout, `409` for idempotency conflicts, `429` for provider rate
limits, and `501` for disabled or unverified write capabilities. Provider write
timeouts are not automatically retried because the outcome may be ambiguous.
