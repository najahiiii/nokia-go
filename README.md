# Nokia Router Dashboard (Go)

> [!note]
> _Do something. If it doesn't work, do something else. No idea is too crazy._</br>
**Jim Hightower**, _The New York Times, March 9, 1986_.

## Configuration

- Copy `config.example.json` to `config.json` and adjust values.
- Command line flag `-config` selects alternate file.
- Environment variables (`ROUTER_HOSTNAME`, `ROUTER_USERNAME`, `ROUTER_PASSWORD`, `HOST`, `PORT`) override config fields.
- Defaults applied if still unspecified: host `192.168.0.1`, user `admin`, password `6fa6e262c3`, listen `0.0.0.0:5000`.

## Build

Manual

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bin/nokia ./cmd/server
```

Using the provided Makefile (outputs live in `dist/`):

```sh
make linux                      # build both amd64 + arm64
make linux VERSION=v1.0.1       # build with custom version tag
make linux-amd64 VERSION=v1.0.1 # single target
make clean                      # remove dist/
```

If `upx` is on your PATH, binaries are compressed automatically (fallback is to skip compression).
`make` injects git metadata automatically, so binaries print `nokia-VERSION-HASH` (and `-dirty` if the worktree has changes).
Run:

```sh
./bin/nokia setup [-config path]   # generate config then exit
./bin/nokia run   [-config path]   # start web server
./bin/nokia version                # show version
```

## Runtime Experience

- The dashboard auto-loads configuration and supports _live hot reload_: saving via the web UI writes to `config.json` and restarts the HTTP listener with the new host/port without a manual restart.
- Configuration can be edited from the UI (gear icon). Success and error states show toast notifications so you always know when the service is reloading or if something failed.
- Renew WAN IP (button or refresh icon) cycles APN profiles and reports outcome via toast notifications.
- Reboot command also surfaces its progress via toast notifications; no more modal blocking the screen.

## Initial CLI Setup

If you build/run the project manually:

```sh
# writes ~/.config/nokia/config.json with defaults path
./bin/nokia setup
# start using the generated config
./bin/nokia run
# Setup with custom config path
./bin/nokia setup -config /etc/nokia/config.json
# Start using the generated custom config path
./bin/nokia run -config /etc/nokia/config.json
# Inspect version info
./bin/nokia version
```

### Configuration Flow

The application merges configuration from multiple sources in this order:

1. **Defaults** (see `internal/config/config.go`) seed sensible values for router address, credentials, and HTTP listen address.
2. **File**: the JSON at the resolved config path (defaults to `${HOME}/.config/nokia/config.json`, overridable via `-config` flag) overwrites the defaults.
3. **Environment variables**: the following keys take precedence over file values when set (whitespace is trimmed):
   - `ROUTER_HOSTNAME`
   - `ROUTER_USERNAME`
   - `ROUTER_PASSWORD`
   - `HOST` (HTTP listen address)
   - `PORT` (HTTP listen port)
4. **Fallback cleanup**: after merge we ensure every field is populated—if any value ends up blank it is replaced by the default again.
Running `setup` simply ensures the config file exists by materialising the defaults on disk (without overriding existing values). Subsequent edits—either manual or via the web UI—will be picked up the next time you invoke `run`, and the UI hot-reloads the service after each save.

> [!tip]
> After the daemon starts you can manage configuration from the web UI by visiting `http://<LISTEN_HOST>:<LISTEN_PORT>` (defaults to `http://127.0.0.1:5000` on the CLI or `http://<router-ip>:5000` on OpenWrt). Saving changes in the UI writes to the config file and automatically restarts the service. If you change either `ListenHost` or `ListenPort`, reconnect using the new address.

## Service Integration

- An OpenWrt init script template lives in `services/nokia`. Update the binary path if you install the service under a different location, then copy it to `/etc/init.d/nokia`, `chmod 755`, and run:

  ```sh
  /etc/init.d/nokia enable
  /etc/init.d/nokia start
  ```

- The script respects `$HOME` so config defaults to `${HOME}/.config/nokia/config.json` on OpenWrt as well.

## OpenWrt Packages

- CI publishes `.ipk` artifacts for OpenWrt v23.05.5 (`aarch64_generic`) to <https://repo.najahi.dev/pkg/nokia-go/>.
- To track the feed directly from your router:

  ```sh
  echo "src/gz nokia https://repo.najahi.dev/pkg/nokia-go/aarch64_generic" \
    | sudo tee /etc/opkg/customfeeds.conf
  opkg update
  opkg install luci-app-nokia-go
  ```

- After installation the binary is placed at `/usr/sbin/nokia` and managed via `/etc/init.d/nokia`.

### Running the Service

```sh
# start automatically on boot
/etc/init.d/nokia enable
# launch the daemon now with default config file ~/.config/nokia/config.json
/etc/init.d/nokia start
# You can also restart/stop when needed
/etc/init.d/nokia restart
/etc/init.d/nokia stop
```

> [!tip]
> The OpenWrt init script runs the daemon as `nokia run --config /root/.config/nokia/config.json`. If that file is missing, the binary will generate it automatically (same behaviour as the CLI `setup` command) before binding the HTTP server.</br>
> Once it is up, browse to `http://<router-ip>:5000` to tweak settings via the web UI.</br>
> Remember to update the URL whenever you change the listener.

## License

This project is licensed under the [Apache License](LICENSE), Version 2.0.

See [NOTICE](NOTICE) for attribution details.
