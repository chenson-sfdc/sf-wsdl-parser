// The shape `wsdlparser -json` writes, and that the browser parser reproduces.
export interface Field {
	Name: string;
	Type: string;
	Nillable: boolean;
	Repeated: boolean;
	Optional: boolean;
}

export interface SObject {
	Name: string;
	Fields: Field[];
}

export interface Enum {
	Name: string;
	Values: string[];
}

export interface Operation {
	Name: string;
	Documentation: string;
	RequestType: string;
	ResponseType: string;
	Faults: string[];
}

export interface Package {
	Name: string;
	Version: string;
	Namespace: string;
}

export interface Raw {
	TargetNamespace: string;
	ServiceName: string;
	EndpointURL: string;
	ApiVersion: string;
	Generated: string;
	Packages: Package[];
	SObjects: SObject[];
	Enums: Enum[];
	Operations: Operation[];
}

// Anything with a name and readable text: a File, or a file served by `wsdlparser serve`.
export interface TextSource {
	name: string;
	text(): Promise<string>;
}
