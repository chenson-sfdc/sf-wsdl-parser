<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import ObjectDetail from '#lib/components/ObjectDetail.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { app } from '#lib/explorer.svelte';
	import { fmtInt } from '#lib/format';
	import { hashQuery, objectHref } from '#lib/nav';

	const m = $derived(app.model!);
	const ui = app.objectsUi;
	const LIMIT = 400;

	const selected = $derived(hashQuery(page.url).get('o') ?? '');
	const inboundN = (name: string) => (m.inbound.get(name) ?? []).length;

	// With nothing chosen yet, open the most useful default instead of an empty pane.
	$effect(() => {
		if (!selected && m) {
			const first = untrack(() => (m.byName.has('Account') ? 'Account' : m.objs[0]?.name));
			if (first) void goto(objectHref(first), { replaceState: true });
		}
	});

	const rows = $derived.by(() => {
		const q = ui.query.trim().toLowerCase();
		const list = m.objs.filter(
			(o) => (!q || o.name.toLowerCase().includes(q) || app.labelFor(o.name).toLowerCase().includes(q)) && (!ui.kind || o.kind === ui.kind)
		);
		const byName = (a: { name: string }, b: { name: string }) => app.labelFor(a.name).localeCompare(app.labelFor(b.name));
		if (ui.sort === 'fields') list.sort((a, b) => b.nFields - a.nFields || byName(a, b));
		else if (ui.sort === 'inbound') list.sort((a, b) => inboundN(b.name) - inboundN(a.name) || byName(a, b));
		else list.sort(byName);
		return list;
	});
	const shown = $derived(rows.slice(0, LIMIT));
	const current = $derived(m.byName.get(selected));
</script>

<PageHeader title="Objects & relationships" lead="Pick an object to see its fields and how it connects to others." />

<div class="split">
	<aside class="card list-card" aria-label="Object list">
		<div class="toolbar">
			<label class="field grow">
				Filter
				<input type="search" placeholder="Name or label…" bind:value={ui.query} />
			</label>
			<label class="field">
				Kind
				<select bind:value={ui.kind}>
					<option value="">All kinds</option>
					{#each m.kindCounts as k (k.key)}<option value={k.key}>{k.key} ({fmtInt(k.value)})</option>{/each}
				</select>
			</label>
			<label class="field">
				Sort by
				<select bind:value={ui.sort}>
					<option value="name">Name</option>
					<option value="fields">Field count</option>
					<option value="inbound">Referenced by</option>
				</select>
			</label>
		</div>
		<div class="list-head">
			<p class="muted" aria-live="polite">{fmtInt(rows.length)} of {fmtInt(m.objs.length)} objects</p>
			<span class="muted count-head">{ui.sort === 'inbound' ? 'Ref. by' : 'Fields'}</span>
		</div>
		<ul class="list">
			{#each shown as o (o.name)}
				{@const n = ui.sort === 'inbound' ? inboundN(o.name) : o.nFields}
				<li>
					<a href={objectHref(o.name)} aria-current={o.name === selected ? 'true' : undefined}>
						<span class="n">{app.labelFor(o.name)}</span>
						<span class="count num">
							{n}<span class="sr-only">{ui.sort === 'inbound' ? ' objects reference this one' : ' fields'}</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
		{#if rows.length > shown.length}<p class="muted">Showing the first {LIMIT}. Narrow the filter to see the rest.</p>{/if}
		{#if rows.length === 0}<p class="note">No objects match. Clear the filter to see all of them.</p>{/if}
	</aside>

	<div class="detail">
		{#if current}
			{#key current.name}<ObjectDetail {current} />{/key}
		{:else if selected}
			<p class="note error">There is no object named “{selected}” in this file.</p>
		{/if}
	</div>
</div>

<style>
	.split {
		display: grid;
		grid-template-columns: minmax(280px, 340px) 1fr;
		gap: var(--s5);
		align-items: start;
	}
	@media (max-width: 960px) {
		.split {
			grid-template-columns: 1fr;
		}
	}
	.list-card {
		position: sticky;
		top: 112px;
		max-height: calc(100vh - 128px);
		display: flex;
		flex-direction: column;
		gap: var(--s3);
		padding: var(--s4);
	}
	@media (max-width: 960px) {
		.list-card {
			position: static;
			max-height: 420px;
		}
	}
	.list-card .toolbar {
		margin: 0;
	}
	.list-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--s3);
	}
	.count-head {
		flex-shrink: 0;
	}
	.list {
		list-style: none;
		padding: 0;
		margin: 0 calc(-1 * var(--s2));
		overflow: auto;
		flex: 1;
	}
	.list a {
		display: flex;
		justify-content: space-between;
		gap: var(--s3);
		padding: var(--s2) var(--s3);
		border-radius: var(--radius-sm);
		color: var(--text);
		text-decoration: none;
		font-size: var(--text-sm);
	}
	.list a:hover {
		background: var(--surface-2);
	}
	.list a[aria-current='true'] {
		background: var(--accent-soft);
		color: var(--accent);
		font-weight: 600;
	}
	.n {
		overflow-wrap: anywhere;
	}
	.count {
		color: var(--text-3);
		flex-shrink: 0;
	}
	.detail {
		display: flex;
		flex-direction: column;
		gap: var(--s5);
		min-width: 0;
	}
</style>
