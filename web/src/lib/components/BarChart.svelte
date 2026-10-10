<script lang="ts">
	import { scaleBand, scaleLinear } from 'd3-scale';
	import { max } from 'd3-array';
	import { barPath, truncate } from '#lib/chart';
	import { fmtInt } from '#lib/format';
	import { tip } from '#lib/tooltip.svelte';

	interface Datum {
		key: string;
		value: number;
	}

	let {
		data,
		unit,
		ariaLabel,
		labelWidth = 170,
		rowH = 30,
		keyLabel = (k: string) => k,
		onselect
	}: {
		data: Datum[];
		unit: string;
		ariaLabel: string;
		labelWidth?: number;
		rowH?: number;
		keyLabel?: (key: string) => string;
		onselect?: (key: string) => void;
	} = $props();

	const width = 560;
	const m = $derived({ top: 4, right: 56, bottom: 24, left: labelWidth });
	const height = $derived(m.top + m.bottom + data.length * rowH);
	const x = $derived(scaleLinear([0, max(data, (d) => d.value) || 1], [0, width - m.left - m.right]).nice(4));
	const y = $derived(
		scaleBand(
			data.map((d) => d.key),
			[m.top, height - m.bottom]
		)
	);
	const thick = $derived(Math.min(20, y.bandwidth() - 8));
	const lines = (d: Datum) => [keyLabel(d.key), { value: fmtInt(d.value), label: ' ' + unit }];

	function onkey(e: KeyboardEvent, d: Datum) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onselect?.(d.key);
		}
	}
	function focusTip(e: FocusEvent, d: Datum) {
		const b = (e.currentTarget as Element).getBoundingClientRect();
		tip.show({ clientX: b.right, clientY: b.top }, lines(d));
	}
</script>

<div class="chart">
	<svg viewBox="0 0 {width} {height}" role="group" aria-label={ariaLabel}>
		{#each x.ticks(4) as t (t)}
			<line class="gridline" x1={m.left + x(t)} x2={m.left + x(t)} y1={m.top} y2={height - m.bottom} />
			<text x={m.left + x(t)} y={height - 6} text-anchor="middle">{fmtInt(t)}</text>
		{/each}
		<line class="axis" x1={m.left} x2={m.left} y1={m.top} y2={height - m.bottom} />

		{#each data as d (d.key)}
			{@const cy = (y(d.key) ?? 0) + y.bandwidth() / 2}
<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users must reach this to read it or scroll it) -->
			<g
				class="row"
				class:clickable={!!onselect}
				role={onselect ? 'button' : 'img'}
				tabindex="0"
				aria-label="{keyLabel(d.key)}: {fmtInt(d.value)} {unit}"
				onpointerenter={(e) => tip.show(e, lines(d))}
				onpointermove={(e) => tip.move(e)}
				onpointerleave={() => tip.hide()}
				onfocus={(e) => focusTip(e, d)}
				onblur={() => tip.hide()}
				onclick={() => onselect?.(d.key)}
				onkeydown={(e) => onkey(e, d)}
			>
				<rect class="hover-band" x="0" y={y(d.key)} {width} height={y.bandwidth()} rx="4" />
				<text class="row-label" x={m.left - 8} y={cy} dy="0.35em" text-anchor="end">{truncate(keyLabel(d.key), labelWidth - 8)}</text>
				<path class="bar" d={barPath(m.left, cy - thick / 2, Math.max(x(d.value), 2), thick, 4, true)} />
				<text class="value-label" x={m.left + x(d.value) + 6} y={cy} dy="0.35em">{fmtInt(d.value)}</text>
			</g>
		{/each}
	</svg>
</div>
