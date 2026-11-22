//! Touch controls shared by both Android engines.
//!
//! The launcher renders one layout (see `src/lib/controls.ts`) and sends it here before a
//! game starts. Horizon gets `horizon-touch.json` plus its touch theme sprites; Pojav gets a
//! zipped control map whose buttons use the same images.

use serde::Deserialize;
use serde_json::Value;
use tauri::AppHandle;

/// Android document picker: content:// URIs must be handled by ContentResolver.
#[tauri::command]
pub async fn controls_transfer(app: AppHandle, mode: String, text: Option<String>) -> Result<Option<String>, String> {
    if mode != "import" && mode != "export" { return Err("Invalid transfer mode".into()); }
    if text.as_ref().is_some_and(|v| v.len() > 32000) { return Err("Layout too large".into()); }
    #[cfg(not(target_os = "android"))]
    { let _ = app; Err("Android document picker only".into()) }
    #[cfg(target_os = "android")]
    {
        let root = crate::paths::root(&app)?;
        let reply = root.join("tropicalia-controls-transfer-result.json");
        let _ = std::fs::remove_file(&reply);
        let request = serde_json::json!({ "mode": mode, "text": text });
        let temporary = root.join("tropicalia-controls-transfer.tmp");
        std::fs::write(&temporary, request.to_string()).map_err(|e| e.to_string())?;
        std::fs::rename(temporary, root.join("tropicalia-controls-transfer.json")).map_err(|e| e.to_string())?;
        for _ in 0..2400 {
            tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            if let Ok(raw) = std::fs::read_to_string(&reply) {
                let data: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
                let _ = std::fs::remove_file(&reply);
                if let Some(error) = data["error"].as_str() { return Err(error.to_owned()); }
                return Ok(data["text"].as_str().map(str::to_owned));
            }
        }
        Err("Document picker timed out".into())
    }
}

#[derive(Deserialize)]
pub struct Image {
    pub name: String,
    pub png: Vec<u8>,
}

#[derive(Deserialize)]
pub struct Images {
    pub horizon: Vec<Image>,
    pub pojav: Vec<Image>,
}

#[derive(Deserialize)]
pub struct Bundle {
    pub horizon: Value,
    pub pojav: Value,
    pub images: Images,
}

#[cfg(target_os = "android")]
fn safe_image_name(name: &str) -> Result<&str, String> {
    let valid = name.ends_with(".png")
        && name.len() <= 64
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.')
        && !name.starts_with('.');
    if valid { Ok(name) } else { Err(format!("Nome de imagem inválido: {name}")) }
}

/// Writes the controls for both engines. A no-op off Android, where neither engine uses touch.
#[tauri::command]
pub async fn controls_apply(app: AppHandle, bundle: Bundle) -> Result<(), String> {
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, bundle);
        Ok(())
    }
    #[cfg(target_os = "android")]
    {
        use std::io::Write;
        let root = crate::paths::root(&app)?;
        let files = root.join("files");
        for image in bundle.images.horizon.iter().chain(&bundle.images.pojav) {
            safe_image_name(&image.name)?;
        }

        // Horizon: theme sprites under the prepared resources of each home it may use.
        for base in [&root, &files] {
            let theme = base
                .join(".local/horizon-client/26.3/assets/minecraft/textures/gui/horizon/touch");
            std::fs::create_dir_all(&theme).map_err(|e| e.to_string())?;
            for image in &bundle.images.horizon {
                std::fs::write(theme.join(&image.name), &image.png).map_err(|e| e.to_string())?;
            }
        }

        // Horizon: merge the placements into every touch settings file it reads.
        let mut homes = vec![root.clone(), files.clone()];
        if let Ok(entries) = std::fs::read_dir(root.join("instances")) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    homes.push(entry.path());
                }
            }
        }
        let Value::Object(fields) = &bundle.horizon else {
            return Err("Layout do Horizon inválido".into());
        };
        for home in homes {
            let path = home.join("horizon-touch.json");
            let mut settings = std::fs::read(&path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                .filter(Value::is_object)
                .unwrap_or_else(|| serde_json::json!({}));
            for (key, value) in fields {
                settings[key] = value.clone();
            }
            let bytes = serde_json::to_vec_pretty(&settings).map_err(|e| e.to_string())?;
            std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        }

        // Pojav: a zipped control map (layout.json + button images), atomically replaced.
        let controlmap = root.join("controlmap");
        std::fs::create_dir_all(&controlmap).map_err(|e| e.to_string())?;
        let temporary = controlmap.join("tropicalia.json.tmp");
        {
            let file = std::fs::File::create(&temporary).map_err(|e| e.to_string())?;
            let mut zip = zip::ZipWriter::new(file);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("layout.json", options).map_err(|e| e.to_string())?;
            zip.write_all(&serde_json::to_vec(&bundle.pojav).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            for image in &bundle.images.pojav {
                zip.start_file(image.name.as_str(), options).map_err(|e| e.to_string())?;
                zip.write_all(&image.png).map_err(|e| e.to_string())?;
            }
            zip.finish().map_err(|e| e.to_string())?;
        }
        std::fs::rename(&temporary, controlmap.join("tropicalia.json")).map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Asks the Android activity to lock (or release) landscape while the controls editor is open.
#[tauri::command]
pub async fn controls_orientation(app: AppHandle, landscape: bool) -> Result<(), String> {
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, landscape);
        Ok(())
    }
    #[cfg(target_os = "android")]
    {
        let root = crate::paths::root(&app)?;
        let body = serde_json::json!({ "landscape": landscape }).to_string();
        let temporary = root.join("tropicalia-orientation.tmp");
        std::fs::write(&temporary, body).map_err(|e| e.to_string())?;
        std::fs::rename(temporary, root.join("tropicalia-orientation.json")).map_err(|e| e.to_string())
    }
}
