//! Java automático usando os runtimes oficiais da Mojang no Desktop
//! e os runtimes OpenJDK ARM64 (8, 17, 21, 25) empacotados no Android via libjava_exec.so / Amethyst.

use crate::download::{self, Job};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::AppHandle;

const RUNTIME_INDEX: &str =
    "https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json";

#[derive(Deserialize)]
struct RuntimeEntry {
    manifest: ManifestRef,
}
#[derive(Deserialize)]
struct ManifestRef {
    url: String,
}
#[derive(Deserialize)]
struct RuntimeManifest {
    files: HashMap<String, RuntimeFile>,
}
#[derive(Deserialize)]
struct RuntimeFile {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    executable: bool,
    downloads: Option<RuntimeDownloads>,
}
#[derive(Deserialize)]
struct RuntimeDownloads {
    raw: RawDownload,
}
#[derive(Deserialize)]
struct RawDownload {
    url: String,
    sha1: String,
    size: u64,
}

/// Chave de plataforma usada no índice de runtimes da Mojang.
pub fn platform_key() -> &'static str {
    if cfg!(target_os = "android") {
        return match std::env::consts::ARCH {
            "aarch64" => "linux-arm64",
            "arm" => "linux-arm32",
            "x86_64" => "linux",
            "x86" => "linux-i386",
            _ => "linux-arm64",
        };
    }
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "windows-x64",
        ("windows", "aarch64") => "windows-arm64",
        ("windows", _) => "windows-x86",
        ("macos", "aarch64") => "mac-os-arm64",
        ("macos", _) => "mac-os",
        ("linux", "aarch64") => "linux-arm64",
        ("linux", "x86") => "linux-i386",
        _ => "linux",
    }
}

fn java_bin(dir: &std::path::Path, console: bool) -> PathBuf {
    if cfg!(target_os = "windows") {
        dir.join("bin").join(if console { "java.exe" } else { "javaw.exe" })
    } else if cfg!(target_os = "macos") {
        dir.join("jre.bundle/Contents/Home/bin/java")
    } else {
        dir.join("bin/java")
    }
}

pub fn android_runtime_name(component: &str) -> &'static str {
    match component {
        "jre-legacy" => "Internal",
        "java-runtime-alpha" | "java-runtime-beta" | "java-runtime-gamma" | "java-runtime-gamma-snapshot" => "Internal-17",
        "java-runtime-delta" => "Internal-21",
        _ => "Internal-25",
    }
}

pub fn android_native_lib_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let root = crate::paths::root(app)?;
    if let Ok(txt) = std::fs::read_to_string(root.join(".native_lib_dir")) {
        let p = PathBuf::from(txt.trim());
        if p.exists() {
            return Ok(p);
        }
    }
    if let Ok(maps) = std::fs::read_to_string("/proc/self/maps") {
        for line in maps.lines() {
            if let Some(idx) = line.find('/') {
                let path_str = line[idx..].trim();
                if path_str.ends_with("/libtropicalia_launcher_lib.so") {
                    if let Some(parent) = std::path::Path::new(path_str).parent() {
                        return Ok(parent.to_path_buf());
                    }
                }
            }
        }
    }
    Err("Não foi possível localizar nativeLibraryDir no Android".into())
}

pub fn android_runtime_dir(app: &AppHandle, component: &str) -> Result<PathBuf, String> {
    let root = crate::paths::root(app)?;
    let data_dir = root.parent().unwrap_or(&root);
    let rt_root = data_dir.join("runtimes");
    let preferred = rt_root.join(android_runtime_name(component));
    if preferred.join("release").exists() {
        return Ok(preferred);
    }
    for fallback in ["Internal-25", "Internal-21", "Internal-17", "Internal"] {
        let p = rt_root.join(fallback);
        if p.join("release").exists() {
            return Ok(p);
        }
    }
    Ok(preferred)
}

