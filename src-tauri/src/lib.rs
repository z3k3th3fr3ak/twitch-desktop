mod chat;
mod credentials;
mod diag;
mod eventsub;
mod http_policy;
mod protocol;
mod tray;

use chat::ChatCmd;
use http_policy::{filter_headers, validate_url};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, State, WindowEvent};

struct AppState {
    http: reqwest::Client,
    chat: Mutex<chat::Control>,
    events: Mutex<eventsub::Control>,
}

fn guard<T>(mutex: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|error| error.into_inner())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpRequest {
    method: String,
    url: String,
    headers: Vec<(String, String)>,
    body: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResponse {
    status: u16,
    body: String,
}

#[tauri::command]
fn credentials_save(secret: String) -> Result<(), String> {
    credentials::save(&secret)
}

#[tauri::command]
fn credentials_load() -> Result<Option<String>, String> {
    credentials::load()
}

#[tauri::command]
fn credentials_clear() -> Result<(), String> {
    credentials::clear()
}

#[tauri::command]
async fn http_request(
    state: State<'_, AppState>,
    request: HttpRequest,
) -> Result<HttpResponse, String> {
    if request.body.as_ref().is_some_and(|body| body.len() > 256 * 1024) {
        return Err("Request body is too large.".into());
    }
    let url = validate_url(&request.method, &request.url)?;
    let host = url.host_str().unwrap_or_default().to_string();
    let headers = filter_headers(&host, &request.headers)?;
    let method = reqwest::Method::from_bytes(request.method.to_ascii_uppercase().as_bytes())
        .map_err(|_| "Unsupported method.".to_string())?;
    let mut builder = state.http.request(method, url).headers(headers);
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let response = builder
        .send()
        .await
        .map_err(|_| "The network request failed.".to_string())?;
    let status = response.status().as_u16();
    let body = read_limited(response).await?;
    Ok(HttpResponse { status, body })
}

async fn read_limited(response: reqwest::Response) -> Result<String, String> {
    use futures_util::StreamExt;
    let mut stream = response.bytes_stream();
    let mut buffer = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|_| "The response could not be read.".to_string())?;
        if buffer.len() + chunk.len() > 2_000_000 {
            return Err("Response was too large.".into());
        }
        buffer.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&buffer).into_owned())
}

#[tauri::command]
fn chat_connect(
    app: AppHandle,
    state: State<'_, AppState>,
    login: String,
    token: String,
) -> Result<(), String> {
    let login = protocol::normalize_login(&login)?;
    guard(&state.chat).connect(app, login, token)
}

#[tauri::command]
fn chat_join(state: State<'_, AppState>, channel: String) -> Result<(), String> {
    let channel = protocol::normalize_login(&channel)?;
    guard(&state.chat).send(ChatCmd::Join(channel))
}

#[tauri::command]
fn chat_part(state: State<'_, AppState>, channel: String) -> Result<(), String> {
    let channel = protocol::normalize_login(&channel)?;
    guard(&state.chat).send(ChatCmd::Part(channel))
}

#[tauri::command]
fn chat_send(state: State<'_, AppState>, channel: String, text: String) -> Result<(), String> {
    let channel = protocol::normalize_login(&channel)?;
    let text = protocol::sanitize_privmsg(&text)?;
    guard(&state.chat).send(ChatCmd::Privmsg { channel, text })
}

#[tauri::command]
fn chat_disconnect(state: State<'_, AppState>) {
    guard(&state.chat).disconnect();
}

#[tauri::command]
fn eventsub_connect(app: AppHandle, state: State<'_, AppState>) {
    guard(&state.events).connect(app);
}

#[tauri::command]
fn eventsub_disconnect(state: State<'_, AppState>) {
    guard(&state.events).disconnect();
}

#[tauri::command]
fn tray_set_live(app: AppHandle, channels: Vec<tray::TrayChannel>) -> Result<(), String> {
    tray::set_live(&app, &channels).map_err(|_| "The tray menu could not be updated.".to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchInfo {
    safe_mode: bool,
    log_path: String,
    minimized: bool,
}

#[tauri::command]
fn launch_info() -> LaunchInfo {
    LaunchInfo {
        safe_mode: diag::safe_mode(),
        log_path: diag::path()
            .map(|path| path.display().to_string())
            .unwrap_or_default(),
        minimized: diag::minimized(),
    }
}

#[tauri::command]
fn append_log(message: String) {
    diag::append(&message);
}

#[tauri::command]
fn app_quit(app: AppHandle) {
    diag::append("quit");
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let http = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .user_agent("Glint/0.1.2 (Twitch desktop companion)")
        .build()
        .expect("HTTP client");

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::reveal(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--minimized"])
                .build(),
        )
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .manage(AppState {
            http,
            chat: Mutex::new(chat::Control::new()),
            events: Mutex::new(eventsub::Control::new()),
        })
        .setup(|app| {
            let log_path = diag::init();
            let safe = diag::safe_mode();
            diag::append(&format!(
                "process start safe_mode={safe} minimized={} log={}",
                diag::minimized(),
                log_path.display()
            ));
            tray::install(app.handle())?;
            diag::append("tray installed once");
            diag::append("overlay not created");
            diag::append("main window is opaque, borderless, and has no shadow");
            if safe {
                diag::append("safe mode: overlay off, single tile, no autoplay");
            }
            if let Some(window) = app.get_webview_window("main") {
                let watched = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = watched.hide();
                    }
                });
            }
            if !diag::minimized() {
                tray::reveal(app.handle());
                diag::append("main window shown");
            } else {
                diag::append("main window left hidden for tray startup");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            credentials_save,
            credentials_load,
            credentials_clear,
            http_request,
            chat_connect,
            chat_join,
            chat_part,
            chat_send,
            chat_disconnect,
            eventsub_connect,
            eventsub_disconnect,
            tray_set_live,
            launch_info,
            append_log,
            app_quit
        ])
        .run(tauri::generate_context!())
        .expect("error while running Glint");
}
