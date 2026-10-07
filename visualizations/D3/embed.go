// Package d3 embeds the Enterprise WSDL Explorer single-page app so the
// wsdlparser binary can serve it. The SPA itself needs no Go and also runs
// straight from disk.
package d3

import "embed"

//go:embed index.html css js vendor
var FS embed.FS