pub fn configure_command(cmd: &mut tokio::process::Command, app: &AppHandle, component: &str) {
    #[cfg(target_os = "android")]
    {
        if let (Ok(rt_dir), Ok(native_dir)) = (android_runtime_dir(app, component), android_native_lib_dir(app)) {
            let mut ld_paths = vec![
                rt_dir.join("lib"),
                rt_dir.join("lib/jli"),
                rt_dir.join("lib/server"),
                rt_dir.join("lib/aarch64"),
                rt_dir.join("lib/aarch64/jli"),
                rt_dir.join("lib/aarch64/server"),
                native_dir,
            ];
            if let Ok(existing) = std::env::var("LD_LIBRARY_PATH") {
                if !existing.is_empty() {
                    ld_paths.push(PathBuf::from(existing));
                }
            }
            let ld = ld_paths.iter().map(|p| p.to_string_lossy().to_string()).collect::<Vec<_>>().join(":");
            cmd.env("JAVA_HOME", &rt_dir);
            cmd.env("LD_LIBRARY_PATH", ld);
            cmd.arg(format!("-Djava.home={}", rt_dir.display()));
            if let Ok(cache) = crate::paths::cache(app) {
                cmd.arg(format!("-Djava.io.tmpdir={}", cache.display()));
            }
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (cmd, app, component);
    }
}

/// Garante que o runtime `component` está instalado e devolve o caminho do executável java.
/// `console = true` usa java.exe (servidores, instaladores); `false` usa javaw.exe no Windows (jogo, sem janela preta).
pub async fn ensure(
    app: &AppHandle,
    client: &reqwest::Client,
    owner: &str,
    component: &str,
    console: bool,
) -> Result<PathBuf, String> {
    #[cfg(target_os = "android")]
    {
        let _ = (client, console);
        let rt_name = android_runtime_name(component);
        let root = crate::paths::root(app)?;
        let data_dir = root.parent().unwrap_or(&root);
        let rt_dir = data_dir.join("runtimes").join(rt_name);
        for attempt in 0..75 {
            if rt_dir.join("release").exists() {
                break;
            }
            if attempt % 5 == 0 {
                download::emit(app, owner, "java", attempt, 75, format!("Descompactando Java Android ({rt_name})…"));
            }
            tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        }
        let native_dir = android_native_lib_dir(app)?;
        let exec = native_dir.join("libjava_exec.so");
        if exec.exists() {
            return Ok(exec);
        }
        return Err(format!("Executor Java Android não encontrado em {}", exec.display()));
    }

    #[cfg(not(target_os = "android"))]
    {
        let dir = crate::paths::runtimes(app)?.join(crate::paths::safe_name(component)?);
        let marker = dir.join(".tropicalia-ok");
        let bin = java_bin(&dir, console);
        if marker.exists() && bin.exists() {
            return Ok(bin);
        }

        download::emit(app, owner, "java", 0, 1, format!("Buscando Java ({component})"));
        let index: HashMap<String, HashMap<String, Vec<RuntimeEntry>>> =
            download::get_json(client, RUNTIME_INDEX).await?;
        let entry = index
            .get(platform_key())
            .and_then(|p| p.get(component))
            .and_then(|v| v.first())
            .ok_or_else(|| {
                format!(
                    "A Mojang não publica o Java '{component}' para {}. Defina um Java manual em Ajustes.",
                    platform_key()
                )
            })?;
        let manifest: RuntimeManifest = download::get_json(client, &entry.manifest.url).await?;

        let mut jobs = Vec::new();
        let mut executables = Vec::new();
        for (rel, file) in &manifest.files {
            let path = crate::paths::join_inside(&dir, rel)?;
            match file.kind.as_str() {
                "directory" => {
                    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
                }
                "file" => {
                    if let Some(d) = &file.downloads {
                        jobs.push(Job {
                            url: d.raw.url.clone(),
                            path: path.clone(),
                            sha1: Some(d.raw.sha1.clone()),
                            sha256: None,
                            size: Some(d.raw.size),
                        });
                        if file.executable {
                            executables.push(path);
                        }
                    }
                }
                _ => {}
            }
        }
        download::fetch_all(app, client, owner, "java", jobs, 16).await?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for p in executables {
                let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755));
            }
        }
        #[cfg(not(unix))]
        let _ = executables;

        if !bin.exists() {
            return Err(format!("Java instalado mas o executável não foi encontrado em {}", bin.display()));
        }
        std::fs::write(&marker, component).map_err(|e| e.to_string())?;
        Ok(bin)
    }
}

/// Resolve o java: caminho manual (se informado e existente) ou runtime automático.
pub async fn resolve(
    app: &AppHandle,
    client: &reqwest::Client,
    owner: &str,
    custom: Option<&str>,
    component: &str,
    console: bool,
) -> Result<PathBuf, String> {
    if let Some(c) = custom.map(str::trim).filter(|c| !c.is_empty()) {
        let p = PathBuf::from(c);
        if p.exists() {
            return Ok(p);
        }
        return Err(format!("Java manual não encontrado: {c}"));
    }
    ensure(app, client, owner, component, console).await
}
