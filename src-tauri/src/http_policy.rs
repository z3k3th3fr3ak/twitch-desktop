use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use url::Url;

const TWITCH_HOSTS: &[&str] = &["id.twitch.tv", "api.twitch.tv"];
const PUBLIC_HOSTS: &[&str] = &[
    "7tv.io",
    "api.7tv.io",
    "api.betterttv.net",
    "api.frankerfacez.com",
    "frankerfacez.com",
];

const BLOCKED_HEADERS: &[&str] = &[
    "host",
    "content-length",
    "connection",
    "transfer-encoding",
    "cookie",
    "proxy-authorization",
];

pub fn is_twitch_host(host: &str) -> bool {
    TWITCH_HOSTS.contains(&host)
}

pub fn validate_url(method: &str, url: &str) -> Result<Url, String> {
    let verb = method.to_ascii_uppercase();
    if !matches!(verb.as_str(), "GET" | "POST" | "DELETE") {
        return Err("Only GET, POST, and DELETE are allowed.".into());
    }
    let parsed = Url::parse(url).map_err(|_| "The URL is not valid.".to_string())?;
    if parsed.scheme() != "https" {
        return Err("Only HTTPS requests are allowed.".into());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Credentials in the URL are not allowed.".into());
    }
    let host = parsed.host_str().ok_or("The URL is missing a host.")?;
    if !is_twitch_host(host) && !PUBLIC_HOSTS.contains(&host) {
        return Err(format!(
            "{host} is not an allowed Twitch or emote API host."
        ));
    }
    Ok(parsed)
}

pub fn filter_headers(host: &str, headers: &[(String, String)]) -> Result<HeaderMap, String> {
    let mut map = HeaderMap::new();
    for (name, value) in headers {
        let lower = name.to_ascii_lowercase();
        if BLOCKED_HEADERS.contains(&lower.as_str()) {
            continue;
        }
        if !is_twitch_host(host) && (lower == "authorization" || lower == "client-id") {
            continue;
        }
        if value.len() > 4096 {
            return Err(format!("Header {name} is too long."));
        }
        let header_name = HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| format!("Header {name} is not valid."))?;
        let header_value = HeaderValue::from_str(value)
            .map_err(|_| format!("Header {name} has an invalid value."))?;
        map.append(header_name, header_value);
    }
    Ok(map)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_twitch_and_emote_hosts_only() {
        assert!(validate_url("GET", "https://api.twitch.tv/helix/users").is_ok());
        assert!(validate_url("POST", "https://id.twitch.tv/oauth2/token").is_ok());
        assert!(validate_url("GET", "https://7tv.io/v3/emote-sets/global").is_ok());
        assert!(validate_url("GET", "https://api.betterttv.net/3/cached/emotes/global").is_ok());
        assert!(validate_url("GET", "http://api.twitch.tv/helix/users").is_err());
        assert!(validate_url("GET", "https://user:pass@api.twitch.tv/helix/users").is_err());
        assert!(validate_url("GET", "https://gql.twitch.tv/gql").is_err());
        assert!(validate_url("PUT", "https://api.twitch.tv/helix/users").is_err());
    }

    #[test]
    fn strips_twitch_credentials_before_they_reach_emote_apis() {
        let headers = filter_headers(
            "7tv.io",
            &[
                ("Authorization".into(), "Bearer secret".into()),
                ("Client-Id".into(), "client".into()),
                ("Accept".into(), "application/json".into()),
                ("Cookie".into(), "session=nope".into()),
            ],
        )
        .unwrap();
        assert!(headers.get("authorization").is_none());
        assert!(headers.get("client-id").is_none());
        assert!(headers.get("cookie").is_none());
        assert_eq!(headers.get("accept").unwrap(), "application/json");
    }

    #[test]
    fn keeps_authorization_for_twitch() {
        let headers = filter_headers(
            "api.twitch.tv",
            &[("Authorization".into(), "Bearer secret".into())],
        )
        .unwrap();
        assert_eq!(headers.get("authorization").unwrap(), "Bearer secret");
    }
}
