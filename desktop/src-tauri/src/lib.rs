//! Clack's desktop app: a native window onto a Clack server. The window shows
//! the server's own web app, exactly as a browser would, so the browser keeps
//! working beside it. A small launcher page, bundled with the app, picks the
//! server, and can start one on this computer with the Node.js installed here.

mod server;
mod settings;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use settings::Settings;
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, Manager, RunEvent, State, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const MAIN: &str = "main";
/// Links the app's own pages use to ask it for something ("show a download").
const OWN_SCHEME: &str = "clack-desktop";

struct AppState {
    settings_path: PathBuf,
    settings: Mutex<Settings>,
    /// The server the window is showing: the window may move around inside it, nowhere else.
    current: Mutex<Option<Url>>,
    /// The launcher page's own address, to come back to.
    launcher: Mutex<Option<Url>>,
    /// Downloads under way, where each is going.
    downloading: Mutex<HashMap<String, PathBuf>>,
    /// Downloads done, for "Show" to find.
    downloaded: Mutex<Vec<PathBuf>>,
    local: server::Local,
    /// When the zoom last changed: a key press that reaches both the menu and the page zooms once.
    zoomed_at: Mutex<Option<std::time::Instant>>,
}

impl AppState {
    fn settings(&self) -> Settings {
        self.settings.lock().unwrap().clone()
    }

    fn update(&self, change: impl FnOnce(&mut Settings)) -> Result<(), String> {
        let mut settings = self.settings.lock().unwrap();
        change(&mut settings);
        settings::save(&self.settings_path, &settings)
    }

    /// The folder to start a server from: the one chosen, or the one this app was built from.
    fn folder(&self) -> Option<PathBuf> {
        self.settings().folder.map(PathBuf::from).or_else(server::built_from)
    }
}

fn main_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(MAIN).ok_or_else(|| "The window is gone.".to_string())
}

/// The launcher page and nothing else, wherever the platform serves it from.
fn is_launcher(url: &Url) -> bool {
    url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

// ---- what the launcher asks ------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LauncherInfo {
    settings: Settings,
    /// The folder a server would be started from, when there is one.
    folder: Option<String>,
    /// The port of a server this app started and is running.
    running_port: Option<u16>,
    platform: &'static str,
}

