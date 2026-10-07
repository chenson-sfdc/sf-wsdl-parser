"use strict";

(function (App) {
  const { tip, fmtInt, cssVar } = App;
  const SVG = "http://www.w3.org/2000/svg";

  // Bar whose data-end is rounded 4px and whose baseline end is square.
  function barPath(x, y, w, h, r, horizontal) {
    r = Math.min(r, horizontal ? w : h, (horizontal ? h : w) / 2);
    if (w <= 0 || h <= 0) return "";
    if (horizontal) {
      return `M${x},${y}H${x + w - r}a${r},${r} 0 0 1 ${r},${r}V${y + h - r}a${r},${r} 0 0 1 ${-r},${r}H${x}Z`;
    }
    return `M${x},${y + h}V${y + r}a${r},${r} 0 0 1 ${r},${-r}H${x + w - r}a${r},${r} 0 0 1 ${r},${r}V${y + h}Z`;
  }

  function attachHover(sel, linesFor, onClick) {
    sel
      .attr("tabindex", 0)
      .attr("role", onClick ? "button" : "img")
      .on("pointerenter pointermove", function (event, d) { tip.show(event, linesFor(d)); })
      .on("pointerleave", () => tip.hide())
      .on("focus", function (event, d) { tip.showForFocus(this, linesFor(d)); })
      .on("blur", () => tip.hide())
      .on("click", onClick ? (e, d) => onClick(d) : null)
      .on("keydown", onClick ? (e, d) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(d); } } : null);
  }

  // Horizontal bar chart. data: [{key, value, note?}]. Single series, single color.
  function hbar(container, data, opts = {}) {
    const { width = 520, label = "value", color = "var(--series-1)", onClick, labelWidth = 170, rowH = 28, fmt = fmtInt, tipExtra } = opts;
    const m = { top: 4, right: 56, bottom: 22, left: labelWidth };
    const height = m.top + m.bottom + data.length * rowH;
    const x = d3.scaleLinear([0, d3.max(data, (d) => d.value) || 1], [0, width - m.left - m.right]).nice(4);
    const y = d3.scaleBand(data.map((d) => d.key), [m.top, height - m.bottom]);

    const svg = d3.create("svg").attr("viewBox", [0, 0, width, height]).attr("width", width).attr("height", height)
      .attr("role", "group").attr("aria-label", opts.ariaLabel || "Bar chart");

    svg.append("g").attr("class", "grid").selectAll("line").data(x.ticks(4)).join("line")
      .attr("x1", (d) => m.left + x(d)).attr("x2", (d) => m.left + x(d))
      .attr("y1", m.top).attr("y2", height - m.bottom).attr("stroke", "var(--grid)");
    svg.append("g").selectAll("text").data(x.ticks(4)).join("text")
      .attr("x", (d) => m.left + x(d)).attr("y", height - 6).attr("text-anchor", "middle").text((d) => fmt(d));
    svg.append("line").attr("class", "axis-base").attr("x1", m.left).attr("x2", m.left)
      .attr("y1", m.top).attr("y2", height - m.bottom).attr("stroke", "var(--axis)");

    const rows = svg.append("g").selectAll("g").data(data).join("g");
    const thick = Math.min(24, y.bandwidth() - 6);
    rows.append("text").attr("class", "row-label").attr("x", m.left - 8).attr("y", (d) => y(d.key) + y.bandwidth() / 2)
      .attr("dy", "0.35em").attr("text-anchor", "end")
      .text((d) => (d.key.length > labelWidth / 6.6 ? d.key.slice(0, Math.floor(labelWidth / 6.6) - 1) + "…" : d.key));
    rows.append("path").attr("class", "bar").attr("fill", color)
      .attr("d", (d) => barPath(m.left, y(d.key) + (y.bandwidth() - thick) / 2, Math.max(x(d.value), 2), thick, 4, true));
    rows.append("text").attr("class", "value-label").attr("x", (d) => m.left + x(d.value) + 6)
      .attr("y", (d) => y(d.key) + y.bandwidth() / 2).attr("dy", "0.35em").text((d) => fmt(d.value));
    const hit = rows.append("rect").attr("class", "hit").attr("x", 0).attr("y", (d) => y(d.key))
      .attr("width", width).attr("height", y.bandwidth()).attr("aria-label", (d) => `${d.key}: ${fmt(d.value)} ${label}`);
    attachHover(hit, (d) => [d.key, { value: fmt(d.value), label: " " + label }, ...(tipExtra ? tipExtra(d) : [])], onClick);
    hit.style("cursor", onClick ? "pointer" : "default");

    container.replaceChildren(svg.node());
  }

  // Column histogram. bins: [{x0, x1, value, label}]. Log y so heavy-tailed data stays readable.
  function columns(container, bins, opts = {}) {
    const { width = 520, height = 240, xLabel = "", yLabel = "", color = "var(--series-1)", unit = "objects" } = opts;
    const m = { top: 8, right: 8, bottom: 44, left: 48 };
    const x = d3.scaleBand(bins.map((b) => b.label), [m.left, width - m.right]).paddingInner(0.12);
    const maxV = d3.max(bins, (b) => b.value) || 1;
    const y = d3.scaleLinear([0, maxV], [height - m.bottom, m.top]).nice(4);

    const svg = d3.create("svg").attr("viewBox", [0, 0, width, height]).attr("width", width).attr("height", height)
      .attr("role", "group").attr("aria-label", opts.ariaLabel || "Column chart");
    svg.append("g").selectAll("line").data(y.ticks(4)).join("line")
      .attr("x1", m.left).attr("x2", width - m.right).attr("y1", y).attr("y2", y).attr("stroke", "var(--grid)");
    svg.append("g").selectAll("text").data(y.ticks(4)).join("text")
      .attr("x", m.left - 6).attr("y", y).attr("dy", "0.35em").attr("text-anchor", "end").text((d) => fmtInt(d));
    svg.append("line").attr("class", "axis-base").attr("x1", m.left).attr("x2", width - m.right)
      .attr("y1", height - m.bottom).attr("y2", height - m.bottom).attr("stroke", "var(--axis)");

    const thick = Math.min(24, x.bandwidth());
    const cols = svg.append("g").selectAll("g").data(bins).join("g");
    cols.append("path").attr("class", "bar").attr("fill", color).attr("d", (b) =>
      barPath(x(b.label) + (x.bandwidth() - thick) / 2, y(b.value), thick, Math.max(height - m.bottom - y(b.value), b.value ? 2 : 0), 4, false));
    cols.append("text").attr("x", (b) => x(b.label) + x.bandwidth() / 2).attr("y", height - m.bottom + 14)
      .attr("text-anchor", "middle").text((b) => b.label);
    const hit = cols.append("rect").attr("class", "hit").attr("x", (b) => x(b.label) - 2)
      .attr("y", m.top).attr("width", x.bandwidth() + 4).attr("height", height - m.top - m.bottom)
      .attr("aria-label", (b) => `${b.label}: ${fmtInt(b.value)} ${unit}`);
    attachHover(hit, (b) => [`${b.label} ${xLabel}`.trim(), { value: fmtInt(b.value), label: " " + unit }]);
    svg.append("text").attr("x", (m.left + width - m.right) / 2).attr("y", height - 4).attr("text-anchor", "middle").text(xLabel);
    svg.append("text").attr("transform", `translate(12 ${(m.top + height - m.bottom) / 2}) rotate(-90)`).attr("text-anchor", "middle").text(yLabel);

    container.replaceChildren(svg.node());
  }

  // Ego network around one sObject: center, objects it references, objects that reference it.
  function egoGraph(container, model, centerName, opts = {}) {
    const { width = 760, height = 520, onSelect, maxPerSide = 40 } = opts;
    const out = (model.outbound.get(centerName) || []).slice();
    const inn = (model.inbound.get(centerName) || []).slice();
    const outShown = out.slice(0, maxPerSide);
    const inShown = inn.filter((e) => !outShown.some((o) => o.target === e.source)).slice(0, maxPerSide);

    const nodes = new Map();
    nodes.set(centerName, { id: centerName, role: "center" });
    const links = [];
    for (const e of outShown) {
      if (!nodes.has(e.target)) nodes.set(e.target, { id: e.target, role: "out" });
      links.push({ source: centerName, target: e.target, fields: e.fields, dir: "out" });
    }
    for (const e of inShown) {
      if (!nodes.has(e.source)) nodes.set(e.source, { id: e.source, role: "in" });
      links.push({ source: e.source, target: centerName, fields: e.fields, dir: "in" });
    }
    // Both-way neighbours keep the "references" role; mark them.
    for (const e of inn) {
      const n = nodes.get(e.source);
      if (n && n.role === "out") n.both = true;
    }
    const nodeArr = Array.from(nodes.values());
    const roleColor = { center: "var(--series-1)", out: "var(--series-2)", in: "var(--series-3)" };
    const roleName = { center: "Selected object", out: "References", in: "Referenced by" };

    const svg = d3.create("svg").attr("viewBox", [0, 0, width, height]).attr("width", width).attr("height", height)
      .attr("role", "group").attr("aria-label", `Relationships of ${centerName}`);
    const link = svg.append("g").selectAll("line").data(links).join("line").attr("class", "link");
    const node = svg.append("g").selectAll("g").data(nodeArr).join("g");

    const r = (d) => (d.role === "center" ? 9 : 6);
    node.append("circle").attr("r", r).attr("fill", (d) => roleColor[d.role])
      .attr("stroke", "var(--surface-1)").attr("stroke-width", 2);
    node.append("text").attr("class", "node-label").attr("x", (d) => (d.role === "center" ? 0 : 10))
      .attr("y", (d) => (d.role === "center" ? -14 : 0)).attr("dy", "0.35em")
      .attr("text-anchor", (d) => (d.role === "center" ? "middle" : "start")).text((d) => d.id);
    const hit = node.append("circle").attr("r", 14).attr("class", "hit");
    attachHover(hit, (d) => {
      const lines = [d.id, roleName[d.role] + (d.both ? " (and references back)" : "")];
      const o = model.byName.get(d.id);
      if (o) lines.push({ value: fmtInt(o.nFields), label: " fields" });
      for (const l of links) {
        if ((l.dir === "out" && l.target.id === d.id) || (l.dir === "in" && l.source.id === d.id)) {
          lines.push(l.fields.slice(0, 4).join(", ") + (l.fields.length > 4 ? ` +${l.fields.length - 4}` : ""));
        }
      }
      return lines;
    }, (d) => d.id !== centerName && onSelect && onSelect(d.id));

    const sim = d3.forceSimulation(nodeArr)
      .force("link", d3.forceLink(links).id((d) => d.id).distance(110).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-160))
      .force("x", d3.forceX((d) => (d.role === "in" ? width * 0.22 : d.role === "out" ? width * 0.78 : width / 2)).strength(0.12))
      .force("y", d3.forceY(height / 2).strength(0.06))
      .force("collide", d3.forceCollide(16))
      .stop();
    const center = nodes.get(centerName);
    center.fx = width / 2; center.fy = height / 2;
    for (let i = 0; i < 260; i++) sim.tick();

    const clampX = (v) => Math.max(20, Math.min(width - 20, v));
    const clampY = (v) => Math.max(24, Math.min(height - 20, v));
    link.attr("x1", (d) => clampX(d.source.x)).attr("y1", (d) => clampY(d.source.y))
      .attr("x2", (d) => clampX(d.target.x)).attr("y2", (d) => clampY(d.target.y));
    node.attr("transform", (d) => `translate(${clampX(d.x)},${clampY(d.y)})`);

    node.on("pointerenter", (e, d) => link.classed("hot", (l) => l.source.id === d.id || l.target.id === d.id))
      .on("pointerleave", () => link.classed("hot", false));

    const legend = document.createElement("div");
    legend.className = "legend";
    for (const k of ["center", "out", "in"]) {
      const item = document.createElement("span");
      const dot = document.createElement("i");
      dot.style.background = roleColor[k];
      item.append(dot, document.createTextNode(roleName[k]));
      legend.append(item);
    }
    const hidden = out.length - outShown.length + (inn.length - inShown.length);
    if (hidden > 0) {
      const note = document.createElement("span");
      note.textContent = `+${hidden} more not drawn (see table)`;
      legend.append(note);
    }
    const wrap = document.createElement("div");
    wrap.append(svg.node(), legend);
    container.replaceChildren(wrap);
  }

  App.charts = { hbar, columns, egoGraph };
})(window.App);
