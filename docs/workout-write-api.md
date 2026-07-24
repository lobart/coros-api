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

The checked-in EU fixtures enable the verified subset:

- create/list/get for simple time-based running workouts;
- simple indoor/road cycling workouts with power targets;
- running repeat blocks with heart-rate targets;
- deletion of externally managed library workouts;
- scheduling of externally managed workouts.

In-place update, unschedule, training plans, nested repeats, open steps, pace targets,
cadence targets and swimming remain unavailable. A live update attempt created
a second provider entity instead of updating the original, so update stays
fail-closed. The wrapper exposes an explicit replacement operation for
unscheduled externally managed workouts; it returns a new COROS workout ID.

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
| `PUT` | `/workouts/{workoutId}` | Reserved in-place update; currently fail-closed | `updateWorkout` |
| `POST` | `/workouts/{workoutId}/replacements` | Replace an unscheduled managed workout and return a new ID | Write flag and `replaceWorkout` |
| `POST` | `/workouts/{workoutId}/copy` | Copy an exact local workout snapshot | `copyWorkout` |
| `POST` | `/workouts/paste` | Create and optionally schedule from a clipboard | Write flag and `copyWorkout` |
| `POST` | `/weeks/copy` | Copy managed scheduled workouts from a week | `copyWeek` |
| `POST` | `/weeks/paste` | Paste a week with per-session idempotency | Write flag and `copyWeek` |
| `POST` | `/workouts/estimate` | Calculate duration, distance and planned load | `estimateWorkout` |
| `GET` | `/workouts/{workoutId}/load` | Recalculate planned load | `trainingLoad` |
| `DELETE` | `/workouts/{workoutId}` | Delete an externally managed workout | Write flag and `deleteWorkout` |
| `POST` | `/workouts/{workoutId}/schedule` | Schedule an externally managed workout | Write flag and `scheduleWorkout` |

List and get are gated on the verified library query contract.

## Capability Rules

Capabilities are calculated independently for each COROS region from sanitized
fixtures whose `verifiedOutcome` is `true`.

- Create requires successful `run-simple-time` captures for
  `/training/program/calculate`, `/training/program/add` and
  `/training/program/query`.
- In-place update requires successful `workout-update` `/training/program/add` plus the
  verified library query.
- Replacement is composed only from verified create/query/delete operations.
- Copy uses the canonical snapshot persisted before provider create.
- Week copy/paste is composed from verified create and schedule operations.
- Estimate/load use verified personal-account `/training/program/calculate`.
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
accepted. Distance-based provider mapping remains disabled until a sanitized
distance fixture confirms its units and enums.

When `expectedDurationSeconds` is present, it must exactly match the sum of
time-based steps, including repeats. Replacement uses the same workout fields
but does not accept `externalSource` or `externalWorkoutId`.

Create accepts an optional `Idempotency-Key`. Reusing a key with identical
content returns the mapped workout; reusing it with different content returns a
conflict. The key is reserved before the provider write. If the response is
ambiguous, the reservation remains pending and another create is blocked until
an operator reconciles provider state. Update, delete, and schedule are allowed
only for confirmed workouts recorded in the local mapping store as externally
managed. Exact canonical snapshots are stored with new mappings so repeat
groups and targets survive copy/paste without lossy provider readback.

Replacement is deliberately separate from `PUT`. Use
`POST /workouts/{workoutId}/replacements`; it creates a new provider object,
deletes the old unscheduled managed workout, preserves external identity and
returns `replacesWorkoutId`. Scheduled workouts are rejected until unschedule
has reviewed fixture evidence and rollback semantics.

Copy and paste are separate operations. Copy returns a versioned clipboard;
paste consumes it and accepts an `Idempotency-Key`. Week copy stores offsets
`0..6` from an ISO Monday. Week paste uses a deterministic child key for every
session and returns `completed` or `partial`. `conflict_policy` is `append` or
`skip_occupied_dates`.

Estimate output normalizes COROS centimetres to metres and includes duration,
distance, planned training load, sets, pitch/elevation and daily load fields
when returned. Missing provider fields remain `null`.

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
