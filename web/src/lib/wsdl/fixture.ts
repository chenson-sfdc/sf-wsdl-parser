// A trimmed Enterprise WSDL with the structures the parser reads.
export const WSDL = `<?xml version="1.0" encoding="UTF-8"?>
<!--
 Salesforce.com Enterprise Web Services API Version 62.0
 Generated on 2026-01-02 03:04:05.
 Core (Version: 62.0, Namespace: urn:enterprise.soap.sforce.com)
-->
<definitions xmlns="http://schemas.xmlsoap.org/wsdl/" xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:tns="urn:enterprise.soap.sforce.com" targetNamespace="urn:enterprise.soap.sforce.com">
  <types>
    <schema xmlns="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:sobject.enterprise.soap.sforce.com">
      <complexType name="Account"><complexContent><extension base="ens:sObject"><sequence>
        <element name="Name" type="xsd:string" nillable="true" minOccurs="0"/>
        <element name="OwnerId" type="tns:ID" minOccurs="0"/>
        <element name="Contacts" type="tns:QueryResult" nillable="true" minOccurs="0"/>
      </sequence></extension></complexContent></complexType>
      <complexType name="Contact"><complexContent><extension base="ens:sObject"><sequence>
        <element name="AccountId" type="Account" nillable="true" minOccurs="0"/>
      </sequence></extension></complexContent></complexType>
      <complexType name="Widget__c"><complexContent><extension base="ens:sObject"><sequence>
        <element name="Size__c" type="xsd:double" nillable="true" minOccurs="0"/>
        <element name="Parent__c" type="Account" nillable="true" minOccurs="0"/>
      </sequence></extension></complexContent></complexType>
      <complexType name="Widget__History"><complexContent><extension base="ens:sObject"><sequence>
        <element name="ParentId" type="tns:ID" minOccurs="0"/>
      </sequence></extension></complexContent></complexType>
      <complexType name="Gadget__c"><complexContent><extension base="ens:sObject"><sequence/></extension></complexContent></complexType>
      <simpleType name="Color"><restriction base="xsd:string"><enumeration value="red"/><enumeration value="blue"/></restriction></simpleType>
    </schema>
  </types>
  <message name="queryRequest"><part name="parameters" element="tns:query"/></message>
  <message name="queryResponse"><part name="parameters" element="tns:queryResponse"/></message>
  <portType name="Soap">
    <operation name="query">
      <documentation>Runs a SOQL query.</documentation>
      <input message="tns:queryRequest"/><output message="tns:queryResponse"/>
      <fault name="InvalidQueryLocatorFault" message="tns:x"/>
    </operation>
  </portType>
  <service name="SforceService"><port name="Soap" binding="tns:SoapBinding"><address location="https://login.salesforce.com/services/Soap/c/62.0"/></port></service>
</definitions>`;
