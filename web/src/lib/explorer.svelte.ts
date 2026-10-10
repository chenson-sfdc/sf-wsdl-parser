import {
	apiCall,
	listServerFiles,
	serverFile,
	type DescriptionsResponse,
	type LabelsResponse,
	type OrgList,
	type ServerFile
} from './api';
import { parse as parseDescriptions } from './wsdl/descriptions';
import { build, type Model } from './wsdl/model';
import { parseFile } from './wsdl/parser';
import type { TextSource } from './wsdl/types';

export type DescSource = { kind: 'file'; name: string } | { kind: 'org'; org: string; command: string; count: number };
export type Toast = { id: number; tone: 'info' | 'error' | 'success'; text: string };
export type OrgPhase = 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';
export type Theme = 'auto' | 'light' | 'dark';

const THEME_KEY = 'wsdl-theme';

class Explorer {
	// The model is large and never mutated, so it skips deep reactivity.
	model = $state.raw<Model | null>(null);
	fileName = $state('');
	loadingName = $state('');
	loadError = $state('');
	serverFiles = $state.raw<ServerFile[]>([]);

	labels = $state.raw<Map<string, string> | null>(null);
	labelOrg = $state('');

	descriptions = $state.raw<Map<string, string> | null>(null);
	descSource = $state.raw<DescSource | null>(null);
	descBusy = $state(false);
	descError = $state('');

	orgPhase = $state<OrgPhase>('idle');
	orgData = $state.raw<OrgList | null>(null);
	orgError = $state('');
	orgBusy = $state<'' | 'login' | 'remove' | 'default'>('');

	// Filter state lives here, not in a view, so it survives switching tabs.
	objectsUi = $state({ query: '', kind: '', sort: 'name' as 'name' | 'fields' | 'inbound' });

	// Registered by the layout, which owns the hidden file input.
	pickWsdl: () => void = () => {};

	toasts = $state<Toast[]>([]);
	theme = $state<Theme>('auto');

	// Each load and each label fetch takes a number; only the newest may apply
	// its result, so a slow earlier request can't overwrite a later one.
	#loadSeq = 0;
	#labelSeq = 0;
	#toastId = 0;

	get loading() {
		return this.loadingName !== '';
	}

	labelFor = (name: string) => this.labels?.get(name) ?? name;

