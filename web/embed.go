// Package web embeds the built Enterprise WSDL Explorer single-page app (the
// SvelteKit project in this directory) so the wsdlparser binary can serve it.
// Run `npm ci && npm run build` here first; build.sh does that.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:build
var build embed.FS

// FS is the built app, rooted so index.html is at the top level.
var FS fs.FS = func() fs.FS {
	sub, err := fs.Sub(build, "build")
	if err != nil {
		panic(err)
	}
	return sub
}()
