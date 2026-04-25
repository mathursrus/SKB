# Technical Spike Findings - Issue #83

## Hypothesis

One MongoDB document per inbound IVR call, keyed by Twilio `CallSid`, is sufficient to:

- stitch together the multi-endpoint `src/routes/voice.ts` flow
- capture branch choice and join-progress events
- auto-finalize abandoned calls after a timeout
- support both funnel aggregates and privacy-minimized recent-call rows

without introducing a second analytics datastore or a production event-stream platform.

## Spike Artifact

- `spike/83-caller-statistics-session-spike.ts`

## What Was Tested

- Upsert one caller-session document on incoming call
- Append stage events as the same `CallSid` moves through menu, name, size, phone, and join steps
- Mark explicit terminal outcomes for join success, menu-only resolution, and front-desk transfer
- Auto-finalize incomplete sessions after a timeout into stage-specific drop-off outcomes
- Derive a caller funnel aggregate directly from the stored session documents

## Validation Method

- Direct spike execution via `tsx spike/83-caller-statistics-session-spike.ts`
- Validation target: local MongoDB only
- No full test suite run, per FRAIM spike-first rule

## Actual Validation Result

- Command run: `npx --yes tsx spike/83-caller-statistics-session-spike.ts`
- Result: Pass
- Output summary:
  - validated database: `skb_spike_83_caller_stats.voice_call_sessions_spike`
  - auto-finalized sessions: `3`
  - aggregate funnel:
    - `inboundCalls: 6`
    - `joinIntent: 4`
    - `joinedWaitlist: 1`
    - `droppedDuringName: 1`
    - `droppedDuringSize: 1`
    - `droppedDuringPhoneConfirmation: 1`
    - `frontDeskTransfer: 1`
    - `menuOnly: 1`

## Findings

- A single Mongo document per `CallSid` is sufficient to capture the full session and derive the spec's funnel buckets.
- Timeout-based auto-finalization cleanly maps incomplete sessions to stage-specific drop-off outcomes when the call disappears mid-flow.
- One summary document shape can support both aggregate counts and recent-call rows without a second datastore.
- The spike exposed an implementation constraint that should shape the production design:
  - a Mongo upsert cannot write the same field through both `$setOnInsert` and `$set` or `$push` in the same update
  - production session-write helpers should avoid naive "touch everything in one update" shapes
  - append/update helpers should be deliberately scoped per event

## Expected Success Criteria

- The spike should store six simulated calls as six session documents
- Three incomplete sessions should auto-finalize into:
  - `dropped_during_name`
  - `dropped_during_size`
  - `dropped_during_phone_confirmation`
- The aggregate funnel should match the simulated scenarios exactly

## Design Impact

- The RFC should recommend a dedicated `voiceCallSessions` persistence service rather than ad hoc writes embedded in every route handler.
- The service should expose narrow event-level methods such as:
  - `recordIncoming`
  - `recordMenuChoice`
  - `recordJoinIntent`
  - `recordNameCaptured`
  - `recordSizeCaptured`
  - `recordPhoneSource`
  - `recordJoined`
  - `recordTransfer`
  - `recordResolvedInfo`
  - `finalizeExpiredSessions`
- The Admin analytics endpoint can safely read from one caller-session collection and aggregate in process or through a Mongo pipeline.
- The production design should keep analytics writes best-effort and non-blocking so IVR behavior is unaffected by analytics persistence failure.
