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

```sh
go build ./cmd/server
```

For static cross compile example:

```sh
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o bin/nokia-router ./cmd/server
```

Using the provided Makefile (outputs live in `dist/`):

```sh
make linux                      # build both amd64 + arm64 (version defaults to "dev")
make linux VERSION=v1.0.1       # build with custom version tag
make linux-amd64 VERSION=v1.0.1 # single target
make clean                      # remove dist/
```

If `upx` is on your PATH, binaries are compressed automatically (fallback is to skip compression).

`make` injects git metadata automatically, so binaries print `nokia-VERSION-HASH` (and `-dirty` if the worktree has changes).

Run:

```sh
./bin/nokia-router setup [-config path]   # generate config then exit
./bin/nokia-router run   [-config path]   # start web server
./bin/nokia-router version                # show version
```

## Runtime Experience

- The dashboard auto-loads configuration and supports _live hot reload_: saving via the web UI writes to `config.json` and restarts the HTTP listener with the new host/port without a manual restart.
- Configuration can be edited from the UI (gear icon). Success and error states show toast notifications so you always know when the service is reloading or if something failed.
- Renew WAN IP (button or refresh icon) cycles APN profiles and reports outcome via toast notifications.
- Reboot command also surfaces its progress via toast notifications; no more modal blocking the screen.

## Service Integration

- An OpenWrt init script template lives in `services/nokia`. Update the binary path if you install the service under a different location, then copy it to `/etc/init.d/nokia`, `chmod 755`, and run:

  ```sh
  /etc/init.d/nokia enable
  /etc/init.d/nokia start
  ```

- The script respects `$HOME` so config defaults to `${HOME}/.config/nokia/config.json` on OpenWrt as well.

## License

This project is licensed under the [Apache License](LICENSE), Version 2.0.

See [NOTICE](NOTICE) for attribution details.
