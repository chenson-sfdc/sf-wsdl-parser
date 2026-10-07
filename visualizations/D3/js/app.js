"use strict";

(function (App) {
  const { el } = App;
  const TABS = [
    ["overview", "Overview"],
    ["objects", "Objects & relationships"],
    ["operations", "Operations"],
    ["enums", "Enumerations"],
  ];

  const state = { model: null, tab: "overview", objects: {}, error: "", loading: false };
  const main = document.getElementById("main");
  const tabsNav = document.getElementById("tabs");
  const meta = document.getElementById("meta");
  const fileInput = document.getElementById("file-input");

  function nav(tab, selectedObject) {
    if (selectedObject) state.objects.selected = selectedObject;
    state.tab = tab;
    render();
    window.scrollTo(0, 0);
  }

  function renderTabs() {
    tabsNav.replaceChildren(...TABS.map(([id, label]) => el("button", {
      type: "button", text: label, disabled: state.model ? null : "",
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
      state.error ? el("p", { class: "error", role: "alert", text: state.error }) : null,
    ]);
    return box;
  }

  function render() {
    renderTabs();
    renderMeta();
    if (!state.model) { main.replaceChildren(emptyState()); return; }
    const m = state.model;
    const view = state.tab === "overview" ? App.views.overview(m, nav)
      : state.tab === "objects" ? App.views.objects(m, state.objects, nav)
      : state.tab === "operations" ? App.views.operations(m)
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

  document.getElementById("load-btn").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { loadFile(fileInput.files[0]); fileInput.value = ""; });
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
})(window.App);
