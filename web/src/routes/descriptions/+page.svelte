<script lang="ts">
	import BarChart from '#lib/components/BarChart.svelte';
	import Card from '#lib/components/Card.svelte';
	import ChartCard from '#lib/components/ChartCard.svelte';
	import ColumnChart from '#lib/components/ColumnChart.svelte';
	import DataTable, { type Column } from '#lib/components/DataTable.svelte';
	import Kpi from '#lib/components/Kpi.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { app } from '#lib/explorer.svelte';
	import { fmtInt } from '#lib/format';
	import { objectHref, openObject } from '#lib/nav';
	import { analyze, STATUS, toCSV, type Row } from '#lib/wsdl/descriptions';

	const m = $derived(app.model!);
	const custom = $derived(m.objs.filter((o) => o.kind === 'Custom object'));
	let descInput: HTMLInputElement;

	const a = $derived(app.descriptions ? analyze(m, app.descriptions) : null);
	const fromOrg = $derived(app.descSource?.kind === 'org');
	const pct = $derived(a && custom.length ? Math.round((a.described / custom.length) * 100) : 0);

	let q = $state('');
	let status = $state<string>('lacking');
	const shown = $derived.by(() => {
		if (!a) return [] as Row[];
		const s = q.trim().toLowerCase();
		return a.rows
			.filter(
				(r) =>
					(status === 'all' || (status === 'lacking' ? r.status !== STATUS.described : r.status === status)) &&
					(!s || r.obj.name.toLowerCase().includes(s) || app.labelFor(r.obj.name).toLowerCase().includes(s))
			)
			.sort((x, y) => y.obj.nFields - x.obj.nFields || (x.obj.name < y.obj.name ? -1 : 1));
	});

	const statusData = $derived(a ? [
		{ key: STATUS.described, value: a.described },
		{ key: STATUS.blank, value: a.blank },
		{ key: STATUS.missing, value: a.missing }
	] : []);
	const bins = $derived(
		a
			? (
					[
						['1–9', 1, 9],
						['10–24', 10, 24],
						['25–49', 25, 49],
						['50–99', 50, 99],
						['100+', 100, Infinity]
					] as [string, number, number][]
				).map(([label, lo, hi]) => ({ label, value: a.lacking.filter((r) => r.obj.nFields >= lo && r.obj.nFields <= hi).length }))
			: []
	);
	const topData = $derived(
		a ? a.lacking.slice().sort((x, y) => y.obj.nFields - x.obj.nFields).slice(0, 15).map((r) => ({ key: r.obj.name, value: r.obj.nFields })) : []
	);
	type KV = { key: string; value: number };
	const kv = (label: string, v: string, fmt = (k: string) => k): Column<KV>[] => [
		{ key: 'k', label, get: (d) => fmt(d.key) },
		{ key: 'v', label: v, num: true, get: (d) => d.value }
	];

	const cols: Column<Row>[] = [
		{ key: 'obj', label: 'Object', get: (r) => app.labelFor(r.obj.name), sort: true },
		{ key: 'status', label: 'Status', get: (r) => r.status, sort: true },
		{ key: 'fields', label: 'Fields', num: true, get: (r) => r.obj.nFields, sort: true },
		{ key: 'text', label: 'Description', get: (r) => r.text }
	];

	function download() {
		const url = URL.createObjectURL(new Blob([toCSV(shown)], { type: 'text/csv' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = 'custom-objects-lacking-description.csv';
		document.body.append(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);
	}
	async function pickFile(files: FileList | null) {
		if (await app.loadDescriptionsFile(files?.[0])) status = 'lacking';
	}
</script>

<PageHeader
	title="Missing descriptions"
	lead="Find the custom objects nobody has documented, largest first. The WSDL has no descriptions, so they come from your default org or from an export."
/>

<input bind:this={descInput} type="file" accept=".csv,.json" hidden onchange={(e) => { void pickFile(e.currentTarget.files); e.currentTarget.value = ''; }} />

{#snippet orgButton(small: boolean)}
	<button type="button" class="btn" class:small class:primary={!small} disabled={app.descBusy} onclick={() => app.loadDescriptionsFromOrg()}>
		{app.descBusy ? 'Reading the default org…' : small ? 'Refresh from default org' : 'Get descriptions from default org'}
	</button>
{/snippet}

{#if app.descError}<p class="note error" role="alert">{app.descError}</p>{/if}
{#if app.descBusy}<p class="note" role="status">Listing custom objects and reading their descriptions. This can take a little while for large orgs.</p>{/if}

{#if !a}
	<Card title="Load object descriptions" subtitle="{fmtInt(custom.length)} custom objects will be checked.">
		<div class="stack">
			<section class="option">
				<h3>From the default org <span class="chip accent">Recommended</span></h3>
				<p class="muted">
					Runs <code>sf sobject list --sobject custom</code> for the default org chosen on the
					<a href="#/orgs">Orgs</a> tab, then reads each object's Description.
				</p>
				{@render orgButton(false)}
			</section>
			<section class="option">
				<h3>From an export</h3>
				<p class="muted">A .csv or .json with an API-name column (QualifiedApiName, ApiName, FullName or DeveloperName) and a Description column.</p>
				<pre class="snippet">sf data query --use-tooling-api --result-format csv \
  -q "SELECT QualifiedApiName, Description FROM EntityDefinition WHERE QualifiedApiName LIKE '%__c'" &gt; descriptions.csv</pre>
				<div><button type="button" class="btn" onclick={() => descInput.click()}>Choose descriptions file…</button></div>
			</section>
		</div>
	</Card>
{:else}
	<div class="stack">
		<p class="muted">
			{#if app.descSource?.kind === 'org'}
				From the default org ({app.descSource.org}): {fmtInt(app.descSource.count)} custom objects listed by <code>{app.descSource.command}</code>.
			{:else if app.descSource}
				From the file {app.descSource.name}.
			{/if}
		</p>

		<div class="grid kpis">
			<Kpi label="Custom objects" value={fmtInt(custom.length)} note="in the WSDL, checked for a description" />
			<Kpi label="With a description" value={fmtInt(a.described)} note="{pct}% coverage" />
			<Kpi label="Missing a description" value={fmtInt(a.lacking.length)} note="{fmtInt(a.blank)} blank · {fmtInt(a.missing)} not in {fromOrg ? 'the org' : 'the export'}" />
			<Kpi label={fromOrg ? 'Org-only objects' : 'Unmatched export rows'} value={fmtInt(a.unmatched)} note="no custom object in the WSDL" />
		</div>

		<div class="grid two">
			<ChartCard title="Description coverage" subtitle="Custom objects by whether the source gives them a description." columns={kv('Status', 'Objects')} rows={statusData}>
				{#snippet chart()}<BarChart data={statusData} unit="objects" labelWidth={150} rowH={36} ariaLabel="Custom objects by description status" />{/snippet}
			</ChartCard>
			<ChartCard title="Undocumented objects by size" subtitle="Fields per object, for objects lacking a description." columns={kv('Fields', 'Objects')} rows={bins.map((b) => ({ key: b.label, value: b.value }))}>
				{#snippet chart()}<ColumnChart {bins} xLabel="fields per object" yLabel="objects lacking a description" ariaLabel="Undocumented objects by field count" />{/snippet}
			</ChartCard>
			<ChartCard title="Largest undocumented objects" subtitle="Select a bar to open the object." columns={kv('Object', 'Fields', app.labelFor)} rows={topData}>
				{#snippet chart()}<BarChart data={topData} unit="fields" labelWidth={190} ariaLabel="Largest objects lacking a description" keyLabel={app.labelFor} onselect={openObject} />{/snippet}
			</ChartCard>
		</div>

		<Card title="Custom objects" subtitle="Sorted by field count. The table and the CSV download follow the filters.">
			{#snippet actions()}
				{@render orgButton(true)}
				<button type="button" class="btn small" onclick={() => descInput.click()}>Load a file instead…</button>
			{/snippet}
			<div class="toolbar">
				<label class="field grow">
					Filter
					<input type="search" placeholder="Name or label…" bind:value={q} />
				</label>
				<label class="field">
					Show
					<select bind:value={status}>
						<option value="lacking">Lacking a description ({fmtInt(a.lacking.length)})</option>
						<option value={STATUS.blank}>Blank description ({fmtInt(a.blank)})</option>
						<option value={STATUS.missing}>Not in {fromOrg ? 'org' : 'export'} ({fmtInt(a.missing)})</option>
						<option value={STATUS.described}>Has description ({fmtInt(a.described)})</option>
						<option value="all">All custom objects ({fmtInt(custom.length)})</option>
					</select>
				</label>
				<button type="button" class="btn" disabled={!shown.length} onclick={download}>Download {fmtInt(shown.length)} as CSV</button>
			</div>
			<DataTable columns={cols} rows={shown} caption="Custom objects and their description status" maxHeight={560} empty="No custom objects match.">
				{#snippet cell(r, c, text)}
					{#if c.key === 'obj'}<a href={objectHref(r.obj.name)}>{text}</a>
					{:else if c.key === 'status'}<span class="chip" class:ok={r.status === STATUS.described} class:warn={r.status !== STATUS.described}>{text}</span>
					{:else}{text}{/if}
				{/snippet}
			</DataTable>
		</Card>
	</div>
{/if}

<style>
	.option {
		display: flex;
		flex-direction: column;
		gap: var(--s3);
		align-items: flex-start;
	}
	.option + .option {
		border-top: 1px solid var(--border);
		padding-top: var(--s5);
	}
	.snippet {
		margin: 0;
		max-width: 100%;
		overflow: auto;
		padding: var(--s3) var(--s4);
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font: var(--text-xs) / 1.5 var(--mono);
		color: var(--text-2);
	}
</style>
