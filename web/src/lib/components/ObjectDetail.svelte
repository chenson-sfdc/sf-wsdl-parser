<script lang="ts">
	import { app } from '#lib/explorer.svelte';
	import { fmtInt } from '#lib/format';
	import { objectHref, openObject } from '#lib/nav';
	import type { ObjectInfo } from '#lib/wsdl/model';
	import type { Field } from '#lib/wsdl/types';
	import Card from './Card.svelte';
	import DataTable, { type Column } from './DataTable.svelte';
	import EgoGraph from './EgoGraph.svelte';
	import Kpi from './Kpi.svelte';

	let { current }: { current: ObjectInfo } = $props();

	const m = $derived(app.model!);
	const out = $derived(m.outbound.get(current.name) ?? []);
	const inn = $derived(m.inbound.get(current.name) ?? []);

	let fq = $state('');
	const fields = $derived.by(() => {
		const q = fq.trim().toLowerCase();
		return current.fields.filter((f) => !q || f.Name.toLowerCase().includes(q) || f.Type.toLowerCase().includes(q));
	});
	const fieldCols: Column<Field>[] = [
		{ key: 'name', label: 'Field', get: (f) => f.Name, mono: true, sort: true },
		{ key: 'type', label: 'Type', get: (f) => f.Type, sort: true },
		{ key: 'flags', label: 'Flags', get: (f) => [f.Nillable && 'nillable', f.Optional && 'optional', f.Repeated && 'repeated'].filter(Boolean).join(' ') }
	];

	const rels = $derived([
		...out.map((e) => ({ dir: 'References', other: e.target, via: e.fields.join(', ') })),
		...inn.map((e) => ({ dir: 'Referenced by', other: e.source, via: e.fields.join(', ') }))
	]);
	type Rel = (typeof rels)[number];
	const relCols: Column<Rel>[] = [
		{ key: 'dir', label: 'Direction', get: (r) => r.dir, sort: true },
		{ key: 'other', label: 'Object', get: (r) => app.labelFor(r.other), sort: true },
		{ key: 'via', label: 'Via fields', get: (r) => r.via, mono: true }
	];
</script>

<div class="stack">
	<div>
		<h2>{app.labelFor(current.name)}</h2>
		<p class="muted">
			{#if app.labelFor(current.name) !== current.name}<code>{current.name}</code> ·
			{/if}{current.kind}
		</p>
	</div>

	<div class="grid kpis">
		<Kpi label="Fields" value={fmtInt(current.nFields)} />
		<Kpi label="References" value={fmtInt(out.length)} note="distinct objects" />
		<Kpi label="Referenced by" value={fmtInt(inn.length)} note="distinct objects" />
		<Kpi label="Child relationships" value={fmtInt(current.nChild)} note="QueryResult fields" />
	</div>

	<Card title="Relationships" subtitle="Select a neighbour to re-centre. Orange: this object holds a lookup to it. Green: it holds a lookup to this object.">
		{#if out.length + inn.length}
			<EgoGraph model={m} center={current.name} labelFor={app.labelFor} onselect={openObject} />
		{:else}
			<p class="note">This object has no typed lookups to or from other objects in the file.</p>
		{/if}
	</Card>

	<Card title="Fields" subtitle="{fmtInt(fields.length)} of {fmtInt(current.nFields)} fields">
		<div class="toolbar">
			<label class="field">
				Filter fields
				<input type="search" placeholder="Name or type…" bind:value={fq} />
			</label>
		</div>
		<DataTable columns={fieldCols} rows={fields} caption="Fields of {app.labelFor(current.name)}" maxHeight={460} empty="No fields match the filter.">
			{#snippet cell(f, c, text)}
				{#if c.key === 'type' && m.byName.has(f.Type)}
					<a href={objectHref(f.Type)}>{app.labelFor(f.Type)}</a>
				{:else if c.key === 'flags'}
					<span class="chip-row">
						{#if f.Nillable}<span class="chip">nillable</span>{/if}
						{#if f.Optional}<span class="chip">optional</span>{/if}
						{#if f.Repeated}<span class="chip">repeated</span>{/if}
					</span>
				{:else}{text}{/if}
			{/snippet}
		</DataTable>
	</Card>

	{#if rels.length}
		<Card title="Relationship table">
			<DataTable columns={relCols} rows={rels} caption="Relationships of {app.labelFor(current.name)}" maxHeight={340}>
				{#snippet cell(r, c, text)}
					{#if c.key === 'other'}<a href={objectHref(r.other)}>{text}</a>{:else}{text}{/if}
				{/snippet}
			</DataTable>
		</Card>
	{/if}
</div>
