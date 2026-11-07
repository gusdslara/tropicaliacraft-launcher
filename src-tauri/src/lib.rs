//! Tropicalia Universal Launcher — backend Tauri v2.

mod content;
mod download;
mod game;
mod java;
mod paths;
mod server;
mod system;
mod tray;
mod updater;

use std::collections::HashMap;
use tauri::{Manager, WindowEvent};
use tokio::sync::Mutex;

pub struct AppState {
    pub http: reqwest::Client,
    /// instância → pid do jogo
    pub games: Mutex<HashMap<String, u32>>,
    pub servers: Mutex<HashMap<String, server::RunningServer>>,
    pub tray: std::sync::Mutex<Option<tray::TrayItems>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            http: download::client(),
            games: Mutex::new(HashMap::new()),
            servers: Mutex::new(HashMap::new()),
            tray: std::sync::Mutex::new(None),
        })
        .setup(|app| {
            tray::setup(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            // Com jogo ou servidor rodando, fechar a janela só esconde na bandeja.
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.app_handle().state::<AppState>();
                let busy = state.games.try_lock().map(|g| !g.is_empty()).unwrap_or(true)
                    || state.servers.try_lock().map(|s| !s.is_empty()).unwrap_or(true);
                if busy {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            game::game_launch,
            game::game_kill,
            game::game_running,
            game::horizon_options_get,
            game::horizon_options_set,
            game::horizon_prepare_sync,
            content::content_list,
            content::content_toggle,
            content::content_delete,
            content::content_install,
            content::instance_delete,
            content::instance_clone,
            content::instance_export,
            content::mrpack_install,
            content::path_of,
            server::server_install,
            server::server_installed,
            server::server_set_eula,
            server::server_read_properties,
            server::server_write_properties,
            server::server_start,
            server::server_command,
            server::server_stop,
            server::server_running,
            server::server_delete,
            server::local_ips,
            system::system_info,
            system::secret_set,
            system::secret_get,
            system::secret_delete,
            updater::apply_launcher_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
