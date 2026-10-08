"use strict";

(function (App) {
  const { el, card, fmtInt, debounce } = App;

  function table(cols, rows, opts = {}) {
    const thead = el("thead", {}, [el("tr", {}, cols.map((c) => el("th", { class: c.num ? "num" : "", text: c.label })))]);
    const tbody = el("tbody");
    for (const r of rows) {
      tbody.append(el("tr", {}, cols.map((c) => {
        const v = c.get(r);
        return el("td", { class: (c.num ? "num " : "") + (c.mono ? "mono" : "") }, [v instanceof Node ? v : c.num && typeof v === "number" ? fmtInt(v) : v]);
      })));
    }
    return el("div", { class: "table-scroll", style: opts.maxHeight ? `max-height:${opts.maxHeight}px` : "" }, [el("table", {}, [thead, tbody])]);
  }

  // Every chart ships with a table twin.
  function withTable(chartNode, cols, rows) {
    const details = el("details", { class: "twin" }, [
      el("summary", { class: "btn small", text: "View as table" }),
      table(cols, rows, { maxHeight: 320 }),
    ]);
    details.style.marginTop = "8px";
    return el("div", { class: "chart-wrap" }, [chartNode, details]);
  }

  function kpi(label, value, note) {
    return el("div", { class: "card kpi" }, [
      el("div", { class: "label", text: label }),
      el("div", { class: "value", text: value }),
      note ? el("div", { class: "note", text: note }) : null,
    ]);
  }

  const keyCols = (label, vlabel) => [
    { label, get: (d) => d.key },
    { label: vlabel, num: true, get: (d) => d.value },
  ];

  function overview(m, nav) {
    const raw = m.raw;
    const withRefs = m.objs.filter((o) => o.refs.length).length;
    const kpis = el("div", { class: "grid kpis" }, [
      kpi("sObjects", fmtInt(m.objs.length), `${fmtInt(m.kindCounts.find((k) => k.key === "Standard")?.value || 0)} standard`),
      kpi("Fields", fmtInt(m.totalFields), `${(m.totalFields / Math.max(m.objs.length, 1)).toFixed(1)} per object`),
      kpi("Relationships", fmtInt(m.edges.length), `${fmtInt(withRefs)} objects have a typed lookup`),
      kpi("Operations", fmtInt(m.ops.length), `${new Set(m.ops.flatMap((o) => o.Faults)).size} distinct faults`),
      kpi("Enumerations", fmtInt(m.enums.length), `${fmtInt(d3.sum(m.enums, (e) => e.Values.length))} values`),
    ]);

    const kindDiv = el("div");
    App.charts.hbar(kindDiv, m.kindCounts, { label: "objects", labelWidth: 130, ariaLabel: "sObjects by kind" });

    const bins = [
      ["0", 0, 0], ["1–9", 1, 9], ["10–24", 10, 24], ["25–49", 25, 49], ["50–99", 50, 99],
      ["100–199", 100, 199], ["200–499", 200, 499], ["500+", 500, Infinity],
    ].map(([label, lo, hi]) => ({ label, value: m.objs.filter((o) => o.nFields >= lo && o.nFields <= hi).length }));
    const histDiv = el("div");
    App.charts.columns(histDiv, bins, { xLabel: "fields per object", yLabel: "objects", ariaLabel: "Objects by field count" });

    const typeData = m.types.slice(0, 14);
    const typeDiv = el("div");
    App.charts.hbar(typeDiv, typeData, { label: "fields", labelWidth: 220, ariaLabel: "Field types" });

    const topData = m.topByFields.slice(0, 15).map((o) => ({ key: o.name, value: o.nFields }));
    const topDiv = el("div");
    App.charts.hbar(topDiv, topData, { label: "fields", labelWidth: 190, onClick: (d) => nav("objects", d.key), ariaLabel: "Objects with most fields" });

    const refData = m.topReferenced.slice(0, 15).map((o) => ({ key: o.name, value: o.value }));
    const refDiv = el("div");
    App.charts.hbar(refDiv, refData, { label: "objects point here", labelWidth: 190, onClick: (d) => nav("objects", d.key), ariaLabel: "Most referenced objects" });

    const grid = el("div", { class: "grid cols-2" }, [
      card("Objects by kind", "Inferred from name suffixes (__c, __mdt, __e) and companions such as __History", withTable(kindDiv, keyCols("Kind", "Objects"), m.kindCounts)),
      card("Fields per object", "Most objects are small; a few permission objects have 900+ fields", withTable(histDiv, keyCols("Bin", "Objects"), bins.map((b) => ({ key: b.label, value: b.value })))),
      card("Field types", "Relationship fields are grouped; Id and primitive types are shown as declared", withTable(typeDiv, keyCols("Type", "Fields"), m.types.slice(0, 40))),
      card("Largest objects", "Click a bar to open the object", withTable(topDiv, keyCols("Object", "Fields"), topData)),
      card("Most referenced objects", "Distinct objects holding a typed lookup to the target. Click a bar to open it", withTable(refDiv, keyCols("Object", "Referenced by"), refData)),
    ]);
    return el("div", {}, [kpis, grid]);
  }

  function objects(m, state, nav) {
    const wrap = el("div");
    const filters = el("div", { class: "filters" });
    const search = el("input", { type: "search", placeholder: "Filter objects…", "aria-label": "Filter objects", value: state.query || "" });
    const kindSel = el("select", { "aria-label": "Kind" }, [el("option", { value: "", text: "All kinds" }),
      ...m.kindCounts.map((k) => el("option", { value: k.key, text: `${k.key} (${fmtInt(k.value)})` }))]);
    kindSel.value = state.kind || "";
    const sortSel = el("select", { "aria-label": "Sort" }, [
      el("option", { value: "name", text: "Sort: name" }),
      el("option", { value: "fields", text: "Sort: field count" }),
      el("option", { value: "inbound", text: "Sort: referenced by" }),
    ]);
    sortSel.value = state.sort || "name";
    const count = el("span", { class: "meta" });
    filters.append(search, kindSel, sortSel, count);

    const list = el("ul", { class: "list", "aria-label": "sObjects" });
    const listCard = card("sObjects", null, list);
    const detail = el("div");

    const inboundN = (o) => (m.inbound.get(o.name) || []).length;
    function renderList() {
      state.query = search.value; state.kind = kindSel.value; state.sort = sortSel.value;
      const q = search.value.trim().toLowerCase();
      let rows = m.objs.filter((o) => (!q || o.name.toLowerCase().includes(q)) && (!kindSel.value || o.kind === kindSel.value));
      const cmp = { name: (a, b) => (a.name < b.name ? -1 : 1), fields: (a, b) => b.nFields - a.nFields || (a.name < b.name ? -1 : 1), inbound: (a, b) => inboundN(b) - inboundN(a) || (a.name < b.name ? -1 : 1) }[sortSel.value];
      rows.sort(cmp);
      count.textContent = `${fmtInt(rows.length)} of ${fmtInt(m.objs.length)}`;
      const shown = rows.slice(0, 400);
      list.replaceChildren(...shown.map((o) => el("li", {}, [el("button", {
        type: "button", "aria-current": String(o.name === state.selected),
        onclick: () => { state.selected = o.name; renderList(); renderDetail(); },
      }, [el("span", { text: o.name }), el("span", { class: "count", text: sortSel.value === "inbound" ? inboundN(o) : o.nFields })])])));
      if (rows.length > shown.length) list.append(el("li", { class: "meta", text: `Showing first ${shown.length}; refine the filter.` }));
    }

    function renderDetail() {
      const o = m.byName.get(state.selected);
      if (!o) {
        detail.replaceChildren(card("Select an object", "Pick an sObject to see its fields and relationships.", el("div")));
        return;
      }
      const out = m.outbound.get(o.name) || [];
      const inn = m.inbound.get(o.name) || [];
      const graphDiv = el("div", { class: "graph-card" });
      App.charts.egoGraph(graphDiv, m, o.name, { onSelect: (n) => { state.selected = n; renderList(); renderDetail(); } });

      const fieldRows = o.fields;
      const fq = el("input", { type: "search", placeholder: "Filter fields…", "aria-label": "Filter fields" });
      const holder = el("div");
      const drawFields = () => {
        const q = fq.value.trim().toLowerCase();
        const rows = fieldRows.filter((f) => !q || f.Name.toLowerCase().includes(q) || f.Type.toLowerCase().includes(q));
        holder.replaceChildren(table([
          { label: "Field", get: (f) => f.Name, mono: true },
          { label: "Type", get: (f) => (m.byName.has(f.Type) ? el("a", { href: "#", text: f.Type, onclick: (e) => { e.preventDefault(); state.selected = f.Type; renderList(); renderDetail(); } }) : f.Type) },
          { label: "Flags", get: (f) => el("span", {}, [f.Nillable ? el("span", { class: "chip", text: "nillable" }) : null, f.Optional ? el("span", { class: "chip", text: "optional" }) : null, f.Repeated ? el("span", { class: "chip", text: "repeated" }) : null]) },
        ], rows, { maxHeight: 420 }));
      };
      fq.addEventListener("input", debounce(drawFields, 120));
      drawFields();

      const relRows = [
        ...out.map((e) => ({ dir: "References", other: e.target, fields: e.fields.join(", ") })),
        ...inn.map((e) => ({ dir: "Referenced by", other: e.source, fields: e.fields.join(", ") })),
      ];
      detail.replaceChildren(
        el("div", { class: "grid kpis" }, [
          kpi(o.kind, o.name, `${fmtInt(o.nFields)} fields`),
          kpi("References", fmtInt(out.length), "distinct objects"),
          kpi("Referenced by", fmtInt(inn.length), "distinct objects"),
          kpi("Child relationships", fmtInt(o.nChild), "QueryResult fields"),
        ]),
        card("Relationships", "Click a neighbour to re-center. Orange: this object holds a lookup to it. Green: it holds a lookup to this object.", graphDiv),
        el("div", { style: "height:16px" }),
        card("Fields", null, el("div", {}, [el("div", { class: "filters" }, [fq]), holder])),
        el("div", { style: "height:16px" }),
        relRows.length ? card("Relationship table", null, table([
          { label: "Direction", get: (r) => r.dir },
          { label: "Object", get: (r) => el("a", { href: "#", text: r.other, onclick: (e) => { e.preventDefault(); state.selected = r.other; renderList(); renderDetail(); } }) },
          { label: "Via fields", get: (r) => r.fields, mono: true },
        ], relRows, { maxHeight: 320 })) : null,
      );
    }

    search.addEventListener("input", debounce(renderList, 120));
    kindSel.addEventListener("change", renderList);
    sortSel.addEventListener("change", renderList);
    renderList();
    renderDetail();
    wrap.append(filters, el("div", { class: "split" }, [listCard, detail]));
    return wrap;
  }

  function operations(m) {
    const gDiv = el("div");
    App.charts.hbar(gDiv, m.opGroups, { label: "operations", labelWidth: 150, ariaLabel: "Operations by group" });
    const q = el("input", { type: "search", placeholder: "Filter operations…", "aria-label": "Filter operations" });
    const holder = el("div");
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      const rows = m.ops.filter((o) => !s || o.Name.toLowerCase().includes(s) || o.Documentation.toLowerCase().includes(s));
      holder.replaceChildren(table([
        { label: "Operation", get: (o) => o.Name, mono: true },
        { label: "Group", get: (o) => o.group },
        { label: "Request", get: (o) => o.RequestType, mono: true },
        { label: "Response", get: (o) => o.ResponseType, mono: true },
        { label: "Faults", get: (o) => o.Faults.join(", "), mono: true },
        { label: "Documentation", get: (o) => o.Documentation },
      ], rows, { maxHeight: 560 }));
    };
    q.addEventListener("input", debounce(draw, 120));
    draw();
    return el("div", { class: "grid" }, [
      card("Operations by group", "SOAP operations declared in the portType", withTable(gDiv, keyCols("Group", "Operations"), m.opGroups)),
      card("All operations", `${m.ops.length} operations`, el("div", {}, [el("div", { class: "filters" }, [q]), holder])),
    ]);
  }

  function enums(m) {
    const sorted = m.enums.slice().sort((a, b) => b.Values.length - a.Values.length);
    const data = sorted.slice(0, 15).map((e) => ({ key: e.Name, value: e.Values.length }));
    const div = el("div");
    App.charts.hbar(div, data, { label: "values", labelWidth: 200, ariaLabel: "Enumerations by value count" });
    return el("div", { class: "grid" }, [
      card("Largest enumerations", null, withTable(div, keyCols("Enum", "Values"), data)),
      card("All enumerations", `${m.enums.length} enumerated types`, table([
        { label: "Name", get: (e) => e.Name, mono: true },
        { label: "Values", num: true, get: (e) => e.Values.length },
        { label: "Members", get: (e) => e.Values.join(", "), mono: true },
      ], sorted, { maxHeight: 520 })),
    ]);
  }

  // Custom objects lacking a description. `map` is the loaded description export
  // (Map of API name -> text) or null; `pick` opens the file chooser for one.
  function descriptions(m, map, nav, pick) {
    const D = App.descriptions;
    const custom = m.objs.filter((o) => o.kind === "Custom object");
    if (!map) {
      return el("div", { class: "empty" }, [
        el("h2", { text: "Load object descriptions" }),
        el("p", { text: `The WSDL does not carry descriptions, so they come from a separate export. ${fmtInt(custom.length)} custom objects will be checked against it.` }),
        el("p", { class: "meta", text: "Accepts a .csv or .json with an API-name column (QualifiedApiName, ApiName, FullName, or DeveloperName) and a Description column." }),
        el("pre", { class: "snippet", text: "sf data query --use-tooling-api --result-format csv \\\n  -q \"SELECT QualifiedApiName, Description FROM EntityDefinition WHERE QualifiedApiName LIKE '%__c'\" > descriptions.csv" }),
        el("button", { class: "btn", type: "button", text: "Choose descriptions file…", onclick: pick }),
      ]);
    }

    const a = D.analyze(m, map);
    const pct = custom.length ? Math.round((a.described / custom.length) * 100) : 0;
    const kpis = el("div", { class: "grid kpis" }, [
      kpi("Custom objects", fmtInt(custom.length), "checked against the export"),
      kpi("Described", fmtInt(a.described), `${pct}% coverage`),
      kpi("Lacking a description", fmtInt(a.lacking.length), `${fmtInt(a.blank)} blank · ${fmtInt(a.missing)} not in export`),
      kpi("Unmatched export rows", fmtInt(a.unmatched), "no custom object in the WSDL"),
    ]);

    const statusData = [
      { key: D.STATUS.described, value: a.described },
      { key: D.STATUS.blank, value: a.blank },
      { key: D.STATUS.missing, value: a.missing },
    ];
    const statusDiv = el("div");
    App.charts.hbar(statusDiv, statusData, { label: "objects", labelWidth: 130, rowH: 34, ariaLabel: "Custom objects by description status" });

    const bins = [
      ["1–9", 1, 9], ["10–24", 10, 24], ["25–49", 25, 49], ["50–99", 50, 99], ["100+", 100, Infinity],
    ].map(([label, lo, hi]) => ({ label, value: a.lacking.filter((r) => r.obj.nFields >= lo && r.obj.nFields <= hi).length }));
    const histDiv = el("div");
    App.charts.columns(histDiv, bins, { xLabel: "fields per object", yLabel: "objects lacking a description", ariaLabel: "Undocumented objects by field count" });

    // Big objects without a description are the most costly to leave undocumented.
    const topData = a.lacking.slice().sort((x, y) => y.obj.nFields - x.obj.nFields).slice(0, 15)
      .map((r) => ({ key: r.obj.name, value: r.obj.nFields }));
    const topDiv = el("div");
    App.charts.hbar(topDiv, topData, { label: "fields", labelWidth: 190, onClick: (d) => nav("objects", d.key), ariaLabel: "Largest objects lacking a description" });

    const q = el("input", { type: "search", placeholder: "Filter custom objects…", "aria-label": "Filter custom objects" });
    const sel = el("select", { "aria-label": "Description status" }, [
      el("option", { value: "lacking", text: `Lacking a description (${fmtInt(a.lacking.length)})` }),
      el("option", { value: D.STATUS.blank, text: `Blank description (${fmtInt(a.blank)})` }),
      el("option", { value: D.STATUS.missing, text: `Not in export (${fmtInt(a.missing)})` }),
      el("option", { value: D.STATUS.described, text: `Has description (${fmtInt(a.described)})` }),
      el("option", { value: "all", text: `All custom objects (${fmtInt(custom.length)})` }),
    ]);
    const count = el("span", { class: "meta" });
    const holder = el("div");
    let shown = [];
    const draw = () => {
      const s = q.value.trim().toLowerCase();
      shown = a.rows.filter((r) => (sel.value === "all" || (sel.value === "lacking" ? r.status !== D.STATUS.described : r.status === sel.value))
        && (!s || r.obj.name.toLowerCase().includes(s)))
        .sort((x, y) => y.obj.nFields - x.obj.nFields || (x.obj.name < y.obj.name ? -1 : 1));
      count.textContent = `${fmtInt(shown.length)} of ${fmtInt(a.rows.length)}`;
      holder.replaceChildren(table([
        { label: "Object", get: (r) => el("a", { href: "#", text: r.obj.name, onclick: (e) => { e.preventDefault(); nav("objects", r.obj.name); } }), mono: true },
        { label: "Status", get: (r) => el("span", { class: "chip" + (r.status === D.STATUS.described ? "" : " warn"), text: r.status }) },
        { label: "Fields", num: true, get: (r) => r.obj.nFields },
        { label: "Description", get: (r) => r.text },
      ], shown, { maxHeight: 560 }));
    };
    q.addEventListener("input", debounce(draw, 120));
    sel.addEventListener("change", draw);
    draw();

    const download = el("button", {
      class: "btn small", type: "button", text: "Download as CSV",
      onclick: () => {
        const url = URL.createObjectURL(new Blob([D.toCSV(shown)], { type: "text/csv" }));
        const link = el("a", { href: url, download: "custom-objects-lacking-description.csv" });
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      },
    });
    const change = el("button", { class: "btn small", type: "button", text: "Load a different file…", onclick: pick });

    return el("div", {}, [
      kpis,
      el("div", { class: "grid cols-2" }, [
        card("Description coverage", "Custom objects (__c) by whether the export gives them a description", withTable(statusDiv, keyCols("Status", "Objects"), statusData)),
        card("Undocumented objects by size", "Fields per object, for objects lacking a description", withTable(histDiv, keyCols("Bin", "Objects"), bins.map((b) => ({ key: b.label, value: b.value })))),
        card("Largest undocumented objects", "Click a bar to open the object", withTable(topDiv, keyCols("Object", "Fields"), topData)),
      ]),
      el("div", { style: "height:16px" }),
      card("Custom objects", "Sorted by field count. The table follows the filters, and the CSV download does too.",
        el("div", {}, [el("div", { class: "filters" }, [q, sel, count, download, change]), holder])),
    ]);
  }

  App.views = { overview, objects, operations, enums, descriptions };
})(window.App);
