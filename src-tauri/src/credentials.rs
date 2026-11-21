use keyring::Entry;

const SERVICE: &str = "app.glint.desktop";
const USER: &str = "twitch-oauth";

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
        .map_err(|_| "Glint couldn't save the Twitch token in the credential store.".to_string())
}

pub fn load() -> Result<Option<String>, String> {
    match entry()?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(error) if missing(&error) => Ok(None),
        Err(_) => Err(
            "Glint couldn't read the Twitch token from the credential store.".to_string(),
        ),
    }
}

pub fn clear() -> Result<(), String> {
    match entry()?.delete_credential() {
        Ok(()) => Ok(()),
        Err(error) if missing(&error) => Ok(()),
        Err(_) => Err("Glint couldn't remove the stored Twitch token.".to_string()),
    }
}
