<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import Card from './Card.svelte';
	import DataTable, { type Column } from './DataTable.svelte';

	// Every chart ships with a table twin for screen readers and for copying numbers.
	let {
		title,
		subtitle,
		chart,
		columns,
		rows,
		caption = title
	}: { title: string; subtitle?: string; chart: Snippet; columns: Column<T>[]; rows: T[]; caption?: string } = $props();
</script>

<Card {title} {subtitle}>
	{@render chart()}
	<details class="twin">
		<summary>View as table</summary>
		<DataTable {columns} {rows} {caption} maxHeight={320} />
	</details>
</Card>
