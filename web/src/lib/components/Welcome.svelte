<script lang="ts">
	import { app } from '#lib/explorer.svelte';
</script>

<section class="welcome card" aria-labelledby="welcome-h">
	<h1 id="welcome-h">{app.loading ? `Reading ${app.loadingName}…` : 'Explore an Enterprise WSDL'}</h1>

	{#if app.loading}
		<p class="lead">Parsing runs in your browser. Large orgs can take a few seconds.</p>
		<div class="bar" role="progressbar" aria-label="Parsing the WSDL"><span></span></div>
	{:else}
		<p class="lead">
			See how your org's objects, fields and relationships fit together. Drop a <code>.wsdl</code> file anywhere on this page, or
			a <code>.json</code> file written by <code>wsdlparser -json</code>. Nothing leaves your machine.
		</p>

		{#if app.loadError}<p class="note error" role="alert">{app.loadError}</p>{/if}

		<div class="actions">
			<button type="button" class="btn primary" onclick={() => app.pickWsdl()}>Choose a file…</button>
		</div>

		{#if app.serverFiles.length}
			<div class="saved">
				<h2>Or open one from the application's wsdl folder</h2>
				<ul>
					{#each app.serverFiles as f (f.name)}
						<li>
							<button type="button" class="btn" onclick={() => app.openServerFile(f.name)}>{f.name}</button>
							<span class="muted num">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
</section>

<style>
	.welcome {
		max-width: 720px;
		margin: var(--s6) auto;
		padding: var(--s6);
		display: flex;
		flex-direction: column;
		gap: var(--s4);
		align-items: flex-start;
	}
	.actions {
		display: flex;
		gap: var(--s3);
	}
	.saved {
		width: 100%;
		border-top: 1px solid var(--border);
		padding-top: var(--s4);
		display: flex;
		flex-direction: column;
		gap: var(--s3);
	}
	.saved h2 {
		font-size: var(--text-md);
	}
	ul {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--s2);
	}
	li {
		display: flex;
		align-items: center;
		gap: var(--s3);
	}
	.bar {
		width: 100%;
		height: 6px;
		background: var(--surface-2);
		border-radius: 3px;
		overflow: hidden;
	}
	.bar span {
		display: block;
		width: 35%;
		height: 100%;
		background: var(--accent);
		animation: slide 1.1s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			margin-left: -35%;
		}
		to {
			margin-left: 100%;
		}
	}
</style>
