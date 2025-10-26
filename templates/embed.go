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
	switch {
	case trimmed == "":
		trimmed = "index.html"
	case strings.HasSuffix(trimmed, "/"):
		trimmed = strings.TrimSuffix(trimmed, "/") + "/index.html"
	default:
		if !strings.Contains(path.Base(trimmed), ".") {
			trimmed += ".html"
		}
	}
	return NextFile(trimmed)
}

// NextFile returns the embedded asset content for a given path relative to the exported Next build.
func NextFile(name string) ([]byte, error) {
	clean := path.Clean("/" + name)
	clean = strings.TrimPrefix(clean, "/")
	if clean == "" {
		clean = "index.html"
	}
	return content.ReadFile(path.Join("web", clean))
}
