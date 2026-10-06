// Package report renders a wsdl.Model as either a human-readable terminal
// summary or a machine-readable JSON document.
package report

import (
	"encoding/json"
	"fmt"
	"io"

	"wsdlparser/internal/wsdl"
)

// WriteSummary prints a human-readable overview of the model to w: service
// endpoint, counts, the largest sObjects by field count, and the operation
// list. It intentionally doesn't dump every field of every sObject -- that
// output belongs in the JSON report (see WriteJSON) where it's structured
// and greppable.
func WriteSummary(w io.Writer, m *wsdl.Model) {
	fmt.Fprintf(w, "Service:         %s\n", valueOr(m.ServiceName, "(unnamed)"))
	fmt.Fprintf(w, "Endpoint:        %s\n", valueOr(m.EndpointURL, "(none)"))
	fmt.Fprintf(w, "Namespace:       %s\n", valueOr(m.TargetNamespace, "(none)"))
	fmt.Fprintf(w, "sObjects:        %d\n", len(m.SObjects))
	fmt.Fprintf(w, "Enumerated types: %d\n", len(m.Enums))
	fmt.Fprintf(w, "Operations:      %d\n", len(m.Operations))

	fmt.Fprintln(w)
	fmt.Fprintln(w, "Top sObjects by field count:")
	top := topSObjectsByFieldCount(m.SObjects, 15)
	for _, obj := range top {
		fmt.Fprintf(w, "  %-40s %d fields\n", obj.Name, len(obj.Fields))
	}

	fmt.Fprintln(w)
	fmt.Fprintln(w, "Operations:")
	for _, op := range m.Operations {
		fmt.Fprintf(w, "  %-28s request=%-28s response=%-28s faults=%d\n",
			op.Name, valueOr(op.RequestType, "-"), valueOr(op.ResponseType, "-"), len(op.Faults))
	}
}

// WriteJSON writes the full model as indented JSON to w.
func WriteJSON(w io.Writer, m *wsdl.Model) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(m)
}

func topSObjectsByFieldCount(objects []wsdl.SObject, n int) []wsdl.SObject {
	sorted := make([]wsdl.SObject, len(objects))
	copy(sorted, objects)
	// Simple selection sort is fine here: n is small (<=15) and this runs
	// once per report, so an O(len*n) partial sort beats pulling in sort
	// machinery for a one-shot "top K" pass.
	for i := 0; i < n && i < len(sorted); i++ {
		maxIdx := i
		for j := i + 1; j < len(sorted); j++ {
			if len(sorted[j].Fields) > len(sorted[maxIdx].Fields) {
				maxIdx = j
			}
		}
		sorted[i], sorted[maxIdx] = sorted[maxIdx], sorted[i]
	}
	if n > len(sorted) {
		n = len(sorted)
	}
	return sorted[:n]
}

func valueOr(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
