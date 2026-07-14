import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class CheckiloApi implements ICredentialType {
	name = 'checkiloApi';

	displayName = 'Checkilo API';

	documentationUrl = 'https://checkilo.app/integrations/n8n/';

	icon: Icon = { light: 'file:../nodes/Checkilo/checkilo.svg', dark: 'file:../nodes/Checkilo/checkilo.dark.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://ping.checkilo.app',
			url: '/n8n/auth/test',
			method: 'GET',
		},
	};
}
