//! Conteúdo das instâncias: mods, resource packs, shaders e data packs.
//! Ativar/desativar = renomear para `.disabled` (o arquivo nunca é apagado).
//! Exporta `.mrpack` (formato Modrinth) e `.zip`, e instala modpacks `.mrpack`.

use crate::download::{self, Job};
use crate::{AppState, paths};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentFile {
    /// Nome sem o sufixo `.disabled`
    pub filename: String,
    pub enabled: bool,
    pub size: u64,
    pub sha1: Option<String>,
}

fn base_dir(app: &AppHandle, owner_kind: &str, owner_id: &str) -> Result<PathBuf, String> {
    match owner_kind {
        "server" => paths::server(app, owner_id),
        _ => paths::instance(app, owner_id),
    }
}

fn resolve_content_dir(app: &AppHandle, owner_kind: &str, owner_id: &str, kind: &str) -> Result<PathBuf, String> {
    let base = base_dir(app, owner_kind, owner_id)?;
    if kind == "mod" || kind == "mods" {
        let horizon_mods = base.join("horizon-mods");
        let java_mods = base.join("mods");
        if horizon_mods.exists() && !java_mods.exists() {
            return Ok(horizon_mods);
        }
    }
    let sub = paths::content_folder(kind)?;
    let p = base.join(sub);
    let _ = std::fs::create_dir_all(&p);
    Ok(p)
}

#[tauri::command]
pub fn content_list(app: AppHandle, owner_kind: String, owner_id: String, kind: String, with_hash: Option<bool>) -> Result<Vec<ContentFile>, String> {
    let dir = resolve_content_dir(&app, &owner_kind, &owner_id, &kind)?;
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(&dir) else { return Ok(out) };
    for e in rd.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name.ends_with(".part") {
            continue;
        }
        let meta = match e.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let (filename, enabled) = match name.strip_suffix(".disabled") {
            Some(n) => (n.to_string(), false),
            None => (name.clone(), true),
        };
        let sha1 = if with_hash.unwrap_or(false) && meta.is_file() { download::sha1_file(&e.path()) } else { None };
        out.push(ContentFile { filename, enabled, size: meta.len(), sha1 });
    }
    out.sort_by_key(|f| f.filename.to_lowercase());
    Ok(out)
}

