import { describe, expect, it } from 'vitest';
import { analyze, parse, parseCSV, STATUS, toCSV } from './descriptions';
import { WSDL } from './fixture';
import { build } from './model';
import { parseFile, parseJson, parseWsdl } from './parser';

describe('parseWsdl', () => {
	const raw = parseWsdl(WSDL);

	it('reads header, service and endpoint', () => {
		expect(raw.ApiVersion).toBe('62.0');
		expect(raw.Generated).toBe('2026-01-02 03:04:05');
		expect(raw.ServiceName).toBe('SforceService');
		expect(raw.EndpointURL).toContain('/62.0');
		expect(raw.Packages[0]).toMatchObject({ Name: 'Core', Version: '62.0' });
	});

	it('reads sObjects with sorted fields', () => {
		expect(raw.SObjects.map((o) => o.Name)).toEqual(['Account', 'Contact', 'Gadget__c', 'Widget__History', 'Widget__c']);
		expect(raw.SObjects[0].Fields.map((f) => f.Name)).toEqual(['Contacts', 'Name', 'OwnerId']);
	});

	it('reads enums and operations', () => {
		expect(raw.Enums).toEqual([{ Name: 'Color', Values: ['red', 'blue'] }]);
		expect(raw.Operations[0]).toMatchObject({ Name: 'query', RequestType: 'query', ResponseType: 'queryResponse', Faults: ['InvalidQueryLocatorFault'] });
	});

	it('rejects malformed and non-WSDL input', () => {
		expect(() => parseWsdl('<a>')).toThrow(/well-formed/);
		expect(() => parseWsdl('<root/>')).toThrow(/definitions/);
	});

	it('round-trips through JSON', () => {
		expect(parseJson(JSON.stringify(raw)).SObjects).toHaveLength(5);
		expect(() => parseJson('{}')).toThrow(/SObjects/);
		expect(parseJson('{"SObjects":[{"Name":"A"}]}').SObjects[0].Fields).toEqual([]);
	});

	it('picks the parser from content', async () => {
		const file = (text: string) => ({ name: 'x', text: async () => text });
		expect((await parseFile(file(WSDL))).SObjects).toHaveLength(5);
		expect((await parseFile(file(' ' + JSON.stringify(raw)))).SObjects).toHaveLength(5);
	});
});

describe('build', () => {
	const m = build(parseWsdl(WSDL));
	const kind = (n: string) => m.byName.get(n)?.kind;

	it('classifies objects', () => {
		expect(kind('Account')).toBe('Standard');
		expect(kind('Widget__c')).toBe('Custom object');
		expect(kind('Widget__History')).toBe('History');
	});

	it('derives typed edges, ignoring self references', () => {
		expect(m.edges.map((e) => `${e.source}→${e.target}`).sort()).toEqual(['Contact→Account', 'Widget__c→Account']);
		expect(m.inbound.get('Account')).toHaveLength(2);
		expect(m.topReferenced[0]).toMatchObject({ name: 'Account', value: 2 });
	});

	it('counts field kinds and operation groups', () => {
		expect(m.types.find((t) => t.key === 'Child relationship (QueryResult)')?.value).toBe(1);
		expect(m.types.find((t) => t.key === 'Typed reference')?.value).toBe(2);
		expect(m.opGroups).toEqual([{ key: 'Query & search', value: 1 }]);
		expect(m.totalFields).toBe(7);
	});
});

describe('descriptions', () => {
	const m = build(parseWsdl(WSDL));

	it('parses CSV with quotes and embedded newlines', () => {
		expect(parseCSV('a,b\r\n"x,1","l1\nl2"\r\n')).toEqual([['a', 'b'], ['x,1', 'l1\nl2']]);
	});

	it('parses CSV and sf-style JSON', () => {
		const csv = 'QualifiedApiName,Description\nWidget__c,Makes widgets\nGadget__c,\n';
		expect(parse(csv, 'd.csv').get('Widget__c')).toBe('Makes widgets');
		const json = JSON.stringify({ result: { records: [{ DeveloperName: 'Widget', Description: ' hi ' }] } });
		expect(parse(json, 'd.json').get('Widget')).toBe('hi');
		expect(() => parse('QualifiedApiName\nX\n', 'd.csv')).toThrow(/Description/);
		expect(() => parse('Foo,Description\n1,2\n', 'd.csv')).toThrow(/API name/);
	});

	it('finds custom objects lacking a description', () => {
		const a = analyze(m, parse('QualifiedApiName,Description\nWidget__c,Makes widgets\nGadget__c,\nOld__c,x\n', 'd.csv'));
		expect(a.described).toBe(1);
		expect(a.blank).toBe(1);
		expect(a.lacking.map((r) => r.obj.name)).toEqual(['Gadget__c']);
		expect(a.unmatched).toBe(1);
	});

	it('matches the suffix-less DeveloperName form', () => {
		const a = analyze(m, parse('DeveloperName,Description\nWidget,Yes\n', 'd.csv'));
		expect(a.rows.find((r) => r.obj.name === 'Widget__c')?.status).toBe(STATUS.described);
		expect(a.missing).toBe(1);
	});

	it('writes CSV that spreadsheets cannot run as formulas', () => {
		const a = analyze(m, new Map());
		a.rows[0] = { ...a.rows[0], obj: { ...a.rows[0].obj, name: '=HYPERLINK("x")' } };
		const csv = toCSV(a.rows);
		expect(csv.split('\r\n')[0]).toBe('ApiName,Status,Fields');
		expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
	});
});
