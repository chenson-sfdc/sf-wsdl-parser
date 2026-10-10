<script lang="ts">
	import { app } from '#lib/explorer.svelte';
</script>

<!-- Polite live region: messages are announced without stealing focus. -->
<div class="toasts" role="status" aria-live="polite">
	{#each app.toasts as t (t.id)}
		<div class="toast {t.tone}">
			<span>{t.text}</span>
			<button type="button" class="btn small ghost" onclick={() => app.dismiss(t.id)} aria-label="Dismiss message">Dismiss</button>
		</div>
	{/each}
</div>

<style>
	.toasts {
		position: fixed;
		right: var(--s5);
		bottom: var(--s5);
		z-index: 50;
		display: flex;
		flex-direction: column;
		gap: var(--s2);
		max-width: min(440px, calc(100vw - 2 * var(--s5)));
	}
	.toast {
		display: flex;
		align-items: center;
		gap: var(--s3);
		padding: var(--s3) var(--s4);
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-left-width: 4px;
		border-radius: var(--radius-sm);
		box-shadow: var(--shadow-pop);
		font-size: var(--text-sm);
	}
	.toast.error {
		border-left-color: var(--danger);
	}
	.toast.success {
		border-left-color: var(--ok);
	}
	.toast.info {
		border-left-color: var(--accent);
	}
	.toast span {
		flex: 1;
	}
</style>
