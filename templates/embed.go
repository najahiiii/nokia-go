package templates

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

//go:embed web/**
var content embed.FS

var (
	nextIndex    []byte
	nextFS       fs.FS
	nextStaticFS fs.FS
)

func init() {
	var err error

	nextFS, err = fs.Sub(content, "web")
	if err != nil {
		panic("failed to load embedded next build: " + err.Error())
	}

	nextStaticFS, err = fs.Sub(nextFS, "_next")
	if err != nil {
		panic("failed to locate _next assets: " + err.Error())
	}

	nextIndex, err = NextPage("index")
	if err != nil {
		panic("failed to read embedded next index.html: " + err.Error())
	}
}

// NextIndex returns the embedded Next.js index page.
func NextIndex() []byte {
	return nextIndex
}

// Next returns an http.FileSystem serving the Next.js exported assets.
func Next() http.FileSystem {
	return http.FS(nextFS)
}

// NextStatic returns an http.FileSystem serving the Next.js static assets under _next/.
func NextStatic() http.FileSystem {
	return http.FS(nextStaticFS)
}

// NextPage returns the rendered HTML file for a given Next.js route name.
// The name can be provided with or without a ".html" suffix or leading slash.
func NextPage(name string) ([]byte, error) {
	trimmed := strings.Trim(strings.TrimSpace(name), "/")
	if trimmed == "" {
		trimmed = "index"
	}
	if !strings.HasSuffix(trimmed, ".html") {
		trimmed += ".html"
	}
	return content.ReadFile(path.Join("web", trimmed))
}
