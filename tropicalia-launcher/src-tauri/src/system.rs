//! Informações do sistema e cofre de segredos.

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub total_memory_mb: u64,
    pub cpus: usize,
    pub java_platform: String,
}

#[tauri::command]
pub fn system_info() -> SystemInfo {
    let mut sys = sysinfo::System::new();
    sys.refresh_memory();
    SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        total_memory_mb: sys.total_memory() / 1024 / 1024,
        cpus: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
        java_platform: crate::java::platform_key().to_string(),
    }
}

const SERVICE: &str = "TropicaliaLauncher";

/// Guarda o refresh token da Microsoft no cofre do SO
/// (Windows Credential Manager, macOS Keychain, Linux Secret Service).
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn secret_set(key: String, value: String) -> Result<(), String> {
    keyring::Entry::new(SERVICE, &key).and_then(|e| e.set_password(&value)).map_err(|e| e.to_string())
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn secret_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn secret_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, &key).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

// No mobile ainda não há cofre nativo ligado: o frontend cai para o store do app.
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub fn secret_set(_key: String, _value: String) -> Result<(), String> {
    Err("unsupported".into())
}
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub fn secret_get(_key: String) -> Result<Option<String>, String> {
    Err("unsupported".into())
}
#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub fn secret_delete(_key: String) -> Result<(), String> {
    Err("unsupported".into())
}
