# Workout Copy, Replacement And Estimation

## Scope

The COROS Training Hub protocol has no verified in-place update or generic
clone endpoint in this fork. Higher-level operations are composed from verified
primitives while unsupported provider behavior stays fail-closed.

## Copy And Paste

`POST /workouts/{workoutId}/copy` reads the canonical snapshot saved when the
wrapper created the workout. It never reconstructs a copy from flattened COROS
library exercises. Old mappings without a snapshot and COROS-owned workouts
cannot be copied safely.

Pass the returned clipboard to `POST /workouts/paste`. Paste creates a new
provider object with a new external identity and may schedule it when both
`scheduled_date` and `timezone` are present. Callers should supply an
`Idempotency-Key`.

## Week Copy And Paste

`POST /weeks/copy` accepts an ISO Monday and an IANA timezone. Only externally
managed workouts with exact snapshots and scheduled dates are included. The
clipboard stores relative day offsets, not UTC timestamps.

`POST /weeks/paste` accepts the clipboard, a target Monday, timezone and either
`append` or `skip_occupied_dates`. Every session has a deterministic
idempotency key, so retrying a partial batch does not duplicate completed
children.

## Replacement

`PUT /workouts/{workoutId}` remains unavailable because the observed COROS
request created a duplicate instead of updating the same provider ID.

`POST /workouts/{workoutId}/replacements`:

1. validates and creates a new COROS workout;
2. verifies its provider ID;
3. deletes the old unscheduled externally managed workout;
4. moves the local external identity to the new ID;
5. returns the new workout with `replacesWorkoutId`.

Scheduled workouts are rejected until unschedule has reviewed fixture evidence
and safe rollback semantics.

## Duration, Distance And Load

`POST /workouts/estimate` uses the verified personal-account
`/training/program/calculate` operation. `GET /workouts/{workoutId}/load`
recalculates the same fields for a library workout.

Normalized units:

- duration: seconds;
- distance: COROS centimetres converted to metres;
- elevation: metres;
- load: provider numeric values without physiological reinterpretation.

These are planned COROS estimates, not completed-activity load and not medical
guidance. Distance-defined steps remain disabled until their protocol mapping
is captured and reviewed. Time-defined workouts can return estimated distance,
duration and planned load now.

## Safety

- Operations remain account-scoped and service-authenticated.
- Copy/paste never exposes session state or raw provider payloads.
- Missing values are `null`.
- In-place update remains disabled.
- Week paste reports child failures explicitly.
- Writes still require `COROS_WRITE_API_ENABLED=true`.
