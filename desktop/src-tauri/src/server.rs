//! Finding a Clack server, and starting one from a Clack folder with the
//! Node.js installed on this computer.

use std::collections::VecDeque;
use std::env;
use std::ffi::OsString;
use std::fs;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use url::Url;

/// The oldest Node.js Clack runs on (package.json "engines").
const MIN_NODE_MAJOR: u32 = 24;
/// How many lines of the server's output are kept, to show when it does not start.
const LOG_LINES: usize = 200;

// ---- addresses ------------------------------------------------------------------

/// A server address as typed ("localhost:4317", "http://pi.local:4317/s/…") reduced to its origin.
pub fn normalize(address: &str) -> Result<Url, String> {
    let typed = address.trim();
    if typed.is_empty() {
        return Err("Type the address of a Clack server.".into());
    }
    let with_scheme = if typed.contains("://") { typed.to_string() } else { format!("http://{typed}") };
    let mut url = Url::parse(&with_scheme).map_err(|_| format!("“{typed}” is not an address."))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("The address has to start with http:// or https://.".into());
    }
    if url.host_str().is_none() {
        return Err(format!("“{typed}” is not an address."));
    }
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(None);
    let _ = url.set_username("");
    let _ = url.set_password(None);
    Ok(url)
}

/// This computer: the only place the app can start a server, and sign in to by itself.
pub fn is_local(url: &Url) -> bool {
    match url.host() {
        Some(url::Host::Domain(name)) => name.eq_ignore_ascii_case("localhost"),
        Some(url::Host::Ipv4(ip)) => ip.is_loopback(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback(),
        None => false,
    }
}

pub fn same_origin(a: &Url, b: &Url) -> bool {
    a.scheme() == b.scheme() && a.host_str() == b.host_str() && a.port_or_known_default() == b.port_or_known_default()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Probe {
    pub url: String,
    /// Something answered.
    pub reachable: bool,
    /// What answered is a Clack server.
    pub clack: bool,
    pub error: Option<String>,
}

/// Asks an address whether a Clack server is there.
pub fn probe(url: &Url) -> Probe {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(3)))
        .http_status_as_error(false)
        .build()
        .into();
    let me = url.join("api/me").expect("a fixed path joins");
    match agent.get(me.as_str()).call() {
        Ok(mut response) => {
            let body = response.body_mut().read_to_string().unwrap_or_default();
            let clack = serde_json::from_str::<serde_json::Value>(&body)
                .map(|value| value.get("authed").is_some())
                .unwrap_or(false);
            Probe {
                url: url.to_string(),
                reachable: true,
                clack,
                error: (!clack).then(|| "Something answers there, but it is not a Clack server.".into()),
            }
        }
        Err(err) => Probe {
            url: url.to_string(),
            reachable: false,
            clack: false,
            error: Some(match err {
                ureq::Error::Timeout(_) => "No answer in time.".into(),
                ureq::Error::ConnectionFailed | ureq::Error::Io(_) => "Nothing is answering there.".into(),
                ureq::Error::HostNotFound => "That computer could not be found.".into(),
                other => other.to_string(),
            }),
        },
    }
}

// ---- the user's PATH --------------------------------------------------------------

/// The PATH a terminal would have. An app opened from the Dock or a desktop
/// menu gets a bare one, without Homebrew, nvm or Volta, so neither `node` nor
/// the `claude` and `codex` commands the server runs would be found.
pub fn user_path() -> OsString {
    static PATH: OnceLock<OsString> = OnceLock::new();
    PATH.get_or_init(|| {
        let mut parts: Vec<PathBuf> = Vec::new();
        #[cfg(unix)]
        if let Some(login) = login_shell_path() {
            parts.extend(env::split_paths(&login));
        }
        if let Some(current) = env::var_os("PATH") {
            parts.extend(env::split_paths(&current));
        }
        #[cfg(unix)]
        {
            parts.push("/opt/homebrew/bin".into());
            parts.push("/usr/local/bin".into());
            if let Some(home) = dirs::home_dir() {
                parts.push(home.join(".volta/bin"));
                parts.push(home.join(".local/bin"));
            }
        }
        let mut seen = std::collections::HashSet::new();
        parts.retain(|part| !part.as_os_str().is_empty() && seen.insert(part.clone()));
        env::join_paths(parts).unwrap_or_else(|_| env::var_os("PATH").unwrap_or_default())
    })
    .clone()
}

