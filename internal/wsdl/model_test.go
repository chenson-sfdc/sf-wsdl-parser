package wsdl

import (
	"reflect"
	"testing"
)

func TestBuildModel(t *testing.T) {
	def := &Definitions{
		TargetNamespace: "urn:enterprise.soap.sforce.com",
		Types: Types{
			Schemas: []Schema{
				{
					ComplexTypes: []ComplexType{
						// A real sObject: extends the abstract sObject base type.
						{
							Name: "Account",
							ComplexContent: &ComplexContent{
								Extension: &Extension{
									Base: "ens:sObject",
									Sequence: &Sequence{
										Elements: []FieldElement{
											{Name: "Name", Type: "xsd:string", Nillable: "true", MinOccurs: "0"},
											{Name: "Id", Type: "tns:ID", Nillable: "false"},
											{Name: "Contacts", Type: "ens:Contact", MaxOccurs: "unbounded"},
										},
									},
								},
							},
						},
						// Not an sObject (no complexContent/extension) -- should be skipped.
						{Name: "LoginResult", Sequence: &Sequence{}},
						// Extends something other than sObject -- should be skipped.
						{
							Name: "SomeFault",
							ComplexContent: &ComplexContent{
								Extension: &Extension{Base: "tns:ApiFault"},
							},
						},
					},
					SimpleTypes: []SimpleType{
						// A real enum.
						{
							Name: "StatusCode",
							Restriction: Restriction{
								Base: "xsd:string",
								Enumeration: []Enumeration{
									{Value: "SUCCESS"},
									{Value: "FAILURE"},
								},
							},
						},
						// Not an enum (no enumeration facet) -- should be skipped.
						{Name: "ID", Restriction: Restriction{Base: "xsd:string"}},
					},
				},
			},
		},
		Messages: []Message{
			{Name: "createRequest", Parts: []Part{{Name: "parameters", Element: "tns:create"}}},
			{Name: "createResponse", Parts: []Part{{Name: "parameters", Element: "tns:createResponse"}}},
			{Name: "emptyMessage"},
		},
		PortType: PortType{
			Operations: []Operation{
				{
					Name:          "create",
					Documentation: "Creates one or more records.",
					Input:         &OperationIO{Message: "tns:createRequest"},
					Output:        &OperationIO{Message: "tns:createResponse"},
					Faults: []OperationFault{
						{Name: "UnexpectedErrorFault", Message: "tns:UnexpectedErrorFault"},
					},
				},
				// References a message with no parts and one with no match --
				// both should resolve to empty request/response types rather
				// than panicking.
				{
					Name:  "noop",
					Input: &OperationIO{Message: "tns:emptyMessage"},
				},
				{
					Name:  "ghost",
					Input: &OperationIO{Message: "tns:doesNotExist"},
				},
			},
		},
		Service: Service{
			Name: "SforceService",
			Ports: []Port{
				{Name: "Soap", Address: SoapAddress{Location: "https://login.salesforce.com/services/Soap/c/60.0"}},
			},
		},
	}

	m := BuildModel(def)

	if m.TargetNamespace != "urn:enterprise.soap.sforce.com" {
		t.Errorf("TargetNamespace = %q", m.TargetNamespace)
	}
	if m.ServiceName != "SforceService" {
		t.Errorf("ServiceName = %q", m.ServiceName)
	}
	if m.EndpointURL != "https://login.salesforce.com/services/Soap/c/60.0" {
		t.Errorf("EndpointURL = %q", m.EndpointURL)
	}

	// Only Account should have been picked up as an sObject.
	if len(m.SObjects) != 1 {
		t.Fatalf("len(SObjects) = %d, want 1 (%+v)", len(m.SObjects), m.SObjects)
	}
	account := m.SObjects[0]
	if account.Name != "Account" {
		t.Errorf("SObjects[0].Name = %q, want Account", account.Name)
	}
	wantFields := []Field{
		{Name: "Contacts", Type: "Contact", Repeated: true},
		{Name: "Id", Type: "ID"},
		{Name: "Name", Type: "string", Nillable: true, Optional: true},
	}
	if !reflect.DeepEqual(account.Fields, wantFields) {
		t.Errorf("Account.Fields = %+v, want %+v", account.Fields, wantFields)
	}

	// Only StatusCode should have been picked up as an enum.
	if len(m.Enums) != 1 {
		t.Fatalf("len(Enums) = %d, want 1 (%+v)", len(m.Enums), m.Enums)
	}
	if m.Enums[0].Name != "StatusCode" || !reflect.DeepEqual(m.Enums[0].Values, []string{"SUCCESS", "FAILURE"}) {
		t.Errorf("Enums[0] = %+v", m.Enums[0])
	}

	if len(m.Operations) != 3 {
		t.Fatalf("len(Operations) = %d, want 3 (%+v)", len(m.Operations), m.Operations)
	}
	byName := map[string]OperationSummary{}
	for _, op := range m.Operations {
		byName[op.Name] = op
	}
	create := byName["create"]
	if create.RequestType != "create" || create.ResponseType != "createResponse" {
		t.Errorf("create op = %+v", create)
	}
	if len(create.Faults) != 1 || create.Faults[0] != "UnexpectedErrorFault" {
		t.Errorf("create.Faults = %+v", create.Faults)
	}
	// A message with no parts, and a message reference that doesn't exist at
	// all, must both resolve to "" rather than panicking BuildModel.
	if noop := byName["noop"]; noop.RequestType != "" {
		t.Errorf("noop.RequestType = %q, want empty", noop.RequestType)
	}
	if ghost := byName["ghost"]; ghost.RequestType != "" {
		t.Errorf("ghost.RequestType = %q, want empty", ghost.RequestType)
	}
}

