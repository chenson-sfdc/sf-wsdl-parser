<script lang="ts">
	import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
	import { fmtInt } from '#lib/format';
	import type { Model } from '#lib/wsdl/model';
	import { tip } from '#lib/tooltip.svelte';

	interface GNode extends SimulationNodeDatum {
		id: string;
		role: 'center' | 'out' | 'in';
		both?: boolean;
	}
	interface GLink {
		source: string | GNode;
		target: string | GNode;
		fields: string[];
		dir: 'out' | 'in';
	}

	let {
		model,
		center,
		labelFor,
		onselect,
		maxPerSide = 40
	}: { model: Model; center: string; labelFor: (n: string) => string; onselect: (name: string) => void; maxPerSide?: number } = $props();

	const width = 760;
	const height = 520;
	const roleName = { center: 'Selected object', out: 'References', in: 'Referenced by' } as const;
	const roleColor = { center: 'var(--series-1)', out: 'var(--series-2)', in: 'var(--series-3)' } as const;

	// The simulation is run to rest synchronously, so there is no animation to
	// distract from reading and nothing to leave running.
	const graph = $derived.by(() => {
		const out = model.outbound.get(center) ?? [];
		const inn = model.inbound.get(center) ?? [];
		const outShown = out.slice(0, maxPerSide);
		const inShown = inn.filter((e) => !outShown.some((o) => o.target === e.source)).slice(0, maxPerSide);

		const nodes = new Map<string, GNode>([[center, { id: center, role: 'center', fx: width / 2, fy: height / 2 }]]);
		const links: GLink[] = [];
		for (const e of outShown) {
			if (!nodes.has(e.target)) nodes.set(e.target, { id: e.target, role: 'out' });
			links.push({ source: center, target: e.target, fields: e.fields, dir: 'out' });
		}
		for (const e of inShown) {
			if (!nodes.has(e.source)) nodes.set(e.source, { id: e.source, role: 'in' });
			links.push({ source: e.source, target: center, fields: e.fields, dir: 'in' });
		}
		for (const e of inn) {
			const n = nodes.get(e.source);
			if (n && n.role === 'out') n.both = true;
		}
		const list = [...nodes.values()];
		const sim = forceSimulation(list)
			.force('link', forceLink<GNode, GLink>(links).id((d) => d.id).distance(110).strength(0.5))
			.force('charge', forceManyBody().strength(-160))
			.force('x', forceX<GNode>((d) => (d.role === 'in' ? width * 0.22 : d.role === 'out' ? width * 0.78 : width / 2)).strength(0.12))
			.force('y', forceY(height / 2).strength(0.06))
			.force('collide', forceCollide(16))
			.stop();
		for (let i = 0; i < 260; i++) sim.tick();
		const cx = (v = 0) => Math.max(20, Math.min(width - 20, v));
		const cy = (v = 0) => Math.max(24, Math.min(height - 20, v));
		return {
			nodes: list.map((n) => ({ ...n, x: cx(n.x), y: cy(n.y) })),
			links: links.map((l) => ({ ...l, s: l.source as GNode, t: l.target as GNode })),
			hidden: out.length - outShown.length + (inn.length - inShown.length)
		};
	});

	let hot = $state('');

	function lines(n: GNode) {
		const out: (string | { value: string; label: string })[] = [labelFor(n.id), roleName[n.role] + (n.both ? ' (and references back)' : '')];
		const o = model.byName.get(n.id);
		if (o) out.push({ value: fmtInt(o.nFields), label: ' fields' });
		for (const l of graph.links) {
			if ((l.dir === 'out' && l.t.id === n.id) || (l.dir === 'in' && l.s.id === n.id)) {
				out.push(l.fields.slice(0, 4).join(', ') + (l.fields.length > 4 ? ` +${l.fields.length - 4}` : ''));
			}
		}
		return out;
	}
	function focusTip(e: FocusEvent, n: GNode) {
		const b = (e.currentTarget as Element).getBoundingClientRect();
		tip.show({ clientX: b.right, clientY: b.top }, lines(n));
	}
</script>

<div class="chart">
	<svg viewBox="0 0 {width} {height}" role="group" aria-label="Relationships of {labelFor(center)}">
		{#each graph.links as l, i (i)}
			<line
				class="link"
				class:hot={hot && (l.s.id === hot || l.t.id === hot)}
				x1={graph.nodes.find((n) => n.id === l.s.id)?.x}
				y1={graph.nodes.find((n) => n.id === l.s.id)?.y}
				x2={graph.nodes.find((n) => n.id === l.t.id)?.x}
				y2={graph.nodes.find((n) => n.id === l.t.id)?.y}
			/>
		{/each}
		{#each graph.nodes as n (n.id)}
			{@const isCenter = n.role === 'center'}
<!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users must reach this to read it or scroll it) -->
			<g
				transform="translate({n.x},{n.y})"
				class="node"
				class:clickable={!isCenter}
				role={isCenter ? 'img' : 'button'}
				tabindex="0"
				aria-label="{labelFor(n.id)}: {roleName[n.role]}{isCenter ? '' : '. Press to open'}"
				onpointerenter={(e) => {
					hot = n.id;
					tip.show(e, lines(n));
				}}
				onpointermove={(e) => tip.move(e)}
				onpointerleave={() => {
					hot = '';
					tip.hide();
				}}
				onfocus={(e) => focusTip(e, n)}
				onblur={() => tip.hide()}
				onclick={() => !isCenter && onselect(n.id)}
				onkeydown={(e) => {
					if (!isCenter && (e.key === 'Enter' || e.key === ' ')) {
						e.preventDefault();
						onselect(n.id);
					}
				}}
			>
				<circle r={isCenter ? 9 : 6} fill={roleColor[n.role]} stroke="var(--surface)" stroke-width="2" />
				<text class="node-label" x={isCenter ? 0 : 11} y={isCenter ? -15 : 0} dy="0.35em" text-anchor={isCenter ? 'middle' : 'start'}>{labelFor(n.id)}</text>
				<circle r="14" class="hit" />
			</g>
		{/each}
	</svg>
	<div class="legend">
		{#each ['center', 'out', 'in'] as const as k (k)}
			<span><i style:background={roleColor[k]}></i>{roleName[k]}</span>
		{/each}
		{#if graph.hidden > 0}<span>+{graph.hidden} more not drawn (see table)</span>{/if}
	</div>
</div>

<style>
	.link {
		stroke: var(--border-strong);
		stroke-width: 1px;
	}
	.link.hot {
		stroke: var(--text-2);
		stroke-width: 2px;
	}
	.node-label {
		fill: var(--text) !important;
		paint-order: stroke;
		stroke: var(--surface);
		stroke-width: 4px;
		stroke-linejoin: round;
	}
	.hit {
		fill: transparent;
	}
	.node.clickable {
		cursor: pointer;
	}
	.node:focus-visible {
		outline: none;
	}
	.node:focus-visible circle:first-child {
		stroke: var(--accent);
		stroke-width: 3;
	}
</style>
