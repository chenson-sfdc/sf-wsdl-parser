package wsdl

import "testing"

func TestLocalName(t *testing.T) {
	cases := map[string]string{
		"tns:ID":          "ID",
		"ens:sObject":     "sObject",
		"string":          "string",
		"":                "",
		"a:b:c":           "c",
		"trailing-colon:": "",
	}
	for qname, want := range cases {
		if got := localName(qname); got != want {
			t.Errorf("localName(%q) = %q, want %q", qname, got, want)
		}
	}
}
