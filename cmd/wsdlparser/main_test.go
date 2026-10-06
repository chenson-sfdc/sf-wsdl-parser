package main

import (
	"reflect"
	"testing"
)

func TestReorderFlagsFirst(t *testing.T) {
	cases := []struct {
		name string
		args []string
		want []string
	}{
		{
			name: "flag before path, equals form",
			args: []string{"-json=out.json", "enterprise.wsdl"},
			want: []string{"-json=out.json", "enterprise.wsdl"},
		},
		{
			name: "path before flag, space form",
			args: []string{"enterprise.wsdl", "-json", "out.json"},
			want: []string{"-json", "out.json", "enterprise.wsdl"},
		},
		{
			name: "path before flag, equals form",
			args: []string{"enterprise.wsdl", "-json=out.json"},
			want: []string{"-json=out.json", "enterprise.wsdl"},
		},
		{
			name: "no flags",
			args: []string{"enterprise.wsdl"},
			want: []string{"enterprise.wsdl"},
		},
		{
			name: "flag with stdout sentinel value",
			args: []string{"enterprise.wsdl", "-json", "-"},
			want: []string{"-json", "-", "enterprise.wsdl"},
		},
		{
			name: "double-dash stops flag parsing",
			args: []string{"-json", "out.json", "--", "-weird-but-positional.wsdl"},
			want: []string{"-json", "out.json", "-weird-but-positional.wsdl"},
		},
		{
			name: "unknown flag without a registered value still consumes only itself",
			args: []string{"enterprise.wsdl", "-verbose"},
			want: []string{"-verbose", "enterprise.wsdl"},
		},
		{
			name: "empty input",
			args: []string{},
			want: nil,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := reorderFlagsFirst(c.args)
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("reorderFlagsFirst(%#v) = %#v, want %#v", c.args, got, c.want)
			}
		})
	}
}
