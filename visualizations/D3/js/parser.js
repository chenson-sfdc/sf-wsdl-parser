"use strict";

// Parses a Salesforce Enterprise WSDL (or the JSON written by `wsdlparser -json`)
// into the same shape the Go tool emits:
// { TargetNamespace, ServiceName, EndpointURL, ApiVersion, Packages, SObjects, Enums, Operations }
(function (App) {
  const XSD = "http://www.w3.org/2001/XMLSchema";
  const WSDL = "http://schemas.xmlsoap.org/wsdl/";

  const localName = (s) => (s || "").replace(/^.*:/, "");

  function kids(node, ns, name) {
    const out = [];
    for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
      if (c.localName === name && c.namespaceURI === ns) out.push(c);
    }
    return out;
  }

  function first(node, ns, name) {
    for (let c = node.firstElementChild; c; c = c.nextElementSibling) {
      if (c.localName === name && c.namespaceURI === ns) return c;
    }
    return null;
  }

  function parseHeaderComment(text) {
    const head = text.slice(0, 4000);
    const ver = head.match(/API Version\s+([\d.]+)/i);
    const gen = head.match(/Generated on\s+([^\n]+?)\.?\s*$/m);
    const packages = [];
    const re = /^(.+?)\s+\(Version:\s*([^,]+),\s*Namespace:\s*([^)]+)\)/gm;
    let m;
    while ((m = re.exec(head))) packages.push({ Name: m[1].trim(), Version: m[2].trim(), Namespace: m[3].trim() });
    return { ApiVersion: ver ? ver[1] : "", Generated: gen ? gen[1].trim() : "", Packages: packages };
  }

  function parseWsdl(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const err = doc.getElementsByTagName("parsererror")[0];
    if (err) throw new Error("Not well-formed XML: " + err.textContent.slice(0, 160));
    const defs = doc.documentElement;
    if (defs.localName !== "definitions" || defs.namespaceURI !== WSDL) {
      throw new Error("Root element is not a WSDL <definitions>");
    }

    const model = Object.assign(
      {
        TargetNamespace: defs.getAttribute("targetNamespace") || "",
        ServiceName: "",
        EndpointURL: "",
        SObjects: [],
        Enums: [],
        Operations: [],
      },
      parseHeaderComment(text)
    );

    const types = first(defs, WSDL, "types");
    const schemas = types ? kids(types, XSD, "schema") : [];

    for (const schema of schemas) {
      for (const ct of kids(schema, XSD, "complexType")) {
        const ext = (() => {
          const cc = first(ct, XSD, "complexContent");
          return cc ? first(cc, XSD, "extension") : null;
        })();
        if (!ext || localName(ext.getAttribute("base")) !== "sObject") continue;
        const seq = first(ext, XSD, "sequence");
        const fields = [];
        if (seq) {
          for (const e of kids(seq, XSD, "element")) {
            const max = e.getAttribute("maxOccurs");
            fields.push({
              Name: e.getAttribute("name"),
              Type: localName(e.getAttribute("type")),
              Nillable: e.getAttribute("nillable") === "true",
              Repeated: max === "unbounded" || (max !== null && !["", "0", "1"].includes(max)),
              Optional: e.getAttribute("minOccurs") === "0",
            });
          }
        }
        fields.sort((a, b) => (a.Name < b.Name ? -1 : a.Name > b.Name ? 1 : 0));
        model.SObjects.push({ Name: ct.getAttribute("name"), Fields: fields });
      }

      for (const st of kids(schema, XSD, "simpleType")) {
        const r = first(st, XSD, "restriction");
        if (!r) continue;
        const values = kids(r, XSD, "enumeration").map((e) => e.getAttribute("value"));
        if (values.length) model.Enums.push({ Name: st.getAttribute("name"), Values: values });
      }
    }

    const messages = new Map();
    for (const m of kids(defs, WSDL, "message")) {
      const part = first(m, WSDL, "part");
      messages.set(m.getAttribute("name"), part ? localName(part.getAttribute("element") || part.getAttribute("type")) : "");
    }
    const resolve = (n) => (n ? messages.get(localName(n.getAttribute("message"))) || "" : "");

    const portType = first(defs, WSDL, "portType");
    if (portType) {
      for (const op of kids(portType, WSDL, "operation")) {
        const doc1 = first(op, WSDL, "documentation");
        model.Operations.push({
          Name: op.getAttribute("name"),
          Documentation: doc1 ? doc1.textContent.trim() : "",
          RequestType: resolve(first(op, WSDL, "input")),
          ResponseType: resolve(first(op, WSDL, "output")),
          Faults: kids(op, WSDL, "fault").map((f) => f.getAttribute("name")),
        });
      }
    }

    const service = first(defs, WSDL, "service");
    if (service) {
      model.ServiceName = service.getAttribute("name") || "";
      const port = first(service, WSDL, "port");
      const addr = port && Array.from(port.children).find((c) => c.localName === "address");
      model.EndpointURL = addr ? addr.getAttribute("location") || "" : "";
    }

    const byName = (a, b) => (a.Name < b.Name ? -1 : a.Name > b.Name ? 1 : 0);
    model.SObjects.sort(byName);
    model.Enums.sort(byName);
    model.Operations.sort(byName);
    return model;
  }

  function parseJson(text) {
    const m = JSON.parse(text);
    if (!m || !Array.isArray(m.SObjects)) throw new Error("JSON is not wsdlparser output (no SObjects array)");
    m.SObjects.forEach((o) => { o.Fields = o.Fields || []; });
    m.Enums = (m.Enums || []).map((e) => ({ ...e, Values: e.Values || [] }));
    m.Operations = (m.Operations || []).map((o) => ({ ...o, Faults: o.Faults || [] }));
    m.Packages = m.Packages || [];
    return m;
  }

  async function parseFile(file) {
    const text = await file.text();
    const t = text.trimStart();
    // Yield so the "Parsing…" state can paint before the synchronous work.
    await new Promise((r) => setTimeout(r, 20));
    return t.startsWith("{") ? parseJson(text) : parseWsdl(text);
  }

  App.parser = { parseFile, parseWsdl, parseJson };
})(window.App);
