import { describe, expect, it } from 'vitest';

import { buildMetadataObject, buildPingUrlV2, resolveRunIdV2 } from './CheckiloV2.functions';

const URL_BASE = 'https://ping.checkilo.app/Nvmxrg5Ax65O';

describe('buildPingUrlV2', () => {
	it('event ping success -> /success?run=RUN', () => {
		expect(
			buildPingUrlV2({
				targetUrl: URL_BASE,
				operation: 'eventPing',
				eventResult: 'success',
				runId: 'RUN',
			}),
		).toBe(`${URL_BASE}/success?run=RUN`);
	});

	it('event ping failure -> /fail?run=RUN', () => {
		expect(
			buildPingUrlV2({
				targetUrl: URL_BASE,
				operation: 'eventPing',
				eventResult: 'fail',
				runId: 'RUN',
			}),
		).toBe(`${URL_BASE}/fail?run=RUN`);
	});

	it('throws when an event ping has no run id', () => {
		expect(() =>
			buildPingUrlV2({ targetUrl: URL_BASE, operation: 'eventPing', eventResult: 'success' }),
		).toThrow(/run id/i);
	});

	it('workflow start -> /start?run=RUN', () => {
		expect(
			buildPingUrlV2({
				targetUrl: URL_BASE,
				operation: 'workflowPing',
				workflowEvent: 'start',
				runId: 'RUN',
			}),
		).toBe(`${URL_BASE}/start?run=RUN`);
	});

	it('workflow checkpoint -> /checkpoint?run=RUN&label=save_crm', () => {
		expect(
			buildPingUrlV2({
				targetUrl: URL_BASE,
				operation: 'workflowPing',
				workflowEvent: 'checkpoint',
				checkpointName: 'save_crm',
				runId: 'RUN',
			}),
		).toBe(`${URL_BASE}/checkpoint?run=RUN&label=save_crm`);
	});

	it('workflow finish success -> /success?run=RUN', () => {
		expect(
			buildPingUrlV2({
				targetUrl: URL_BASE,
				operation: 'workflowPing',
				workflowEvent: 'finish',
				finishResult: 'success',
				runId: 'RUN',
			}),
		).toBe(`${URL_BASE}/success?run=RUN`);
	});

	it('workflow finish failure -> /fail?run=RUN', () => {
		expect(
			buildPingUrlV2({
				targetUrl: URL_BASE,
				operation: 'workflowPing',
				workflowEvent: 'finish',
				finishResult: 'fail',
				runId: 'RUN',
			}),
		).toBe(`${URL_BASE}/fail?run=RUN`);
	});

	it('throws when a checkpoint has no name', () => {
		expect(() =>
			buildPingUrlV2({
				targetUrl: URL_BASE,
				operation: 'workflowPing',
				workflowEvent: 'checkpoint',
				runId: 'RUN',
			}),
		).toThrow(/checkpoint name/i);
	});

	it('throws when a workflow ping has no run id', () => {
		expect(() =>
			buildPingUrlV2({ targetUrl: URL_BASE, operation: 'workflowPing', workflowEvent: 'start' }),
		).toThrow(/run id/i);
	});
});

describe('buildMetadataObject', () => {
	it('builds a flat object from key/value rows', () => {
		expect(
			buildMetadataObject([
				{ key: 'order_id', value: '1234' },
				{ key: 'items', value: '5' },
			]),
		).toEqual({ order_id: '1234', items: '5' });
	});

	it('returns undefined for empty or missing input', () => {
		expect(buildMetadataObject([])).toBeUndefined();
		expect(buildMetadataObject(undefined)).toBeUndefined();
	});

	it('skips rows with an empty key', () => {
		expect(
			buildMetadataObject([
				{ key: '', value: 'ignored' },
				{ key: 'a', value: 'b' },
			]),
		).toEqual({ a: 'b' });
	});
});

describe('resolveRunIdV2', () => {
	it('uses the execution id for non-failure events', () => {
		expect(resolveRunIdV2('EXEC', {}, 'start', undefined)).toBe('EXEC');
		expect(resolveRunIdV2('EXEC', {}, 'finish', 'success')).toBe('EXEC');
	});

	it('reuses the original execution id from an error item on finish + failure', () => {
		expect(resolveRunIdV2('EXEC', { execution: { id: 'ORIG' } }, 'finish', 'fail')).toBe('ORIG');
	});

	it('falls back to the execution id on finish + failure when no original id is present', () => {
		expect(resolveRunIdV2('EXEC', {}, 'finish', 'fail')).toBe('EXEC');
	});
});