#[tauri::command]
async fn launcher_info(state: State<'_, AppState>) -> Result<LauncherInfo, String> {
    Ok(LauncherInfo {
        settings: state.settings(),
        folder: state.folder().map(|f| f.display().to_string()),
        running_port: state.local.running(),
        platform: std::env::consts::OS,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProbeResult {
    #[serde(flatten)]
    probe: server::Probe,
    /// The address is this computer, where a server can be started.
    local: bool,
}

#[tauri::command]
async fn probe_server(address: String) -> Result<ProbeResult, String> {
    let url = server::normalize(&address)?;
    let local = server::is_local(&url);
    let probe = tauri::async_runtime::spawn_blocking(move || server::probe(&url)).await.map_err(|err| err.to_string())?;
    Ok(ProbeResult { probe, local })
}

/// Shows the server at `address` in the window, and remembers it for next time.
#[tauri::command]
async fn open_server(app: AppHandle, state: State<'_, AppState>, address: String) -> Result<(), String> {
    let url = server::normalize(&address)?;
    state.update(|s| s.server = url.as_str().trim_end_matches('/').to_string())?;
    *state.current.lock().unwrap() = Some(url.clone());
    main_window(&app)?.navigate(url).map_err(|err| err.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FolderInfo {
    folder: Option<String>,
    problems: Vec<String>,
    node: server::NodeInfo,
}

#[tauri::command]
async fn folder_info(state: State<'_, AppState>) -> Result<FolderInfo, String> {
    let folder = state.folder();
    let problems = match &folder {
        Some(folder) => server::folder_problems(folder),
        None => vec!["Choose the Clack folder: the one you cloned, with server/ and web/ in it.".into()],
    };
    let node = tauri::async_runtime::spawn_blocking(server::node).await.map_err(|err| err.to_string())?;
    Ok(FolderInfo { folder: folder.map(|f| f.display().to_string()), problems, node })
}

#[tauri::command]
async fn choose_folder(app: AppHandle, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let mut dialog = app.dialog().file().set_title("Choose the Clack folder");
    if let Some(folder) = state.folder() {
        dialog = dialog.set_directory(folder);
    }
    let Some(picked) = dialog.blocking_pick_folder() else { return Ok(None) };
    let path = picked.into_path().map_err(|err| err.to_string())?;
    state.update(|s| s.folder = Some(path.display().to_string()))?;
    Ok(Some(path.display().to_string()))
}

/// Starts a server from the Clack folder on the port of `address`, and waits until it answers.
#[tauri::command]
async fn start_server(app: AppHandle, address: String, auto_start: bool) -> Result<(), String> {
    let url = server::normalize(&address)?;
    if !server::is_local(&url) {
        return Err("A server can only be started on this computer: use a localhost address.".into());
    }
    let state = app.state::<AppState>();
    let folder = state.folder().ok_or("Choose the Clack folder first.")?;
    state.update(|s| {
        s.auto_start = auto_start;
        s.server = url.as_str().trim_end_matches('/').to_string();
    })?;
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || handle.state::<AppState>().local.start(&folder, &url))
        .await
        .map_err(|err| err.to_string())?
}

#[tauri::command]
async fn stop_server(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || handle.state::<AppState>().local.stop()).await.map_err(|err| err.to_string())
}

#[tauri::command]
async fn server_log(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.local.log())
}

#[tauri::command]
async fn set_auto_start(state: State<'_, AppState>, on: bool) -> Result<(), String> {
    state.update(|s| s.auto_start = on)
}

// ---- the window ------------------------------------------------------------------------------

/// The zoom levels a browser steps through.
const ZOOM_LEVELS: [f64; 13] = [0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

#[derive(Clone, Copy)]
enum Zoom {
    In,
    Out,
    Reset,
}

/// Zooms the page a step in or out, or back to actual size, and remembers it for next time.
fn zoom(app: &AppHandle, step: Zoom) {
    let state = app.state::<AppState>();
    {
        let mut last = state.zoomed_at.lock().unwrap();
        if last.is_some_and(|at| at.elapsed() < std::time::Duration::from_millis(120)) {
            return;
        }
        *last = Some(std::time::Instant::now());
    }
    let current = state.settings().zoom;
    let next = match step {
        Zoom::Reset => 1.0,
        Zoom::In => ZOOM_LEVELS.iter().copied().find(|&level| level > current + 0.001).unwrap_or(current),
        Zoom::Out => ZOOM_LEVELS.iter().rev().copied().find(|&level| level < current - 0.001).unwrap_or(current),
    };
    if let Ok(window) = main_window(app) {
        let _ = window.set_zoom(next);
    }
    let _ = state.update(|s| s.zoom = next);
}

/// Cmd (Ctrl elsewhere) with + or =, - and 0 zoom, in every page the window shows,
/// as in a browser. The page asks the app through a link of the app's own, since a
/// server's pages cannot call it directly. The keys also work through the View menu.
const ZOOM_KEYS_SCRIPT: &str = r#"window.addEventListener('keydown', (event) => {
  const mod = /Mac/.test(navigator.platform) ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!mod || event.altKey) return;
  const step = event.key === '+' || event.key === '=' ? 'in' : event.key === '-' || event.key === '_' ? 'out' : event.key === '0' ? 'reset' : '';
  if (!step) return;
  event.preventDefault();
  event.stopPropagation();
  location.href = 'clack-desktop://zoom/' + step;
}, true);"#;

/// Back to the launcher, to pick another server.
fn show_launcher(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Some(launcher) = state.launcher.lock().unwrap().clone() else { return };
    *state.current.lock().unwrap() = None;
    if let (Ok(window), Ok(url)) = (main_window(app), launcher.join("index.html?change=1")) {
        let _ = window.navigate(url);
    }
}

/// Signs in by itself to a server on this computer, with the token the server
/// keeps on this computer, so the sign-in page is skipped. Tried once a session.
fn sign_in_script(token: &str) -> String {
    let token = serde_json::to_string(token).unwrap_or_default();
    format!(
        r#"(async () => {{
  if (sessionStorage.getItem('clack.desktopSignIn')) return;
  sessionStorage.setItem('clack.desktopSignIn', '1');
  try {{
    const me = await (await fetch('/api/me')).json();
    if (me.authed) return;
    const res = await fetch('/api/login', {{ method: 'POST', headers: {{ 'content-type': 'application/json' }}, body: JSON.stringify({{ token: {token} }}) }});
    if (res.ok) location.reload();
  }} catch {{}}
}})();"#
    )
}

