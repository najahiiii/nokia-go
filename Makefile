PROJECT_NAME := nokia
BUILD_DIR := dist
SRC := ./cmd/server
VERSION ?= dev
GIT_COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
GIT_DIRTY := $(shell test -n "$$(git status --porcelain 2>/dev/null)" && echo true || echo false)
LDFLAGS := -s -w -X main.appVersion=$(VERSION) -X main.gitCommit=$(GIT_COMMIT) -X main.gitDirty=$(GIT_DIRTY)

WEB_DIR := ./web-ui
NEXT_BUILD_DIR := $(WEB_DIR)/out
NEXT_DIST_DIR := ./templates/web

LINUX_AMD64_BIN := $(BUILD_DIR)/$(PROJECT_NAME)-linux-amd64
LINUX_ARM64_BIN := $(BUILD_DIR)/$(PROJECT_NAME)-linux-arm64

.PHONY: all clean linux linux-amd64 linux-arm64 compress-linux-amd64 compress-linux-arm64 next-setup next-build next-copy next

all: clean linux

linux: linux-amd64 linux-arm64

linux-amd64: $(LINUX_AMD64_BIN)

linux-arm64: $(LINUX_ARM64_BIN)

$(LINUX_AMD64_BIN):
	@mkdir -p $(BUILD_DIR)
	@echo "Building $@"
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags "$(LDFLAGS)" -o $@ $(SRC)
	@$(MAKE) compress-linux-amd64

$(LINUX_ARM64_BIN):
	@mkdir -p $(BUILD_DIR)
	@echo "Building $@"
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags "$(LDFLAGS)" -o $@ $(SRC)
	@$(MAKE) compress-linux-arm64

compress-linux-amd64: $(LINUX_AMD64_BIN)
	@command -v upx >/dev/null 2>&1 && upx -q --best --lzma $< > /dev/null || echo "upx not found; skipping compression for $<"

compress-linux-arm64: $(LINUX_ARM64_BIN)
	@command -v upx >/dev/null 2>&1 && upx -q --best --lzma $< > /dev/null || echo "upx not found; skipping compression for $<"

clean:
	@rm -rf $(BUILD_DIR)

next-setup:
	@if [ -d "$(WEB_DIR)" ]; then \
		npm --prefix $(WEB_DIR) install; \
	else \
		echo "Skipping $@; $(WEB_DIR) not found."; \
	fi

next-build:
	@if [ -d "$(WEB_DIR)" ]; then \
		npm --prefix $(WEB_DIR) run build; \
	else \
		echo "Skipping $@; $(WEB_DIR) not found."; \
	fi

next-copy: next-build
	@if [ -d "$(WEB_DIR)" ]; then \
		rm -rf $(NEXT_DIST_DIR); \
		mkdir -p $(NEXT_DIST_DIR); \
		cp -a $(NEXT_BUILD_DIR)/* $(NEXT_DIST_DIR)/; \
	else \
		echo "Skipping $@; $(WEB_DIR) not found."; \
	fi

next:
	@if [ -d "$(WEB_DIR)" ]; then \
		$(MAKE) next-copy; \
	else \
		echo "Skipping $@; $(WEB_DIR) not found."; \
	fi
