package wsdl

import (
	"encoding/xml"
	"fmt"
	"os"
)

// Parse reads and unmarshals the WSDL document at path.
func Parse(path string) (*Definitions, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading WSDL file: %w", err)
	}

	var def Definitions
	if err := xml.Unmarshal(data, &def); err != nil {
		return nil, fmt.Errorf("parsing WSDL XML: %w", err)
	}
	return &def, nil
}

// localName strips a namespace prefix (e.g. "tns:ID" -> "ID") so type
// references can be looked up against the maps built by Model, which are
// keyed by local name only.
func localName(qname string) string {
	for i := len(qname) - 1; i >= 0; i-- {
		if qname[i] == ':' {
			return qname[i+1:]
		}
	}
	return qname
}
