# Protocol Recorder

## Purpose

The recorder captures and sanitizes the unofficial COROS Training Hub web
protocol so capabilities can be based on observed behavior rather than
assumptions. It uses a headed browser and requires an operator to perform one
bounded scenario manually.

The recorder is research tooling. A capture is not automatically a verified
fixture and does not by itself enable a public capability.

## Running A Scenario

Enable the recorder for the process, then run:

```bash
COROS_PROTOCOL_RECORDER_ENABLED=true \
pnpm start -- record-workout-protocol \
  --account-id example-operator \
  --region eu \
  --scenario run-simple-time \
  --confirm-write-research
```

Both `COROS_PROTOCOL_RECORDER_ENABLED=true` and
`--confirm-write-research` are required. The browser is headed. Sign in and
complete the named scenario in COROS, then close the COROS tab. The recorder
waits up to 30 minutes for that close event.

Use a non-identifying local alias for `--account-id`. Its SHA-256 hash is stored
in the generated fixture; the alias itself is not.

## Operator Boundaries

For each run:

1. Create only a disposable test entity whose generated name starts with
   `COROS_API_RESEARCH_`.
2. Perform only the create/read/update/delete actions required by the selected
   scenario.
3. Do not open real activities, GPS data, or health sections.
4. Close the COROS tab when the scenario is complete.

The network guard records only XHR/fetch requests on `coros.com` hosts whose
path begins with `/training/`. It blocks deletion of workout IDs not observed
as created during the same recorder run. It also blocks schedule deletion for
schedule IDs not created during that run.

The guard does not prove that every provider-side action is reversible. Use a
dedicated research account and disposable entities.

## Scenarios

Accepted scenarios are:

```text
run-simple-time
run-warmup-work-cooldown
run-repeat-time-heart-rate
run-repeat-distance-pace
run-open-warmup
run-nested-repeat
bike-time-power
bike-repeat-power
bike-cadence
swim-distance-pace
workout-update
workout-clone
workout-delete
workout-schedule
training-plan-create
training-plan-update
```

Choose exactly the scenario performed. Capability inference matches both the
scenario name and observed endpoint.

## Output

Generated files are written under
`fixtures/protocol/{region}/{scenario}.{fixtureId}.json` with mode `0600`.
Captures include sanitized URL, request/response shapes, status, timestamps,
and schema hashes. Headers are reduced to content type; credentials and
identity values are removed.

Review every generated file manually before treating it as shareable or adding
`verifiedOutcome: true`.