	// ---- files ---------------------------------------------------------------
	async loadFile(file: TextSource | undefined) {
		if (!file) return;
		const seq = ++this.#loadSeq;
		this.loadError = '';
		this.loadingName = file.name;
		try {
			const raw = await parseFile(file);
			if (seq !== this.#loadSeq) return;
			if (!raw.SObjects.length) throw new Error('No sObjects found. Is this an Enterprise WSDL?');
			this.model = build(raw);
			this.fileName = file.name;
			void this.loadLabels();
		} catch (e) {
			if (seq !== this.#loadSeq) return;
			// Keep any model that was already showing; it is still the user's data.
			this.loadError = `Could not read ${file.name}: ${(e as Error).message}`;
			if (this.model) this.toast('error', this.loadError);
		} finally {
			if (seq === this.#loadSeq) this.loadingName = '';
		}
	}

	async discoverServerFiles() {
		this.serverFiles = await listServerFiles();
		if (this.serverFiles.length === 1 && !this.model && !this.loading) {
			await this.loadFile(serverFile(this.serverFiles[0].name));
		}
	}

	openServerFile(name: string) {
		return this.loadFile(serverFile(name));
	}

	// ---- labels --------------------------------------------------------------
	// The WSDL carries no object-level label, so labels come from the default
	// org's global describe when one is available; the API name stands in
	// otherwise. They belong to an org, so they carry over from file to file.

	async loadLabels() {
		const seq = ++this.#labelSeq;
		try {
			const res = await apiCall<LabelsResponse>('orgs/labels', {});
			if (seq !== this.#labelSeq || res.unavailable) return;
			this.labels = new Map(Object.entries(res.data.labels).map(([name, l]) => [name, l.label]));
			this.labelOrg = res.data.org;
		} catch {
			// Silent: no default org, no CLI, or the org call failed. API names stand in.
		}
	}

	// Labels and org-fetched descriptions belong to one org. When the default
	// changes (set, login or logout), drop whatever came from another org and
	// fetch labels again, so a view never shows org A's data under org B.
	private syncOrgScoped(list: OrgList) {
		const def = list.orgs.find((o) => o.username === list.default);
		const target = def ? def.alias || def.username : '';
		if (this.labelOrg && this.labelOrg !== target) {
			++this.#labelSeq; // an in-flight fetch for the old org must not land
			this.labels = null;
			this.labelOrg = '';
		}
		if (this.descSource?.kind === 'org' && this.descSource.org !== target) {
			this.descriptions = null;
			this.descSource = null;
		}
		if (target && this.model && !this.labels) void this.loadLabels();
	}

	// ---- descriptions --------------------------------------------------------
	async loadDescriptionsFile(file: File | undefined) {
		if (!file) return false;
		try {
			this.descriptions = parseDescriptions(await file.text(), file.name);
			this.descSource = { kind: 'file', name: file.name };
			this.descError = '';
			return true;
		} catch (e) {
			this.toast('error', `Could not read ${file.name}: ${(e as Error).message}`);
			return false;
		}
	}

	async loadDescriptionsFromOrg() {
		this.descBusy = true;
		this.descError = '';
		try {
			const res = await apiCall<DescriptionsResponse>('orgs/descriptions', {});
			if (res.unavailable) {
				throw new Error(
					'This needs the embedded server, because only it can run the Salesforce CLI. Start it with `wsdlparser serve`.'
				);
			}
			this.descriptions = new Map(res.data.objects.map((o) => [o.name, o.description]));
			this.descSource = { kind: 'org', org: res.data.org, command: res.data.command, count: res.data.objects.length };
		} catch (e) {
			this.descError = (e as Error).message;
		} finally {
			this.descBusy = false;
		}
	}

	// ---- orgs ----------------------------------------------------------------
	async orgsRun(path: string, body: unknown, busy: '' | 'login' | 'remove' | 'default') {
		this.orgError = '';
		this.orgBusy = busy;
		try {
			const res = await apiCall<OrgList>('orgs' + path, body);
			if (res.unavailable) this.orgPhase = 'unavailable';
			else {
				this.orgPhase = 'ready';
				this.orgData = res.data;
				this.syncOrgScoped(res.data);
			}
		} catch (e) {
			this.orgPhase = this.orgData ? 'ready' : 'error';
			this.orgError = (e as Error).message;
		} finally {
			this.orgBusy = '';
		}
	}

	loadOrgs = () => {
		this.orgPhase = 'loading';
		return this.orgsRun('', undefined, '');
	};
	addOrg = (alias: string, instanceUrl: string) => this.orgsRun('/login', { alias, instanceUrl }, 'login');
	removeOrg = (username: string) => this.orgsRun('/logout', { username }, 'remove');
	setDefaultOrg = (username: string) => this.orgsRun('/default', { username }, 'default');

	// ---- toasts and theme ----------------------------------------------------
	toast(tone: Toast['tone'], text: string) {
		const id = ++this.#toastId;
		this.toasts.push({ id, tone, text });
		if (tone !== 'error') setTimeout(() => this.dismiss(id), 6000);
	}
	dismiss(id: number) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	initTheme() {
		const saved = localStorage.getItem(THEME_KEY);
		this.theme = saved === 'light' || saved === 'dark' ? saved : 'auto';
		this.applyTheme();
	}
	setTheme(t: Theme) {
		this.theme = t;
		if (t === 'auto') localStorage.removeItem(THEME_KEY);
		else localStorage.setItem(THEME_KEY, t);
		this.applyTheme();
	}
	private applyTheme() {
		if (this.theme === 'auto') document.documentElement.removeAttribute('data-theme');
		else document.documentElement.setAttribute('data-theme', this.theme);
	}
}

export const app = new Explorer();
