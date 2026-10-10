<script lang="ts">
	import { sum } from 'd3-array';
	import BarChart from '#lib/components/BarChart.svelte';
	import ChartCard from '#lib/components/ChartCard.svelte';
	import ColumnChart from '#lib/components/ColumnChart.svelte';
	import Kpi from '#lib/components/Kpi.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { app } from '#lib/explorer.svelte';
	import { fmtInt } from '#lib/format';
	import { openObject } from '#lib/nav';

	const m = $derived(app.model!);
	const keyCols = (label: string, vlabel: string) => [
		{ key: 'k', label, get: (d: { key: string; value: number }) => d.key },
		{ key: 'v', label: vlabel, num: true, get: (d: { key: string; value: number }) => d.value }
	];
	const labelCols = (label: string, vlabel: string) => [
		{ key: 'k', label, get: (d: { key: string; value: number }) => app.labelFor(d.key) },
		{ key: 'v', label: vlabel, num: true, get: (d: { key: string; value: number }) => d.value }
	];

	const standard = $derived(m.kindCounts.find((k) => k.key === 'Standard')?.value ?? 0);
	const withRefs = $derived(m.objs.filter((o) => o.refs.length).length);
	const bins = $derived(
		(
			[
				['0', 0, 0],
				['1–9', 1, 9],
				['10–24', 10, 24],
				['25–49', 25, 49],
				['50–99', 50, 99],
				['100–199', 100, 199],
				['200–499', 200, 499],
				['500+', 500, Infinity]
			] as [string, number, number][]
		).map(([label, lo, hi]) => ({ label, value: m.objs.filter((o) => o.nFields >= lo && o.nFields <= hi).length }))
	);
	const binRows = $derived(bins.map((b) => ({ key: b.label, value: b.value })));
	const typeData = $derived(m.types.slice(0, 14));
	const topData = $derived(m.topByFields.slice(0, 15).map((o) => ({ key: o.name, value: o.nFields })));
	const refData = $derived(m.topReferenced.slice(0, 15).map((o) => ({ key: o.name, value: o.value })));
</script>

<PageHeader
	title="Overview"
	lead="{fmtInt(m.objs.length)} objects and {fmtInt(m.totalFields)} fields in {m.raw.ServiceName || app.fileName}. Select a bar to open an object."
/>

<div class="stack">
	<div class="grid kpis">
		<Kpi label="sObjects" value={fmtInt(m.objs.length)} note="{fmtInt(standard)} standard" />
		<Kpi label="Fields" value={fmtInt(m.totalFields)} note="{(m.totalFields / Math.max(m.objs.length, 1)).toFixed(1)} per object" />
		<Kpi label="Relationships" value={fmtInt(m.edges.length)} note="{fmtInt(withRefs)} objects have a typed lookup" />
		<Kpi label="Operations" value={fmtInt(m.ops.length)} note="{new Set(m.ops.flatMap((o) => o.Faults)).size} distinct faults" />
		<Kpi label="Enumerations" value={fmtInt(m.enums.length)} note="{fmtInt(sum(m.enums, (e) => e.Values.length))} values" />
	</div>

	<div class="grid two">
		<ChartCard
			title="Largest objects"
			subtitle="Objects with the most fields."
			columns={labelCols('Object', 'Fields')}
			rows={topData}
		>
			{#snippet chart()}
				<BarChart data={topData} unit="fields" labelWidth={190} ariaLabel="Objects with the most fields" keyLabel={app.labelFor} onselect={openObject} />
			{/snippet}
		</ChartCard>

		<ChartCard
			title="Most referenced objects"
			subtitle="How many distinct objects hold a typed lookup to the target."
			columns={labelCols('Object', 'Referenced by')}
			rows={refData}
		>
			{#snippet chart()}
				<BarChart data={refData} unit="objects point here" labelWidth={190} ariaLabel="Most referenced objects" keyLabel={app.labelFor} onselect={openObject} />
			{/snippet}
		</ChartCard>

		<ChartCard
			title="Objects by kind"
			subtitle="Inferred from name suffixes (__c, __mdt, __e) and companions such as __History."
			columns={keyCols('Kind', 'Objects')}
			rows={m.kindCounts}
		>
			{#snippet chart()}
				<BarChart data={m.kindCounts} unit="objects" labelWidth={130} ariaLabel="sObjects by kind" />
			{/snippet}
		</ChartCard>

		<ChartCard
			title="Fields per object"
			subtitle="Most objects are small; a few permission objects have hundreds of fields."
			columns={keyCols('Fields', 'Objects')}
			rows={binRows}
		>
			{#snippet chart()}
				<ColumnChart {bins} xLabel="fields per object" yLabel="objects" ariaLabel="Objects by field count" />
			{/snippet}
		</ChartCard>

		<ChartCard
			title="Field types"
			subtitle="Relationship fields are grouped; Id and primitive types are shown as declared."
			columns={keyCols('Type', 'Fields')}
			rows={m.types.slice(0, 40)}
		>
			{#snippet chart()}
				<BarChart data={typeData} unit="fields" labelWidth={230} ariaLabel="Field types" />
			{/snippet}
		</ChartCard>
	</div>
</div>
