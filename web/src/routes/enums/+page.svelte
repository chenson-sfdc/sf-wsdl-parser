<script lang="ts">
	import BarChart from '#lib/components/BarChart.svelte';
	import Card from '#lib/components/Card.svelte';
	import ChartCard from '#lib/components/ChartCard.svelte';
	import DataTable, { type Column } from '#lib/components/DataTable.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { app } from '#lib/explorer.svelte';
	import { fmtInt } from '#lib/format';
	import type { Enum } from '#lib/wsdl/types';

	const m = $derived(app.model!);
	let q = $state('');
	const sorted = $derived(m.enums.slice().sort((a, b) => b.Values.length - a.Values.length));
	const top = $derived(sorted.slice(0, 15).map((e) => ({ key: e.Name, value: e.Values.length })));
	const rows = $derived.by(() => {
		const s = q.trim().toLowerCase();
		return sorted.filter((e) => !s || e.Name.toLowerCase().includes(s) || e.Values.some((v) => v.toLowerCase().includes(s)));
	});
	const cols: Column<Enum>[] = [
		{ key: 'name', label: 'Name', get: (e) => e.Name, mono: true, sort: true },
		{ key: 'n', label: 'Values', num: true, get: (e) => e.Values.length, sort: true },
		{ key: 'members', label: 'Members', get: (e) => e.Values.join(', '), mono: true }
	];
	const topCols = [
		{ key: 'k', label: 'Enumeration', get: (d: { key: string; value: number }) => d.key },
		{ key: 'v', label: 'Values', num: true, get: (d: { key: string; value: number }) => d.value }
	];
</script>

<PageHeader title="Enumerations" lead="Enumerated types declared in the WSDL schema." />

<div class="stack">
	<ChartCard title="Largest enumerations" columns={topCols} rows={top}>
		{#snippet chart()}
			<BarChart data={top} unit="values" labelWidth={210} ariaLabel="Enumerations by value count" />
		{/snippet}
	</ChartCard>

	<Card title="All enumerations" subtitle="{fmtInt(rows.length)} of {fmtInt(m.enums.length)} enumerated types">
		<div class="toolbar">
			<label class="field">
				Filter
				<input type="search" placeholder="Name or member…" bind:value={q} />
			</label>
		</div>
		<DataTable columns={cols} {rows} caption="All enumerations" maxHeight={520} empty="No enumerations match the filter." />
	</Card>
</div>
