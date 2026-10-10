<script lang="ts">
	let { label, value, note }: { label: string; value: string; note?: string } = $props();
</script>

<div class="card kpi">
	<div class="label">{label}</div>
	<div class="value num">{value}</div>
	{#if note}<div class="note">{note}</div>{/if}
</div>

<style>
	.kpi {
		padding: var(--s4) var(--s5);
	}
	.label {
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 600;
	}
	.value {
		font-size: var(--text-kpi);
		font-weight: 650;
		line-height: 1.2;
		overflow-wrap: anywhere;
	}
	.note {
		color: var(--text-3);
		font-size: var(--text-xs);
	}
</style>
