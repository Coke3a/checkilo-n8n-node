import type {
	GenericValue,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export const CHECKILO_CREDENTIAL_NAME = 'checkiloApi';

// Integrations always talk to the Checkilo production ping host. This is fixed
// (not a credential field) so the only thing a user configures is their API key.
export const CHECKILO_BASE_URL = 'https://ping.checkilo.app';

type LoadContext = IExecuteFunctions | ILoadOptionsFunctions;

type CheckiloAutomation = {
	id: string;
	name: string;
	ping_url: string;
};

type BuildPingUrlInput = {
	targetUrl: string;
	operation: 'eventPing' | 'workflowPing';
	runId: string;
	workflowEvent?: 'checkpoint' | 'failed' | 'started' | 'succeeded';
	checkpointLabel?: string;
};

const WORKFLOW_SEGMENTS: Record<
	NonNullable<BuildPingUrlInput['workflowEvent']>,
	string
> = {
	checkpoint: 'checkpoint',
	failed: 'fail',
	started: 'start',
	succeeded: 'success',
};

export async function checkiloApiRequest<T>(
	this: LoadContext,
	options: {
		method: IHttpRequestMethods;
		path?: string;
		absoluteUrl?: string;
		body?: GenericValue | GenericValue[];
	},
): Promise<T> {
	const requestOptions: IHttpRequestOptions = {
		json: true,
		method: options.method,
		url: options.absoluteUrl ?? options.path ?? '/',
	};

	if (options.path) {
		requestOptions.baseURL = CHECKILO_BASE_URL;
	}

	if (options.body !== undefined) {
		requestOptions.body = options.body;
	}

	return await this.helpers.httpRequestWithAuthentication.call(
		this,
		CHECKILO_CREDENTIAL_NAME,
		requestOptions,
	);
}

export async function listAutomations(this: LoadContext): Promise<CheckiloAutomation[]> {
	const response = await checkiloApiRequest.call(this, {
		method: 'GET',
		path: '/n8n/automations',
	});

	if (!Array.isArray(response)) {
		throw new NodeOperationError(
			this.getNode(),
			'Checkilo returned an unexpected automation list response.',
		);
	}

	return response.map((entry) => {
		if (
			typeof entry !== 'object' ||
			entry === null ||
			typeof entry.id !== 'string' ||
			typeof entry.name !== 'string' ||
			typeof entry.ping_url !== 'string'
		) {
			throw new NodeOperationError(
				this.getNode(),
				'Checkilo returned an automation entry with an unexpected shape.',
			);
		}

		return entry as CheckiloAutomation;
	});
}

export async function loadAutomationOptions(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	const automations = await listAutomations.call(this);

	if (automations.length === 0) {
		throw new NodeOperationError(
			this.getNode(),
			'No Checkilo automations are available for this API key yet.',
		);
	}

	return automations.map((automation) => ({
		name: automation.name,
		value: automation.ping_url,
	}));
}

export async function getAutomationNameLookup(
	this: IExecuteFunctions,
): Promise<Map<string, string>> {
	const automations = await listAutomations.call(this);
	return new Map(automations.map((automation) => [automation.ping_url, automation.name]));
}

export function buildPingUrl(input: BuildPingUrlInput): string {
	const url = new URL(input.targetUrl);

	if (input.operation === 'workflowPing') {
		if (!input.workflowEvent) {
			throw new Error('Workflow event is required for workflow pings.');
		}

		const segment = WORKFLOW_SEGMENTS[input.workflowEvent];

		if (!segment) {
			throw new Error(`Unsupported workflow event: ${input.workflowEvent}`);
		}

		url.pathname = `${url.pathname.replace(/\/+$/, '')}/${segment}`;
	}

	url.searchParams.set('run', input.runId);

	if (input.workflowEvent === 'checkpoint') {
		if (!input.checkpointLabel?.trim()) {
			throw new Error('Checkpoint label is required for checkpoint workflow pings.');
		}

		url.searchParams.set('label', input.checkpointLabel.trim());
	}

	return url.toString();
}

export function resolveRunId(
	executionId: string,
	itemJson: IDataObject,
	operation: BuildPingUrlInput['operation'],
	workflowEvent?: BuildPingUrlInput['workflowEvent'],
): string {
	if (operation === 'workflowPing' && workflowEvent === 'failed') {
		const originalExecutionId = extractOriginalExecutionId(itemJson);
		if (originalExecutionId) {
			return originalExecutionId;
		}
	}

	return executionId;
}

export function normalizeMetadataInput(
	raw: unknown,
): GenericValue | GenericValue[] | undefined {
	if (raw === undefined || raw === null) {
		return undefined;
	}

	if (typeof raw === 'string') {
		const trimmed = raw.trim();

		if (trimmed === '') {
			return undefined;
		}

		const parsed = JSON.parse(trimmed) as GenericValue | GenericValue[];
		return isEmptyPlainObject(parsed) ? undefined : parsed;
	}

	if (isEmptyPlainObject(raw)) {
		return undefined;
	}

	return raw as GenericValue | GenericValue[];
}

export async function sendPing(
	this: IExecuteFunctions,
	input: {
		body?: GenericValue | GenericValue[];
		url: string;
	},
): Promise<IDataObject> {
	const response = (await checkiloApiRequest.call(this, {
		absoluteUrl: input.url,
		body: input.body,
		method: 'POST',
	})) as IDataObject;

	if (typeof response !== 'object' || response === null || Array.isArray(response)) {
		throw new NodeOperationError(
			this.getNode(),
			'Checkilo returned an unexpected ping response.',
		);
	}

	return response;
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

function isEmptyPlainObject(value: unknown): boolean {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}

	return Object.keys(value as object).length === 0;
}
