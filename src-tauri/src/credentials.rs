use keyring::Entry;
use std::sync::atomic::{AtomicBool, Ordering};

const SERVICE: &str = "app.glint.desktop";
const USER: &str = "twitch-oauth";

/// First-run machines have no token. Remember that so a retry cannot hammer Credential Manager.
static KNOWN_ABSENT: AtomicBool = AtomicBool::new(false);

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, USER).map_err(|_| {
        "Glint couldn't open the operating system's credential store.".to_string()
    })
}

fn missing(error: &keyring::Error) -> bool {
    let text = error.to_string().to_ascii_lowercase();
    text.contains("no entry")
        || text.contains("not found")
        || text.contains("no matching")
        || text.contains("cannot find")
        || text.contains("element not found")
        || text.contains("1168")
        || text.contains("0x80070490")
}

pub fn save(secret: &str) -> Result<(), String> {
    if secret.len() > 16_384 {
        return Err("The credential payload is too large.".into());
    }
    if secret.trim().is_empty() {
        return Err("Refusing to store an empty credential.".into());
    }
    entry()?
        .set_password(secret)
        .map_err(|_| "Glint couldn't save the Twitch token in the credential store.".to_string())?;
    KNOWN_ABSENT.store(false, Ordering::Relaxed);
    Ok(())
}

pub fn load() -> Result<Option<String>, String> {
    if KNOWN_ABSENT.load(Ordering::Relaxed) {
        return Ok(None);
    }
    match entry()?.get_password() {
        Ok(secret) => {
            KNOWN_ABSENT.store(false, Ordering::Relaxed);
            Ok(Some(secret))
        }
        Err(error) if missing(&error) => {
            KNOWN_ABSENT.store(true, Ordering::Relaxed);
            Ok(None)
        }
        Err(_) => Err(
            "Glint couldn't read the Twitch token from the credential store.".to_string(),
        ),
    }
}

pub fn clear() -> Result<(), String> {
    KNOWN_ABSENT.store(true, Ordering::Relaxed);
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(error) if missing(&error) => Ok(()),
        Err(_) => Err("Glint couldn't remove the stored Twitch token.".to_string()),
    }
}
