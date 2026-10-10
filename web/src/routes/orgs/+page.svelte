<script lang="ts">
	import { onMount } from 'svelte';
	import Card from '#lib/components/Card.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { app } from '#lib/explorer.svelte';
	import type { Org } from '#lib/api';

	onMount(() => {
		if (app.orgPhase === 'idle') void app.loadOrgs();
	});

	const orgType = (o: Org) => [o.isDevHub && 'Dev Hub', o.isScratchOrg ? 'Scratch' : o.isSandbox ? 'Sandbox' : 'Production'].filter(Boolean).join(', ');
	const name = (o: Org) => o.alias || o.username;
	const busy = $derived(app.orgBusy !== '');

	let alias = $state('');
	let url = $state('');
	let confirming = $state<Org | null>(null);
	let dialog: HTMLDialogElement;

	$effect(() => {
		if (confirming && !dialog.open) dialog.showModal();
		else if (!confirming && dialog.open) dialog.close();
	});

	function add(e: SubmitEvent) {
		e.preventDefault();
		void app.addOrg(alias.trim(), url.trim());
	}
	async function remove() {
		const o = confirming;
		confirming = null;
		if (o) await app.removeOrg(o.username);
	}
</script>

<PageHeader title="Authenticated orgs" lead="The orgs the Salesforce CLI is logged in to. The default org supplies object labels and descriptions." />

<div class="stack">
	<Card title="Orgs" subtitle="Read from the Salesforce CLI (sf auth list). The default org is the CLI's target-org.">
		{#snippet actions()}
			<button type="button" class="btn small" disabled={busy || app.orgPhase === 'loading'} onclick={app.loadOrgs}>Refresh</button>
		{/snippet}

		{#if app.orgPhase === 'unavailable'}
			<p class="note">This tab needs the embedded server, because only it can run the Salesforce CLI. Start it with <code>wsdlparser serve</code> and use the page it opens.</p>
		{:else if app.orgPhase === 'idle' || app.orgPhase === 'loading'}
			<p class="note" role="status">Loading authenticated orgs…</p>
		{:else}
			{#if app.orgError}<p class="note error" role="alert">{app.orgError}</p>{/if}
			{#if app.orgData}
				{#if app.orgData.orgs.length}
<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users must reach this to read it or scroll it) -->
					<div class="table-scroll" tabindex="0" role="region" aria-label="Authenticated orgs">
						<table>
							<caption class="sr-only">Authenticated orgs. Choose one as the default.</caption>
							<thead>
								<tr><th scope="col">Default</th><th scope="col">Alias</th><th scope="col">Username</th><th scope="col">Type</th><th scope="col">Instance URL</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr>
							</thead>
							<tbody>
								{#each app.orgData.orgs as o (o.username)}
									<tr>
										<td>
											<input type="radio" name="default-org" aria-label="Use {name(o)} as the default org" checked={o.username === app.orgData.default} disabled={busy} onchange={() => app.setDefaultOrg(o.username)} />
										</td>
										<td>{o.alias || '—'}</td>
										<td class="mono">{o.username}</td>
										<td>{orgType(o)}</td>
										<td class="mono">{o.instanceUrl || '—'}</td>
										<td>
											<span class="chip-row">
												{#if o.username === app.orgData.default}<span class="chip accent">default</span>{/if}
												{#if o.expired}<span class="chip warn">expired</span>{/if}
											</span>
										</td>
										<td><button type="button" class="btn small danger" disabled={busy} aria-label="Remove {name(o)}" onclick={() => (confirming = o)}>Remove</button></td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
					{#if !app.orgData.default}<p class="muted pad">No default org is set. Pick one with the radio button.</p>{/if}
				{:else}
					<p class="note">No authenticated orgs exist. Use “Add an org” below to log in to one.</p>
				{/if}
			{/if}
		{/if}
	</Card>

	{#if app.orgPhase === 'ready' || (app.orgPhase === 'error' && app.orgData)}
		<Card title="Add an org" subtitle="Opens a browser window on this machine to log in.">
			<form onsubmit={add} class="toolbar">
				<label class="field">
					Alias <span class="hint">optional</span>
					<input type="text" bind:value={alias} maxlength="64" autocomplete="off" placeholder="my-sandbox" />
				</label>
				<label class="field grow">
					Instance URL <span class="hint">optional — leave empty for production</span>
					<input type="url" bind:value={url} autocomplete="off" placeholder="https://test.salesforce.com" />
				</label>
				<button type="submit" class="btn primary" disabled={busy}>{app.orgBusy === 'login' ? 'Waiting for browser…' : 'Add an org'}</button>
			</form>
			{#if app.orgBusy === 'login'}
				<p class="note" role="status">A browser window opened on this machine. Finish logging in there; this page updates when you do.</p>
			{/if}
		</Card>
	{/if}
</div>

<!-- A real modal: focus is trapped, Esc cancels, and focus returns to the trigger. -->
<dialog bind:this={dialog} onclose={() => (confirming = null)} aria-labelledby="confirm-h">
	{#if confirming}
		<h2 id="confirm-h">Log out of {name(confirming)}?</h2>
		<p>This removes the CLI's stored authorization for <code>{confirming.username}</code>. The org itself is not affected.</p>
		<div class="row">
			<button type="button" class="btn" onclick={() => (confirming = null)}>Cancel</button>
			<button type="button" class="btn danger" onclick={remove}>Log out</button>
		</div>
	{/if}
</dialog>

<style>
	.pad {
		margin-top: var(--s3);
	}
	dialog {
		max-width: min(480px, calc(100vw - 2 * var(--s5)));
		padding: var(--s5);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		box-shadow: var(--shadow-pop);
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.5);
	}
	dialog p {
		margin: var(--s3) 0 var(--s5);
		color: var(--text-2);
	}
	.row {
		display: flex;
		justify-content: flex-end;
		gap: var(--s2);
	}
</style>
