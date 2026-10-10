<script lang="ts" module>
	export interface Column<T> {
		key: string;
		label: string;
		get: (row: T) => string | number;
		num?: boolean;
		mono?: boolean;
		/** Sortable by `get`. */
		sort?: boolean;
	}
</script>

<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import { fmtInt } from '#lib/format';

	let {
		columns,
		rows,
		caption,
		maxHeight = 480,
		cell,
		empty = 'Nothing to show.'
	}: {
		columns: Column<T>[];
		rows: T[];
		caption: string;
		maxHeight?: number;
		/** Override a cell; the third argument is the formatted default to fall back on. */
		cell?: Snippet<[T, Column<T>, string | number]>;
		empty?: string;
	} = $props();

	let sortKey = $state('');
	let dir = $state<1 | -1>(1);

	const sorted = $derived.by(() => {
		const col = columns.find((c) => c.key === sortKey);
		if (!col) return rows;
		return rows.slice().sort((a, b) => {
			const x = col.get(a);
			const y = col.get(b);
			const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
			return c * dir;
		});
	});

	function toggle(key: string) {
		if (sortKey === key) dir = dir === 1 ? -1 : 1;
		else {
			sortKey = key;
			dir = 1;
		}
	}

	const display = (c: Column<T>, r: T) => {
		const v = c.get(r);
		return c.num && typeof v === 'number' ? fmtInt(v) : v;
	};
</script>

{#if rows.length === 0}
	<p class="note">{empty}</p>
{:else}
	<!-- Scrolling regions must be focusable so keyboard users can scroll them. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users must reach this to read it or scroll it) -->
	<div class="table-scroll" style:max-height="{maxHeight}px" tabindex="0" role="region" aria-label={caption}>
		<table>
			<caption class="sr-only">{caption}</caption>
			<thead>
				<tr>
					{#each columns as c (c.key)}
						<th class:num={c.num} scope="col" aria-sort={sortKey === c.key ? (dir === 1 ? 'ascending' : 'descending') : c.sort ? 'none' : undefined}>
							{#if c.sort}
								<button type="button" onclick={() => toggle(c.key)}>
									{c.label}
									<span class="arrow" aria-hidden="true">{sortKey === c.key ? (dir === 1 ? '▲' : '▼') : '↕'}</span>
								</button>
							{:else}
								{c.label}
							{/if}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sorted as r, i (i)}
					<tr>
						{#each columns as c (c.key)}
							<td class:num={c.num} class:mono={c.mono}>
								{#if cell}{@render cell(r, c, display(c, r))}{:else}{display(c, r)}{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
