use crate::protocol::{irc_pong, is_auth_failure, oauth_pass, IRC_URL};
use futures_util::{SinkExt, StreamExt};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Clone)]
pub enum ChatCmd {
    Join(String),
    Part(String),
    Privmsg { channel: String, text: String },
    Shutdown,
}

pub struct Control {
    tx: Option<UnboundedSender<ChatCmd>>,
}

impl Control {
    pub fn new() -> Self {
        Self { tx: None }
    }

    pub fn connect(&mut self, app: AppHandle, login: String, token: String) -> Result<(), String> {
        let pass = oauth_pass(&token)?;
        self.disconnect();
        let (tx, rx) = unbounded_channel();
        self.tx = Some(tx);
        tauri::async_runtime::spawn(run(app, login, pass, rx));
        Ok(())
    }

    pub fn send(&self, command: ChatCmd) -> Result<(), String> {
        self.tx
            .as_ref()
            .ok_or_else(|| "Chat is not connected.".to_string())?
            .send(command)
            .map_err(|_| "Chat is not connected.".to_string())
    }

    pub fn disconnect(&mut self) {
        if let Some(tx) = self.tx.take() {
            let _ = tx.send(ChatCmd::Shutdown);
        }
    }
}

fn text_message(text: &str) -> Message {
    Message::Text(text.to_string().into())
}

fn remember(joined: &mut Vec<String>, command: &ChatCmd) -> Option<String> {
    match command {
        ChatCmd::Join(channel) => {
            if !joined.iter().any(|item| item == channel) {
                joined.push(channel.clone());
            }
            Some(format!("JOIN #{channel}"))
        }
        ChatCmd::Part(channel) => {
            joined.retain(|item| item != channel);
            Some(format!("PART #{channel}"))
        }
        ChatCmd::Privmsg { channel, text } => Some(format!("PRIVMSG #{channel} :{text}")),
        ChatCmd::Shutdown => None,
    }
}

enum End {
    Shutdown,
    AuthFailed,
    Dropped { was_ready: bool },
}

async fn run(app: AppHandle, login: String, pass: String, mut rx: UnboundedReceiver<ChatCmd>) {
    let mut joined = Vec::new();
    let mut failures = 0u32;
    loop {
        if failures > 0 {
            let _ = app.emit("chat-status", "reconnecting");
            let delay = std::time::Duration::from_secs(u64::from(failures.min(5)) * 2);
            tokio::select! {
                () = tokio::time::sleep(delay) => {}
                command = rx.recv() => {
                    match command {
                        None | Some(ChatCmd::Shutdown) => {
                            let _ = app.emit("chat-status", "disconnected");
                            return;
                        }
                        Some(command) => {
                            let _ = remember(&mut joined, &command);
                        }
                    }
                }
            }
        }
        let _ = app.emit("chat-status", "connecting");
        match connect_once(&app, &login, &pass, &mut joined, &mut rx).await {
            End::Shutdown => {
                let _ = app.emit("chat-status", "disconnected");
                return;
            }
            End::AuthFailed => {
                let _ = app.emit("chat-status", "auth-failed");
                return;
            }
            End::Dropped { was_ready } => {
                failures = if was_ready { 1 } else { failures.saturating_add(1) };
                if failures > 8 {
                    let _ = app.emit("chat-status", "disconnected");
                    return;
                }
            }
        }
    }
}

async fn connect_once(
    app: &AppHandle,
    login: &str,
    pass: &str,
    joined: &mut Vec<String>,
    rx: &mut UnboundedReceiver<ChatCmd>,
) -> End {
    let Ok((socket, _)) = connect_async(IRC_URL).await else {
        return End::Dropped { was_ready: false };
    };
    let (mut write, mut read) = socket.split();
    let intro = [
        "CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership".to_string(),
        pass.to_string(),
        format!("NICK {login}"),
    ];
    for line in intro {
        if write.send(text_message(&line)).await.is_err() {
            return End::Dropped { was_ready: false };
        }
    }
    for channel in joined.iter() {
        if write
            .send(text_message(&format!("JOIN #{channel}")))
            .await
            .is_err()
        {
            return End::Dropped { was_ready: false };
        }
    }
    let mut ready = false;
    loop {
        tokio::select! {
            incoming = read.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        for line in text.to_string().split(['\n', '\r']) {
                            if line.is_empty() {
                                continue;
                            }
                            if let Some(pong) = irc_pong(line) {
                                if write.send(text_message(&pong)).await.is_err() {
                                    return End::Dropped { was_ready: ready };
                                }
                                continue;
                            }
                            if is_auth_failure(line) {
                                return End::AuthFailed;
                            }
                            let _ = app.emit("chat-line", line.to_string());
                            if !ready && (line.contains(" GLOBALUSERSTATE") || line.contains(" 001 ")) {
                                ready = true;
                                let _ = app.emit("chat-status", "ready");
                            }
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if write.send(Message::Pong(payload)).await.is_err() {
                            return End::Dropped { was_ready: ready };
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => {
                        return End::Dropped { was_ready: ready };
                    }
                    _ => {}
                }
            }
            command = rx.recv() => {
                match command {
                    None | Some(ChatCmd::Shutdown) => {
                        let _ = write.send(Message::Close(None)).await;
                        return End::Shutdown;
                    }
                    Some(command) => {
                        if let Some(line) = remember(joined, &command)
                            && write.send(text_message(&line)).await.is_err() {
                                return End::Dropped { was_ready: ready };
                            }
                    }
                }
            }
        }
    }
}
