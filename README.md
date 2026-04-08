# Modbus Tester

A desktop Modbus TCP testing tool built with [Tauri v2](https://tauri.app), React, and TypeScript. Connect to real PLCs or test against the built-in simulator — all from a single native app.

![Modbus Tester](src-tauri/icons/icon-macos-rounded.png)

---

## Features

- **Device sidebar** — add and connect to any number of Modbus TCP devices simultaneously
- **Discovery mode** — read and write coils, discrete inputs, holding and input registers across configurable address ranges (0–65535), with live polling down to 100 ms
- **Watchlist mode** — pin specific addresses for continuous monitoring, also with fast polling
- **Probe mode** — an always-on-top floating window that sequentially toggles coils so you can identify physical actuators (valves, relays) by ear; mark any coil to add it to the watchlist automatically
- **Simulator** — a fully functional Modbus TCP server embedded in the app, available as a resizable dock panel or a standalone pop-out window; set individual coils and registers and test against real clients
- **Persistence** — devices, watchlists, and simulator register state are saved automatically and restored on next launch
- **Network scanner** — scan an IP range to discover Modbus devices on the network

---

## Requirements

### Runtime
| Tool | Minimum version |
|------|----------------|
| macOS | 11 (Big Sur) |
| Windows | 10 (64-bit) |

### Development
| Tool | Notes |
|------|-------|
| [Rust](https://rustup.rs) | Stable toolchain (`rustup update stable`) |
| [Node.js](https://nodejs.org) | v18 or newer |
| [Tauri prerequisites](https://tauri.app/start/prerequisites/) | Platform-specific system libraries |

On macOS, Xcode Command Line Tools are required:
```sh
xcode-select --install
```

On Windows, the [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and WebView2 (ships with Windows 10/11) are required.

---

## Getting started

```sh
# Clone
git clone https://github.com/your-username/modbus_tester.git
cd modbus_tester

# Install JS dependencies
npm install

# Start the development build (hot-reload)
npm run tauri dev
```

The app window opens automatically. The Rust backend recompiles on save (first compile takes ~1–2 min; subsequent ones are fast).

---

## Bundling for distribution

### macOS (.dmg + .app)

```sh
npm run tauri build
```

Output: `src-tauri/target/release/bundle/macos/Modbus Tester.app`  
Disk image: `src-tauri/target/release/bundle/dmg/Modbus Tester_*.dmg`

**Signing & notarisation** (required for distribution outside the App Store):

```sh
# Set these in your environment or a .env file (never commit credentials)
export APPLE_CERTIFICATE="Developer ID Application: Your Name (TEAMID)"
export APPLE_CERTIFICATE_PASSWORD="keychain-password"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="YOURTEAMID"

npm run tauri build
```

Tauri will sign and submit for notarisation automatically when those variables are present. See the [Tauri code signing docs](https://tauri.app/distribute/sign/macos/) for full details.

---

### Windows (.msi + .exe installer)

Cross-compiling from macOS is not supported by Tauri for the Windows target. Build on a Windows machine or a Windows CI runner (e.g. GitHub Actions `windows-latest`).

```powershell
npm run tauri build
```

Output:  
- MSI installer: `src-tauri\target\release\bundle\msi\Modbus Tester_*.msi`  
- NSIS installer: `src-tauri\target\release\bundle\nsis\Modbus Tester_*.exe`

**Code signing** (optional, removes Windows SmartScreen warnings):

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = "path\to\private.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "key-password"
npm run tauri build
```

See the [Tauri Windows signing docs](https://tauri.app/distribute/sign/windows/) for certificate setup.

---

### GitHub Actions (CI)

A minimal multi-platform workflow — create `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: universal-apple-darwin
            args: --target universal-apple-darwin
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            args: ''

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin  # for universal build
      - run: npm ci
      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'Modbus Tester ${{ github.ref_name }}'
          args: ${{ matrix.args }}
```

---

## Project structure

```
modbus_tester/
├── src/                        # React + TypeScript frontend
│   ├── components/
│   │   ├── DeviceSidebar/      # Device list, add dialog, network scanner
│   │   ├── DiscoveryMode/      # Read/write tables + probe mode launcher
│   │   ├── ProbeWindow/        # Always-on-top coil probe floating window
│   │   ├── SimulatorPanel/     # Embedded Modbus simulator UI
│   │   └── WatchlistMode/      # Pinned register watchlist
│   ├── lib/api.ts              # Typed wrappers around Tauri invoke calls
│   ├── store/useAppStore.ts    # Zustand global state
│   └── types/index.ts          # Shared TypeScript types
├── src-tauri/                  # Rust backend (Tauri v2)
│   ├── src/
│   │   ├── commands.rs         # Device read/write/persistence commands
│   │   ├── persistence.rs      # JSON file I/O for devices, watchlists, simulator
│   │   ├── scanner.rs          # Async TCP port scanner
│   │   ├── sim_commands.rs     # Simulator Tauri commands
│   │   └── simulator.rs        # tokio-modbus TCP server
│   ├── capabilities/
│   │   └── default.json        # Tauri window permissions
│   └── icons/                  # All icon sizes (generated)
└── package.json
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Shell | Tauri v2 |
| Frontend | React 18, TypeScript 5, Vite 6 |
| Styling | Tailwind CSS v3 |
| State | Zustand v5 |
| Virtualisation | TanStack Virtual v3 |
| Backend | Rust (tokio async runtime) |
| Modbus | tokio-modbus 0.14 |
| Persistence | JSON files via `tauri::path::app_data_dir` |

---

## License

MIT
