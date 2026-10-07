"use strict";

window.App = window.App || {};

(function (App) {
  const fmtInt = d3.format(",d");
  const fmtCompact = d3.format(".3~s");

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of [].concat(children || [])) {
      if (c == null) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function card(title, subtitle, body, extra) {
    const head = el("div", { class: "card-head" }, [
      el("div", {}, [
        el("h2", { text: title }),
        subtitle ? el("p", { class: "sub", text: subtitle }) : null,
      ]),
      extra || null,
    ]);
    return el("section", { class: "card" }, [head, body]);
  }

  const tip = {
    node: null,
    show(event, lines) {
      const t = tip.node || (tip.node = document.getElementById("tooltip"));
      t.replaceChildren();
      lines.forEach((l, i) => {
        const row = el("div", { class: "row" });
        if (typeof l === "string") {
          row.append(i === 0 ? el("strong", { text: l }) : document.createTextNode(l));
        } else {
          row.append(el("strong", { text: l.value }), document.createTextNode(l.label));
        }
        t.append(row);
      });
      t.hidden = false;
      tip.move(event);
    },
    move(event) {
      const t = tip.node;
      if (!t || t.hidden) return;
      const pad = 14;
      const r = t.getBoundingClientRect();
      let x = event.clientX + pad;
      let y = event.clientY + pad;
      if (x + r.width > window.innerWidth - 8) x = event.clientX - r.width - pad;
      if (y + r.height > window.innerHeight - 8) y = event.clientY - r.height - pad;
      t.style.left = Math.max(8, x) + "px";
      t.style.top = Math.max(8, y) + "px";
    },
    hide() {
      if (tip.node) tip.node.hidden = true;
    },
    // Keyboard focus shows the same readout, anchored to the mark.
    showForFocus(target, lines) {
      const b = target.getBoundingClientRect();
      tip.show({ clientX: b.right, clientY: b.top }, lines);
    },
  };

  const THEMES = ["auto", "light", "dark"];
  const theme = {
    current() {
      return localStorage.getItem("wsdl-theme") || "auto";
    },
    apply() {
      const t = theme.current();
      if (t === "auto") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", t);
      const btn = document.getElementById("theme-btn");
      if (btn) btn.textContent = "Theme: " + t;
    },
    cycle() {
      const next = THEMES[(THEMES.indexOf(theme.current()) + 1) % THEMES.length];
      localStorage.setItem("wsdl-theme", next);
      theme.apply();
    },
  };

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function debounce(fn, ms) {
    let h;
    return (...a) => {
      clearTimeout(h);
      h = setTimeout(() => fn(...a), ms);
    };
  }

  Object.assign(App, { fmtInt, fmtCompact, el, card, tip, theme, cssVar, debounce });
})(window.App);
