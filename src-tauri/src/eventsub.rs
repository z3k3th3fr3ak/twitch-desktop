use crate::protocol::{eventsub_reconnect_url, keepalive_timeout_secs, validate_eventsub_url, EVENTSUB_URL};
use futures_util::{SinkExt, StreamExt};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub enum EventCmd {
    Shutdown,
}

pub struct Control {
    tx: Option<UnboundedSender<EventCmd>>,
}

impl Control {
    pub fn new() -> Self {
        Self { tx: None }
    }

    pub fn connect(&mut self, app: AppHandle) {
        self.disconnect();
        let (tx, rx) = unbounded_channel();
        self.tx = Some(tx);
        tauri::async_runtime::spawn(run(app, rx));
    }

    pub fn disconnect(&mut self) {
        if let Some(tx) = self.tx.take() {
            let _ = tx.send(EventCmd::Shutdown);
        }
    }
}

enum End {
    Shutdown,
    Switch(String),
    Dropped,
}

async fn run(app: AppHandle, mut rx: UnboundedReceiver<EventCmd>) {
    let mut url = EVENTSUB_URL.to_string();
    let mut failures = 0u32;
    loop {
        if failures > 0 {
            let _ = app.emit("eventsub-status", "reconnecting");
            let delay = Duration::from_secs(u64::from(failures.min(6)) * 2);
            tokio::select! {
                () = tokio::time::sleep(delay) => {}
                command = rx.recv() => {
                    if matches!(command, None | Some(EventCmd::Shutdown)) {
                        let _ = app.emit("eventsub-status", "disconnected");
                        return;
                    }
                }
            }
        } else {
            let _ = app.emit("eventsub-status", "connecting");
        }
        match session(&app, &url, &mut rx).await {
            End::Shutdown => {
                let _ = app.emit("eventsub-status", "disconnected");
                return;
            }
            End::Switch(next) => {
                url = next;
                failures = 0;
            }
            End::Dropped => {
                failures = failures.saturating_add(1).min(8);
                url = EVENTSUB_URL.to_string();
            }
        }
    }
}

async fn session(app: &AppHandle, url: &str, rx: &mut UnboundedReceiver<EventCmd>) -> End {
    if validate_eventsub_url(url).is_err() {
        return End::Dropped;
    }
    let Ok((socket, _)) = connect_async(url).await else {
        return End::Dropped;
    };
    let (mut write, mut read) = socket.split();
    let mut keepalive = Duration::from_secs(30);
    let mut last = Instant::now();
    loop {
        let remaining = (keepalive + Duration::from_secs(8)).saturating_sub(last.elapsed());
        tokio::select! {
            () = tokio::time::sleep(remaining) => return End::Dropped,
            command = rx.recv() => {
                if matches!(command, None | Some(EventCmd::Shutdown)) {
                    let _ = write.send(Message::Close(None)).await;
                    return End::Shutdown;
                }
            }
            incoming = read.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        last = Instant::now();
                        let body = text.to_string();
                        if let Some(seconds) = keepalive_timeout_secs(&body) {
                            keepalive = Duration::from_secs(seconds);
                        }
                        let reconnect = eventsub_reconnect_url(&body);
                        let _ = app.emit("eventsub-message", body);
                        if let Some(next) = reconnect {
                            return End::Switch(next);
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        last = Instant::now();
                        if write.send(Message::Pong(payload)).await.is_err() {
                            return End::Dropped;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None | Some(Err(_)) => return End::Dropped,
                    _ => {}
                }
            }
        }
    }
}
