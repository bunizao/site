---
title: Debug logs
description: Local-only investigation notes and how they should turn into permanent docs.
internal: true
---

The `docs/debug/` directory is reserved for local-only debug artifacts related to production investigations. It's not source-of-truth documentation — it's a scratchpad.

## Rules

- Keep ad-hoc debug logs, incident notes, and temporary investigation files there.
- **Don't commit those artifacts.** A `.gitignore` entry guards the directory.
- If a debugging result needs to become permanent documentation, summarize it into a tracked document under `docs/` and let the temporary artifact go.

## Why this is internal

The debug folder mostly contains paths, request payloads, and timing notes from real incidents. Useful while triaging, not useful (and sometimes leaky) for the public docs site. This page exists so the IA stays consistent — there's a "Debug logs" entry in the sidebar and a body that explains what's there and why it doesn't render publicly.

## Workflow

1. Open a scratch file under `docs/debug/` for the investigation.
2. Capture payloads, timing, hypotheses, and dead ends as you go.
3. When the issue is resolved, identify what's worth keeping — usually a tracked finding under a relevant doc (e.g. `pipeline/telegram` for ingest issues, `quality/e2e-scope` for test gaps).
4. Delete the scratch file once the finding has a permanent home.
