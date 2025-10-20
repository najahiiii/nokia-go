package templates

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed index.html assets/* script/*
var content embed.FS

var (
	indexContent []byte
	assetsFS     fs.FS
	scriptFS     fs.FS
)

func init() {
	var err error
	indexContent, err = content.ReadFile("index.html")
	if err != nil {
		panic("failed to read embedded index.html: " + err.Error())
	}

	assetsFS, err = fs.Sub(content, "assets")
	if err != nil {
		panic("failed to load embedded assets: " + err.Error())
	}

	scriptFS, err = fs.Sub(content, "script")
	if err != nil {
		panic("failed to load embedded scripts: " + err.Error())
	}
}

// Index returns the embedded index.html content.
func Index() []byte {
	return indexContent
}

// Assets returns an http.FileSystem serving embedded assets.
func Assets() http.FileSystem {
	return http.FS(assetsFS)
}

// Scripts returns an http.FileSystem serving embedded scripts.
func Scripts() http.FileSystem {
	return http.FS(scriptFS)
}
