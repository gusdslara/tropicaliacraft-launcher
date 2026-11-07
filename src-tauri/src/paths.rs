//! Layout de pastas do launcher.
//!
//! <app_data>/
//! ├── shared/            layout padrão .minecraft (versions, libraries, assets) compartilhado entre instâncias
//! ├── runtimes/<comp>/   Java oficial da Mojang (jre-legacy, java-runtime-gamma, java-runtime-delta…)
//! ├── instances/<id>/    gameDir de cada instância (mods, resourcepacks, shaderpacks, saves, config…)
//! ├── servers/<id>/      pasta de cada servidor local
//! └── cache/             downloads temporários (instaladores, .mrpack)

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

pub fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Não foi possível localizar a pasta de dados: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn sub(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let p = root(app)?.join(name);
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

pub fn shared(app: &AppHandle) -> Result<PathBuf, String> {
    sub(app, "shared")
}
pub fn runtimes(app: &AppHandle) -> Result<PathBuf, String> {
    sub(app, "runtimes")
}
pub fn cache(app: &AppHandle) -> Result<PathBuf, String> {
    sub(app, "cache")
}

/// Impede `..`, barras e nomes vazios em ids/arquivos vindos do frontend.
pub fn safe_name(name: &str) -> Result<&str, String> {
    let ok = !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\', ':', '\0'])
        && !name.starts_with('.');
    if ok { Ok(name) } else { Err(format!("Nome inválido: {name}")) }
}

pub fn instance(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let p = sub(app, "instances")?.join(safe_name(id)?);
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

pub fn server(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    let p = sub(app, "servers")?.join(safe_name(id)?);
    std::fs::create_dir_all(&p).map_err(|e| e.to_string())?;
    Ok(p)
}

/// Pastas de conteúdo aceitas dentro de uma instância.
pub fn content_folder(kind: &str) -> Result<&'static str, String> {
    Ok(match kind {
        "mod" | "mods" => "mods",
        "horizon-mod" | "horizon-mods" | "rust-mods" => "horizon-mods",
        "resourcepack" | "resourcepacks" => "resourcepacks",
        "shader" | "shaderpacks" => "shaderpacks",
        "datapack" | "datapacks" => "datapacks",
        "plugin" | "plugins" => "plugins",
        "world" | "saves" => "saves",
        other => return Err(format!("Tipo de conteúdo desconhecido: {other}")),
    })
}

/// Junta um caminho relativo (vindo de um .mrpack, por exemplo) garantindo que ele não escape da base.
pub fn join_inside(base: &Path, rel: &str) -> Result<PathBuf, String> {
    let rel = rel.replace('\\', "/");
    let mut out = base.to_path_buf();
    for part in rel.split('/') {
        match part {
            "" | "." => {}
            ".." => return Err(format!("Caminho inseguro: {rel}")),
            p if p.contains(':') => return Err(format!("Caminho inseguro: {rel}")),
            p => out.push(p),
        }
    }
    if out == base {
        return Err(format!("Caminho vazio: {rel}"));
    }
    Ok(out)
}
