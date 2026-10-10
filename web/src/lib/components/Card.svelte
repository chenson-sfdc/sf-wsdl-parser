<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		actions,
		children
	}: { title: string; subtitle?: string; actions?: Snippet; children: Snippet } = $props();
</script>

<section class="card">
	<div class="card-head">
		<div>
			<h2>{title}</h2>
			{#if subtitle}<p>{subtitle}</p>{/if}
		</div>
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
	{@render children()}
</section>

<style>
	.actions {
		display: flex;
		gap: var(--s2);
		flex-shrink: 0;
	}
</style>
