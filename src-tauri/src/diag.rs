use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static LOG_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

pub fn data_dir() -> PathBuf {
    #[cfg(windows)]
    if let Ok(root) = std::env::var("APPDATA") {
        if !root.is_empty() {
            return PathBuf::from(root).join("app.glint.desktop");
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        if !home.is_empty() {
            return PathBuf::from(home).join(".local/share/app.glint.desktop");
        }
    }
    std::env::temp_dir().join("glint")
}

pub fn init() -> PathBuf {
    let dir = data_dir();
    let _ = std::fs::create_dir_all(&dir);
    let path = dir.join("glint.log");
    if let Ok(mut slot) = LOG_PATH.lock() {
        *slot = Some(path.clone());
    }
    append("log opened");
    path
}

pub fn path() -> Option<PathBuf> {
    LOG_PATH.lock().ok().and_then(|slot| slot.clone())
}

pub fn append(message: &str) {
    let Some(path) = path() else {
        return;
    };
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    let clean = sanitize(message);
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{millis} {clean}");
    }
}

fn sanitize(message: &str) -> String {
    let mut out = String::new();
    for ch in message.chars().take(400) {
        if ch.is_control() {
            out.push(' ');
        } else {
            out.push(ch);
        }
    }
    let lower = out.to_ascii_lowercase();
    if lower.contains("oauth") || lower.contains("bearer") || lower.contains("token") {
        return "redacted log line".to_string();
    }
    out
}

pub fn safe_mode() -> bool {
    std::env::args().any(|arg| arg == "--safe-mode") || shift_held()
}

pub fn minimized() -> bool {
    std::env::args().any(|arg| arg == "--minimized")
}

#[cfg(windows)]
fn shift_held() -> bool {
    #[link(name = "user32")]
    unsafe extern "system" {
        fn GetAsyncKeyState(vkey: i32) -> i16;
    }
    unsafe { GetAsyncKeyState(0x10) < 0 }
}

#[cfg(not(windows))]
fn shift_held() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::sanitize;

    #[test]
    fn log_lines_drop_secrets_and_control_characters() {
        assert_eq!(sanitize("overlay not created"), "overlay not created");
        assert_eq!(sanitize("stored oauth:abc"), "redacted log line");
        assert!(!sanitize("line\nbreak").contains('\n'));
    }
}
