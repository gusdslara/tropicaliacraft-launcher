//! Bandeja do sistema (Windows/Linux/macOS).
//! Menu: Abrir Launcher · Status do servidor · Parar servidor local · Fechar tudo.

use crate::AppState;
use tauri::{AppHandle, Manager};

#[cfg(desktop)]
use tauri::Wry;

#[cfg(desktop)]
pub struct TrayItems {
    pub status: tauri::menu::MenuItem<Wry>,
    pub game: tauri::menu::MenuItem<Wry>,
    pub stop: tauri::menu::MenuItem<Wry>,
    pub tray: tauri::tray::TrayIcon<Wry>,
}

#[cfg(not(desktop))]
pub struct TrayItems;

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        #[cfg(desktop)]
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

#[cfg(desktop)]
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let open = MenuItemBuilder::with_id("open", "Abrir Launcher").build(app)?;
    let status = MenuItemBuilder::with_id("status", "Servidor: parado").enabled(false).build(app)?;
    let game = MenuItemBuilder::with_id("game", "Jogo: fechado").enabled(false).build(app)?;
    let stop = MenuItemBuilder::with_id("stop", "Parar servidor local").enabled(false).build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Fechar tudo").build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&open)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&status)
        .item(&game)
        .item(&stop)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&quit)
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Tropicalia Launcher")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "stop" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let state = app.state::<AppState>();
                    let ids: Vec<String> = state.servers.lock().await.keys().cloned().collect();
                    for id in ids {
                        let _ = crate::server::stop(&app, &state, &id).await;
                    }
                });
            }
            "quit" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move { quit_all(app).await });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    let tray = builder.build(app)?;

    let state = app.state::<AppState>();
    *state.tray.lock().unwrap() = Some(TrayItems { status, game, stop, tray });
    Ok(())
}

#[cfg(not(desktop))]
pub fn setup(_app: &AppHandle) -> tauri::Result<()> {
    Ok(())
}

#[cfg(desktop)]
/// Atualiza os textos do menu da bandeja conforme jogos/servidores rodando.
pub async fn refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let servers: Vec<String> = state.servers.lock().await.values().map(|s| s.name.clone()).collect();
    let games = state.games.lock().await.len();
    let guard = state.tray.lock().unwrap();
    let Some(items) = guard.as_ref() else { return };
    let status = if servers.is_empty() { "Servidor: parado".to_string() } else { format!("Servidor: rodando ({})", servers.join(", ")) };
    let _ = items.status.set_text(&status);
    let _ = items.stop.set_enabled(!servers.is_empty());
    let _ = items.game.set_text(if games > 0 { "Jogo: aberto" } else { "Jogo: fechado" });
    let tip = match (games > 0, !servers.is_empty()) {
        (true, true) => "Tropicalia Launcher — jogando + servidor ativo",
        (true, false) => "Tropicalia Launcher — jogando",
        (false, true) => "Tropicalia Launcher — servidor ativo",
        _ => "Tropicalia Launcher",
    };
    let _ = items.tray.set_tooltip(Some(tip));
}

#[cfg(not(desktop))]
pub async fn refresh(_app: &AppHandle) {}

/// Para os servidores com `stop` (salvando o mundo) e fecha o launcher.
pub async fn quit_all(app: AppHandle) {
    let state = app.state::<AppState>();
    let ids: Vec<String> = state.servers.lock().await.keys().cloned().collect();
    for id in &ids {
        let _ = crate::server::stop(&app, &state, id).await;
    }
    for _ in 0..70 {
        if state.servers.lock().await.is_empty() {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    app.exit(0);
}
