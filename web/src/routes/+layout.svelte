<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { app, type Theme } from '#lib/explorer.svelte';
	import Toasts from '#lib/components/Toasts.svelte';
	import Tooltip from '#lib/components/Tooltip.svelte';
	import Welcome from '#lib/components/Welcome.svelte';

	let { children } = $props();

	const TABS = [
		['/', 'Overview'],
		['/objects', 'Objects'],
		['/operations', 'Operations'],
		['/enums', 'Enumerations'],
		['/descriptions', 'Descriptions'],
		['/orgs', 'Orgs']
	] as const;

	let fileInput: HTMLInputElement;
	let dragging = $state(false);
	let dragDepth = 0;

	onMount(() => {
		app.pickWsdl = () => fileInput.click();
		app.initTheme();
		void app.discoverServerFiles();
	});

	// Orgs works without a file; every other view needs a model.
	// Hash routing keeps the server-side pathname at "/" for every view, so the
	// active view must be read from page.route.id, not page.url.pathname.
	const needsModel = $derived(page.route.id !== '/orgs');
	const meta = $derived.by(() => {
		if (app.loading) return `Reading ${app.loadingName}…`;
		const m = app.model;
		if (!m) return 'No file loaded';
		const r = m.raw;
		return [
			r.ServiceName,
			r.ApiVersion && `API v${r.ApiVersion}`,
			app.fileName,
			r.Generated && `generated ${r.Generated}`,
			app.labelOrg && `labels from ${app.labelOrg}`
		]
			.filter(Boolean)
			.join(' · ');
	});

	const isCurrent = (path: string) => (path === '/' ? page.route.id === '/' : page.route.id?.startsWith(path) === true);

	function ondrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		dragDepth = 0;
		void app.loadFile(e.dataTransfer?.files[0]);
	}
	function ondragenter(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('Files')) return;
		dragDepth++;
		dragging = true;
	}
	function ondragleave() {
		if (--dragDepth <= 0) {
			dragDepth = 0;
			dragging = false;
		}
	}
</script>

<svelte:window ondragover={(e) => e.preventDefault()} {ondrop} {ondragenter} {ondragleave} />
<svelte:head><title>Enterprise WSDL Explorer</title></svelte:head>

<a class="skip" href="#main">Skip to content</a>

<header class="topbar">
	<div class="bar">
		<div class="brand">
			<span class="logo" aria-hidden="true">◆</span>
			<div>
				<div class="name">Enterprise WSDL Explorer</div>
				<div class="meta" aria-live="polite">{meta}</div>
			</div>
		</div>
		<div class="tools">
			<button type="button" class="btn small" onclick={() => app.pickWsdl()}>Open file…</button>
			<label class="theme">
				<span class="sr-only">Colour theme</span>
				<select value={app.theme} onchange={(e) => app.setTheme(e.currentTarget.value as Theme)}>
					<option value="auto">Theme: system</option>
					<option value="light">Theme: light</option>
					<option value="dark">Theme: dark</option>
				</select>
			</label>
		</div>
	</div>
	<nav aria-label="Views">
		<ul>
			{#each TABS as [path, label] (path)}
				<li>
					<a href={resolve(path)} aria-current={isCurrent(path) ? 'page' : undefined}>{label}</a>
				</li>
			{/each}
		</ul>
	</nav>
	{#if app.loading && app.model}<div class="progress" role="progressbar" aria-label="Loading {app.loadingName}"><span></span></div>{/if}
</header>

<input bind:this={fileInput} type="file" accept=".wsdl,.xml,.json" hidden onchange={(e) => { void app.loadFile(e.currentTarget.files?.[0]); e.currentTarget.value = ''; }} />

<main id="main" tabindex="-1">
	{#if needsModel && !app.model}
		<Welcome />
	{:else}
		{@render children()}
	{/if}
</main>

{#if dragging}
	<div class="drop" aria-hidden="true"><div>Drop a file to open it</div></div>
{/if}

<Tooltip />
<Toasts />

<style>
	.skip {
		position: absolute;
		left: -9999px;
		top: var(--s2);
		z-index: 60;
		padding: var(--s2) var(--s4);
		background: var(--surface);
		border: 2px solid var(--accent);
		border-radius: var(--radius-sm);
	}
	.skip:focus {
		left: var(--s2);
	}
	.topbar {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
	}
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--s4);
		flex-wrap: wrap;
		padding: var(--s3) var(--s5) var(--s2);
		max-width: 1440px;
		margin: 0 auto;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: var(--s3);
		min-width: 0;
	}
	.logo {
		color: var(--accent);
		font-size: 1.4rem;
	}
	.name {
		font-weight: 650;
	}
	.meta {
		color: var(--text-3);
		font-size: var(--text-xs);
		overflow-wrap: anywhere;
	}
	.tools {
		display: flex;
		gap: var(--s2);
		align-items: center;
	}
	nav {
		max-width: 1440px;
		margin: 0 auto;
		padding: 0 var(--s4);
		overflow-x: auto;
	}
	nav ul {
		display: flex;
		gap: var(--s1);
		list-style: none;
		margin: 0;
		padding: 0;
	}
	nav a {
		display: block;
		padding: var(--s2) var(--s4) calc(var(--s2) + 1px);
		color: var(--text-2);
		font-size: var(--text-sm);
		font-weight: 600;
		text-decoration: none;
		border-bottom: 3px solid transparent;
		white-space: nowrap;
	}
	nav a:hover {
		color: var(--text);
		background: var(--surface-2);
	}
	nav a[aria-current='page'] {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}
	.progress {
		height: 3px;
		background: var(--surface-2);
		overflow: hidden;
	}
	.progress span {
		display: block;
		width: 30%;
		height: 100%;
		background: var(--accent);
		animation: slide 1.1s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			margin-left: -30%;
		}
		to {
			margin-left: 100%;
		}
	}
	main {
		max-width: 1440px;
		margin: 0 auto;
		padding: var(--s6) var(--s5) var(--s7);
		outline: none;
	}
	.drop {
		position: fixed;
		inset: 0;
		z-index: 70;
		display: grid;
		place-items: center;
		background: color-mix(in srgb, var(--bg) 80%, transparent);
		pointer-events: none;
	}
	.drop div {
		padding: var(--s6) var(--s7);
		border: 3px dashed var(--accent);
		border-radius: var(--radius);
		background: var(--surface);
		color: var(--accent);
		font-size: var(--text-lg);
		font-weight: 600;
	}
	@media (max-width: 640px) {
		main {
			padding: var(--s4) var(--s3) var(--s6);
		}
		.bar {
			padding-inline: var(--s3);
		}
	}
</style>
