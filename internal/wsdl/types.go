// Package wsdl defines the subset of the WSDL 1.1 / XML Schema object model
// needed to parse a Salesforce Enterprise WSDL: the <types> section (XSD
// complex/simple types describing sObjects and API request/response shapes),
// <message>, <portType>, <binding>, and <service>.
//
// Field matching relies on encoding/xml's rule that a struct tag with no
// namespace prefix matches an element by local name regardless of its XML
// namespace. Salesforce WSDLs mix several namespaces (tns/ens/fns) across
// <schema> blocks, so matching by local name only keeps this simple.
package wsdl

import "encoding/xml"

// Definitions is the root <definitions> (aka wsdl:definitions) element.
type Definitions struct {
	XMLName         xml.Name  `xml:"definitions"`
	TargetNamespace string    `xml:"targetNamespace,attr"`
	Types           Types     `xml:"types"`
	Messages        []Message `xml:"message"`
	PortType        PortType  `xml:"portType"`
	Binding         Binding   `xml:"binding"`
	Service         Service   `xml:"service"`
}

// Types holds one or more <schema> blocks.
type Types struct {
	Schemas []Schema `xml:"schema"`
}

// Schema is a single XSD <schema> block within <types>.
type Schema struct {
	TargetNamespace string        `xml:"targetNamespace,attr"`
	ComplexTypes    []ComplexType `xml:"complexType"`
	SimpleTypes     []SimpleType  `xml:"simpleType"`
	Elements        []Element     `xml:"element"`
}

// ComplexType is an XSD <complexType>, either a flat <sequence> of fields or
// a <complexContent><extension base="..."> of another type (how Salesforce
// models every sObject as an extension of the abstract "sObject" type).
type ComplexType struct {
	Name           string          `xml:"name,attr"`
	Sequence       *Sequence       `xml:"sequence"`
	ComplexContent *ComplexContent `xml:"complexContent"`
}

// ComplexContent wraps an <extension>.
type ComplexContent struct {
	Extension *Extension `xml:"extension"`
}

// Extension is <extension base="...">, carrying the base type name and any
// additional fields declared in its own <sequence>.
type Extension struct {
	Base     string    `xml:"base,attr"`
	Sequence *Sequence `xml:"sequence"`
}

// Sequence is an XSD <sequence>, a list of field elements.
type Sequence struct {
	Elements []FieldElement `xml:"element"`
	Any      []Any          `xml:"any"`
}

// Any represents a wildcard <any> placeholder (used by e.g. AggregateResult).
type Any struct {
	Namespace string `xml:"namespace,attr"`
}

// FieldElement is one field/property inside a <sequence>, e.g.
//
//	<element name="Name" type="xsd:string" nillable="true" minOccurs="0"/>
type FieldElement struct {
	Name      string `xml:"name,attr"`
	Type      string `xml:"type,attr"`
	Nillable  string `xml:"nillable,attr"`
	MinOccurs string `xml:"minOccurs,attr"`
	MaxOccurs string `xml:"maxOccurs,attr"`
}

// SimpleType is an XSD <simpleType>, typically a <restriction> with either a
// base type (ID, QueryLocator, ...) or an enumeration of allowed values.
type SimpleType struct {
	Name        string      `xml:"name,attr"`
	Restriction Restriction `xml:"restriction"`
}

// Restriction is <restriction base="...">, holding the base type plus any
// facets: enumerated values, string length/pattern constraints.
type Restriction struct {
	Base        string        `xml:"base,attr"`
	Enumeration []Enumeration `xml:"enumeration"`
	Pattern     *Facet        `xml:"pattern"`
	Length      *Facet        `xml:"length"`
}

// Enumeration is one <enumeration value="..."/> facet.
type Enumeration struct {
	Value string `xml:"value,attr"`
}

// Facet is a generic single-valued restriction facet (pattern, length, ...).
type Facet struct {
	Value string `xml:"value,attr"`
}

// Element is a top-level <element name="..."> declaration, used for the
// request/response envelopes of each SOAP operation (e.g. "login",
// "loginResponse"). Salesforce declares these with an inline <complexType>.
type Element struct {
	Name        string       `xml:"name,attr"`
	Type        string       `xml:"type,attr"`
	ComplexType *ComplexType `xml:"complexType"`
}

// Message is a WSDL <message>, referencing a schema element via <part>.
type Message struct {
	Name  string `xml:"name,attr"`
	Parts []Part `xml:"part"`
}

// Part is <part name="..." element="..."/> (or type="...").
type Part struct {
	Name    string `xml:"name,attr"`
	Element string `xml:"element,attr"`
	Type    string `xml:"type,attr"`
}

// PortType is the WSDL <portType>, a collection of SOAP operations.
type PortType struct {
	Name       string      `xml:"name,attr"`
	Operations []Operation `xml:"operation"`
}

// Operation is one <operation> within a <portType>: an input/output message
// pair plus zero or more named faults.
type Operation struct {
	Name          string           `xml:"name,attr"`
	Documentation string           `xml:"documentation"`
	Input         *OperationIO     `xml:"input"`
	Output        *OperationIO     `xml:"output"`
	Faults        []OperationFault `xml:"fault"`
}

// OperationIO is <input message="..."/> or <output message="..."/>.
type OperationIO struct {
	Message string `xml:"message,attr"`
}

// OperationFault is <fault message="..." name="..."/>.
type OperationFault struct {
	Name    string `xml:"name,attr"`
	Message string `xml:"message,attr"`
}

// Binding is the WSDL <binding>, mapping portType operations onto SOAP.
type Binding struct {
	Name       string             `xml:"name,attr"`
	Type       string             `xml:"type,attr"`
	Operations []BindingOperation `xml:"operation"`
}

// BindingOperation is one <operation> within a <binding>.
type BindingOperation struct {
	Name string `xml:"name,attr"`
}

// Service is the WSDL <service>, exposing one or more <port> endpoints.
type Service struct {
	Name  string `xml:"name,attr"`
	Ports []Port `xml:"port"`
}

// Port is <port name="..." binding="...">, carrying the SOAP address.
type Port struct {
	Name    string      `xml:"name,attr"`
	Binding string      `xml:"binding,attr"`
	Address SoapAddress `xml:"address"`
}

// SoapAddress is the SOAP binding's <soap:address location="..."/>.
type SoapAddress struct {
	Location string `xml:"location,attr"`
}
