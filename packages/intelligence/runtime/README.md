# dsh-intelligence

The optional intelligence layer for NexLM Harness.

This package separates **planning** from **execution**:

- Harness always has a built-in intelligence provider, so it remains fully usable by itself.
- NexLM Intent is an optional local provider that can take over planning when its daemon is available.
- The public Harness package does not depend on the private NexLM-Intent repository.

## Modes

`auto` is the default. It prefers NexLM Intent when `http://127.0.0.1:8420/v1/hardware` is available and falls back to built-in planning if it is not.

`off` disables Intent discovery and uses only the built-in provider.

`required` requires Intent and fails rather than silently falling back.

Set `NEXLM_INTENT_URL` to use a different local Intent daemon.

## Protocol

The first turnkey boundary is:

```text
POST <intent-url>/v1/resolve
```

The request uses `IntelligenceRequest`; the response must be an `ExecutionPlan` with `schemaVersion: 1` and `provider: "nexlm-intent"`.

Harness intentionally consumes only this contract. Intent's internal implementation remains outside the public repository.

## Direction

```text
User request
    ↓
Intelligence provider
    ↓
ExecutionPlan
    ↓
Harness AgentLoop / LLM / tools / subagents
```

The same seam can later support other local or remote intelligence providers without changing the Harness execution engine.