#[cfg(unix)]
fn login_shell_path() -> Option<String> {
    let shell = env::var("SHELL").unwrap_or_else(|_| if cfg!(target_os = "macos") { "/bin/zsh".into() } else { "/bin/bash".into() });
    let mut child = Command::new(shell)
        .args(["-l", "-i", "-c", "printf '__CLACK_PATH__%s__CLACK_PATH__' \"$PATH\""])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let started = Instant::now();
    // A shell whose start-up waits on something is given up on.
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() < Duration::from_secs(6) => thread::sleep(Duration::from_millis(30)),
            _ => {
                let _ = child.kill();
                return None;
            }
        }
    }
    let mut out = String::new();
    child.stdout.take()?.read_to_string(&mut out).ok()?;
    let start = out.find("__CLACK_PATH__")? + "__CLACK_PATH__".len();
    let end = start + out[start..].find("__CLACK_PATH__")?;
    Some(out[start..end].to_string())
}

fn no_window(command: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // No console window flashing up behind the app.
        command.creation_flags(0x0800_0000);
    }
    command
}

// ---- Node.js and the Clack folder ----------------------------------------------------

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NodeInfo {
    pub path: Option<String>,
    pub version: Option<String>,
    /// Why it cannot be used, when it cannot.
    pub problem: Option<String>,
}

fn find_on_path(name: &str) -> Option<PathBuf> {
    let names: Vec<String> = if cfg!(windows) { vec![format!("{name}.exe"), format!("{name}.cmd")] } else { vec![name.to_string()] };
    env::split_paths(&user_path()).find_map(|dir| names.iter().map(|n| dir.join(n)).find(|candidate| candidate.is_file()))
}

pub fn node() -> NodeInfo {
    let Some(path) = find_on_path("node") else {
        return NodeInfo {
            path: None,
            version: None,
            problem: Some(format!("Node.js was not found. Install Node.js {MIN_NODE_MAJOR} or newer from nodejs.org.")),
        };
    };
    let version = no_window(Command::new(&path).arg("--version"))
        .env("PATH", user_path())
        .output()
        .ok()
        .map(|out| String::from_utf8_lossy(&out.stdout).trim().to_string())
        .filter(|v| !v.is_empty());
    let major = version.as_deref().and_then(|v| v.trim_start_matches('v').split('.').next()?.parse::<u32>().ok());
    let problem = match major {
        None => Some("Node.js is there but did not say its version.".to_string()),
        Some(major) if major < MIN_NODE_MAJOR => Some(format!(
            "Clack needs Node.js {MIN_NODE_MAJOR} or newer; this computer has {}.",
            version.clone().unwrap_or_default()
        )),
        _ => None,
    };
    NodeInfo { path: Some(path.display().to_string()), version, problem }
}

/// What is missing for a server to start from this folder; empty when nothing is.
pub fn folder_problems(folder: &Path) -> Vec<String> {
    if !folder.join("server/src/index.ts").is_file() {
        return vec!["This is not a Clack folder: it has no server/src/index.ts.".into()];
    }
    let mut problems = Vec::new();
    if !folder.join("node_modules").is_dir() {
        problems.push("Its packages are not installed. Run `npm install` in it.".into());
    }
    if !folder.join("web/dist/index.html").is_file() {
        problems.push("Its web app is not built. Run `npm run build` in it.".into());
    }
    problems
}

/// The Clack folder this app was built from, when it is still there.
pub fn built_from() -> Option<PathBuf> {
    let here = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let folder = here.parent()?.parent()?.to_path_buf();
    folder.join("server/src/index.ts").is_file().then_some(folder)
}

/// The access token a server started on this computer uses: CLACK_TOKEN in the
/// folder's .env, or the one the server saved the first time it started.
pub fn local_token(folder: Option<&Path>) -> Option<String> {
    if let Some(folder) = folder {
        if let Ok(text) = fs::read_to_string(folder.join(".env")) {
            for line in text.lines() {
                if let Some(value) = line.trim().strip_prefix("CLACK_TOKEN=") {
                    let value = value.trim().trim_matches(|c| c == '"' || c == '\'').trim();
                    if !value.is_empty() {
                        return Some(value.to_string());
                    }
                }
            }
        }
    }
    let saved = dirs::home_dir()?.join(".config/clack/token");
    fs::read_to_string(saved).ok().map(|t| t.trim().to_string()).filter(|t| !t.is_empty())
}