func TestBuildModelEmptyDefinitions(t *testing.T) {
	// A Definitions with nothing in it should produce an empty, non-nil
	// Model rather than panicking.
	m := BuildModel(&Definitions{})
	if len(m.SObjects) != 0 || len(m.Enums) != 0 || len(m.Operations) != 0 {
		t.Errorf("BuildModel(empty) = %+v, want all-empty", m)
	}
}

func TestFieldFromElement(t *testing.T) {
	cases := []struct {
		name string
		el   FieldElement
		want Field
	}{
		{
			name: "plain required scalar",
			el:   FieldElement{Name: "Name", Type: "xsd:string"},
			want: Field{Name: "Name", Type: "string"},
		},
		{
			name: "nillable optional scalar",
			el:   FieldElement{Name: "Description", Type: "xsd:string", Nillable: "true", MinOccurs: "0"},
			want: Field{Name: "Description", Type: "string", Nillable: true, Optional: true},
		},
		{
			name: "unbounded relationship",
			el:   FieldElement{Name: "Contacts", Type: "ens:Contact", MaxOccurs: "unbounded"},
			want: Field{Name: "Contacts", Type: "Contact", Repeated: true},
		},
		{
			name: "explicit maxOccurs greater than one",
			el:   FieldElement{Name: "Lines", Type: "ens:OrderItem", MaxOccurs: "5"},
			want: Field{Name: "Lines", Type: "OrderItem", Repeated: true},
		},
		{
			name: "maxOccurs of exactly one is not repeated",
			el:   FieldElement{Name: "Owner", Type: "ens:User", MaxOccurs: "1"},
			want: Field{Name: "Owner", Type: "User"},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := fieldFromElement(c.el)
			if got != c.want {
				t.Errorf("fieldFromElement(%+v) = %+v, want %+v", c.el, got, c.want)
			}
		})
	}
}

func TestIsGreaterThanOne(t *testing.T) {
	cases := map[string]bool{
		"":          false,
		"0":         false,
		"1":         false,
		"2":         true,
		"unbounded": true,
	}
	for maxOccurs, want := range cases {
		if got := isGreaterThanOne(maxOccurs); got != want {
			t.Errorf("isGreaterThanOne(%q) = %v, want %v", maxOccurs, got, want)
		}
	}
}
