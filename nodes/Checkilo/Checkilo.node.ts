import type { INodeTypeBaseDescription, IVersionedNodeType } from 'n8n-workflow';
import { VersionedNodeType } from 'n8n-workflow';

import { CheckiloV1 } from './CheckiloV1.node';
import { CheckiloV2 } from './CheckiloV2.node';

export class Checkilo extends VersionedNodeType {
	constructor() {
		const baseDescription: INodeTypeBaseDescription = {
			displayName: 'Checkilo',
			name: 'checkilo',
			icon: { light: 'file:checkilo.svg', dark: 'file:checkilo.dark.svg' },
			group: ['output'],
			description: 'Send event and workflow pings to Checkilo',
			defaultVersion: 2,
		};

		const nodeVersions: IVersionedNodeType['nodeVersions'] = {
			1: new CheckiloV1(),
			2: new CheckiloV2(),
		};

		super(nodeVersions, baseDescription);
	}
}
