import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	buildPingUrl,
	getAutomationNameLookup,
	loadAutomationOptions,
	normalizeMetadataInput,
	resolveRunId,
	sendPing,
} from './api';

export class CheckiloV1 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Checkilo',
		name: 'checkilo',
		icon: { light: 'file:checkilo.svg', dark: 'file:checkilo.dark.svg' },
		group: ['output'],
		description: 'Send event and workflow pings to Checkilo',
		version: 1,
		subtitle:
			'={{$parameter["operation"] === "workflowPing" ? $parameter["workflowEvent"] : $parameter["operation"]}}',
		defaults: {
			name: 'Checkilo',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'checkiloApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Event Ping',
						value: 'eventPing',
					},
					{
						name: 'Workflow Ping',
						value: 'workflowPing',
					},
				],
				default: 'eventPing',
			},
			{
				displayName: 'Automation Name or ID',
				name: 'targetUrl',
				type: 'options',
				required: true,
				typeOptions: {
					loadOptionsMethod: 'getAutomations',
				},
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Workflow Event',
				name: 'workflowEvent',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['workflowPing'],
					},
				},
				options: [
					{
						name: 'Checkpoint',
						value: 'checkpoint',
					},
					{
						name: 'Failed',
						value: 'failed',
					},
					{
						name: 'Started',
						value: 'started',
					},
					{
						name: 'Succeeded',
						value: 'succeeded',
					},
				],
				default: 'started',
			},
			{
				displayName: 'Checkpoint Label',
				name: 'checkpointLabel',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['workflowPing'],
						workflowEvent: ['checkpoint'],
					},
				},
				default: '',
				description: 'Label to attach to this workflow checkpoint',
			},
			{
				displayName: 'Metadata',
				name: 'metadata',
				type: 'json',
				default: '{}',
				description: 'Optional JSON payload to include with the ping',
			},
		],
	};

	methods = {
		loadOptions: {
			async getAutomations(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				return await loadAutomationOptions.call(this);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const executionId = this.getExecutionId();
		let automationNameLookup: Map<string, string> | undefined;

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as 'eventPing' | 'workflowPing';
				const targetUrl = this.getNodeParameter('targetUrl', i) as string;
				const workflowEvent =
					operation === 'workflowPing'
						? (this.getNodeParameter('workflowEvent', i) as
								| 'checkpoint'
								| 'failed'
								| 'started'
								| 'succeeded')
						: undefined;
				const checkpointLabel =
					operation === 'workflowPing' && workflowEvent === 'checkpoint'
						? (this.getNodeParameter('checkpointLabel', i) as string)
						: undefined;
				const metadata = normalizeMetadataInput(this.getNodeParameter('metadata', i, '{}'));
				const itemJson = items[i].json as IDataObject;
				const runId = resolveRunId(executionId, itemJson, operation, workflowEvent);
				const url = buildPingUrl({
					checkpointLabel,
					operation,
					runId,
					targetUrl,
					workflowEvent,
				});
				const response = await sendPing.call(this, { body: metadata, url });

				if (automationNameLookup === undefined) {
					try {
						automationNameLookup = await getAutomationNameLookup.call(this);
					} catch {
						automationNameLookup = new Map<string, string>();
					}
				}

				returnData.push({
					json: {
						...response,
						checkpoint_label: checkpointLabel,
						operation,
						run_id: runId,
						target_name: automationNameLookup.get(targetUrl),
						target_url: targetUrl,
						workflow_event: workflowEvent,
					},
					pairedItem: {
						item: i,
					},
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: i },
					});
					continue;
				}

				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error.message, { itemIndex: i });
				}

				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
