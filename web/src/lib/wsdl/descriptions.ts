// Loads an object-description export and finds the custom objects that lack one.
// The WSDL carries no sObject descriptions, so they come from a separate file:
// JSON from `sf data query --json` (or any array of records) or a CSV, with an
// API-name column and a Description column.
import type { Model, ObjectInfo } from './model';

const NAME_KEYS = ['qualifiedapiname', 'apiname', 'fullname', 'developername', 'sobjecttype', 'name', 'object'];
const DESC_KEY = 'description';

type Rec = Record<string, unknown>;

// Minimal RFC 4180 reader: quoted fields, doubled quotes, newlines inside quotes.
export function parseCSV(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = '';
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ',') {
			row.push(field);
			field = '';
		} else if (c === '\n' || c === '\r') {
			if (c === '\r' && text[i + 1] === '\n') i++;
			row.push(field);
			field = '';
			rows.push(row);
			row = [];
		} else field += c;
	}
	if (field !== '' || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function recordsFromJSON(data: unknown): Rec[] {
	if (Array.isArray(data)) return data as Rec[];
	const d = data as { records?: unknown; result?: unknown } | null;
	if (d && Array.isArray(d.records)) return d.records as Rec[];
	if (d && d.result) return recordsFromJSON(d.result);
	throw new Error('JSON must be an array of records, or an sf CLI result with a records array.');
}

function recordsFromCSV(text: string): Rec[] {
	const [head, ...body] = parseCSV(text);
	if (!head) throw new Error('The CSV is empty.');
	return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// Returns Map(apiName -> trimmed description, "" when blank).
export function parse(text: string, fileName: string): Map<string, string> {
	text = text.replace(/^﻿/, '');
	const records = /\.csv$/i.test(fileName) || !/^\s*[[{]/.test(text) ? recordsFromCSV(text) : recordsFromJSON(JSON.parse(text));
	const map = new Map<string, string>();
	let sawDescription = false;
	for (const rec of records) {
		const lower: Rec = {};
		for (const [k, v] of Object.entries(rec || {})) lower[k.toLowerCase()] = v;
		const nameKey = NAME_KEYS.find((k) => typeof lower[k] === 'string' && (lower[k] as string).trim());
		if (DESC_KEY in lower) sawDescription = true;
		if (!nameKey) continue;
		const d = lower[DESC_KEY];
		map.set((lower[nameKey] as string).trim(), typeof d === 'string' ? d.trim() : '');
	}
	if (!map.size) throw new Error('No records with an API name found. Expected a column such as QualifiedApiName.');
	// Without a Description column every object would look undocumented.
	if (!sawDescription) throw new Error('No Description column found.');
	return map;
}

// EntityDefinition.DeveloperName omits the __c suffix, so accept both forms.
function lookup(map: Map<string, string>, name: string) {
	if (map.has(name)) return { name, text: map.get(name) as string };
	const stem = name.replace(/__c$/, '');
	if (stem !== name && map.has(stem)) return { name: stem, text: map.get(stem) as string };
	return null;
}

export const STATUS = { described: 'Has description', blank: 'Blank description', missing: 'Not in export' } as const;
export type Status = (typeof STATUS)[keyof typeof STATUS];

export interface Row {
	obj: ObjectInfo;
	status: Status;
	text: string;
}

export interface Analysis {
	rows: Row[];
	lacking: Row[];
	described: number;
	blank: number;
	missing: number;
	unmatched: number;
}

export function analyze(m: Model, map: Map<string, string>): Analysis {
	const used = new Set<string>();
	const rows: Row[] = m.objs
		.filter((o) => o.kind === 'Custom object')
		.map((o) => {
			const hit = lookup(map, o.name);
			if (hit) used.add(hit.name);
			const status = !hit ? STATUS.missing : hit.text ? STATUS.described : STATUS.blank;
			return { obj: o, status, text: hit ? hit.text : '' };
		});
	const count = (s: Status) => rows.filter((r) => r.status === s).length;
	return {
		rows,
		lacking: rows.filter((r) => r.status !== STATUS.described),
		described: count(STATUS.described),
		blank: count(STATUS.blank),
		missing: count(STATUS.missing),
		// Export entries that match no custom object in the WSDL.
		unmatched: Array.from(map.keys()).filter((k) => !used.has(k)).length
	};
}

// A cell starting with = + - @ (or a tab/CR) is run as a formula by spreadsheet apps.
const csvCell = (v: string) => {
	if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
	return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
};

export function toCSV(rows: Row[]): string {
	const lines = [['ApiName', 'Status', 'Fields'].join(',')];
	for (const r of rows) lines.push([r.obj.name, r.status, String(r.obj.nFields)].map(csvCell).join(','));
	return lines.join('\r\n') + '\r\n';
}
