# @checkilo/n8n-nodes-checkilo

`@checkilo/n8n-nodes-checkilo` is an n8n community node package for sending Checkilo pings from inside n8n workflows.

> [Checkilo](https://checkilo.app) is heartbeat and checkpoint monitoring for business-critical automations — it alerts you when an n8n workflow stops running or silently stops working. Learn more and start free (5 automations, no card) at **[checkilo.app](https://checkilo.app)**.

It provides one node, `Checkilo`, with two operations:

- `Event Ping` — a single heartbeat marked Success or Failure
- `Workflow Ping` — a multi-step run: Start → Checkpoint → Finish (Success/Failure)

The node uses Checkilo API keys and loads available automations from the real Checkilo API. Every ping carries a Checkilo `run` correlation id derived automatically from the n8n execution ID — workflow steps (start → checkpoint → finish) share one value, and event pings include it so a ping can be traced back to its n8n execution.

> **Node versions:** newly added nodes default to **v2** (the UX described here). Existing workflows pinned to **v1** keep their original behavior — see [Node Versions](#node-versions).

## What It Does

Use the `Checkilo` node when you want to:

- send a simple event-style heartbeat ping from a workflow
- track workflow lifecycle steps: start, checkpoint, and finish (success or failure)
- send a failure ping from an n8n Error Trigger workflow using the original failed execution ID when n8n provides it

The node returns the live Checkilo ping response and adds a few non-secret helper fields such as the derived `run_id`, selected `target_url`, selected `target_name` when available, the operation, and the workflow event.

## Installation

Follow the official n8n community node installation guide:

- [Install community nodes](https://docs.n8n.io/integrations/community-nodes/installation/)

For self-hosted n8n, install this package as:

```bash
npm install @checkilo/n8n-nodes-checkilo
```

This package expects a Checkilo backend that exposes:

- `GET /n8n/auth/test`
- `GET /n8n/automations`

Those routes were added in this repository as compatibility aliases over the existing authenticated integration endpoints.

## Credentials

Create a `Checkilo API` credential in n8n with:

- `API Key`

Details:

- Auth header: `Authorization: Bearer <api_key>`
- The Checkilo ping host is fixed to `https://ping.checkilo.app` (not a credential field)

Credential testing uses:

- `GET https://ping.checkilo.app/n8n/auth/test`

## Operations

### Event Ping

`Event Ping` sends one self-contained `POST` to the selected Checkilo ping URL:

- `Result` = `Success` → `/success`, or `Failure` → `/fail`
- optional key/value metadata, sent as a JSON request body
- `run=<execution id>` so the ping can be traced back to its n8n execution (the backend still treats each event ping as its own one-shot run and never joins other pings to it)

Use this for simple heartbeat-style tracking when you only need one ping.

### Workflow Ping

`Workflow Ping` sends a `POST` to the selected Checkilo ping URL based on the chosen `Event`:

- `Start` → `/start`
- `Checkpoint` → `/checkpoint` (with `label=<checkpoint name>`)
- `Finish` + `Result` = `Success` → `/success`, or `Failure` → `/fail`

All workflow pings include `run=<execution id>`, derived automatically from the current n8n execution so every step of one run shares the same value (there is no user-entered Run ID field). For failure pings sent from an Error Trigger workflow, the node reuses the original failed execution ID when n8n provides it. Optional key/value metadata is sent as the JSON request body.

## Example Workflow Patterns

### Simple Event Heartbeat

1. Add `Checkilo`
2. Choose `Event Ping`
3. Pick the Checkilo automation from the dropdown
4. Optionally add JSON metadata

### Workflow Lifecycle Tracking

Use multiple `Checkilo` nodes in the same workflow:

1. `Workflow Ping` with `Start` near the beginning
2. `Workflow Ping` with `Checkpoint` at important milestones
3. `Workflow Ping` with `Finish` → `Success` at the end

Because the node derives the Checkilo `run` value from the n8n execution ID, Checkilo correlates those pings into one workflow run.

### Error Trigger Failure Tracking

Use n8n’s Error Trigger workflow pattern to report failures:

1. Create an Error Trigger workflow
2. Add the `Checkilo` node after the trigger
3. Choose `Workflow Ping`
4. Choose `Finish` → `Failure`
5. Select the same Checkilo automation

When the incoming item includes the original failed `execution.id`, the node uses that original execution ID as the Checkilo `run` value so the failure ping attaches to the same Checkilo workflow run.

## Local Development

From this package directory:

```bash
npm install
npm run dev
npm run lint
npm test
npm run build
```

## n8n References Used

- [Creating nodes](https://docs.n8n.io/integrations/creating-nodes/)
- [Build a node](https://docs.n8n.io/integrations/creating-nodes/build/n8n-node/)
- [Choose node method](https://docs.n8n.io/integrations/creating-nodes/plan/choose-node-method/)
- [Community node installation](https://docs.n8n.io/integrations/community-nodes/installation/)
- [Submit community nodes](https://docs.n8n.io/integrations/creating-nodes/deploy/submit-community-nodes/)

## Node Versions

- **v2 (default):** `Event Ping` has a `Result` (Success/Failure); `Workflow Ping` uses `Start` / `Checkpoint` / `Finish` (Finish adds a `Result`); metadata is a key/value collection; the `run` correlation id is always derived automatically from the n8n execution ID (no user-entered Run ID field).
- **v1:** original behavior — `Workflow Ping` events `Started` / `Checkpoint` / `Succeeded` / `Failed`, a `Checkpoint Label` field, and a JSON `Metadata` field. Existing workflows keep v1 automatically; only newly added nodes use v2.

Both versions call the same Checkilo API, so v1 workflows keep working unchanged.

## Current Status

Implemented:

- Checkilo API credential with secret API key handling
- credential test against `/n8n/auth/test`
- dynamic automation dropdown backed by `/n8n/automations`
- `Event Ping` (Success/Failure) and `Workflow Ping` (Start/Checkpoint/Finish)
- key/value metadata body
- automatic execution ID → Checkilo `run` on every ping (event and workflow); no user-entered Run ID
- Error Trigger-friendly failure ping behavior (reuses the original execution ID)
- full versioning: v1 preserved, v2 default
