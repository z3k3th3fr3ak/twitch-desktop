use crate::protocol::normalize_login;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayChannel {
    pub login: String,
    pub display_name: String,
    pub viewers: u64,
}

pub fn install(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app, &[])?;
    let mut builder = TrayIconBuilder::with_id("glint")
        .tooltip("Glint")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                reveal(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn set_live(app: &AppHandle, channels: &[TrayChannel]) -> tauri::Result<()> {
    let menu = build_menu(app, channels)?;
    if let Some(tray) = app.tray_by_id("glint") {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}

fn build_menu(app: &AppHandle, channels: &[TrayChannel]) -> tauri::Result<Menu<tauri::Wry>> {
    let open = MenuItem::with_id(app, "open", "Open Glint", true, None::<&str>)?;
    let overlay = MenuItem::with_id(app, "overlay", "Chat overlay", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Glint", true, None::<&str>)?;
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<tauri::Wry>>> = vec![
        Box::new(open),
        Box::new(overlay),
        Box::new(PredefinedMenuItem::separator(app)?),
    ];
    let mut added = 0u32;
    for channel in channels {
        let Ok(login) = normalize_login(&channel.login) else {
            continue;
        };
        if added == 8 {
            break;
        }
        let label = format!("{} · {}", channel.display_name, viewers(channel.viewers));
        items.push(Box::new(MenuItem::with_id(
            app,
            format!("watch-{login}"),
            label,
            true,
            None::<&str>,
        )?));
        added += 1;
    }
    if added == 0 {
        items.push(Box::new(MenuItem::with_id(
            app,
            "nobody",
            "No favorites live",
            false,
            None::<&str>,
        )?));
    }
    items.push(Box::new(PredefinedMenuItem::separator(app)?));
    items.push(Box::new(quit));
    let refs: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        items.iter().map(|item| item.as_ref()).collect();
    Menu::with_items(app, &refs)
}

fn viewers(count: u64) -> String {
    if count < 1000 {
        return count.to_string();
    }
    if count < 1_000_000 {
        return format!("{:.1}k", count as f64 / 1000.0);
    }
    format!("{:.1}m", count as f64 / 1_000_000.0)
}

fn handle(app: &AppHandle, id: &str) {
    match id {
        "open" => reveal(app),
        "quit" => app.exit(0),
        "overlay" => {
            let _ = app.emit("tray-overlay", ());
        }
        "nobody" => {}
        other => {
            if let Some(login) = other.strip_prefix("watch-") {
                reveal(app);
                let _ = app.emit("tray-watch", login.to_string());
            }
        }
    }
}

pub fn reveal(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}
