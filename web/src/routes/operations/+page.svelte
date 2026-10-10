<script lang="ts">
	import BarChart from '#lib/components/BarChart.svelte';
	import Card from '#lib/components/Card.svelte';
	import ChartCard from '#lib/components/ChartCard.svelte';
	import DataTable, { type Column } from '#lib/components/DataTable.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { app } from '#lib/explorer.svelte';
	import { fmtInt } from '#lib/format';
	import type { OperationInfo } from '#lib/wsdl/model';

	const m = $derived(app.model!);
	let q = $state('');
	const rows = $derived.by(() => {
		const s = q.trim().toLowerCase();
		return m.ops.filter((o) => !s || o.Name.toLowerCase().includes(s) || o.Documentation.toLowerCase().includes(s));
	});
	const cols: Column<OperationInfo>[] = [
		{ key: 'name', label: 'Operation', get: (o) => o.Name, mono: true, sort: true },
		{ key: 'group', label: 'Group', get: (o) => o.group, sort: true },
		{ key: 'req', label: 'Request', get: (o) => o.RequestType, mono: true },
		{ key: 'res', label: 'Response', get: (o) => o.ResponseType, mono: true },
		{ key: 'faults', label: 'Faults', get: (o) => o.Faults.join(', '), mono: true },
		{ key: 'doc', label: 'Documentation', get: (o) => o.Documentation }
	];
	const groupCols = [
		{ key: 'k', label: 'Group', get: (d: { key: string; value: number }) => d.key },
		{ key: 'v', label: 'Operations', num: true, get: (d: { key: string; value: number }) => d.value }
	];
</script>

<PageHeader title="Operations" lead="The SOAP operations declared in the WSDL's portType." />

<div class="stack">
	<ChartCard title="Operations by group" columns={groupCols} rows={m.opGroups}>
		{#snippet chart()}
			<BarChart data={m.opGroups} unit="operations" labelWidth={160} ariaLabel="Operations by group" />
		{/snippet}
	</ChartCard>

	<Card title="All operations" subtitle="{fmtInt(rows.length)} of {fmtInt(m.ops.length)} operations">
		<div class="toolbar">
			<label class="field">
				Filter
				<input type="search" placeholder="Name or documentation…" bind:value={q} />
			</label>
		</div>
		<DataTable columns={cols} {rows} caption="All operations" maxHeight={560} empty="No operations match the filter." />
	</Card>
</div>
