<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, lead, actions }: { title: string; lead?: string; actions?: Snippet } = $props();
</script>

<header class="page-head">
	<div>
		<h1>{title}</h1>
		{#if lead}<p class="lead">{lead}</p>{/if}
	</div>
	{#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
	.page-head {
		display: flex;
		justify-content: space-between;
		align-items: flex-end;
		gap: var(--s4);
		flex-wrap: wrap;
		margin-bottom: var(--s5);
	}
	.lead {
		margin-top: var(--s1);
	}
	.actions {
		display: flex;
		gap: var(--s2);
	}
</style>