#[tauri::command]
pub fn content_toggle(app: AppHandle, owner_kind: String, owner_id: String, kind: String, filename: String, enabled: bool) -> Result<(), String> {
    let dir = resolve_content_dir(&app, &owner_kind, &owner_id, &kind)?;
    let name = paths::safe_name(&filename)?;
    let on = dir.join(name);
    let off = dir.join(format!("{name}.disabled"));
    let (from, to) = if enabled { (off, on) } else { (on, off) };
    if !from.exists() {
        return if to.exists() { Ok(()) } else { Err(format!("Arquivo não encontrado: {name}")) };
    }
    std::fs::rename(from, to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn content_delete(app: AppHandle, owner_kind: String, owner_id: String, kind: String, filename: String) -> Result<(), String> {
    let dir = resolve_content_dir(&app, &owner_kind, &owner_id, &kind)?;
    let name = paths::safe_name(&filename)?;
    for p in [dir.join(name), dir.join(format!("{name}.disabled"))] {
        if p.is_dir() {
            std::fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
        } else if p.exists() {
            std::fs::remove_file(&p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallFile {
    pub url: String,
    pub filename: String,
    pub sha1: Option<String>,
    pub sha256: Option<String>,
    pub size: Option<u64>,
}

/// Baixa arquivos (mod + dependências) para a pasta de conteúdo da instância/servidor.
#[tauri::command]
pub async fn content_install(
    app: AppHandle,
    state: State<'_, AppState>,
    owner_kind: String,
    owner_id: String,
    kind: String,
    files: Vec<InstallFile>,
) -> Result<(), String> {
    let dir = resolve_content_dir(&app, &owner_kind, &owner_id, &kind)?;
    let mut jobs = Vec::new();
    for f in files {
        jobs.push(Job { url: f.url, path: dir.join(paths::safe_name(&f.filename)?), sha1: f.sha1, sha256: f.sha256, size: f.size });
    }
    download::fetch_all(&app, &state.http, &owner_id, "content", jobs, 6).await
}

#[tauri::command]
pub fn instance_delete(app: AppHandle, instance_id: String) -> Result<(), String> {
    let dir = paths::instance(&app, &instance_id)?;
    std::fs::remove_dir_all(dir).map_err(|e| e.to_string())
}

/// Copia a pasta de uma instância (clonar). Pula logs e crash-reports.
#[tauri::command]
pub fn instance_clone(app: AppHandle, from_id: String, to_id: String) -> Result<(), String> {
    let from = paths::instance(&app, &from_id)?;
    let to = paths::instance(&app, &to_id)?;
    copy_dir(&from, &to, &["logs", "crash-reports", ".tropicalia-launch.args"])
}

fn copy_dir(from: &Path, to: &Path, skip: &[&str]) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for e in std::fs::read_dir(from).map_err(|e| e.to_string())?.flatten() {
        let name = e.file_name();
        if skip.iter().any(|s| name == *s) {
            continue;
        }
        let target = to.join(&name);
        if e.path().is_dir() {
            copy_dir(&e.path(), &target, &[])?;
        } else {
            std::fs::copy(e.path(), &target).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn path_of(app: AppHandle, what: String, id: Option<String>) -> Result<String, String> {
    let p = match what.as_str() {
        "instance" => paths::instance(&app, id.as_deref().unwrap_or_default())?,
        "server" => paths::server(&app, id.as_deref().unwrap_or_default())?,
        "root" => paths::root(&app)?,
        other => return Err(format!("pasta desconhecida: {other}")),
    };
    Ok(p.to_string_lossy().to_string())
}

// ---------------------------------------------------------------- exportação

const EXPORT_FOLDERS: &[&str] = &["mods", "resourcepacks", "shaderpacks", "config", "datapacks", "defaultconfigs", "kubejs"];
const EXPORT_FILES: &[&str] = &["options.txt", "servers.dat"];

/// Exporta a instância.
/// - `format = "mrpack"`: `index_json` (modrinth.index.json montado no frontend) + overrides
///   com tudo que NÃO está no índice (configs, mods manuais…).
/// - `format = "zip"`: cópia simples das pastas de conteúdo.
#[tauri::command]
pub fn instance_export(app: AppHandle, instance_id: String, format: String, index_json: Option<String>, dest: String) -> Result<(), String> {
    let base = paths::instance(&app, &instance_id)?;
    let file = std::fs::File::create(&dest).map_err(|e| format!("{dest}: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let mut indexed = std::collections::HashSet::new();
    let prefix = if format == "mrpack" {
        let index = index_json.ok_or("modrinth.index.json ausente")?;
        let parsed: Value = serde_json::from_str(&index).map_err(|e| e.to_string())?;
        for f in parsed.get("files").and_then(Value::as_array).into_iter().flatten() {
            if let Some(p) = f.get("path").and_then(Value::as_str) {
                indexed.insert(p.to_string());
            }
        }
        zip.start_file("modrinth.index.json", opts).map_err(|e| e.to_string())?;
        zip.write_all(index.as_bytes()).map_err(|e| e.to_string())?;
        "overrides/"
    } else {
        ""
    };

    let add = |rel: &str, abs: &Path, zip: &mut zip::ZipWriter<std::fs::File>| -> Result<(), String> {
        if indexed.contains(rel) || rel.ends_with(".disabled") {
            return Ok(());
        }
        zip.start_file(format!("{prefix}{rel}"), opts).map_err(|e| e.to_string())?;
        let mut f = std::fs::File::open(abs).map_err(|e| e.to_string())?;
        std::io::copy(&mut f, zip).map_err(|e| e.to_string())?;
        Ok(())
    };
    for folder in EXPORT_FOLDERS {
        let dir = base.join(folder);
        for path in walk(&dir) {
            let rel = path.strip_prefix(&base).unwrap().to_string_lossy().replace('\\', "/");
            add(&rel, &path, &mut zip)?;
        }
    }
    for f in EXPORT_FILES {
        let p = base.join(f);
        if p.is_file() {
            add(f, &p, &mut zip)?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

fn walk(dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(rd) = std::fs::read_dir(dir) else { return out };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            out.extend(walk(&p));
        } else {
            out.push(p);
        }
    }
    out
}

// ---------------------------------------------------------------- importação de modpack

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MrpackResult {
    pub name: String,
    pub version_id: String,
    /// ex.: { "minecraft": "1.20.1", "fabric-loader": "0.16.9" }
    pub dependencies: serde_json::Map<String, Value>,
    pub files: usize,
}

/// Instala um `.mrpack` (URL do Modrinth ou caminho local) dentro da instância.
#[tauri::command]
pub async fn mrpack_install(app: AppHandle, state: State<'_, AppState>, instance_id: String, source: String) -> Result<MrpackResult, String> {
    let base = paths::instance(&app, &instance_id)?;
    let client = state.http.clone();
    let pack_path = if source.starts_with("http://") || source.starts_with("https://") {
        let p = paths::cache(&app)?.join(format!("{}.mrpack", paths::safe_name(&instance_id)?));
        download::emit(&app, &instance_id, "modpack", 0, 1, "Baixando modpack");
        let _ = std::fs::remove_file(&p);
        download::fetch(&client, &Job { url: source, path: p.clone(), sha1: None, sha256: None, size: None }).await?;
        p
    } else {
        PathBuf::from(source)
    };

    let file = std::fs::File::open(&pack_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("Arquivo .mrpack inválido: {e}"))?;
    let mut index_text = String::new();
    zip.by_name("modrinth.index.json")
        .map_err(|_| "modrinth.index.json não encontrado no pacote")?
        .read_to_string(&mut index_text)
        .map_err(|e| e.to_string())?;
    let index: Value = serde_json::from_str(&index_text).map_err(|e| e.to_string())?;

    let mut jobs = Vec::new();
    for f in index.get("files").and_then(Value::as_array).into_iter().flatten() {
        if f.pointer("/env/client").and_then(Value::as_str) == Some("unsupported") {
            continue;
        }
        let Some(rel) = f.get("path").and_then(Value::as_str) else { continue };
        let Some(url) = f.pointer("/downloads/0").and_then(Value::as_str) else { continue };
        jobs.push(Job {
            url: url.to_string(),
            path: paths::join_inside(&base, rel)?,
            sha1: f.pointer("/hashes/sha1").and_then(Value::as_str).map(String::from),
            sha256: f.pointer("/hashes/sha256").and_then(Value::as_str).map(String::from),
            size: f.get("fileSize").and_then(Value::as_u64),
        });
    }
    let count = jobs.len();
    download::fetch_all(&app, &client, &instance_id, "modpack", jobs, 8).await?;

    // overrides/ e client-overrides/ (este último tem prioridade)
    for prefix in ["overrides/", "client-overrides/"] {
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            let name = entry.name().to_string();
            let Some(rel) = name.strip_prefix(prefix) else { continue };
            if entry.is_dir() || rel.is_empty() {
                continue;
            }
            let out = paths::join_inside(&base, rel)?;
            if let Some(p) = out.parent() {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
        }
    }

    Ok(MrpackResult {
        name: index.get("name").and_then(Value::as_str).unwrap_or("Modpack").to_string(),
        version_id: index.get("versionId").and_then(Value::as_str).unwrap_or_default().to_string(),
        dependencies: index.get("dependencies").and_then(Value::as_object).cloned().unwrap_or_default(),
        files: count,
    })
}
