pub const IRC_URL: &str = "wss://irc-ws.chat.twitch.tv:443";
pub const EVENTSUB_URL: &str = "wss://eventsub.wss.twitch.tv/ws";

pub fn normalize_login(value: &str) -> Result<String, String> {
    let login = value.trim().trim_start_matches('#').to_ascii_lowercase();
    if (1..=25).contains(&login.len())
        && login
            .chars()
            .all(|char| char.is_ascii_alphanumeric() || char == '_')
    {
        Ok(login)
    } else {
        Err("Channel name is not a valid Twitch login.".into())
    }
}

pub fn sanitize_privmsg(text: &str) -> Result<String, String> {
    let cleaned: String = text
        .chars()
        .filter(|char| *char != '\r' && *char != '\n' && *char != '\0')
        .collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return Err("Message is empty.".into());
    }
    if trimmed.chars().count() > 450 {
        return Err("Message is longer than 450 characters.".into());
    }
    Ok(trimmed.to_string())
}

pub fn oauth_pass(token: &str) -> Result<String, String> {
    let trimmed = token.trim().strip_prefix("oauth:").unwrap_or(token.trim());
    if trimmed.is_empty()
        || trimmed
            .chars()
            .any(|char| char.is_whitespace() || char == '\r' || char == '\n')
    {
        return Err("The Twitch token is empty or malformed.".into());
    }
    Ok(format!("PASS oauth:{trimmed}"))
}

pub fn irc_pong(line: &str) -> Option<String> {
    let trimmed = line.trim_end_matches(['\r', '\n']);
    trimmed
        .strip_prefix("PING ")
        .map(|rest| format!("PONG {rest}"))
        .or_else(|| (trimmed == "PING").then(|| "PONG".to_string()))
}

pub fn is_auth_failure(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.contains("login authentication failed") || lower.contains("login unsuccessful")
}

pub fn validate_eventsub_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| "Invalid EventSub URL.".to_string())?;
    if parsed.scheme() != "wss" {
        return Err("EventSub URL must use wss.".into());
    }
    if parsed.host_str() != Some("eventsub.wss.twitch.tv") {
        return Err("EventSub URL host is not allowed.".into());
    }
    Ok(())
}

pub fn eventsub_reconnect_url(text: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    if value.pointer("/metadata/message_type")?.as_str()? != "session_reconnect" {
        return None;
    }
    let url = value
        .pointer("/payload/session/reconnect_url")?
        .as_str()?
        .to_string();
    validate_eventsub_url(&url).ok()?;
    Some(url)
}

pub fn keepalive_timeout_secs(text: &str) -> Option<u64> {
    let value: serde_json::Value = serde_json::from_str(text).ok()?;
    if value.pointer("/metadata/message_type")?.as_str()? != "session_welcome" {
        return None;
    }
    let seconds = value
        .pointer("/payload/session/keepalive_timeout_seconds")?
        .as_u64()?;
    Some(seconds.clamp(5, 600))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn login_and_message_limits() {
        assert_eq!(normalize_login("#Harbor").unwrap(), "harbor");
        assert!(normalize_login("bad name").is_err());
        assert!(sanitize_privmsg("  hello \nthere ").unwrap() == "hello there");
        assert!(sanitize_privmsg("   ").is_err());
        assert!(sanitize_privmsg(&"a".repeat(451)).is_err());
    }

    #[test]
    fn pass_line_strips_an_existing_prefix() {
        assert_eq!(oauth_pass("oauth:abc").unwrap(), "PASS oauth:abc");
        assert!(oauth_pass("bad token").is_err());
    }

    #[test]
    fn ping_and_auth_failure() {
        assert_eq!(
            irc_pong("PING :tmi.twitch.tv\r\n").as_deref(),
            Some("PONG :tmi.twitch.tv")
        );
        assert!(is_auth_failure("NOTICE * :Login authentication failed"));
        assert!(!is_auth_failure("PRIVMSG #a :hello"));
    }

    #[test]
    fn eventsub_urls_stay_on_the_official_host() {
        let welcome = r#"{"metadata":{"message_type":"session_welcome"},"payload":{"session":{"keepalive_timeout_seconds":10}}}"#;
        assert_eq!(keepalive_timeout_secs(welcome), Some(10));
        let reconnect = r#"{"metadata":{"message_type":"session_reconnect"},"payload":{"session":{"reconnect_url":"wss://eventsub.wss.twitch.tv/ws?session=1"}}}"#;
        assert!(eventsub_reconnect_url(reconnect)
            .unwrap()
            .contains("session=1"));
        let evil = r#"{"metadata":{"message_type":"session_reconnect"},"payload":{"session":{"reconnect_url":"wss://evil.example/ws"}}}"#;
        assert!(eventsub_reconnect_url(evil).is_none());
        assert!(validate_eventsub_url("https://eventsub.wss.twitch.tv/ws").is_err());
    }
}