// ---- a server this app started ----------------------------------------------------------

pub struct Started {
    child: Child,
    pub port: u16,
}

#[derive(Default)]
pub struct Local {
    started: Mutex<Option<Started>>,
    log: Arc<Mutex<VecDeque<String>>>,
}

impl Local {
    pub fn log(&self) -> Vec<String> {
        self.log.lock().unwrap().iter().cloned().collect()
    }

    /// The port of the server this app started, while it runs.
    pub fn running(&self) -> Option<u16> {
        let mut started = self.started.lock().unwrap();
        let alive = matches!(started.as_mut().map(|s| s.child.try_wait()), Some(Ok(None)));
        if !alive {
            *started = None;
        }
        started.as_ref().map(|s| s.port)
    }

    /// Starts `node server/src/index.ts` in the folder, as `npm start` would,
    /// on the port of `url`, and waits until it answers there.
    pub fn start(&self, folder: &Path, url: &Url) -> Result<(), String> {
        let port = url.port_or_known_default().unwrap_or(4317);
        if self.running() == Some(port) && probe(url).clack {
            return Ok(());
        }
        self.stop();
        let problems = folder_problems(folder);
        if !problems.is_empty() {
            return Err(problems.join(" "));
        }
        let node = node();
        if let Some(problem) = node.problem {
            return Err(problem);
        }
        let mut command = Command::new(node.path.expect("found"));
        command
            .current_dir(folder.join("server"))
            .args(["--env-file-if-exists=../.env", "src/index.ts"])
            .env("PATH", user_path())
            .env("CLACK_PORT", port.to_string())
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            // Its own process group: a Ctrl+C meant for the app's terminal does not reach it.
            command.process_group(0);
        }
        no_window(&mut command);
        self.log.lock().unwrap().clear();
        let mut child = command.spawn().map_err(|err| format!("Node.js could not be started: {err}"))?;
        for stream in [child.stdout.take().map(|s| Box::new(s) as Box<dyn Read + Send>), child.stderr.take().map(|s| Box::new(s) as Box<dyn Read + Send>)]
            .into_iter()
            .flatten()
        {
            let log = self.log.clone();
            // Read for as long as it runs: a full pipe would stall the server.
            thread::spawn(move || {
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    let mut log = log.lock().unwrap();
                    log.push_back(line);
                    while log.len() > LOG_LINES {
                        log.pop_front();
                    }
                }
            });
        }
        *self.started.lock().unwrap() = Some(Started { child, port });

        let deadline = Instant::now() + Duration::from_secs(45);
        loop {
            if self.running().is_none() {
                let tail: Vec<String> = self.log().into_iter().rev().take(12).collect::<Vec<_>>().into_iter().rev().collect();
                return Err(format!("The server stopped while starting.\n{}", tail.join("\n")));
            }
            let found = probe(url);
            if found.clack {
                return Ok(());
            }
            if found.reachable {
                self.stop();
                return Err(format!("Port {port} is taken by something that is not Clack."));
            }
            if Instant::now() > deadline {
                self.stop();
                return Err("The server did not answer within 45 seconds.".into());
            }
            thread::sleep(Duration::from_millis(300));
        }
    }

    /// Stops the server this app started, if it did: asked nicely first, so it
    /// can stop the agents it runs; forced after a few seconds.
    pub fn stop(&self) {
        let Some(mut started) = self.started.lock().unwrap().take() else { return };
        #[cfg(unix)]
        {
            unsafe {
                libc::kill(started.child.id() as i32, libc::SIGTERM);
            }
            let deadline = Instant::now() + Duration::from_secs(5);
            while Instant::now() < deadline {
                if matches!(started.child.try_wait(), Ok(Some(_))) {
                    return;
                }
                thread::sleep(Duration::from_millis(50));
            }
            let _ = started.child.kill();
        }
        #[cfg(windows)]
        {
            // Windows has no polite signal: the server and everything it started go together.
            let _ = no_window(Command::new("taskkill").args(["/PID", &started.child.id().to_string(), "/T", "/F"])).status();
            let _ = started.child.kill();
        }
        let _ = started.child.wait();
    }
}
