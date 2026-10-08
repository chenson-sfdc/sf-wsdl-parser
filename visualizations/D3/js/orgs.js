"use strict";

// The Authenticated orgs tab. The data comes from the embedded server, which
// runs the Salesforce CLI (`sf auth list`, `sf org login web`, `sf org logout`,
// `sf config set target-org`); a browser page can't run those itself.
(function (App) {
  const { el, card } = App;

  const COLUMNS = [
    { label: "Default" },
    { label: "Alias" },
    { label: "Username" },
    { label: "Type" },
    { label: "Instance URL" },
    { label: "Status" },
    { label: "" },
  ];

  const orgType = (o) => [o.isDevHub && "Dev Hub", o.isScratchOrg ? "Scratch" : o.isSandbox ? "Sandbox" : "Production"].filter(Boolean).join(", ");

  // D3 draws the table: one row per org, one cell per column.
  function drawTable(container, st, act) {
    const data = st.data;
    const disabled = st.busy ? "" : null;
    const table = d3.select(container).append("div").attr("class", "table-scroll").append("table").attr("aria-label", "Authenticated orgs");
    table.append("thead").append("tr").selectAll("th").data(COLUMNS).join("th").text((c) => c.label);

    table.append("tbody").selectAll("tr").data(data.orgs, (o) => o.username).join("tr")
      .selectAll("td").data((o) => COLUMNS.map((c, i) => ({ i, o }))).join("td")
      .each(function ({ i, o }) {
        const td = d3.select(this);
        switch (i) {
          case 0:
            td.append("input").attr("type", "radio").attr("name", "default-org")
              .attr("aria-label", `Use ${o.alias || o.username} as the default org`)
              .property("checked", o.username === data.default)
              .attr("disabled", disabled)
              .on("change", () => act.setDefault(o.username));
            break;
          case 1: td.text(o.alias || "—"); break;
          case 2: td.attr("class", "mono").text(o.username); break;
          case 3: td.text(orgType(o)); break;
          case 4: td.attr("class", "mono").text(o.instanceUrl || "—"); break;
          case 5:
            if (o.username === data.default) td.append("span").attr("class", "chip").text("default");
            if (o.expired) td.append("span").attr("class", "chip warn").text("expired");
            break;
          default:
            td.append("button").attr("type", "button").attr("class", "btn small")
              .attr("disabled", disabled)
              .attr("aria-label", `Remove ${o.alias || o.username}`)
              .text("Remove")
              .on("click", () => {
                if (confirm(`Log out of ${o.alias || o.username}?\n\nThis removes the CLI's stored authorization for ${o.username}. The org itself is not affected.`)) act.remove(o.username);
              });
        }
      });
  }

  function addForm(st, act) {
    const alias = el("input", { type: "text", placeholder: "Alias (optional)", "aria-label": "Alias for the new org", maxlength: "64", autocomplete: "off" });
    const url = el("input", { type: "url", placeholder: "https://test.salesforce.com (optional)", "aria-label": "Instance URL", autocomplete: "off", size: "34" });
    const button = el("button", { class: "btn", type: "submit", text: st.busy === "login" ? "Waiting for browser…" : "Add an org", disabled: st.busy ? "" : null });
    const form = el("form", { class: "filters", onsubmit: (e) => { e.preventDefault(); act.add(alias.value.trim(), url.value.trim()); } }, [alias, url, button]);
    return el("div", {}, [
      form,
      el("p", { class: "meta", text: st.busy === "login"
        ? "A browser window opened on this machine. Finish logging in there; this page updates when you do."
        : "Opens a browser window to log in. Leave the instance URL empty for production, or use your sandbox / My Domain URL." }),
    ]);
  }

  function orgs(st, act) {
    const refresh = el("button", { class: "btn small", type: "button", text: "Refresh", disabled: st.busy || st.phase === "loading" ? "" : null, onclick: act.refresh });
    const body = el("div");

    if (st.phase === "unavailable") {
      body.append(el("p", { text: "This tab needs the embedded server, because only it can run the Salesforce CLI. Start it with `wsdlparser serve` and use the page it opens." }));
    } else if (st.phase === "idle" || st.phase === "loading") {
      body.append(el("p", { class: "meta", text: "Loading authenticated orgs…" }));
    } else {
      if (st.error) body.append(el("p", { class: "error", role: "alert", text: st.error }));
      if (st.data) {
        if (st.data.orgs.length) {
          const holder = el("div");
          drawTable(holder, st, act);
          body.append(holder);
          if (!st.data.default) body.append(el("p", { class: "meta", text: "No default org is set. Pick one with the radio button." }));
        } else {
          body.append(el("p", { class: "empty-note", text: "No authenticated orgs exist. Use “Add an org” to log in to one." }));
        }
        body.append(el("div", { style: "height:16px" }), addForm(st, act));
      }
    }

    return el("div", { class: "grid" }, [
      card("Authenticated orgs", "Read from the Salesforce CLI (sf auth list). The default org is the CLI's target-org.", body, refresh),
    ]);
  }

  Object.assign(App.views, { orgs });
})(window.App);
