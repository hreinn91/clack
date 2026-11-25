# Desktop app

[← README](../README.md) · [All docs](../README.md#documentation)

Clack also comes as a desktop app for macOS, Windows and Linux, built with
[Tauri](https://tauri.app) in `desktop/`. It is a native window onto a Clack server:
it shows the server's own web app, exactly as a browser does, so the browser keeps
working beside it, from this computer or another device, and both see the same chats,
notes and drafts. The app is small (about 4 MB on a Mac) because it uses the system's
own web view instead of shipping a browser.

**Which server.** When it opens, the app goes to the server it used last,
`http://localhost:4317` the first time. If nothing answers there, it says so and offers:

- **Connect** to another address: this computer on another port, or a Clack server
  elsewhere on your network (`http://homeserver.local:4317`).
- **Start Clack on this computer** (for a `localhost` address): the app starts the
  server from your Clack folder with the Node.js installed on this computer (24 or
  newer), exactly as `npm start` would, on the port of the address, and opens it once
  it answers. The folder is found by itself when the app was built from it; otherwise
  **Choose…** it. It needs `npm install` and `npm run build` run in it first, and says
  so when they are missing. Tick **Start it by itself when the app opens** to skip the
  question next time. A server the app started stops when the app quits; one you
  started yourself is left alone.

On this computer the app signs in by itself, with the token the server keeps
(`CLACK_TOKEN` in the folder's `.env`, or `~/.config/clack/token`). For a server
elsewhere it shows the usual sign-in page once.

**Server menu.** **Change Server…** (Cmd/Ctrl+Shift+L) goes back to the choice of
server, **Open in Browser** (Cmd/Ctrl+Shift+O) opens the same server in your browser,
and **Reload** (Cmd/Ctrl+R) reloads the page.

**Zoom.** Cmd/Ctrl and **+** (or **=**) zooms in, Cmd/Ctrl and **-** zooms out, and
Cmd/Ctrl+0 goes back to actual size, in steps from 50% to 300% as in a browser. The same
three are in the **View** menu. The zoom is remembered for next time.

**Differences from a browser tab:**

- Links in replies open in your browser. Pictures from the server open in a window of
  the app.
- Downloads (note exports, diagram pictures) go to your Downloads folder, and a note at
  the bottom of the window offers **Show in Finder** (or **Show in folder**).
- On a `localhost` address the page counts as secure, so diagrams' **Copy image**
  works there.
- The theme, sidebar width and other layout choices are kept per app, separately from
  your browser's; chats, notes and drafts live on the server and are shared.
- The window remembers its size and place, and opening the app again brings its
  window forward instead of starting a second one.
- A web view is the system's own: Safari's engine on macOS, Edge's on Windows, and
  WebKitGTK on Linux. A Linux distribution with an old WebKitGTK may draw some parts
  of the page plainly.

**Building it.** It needs [Rust](https://rustup.rs) and, on Linux, the WebKitGTK
development packages (`libwebkit2gtk-4.1-dev`, `librsvg2-dev`; see Tauri's
[prerequisites](https://tauri.app/start/prerequisites/)). Then:

```bash
cd desktop && npm install && cd ..
npm run desktop          # run it from source
npm run desktop:build    # build the installer for this computer
```

The installer lands in `desktop/src-tauri/target/release/bundle/` (`.app` and `.dmg` on
a Mac, `.msi` and `.exe` on Windows, `.deb`, `.rpm` and `.AppImage` on Linux). Each
platform is built on that platform; the **Desktop app** workflow in
`.github/workflows/desktop.yml` builds all three on GitHub when run from the Actions
tab or when a `desktop-v*` tag is pushed. The builds are not code-signed, so the first
start asks for confirmation: on a Mac, right-click the app and choose **Open**; on
Windows, choose **More info** and **Run anyway**.

The desktop app is not part of the npm workspaces, so the server, the web app and the
Docker image build without Rust.
