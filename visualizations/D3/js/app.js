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

  const state = { model: null, tab: "overview", objects: {}, error: "", loading: false, serverFiles: [], descriptions: null, orgs: { phase: "idle", data: null, error: "", busy: "" } };
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
      type: "button", text: label, disabled: state.model || id === "orgs" ? null : "",
      "aria-current": state.tab === id ? "page" : "false",
      onclick: () => nav(id),
    })));
  }

  function renderMeta() {
    if (!state.model) { meta.textContent = "No file loaded"; return; }
    const r = state.model.raw;
    const parts = [r.ServiceName, r.ApiVersion && `API v${r.ApiVersion}`, state.fileName, r.Generated && `generated ${r.Generated}`].filter(Boolean);
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
      : state.tab === "descriptions" ? App.views.descriptions(m, state.descriptions, nav, () => descInput.click())
      : App.views.enums(m);
    main.replaceChildren(view);
  }

  async function loadFile(file) {
    if (!file) return;
    state.error = ""; state.loading = true; state.model = null;
    render();
    try {
      const raw = await App.parser.parseFile(file);
      if (!raw.SObjects.length) throw new Error("No sObjects found. Is this an Enterprise WSDL?");
      state.model = App.model.build(raw);
      state.fileName = file.name;
      state.objects = { selected: state.model.byName.has("Account") ? "Account" : state.model.objs[0].name };
      state.tab = "overview";
    } catch (e) {
      state.error = `Could not read ${file.name}: ${e.message}`;
    } finally {
      state.loading = false;
      render();
    }
  }

  async function loadDescriptions(file) {
    if (!file) return;
    try {
      state.descriptions = App.descriptions.parse(await file.text(), file.name);
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
      else { o.phase = "ready"; o.data = res.data; }
    } catch (e) {
      o.phase = o.data ? "ready" : "error";
      o.error = e.message;
    } finally {
      o.busy = "";
      render();
    }
  }

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
