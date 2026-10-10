<script lang="ts">
	import { tip } from '#lib/tooltip.svelte';

	let w = $state(0);
	let h = $state(0);
	const pad = 14;
	const left = $derived(
		Math.max(8, tip.x + pad + w > innerWidth - 8 ? tip.x - w - pad : tip.x + pad)
	);
	const top = $derived(Math.max(8, tip.y + pad + h > innerHeight - 8 ? tip.y - h - pad : tip.y + pad));
</script>

{#if tip.lines}
	<div class="tooltip" role="tooltip" style:left="{left}px" style:top="{top}px" bind:clientWidth={w} bind:clientHeight={h}>
		{#each tip.lines as line, i (i)}
			<div>
				{#if typeof line === 'string'}
					{#if i === 0}<strong>{line}</strong>{:else}{line}{/if}
				{:else}
					<strong>{line.value}</strong>{line.label}
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.tooltip {
		position: fixed;
		z-index: 40;
		pointer-events: none;
		max-width: 320px;
		padding: var(--s2) var(--s3);
		background: var(--surface);
		color: var(--text-2);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-pop);
		font-size: var(--text-xs);
	}
	strong {
		color: var(--text);
		font-size: var(--text-sm);
	}
</style>
