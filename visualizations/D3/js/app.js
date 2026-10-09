"use strict";

(function (App) {
  const { el } = App;
  const TABS = [
    ["overview", "Overview"],
    ["objects", "Objects & relationships"],
    ["operations", "Operations"],
    ["enums", "Enumerations"],
    ["descriptions", "Missing descriptions"],
    ["orgs", "Authenticated orgs"],
  ];

  const state = { model: null, tab: "overview", objects: {}, error: "", loading: false, serverFiles: [], descriptions: null, descSource: null, descLoad: { busy: false, error: "" }, orgs: { phase: "idle", data: null, error: "", busy: "" }, labelSource: null };
  const main = document.getElementById("main");
  const tabsNav = document.getElementById("tabs");
  const meta = document.getElementById("meta");
  const fileInput = document.getElementById("file-input");
  const descInput = document.getElementById("desc-input");

  function nav(tab, selectedObject) {
    if (selectedObject) state.objects.selected = selectedObject;
    state.tab = tab;
    if (tab === "orgs" && state.orgs.phase === "idle") loadOrgs();
    render();
    window.scrollTo(0, 0);
  }

  function renderTabs() {
    tabsNav.replaceChildren(...TABS.map(([id, label]) => el("button", {
      type: "button", text: label,
      "aria-current": state.tab === id ? "page" : "false",
      onclick: () => nav(id),
    })));
  }

  function renderMeta() {
    if (state.loading) { meta.textContent = `Loading ${state.loadingName}…`; return; }
    if (!state.model) { meta.textContent = "No file loaded"; return; }
    const r = state.model.raw;
    const parts = [r.ServiceName, r.ApiVersion && `API v${r.ApiVersion}`, state.fileName, r.Generated && `generated ${r.Generated}`,
      state.labelSource && `labels from ${state.labelSource.org}`].filter(Boolean);
    meta.textContent = parts.join(" · ");
  }

  function emptyState() {
    const box = el("div", { class: "empty" }, [
      el("h2", { text: state.loading ? "Parsing…" : "Load an Enterprise WSDL" }),
      el("p", { text: "Drop a .wsdl file here, or a .json file written by `wsdlparser -json`. Everything is parsed locally in your browser." }),
      state.loading ? null : el("button", { class: "btn", type: "button", text: "Choose file…", onclick: () => fileInput.click() }),
      !state.loading && state.serverFiles.length ? el("div", { class: "server-files" }, [
        el("p", { text: "Or open a file from the application's wsdl folder:" }),
        ...state.serverFiles.map((f) => el("button", { class: "btn", type: "button", text: f.name, onclick: () => loadFile(serverFile(f.name)) })),
      ]) : null,
      state.error ? el("p", { class: "error", role: "alert", text: state.error }) : null,
    ]);
    return box;
  }

  function render() {
    renderTabs();
    renderMeta();
    if (state.tab === "orgs") { main.replaceChildren(App.views.orgs(state.orgs, orgActions)); return; }
    if (!state.model) { main.replaceChildren(emptyState()); return; }
    const m = state.model;
    const view = state.tab === "overview" ? App.views.overview(m, nav)
      : state.tab === "objects" ? App.views.objects(m, state.objects, nav)
      : state.tab === "operations" ? App.views.operations(m)
      : state.tab === "descriptions" ? App.views.descriptions(m, state.descriptions, state.descSource, nav, () => descInput.click(), orgDescriptions)
      : App.views.enums(m);
    main.replaceChildren(view);
  }

  // Each load and each label fetch takes a number; only the newest may apply
  // its result, so a slow earlier request can't overwrite a later one.
  let loadSeq = 0, labelSeq = 0;

  async function loadFile(file) {
    if (!file) return;
    const seq = ++loadSeq;
    state.error = ""; state.loading = true; state.loadingName = file.name;
    if (!state.model) render(); else renderMeta();
    try {
      const raw = await App.parser.parseFile(file);
      if (seq !== loadSeq) return;
      if (!raw.SObjects.length) throw new Error("No sObjects found. Is this an Enterprise WSDL?");
      const model = App.model.build(raw);
      state.model = model;
      state.fileName = file.name;
      state.objects = { selected: model.byName.has("Account") ? "Account" : model.objs[0].name };
      state.tab = "overview";
      applyLabels();
      loadLabels();
    } catch (e) {
      if (seq !== loadSeq) return;
      // Keep any model that was already showing; it is still the user's data.
      state.error = `Could not read ${file.name}: ${e.message}`;
      if (state.model) alert(state.error);
    } finally {
      if (seq === loadSeq) { state.loading = false; render(); }
    }
  }

  // The WSDL carries no object-level label (only field values literally named
  // Label/MasterLabel on Custom Metadata Types), so labels come from the
  // default org's global describe when one is available. Swaps api name for
  // label everywhere the model is shown; falls back to the api name otherwise.
  function applyLabels() {
    if (!state.model) return;
    state.model.labelFor = (name) => (state.labels && state.labels.get(name)) || name;
  }

  async function loadLabels() {
    const seq = ++labelSeq;
    try {
      const res = await orgsCall("/labels", {});
      if (seq !== labelSeq) return;
      if (res.unavailable) return;
      state.labels = new Map(Object.entries(res.data.labels).map(([name, l]) => [name, l.label]));
      state.labelSource = { org: res.data.org };
    } catch (e) {
      // Silent: no default org, no CLI, or the org call failed. Api names stand in.
      return;
    } finally {
      if (seq === labelSeq) { applyLabels(); render(); }
    }
  }

  // Labels and org-fetched descriptions belong to one org. When the default
  // changes (set, login or logout), drop whatever came from another org and
  // fetch labels again, so a view never shows org A's data under org B.
  function syncOrgScoped(list) {
    const def = list.orgs.find((o) => o.username === list.default);
    const target = def ? (def.alias || def.username) : "";
    if (state.labelSource && state.labelSource.org !== target) {
      ++labelSeq; // an in-flight fetch for the old org must not land
      state.labels = null; state.labelSource = null;
      applyLabels();
    }
    if (state.descSource && state.descSource.kind === "org" && state.descSource.org !== target) {
      state.descriptions = null; state.descSource = null;
    }
    if (target && state.model && !state.labels) loadLabels();
  }

  async function loadDescriptions(file) {
    if (!file) return;
    try {
      state.descriptions = App.descriptions.parse(await file.text(), file.name);
      state.descSource = { kind: "file", name: file.name };
      state.descLoad.error = "";
      state.tab = "descriptions";
    } catch (e) {
      alert(`Could not read ${file.name}: ${e.message}`);
    }
    render();
  }

  // The orgs API only exists under `wsdlparser serve`; elsewhere the tab explains that.
  async function orgsCall(path, body) {
    let r;
    try {
      r = await fetch("api/orgs" + path, body === undefined
        ? { headers: { Accept: "application/json" } }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch (e) { return { unavailable: true }; }
    if (!(r.headers.get("Content-Type") || "").includes("application/json")) return { unavailable: true };
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || r.statusText);
    return { data: json };
  }

  async function orgsRun(path, body, busy) {
    const o = state.orgs;
    o.error = ""; o.busy = busy;
    render();
    try {
      const res = await orgsCall(path, body);
      if (res.unavailable) o.phase = "unavailable";
      else { o.phase = "ready"; o.data = res.data; syncOrgScoped(res.data); }
    } catch (e) {
      o.phase = o.data ? "ready" : "error";
      o.error = e.message;
    } finally {
      o.busy = "";
      render();
    }
  }

  // Descriptions straight from the default org: the server lists its custom
  // objects (sf sobject list) and looks up each Description. Needs the server.
  const orgDescriptions = {
    get load() { return state.descLoad; },
    async run() {
      const d = state.descLoad;
      d.busy = true; d.error = "";
      render();
      try {
        const res = await orgsCall("/descriptions", {});
        if (res.unavailable) throw new Error("This needs the embedded server, because only it can run the Salesforce CLI. Start it with `wsdlparser serve`.");
        state.descriptions = new Map(res.data.objects.map((o) => [o.name, o.description]));
        state.descSource = { kind: "org", org: res.data.org, command: res.data.command, count: res.data.objects.length };
      } catch (e) {
        d.error = e.message;
      } finally {
        d.busy = false;
        render();
      }
    },
  };

  function loadOrgs() {
    state.orgs.phase = "loading";
    return orgsRun("", undefined, "");
  }

  const orgActions = {
    refresh: loadOrgs,
    add: (alias, instanceUrl) => orgsRun("/login", { alias, instanceUrl }, "login"),
    remove: (username) => orgsRun("/logout", { username }, "remove"),
    setDefault: (username) => orgsRun("/default", { username }, "default"),
  };

  // A file-like object whose contents come from the embedded server (wsdlparser serve).
  function serverFile(name) {
    return {
      name,
      async text() {
        const r = await fetch("api/model?file=" + encodeURIComponent(name));
        if (!r.ok) throw new Error((await r.text()).trim() || r.statusText);
        return r.text();
      },
    };
  }

  // Under file:// or any static host there is no API; the manual loader still works.
  async function discoverServerFiles() {
    try {
      const r = await fetch("api/files", { headers: { Accept: "application/json" } });
      if (!r.ok || !(r.headers.get("Content-Type") || "").includes("application/json")) return;
      state.serverFiles = await r.json();
    } catch (e) { return; }
    if (state.serverFiles.length === 1) loadFile(serverFile(state.serverFiles[0].name));
    else if (!state.model) render();
  }

  document.getElementById("load-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { loadFile(fileInput.files[0]); fileInput.value = ""; });
  descInput.addEventListener("change", () => { loadDescriptions(descInput.files[0]); descInput.value = ""; });
  document.getElementById("theme-btn").addEventListener("click", () => { App.theme.cycle(); });

  window.addEventListener("dragover", (e) => { e.preventDefault(); main.firstElementChild?.classList.add("drag"); });
  window.addEventListener("dragleave", () => main.firstElementChild?.classList.remove("drag"));
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    main.firstElementChild?.classList.remove("drag");
    loadFile(e.dataTransfer.files[0]);
  });

  App.theme.apply();
  render();
  discoverServerFiles();
})(window.App);
