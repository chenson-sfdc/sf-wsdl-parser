<script lang="ts">
	import { scaleBand, scaleLinear } from 'd3-scale';
	import { max } from 'd3-array';
	import { barPath } from '#lib/chart';
	import { fmtInt } from '#lib/format';
	import { tip } from '#lib/tooltip.svelte';

	let {
		bins,
		xLabel,
		yLabel,
		unit = 'objects',
		ariaLabel
	}: { bins: { label: string; value: number }[]; xLabel: string; yLabel: string; unit?: string; ariaLabel: string } = $props();

	const width = 560;
	const height = 250;
	const m = { top: 8, right: 8, bottom: 46, left: 52 };
	const x = $derived(
		scaleBand(
			bins.map((b) => b.label),
			[m.left, width - m.right]
		).paddingInner(0.14)
	);
	const y = $derived(scaleLinear([0, max(bins, (b) => b.value) || 1], [height - m.bottom, m.top]).nice(4));
	const thick = $derived(Math.min(36, x.bandwidth()));
	const lines = (b: { label: string; value: number }) => [`${b.label} ${xLabel}`, { value: fmtInt(b.value), label: ' ' + unit }];
	function focusTip(e: FocusEvent, b: { label: string; value: number }) {
		const r = (e.currentTarget as Element).getBoundingClientRect();
		tip.show({ clientX: r.right, clientY: r.top }, lines(b));
	}
</script>

<div class="chart">
	<svg viewBox="0 0 {width} {height}" role="group" aria-label={ariaLabel}>
		{#each y.ticks(4) as t (t)}
			<line class="gridline" x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} />
			<text x={m.left - 8} y={y(t)} dy="0.35em" text-anchor="end">{fmtInt(t)}</text>
		{/each}
		<line class="axis" x1={m.left} x2={width - m.right} y1={height - m.bottom} y2={height - m.bottom} />

		{#each bins as b (b.label)}
			{@const bx = x(b.label) ?? 0}
<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users must reach this to read it or scroll it) -->
			<g
				class="row"
				role="img"
				tabindex="0"
				aria-label="{b.label}: {fmtInt(b.value)} {unit}"
				onpointerenter={(e) => tip.show(e, lines(b))}
				onpointermove={(e) => tip.move(e)}
				onpointerleave={() => tip.hide()}
				onfocus={(e) => focusTip(e, b)}
				onblur={() => tip.hide()}
			>
				<rect class="hover-band" x={bx - 2} y={m.top} width={x.bandwidth() + 4} height={height - m.top - m.bottom} rx="4" />
				<path
					class="bar"
					d={barPath(bx + (x.bandwidth() - thick) / 2, y(b.value), thick, Math.max(height - m.bottom - y(b.value), b.value ? 2 : 0), 4, false)}
				/>
				<text x={bx + x.bandwidth() / 2} y={height - m.bottom + 16} text-anchor="middle">{b.label}</text>
			</g>
		{/each}
		<text x={(m.left + width - m.right) / 2} y={height - 4} text-anchor="middle">{xLabel}</text>
		<text transform="translate(12 {(m.top + height - m.bottom) / 2}) rotate(-90)" text-anchor="middle">{yLabel}</text>
	</svg>
</div>
