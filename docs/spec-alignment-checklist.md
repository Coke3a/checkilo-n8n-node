# n8n Node — Spec Alignment Checklist

> Bring `n8n-nodes-checkilo` in line with the cross-platform connector spec:
> [`../../docs/integrations-ux-spec.md`](../../docs/integrations-ux-spec.md).
> Files to touch: `nodes/Checkilo/Checkilo.node.ts`, `nodes/Checkilo/api.ts`, `package.json`, `CHANGELOG.md`, new tests.
> Current version: `0.1.0`. No test files exist yet. Drafted 2026-06-02.

This file is documentation only (npm `files` = `["dist"]`, so it is never published).

---

## Delta: current -> spec

| Area | Current | Spec wants | Action |
| --- | --- | --- | --- |
| Event ping result | none (success only), sends `?run=` | Success/Failure -> `/success`,`/fail`, NO run | add field + fix URL |
| Workflow event | flat `Started/Checkpoint/Succeeded/Failed` | `Start/Checkpoint/Finish` + Finish->Result | change options + add field |
| Metadata | `type: 'json'` | key/value dictionary | switch to `fixedCollection` |
| Run correlation (failure) | special-cases `failed` to reuse original execution id | keep behavior, move trigger | update condition |
| Labels | "Workflow Event", "Checkpoint Label" | "Event", "Checkpoint name" | rename |

---

## 0. Decide before coding

- [ ] **Breaking change / versioning.** Changing `workflowEvent` values (`started` etc. disappear) and `metadata` type (`json` -> `fixedCollection`) breaks workflows users already saved. The node is public/live. Pick one:
  - **(a) Accept the break** at v0.x (simplest, if adoption is low) -> bump `0.1.0` -> `0.2.0`.
  - **(b) Versioned node** (n8n Checkilo v2, keep v1) -> read `.agents/versioning.md` first.
  - **(c) Compat shim** -> keep old segment values resolvable in `buildPingUrl`, but `metadata` json->fixedCollection still can't auto-migrate.
  - Recommendation: (a) if low adoption, (b) if there are real Cloud users.
- [ ] **Option ordering lint.** `Start/Checkpoint/Finish` is not alphabetical (nodelinter may warn). Either reorder to `Checkpoint/Finish/Start` OR add a targeted `eslint-disable` with reason "lifecycle order".

---

## 1. `nodes/Checkilo/Checkilo.node.ts` — properties

- [ ] (optional polish) operation display names -> `Send an Event Ping` / `Send a Workflow Ping`.
- [ ] KEEP `targetUrl` label as **"Automation Name or ID"** (n8n lint requires the "Name or ID" suffix for loadOptions fields — intentional exception to the spec's "Automation").
- [ ] ADD field `eventResult` (label **"Result"**) — `displayOptions.show: { operation: ['eventPing'] }`, options `Success->success` / `Failure->fail`, default `success`, `noDataExpression: true`.
- [ ] CHANGE `workflowEvent` (label -> **"Event"**): options `Start->start` / `Checkpoint->checkpoint` / `Finish->finish`, default `start`.
- [ ] ADD field `finishResult` (label **"Result"**) — `displayOptions.show: { operation: ['workflowPing'], workflowEvent: ['finish'] }`, options Success/Failure (`success`/`fail`).
- [ ] RENAME `checkpointLabel` displayName -> **"Checkpoint name"** (show stays: workflowPing + checkpoint).
- [ ] CHANGE `metadata` from `type:'json'` to `type:'fixedCollection'`, `typeOptions:{ multipleValues:true }`, one option group `fields` with `key` + `value` (string). Description: "Optional key/value pairs sent as JSON with the ping".
- [ ] (polish) update `subtitle` to show the result on finish.

## 2. `nodes/Checkilo/Checkilo.node.ts` — `execute()`

- [ ] Read params per operation: `eventResult` (eventPing); `workflowEvent` + (`finishResult` when finish) (workflowPing).
- [ ] Build metadata object from the fixedCollection: `getNodeParameter('metadata', i, {})` -> reduce `.fields` into a flat `{ [key]: value }` (drop empty keys). Replaces `normalizeMetadataInput`.
- [ ] Pass the new fields into `buildPingUrl` and `resolveRunId`.
- [ ] Update `returnData.json` to reflect new fields (e.g. emit `result` instead of the old `workflow_event` value).

## 3. `nodes/Checkilo/api.ts`

- [ ] New `BuildPingUrlInput`: `eventResult?: 'success'|'fail'`, `workflowEvent?: 'start'|'checkpoint'|'finish'`, `finishResult?: 'success'|'fail'`.
- [ ] `buildPingUrl` logic:
  - `eventPing` -> segment = `eventResult`; append `/{segment}`; do NOT set `run`.
  - `workflowPing` -> `segment = workflowEvent === 'finish' ? finishResult : workflowEvent`; append `/{segment}`; set `run`; if `checkpoint`, set `label` (require checkpointLabel).
- [ ] `resolveRunId` — move the special-case trigger from `workflowEvent === 'failed'` to `workflowEvent === 'finish' && finishResult === 'fail'`. KEEP the behavior: a failure ping fired from an n8n error-workflow (separate execution) must reuse the ORIGINAL execution id so it correlates with the run that `start` opened.
- [ ] Remove/replace `normalizeMetadataInput` (logic moves to execute). Delete if unused.
- [ ] `WORKFLOW_SEGMENTS` map — adjust/remove (keep old keys only if doing compat option (c)).

## 4. Tests (none exist — add)

- [ ] `buildPingUrl` — 6 cases: event success/fail (no run); workflow start / checkpoint(+label) / finish-success / finish-fail (all with run).
- [ ] metadata builder — rows -> flat object; empty -> `{}`/undefined.
- [ ] `resolveRunId` — finish+fail reuses original execution id; other cases use `executionId`.

## 5. Package / docs

- [ ] Bump `package.json` version per decision 0.
- [ ] Update **`CHANGELOG.md`** (required on version bump per `AGENTS.md`).
- [ ] Update README for the new UX + note: automations must have "Require API key" enabled to appear in the dropdown.
- [ ] Check `Checkilo.node.json` (codex/categories) — likely no change.

## 6. Verify (use the `n8n-node` CLI per `AGENTS.md`)

- [ ] `n8n-node lint` clean (resolve every warning, esp. option ordering + Name-or-ID).
- [ ] `n8n-node build` passes.
- [ ] `n8n-node dev` -> run all 6 cases from spec section 6 live; confirm runs correlate and metadata lands as JSON in the Checkilo dashboard.

---

## Behavior preservation note

The only non-obvious existing behavior to keep is the **failure-ping run correlation** in `resolveRunId`: when a failure is reported from a separate (error-trigger) execution, the node digs the original `execution.id` out of the incoming item so the `/fail` ping joins the same Checkilo run that the main workflow's `/start` opened. Do not drop this during the refactor — only re-point its trigger condition.