/// A note at the bottom of the page that a download is done, with a way to find it.
fn saved_script(name: &str, index: usize) -> String {
    let text = serde_json::to_string(&format!("Saved {name} in Downloads")).unwrap_or_default();
    let link = serde_json::to_string(&format!("{OWN_SCHEME}://reveal/{index}")).unwrap_or_default();
    let show = if cfg!(target_os = "macos") { "Show in Finder" } else { "Show in folder" };
    format!(
        r#"(() => {{
  document.getElementById('clack-desktop-saved')?.remove();
  const note = document.createElement('div');
  note.id = 'clack-desktop-saved';
  note.setAttribute('role', 'status');
  note.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100;display:flex;gap:12px;align-items:center;padding:10px 14px;border-radius:10px;border:1px solid var(--border, #ccc);background:var(--surface, #fff);color:var(--text, #111);box-shadow:var(--shadow, 0 4px 16px rgb(0 0 0 / 20%));font:14px/1.4 var(--font, sans-serif)';
  const text = document.createElement('span');
  text.textContent = {text};
  const show = document.createElement('a');
  show.href = {link};
  show.textContent = '{show}';
  show.style.cssText = 'color:var(--link, #1264a3);font-weight:700;text-decoration:none';
  note.append(text, show);
  document.body.append(note);
  setTimeout(() => note.remove(), 6000);
}})();"#
    )
}

fn build_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    let on_navigation = app.clone();
    let on_new_window = app.clone();
    let on_download = app.clone();
    let on_load = app.clone();

    WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App("index.html".into()))
        .title("Clack")
        .inner_size(1280.0, 820.0)
        .min_inner_size(640.0, 480.0)
        // The app zooms by itself (see zoom()), the same way everywhere; the
        // system's own hotkeys exist only on Windows and would zoom twice there.
        .zoom_hotkeys_enabled(false)
        .initialization_script(ZOOM_KEYS_SCRIPT)
        // Pages stay inside the server they belong to; links elsewhere open in the browser.
        .on_navigation(move |url| {
            let app = &on_navigation;
            let state = app.state::<AppState>();
            if url.scheme() == OWN_SCHEME {
                let index = url.path().trim_start_matches('/').parse::<usize>().ok();
                if url.host_str() == Some("zoom") {
                    match url.path().trim_start_matches('/') {
                        "in" => zoom(app, Zoom::In),
                        "out" => zoom(app, Zoom::Out),
                        "reset" => zoom(app, Zoom::Reset),
                        _ => {}
                    }
                }
                if url.host_str() == Some("reveal") {
                    if let Some(path) = index.and_then(|i| state.downloaded.lock().unwrap().get(i).cloned()) {
                        let _ = app.opener().reveal_item_in_dir(path);
                    }
                }
                return false;
            }
            if is_launcher(url) || matches!(url.scheme(), "about" | "blob" | "data") {
                return true;
            }
            if state.current.lock().unwrap().as_ref().is_some_and(|current| server::same_origin(current, url)) {
                return true;
            }
            if matches!(url.scheme(), "http" | "https" | "mailto") {
                let _ = app.opener().open_url(url.as_str(), None::<&str>);
            }
            false
        })
        // Links that open a new tab: the server's own (a picture) in a window of the app, the rest in the browser.
        .on_new_window(move |url, _features| {
            let app = &on_new_window;
            let state = app.state::<AppState>();
            if state.current.lock().unwrap().as_ref().is_some_and(|current| server::same_origin(current, &url)) {
                return NewWindowResponse::Allow;
            }
            if matches!(url.scheme(), "http" | "https" | "mailto") {
                let _ = app.opener().open_url(url.as_str(), None::<&str>);
            }
            NewWindowResponse::Deny
        })
        // Exports and diagram pictures go to Downloads, as a browser would put them.
        .on_download(move |webview, event| {
            let state = on_download.state::<AppState>();
            match event {
                DownloadEvent::Requested { url, destination } => {
                    state.downloading.lock().unwrap().insert(url.to_string(), destination.clone());
                }
                DownloadEvent::Finished { url, path, success } => {
                    let going = state.downloading.lock().unwrap().remove(url.as_str());
                    if let (true, Some(path)) = (success, path.or(going)) {
                        let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                        let mut done = state.downloaded.lock().unwrap();
                        done.push(path);
                        if let Err(err) = webview.eval(saved_script(&name, done.len() - 1)) {
                            eprintln!("the download note could not be shown: {err}");
                        }
                    }
                }
                _ => {}
            }
            true
        })
        .on_page_load(move |window, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let state = on_load.state::<AppState>();
            if is_launcher(payload.url()) {
                *state.launcher.lock().unwrap() = Some(payload.url().clone());
                return;
            }
            let current = state.current.lock().unwrap().clone();
            let Some(current) = current else { return };
            if server::same_origin(&current, payload.url()) && server::is_local(&current) {
                if let Some(token) = server::local_token(state.folder().as_deref()) {
                    let _ = window.eval(sign_in_script(&token));
                }
            }
        })
        .build()
}

