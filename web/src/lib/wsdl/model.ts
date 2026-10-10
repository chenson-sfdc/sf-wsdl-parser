// Derives the analysis the views need from a parsed WSDL.
import { rollup, sum } from 'd3-array';
import type { Field, Operation, Raw } from './types';

export const KINDS = [
	'Standard',
	'Custom object',
	'Custom metadata',
	'Platform event',
	'History',
	'Share',
	'Feed',
	'Change event',
	'Other'
] as const;
export type Kind = (typeof KINDS)[number];

const SUFFIX_KIND: [string, Kind][] = [
	['__mdt', 'Custom metadata'],
	['__e', 'Platform event'],
	['__c', 'Custom object']
];
const COMPANIONS: [string, Kind][] = [
	['ChangeEvent', 'Change event'],
	['History', 'History'],
	['Share', 'Share'],
	['Feed', 'Feed']
];

function classify(name: string, names: Set<string>): Kind {
	for (const [suffix, kind] of SUFFIX_KIND) if (name.endsWith(suffix)) return kind;
	for (const [word, kind] of COMPANIONS) {
		if (!name.endsWith(word)) continue;
		const stem = name.slice(0, -word.length);
		if (stem.endsWith('__') && names.has(stem.slice(0, -2) + '__c')) return kind;
		if (stem && names.has(stem)) return kind;
	}
	return name.includes('__') ? 'Other' : 'Standard';
}

const OP_GROUPS: [string, RegExp][] = [
	['Describe', /^describe/],
	['Query & search', /^(query|queryAll|queryMore|search|retrieve$|getUpdated|getDeleted|findDuplicates|executeListView)/],
	['Data change', /^(create|update|upsert|delete|deleteByExample|undelete|merge|convertLead|emptyRecycleBin)$/],
	['Session & password', /^(login|logout|invalidateSessions|changeOwnPassword|setPassword|resetPassword|getUserInfo|getServerTimestamp)$/],
	['Email & templates', /^(sendEmail|sendEmailMessage|render|retrieve(Mass)?QuickAction)/]
];

function opGroup(name: string) {
	for (const [g, re] of OP_GROUPS) if (re.test(name)) return g;
	return 'Other';
}

export interface Ref {
	field: string;
	target: string;
}

export interface ObjectInfo {
	name: string;
	fields: Field[];
	nFields: number;
	kind: Kind;
	refs: Ref[];
	nChild: number;
	nPoly: number;
}

export interface Edge {
	source: string;
	target: string;
	fields: string[];
}

export interface Count {
	key: string;
	value: number;
}

export type OperationInfo = Operation & { group: string };

export interface Model {
	raw: Raw;
	objs: ObjectInfo[];
	byName: Map<string, ObjectInfo>;
	edges: Edge[];
	inbound: Map<string, Edge[]>;
	outbound: Map<string, Edge[]>;
	kindCounts: Count[];
	types: Count[];
	totalFields: number;
	enums: Raw['Enums'];
	ops: OperationInfo[];
	opGroups: Count[];
	topByFields: ObjectInfo[];
	topReferenced: { name: string; kind: Kind; value: number }[];
}

export function build(raw: Raw): Model {
	const names = new Set(raw.SObjects.map((o) => o.Name));

	const objs: ObjectInfo[] = raw.SObjects.map((o) => {
		const fields = o.Fields || [];
		const refs: Ref[] = [];
		let child = 0;
		let poly = 0;
		for (const f of fields) {
			if (f.Type === 'QueryResult') child++;
			else if (f.Type === 'sObject') poly++;
			else if (names.has(f.Type)) refs.push({ field: f.Name, target: f.Type });
		}
		return { name: o.Name, fields, nFields: fields.length, kind: classify(o.Name, names), refs, nChild: child, nPoly: poly };
	});
	const byName = new Map(objs.map((o) => [o.name, o]));

	// Edges: one per (source, target) pair, carrying the field names that create it.
	const edgeMap = new Map<string, Edge>();
	for (const o of objs) {
		for (const r of o.refs) {
			const key = o.name + '→' + r.target;
			let e = edgeMap.get(key);
			if (!e) edgeMap.set(key, (e = { source: o.name, target: r.target, fields: [] }));
			e.fields.push(r.field);
		}
	}
	const edges = Array.from(edgeMap.values()).filter((e) => e.source !== e.target);

	const inbound = new Map<string, Edge[]>();
	const outbound = new Map<string, Edge[]>();
	const push = (m: Map<string, Edge[]>, k: string, e: Edge) => {
		const list = m.get(k);
		if (list) list.push(e);
		else m.set(k, [e]);
	};
	for (const e of edges) {
		push(inbound, e.target, e);
		push(outbound, e.source, e);
	}

	const kindCounts = KINDS.map((k) => ({ key: k as string, value: objs.filter((o) => o.kind === k).length }))
		.filter((d) => d.value > 0)
		.sort((a, b) => b.value - a.value);

	const typeCounts = new Map<string, number>();
	const bump = (k: string) => typeCounts.set(k, (typeCounts.get(k) || 0) + 1);
	for (const o of objs) {
		for (const f of o.fields) {
			if (f.Type === 'QueryResult') bump('Child relationship (QueryResult)');
			else if (f.Type === 'sObject') bump('Polymorphic reference (sObject)');
			else if (names.has(f.Type)) bump('Typed reference');
			else bump(f.Type);
		}
	}
	const types = Array.from(typeCounts, ([key, value]) => ({ key, value })).sort((a, b) => b.value - a.value);

	const ops = raw.Operations.map((o) => ({ ...o, group: opGroup(o.Name) }));
	const opGroups = Array.from(rollup(ops, (v) => v.length, (d) => d.group), ([key, value]) => ({ key, value })).sort(
		(a, b) => b.value - a.value
	);

	return {
		raw,
		objs,
		byName,
		edges,
		inbound,
		outbound,
		kindCounts,
		types,
		totalFields: sum(objs, (o) => o.nFields),
		enums: raw.Enums,
		ops,
		opGroups,
		topByFields: objs.slice().sort((a, b) => b.nFields - a.nFields),
		topReferenced: objs
			.map((o) => ({ name: o.name, kind: o.kind, value: (inbound.get(o.name) || []).length }))
			.filter((d) => d.value > 0)
			.sort((a, b) => b.value - a.value)
	};
}
