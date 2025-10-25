package templates

import (
	"embed"
	"io/fs"
	"net/http"
)

//go:embed *.html assets/* script/*.min.js
var content embed.FS

var (
	indexContent  []byte
	reportContent []byte
	assetsFS      fs.FS
	scriptFS      fs.FS
)

func init() {
	var err error
	indexContent, err = content.ReadFile("index.html")
	if err != nil {
		panic("failed to read embedded index.html: " + err.Error())
	}

	reportContent, err = content.ReadFile("report.html")
	if err != nil {
		panic("failed to read embedded report.html: " + err.Error())
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

// Report returns the embedded usage report page.
func Report() []byte {
	return reportContent
}

// Assets returns an http.FileSystem serving embedded assets.
func Assets() http.FileSystem {
	return http.FS(assetsFS)
}

// Scripts returns an http.FileSystem serving embedded scripts.
func Scripts() http.FileSystem {
	return http.FS(scriptFS)
}
