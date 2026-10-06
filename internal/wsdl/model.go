package wsdl

import "sort"

// Model is a flattened, easier-to-consume view over Definitions: sObjects
// resolved from their <extension base="...sObject"> complex types, enums
// resolved from <simpleType> restrictions, and SOAP operations resolved
// through their message/part/element indirection.
type Model struct {
	TargetNamespace string
	SObjects        []SObject
	Enums           []Enum
	Operations      []OperationSummary
	ServiceName     string
	EndpointURL     string
}

// SObject is one Salesforce object definition: its API name and the fields
// declared directly on it (fields inherited from the abstract base sObject
// type -- fieldsToNull, Id -- are intentionally omitted; every sObject has
// them implicitly).
type SObject struct {
	Name   string
	Fields []Field
}

// Field is one field on an sObject, with its XSD type reduced to a local
// name (e.g. "ens:sObject" -> "sObject") and occurrence/nillability flags
// normalized to booleans.
type Field struct {
	Name     string
	Type     string
	Nillable bool
	Repeated bool // maxOccurs > 1 / "unbounded"
	Optional bool // minOccurs="0"
}

// Enum is a <simpleType> restricted to an enumerated set of string values.
type Enum struct {
	Name   string
	Values []string
}

// OperationSummary is one SOAP operation with its request/response element
// names resolved (through <portType> -> <message> -> <part element="...">)
// instead of the raw WSDL message indirection.
type OperationSummary struct {
	Name          string
	Documentation string
	RequestType   string
	ResponseType  string
	Faults        []string
}

// BuildModel reduces a parsed Definitions into a Model.
func BuildModel(def *Definitions) *Model {
	m := &Model{TargetNamespace: def.TargetNamespace}

	complexTypes := map[string]ComplexType{}
	for _, schema := range def.Types.Schemas {
		for _, ct := range schema.ComplexTypes {
			complexTypes[ct.Name] = ct
		}
	}

	simpleTypes := map[string]SimpleType{}
	for _, schema := range def.Types.Schemas {
		for _, st := range schema.SimpleTypes {
			simpleTypes[st.Name] = st
		}
	}

	elements := map[string]Element{}
	for _, schema := range def.Types.Schemas {
		for _, el := range schema.Elements {
			elements[el.Name] = el
		}
	}

	for name, ct := range complexTypes {
		if ct.ComplexContent == nil || ct.ComplexContent.Extension == nil {
			continue
		}
		if localName(ct.ComplexContent.Extension.Base) != "sObject" {
			continue
		}
		obj := SObject{Name: name}
		seq := ct.ComplexContent.Extension.Sequence
		if seq != nil {
			for _, el := range seq.Elements {
				obj.Fields = append(obj.Fields, fieldFromElement(el))
			}
		}
		sort.Slice(obj.Fields, func(i, j int) bool { return obj.Fields[i].Name < obj.Fields[j].Name })
		m.SObjects = append(m.SObjects, obj)
	}
	sort.Slice(m.SObjects, func(i, j int) bool { return m.SObjects[i].Name < m.SObjects[j].Name })

	for name, st := range simpleTypes {
		if len(st.Restriction.Enumeration) == 0 {
			continue
		}
		enum := Enum{Name: name}
		for _, v := range st.Restriction.Enumeration {
			enum.Values = append(enum.Values, v.Value)
		}
		m.Enums = append(m.Enums, enum)
	}
	sort.Slice(m.Enums, func(i, j int) bool { return m.Enums[i].Name < m.Enums[j].Name })

	messagesByName := map[string]Message{}
	for _, msg := range def.Messages {
		messagesByName[msg.Name] = msg
	}

	resolveMessageType := func(messageRef string) string {
		msg, ok := messagesByName[localName(messageRef)]
		if !ok || len(msg.Parts) == 0 {
			return ""
		}
		part := msg.Parts[0]
		if part.Element != "" {
			return localName(part.Element)
		}
		return localName(part.Type)
	}

	for _, op := range def.PortType.Operations {
		summary := OperationSummary{
			Name:          op.Name,
			Documentation: op.Documentation,
		}
		if op.Input != nil {
			summary.RequestType = resolveMessageType(op.Input.Message)
		}
		if op.Output != nil {
			summary.ResponseType = resolveMessageType(op.Output.Message)
		}
		for _, f := range op.Faults {
			summary.Faults = append(summary.Faults, f.Name)
		}
		m.Operations = append(m.Operations, summary)
	}
	sort.Slice(m.Operations, func(i, j int) bool { return m.Operations[i].Name < m.Operations[j].Name })

	m.ServiceName = def.Service.Name
	if len(def.Service.Ports) > 0 {
		m.EndpointURL = def.Service.Ports[0].Address.Location
	}

	return m
}

func fieldFromElement(el FieldElement) Field {
	return Field{
		Name:     el.Name,
		Type:     localName(el.Type),
		Nillable: el.Nillable == "true",
		Repeated: el.MaxOccurs == "unbounded" || isGreaterThanOne(el.MaxOccurs),
		Optional: el.MinOccurs == "0",
	}
}

func isGreaterThanOne(maxOccurs string) bool {
	switch maxOccurs {
	case "", "0", "1":
		return false
	default:
		return true
	}
}
