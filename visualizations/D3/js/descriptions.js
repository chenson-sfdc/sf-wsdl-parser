"use strict";

// Loads an object-description export and finds the custom objects that lack one.
// The WSDL carries no sObject descriptions, so they come from a separate file:
// JSON from `sf data query --json` (or any array of records) or a CSV, with an
// API-name column and a Description column.
(function (App) {
  const NAME_KEYS = ["qualifiedapiname", "apiname", "fullname", "developername", "sobjecttype", "name", "object"];
  const DESC_KEY = "description";

  // Minimal RFC 4180 reader: quoted fields, doubled quotes, newlines inside quotes.
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((v) => v.trim() !== ""));
  }

  function recordsFromJSON(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.records)) return data.records;
    if (data && data.result) return recordsFromJSON(data.result);
    throw new Error("JSON must be an array of records, or an sf CLI result with a records array.");
  }

  function recordsFromCSV(text) {
    const [head, ...body] = parseCSV(text);
    if (!head) throw new Error("The CSV is empty.");
    return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
  }

  // Returns Map(apiName -> trimmed description, "" when blank).
  function parse(text, fileName) {
    text = text.replace(/^﻿/, "");
    const records = /\.csv$/i.test(fileName) || !/^\s*[[{]/.test(text) ? recordsFromCSV(text) : recordsFromJSON(JSON.parse(text));
    const map = new Map();
    let sawDescription = false;
    for (const rec of records) {
      const lower = {};
      for (const [k, v] of Object.entries(rec || {})) lower[k.toLowerCase()] = v;
      const nameKey = NAME_KEYS.find((k) => typeof lower[k] === "string" && lower[k].trim());
      if (DESC_KEY in lower) sawDescription = true;
      if (!nameKey) continue;
      const d = lower[DESC_KEY];
      map.set(lower[nameKey].trim(), typeof d === "string" ? d.trim() : "");
    }
    if (!map.size) throw new Error("No records with an API name found. Expected a column such as QualifiedApiName.");
    // Without a Description column every object would look undocumented.
    if (!sawDescription) throw new Error("No Description column found.");
    return map;
  }

  // EntityDefinition.DeveloperName omits the __c suffix, so accept both forms.
  function lookup(map, name) {
    if (map.has(name)) return { name, text: map.get(name) };
    const stem = name.replace(/__c$/, "");
    if (stem !== name && map.has(stem)) return { name: stem, text: map.get(stem) };
    return null;
  }

  const STATUS = { described: "Has description", blank: "Blank description", missing: "Not in export" };

  function analyze(m, map) {
    const used = new Set();
    const rows = m.objs.filter((o) => o.kind === "Custom object").map((o) => {
      const hit = lookup(map, o.name);
      if (hit) used.add(hit.name);
      const status = !hit ? STATUS.missing : hit.text ? STATUS.described : STATUS.blank;
      return { obj: o, status, text: hit ? hit.text : "" };
    });
    const count = (s) => rows.filter((r) => r.status === s).length;
    const lacking = rows.filter((r) => r.status !== STATUS.described);
    return {
      rows, lacking,
      described: count(STATUS.described),
      blank: count(STATUS.blank),
      missing: count(STATUS.missing),
      // Export entries that match no custom object in the WSDL.
      unmatched: Array.from(map.keys()).filter((k) => !used.has(k)).length,
    };
  }

  const csvCell = (v) => (/[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);

  function toCSV(rows) {
    const lines = [["ApiName", "Status", "Fields"].join(",")];
    for (const r of rows) lines.push([r.obj.name, r.status, r.obj.nFields].map((v) => csvCell(String(v))).join(","));
    return lines.join("\r\n") + "\r\n";
  }

  App.descriptions = { parse, analyze, toCSV, STATUS };
})(window.App);