/// A zoom item, showing its key. On a Mac the menu takes the key itself; elsewhere
/// the page's own key handler does (a window menu there may not see keys the web
/// view has), so the menu only shows the key.
fn zoom_item(app: &AppHandle, id: &str, label: &str, key: &str) -> tauri::Result<tauri::menu::MenuItem<tauri::Wry>> {
    let builder = MenuItemBuilder::with_id(id, label);
    if cfg!(target_os = "macos") {
        builder.accelerator(format!("Cmd+{key}")).build(app)
    } else if cfg!(windows) {
        // Windows menus show what follows a tab as the item's key.
        MenuItemBuilder::with_id(id, format!("{label}\tCtrl+{}", if key == "=" { "+" } else { key })).build(app)
    } else {
        builder.build(app)
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::default(app)?;
    let zoom_in = zoom_item(app, "zoom-in", "Zoom In", "=")?;
    let zoom_out = zoom_item(app, "zoom-out", "Zoom Out", "-")?;
    let actual = zoom_item(app, "zoom-reset", "Actual Size", "0")?;
    // Into the View menu, where browsers keep them; a menu bar without one gets one.
    let view = menu.items()?.into_iter().find_map(|item| item.as_submenu().filter(|sub| sub.text().is_ok_and(|t| t == "View")).cloned());
    match view {
        Some(view) => {
            view.prepend_items(&[&actual, &zoom_in, &zoom_out, &PredefinedMenuItem::separator(app)?])?;
        }
        None => {
            let view = SubmenuBuilder::new(app, "View").item(&actual).item(&zoom_in).item(&zoom_out).build()?;
            let at = menu.items()?.len().saturating_sub(1);
            menu.insert(&view, at)?;
        }
    }
    let server_menu = SubmenuBuilder::new(app, "Server")
        .item(&MenuItemBuilder::with_id("change-server", "Change Server…").accelerator("CmdOrCtrl+Shift+L").build(app)?)
        .item(&MenuItemBuilder::with_id("open-browser", "Open in Browser").accelerator("CmdOrCtrl+Shift+O").build(app)?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItemBuilder::with_id("reload", "Reload").accelerator("CmdOrCtrl+R").build(app)?)
        .build()?;
    // Before Window and Help, where menus of an app's own go.
    let at = menu.items()?.len().saturating_sub(2);
    menu.insert(&server_menu, at)?;
    Ok(menu)
}

pub fn run() {
    let app = tauri::Builder::default()
        // Opening the app again brings the open window forward instead of a second app.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window(MAIN) {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            launcher_info,
            probe_server,
            open_server,
            folder_info,
            choose_folder,
            start_server,
            stop_server,
            server_log,
            set_auto_start
        ])
        .setup(|app| {
            let settings_path = app.path().app_config_dir()?.join("settings.json");
            app.manage(AppState {
                settings: Mutex::new(settings::load(&settings_path)),
                settings_path,
                current: Mutex::new(None),
                launcher: Mutex::new(None),
                downloading: Mutex::new(HashMap::new()),
                downloaded: Mutex::new(Vec::new()),
                local: server::Local::default(),
                zoomed_at: Mutex::new(None),
            });
            let handle = app.handle().clone();
            app.set_menu(build_menu(&handle)?)?;
            app.on_menu_event(|app, event| match event.id().as_ref() {
                "change-server" => show_launcher(app),
                "open-browser" => {
                    let current = app.state::<AppState>().current.lock().unwrap().clone();
                    let url = current.map(|u| u.to_string()).unwrap_or_else(|| app.state::<AppState>().settings().server);
                    let _ = app.opener().open_url(url, None::<&str>);
                }
                "zoom-in" => zoom(app, Zoom::In),
                "zoom-out" => zoom(app, Zoom::Out),
                "zoom-reset" => zoom(app, Zoom::Reset),
                "reload" => {
                    if let Ok(window) = main_window(app) {
                        let _ = window.eval("location.reload()");
                    }
                }
                _ => {}
            });
            let window = build_window(&handle)?;
            let remembered = handle.state::<AppState>().settings().zoom;
            if (remembered - 1.0).abs() > 0.001 {
                let _ = window.set_zoom(remembered);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Clack's window could not be opened");

    app.run(|app, event| {
        // A server this app started stops with it.
        if let RunEvent::Exit = event {
            app.state::<AppState>().local.stop();
        }
    });
}
