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

import { getAutomationNameLookup, loadAutomationOptions, sendPing } from './api';
import type { EventResult, MetadataRow, WorkflowEvent } from './CheckiloV2.functions';
import { buildMetadataObject, buildPingUrlV2, resolveRunIdV2 } from './CheckiloV2.functions';

export class CheckiloV2 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Checkilo',
		name: 'checkilo',
		icon: { light: 'file:checkilo.svg', dark: 'file:checkilo.dark.svg' },
		group: ['output'],
		description: 'Send event and workflow pings to Checkilo',
		version: 2,
		subtitle:
			'={{ $parameter["operation"] === "eventPing" ? $parameter["eventResult"] : ($parameter["workflowEvent"] === "finish" ? "finish " + $parameter["finishResult"] : $parameter["workflowEvent"]) }}',
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
						description: 'Send a single heartbeat marked as success or failure',
						action: 'Send an event ping',
					},
					{
						name: 'Workflow Ping',
						value: 'workflowPing',
						description: 'Report a step of a multi-step run (start, checkpoint, finish)',
						action: 'Send a workflow ping',
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
				displayName: 'Result',
				name: 'eventResult',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['eventPing'],
					},
				},
				options: [
					{
						name: 'Failure',
						value: 'fail',
					},
					{
						name: 'Success',
						value: 'success',
					},
				],
				default: 'success',
				description: 'Whether this heartbeat reports a success or a failure',
			},
			{
				displayName: 'Event',
				name: 'workflowEvent',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['workflowPing'],
					},
				},
				// eslint-disable-next-line @n8n/community-nodes/options-sorted-alphabetically -- ordered by workflow lifecycle (start -> checkpoint -> finish)
				options: [
					{
						name: 'Start',
						value: 'start',
						description: 'Begin a run',
					},
					{
						name: 'Checkpoint',
						value: 'checkpoint',
						description: 'Record an intermediate step',
					},
					{
						name: 'Finish',
						value: 'finish',
						description: 'Complete the run as success or failure',
					},
				],
				default: 'start',
			},
			{
				displayName: 'Checkpoint Name',
				name: 'checkpointName',
				type: 'string',
				required: true,
				displayOptions: {
					show: {
						operation: ['workflowPing'],
						workflowEvent: ['checkpoint'],
					},
				},
				default: '',
				placeholder: 'save_crm',
				description: 'Label for this checkpoint, stored on the ping',
			},
			{
				displayName: 'Result',
				name: 'finishResult',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['workflowPing'],
						workflowEvent: ['finish'],
					},
				},
				options: [
					{
						name: 'Failure',
						value: 'fail',
					},
					{
						name: 'Success',
						value: 'success',
					},
				],
				default: 'success',
				description: 'Whether the run finished successfully or failed',
			},
			{
				displayName: 'Metadata',
				name: 'metadata',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				placeholder: 'Add Field',
				default: {},
				description: 'Optional key/value pairs sent as a JSON body with the ping',
				options: [
					{
						name: 'fields',
						displayName: 'Field',
						values: [
							{
								displayName: 'Key',
								name: 'key',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
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

				const eventResult =
					operation === 'eventPing'
						? (this.getNodeParameter('eventResult', i) as EventResult)
						: undefined;
				const workflowEvent =
					operation === 'workflowPing'
						? (this.getNodeParameter('workflowEvent', i) as WorkflowEvent)
						: undefined;
				const finishResult =
					operation === 'workflowPing' && workflowEvent === 'finish'
						? (this.getNodeParameter('finishResult', i) as EventResult)
						: undefined;
				const checkpointName =
					operation === 'workflowPing' && workflowEvent === 'checkpoint'
						? (this.getNodeParameter('checkpointName', i) as string)
						: undefined;

				const metadataParam = this.getNodeParameter('metadata', i, {}) as {
					fields?: MetadataRow[];
				};
				const metadata = buildMetadataObject(metadataParam.fields);

				const itemJson = items[i].json as IDataObject;
				// Run ID is never user-entered: every ping derives it from the current n8n
				// execution. Workflow steps (start -> checkpoint -> finish) thus share one
				// value automatically; event pings carry it only so a ping can be traced
				// back to its n8n execution (the backend never joins event pings by it).
				const runId = resolveRunIdV2(executionId, itemJson, workflowEvent, finishResult);

				const url = buildPingUrlV2({
					targetUrl,
					operation,
					eventResult,
					workflowEvent,
					finishResult,
					checkpointName,
					runId,
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
						operation,
						event_result: eventResult,
						workflow_event: workflowEvent,
						finish_result: finishResult,
						checkpoint_name: checkpointName,
						run_id: runId,
						target_name: automationNameLookup.get(targetUrl),
						target_url: targetUrl,
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
