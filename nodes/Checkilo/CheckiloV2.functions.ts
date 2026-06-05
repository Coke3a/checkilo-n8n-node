import type { IDataObject } from 'n8n-workflow';

export type EventResult = 'success' | 'fail';
export type WorkflowEvent = 'start' | 'checkpoint' | 'finish';

export type MetadataRow = { key?: string; value?: string };

export type BuildPingUrlV2Input = {
	targetUrl: string;
	operation: 'eventPing' | 'workflowPing';
	eventResult?: EventResult;
	workflowEvent?: WorkflowEvent;
	finishResult?: EventResult;
	checkpointName?: string;
	runId?: string;
};

/**
 * Build the Checkilo ping URL for the v2 node.
 *
 * Every ping carries `run={runId}` (the n8n execution id). On event pings the
 * backend treats it as a one-shot — it stores the id as the run's correlation
 * but never joins other pings to it — so it only serves to trace a ping back to
 * its n8n execution. On workflow pings it correlates start/checkpoint/finish.
 *
 * - Event ping: `{targetUrl}/{success|fail}?run={runId}`.
 * - Workflow ping: `{targetUrl}/{segment}?run={runId}` where the segment is the
 *   event, or the chosen result when the event is `finish`. Checkpoints add `label`.
 */
export function buildPingUrlV2(input: BuildPingUrlV2Input): string {
	const url = new URL(input.targetUrl);
	const basePath = url.pathname.replace(/\/+$/, '');

	const runId = input.runId?.trim();
	if (!runId) {
		throw new Error('A run id is required for pings.');
	}

	if (input.operation === 'eventPing') {
		if (!input.eventResult) {
			throw new Error('A result is required for event pings.');
		}
		url.pathname = `${basePath}/${input.eventResult}`;
		url.searchParams.set('run', runId);
		return url.toString();
	}

	const workflowEvent = input.workflowEvent;
	if (!workflowEvent) {
		throw new Error('A workflow event is required for workflow pings.');
	}

	let segment: string;
	if (workflowEvent === 'finish') {
		if (!input.finishResult) {
			throw new Error('A result is required to finish a workflow.');
		}
		segment = input.finishResult;
	} else {
		segment = workflowEvent;
	}

	url.pathname = `${basePath}/${segment}`;
	url.searchParams.set('run', runId);

	if (workflowEvent === 'checkpoint') {
		const checkpointName = input.checkpointName?.trim();
		if (!checkpointName) {
			throw new Error('A checkpoint name is required for checkpoint pings.');
		}
		url.searchParams.set('label', checkpointName);
	}

	return url.toString();
}

/** Turn the fixedCollection key/value rows into a flat JSON object (or undefined when empty). */
export function buildMetadataObject(rows: MetadataRow[] | undefined): IDataObject | undefined {
	if (!rows || rows.length === 0) {
		return undefined;
	}

	const result: IDataObject = {};
	for (const row of rows) {
		const key = row.key?.trim();
		if (!key) {
			continue;
		}
		result[key] = row.value ?? '';
	}

	return Object.keys(result).length === 0 ? undefined : result;
}

/**
 * Pick the run correlation id. Normally the current execution id, but when a
 * failure is reported from a separate (error-trigger) execution we reuse the
 * ORIGINAL execution id so the `/fail` ping joins the run that `/start` opened.
 */
export function resolveRunIdV2(
	executionId: string,
	itemJson: IDataObject,
	workflowEvent: WorkflowEvent | undefined,
	finishResult: EventResult | undefined,
): string {
	if (workflowEvent === 'finish' && finishResult === 'fail') {
		const original = extractOriginalExecutionId(itemJson);
		if (original) {
			return original;
		}
	}

	return executionId;
}

function extractOriginalExecutionId(itemJson: IDataObject): string | undefined {
	const execution = asDataObject(itemJson.execution);
	if (typeof execution?.id === 'string' && execution.id.trim() !== '') {
		return execution.id;
	}

	const error = asDataObject(itemJson.error);
	const nestedExecution = asDataObject(error?.execution);
	if (typeof nestedExecution?.id === 'string' && nestedExecution.id.trim() !== '') {
		return nestedExecution.id;
	}

	if (typeof itemJson.executionId === 'string' && itemJson.executionId.trim() !== '') {
		return itemJson.executionId;
	}

	return undefined;
}

function asDataObject(value: unknown): IDataObject | undefined {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return undefined;
	}

	return value as IDataObject;
}
