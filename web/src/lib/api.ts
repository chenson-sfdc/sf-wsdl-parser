// The /api routes only exist under `wsdlparser serve`; elsewhere calls report
// { unavailable: true } so views can explain instead of failing.
export type ApiResult<T> = { unavailable: true } | { unavailable?: false; data: T };

export interface ServerFile {
	name: string;
	size: number;
}
export interface Org {
	username: string;
	alias: string;
	orgId: string;
	instanceUrl: string;
	isDevHub: boolean;
	isSandbox: boolean;
	isScratchOrg: boolean;
	oauthMethod: string;
	expired: boolean;
}
export interface OrgList {
	orgs: Org[];
	default: string;
}
export interface LabelsResponse {
	org: string;
	labels: Record<string, { label: string; labelPlural: string }>;
}
export interface DescriptionsResponse {
	org: string;
	command: string;
	objects: { name: string; description: string }[];
}

const isJSON = (r: Response) => (r.headers.get('Content-Type') || '').includes('application/json');

export async function apiCall<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<ApiResult<T>> {
	let r: Response;
	try {
		r = await fetch(
			'api/' + path,
			body === undefined
				? { headers: { Accept: 'application/json' }, signal }
				: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }
		);
	} catch (e) {
		if (signal?.aborted) throw e;
		return { unavailable: true };
	}
	if (!isJSON(r)) return { unavailable: true };
	const json = await r.json();
	if (!r.ok) throw new Error(json.error || r.statusText);
	return { data: json as T };
}

export async function listServerFiles(): Promise<ServerFile[]> {
	try {
		const r = await fetch('api/files', { headers: { Accept: 'application/json' } });
		if (!r.ok || !isJSON(r)) return [];
		return (await r.json()) as ServerFile[];
	} catch {
		return [];
	}
}

// A file-like object whose contents come from the embedded server.
export function serverFile(name: string) {
	return {
		name,
		async text() {
			const r = await fetch('api/model?file=' + encodeURIComponent(name));
			if (!r.ok) throw new Error((await r.text()).trim() || r.statusText);
			return r.text();
		}
	};
}
