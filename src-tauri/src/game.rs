//! Instalação e inicialização do Minecraft: Java Edition.
//!
//! Fluxo do botão JOGAR:
//! 1. JSON da versão vanilla (manifesto oficial da Mojang)
//! 2. Perfil do modloader (Fabric/Quilt via meta API; Forge/NeoForge via instalador oficial headless)
//! 3. Merge `inheritsFrom` → bibliotecas, natives, client.jar, assets, config de log
//! 4. Java oficial da Mojang para a versão
//! 5. Monta argumentos (formato novo `arguments` e legado `minecraftArguments`) e inicia o processo
//! 6. Esconde o launcher na bandeja e restaura quando o jogo fecha

use crate::download::{self, Job};
use crate::{AppState, java, paths};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};

const VERSION_MANIFEST: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const RESOURCES: &str = "https://resources.download.minecraft.net";
const LIBRARIES: &str = "https://libraries.minecraft.net/";

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAccount {
    pub username: String,
    pub uuid: String,
    pub access_token: String,
    /// "msa" (Microsoft) ou "legacy" (offline)
    pub user_type: String,
    #[serde(default)]
    pub xuid: Option<String>,
}

#[derive(Deserialize, Clone)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub instance_id: String,
    #[serde(default)]
    pub engine: Option<String>,
    pub game_version: String,
    pub loader: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    pub account: LaunchAccount,
    pub memory_min_mb: u32,
    pub memory_max_mb: u32,
    #[serde(default)]
    pub jvm_args: Vec<String>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub java_renderer: Option<String>,
    #[serde(default)]
    pub use_angle: Option<bool>,
    #[serde(default)]
    pub java_runtime: Option<String>,
    #[serde(default)]
    pub resolution: Option<Resolution>,
    #[serde(default)]
    pub hide_on_launch: bool,
    /// Caminho customizado para o executável Horizon Rust (opcional)
    #[serde(default)]
    pub rust_binary_path: Option<String>,
    /// "host[:porta]" para entrar direto num servidor (ex.: o TropicaliaCraft)
    #[serde(default)]
    pub server_address: Option<String>,
    #[serde(default)]
    pub horizon_render_distance: Option<u32>,
    #[serde(default)]
    pub horizon_lod_distance: Option<u32>,
    #[serde(default)]
    pub horizon_cave_culling: Option<bool>,
    #[serde(default)]
    pub horizon_entity_culling: Option<bool>,
    #[serde(default)]
    pub horizon_animated_textures: Option<bool>,
    #[serde(default)]
    pub horizon_fxaa: Option<bool>,
    #[serde(default)]
    pub horizon_fullbright: Option<bool>,
    #[serde(default)]
    pub horizon_dynamic_lights: Option<bool>,
    #[serde(default)]
    pub horizon_zoom: Option<bool>,
    #[serde(default)]
    pub horizon_fps: Option<bool>,
    #[serde(default)]
    pub horizon_keystrokes: Option<bool>,
    #[serde(default)]
    pub horizon_minimap: Option<bool>,
    #[serde(default)]
    pub horizon_discord_presence: Option<bool>,
    #[serde(default)]
    pub horizon_creative: Option<bool>,
    #[serde(default)]
    pub horizon_test_terrain: Option<bool>,
    #[serde(default)]
    pub horizon_pregen: Option<bool>,
    #[serde(default)]
    pub horizon_options: Option<HorizonOptions>,
    #[serde(default)]
    pub horizon_args: Option<Vec<String>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GameLog {
    owner: String,
    line: String,
    stream: &'static str,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GameExit {
    owner: String,
    code: Option<i32>,
}

// ---------------------------------------------------------------- versões

#[derive(Deserialize)]
struct Manifest {
    versions: Vec<ManifestVersion>,
}
#[derive(Deserialize)]
struct ManifestVersion {
    id: String,
    url: String,
    sha1: String,
}

fn version_json_path(shared: &Path, id: &str) -> PathBuf {
    shared.join("versions").join(id).join(format!("{id}.json"))
}

/// Baixa (ou reaproveita) o JSON da versão vanilla.
pub async fn ensure_vanilla_json(client: &reqwest::Client, shared: &Path, mc: &str) -> Result<Value, String> {
    let path = version_json_path(shared, mc);
    if let Ok(text) = std::fs::read_to_string(&path) {
        if let Ok(v) = serde_json::from_str::<Value>(&text) {
            if v.get("downloads").is_some() {
                return Ok(v);
            }
        }
    }
    let manifest: Manifest = download::get_json(client, VERSION_MANIFEST).await?;
    let entry = manifest
        .versions
        .iter()
        .find(|v| v.id == mc)
        .ok_or_else(|| format!("Versão {mc} não existe no manifesto da Mojang"))?;
    download::fetch(
        client,
        &Job { url: entry.url.clone(), path: path.clone(), sha1: Some(entry.sha1.clone()), sha256: None, size: None },
    )
    .await?;
    read_json(&path)
}

fn read_json(path: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{}: {e}", path.display()))
}

/// Componente de Java exigido por uma versão do jogo (lê o JSON oficial).
pub async fn java_component_for(client: &reqwest::Client, shared: &Path, mc: &str) -> Result<String, String> {
    let v = ensure_vanilla_json(client, shared, mc).await?;
    Ok(v.pointer("/javaVersion/component").and_then(Value::as_str).unwrap_or("jre-legacy").to_string())
}

/// Garante o perfil do modloader e devolve o id final da versão a ser iniciada.
async fn ensure_loader(app: &AppHandle, client: &reqwest::Client, shared: &Path, req: &LaunchRequest) -> Result<String, String> {
    let mc = req.game_version.as_str();
    let owner = req.instance_id.as_str();
    let loader_version = req.loader_version.clone().unwrap_or_default();
    match req.loader.as_str() {
        "vanilla" | "" => Ok(mc.to_string()),
        "fabric" | "quilt" => {
            if loader_version.is_empty() {
                return Err("Escolha a versão do loader nas configurações da instância".into());
            }
            let (url, prefix) = if req.loader == "fabric" {
                (format!("https://meta.fabricmc.net/v2/versions/loader/{mc}/{loader_version}/profile/json"), "fabric-loader")
            } else {
                (format!("https://meta.quiltmc.org/v3/versions/loader/{mc}/{loader_version}/profile/json"), "quilt-loader")
            };
            let guess = format!("{prefix}-{loader_version}-{mc}");
            if version_json_path(shared, &guess).exists() {
                return Ok(guess);
            }
            download::emit(app, owner, "loader", 0, 1, format!("Baixando perfil {}", req.loader));
            let profile: Value = download::get_json(client, &url).await?;
            let id = profile.get("id").and_then(Value::as_str).unwrap_or(&guess).to_string();
            let path = version_json_path(shared, paths::safe_name(&id)?);
            std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
            std::fs::write(&path, serde_json::to_vec_pretty(&profile).unwrap()).map_err(|e| e.to_string())?;
            Ok(id)
        }
        "forge" | "neoforge" => install_forge_like(app, client, shared, req, &loader_version).await,
        other => Err(format!("Modloader não suportado: {other}")),
    }
}

/// Roda o instalador oficial do Forge/NeoForge em modo headless (`--installClient`).
async fn install_forge_like(
    app: &AppHandle,
    client: &reqwest::Client,
    shared: &Path,
    req: &LaunchRequest,
    loader_version: &str,
) -> Result<String, String> {
    if loader_version.is_empty() {
        return Err("Escolha a versão do Forge/NeoForge nas configurações da instância".into());
    }
    let owner = req.instance_id.as_str();
    let marker = shared.join("versions").join(format!(".installed-{}-{}", req.loader, paths::safe_name(loader_version)?));
    if let Ok(id) = std::fs::read_to_string(&marker) {
        if version_json_path(shared, id.trim()).exists() {
            return Ok(id.trim().to_string());
        }
    }

    let (url, file) = if req.loader == "neoforge" {
        (
            format!("https://maven.neoforged.net/releases/net/neoforged/neoforge/{loader_version}/neoforge-{loader_version}-installer.jar"),
            format!("neoforge-{loader_version}-installer.jar"),
        )
    } else {
        (
            format!("https://maven.minecraftforge.net/net/minecraftforge/forge/{loader_version}/forge-{loader_version}-installer.jar"),
            format!("forge-{loader_version}-installer.jar"),
        )
    };
    let installer = paths::cache(app)?.join(&file);
    download::emit(app, owner, "loader", 0, 1, format!("Baixando instalador {}", req.loader));
    download::fetch(client, &Job { url, path: installer.clone(), sha1: None, sha256: None, size: None }).await?;

    // O instalador exige um launcher_profiles.json na pasta de destino.
    let profiles = shared.join("launcher_profiles.json");
    if !profiles.exists() {
        std::fs::write(&profiles, br#"{"profiles":{},"selectedProfile":null}"#).map_err(|e| e.to_string())?;
    }
    let component = java_component_for(client, shared, &req.game_version).await?;
    let java = java::resolve(app, client, owner, req.java_path.as_deref(), &component, true).await?;

    let before = list_versions(shared);
    download::emit(app, owner, "loader", 0, 1, format!("Instalando {} {loader_version} (pode levar alguns minutos)", req.loader));
    let mut cmd = tokio::process::Command::new(&java);
    java::configure_command(&mut cmd, app, &component);
    cmd.arg("-jar").arg(&installer).arg("--installClient").arg(shared).current_dir(shared);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped()).stdin(Stdio::null());
    hide_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Falha ao iniciar o instalador: {e}"))?;
    let stdout = child.stdout.take().unwrap();
    let app2 = app.clone();
    let owner2 = owner.to_string();
    let reader = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        let mut tail = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            download::emit(&app2, &owner2, "loader", 0, 1, line.chars().take(140).collect::<String>());
            tail.push(line);
            if tail.len() > 30 {
                tail.remove(0);
            }
        }
        tail
    });
    let status = child.wait().await.map_err(|e| e.to_string())?;
    let tail = reader.await.unwrap_or_default();
    if !status.success() {
        return Err(format!("O instalador do {} falhou:\n{}", req.loader, tail.join("\n")));
    }

    let after = list_versions(shared);
    let mut created: Vec<String> = after.difference(&before).cloned().collect();
    // Se já estava instalado (nada novo), procura pelo nome esperado.
    if created.is_empty() {
        let needle = if req.loader == "neoforge" { format!("neoforge-{loader_version}") } else { loader_version.replace(&format!("{}-", req.game_version), "") };
        created = after.into_iter().filter(|v| v.contains(&needle)).collect();
    }
    let id = created
        .into_iter()
        .find(|id| version_json_path(shared, id).exists())
        .ok_or("Instalador terminou mas a versão não apareceu em versions/")?;
    let _ = std::fs::write(&marker, &id);
    Ok(id)
}

fn list_versions(shared: &Path) -> HashSet<String> {
    std::fs::read_dir(shared.join("versions"))
        .map(|rd| rd.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).map(|e| e.file_name().to_string_lossy().to_string()).collect())
        .unwrap_or_default()
}

/// Carrega o JSON e resolve a cadeia `inheritsFrom` (filho tem prioridade).
fn load_merged(shared: &Path, id: &str) -> Result<Value, String> {
    let child = read_json(&version_json_path(shared, id))?;
    let Some(parent_id) = child.get("inheritsFrom").and_then(Value::as_str) else {
        return Ok(child);
    };
    let parent = load_merged(shared, parent_id)?;
    Ok(merge(parent, child))
}

fn merge(mut parent: Value, child: Value) -> Value {
    let (Some(p), Value::Object(c)) = (parent.as_object_mut(), child) else { return parent };
    for (k, v) in c {
        match k.as_str() {
            "inheritsFrom" => {}
            "libraries" => {
                let mut libs = v.as_array().cloned().unwrap_or_default();
                libs.extend(p.get("libraries").and_then(Value::as_array).cloned().unwrap_or_default());
                p.insert(k, Value::Array(libs));
            }
            "arguments" => {
                let mut args = p.get("arguments").cloned().unwrap_or(json!({}));
                for side in ["game", "jvm"] {
                    let mut list = args.get(side).and_then(Value::as_array).cloned().unwrap_or_default();
                    list.extend(v.get(side).and_then(Value::as_array).cloned().unwrap_or_default());
                    args[side] = Value::Array(list);
                }
                p.insert(k, args);
            }
            _ => {
                p.insert(k, v);
            }
        }
    }
    parent
}

// ---------------------------------------------------------------- regras e bibliotecas

fn os_name() -> &'static str {
    match std::env::consts::OS {
        "windows" => "windows",
        "macos" => "osx",
        _ => "linux",
    }
}

fn rules_allow(rules: Option<&Value>, features: &HashMap<&str, bool>) -> bool {
    let Some(rules) = rules.and_then(Value::as_array) else { return true };
    let mut allowed = false;
    for rule in rules {
        let mut matches = true;
        if let Some(os) = rule.get("os") {
            if let Some(name) = os.get("name").and_then(Value::as_str) {
                matches &= name == os_name();
            }
            if let Some(arch) = os.get("arch").and_then(Value::as_str) {
                let is_x86 = std::env::consts::ARCH == "x86";
                matches &= match arch {
                    "x86" => is_x86,
                    "x86_64" | "x64" => std::env::consts::ARCH == "x86_64",
                    "arm64" | "aarch64" => std::env::consts::ARCH == "aarch64",
                    _ => true,
                };
            }
        }
        if let Some(feats) = rule.get("features").and_then(Value::as_object) {
            for (k, v) in feats {
                matches &= features.get(k.as_str()).copied().unwrap_or(false) == v.as_bool().unwrap_or(false);
            }
        }
        if matches {
            allowed = rule.get("action").and_then(Value::as_str) == Some("allow");
        }
    }
    allowed
}

/// "grupo:artefato:versão[:classificador][@ext]" → caminho no repositório maven.
pub fn maven_path(name: &str) -> Option<String> {
    let (coords, ext) = match name.split_once('@') {
        Some((c, e)) => (c, e),
        None => (name, "jar"),
    };
    let parts: Vec<&str> = coords.split(':').collect();
    if parts.len() < 3 {
        return None;
    }
    let (group, artifact, version) = (parts[0].replace('.', "/"), parts[1], parts[2]);
    let file = match parts.get(3) {
        Some(classifier) => format!("{artifact}-{version}-{classifier}.{ext}"),
        None => format!("{artifact}-{version}.{ext}"),
    };
    Some(format!("{group}/{artifact}/{version}/{file}"))
}

fn lib_key(name: &str) -> String {
    let parts: Vec<&str> = name.split('@').next().unwrap_or(name).split(':').collect();
    match parts.as_slice() {
        [g, a, _v, c, ..] => format!("{g}:{a}:{c}"),
        [g, a, ..] => format!("{g}:{a}"),
        _ => name.to_string(),
    }
}

struct LibPlan {
    jobs: Vec<Job>,
    classpath: Vec<PathBuf>,
    natives: Vec<(PathBuf, Vec<String>)>,
}

fn plan_libraries(version: &Value, libdir: &Path) -> Result<LibPlan, String> {
    let mut plan = LibPlan { jobs: vec![], classpath: vec![], natives: vec![] };
    let mut seen = HashSet::new();
    let no_features = HashMap::new();
    let arch_bits = if cfg!(target_pointer_width = "64") { "64" } else { "32" };

    let has_sdl = version.get("libraries")
        .and_then(Value::as_array)
        .map(|libs| libs.iter().any(|l| l.get("name").and_then(Value::as_str).unwrap_or_default().contains("lwjgl-sdl")))
        .unwrap_or(false);

    for lib in version.get("libraries").and_then(Value::as_array).into_iter().flatten() {
        if !rules_allow(lib.get("rules"), &no_features) {
            continue;
        }
        let name = lib.get("name").and_then(Value::as_str).unwrap_or_default();
        if cfg!(target_os = "android") && !has_sdl && name.starts_with("org.lwjgl") {
            let keep = name.contains("lwjgl-sdl")
                || name.contains("lwjgl-vulkan")
                || name.contains("lwjgl-vma")
                || name.contains("lwjgl-shaderc")
                || name.contains("lwjgl-spvc");
            if !keep {
                continue;
            }
        }
        let key = lib_key(name);

        // No Android, aplica as mesmas atualizações de compatibilidade do Amethyst (Tools.preProcessLibraries)
        if cfg!(target_os = "android") {
            if name.starts_with("net.java.dev.jna:jna:") {
                if !seen.insert(key) {
                    continue;
                }
                let ver_str = name.split(':').nth(2).unwrap_or("5.13.0");
                let vparts: Vec<u32> = ver_str.split('.').filter_map(|s| s.parse().ok()).collect();
                let use_513 = vparts.first().copied().unwrap_or(0) < 5
                    || (vparts.first().copied().unwrap_or(0) == 5 && vparts.get(1).copied().unwrap_or(0) < 13);
                let (rel_jar, url_jar, sha1_jar, ver_aar) = if use_513 {
                    (
                        "net/java/dev/jna/jna/5.13.0/jna-5.13.0.jar".to_string(),
                        "https://repo1.maven.org/maven2/net/java/dev/jna/jna/5.13.0/jna-5.13.0.jar".to_string(),
                        Some("1200e7ebeedbe0d10062093f32925a912020e747".to_string()),
                        "5.13.0",
                    )
                } else {
                    let rel = maven_path(name).unwrap_or_else(|| format!("net/java/dev/jna/jna/{ver_str}/jna-{ver_str}.jar"));
                    let url = lib.pointer("/downloads/artifact/url").and_then(Value::as_str).unwrap_or_default().to_string();
                    let sha1 = lib.pointer("/downloads/artifact/sha1").and_then(Value::as_str).map(String::from);
                    (rel, url, sha1, ver_str)
                };
                let jar_path = paths::join_inside(libdir, &rel_jar)?;
                if !url_jar.is_empty() {
                    plan.jobs.push(Job { url: url_jar, path: jar_path.clone(), sha1: sha1_jar, sha256: None, size: None });
                }
                plan.classpath.push(jar_path);
                let rel_aar = format!("net/java/dev/jna/jna/{ver_aar}/jna-{ver_aar}.aar");
                let aar_path = paths::join_inside(libdir, &rel_aar)?;
                plan.jobs.push(Job {
                    url: format!("https://repo1.maven.org/maven2/{rel_aar}"),
                    path: aar_path.clone(),
                    sha1: None,
                    sha256: None,
                    size: None,
                });
                plan.natives.push((aar_path, vec![]));
                continue;
            } else if name.starts_with("com.github.oshi:oshi-core:6.2.") {
                if !seen.insert(key) {
                    continue;
                }
                let rel = "com/github/oshi/oshi-core/6.3.0/oshi-core-6.3.0.jar";
                let path = paths::join_inside(libdir, rel)?;
                plan.jobs.push(Job {
                    url: "https://repo1.maven.org/maven2/com/github/oshi/oshi-core/6.3.0/oshi-core-6.3.0.jar".into(),
                    path: path.clone(),
                    sha1: Some("9e98cf55be371cafdb9c70c35d04ec2a8c2b42ac".into()),
                    sha256: None,
                    size: None,
                });
                plan.classpath.push(path);
                continue;
            } else if name.starts_with("org.ow2.asm:asm-all:") {
                let ver_str = name.split(':').nth(2).unwrap_or("5.0.4");
                let major: u32 = ver_str.split('.').next().and_then(|s| s.parse().ok()).unwrap_or(5);
                if major < 5 {
                    if !seen.insert(key) {
                        continue;
                    }
                    let rel = "org/ow2/asm/asm-all/5.0.4/asm-all-5.0.4.jar";
                    let path = paths::join_inside(libdir, rel)?;
                    plan.jobs.push(Job {
                        url: "https://repo1.maven.org/maven2/org/ow2/asm/asm-all/5.0.4/asm-all-5.0.4.jar".into(),
                        path: path.clone(),
                        sha1: Some("e6244859997b3d4237a552669279780876228909".into()),
                        sha256: None,
                        size: None,
                    });
                    plan.classpath.push(path);
                    continue;
                }
            }
        }

        // Natives no formato legado (<= 1.18): extraídos para a pasta de natives
        if let Some(natives) = lib.get("natives").and_then(Value::as_object) {
            if let Some(classifier) = natives.get(os_name()).and_then(Value::as_str) {
                let classifier = classifier.replace("${arch}", arch_bits);
                if let Some(art) = lib.pointer(&format!("/downloads/classifiers/{classifier}")) {
                    let rel = art.get("path").and_then(Value::as_str).map(String::from)
                        .or_else(|| maven_path(&format!("{name}:{classifier}")))
                        .ok_or("biblioteca native sem caminho")?;
                    let path = paths::join_inside(libdir, &rel)?;
                    if let Some(url) = art.get("url").and_then(Value::as_str).filter(|u| !u.is_empty()) {
                        plan.jobs.push(Job {
                            url: url.to_string(),
                            path: path.clone(),
                            sha1: art.get("sha1").and_then(Value::as_str).map(String::from),
                            sha256: None,
                            size: art.get("size").and_then(Value::as_u64),
                        });
                    }
                    let exclude = lib
                        .pointer("/extract/exclude")
                        .and_then(Value::as_array)
                        .map(|a| a.iter().filter_map(Value::as_str).map(String::from).collect())
                        .unwrap_or_else(|| vec!["META-INF/".to_string()]);
                    plan.natives.push((path, exclude));
                }
            }
            // Algumas entradas só têm natives; não entram no classpath.
            if lib.pointer("/downloads/artifact").is_none() {
                continue;
            }
        }

        if !seen.insert(key) {
            continue; // filho tem prioridade (vem antes na lista mesclada)
        }

        let (rel, url, sha1, size) = if let Some(art) = lib.pointer("/downloads/artifact") {
            let rel = art.get("path").and_then(Value::as_str).map(String::from).or_else(|| maven_path(name));
            (
                rel,
                art.get("url").and_then(Value::as_str).unwrap_or_default().to_string(),
                art.get("sha1").and_then(Value::as_str).map(String::from),
                art.get("size").and_then(Value::as_u64),
            )
        } else {
            // Formato maven puro (Fabric/Quilt): name + url base
            let rel = maven_path(name);
            let base = lib.get("url").and_then(Value::as_str).unwrap_or(LIBRARIES);
            let base = if base.ends_with('/') { base.to_string() } else { format!("{base}/") };
            let url = rel.as_ref().map(|r| format!("{base}{r}")).unwrap_or_default();
            (rel, url, lib.get("sha1").and_then(Value::as_str).map(String::from), lib.get("size").and_then(Value::as_u64))
        };
        let Some(rel) = rel else { continue };
        let path = paths::join_inside(libdir, &rel)?;
        if !url.is_empty() {
            plan.jobs.push(Job { url, path: path.clone(), sha1, sha256: None, size });
        }
        plan.classpath.push(path);
    }
    Ok(plan)
}

fn extract_natives(natives: &[(PathBuf, Vec<String>)], dest: &Path) -> Result<(), String> {
    let _ = std::fs::remove_dir_all(dest);
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for (jar, exclude) in natives {
        let file = std::fs::File::open(jar).map_err(|e| format!("{}: {e}", jar.display()))?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            let name = entry.name().to_string();
            if entry.is_dir() || exclude.iter().any(|ex| name.starts_with(ex.as_str())) {
                continue;
            }
            let Ok(out) = paths::join_inside(dest, &name) else { continue };
            if let Some(p) = out.parent() {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub fn extract_zip_archive(zip_file_path: &Path, dest_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
    let file = std::fs::File::open(zip_file_path).map_err(|e| format!("{}: {e}", zip_file_path.display()))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if entry.is_dir() {
            continue;
        }
        let Ok(out) = paths::join_inside(dest_dir, &name) else { continue };
        if let Some(p) = out.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn extract_zip_archive_with_progress(
    app: &AppHandle,
    owner: &str,
    stage: &str,
    zip_file_path: &Path,
    dest_dir: &Path,
) -> Result<(), String> {
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;
    let file = std::fs::File::open(zip_file_path).map_err(|e| format!("{}: {e}", zip_file_path.display()))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let total = zip.len();
    for i in 0..total {
        let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if i % 120 == 0 || i == total - 1 {
            let short = name.split('/').last().unwrap_or(&name);
            download::emit(
                app,
                owner,
                stage,
                i + 1,
                total,
                format!("Extraindo recursos ({short})…"),
            );
        }
        if entry.is_dir() {
            continue;
        }
        let Ok(out) = paths::join_inside(dest_dir, &name) else { continue };
        if let Some(p) = out.parent() {
            std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
        }
        let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
    }
    download::emit(
        app,
        owner,
        stage,
        total,
        total,
        "Recursos Rust prontos!".to_string(),
    );
    Ok(())
}

// ---------------------------------------------------------------- assets

/// Baixa os assets e devolve (nome do índice, valor de ${game_assets}).
async fn ensure_assets(
    app: &AppHandle,
    client: &reqwest::Client,
    owner: &str,
    version: &Value,
    shared: &Path,
    game_dir: &Path,
) -> Result<(String, PathBuf), String> {
    let assets = shared.join("assets");
    let Some(idx) = version.get("assetIndex") else {
        return Ok(("legacy".into(), assets));
    };
    let id = idx.get("id").and_then(Value::as_str).unwrap_or("legacy").to_string();
    let index_path = assets.join("indexes").join(format!("{}.json", paths::safe_name(&id)?));
    download::fetch(
        client,
        &Job {
            url: idx.get("url").and_then(Value::as_str).unwrap_or_default().to_string(),
            path: index_path.clone(),
            sha1: idx.get("sha1").and_then(Value::as_str).map(String::from),
            sha256: None,
            size: None,
        },
    )
    .await?;
    let index = read_json(&index_path)?;
    let objects = index.get("objects").and_then(Value::as_object).cloned().unwrap_or_default();
    let mut jobs = Vec::with_capacity(objects.len());
    for obj in objects.values() {
        let Some(hash) = obj.get("hash").and_then(Value::as_str) else { continue };
        if hash.len() < 2 {
            continue;
        }
        jobs.push(Job {
            url: format!("{RESOURCES}/{}/{hash}", &hash[..2]),
            path: assets.join("objects").join(&hash[..2]).join(hash),
            // conferir SHA-1 de milhares de assets a cada abertura é lento: tamanho basta
            sha1: None,
            sha256: None,
            size: obj.get("size").and_then(Value::as_u64),
        });
    }
    download::fetch_all(app, client, owner, "assets", jobs, 32).await?;

    let is_virtual = index.get("virtual").and_then(Value::as_bool).unwrap_or(false);
    let map_resources = index.get("map_to_resources").and_then(Value::as_bool).unwrap_or(false);
    if !(is_virtual || map_resources) {
        return Ok((id, assets));
    }
    let target = if map_resources { game_dir.join("resources") } else { assets.join("virtual").join(&id) };
    for (rel, obj) in &objects {
        let Some(hash) = obj.get("hash").and_then(Value::as_str) else { continue };
        let Ok(dest) = paths::join_inside(&target, rel) else { continue };
        if dest.exists() {
            continue;
        }
        if let Some(p) = dest.parent() {
            let _ = std::fs::create_dir_all(p);
        }
        let _ = std::fs::copy(assets.join("objects").join(&hash[..2]).join(hash), &dest);
    }
    Ok((id, target))
}

// ---------------------------------------------------------------- argumentos

fn collect_args(list: Option<&Value>, features: &HashMap<&str, bool>, out: &mut Vec<String>) {
    for item in list.and_then(Value::as_array).into_iter().flatten() {
        match item {
            Value::String(s) => out.push(s.clone()),
            Value::Object(o) => {
                if !rules_allow(o.get("rules"), features) {
                    continue;
                }
                match o.get("value") {
                    Some(Value::String(s)) => out.push(s.clone()),
                    Some(Value::Array(a)) => out.extend(a.iter().filter_map(Value::as_str).map(String::from)),
                    _ => {}
                }
            }
            _ => {}
        }
    }
}

fn substitute(arg: &str, vars: &HashMap<&str, String>) -> String {
    let mut out = String::with_capacity(arg.len());
    let mut rest = arg;
    while let Some(start) = rest.find("${") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        match after.find('}') {
            Some(end) => {
                let key = &after[..end];
                match vars.get(key) {
                    Some(v) => out.push_str(v),
                    None => out.push_str(&rest[start..start + 2 + end + 1]),
                }
                rest = &after[end + 1..];
            }
            None => {
                out.push_str(&rest[start..]);
                rest = "";
            }
        }
    }
    out.push_str(rest);
    out
}

fn detect_system_locale() -> String {
    let mut candidate = String::new();
    if cfg!(windows) {
        if let Ok(out) = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "[System.Globalization.CultureInfo]::CurrentUICulture.Name"])
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !text.is_empty() {
                candidate = text;
            }
        }
    }
    if candidate.is_empty() {
        if let Ok(v) = std::env::var("LC_ALL")
            .or_else(|_| std::env::var("LC_MESSAGES"))
            .or_else(|_| std::env::var("LANG"))
        {
            candidate = v;
        }
    }
    candidate.to_lowercase().replace('-', "_")
}

fn map_to_mc_language(raw: &str) -> &'static str {
    if raw.starts_with("pt") {
        if raw.contains("pt") && (raw.contains("pt_pt") || raw.ends_with("_pt")) {
            "pt_pt"
        } else {
            "pt_br"
        }
    } else if raw.starts_with("es") {
        "es_es"
    } else if raw.starts_with("fr") {
        "fr_fr"
    } else if raw.starts_with("de") {
        "de_de"
    } else if raw.starts_with("it") {
        "it_it"
    } else if raw.starts_with("ru") {
        "ru_ru"
    } else if raw.starts_with("zh") {
        "zh_cn"
    } else if raw.starts_with("ja") {
        "ja_jp"
    } else if raw.starts_with("ko") {
        "ko_kr"
    } else {
        "en_us"
    }
}

fn sync_options_language(game_dir: &Path) {
    let mc_lang = map_to_mc_language(&detect_system_locale());
    let options_path = game_dir.join("options.txt");

    if !options_path.exists() {
        let _ = std::fs::create_dir_all(game_dir);
        let _ = std::fs::write(&options_path, format!("lang:{mc_lang}\n"));
        return;
    }

    if let Ok(contents) = std::fs::read_to_string(&options_path) {
        let mut found = false;
        let mut changed = false;
        let mut new_lines = Vec::new();

        for line in contents.lines() {
            if line.starts_with("lang:") {
                found = true;
                let val = line.trim_start_matches("lang:").trim();
                if val.is_empty() {
                    new_lines.push(format!("lang:{mc_lang}"));
                    changed = true;
                } else {
                    new_lines.push(line.to_string());
                }
            } else {
                new_lines.push(line.to_string());
            }
        }

        if !found {
            new_lines.push(format!("lang:{mc_lang}"));
            changed = true;
        }

        if changed {
            let mut out = new_lines.join("\n");
            out.push('\n');
            let _ = std::fs::write(&options_path, out);
        }
    }
}

fn split_server(addr: &str) -> (String, String) {
    match addr.rsplit_once(':') {
        Some((h, p)) if p.parse::<u16>().is_ok() => (h.to_string(), p.to_string()),
        _ => (addr.to_string(), "25565".to_string()),
    }
}

/// Escreve um @argfile (Java 9+) quando a linha de comando passaria do limite do Windows.
fn argfile_escape(arg: &str) -> String {
    format!("\"{}\"", arg.replace('\\', "\\\\").replace('"', "\\\""))
}

// ---------------------------------------------------------------- comando principal

#[tauri::command]
pub async fn game_launch(app: AppHandle, state: State<'_, AppState>, req: LaunchRequest) -> Result<(), String> {
    let owner = req.instance_id.clone();
    {
        let games = state.games.lock().await;
        if games.contains_key(&owner) {
            return Err("Essa instância já está aberta".into());
        }
    }

    // Se for motor Rust (Horizon)
    if req.loader == "horizon-rust" || req.loader == "horizon" || req.engine.as_deref() == Some("rust") || req.engine.as_deref() == Some("horizon") {
        return launch_horizon_rust(&app, &state, &req).await;
    }

    let client = state.http.clone();
    let shared = paths::shared(&app)?;
    let game_dir = paths::instance(&app, &owner)?;
    let libdir = shared.join("libraries");

    // 1-2. versões e loader
    download::emit(&app, &owner, "versions", 0, 1, format!("Preparando Minecraft {}", req.game_version));
    ensure_vanilla_json(&client, &shared, &req.game_version).await?;
    let version_id = ensure_loader(&app, &client, &shared, &req).await?;
    let version = load_merged(&shared, &version_id)?;

    // 3. client.jar + bibliotecas
    let client_jar = shared.join("versions").join(&version_id).join(format!("{version_id}.jar"));
    let mut plan = plan_libraries(&version, &libdir)?;
    if let Some(dl) = version.pointer("/downloads/client") {
        plan.jobs.push(Job {
            url: dl.get("url").and_then(Value::as_str).unwrap_or_default().to_string(),
            path: client_jar.clone(),
            sha1: dl.get("sha1").and_then(Value::as_str).map(String::from),
            sha256: None,
            size: dl.get("size").and_then(Value::as_u64),
        });
    }
    // Config de log oficial (corrige Log4Shell em versões antigas)
    let mut log_arg = None;
    if let Some(log) = version.pointer("/logging/client") {
        if let (Some(file), Some(arg)) = (log.get("file"), log.get("argument").and_then(Value::as_str)) {
            let fid = file.get("id").and_then(Value::as_str).unwrap_or("client.xml");
            let path = shared.join("assets").join("log_configs").join(paths::safe_name(fid)?);
            plan.jobs.push(Job {
                url: file.get("url").and_then(Value::as_str).unwrap_or_default().to_string(),
                path: path.clone(),
                sha1: file.get("sha1").and_then(Value::as_str).map(String::from),
                sha256: None,
                size: None,
            });
            log_arg = Some(arg.replace("${path}", &path.to_string_lossy()));
        }
    }
    download::fetch_all(&app, &client, &owner, "libraries", plan.jobs.clone(), 16).await?;

    // 4. assets
    let (asset_index, game_assets) = ensure_assets(&app, &client, &owner, &version, &shared, &game_dir).await?;

    // 5. natives
    let natives_dir = shared.join("natives").join(&version_id);
    if cfg!(target_os = "android") {
        // Extrai jni/arm64-v8a/*.so dos .aar (como libjnidispatch.so do JNA) para DIR_CACHE/natives/<version_id>
        if let Ok(cache_dir) = app.path().app_cache_dir() {
            let android_natives_dir = cache_dir.join("natives").join(&version_id);
            let _ = std::fs::create_dir_all(&android_natives_dir);
            for (aar, _) in &plan.natives {
                if aar.extension().and_then(|e| e.to_str()) == Some("aar") {
                    if let Ok(file) = std::fs::File::open(aar) {
                        if let Ok(mut zip) = zip::ZipArchive::new(file) {
                            for i in 0..zip.len() {
                                if let Ok(mut entry) = zip.by_index(i) {
                                    let ename = entry.name().to_string();
                                    if ename.starts_with("jni/arm64-v8a/") && ename.ends_with(".so") {
                                        if let Some(fname) = Path::new(&ename).file_name() {
                                            if let Ok(mut out) = std::fs::File::create(android_natives_dir.join(fname)) {
                                                let _ = std::io::copy(&mut entry, &mut out);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    } else {
        extract_natives(&plan.natives, &natives_dir)?;
    }

    sync_options_language(&game_dir);

    #[cfg(target_os = "android")]
    {
        let _ = (asset_index, game_assets, log_arg);
        download::emit(&app, &owner, "launch", 1, 1, "Iniciando Minecraft no Android…");
        let root = paths::root(&app)?;
        let _ = std::fs::remove_file(root.join("tropicalia-game-exit.json"));
        let _ = std::fs::remove_file(root.join("tropicalia-game-status.json"));
        let _ = std::fs::remove_file(root.join("tropicalia-progress.json"));
        let _ = std::fs::remove_file(root.join("tropicalia-game-kill.json"));

        let launch_payload = json!({
            "instanceId": owner,
            "versionId": version_id,
            "gameDir": game_dir.to_string_lossy().to_string(),
            "username": req.account.username,
            "uuid": req.account.uuid,
            "accessToken": req.account.access_token,
            "userType": req.account.user_type,
            "memoryMb": req.memory_max_mb.max(1024),
            "jvmArgs": req.jvm_args.join(" "),
            "serverAddress": req.server_address,
            "javaRenderer": req.java_renderer,
            "useAngle": req.use_angle.unwrap_or(false),
            "javaRuntime": req.java_runtime,
        });
        let trigger_file = root.join("tropicalia-java-launch.json");
        std::fs::write(&trigger_file, serde_json::to_vec_pretty(&launch_payload).unwrap())
            .map_err(|e| format!("Falha ao acionar o motor Java Android: {e}"))?;

        state.games.lock().await.insert(owner.clone(), 1);

        let app_mon = app.clone();
        let owner_mon = owner.clone();
        tokio::spawn(async move {
            let progress_file = root.join("tropicalia-progress.json");
            let status_file = root.join("tropicalia-game-status.json");
            let exit_file = root.join("tropicalia-game-exit.json");
            let paths_file = root.join("tropicalia-game-paths.json");

            let mut started = false;
            let mut log_offset: u64 = 0;
            let mut candidate_log_paths = vec![
                root.join("tropicalia-latestlog.txt"),
                root.join("latestlog.txt"),
                std::path::PathBuf::from("/storage/emulated/0/Android/data/com.tropicaliacraft.launcher/files/latestlog.txt"),
                std::path::PathBuf::from("/storage/emulated/0/Android/data/com.tropicaliacraft.launcher/files/.minecraft/logs/latest.log"),
            ];

            let start_time = std::time::Instant::now();

            loop {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;

                // 1. Caminhos dinâmicos enviados pela activity Java
                if let Ok(raw) = std::fs::read_to_string(&paths_file) {
                    if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                        if let Some(p) = v.get("latestLog").and_then(Value::as_str) {
                            let pb = std::path::PathBuf::from(p);
                            if !candidate_log_paths.contains(&pb) {
                                candidate_log_paths.insert(0, pb);
                            }
                        }
                    }
                }

                // 2. Progresso real vindo do ProgressKeeper / descompactador JRE
                if !started {
                    if let Ok(raw) = std::fs::read_to_string(&progress_file) {
                        if let Ok(p) = serde_json::from_str::<Value>(&raw) {
                            let stage = p.get("stage").and_then(Value::as_str).unwrap_or("minecraft").to_string();
                            let current = p.get("current").and_then(Value::as_u64).unwrap_or(0);
                            let total = p.get("total").and_then(Value::as_u64).unwrap_or(100);
                            let message = p.get("message").and_then(Value::as_str).unwrap_or("Preparando…").to_string();
                            download::emit(&app_mon, &owner_mon, &stage, current as usize, total as usize, message);
                        }
                    }
                }

                // 3. Streaming de logs do Minecraft para a UI (game://log)
                for log_path in &candidate_log_paths {
                    if let Ok(metadata) = std::fs::metadata(log_path) {
                        let len = metadata.len();
                        if len > log_offset {
                            if let Ok(mut f) = std::fs::File::open(log_path) {
                                use std::io::{Read, Seek, SeekFrom};
                                if f.seek(SeekFrom::Start(log_offset)).is_ok() {
                                    let mut chunk = Vec::new();
                                    if f.read_to_end(&mut chunk).is_ok() {
                                        log_offset = len;
                                        let text = String::from_utf8_lossy(&chunk);
                                        for line in text.lines() {
                                            if !line.is_empty() {
                                                let _ = app_mon.emit("game://log", GameLog {
                                                    owner: owner_mon.clone(),
                                                    line: line.to_string(),
                                                    stream: "out",
                                                });
                                            }
                                        }
                                        if !started {
                                            started = true;
                                            let _ = app_mon.emit("game://started", json!({ "owner": owner_mon.clone(), "pid": 1 }));
                                        }
                                    }
                                }
                            }
                            break;
                        }
                    }
                }

                // 4. Sinal de jogo rodando
                if !started && status_file.exists() {
                    started = true;
                    let _ = app_mon.emit("game://started", json!({ "owner": owner_mon.clone(), "pid": 1 }));
                }

                // 5. Sinal de encerramento do jogo
                if exit_file.exists() {
                    let mut code = Some(0);
                    if let Ok(raw) = std::fs::read_to_string(&exit_file) {
                        if let Ok(v) = serde_json::from_str::<Value>(&raw) {
                            code = v.get("code").and_then(Value::as_i64).map(|c| c as i32);
                        }
                    }
                    let _ = std::fs::remove_file(&exit_file);
                    let st = app_mon.state::<AppState>();
                    st.games.lock().await.remove(&owner_mon);
                    let _ = app_mon.emit("game://exit", GameExit { owner: owner_mon.clone(), code });
                    break;
                }

                // 6. Timeout de segurança se nunca iniciar (3 minutos)
                if !started && start_time.elapsed().as_secs() > 180 {
                    let st = app_mon.state::<AppState>();
                    st.games.lock().await.remove(&owner_mon);
                    let _ = app_mon.emit("game://exit", GameExit { owner: owner_mon.clone(), code: Some(-1) });
                    break;
                }
            }
        });
        return Ok(());
    }

    #[cfg(not(target_os = "android"))]
    {
    // 6. java (Desktop)
    let component = version.pointer("/javaVersion/component").and_then(Value::as_str).unwrap_or("jre-legacy");
    let java_major = version.pointer("/javaVersion/majorVersion").and_then(Value::as_u64).unwrap_or(8);
    let java = java::resolve(&app, &client, &owner, req.java_path.as_deref(), component, false).await?;

    // 7. argumentos
    download::emit(&app, &owner, "launch", 1, 1, "Iniciando o jogo…");
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut cp: Vec<String> = plan.classpath.iter().map(|p| p.to_string_lossy().to_string()).collect();
    if client_jar.exists() {
        cp.push(client_jar.to_string_lossy().to_string());
    }
    let has_res = req.resolution.is_some();
    let (w, h) = req.resolution.as_ref().map(|r| (r.width, r.height)).unwrap_or((854, 480));

    let game_template: Vec<String> = {
        let mut feats: HashMap<&str, bool> = HashMap::new();
        feats.insert("has_custom_resolution", has_res);
        let mut v = vec![];
        collect_args(version.pointer("/arguments/game"), &feats, &mut v);
        v
    };
    let supports_quick_play = game_template.iter().any(|a| a.contains("${quickPlayMultiplayer}"));

    let mut features: HashMap<&str, bool> = HashMap::new();
    features.insert("has_custom_resolution", has_res);
    features.insert("is_quick_play_multiplayer", req.server_address.is_some() && supports_quick_play);

    let mut vars: HashMap<&str, String> = HashMap::new();
    vars.insert("auth_player_name", req.account.username.clone());
    vars.insert("version_name", version_id.clone());
    vars.insert("game_directory", game_dir.to_string_lossy().to_string());
    vars.insert("assets_root", shared.join("assets").to_string_lossy().to_string());
    vars.insert("game_assets", game_assets.to_string_lossy().to_string());
    vars.insert("assets_index_name", asset_index);
    vars.insert("auth_uuid", req.account.uuid.replace('-', ""));
    vars.insert("auth_access_token", req.account.access_token.clone());
    vars.insert("auth_session", format!("token:{}:{}", req.account.access_token, req.account.uuid.replace('-', "")));
    vars.insert("auth_xuid", req.account.xuid.clone().unwrap_or_else(|| "0".into()));
    vars.insert("clientid", String::new());
    vars.insert("user_type", req.account.user_type.clone());
    vars.insert("user_properties", "{}".into());
    vars.insert("version_type", version.get("type").and_then(Value::as_str).unwrap_or("release").to_string());
    vars.insert("natives_directory", natives_dir.to_string_lossy().to_string());
    vars.insert("launcher_name", "tropicalia-launcher".into());
    vars.insert("launcher_version", env!("CARGO_PKG_VERSION").into());
    vars.insert("classpath", cp.join(sep));
    vars.insert("classpath_separator", sep.into());
    vars.insert("library_directory", libdir.to_string_lossy().to_string());
    vars.insert("resolution_width", w.to_string());
    vars.insert("resolution_height", h.to_string());
    if let Some(addr) = &req.server_address {
        vars.insert("quickPlayMultiplayer", addr.clone());
    }

    let mut args: Vec<String> = vec![format!("-Xms{}M", req.memory_min_mb.max(256)), format!("-Xmx{}M", req.memory_max_mb.max(512))];
    args.extend(req.jvm_args.iter().filter(|a| !a.trim().is_empty()).cloned());
    if let Some(l) = log_arg {
        args.push(l);
    }
    let modern = version.get("arguments").is_some();
    if modern {
        let mut jvm = vec![];
        collect_args(version.pointer("/arguments/jvm"), &features, &mut jvm);
        // Alguns perfis de loader trazem só os jvm extras; garante natives e classpath.
        if !jvm.iter().any(|a| a.contains("${classpath}")) {
            jvm.extend(["-Djava.library.path=${natives_directory}".into(), "-cp".into(), "${classpath}".into()]);
        }
        args.extend(jvm.iter().map(|a| substitute(a, &vars)));
    } else {
        if cfg!(windows) {
            args.push("-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump".into());
        }
        args.push(substitute("-Djava.library.path=${natives_directory}", &vars));
        args.push("-cp".into());
        args.push(vars["classpath"].clone());
    }
    let main_class = version.get("mainClass").and_then(Value::as_str).ok_or("JSON da versão sem mainClass")?;
    args.push(main_class.to_string());

    let mut game = vec![];
    if modern {
        collect_args(version.pointer("/arguments/game"), &features, &mut game);
    } else if let Some(legacy) = version.get("minecraftArguments").and_then(Value::as_str) {
        game.extend(legacy.split_whitespace().map(String::from));
        if has_res {
            game.extend(["--width".into(), "${resolution_width}".into(), "--height".into(), "${resolution_height}".into()]);
        }
    }
    if let Some(addr) = &req.server_address {
        if !supports_quick_play {
            let (host, port) = split_server(addr);
            game.extend(["--server".into(), host, "--port".into(), port]);
        }
    }
    args.extend(game.iter().map(|a| substitute(a, &vars)));

    // Linha de comando muito longa no Windows (modpacks Forge) → @argfile
    let total_len: usize = args.iter().map(|a| a.len() + 3).sum();
    let mut final_args = args;
    if cfg!(windows) && total_len > 30_000 && java_major >= 9 {
        let argfile = game_dir.join(".tropicalia-launch.args");
        let body: Vec<String> = final_args.iter().map(|a| argfile_escape(a)).collect();
        std::fs::write(&argfile, body.join("\n")).map_err(|e| e.to_string())?;
        final_args = vec![format!("@{}", argfile.to_string_lossy())];
    }

    sync_options_language(&game_dir);

    let mut cmd = tokio::process::Command::new(&java);
    cmd.args(&final_args).current_dir(&game_dir).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    hide_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Falha ao iniciar o Java ({}): {e}", java.display()))?;

    for (stream, pipe) in [("out", child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>)), ("err", child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>))] {
        let Some(pipe) = pipe else { continue };
        let app2 = app.clone();
        let owner2 = owner.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(pipe).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app2.emit("game://log", GameLog { owner: owner2.clone(), line, stream });
            }
        });
    }

    let pid = child.id();
    state.games.lock().await.insert(owner.clone(), pid.unwrap_or(0));
    let _ = app.emit("game://started", json!({ "owner": owner, "pid": pid }));
    crate::tray::refresh(&app).await;

    if req.hide_on_launch {
        if let Some(w) = app.get_webview_window("main") {
            let _ = w.hide();
        }
    }

    let app2 = app.clone();
    tokio::spawn(async move {
        let code = child.wait().await.ok().and_then(|s| s.code());
        let st = app2.state::<AppState>();
        st.games.lock().await.remove(&owner);
        let _ = app2.emit("game://exit", GameExit { owner, code });
        crate::tray::refresh(&app2).await;
        if let Some(w) = app2.get_webview_window("main") {
            let _ = w.show();
            #[cfg(desktop)]
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
    });
    Ok(())
    }
}

#[tauri::command]
pub async fn game_kill(_app: AppHandle, state: State<'_, AppState>, instance_id: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        if let Ok(root) = paths::root(&_app) {
            let _ = std::fs::write(root.join("tropicalia-game-kill.json"), "{}");
        }
        state.games.lock().await.remove(&instance_id);
        let _ = _app.emit("game://exit", GameExit { owner: instance_id, code: Some(0) });
        return Ok(());
    }
    #[cfg(not(target_os = "android"))]
    {
        let pid = state.games.lock().await.get(&instance_id).copied();
        match pid {
            Some(pid) if pid != 0 => kill_pid(pid),
            _ => Err("Essa instância não está rodando".into()),
        }
    }
}

#[tauri::command]
pub async fn game_running(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.games.lock().await.keys().cloned().collect())
}

fn kill_pid(pid: u32) -> Result<(), String> {
    let mut sys = sysinfo::System::new();
    let p = sysinfo::Pid::from_u32(pid);
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[p]), true);
    match sys.process(p) {
        Some(proc_) => {
            proc_.kill();
            Ok(())
        }
        None => Err("Processo não encontrado".into()),
    }
}

/// Não abre janela de console preta no Windows.
pub async fn launch_horizon_rust(app: &AppHandle, state: &State<'_, AppState>, req: &LaunchRequest) -> Result<(), String> {
    let owner = req.instance_id.clone();
    let game_dir = paths::instance(app, &owner)?;
    let mods_dir = game_dir.join("horizon-mods");
    let _ = std::fs::create_dir_all(&mods_dir);
    sync_options_language(&game_dir);

    #[cfg(target_os = "android")]
    {
        let _ = state;
        download::emit(app, &owner, "launch", 1, 1, "Iniciando Horizon Rust (26.3) no Android…");
        let root_dir = paths::root(app)?;
        let files_dir = root_dir.join("files");
        let _ = std::fs::create_dir_all(&files_dir);

        let mc_lang = map_to_mc_language(&detect_system_locale());
        let player_name = if req.account.username.trim().is_empty() {
            "Player"
        } else {
            req.account.username.trim()
        };
        let launcher_cfg = json!({
            "name": player_name,
            "server": req.server_address.clone().unwrap_or_default(),
            "lang": mc_lang,
            "renderer": "vulkan",
        });

        // 1. Gravar horizon-player.txt e horizon-mods.txt
        let player_content = format!("name:{player_name}\n");
        let _ = std::fs::write(game_dir.join("horizon-player.txt"), &player_content);
        let _ = std::fs::write(root_dir.join("horizon-player.txt"), &player_content);
        let _ = std::fs::write(files_dir.join("horizon-player.txt"), &player_content);

        if let Ok(mods_content) = std::fs::read_to_string(game_dir.join("horizon-mods.txt")) {
            let _ = std::fs::write(root_dir.join("horizon-mods.txt"), &mods_content);
            let _ = std::fs::write(files_dir.join("horizon-mods.txt"), &mods_content);
        }

        // 2. Sincronizar opções
        let _ = sync_horizon_options_to_dir(&game_dir, req);
        let _ = sync_horizon_options_to_dir(&root_dir, req);
        let _ = sync_horizon_options_to_dir(&files_dir, req);

        // 3. Gravar android-launcher.json e flags
        let cfg_bytes = serde_json::to_vec_pretty(&launcher_cfg).unwrap();
        let _ = std::fs::write(root_dir.join("android-launcher.json"), &cfg_bytes);
        let _ = std::fs::write(files_dir.join("android-launcher.json"), &cfg_bytes);
        let _ = std::fs::write(root_dir.join("tropicalia-auto.flag"), b"1\n");
        let _ = std::fs::write(files_dir.join("tropicalia-auto.flag"), b"1\n");

        sync_options_language(&root_dir);
        sync_options_language(&files_dir);

        // 4. Gravar argumentos extras em android-launch.json
        let mut cli_args = Vec::new();
        if let Some(srv) = &req.server_address {
            if !srv.trim().is_empty() {
                cli_args.push("--server".to_string());
                cli_args.push(srv.trim().to_string());
            }
        }
        let cli_bytes = serde_json::to_vec(&cli_args).unwrap_or_default();
        let _ = std::fs::write(root_dir.join("android-launch.json"), &cli_bytes);
        let _ = std::fs::write(files_dir.join("android-launch.json"), &cli_bytes);

        // 5. Garantir marcadores oficiais de instalação pronta para bypass direto
        for d in [&root_dir, &files_dir] {
            let hz_ver = d.join(".local").join("horizon-client").join("26.3");
            let _ = std::fs::create_dir_all(&hz_ver);

            let hz_res = hz_ver.join("horizon-resources.json");
            let is_valid = if let Ok(bytes) = std::fs::read(&hz_res) {
                if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&bytes) {
                    json.get("data_version").and_then(|v| v.as_i64()) == Some(5023)
                        && hz_ver.join("block-tags.json").is_file()
                } else {
                    false
                }
            } else {
                false
            };

            if !is_valid {
                download::emit(
                    app,
                    &owner,
                    "horizon-prepare",
                    0,
                    100,
                    "Preparando motor Horizon Rust pela primeira vez…".to_string(),
                );

                let mut zip_found = None;
                for cand in [
                    files_dir.join("engine-data.zip"),
                    root_dir.join("engine-data.zip"),
                    paths::cache(app).unwrap_or_default().join("engine-data.zip"),
                ] {
                    if cand.is_file() && cand.metadata().map(|m| m.len() > 1000).unwrap_or(false) {
                        zip_found = Some(cand);
                        break;
                    }
                }

                if let Some(zip_path) = zip_found {
                    let _ = extract_zip_archive_with_progress(
                        app,
                        &owner,
                        "horizon-prepare",
                        &zip_path,
                        &hz_ver,
                    );
                } else if !hz_res.exists() {
                    let _ = std::fs::write(&hz_res, b"{\"schema\":7,\"data_version\":5023}\n");
                }
            }

            let dlv2 = hz_ver.join("android-downloads-v2.json");
            if !dlv2.exists() { let _ = std::fs::write(&dlv2, b"{\"schema\":2}\n"); }
            let audio_comp = hz_ver.join("audio-complete.json");
            if !audio_comp.exists() { let _ = std::fs::write(&audio_comp, b"{}\n"); }
        }

        download::emit(
            app,
            &owner,
            "launch",
            1,
            1,
            "Iniciando Minecraft Rust (26.3 Vulkan) no Android…".to_string(),
        );

        let _ = std::fs::remove_file(files_dir.join("vulkan-startup.pending"));
        let _ = std::fs::remove_file(root_dir.join("vulkan-startup.pending"));

        // 6. Gravar trigger tropicalia-horizon-launch.json
        let trigger_file = root_dir.join("tropicalia-horizon-launch.json");
        std::fs::write(&trigger_file, &cfg_bytes)
            .map_err(|e| format!("Falha ao acionar o motor Horizon Rust Android: {e}"))?;
        let _ = std::fs::write(files_dir.join("tropicalia-horizon-launch.json"), &cfg_bytes);

        let _ = app.emit("game://started", json!({ "owner": owner, "pid": 1 }));
        let app2 = app.clone();
        let owner2 = owner.clone();
        tokio::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(4)).await;
            let _ = app2.emit("game://exit", GameExit { owner: owner2, code: Some(0) });
        });
        return Ok(());
    }

    #[cfg(not(target_os = "android"))]
    {
        download::emit(app, &owner, "launch", 0, 1, "Verificando motor Horizon Rust…".to_string());

        let (client_bin, resources_dir) = if let Some(custom) = req.rust_binary_path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
            let custom_bin = PathBuf::from(custom);
            let horizon_dir = paths::root(app)?.join("runtimes").join("horizon");
            let resources_dir = horizon_dir.join(".local").join("horizon-client").join("26.3");
            (custom_bin, resources_dir)
        } else {
            ensure_horizon_engine(app, state, &owner, false).await?
        };

        // Sincronizar opções
        sync_horizon_options_to_dir(&game_dir, req)?;

        download::emit(app, &owner, "horizon-launch", 1, 10, "Iniciando motor Horizon Rust Vulkan…".to_string());

        let mut cmd = tokio::process::Command::new(&client_bin);
        cmd.current_dir(&game_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        cmd.arg("--resources").arg(&resources_dir);
        // cmd.arg("--game-dir") not supported
        // cmd.arg("--home") not supported

        let rd = req.horizon_options.as_ref().and_then(|o| o.render_distance).or(req.horizon_render_distance);
        if let Some(rd_val) = rd {
            cmd.arg("--render-distance").arg(rd_val.to_string());
        }
        if !req.account.username.is_empty() {
            cmd.arg("--name").arg(&req.account.username);
        }
        if let Some(addr) = &req.server_address {
            cmd.arg("--server").arg(addr);
        }
        if let Some(res) = &req.resolution {
            cmd.arg("--width").arg(res.width.to_string()).arg("--height").arg(res.height.to_string());
        }
        let is_creative = req.horizon_options.as_ref().and_then(|o| o.creative).or(req.horizon_creative).unwrap_or(false);
        if is_creative {
            cmd.arg("--creative");
        }
        let is_test_terrain = req.horizon_options.as_ref().and_then(|o| o.test_terrain).or(req.horizon_test_terrain).unwrap_or(false);
        if is_test_terrain {
            cmd.arg("--test-terrain");
        }
        let is_pregen = req.horizon_options.as_ref().and_then(|o| o.pregen).or(req.horizon_pregen).unwrap_or(false);
        if is_pregen {
            cmd.arg("--pregen");
        }
        if let Some(extra_args) = &req.horizon_args {
            for arg in extra_args {
                cmd.arg(arg);
            }
        }

        if req.horizon_options.as_ref().and_then(|o| o.agent_control).unwrap_or(false) {
            cmd.arg("--control");
        }
        if req.resolution.as_ref().map_or(false, |r| r.width == 0 && r.height == 0) {
            // cmd.arg("--fullscreen") not supported
        }

        cmd.env("HORIZON_HOME", &game_dir);
        if req.memory_max_mb > 0 {
            cmd.env("HORIZON_MEMORY_LIMIT_MB", req.memory_max_mb.to_string());
        }
        hide_console(&mut cmd);

        let mut child = cmd.spawn().map_err(|e| {
            format!(
                "Horizon Rust ({}) não foi encontrado ou falhou ao abrir: {e}.",
                client_bin.display()
            )
        })?;

        for (stream, pipe) in [
            ("out", child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>)),
            ("err", child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>)),
        ] {
            let Some(pipe) = pipe else { continue };
            let app2 = app.clone();
            let owner2 = owner.clone();
            tokio::spawn(async move {
                let mut lines = BufReader::new(pipe).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let l_lower = line.to_lowercase();
                    if l_lower.contains("vulkan") || l_lower.contains("surface") || l_lower.contains("adapter") {
                        download::emit(&app2, &owner2, "horizon-launch", 4, 10, "Compilando pipeline gráfico Vulkan…");
                    } else if l_lower.contains("terrain") || l_lower.contains("loading terrain") || l_lower.contains("chunk") {
                        download::emit(&app2, &owner2, "horizon-world", 8, 10, "Carregando chunks e terreno…");
                    } else if l_lower.contains("joined") || l_lower.contains("connected") || l_lower.contains("ready") {
                        download::emit(&app2, &owner2, "horizon-world", 10, 10, "Mundo pronto!");
                    }
                    let _ = app2.emit("game://log", GameLog { owner: owner2.clone(), line, stream });
                }
            });
        }

        let pid = child.id();
        state.games.lock().await.insert(owner.clone(), pid.unwrap_or(0));
        let _ = app.emit("game://started", json!({ "owner": owner, "pid": pid }));
        crate::tray::refresh(app).await;

        if req.hide_on_launch {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.hide();
            }
        }

        let app2 = app.clone();
        tokio::spawn(async move {
            let code = child.wait().await.ok().and_then(|s| s.code());
            let st = app2.state::<AppState>();
            st.games.lock().await.remove(&owner);
            let _ = app2.emit("game://exit", GameExit { owner, code });
            crate::tray::refresh(&app2).await;
            if let Some(w) = app2.get_webview_window("main") {
                let _ = w.show();
                #[cfg(desktop)]
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        });

        Ok(())
    }
}

const HORIZON_WIN_ZIP_URL: &str = "https://github.com/horizon-rust/horizon/releases/download/v0.2.97/horizon-windows-x64.zip";
const HORIZON_LINUX_TAR_URL: &str = "https://github.com/horizon-rust/horizon/releases/download/v0.2.97/horizon-linux-x86_64.tar.gz";

const MC_26_3_CLIENT_JAR_URL: &str = "https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar";
const MC_26_3_CLIENT_JAR_SHA1: &str = "e877b6a07acd633fb3bb475002175cec036e7b87";

const MC_26_3_SERVER_JAR_URL: &str = "https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar";
const MC_26_3_SERVER_JAR_SHA1: &str = "33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c";

pub async fn ensure_horizon_engine(
    app: &AppHandle,
    state: &State<'_, AppState>,
    owner: &str,
    force_sync: bool,
) -> Result<(PathBuf, PathBuf), String> {
    let horizon_dir = paths::root(app)?.join("runtimes").join("horizon");
    std::fs::create_dir_all(&horizon_dir).map_err(|e| e.to_string())?;

    let exe_name = if cfg!(windows) { "horizon-client.exe" } else { "horizon-client" };
    let prepare_name = if cfg!(windows) { "horizon-prepare.exe" } else { "horizon-prepare" };
    let client_bin = horizon_dir.join(exe_name);
    let prepare_bin = horizon_dir.join(prepare_name);

    if !client_bin.exists() || !prepare_bin.exists() {
        download::emit(app, owner, "horizon-engine", 0, 1, "Baixando motor Horizon Rust 26.3…".to_string());
        if cfg!(windows) {
            let zip_path = paths::cache(app)?.join("horizon-windows-x64.zip");
            download::fetch(
                &state.http,
                &Job {
                    url: HORIZON_WIN_ZIP_URL.into(),
                    path: zip_path.clone(),
                    sha1: None,
                    sha256: None,
                    size: None,
                },
            )
            .await?;
            download::emit(app, owner, "horizon-engine", 1, 1, "Extraindo binários do Horizon Rust…".to_string());
            extract_zip_archive(&zip_path, &horizon_dir)?;
        } else {
            let tar_path = paths::cache(app)?.join("horizon-linux-x86_64.tar.gz");
            download::fetch(
                &state.http,
                &Job {
                    url: HORIZON_LINUX_TAR_URL.into(),
                    path: tar_path.clone(),
                    sha1: None,
                    sha256: None,
                    size: None,
                },
            )
            .await?;
            #[cfg(unix)]
            {
                let mut cmd = tokio::process::Command::new("tar");
                cmd.args(["-xzf", &tar_path.to_string_lossy(), "-C", &horizon_dir.to_string_lossy()]);
                let _ = cmd.status().await;
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(&client_bin, std::fs::Permissions::from_mode(0o755));
                let _ = std::fs::set_permissions(&prepare_bin, std::fs::Permissions::from_mode(0o755));
            }
        }
    }

    let shared = paths::shared(app)?;
    let mc_ver_dir = shared.join("versions").join("26.3");
    std::fs::create_dir_all(&mc_ver_dir).map_err(|e| e.to_string())?;

    let client_jar = mc_ver_dir.join("26.3.jar");
    let server_jar = mc_ver_dir.join("server.jar");

    download::emit(app, owner, "horizon-mc", 0, 1, "Verificando arquivos oficiais de Minecraft 26.3…".to_string());

    download::fetch(
        &state.http,
        &Job {
            url: MC_26_3_CLIENT_JAR_URL.into(),
            path: client_jar.clone(),
            sha1: Some(MC_26_3_CLIENT_JAR_SHA1.into()),
            sha256: None,
            size: None,
        },
    )
    .await?;

    download::fetch(
        &state.http,
        &Job {
            url: MC_26_3_SERVER_JAR_URL.into(),
            path: server_jar.clone(),
            sha1: Some(MC_26_3_SERVER_JAR_SHA1.into()),
            sha256: None,
            size: None,
        },
    )
    .await?;

    let version_json = ensure_vanilla_json(&state.http, &shared, "26.3").await?;
    let dummy_game_dir = paths::instance(app, owner)?;
    ensure_assets(app, &state.http, owner, &version_json, &shared, &dummy_game_dir).await?;

    let resources_dir = horizon_dir.join(".local").join("horizon-client").join("26.3");
    let needs_prepare = force_sync
        || !resources_dir.join("models").exists()
        || !resources_dir.join("palette").exists()
        || !resources_dir.join("sounds").exists();

    if needs_prepare {
        download::emit(app, owner, "horizon-prepare", 0, 100, "Iniciando processamento dos blocos e texturas Rust…".to_string());

        let mut cmd = tokio::process::Command::new(&prepare_bin);
        cmd.current_dir(&horizon_dir);
        cmd.arg("--prepare");
        cmd.arg("--server-jar").arg(&server_jar);
        cmd.arg("--minecraft-dir").arg(&shared);
        cmd.arg("--root").arg(&horizon_dir);
        cmd.arg("--progress").arg("json");
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        hide_console(&mut cmd);

        let mut child = cmd.spawn().map_err(|e| format!("Falha ao iniciar horizon-prepare: {e}"))?;
        if let Some(stdout) = child.stdout.take() {
            let mut lines = tokio::io::BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                    if let Some(frac) = json.get("fraction").and_then(|v| v.as_f64()) {
                        let cur = ((frac * 80.0) as usize).min(80);
                        let raw_msg = json.get("message").and_then(|m| m.as_str()).unwrap_or("Preparando blocos e paletas…");
                        let msg = if raw_msg.contains("terrain") || raw_msg.contains("textures") {
                            "Processando atlas de texturas do Minecraft…".to_string()
                        } else if raw_msg.contains("models") || raw_msg.contains("block") {
                            "Construindo modelos e geometria de blocos…".to_string()
                        } else {
                            raw_msg.to_string()
                        };
                        download::emit(app, owner, "horizon-prepare", cur, 100, msg);
                    } else if let Some(raw_msg) = json.get("message").and_then(|m| m.as_str()) {
                        download::emit(app, owner, "horizon-prepare", 40, 100, raw_msg.to_string());
                    }
                }
            }
        }
        let out = child.wait().await.map_err(|e| format!("Falha ao aguardar horizon-prepare: {e}"))?;
        if !out.success() {
            return Err("horizon-prepare --prepare falhou. Verifique se os arquivos de Minecraft 26.3 estão completos.".to_string());
        }

        download::emit(app, owner, "horizon-prepare", 85, 100, "Extraindo banco sonoro do Horizon Rust…".to_string());
        let mut cmd_sounds = tokio::process::Command::new(&prepare_bin);
        cmd_sounds.current_dir(&horizon_dir);
        cmd_sounds.arg("sounds");
        cmd_sounds.arg("--minecraft-dir").arg(&shared);
        cmd_sounds.arg("--root").arg(&horizon_dir);
        hide_console(&mut cmd_sounds);

        let out_sounds = cmd_sounds.output().await.map_err(|e| format!("Falha ao executar horizon-prepare sounds: {e}"))?;
        if !out_sounds.status.success() {
            let stderr = String::from_utf8_lossy(&out_sounds.stderr);
            return Err(format!("horizon-prepare sounds falhou:\n{stderr}"));
        }
        download::emit(app, owner, "horizon-prepare", 100, 100, "Recursos e sons sincronizados com sucesso!".to_string());
    }

    Ok((client_bin, resources_dir))
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HorizonOptions {
    // Gráficos e Renderização Vulkan
    #[serde(default)]
    pub preset: Option<String>,
    #[serde(default)]
    pub render_distance: Option<u32>,
    #[serde(default)]
    pub lod_distance: Option<u32>,
    #[serde(default)]
    pub far_detail: Option<String>,
    #[serde(default)]
    pub framerate_limit: Option<u32>,
    #[serde(default)]
    pub present_mode: Option<String>,
    #[serde(default)]
    pub resolution_scale: Option<f64>,
    #[serde(default)]
    pub antialiasing: Option<String>,
    #[serde(default)]
    pub upscaling: Option<String>,
    #[serde(default)]
    pub cave_culling: Option<bool>,
    #[serde(default)]
    pub entity_culling: Option<bool>,
    #[serde(default)]
    pub animated_textures: Option<bool>,
    #[serde(default)]
    pub dither_cutout_mips: Option<bool>,
    #[serde(default)]
    pub fxaa: Option<bool>,
    #[serde(default)]
    pub taa: Option<bool>,
    #[serde(default)]
    pub sky: Option<bool>,
    #[serde(default)]
    pub fog: Option<bool>,
    #[serde(default)]
    pub weather: Option<bool>,
    #[serde(default)]
    pub chunk_updates: Option<u32>,
    #[serde(default)]
    pub upload_budget_kib: Option<u32>,
    #[serde(default)]
    pub workers: Option<u32>,
    #[serde(default)]
    pub shadow_cache: Option<bool>,
    #[serde(default)]
    pub graphics_api: Option<String>,

    // HDR
    #[serde(default)]
    pub hdr: Option<bool>,
    #[serde(default)]
    pub hdr_paper_white: Option<u32>,
    #[serde(default)]
    pub hdr_peak: Option<u32>,
    #[serde(default)]
    pub hdr_black_level: Option<f64>,
    #[serde(default)]
    pub hdr_ui_brightness: Option<f64>,

    // Áudio e Sons
    #[serde(default)]
    pub sound_master: Option<f64>,
    #[serde(default)]
    pub sound_music: Option<f64>,
    #[serde(default)]
    pub sound_weather: Option<f64>,
    #[serde(default)]
    pub sound_blocks: Option<f64>,
    #[serde(default)]
    pub sound_hostile: Option<f64>,
    #[serde(default)]
    pub sound_neutral: Option<f64>,
    #[serde(default)]
    pub sound_players: Option<f64>,
    #[serde(default)]
    pub sound_ambient: Option<f64>,
    #[serde(default)]
    pub sound_voice: Option<f64>,
    #[serde(default)]
    pub directional_audio: Option<bool>,
    #[serde(default)]
    pub subtitles: Option<bool>,

    // Visão, HUD e Câmera
    #[serde(default)]
    pub fov: Option<u32>,
    #[serde(default)]
    pub gamma: Option<f64>,
    #[serde(default)]
    pub view_bobbing: Option<bool>,
    #[serde(default)]
    pub attack_indicator: Option<String>,
    #[serde(default)]
    pub gui_scale: Option<i32>,
    #[serde(default)]
    pub menu_blur: Option<u32>,
    #[serde(default)]
    pub high_contrast: Option<bool>,

    // Extras Integrados do Horizon
    #[serde(default)]
    pub fullbright: Option<bool>,
    #[serde(default)]
    pub dynamic_lights: Option<bool>,
    #[serde(default)]
    pub zoom: Option<bool>,
    #[serde(default)]
    pub zoom_key: Option<String>,
    #[serde(default)]
    pub zoom_level: Option<u32>,
    #[serde(default)]
    pub zoom_smooth: Option<bool>,
    #[serde(default)]
    pub zoom_sensitivity: Option<bool>,
    #[serde(default)]
    pub fps: Option<bool>,
    #[serde(default)]
    pub fps_corner: Option<String>,
    #[serde(default)]
    pub fps_lows: Option<bool>,
    #[serde(default)]
    pub keystrokes: Option<bool>,
    #[serde(default)]
    pub keystrokes_corner: Option<String>,
    #[serde(default)]
    pub keystrokes_cps: Option<bool>,
    #[serde(default)]
    pub minimap: Option<bool>,
    #[serde(default)]
    pub minimap_corner: Option<String>,
    #[serde(default)]
    pub minimap_size: Option<u32>,
    #[serde(default)]
    pub minimap_shape: Option<String>,
    #[serde(default)]
    pub minimap_zoom: Option<f64>,
    #[serde(default)]
    pub minimap_rotate: Option<bool>,
    #[serde(default)]
    pub mouse_tweaks: Option<bool>,
    #[serde(default)]
    pub mouse_tweaks_wheel: Option<bool>,
    #[serde(default)]
    pub sort: Option<bool>,
    #[serde(default)]
    pub sort_key: Option<String>,
    #[serde(default)]
    pub discord_presence: Option<bool>,

    // Jogabilidade e Sistema
    #[serde(default)]
    pub mouse_sensitivity: Option<f64>,
    #[serde(default)]
    pub invert_y: Option<bool>,
    #[serde(default)]
    pub auto_jump: Option<bool>,
    #[serde(default)]
    pub toggle_crouch: Option<bool>,
    #[serde(default)]
    pub toggle_sprint: Option<bool>,
    #[serde(default)]
    pub auto_reconnect: Option<bool>,
    #[serde(default)]
    pub own_name_tag: Option<bool>,
    #[serde(default)]
    pub no_ai: Option<bool>,
    #[serde(default)]
    pub agent_control: Option<bool>,

    // Modos de Execução
    #[serde(default)]
    pub creative: Option<bool>,
    #[serde(default)]
    pub test_terrain: Option<bool>,
    #[serde(default)]
    pub pregen: Option<bool>,
}

pub fn read_key_value_file(path: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if let Ok(text) = std::fs::read_to_string(path) {
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            if let Some((k, v)) = line.split_once(':') {
                map.insert(k.trim().to_string(), v.trim().to_string());
            }
        }
    }
    map
}

pub fn write_or_update_key_value_file(path: &Path, updates: &HashMap<&str, String>) -> Result<(), String> {
    let mut lines: Vec<String> = if path.exists() {
        std::fs::read_to_string(path)
            .unwrap_or_default()
            .lines()
            .map(|s| s.to_string())
            .collect()
    } else {
        Vec::new()
    };

    let mut touched: HashSet<String> = HashSet::new();
    for i in 0..lines.len() {
        let (k_opt, v_opt) = {
            let trimmed = lines[i].trim();
            if trimmed.is_empty() || trimmed.starts_with('#') {
                (None, None)
            } else if let Some((k, _)) = trimmed.split_once(':') {
                let k_trimmed = k.trim();
                if let Some(new_val) = updates.get(k_trimmed) {
                    (Some(k_trimmed.to_string()), Some(new_val.clone()))
                } else {
                    (None, None)
                }
            } else {
                (None, None)
            }
        };
        if let (Some(k), Some(v)) = (k_opt, v_opt) {
            lines[i] = format!("{k}:{v}");
            touched.insert(k);
        }
    }
    for (&k, v) in updates {
        if !touched.contains(k) {
            lines.push(format!("{k}:{v}"));
        }
    }

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(path, lines.join("\n") + "\n").map_err(|e| e.to_string())
}

fn sync_horizon_options_to_dir(game_dir: &Path, req: &LaunchRequest) -> Result<(), String> {
    std::fs::create_dir_all(game_dir).map_err(|e| e.to_string())?;
    let hz_opt = req.horizon_options.as_ref();

    // 1. options.txt (Vanilla Minecraft & Horizon)
    let opt_path = game_dir.join("options.txt");
    let mut opt_updates = HashMap::new();
    opt_updates.insert("lang", "pt_br".to_string());

    let rd = hz_opt.and_then(|o| o.render_distance).or(req.horizon_render_distance);
    if let Some(val) = rd {
        opt_updates.insert("renderDistance", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.fov) {
        opt_updates.insert("fov", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.gamma) {
        opt_updates.insert("gamma", format!("{:.2}", val / 100.0));
    }
    if let Some(val) = hz_opt.and_then(|o| o.framerate_limit) {
        opt_updates.insert("maxFps", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.view_bobbing) {
        opt_updates.insert("bobView", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.gui_scale) {
        opt_updates.insert("guiScale", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.high_contrast) {
        opt_updates.insert("highContrast", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.menu_blur) {
        opt_updates.insert("menuBackgroundBlurriness", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.mouse_sensitivity) {
        opt_updates.insert("mouseSensitivity", format!("{:.2}", val / 100.0));
    }
    if let Some(val) = hz_opt.and_then(|o| o.invert_y) {
        opt_updates.insert("invertYMouse", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.auto_jump) {
        opt_updates.insert("autoJump", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.toggle_crouch) {
        opt_updates.insert("toggleCrouch", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.toggle_sprint) {
        opt_updates.insert("toggleSprint", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.directional_audio) {
        opt_updates.insert("directionalAudio", val.to_string());
    }
    if let Some(val) = hz_opt.and_then(|o| o.subtitles) {
        opt_updates.insert("showSubtitles", val.to_string());
    }

    // Sons (0-100 para 0.0-1.0)
    if let Some(v) = hz_opt.and_then(|o| o.sound_master) { opt_updates.insert("soundCategory_master", format!("{:.2}", v / 100.0)); }
    if let Some(v) = hz_opt.and_then(|o| o.sound_music) { opt_updates.insert("soundCategory_music", format!("{:.2}", v / 100.0)); }
    if let Some(v) = hz_opt.and_then(|o| o.sound_weather) { opt_updates.insert("soundCategory_weather", format!("{:.2}", v / 100.0)); }
    if let Some(v) = hz_opt.and_then(|o| o.sound_blocks) { opt_updates.insert("soundCategory_block", format!("{:.2}", v / 100.0)); }
    if let Some(v) = hz_opt.and_then(|o| o.sound_hostile) { opt_updates.insert("soundCategory_hostile", format!("{:.2}", v / 100.0)); }
    if let Some(v) = hz_opt.and_then(|o| o.sound_neutral) { opt_updates.insert("soundCategory_neutral", format!("{:.2}", v / 100.0)); }
    if let Some(v) = hz_opt.and_then(|o| o.sound_players) { opt_updates.insert("soundCategory_player", format!("{:.2}", v / 100.0)); }
    if let Some(v) = hz_opt.and_then(|o| o.sound_ambient) { opt_updates.insert("soundCategory_ambient", format!("{:.2}", v / 100.0)); }
    if let Some(v) = hz_opt.and_then(|o| o.sound_voice) { opt_updates.insert("soundCategory_voice", format!("{:.2}", v / 100.0)); }

    let _ = write_or_update_key_value_file(&opt_path, &opt_updates);

    // 2. horizon-graphics.txt
    let gfx_path = game_dir.join("horizon-graphics.txt");
    let mut gfx_updates = HashMap::new();
    let preset = hz_opt.and_then(|o| o.preset.as_deref()).unwrap_or("custom");
    gfx_updates.insert("preset", preset.to_string());

    let lod = hz_opt.and_then(|o| o.lod_distance).or(req.horizon_lod_distance);
    if let Some(val) = lod { gfx_updates.insert("lodDistance", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.far_detail.as_deref()) { gfx_updates.insert("farDetail", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.cave_culling).or(req.horizon_cave_culling) { gfx_updates.insert("caveCulling", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.entity_culling).or(req.horizon_entity_culling) { gfx_updates.insert("entityCulling", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.animated_textures).or(req.horizon_animated_textures) { gfx_updates.insert("animatedTextures", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.dither_cutout_mips) { gfx_updates.insert("ditherCutoutMips", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.fxaa).or(req.horizon_fxaa) { gfx_updates.insert("fxaa", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.taa) { gfx_updates.insert("taa", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.present_mode.as_deref()) { gfx_updates.insert("presentMode", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.resolution_scale) { gfx_updates.insert("resolutionScale", format!("{:.2}", val)); }
    if let Some(val) = hz_opt.and_then(|o| o.upscaling.as_deref()) { gfx_updates.insert("upscaling", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.chunk_updates) { gfx_updates.insert("chunkUpdates", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.upload_budget_kib) { gfx_updates.insert("uploadBudgetKiB", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.workers) { gfx_updates.insert("workers", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.shadow_cache) { gfx_updates.insert("shadowCache", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.graphics_api.as_deref()) { gfx_updates.insert("graphicsApi", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.sky) { gfx_updates.insert("sky", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.fog) { gfx_updates.insert("fog", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.weather) { gfx_updates.insert("weather", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.hdr) { gfx_updates.insert("hdr", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.hdr_paper_white) { gfx_updates.insert("hdrPaperWhite", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.hdr_peak) { gfx_updates.insert("hdrPeak", val.to_string()); }
    if let Some(val) = hz_opt.and_then(|o| o.hdr_black_level) { gfx_updates.insert("hdrBlackLevel", format!("{:.3}", val)); }
    if let Some(val) = hz_opt.and_then(|o| o.hdr_ui_brightness) { gfx_updates.insert("hdrUiBrightness", format!("{:.2}", val)); }

    gfx_updates.entry("caveCulling").or_insert_with(|| "true".to_string());
    gfx_updates.entry("entityCulling").or_insert_with(|| "false".to_string());
    gfx_updates.entry("graphicsApi").or_insert_with(|| "vulkan".to_string());
    gfx_updates.entry("presentMode").or_insert_with(|| "auto".to_string());
    gfx_updates.entry("lodDistance").or_insert_with(|| "0".to_string());

    let _ = write_or_update_key_value_file(&gfx_path, &gfx_updates);

    // 3. horizon-extras.txt
    let ext_path = game_dir.join("horizon-extras.txt");
    let mut ext_updates = HashMap::new();
    if let Some(b) = hz_opt.and_then(|o| o.fullbright).or(req.horizon_fullbright) { ext_updates.insert("fullbright", b.to_string()); }
    if let Some(d) = hz_opt.and_then(|o| o.dynamic_lights).or(req.horizon_dynamic_lights) { ext_updates.insert("dynamicLights", d.to_string()); }
    if let Some(z) = hz_opt.and_then(|o| o.zoom).or(req.horizon_zoom) { ext_updates.insert("zoom", z.to_string()); }
    if let Some(k) = hz_opt.and_then(|o| o.zoom_key.as_deref()) { ext_updates.insert("zoomKey", k.to_string()); }
    if let Some(l) = hz_opt.and_then(|o| o.zoom_level) { ext_updates.insert("zoomLevel", l.to_string()); }
    if let Some(s) = hz_opt.and_then(|o| o.zoom_smooth) { ext_updates.insert("zoomSmooth", s.to_string()); }
    if let Some(sens) = hz_opt.and_then(|o| o.zoom_sensitivity) { ext_updates.insert("zoomSensitivity", sens.to_string()); }
    if let Some(f) = hz_opt.and_then(|o| o.fps).or(req.horizon_fps) { ext_updates.insert("fps", f.to_string()); }
    if let Some(c) = hz_opt.and_then(|o| o.fps_corner.as_deref()) { ext_updates.insert("fpsCorner", c.to_string()); }
    if let Some(l) = hz_opt.and_then(|o| o.fps_lows) { ext_updates.insert("fpsLows", l.to_string()); }
    if let Some(k) = hz_opt.and_then(|o| o.keystrokes).or(req.horizon_keystrokes) { ext_updates.insert("keystrokes", k.to_string()); }
    if let Some(c) = hz_opt.and_then(|o| o.keystrokes_corner.as_deref()) { ext_updates.insert("keystrokesCorner", c.to_string()); }
    if let Some(cps) = hz_opt.and_then(|o| o.keystrokes_cps) { ext_updates.insert("keystrokesCps", cps.to_string()); }
    if let Some(m) = hz_opt.and_then(|o| o.minimap).or(req.horizon_minimap) { ext_updates.insert("minimap", m.to_string()); }
    if let Some(c) = hz_opt.and_then(|o| o.minimap_corner.as_deref()) { ext_updates.insert("minimapCorner", c.to_string()); }
    if let Some(s) = hz_opt.and_then(|o| o.minimap_size) { ext_updates.insert("minimapSize", s.to_string()); }
    if let Some(sh) = hz_opt.and_then(|o| o.minimap_shape.as_deref()) { ext_updates.insert("minimapShape", sh.to_string()); }
    if let Some(z) = hz_opt.and_then(|o| o.minimap_zoom) { ext_updates.insert("minimapZoom", format!("{:.1}", z)); }
    if let Some(r) = hz_opt.and_then(|o| o.minimap_rotate) { ext_updates.insert("minimapRotate", r.to_string()); }
    if let Some(mt) = hz_opt.and_then(|o| o.mouse_tweaks) { ext_updates.insert("mouseTweaks", mt.to_string()); }
    if let Some(w) = hz_opt.and_then(|o| o.mouse_tweaks_wheel) { ext_updates.insert("mouseTweaksWheel", w.to_string()); }
    if let Some(s) = hz_opt.and_then(|o| o.sort) { ext_updates.insert("sort", s.to_string()); }
    if let Some(k) = hz_opt.and_then(|o| o.sort_key.as_deref()) { ext_updates.insert("sortKey", k.to_string()); }
    if let Some(dp) = hz_opt.and_then(|o| o.discord_presence).or(req.horizon_discord_presence) { ext_updates.insert("discordPresence", dp.to_string()); }
    if let Some(ar) = hz_opt.and_then(|o| o.auto_reconnect) { ext_updates.insert("autoReconnect", ar.to_string()); }
    if let Some(nt) = hz_opt.and_then(|o| o.own_name_tag) { ext_updates.insert("ownNameTag", nt.to_string()); }
    if let Some(na) = hz_opt.and_then(|o| o.no_ai) { ext_updates.insert("no_ai", na.to_string()); }
    if let Some(ac) = hz_opt.and_then(|o| o.agent_control) { ext_updates.insert("agentControl", ac.to_string()); }

    ext_updates.entry("fullbright").or_insert_with(|| "false".to_string());
    ext_updates.entry("dynamicLights").or_insert_with(|| "false".to_string());
    ext_updates.entry("zoom").or_insert_with(|| "true".to_string());
    ext_updates.entry("fps").or_insert_with(|| "true".to_string());

    let _ = write_or_update_key_value_file(&ext_path, &ext_updates);

    Ok(())
}

#[tauri::command]
pub async fn horizon_options_get(app: AppHandle, instance_id: String) -> Result<HorizonOptions, String> {
    let game_dir = paths::instance(&app, &instance_id)?;
    let mut opts = HorizonOptions::default();

    let settings_file = game_dir.join("horizon-launcher-settings.json");
    if let Ok(data) = std::fs::read_to_string(&settings_file) {
        if let Ok(saved) = serde_json::from_str::<HorizonOptions>(&data) {
            opts = saved;
        }
    }

    let opt_map = read_key_value_file(&game_dir.join("options.txt"));
    if let Some(rd) = opt_map.get("renderDistance").and_then(|v| v.parse::<u32>().ok()) { opts.render_distance = Some(rd); }
    if let Some(v) = opt_map.get("fov").and_then(|v| v.parse::<u32>().ok()) { opts.fov = Some(v); }
    if let Some(v) = opt_map.get("gamma").and_then(|v| v.parse::<f64>().ok()) { opts.gamma = Some((v * 100.0).round()); }
    if let Some(v) = opt_map.get("maxFps").and_then(|v| v.parse::<u32>().ok()) { opts.framerate_limit = Some(v); }
    if let Some(v) = opt_map.get("bobView").and_then(|v| v.parse::<bool>().ok()) { opts.view_bobbing = Some(v); }
    if let Some(v) = opt_map.get("guiScale").and_then(|v| v.parse::<i32>().ok()) { opts.gui_scale = Some(v); }
    if let Some(v) = opt_map.get("highContrast").and_then(|v| v.parse::<bool>().ok()) { opts.high_contrast = Some(v); }
    if let Some(v) = opt_map.get("menuBackgroundBlurriness").and_then(|v| v.parse::<u32>().ok()) { opts.menu_blur = Some(v); }
    if let Some(v) = opt_map.get("mouseSensitivity").and_then(|v| v.parse::<f64>().ok()) { opts.mouse_sensitivity = Some((v * 100.0).round()); }
    if let Some(v) = opt_map.get("invertYMouse").and_then(|v| v.parse::<bool>().ok()) { opts.invert_y = Some(v); }
    if let Some(v) = opt_map.get("autoJump").and_then(|v| v.parse::<bool>().ok()) { opts.auto_jump = Some(v); }
    if let Some(v) = opt_map.get("toggleCrouch").and_then(|v| v.parse::<bool>().ok()) { opts.toggle_crouch = Some(v); }
    if let Some(v) = opt_map.get("toggleSprint").and_then(|v| v.parse::<bool>().ok()) { opts.toggle_sprint = Some(v); }
    if let Some(v) = opt_map.get("directionalAudio").and_then(|v| v.parse::<bool>().ok()) { opts.directional_audio = Some(v); }
    if let Some(v) = opt_map.get("showSubtitles").and_then(|v| v.parse::<bool>().ok()) { opts.subtitles = Some(v); }

    let parse_vol = |key: &str| opt_map.get(key).and_then(|v| v.parse::<f64>().ok()).map(|v| (v * 100.0).round());
    if let Some(v) = parse_vol("soundCategory_master") { opts.sound_master = Some(v); }
    if let Some(v) = parse_vol("soundCategory_music") { opts.sound_music = Some(v); }
    if let Some(v) = parse_vol("soundCategory_weather") { opts.sound_weather = Some(v); }
    if let Some(v) = parse_vol("soundCategory_block") { opts.sound_blocks = Some(v); }
    if let Some(v) = parse_vol("soundCategory_hostile") { opts.sound_hostile = Some(v); }
    if let Some(v) = parse_vol("soundCategory_neutral") { opts.sound_neutral = Some(v); }
    if let Some(v) = parse_vol("soundCategory_player") { opts.sound_players = Some(v); }
    if let Some(v) = parse_vol("soundCategory_ambient") { opts.sound_ambient = Some(v); }
    if let Some(v) = parse_vol("soundCategory_voice") { opts.sound_voice = Some(v); }

    let gfx_map = read_key_value_file(&game_dir.join("horizon-graphics.txt"));
    if let Some(v) = gfx_map.get("preset") { opts.preset = Some(v.clone()); }
    if let Some(lod) = gfx_map.get("lodDistance").and_then(|v| v.parse::<u32>().ok()) { opts.lod_distance = Some(lod); }
    if let Some(val) = gfx_map.get("farDetail") { opts.far_detail = Some(val.clone()); }
    if let Some(val) = gfx_map.get("caveCulling").and_then(|v| v.parse::<bool>().ok()) { opts.cave_culling = Some(val); }
    if let Some(val) = gfx_map.get("entityCulling").and_then(|v| v.parse::<bool>().ok()) { opts.entity_culling = Some(val); }
    if let Some(val) = gfx_map.get("animatedTextures").and_then(|v| v.parse::<bool>().ok()) { opts.animated_textures = Some(val); }
    if let Some(val) = gfx_map.get("ditherCutoutMips").and_then(|v| v.parse::<bool>().ok()) { opts.dither_cutout_mips = Some(val); }
    if let Some(val) = gfx_map.get("fxaa").and_then(|v| v.parse::<bool>().ok()) { opts.fxaa = Some(val); }
    if let Some(val) = gfx_map.get("taa").and_then(|v| v.parse::<bool>().ok()) { opts.taa = Some(val); }
    if let Some(val) = gfx_map.get("presentMode") { opts.present_mode = Some(val.clone()); }
    if let Some(val) = gfx_map.get("resolutionScale").and_then(|v| v.parse::<f64>().ok()) { opts.resolution_scale = Some(val); }
    if let Some(val) = gfx_map.get("upscaling") { opts.upscaling = Some(val.clone()); }
    if let Some(val) = gfx_map.get("chunkUpdates").and_then(|v| v.parse::<u32>().ok()) { opts.chunk_updates = Some(val); }
    if let Some(val) = gfx_map.get("uploadBudgetKiB").and_then(|v| v.parse::<u32>().ok()) { opts.upload_budget_kib = Some(val); }
    if let Some(val) = gfx_map.get("workers").and_then(|v| v.parse::<u32>().ok()) { opts.workers = Some(val); }
    if let Some(val) = gfx_map.get("shadowCache").and_then(|v| v.parse::<bool>().ok()) { opts.shadow_cache = Some(val); }
    if let Some(val) = gfx_map.get("graphicsApi") { opts.graphics_api = Some(val.clone()); }
    if let Some(val) = gfx_map.get("sky").and_then(|v| v.parse::<bool>().ok()) { opts.sky = Some(val); }
    if let Some(val) = gfx_map.get("fog").and_then(|v| v.parse::<bool>().ok()) { opts.fog = Some(val); }
    if let Some(val) = gfx_map.get("weather").and_then(|v| v.parse::<bool>().ok()) { opts.weather = Some(val); }
    if let Some(val) = gfx_map.get("hdr").and_then(|v| v.parse::<bool>().ok()) { opts.hdr = Some(val); }
    if let Some(val) = gfx_map.get("hdrPaperWhite").and_then(|v| v.parse::<u32>().ok()) { opts.hdr_paper_white = Some(val); }
    if let Some(val) = gfx_map.get("hdrPeak").and_then(|v| v.parse::<u32>().ok()) { opts.hdr_peak = Some(val); }
    if let Some(val) = gfx_map.get("hdrBlackLevel").and_then(|v| v.parse::<f64>().ok()) { opts.hdr_black_level = Some(val); }
    if let Some(val) = gfx_map.get("hdrUiBrightness").and_then(|v| v.parse::<f64>().ok()) { opts.hdr_ui_brightness = Some(val); }

    let ext_map = read_key_value_file(&game_dir.join("horizon-extras.txt"));
    if let Some(val) = ext_map.get("fullbright").and_then(|v| v.parse::<bool>().ok()) { opts.fullbright = Some(val); }
    if let Some(val) = ext_map.get("dynamicLights").and_then(|v| v.parse::<bool>().ok()) { opts.dynamic_lights = Some(val); }
    if let Some(val) = ext_map.get("zoom").and_then(|v| v.parse::<bool>().ok()) { opts.zoom = Some(val); }
    if let Some(val) = ext_map.get("zoomKey") { opts.zoom_key = Some(val.clone()); }
    if let Some(val) = ext_map.get("zoomLevel").and_then(|v| v.parse::<u32>().ok()) { opts.zoom_level = Some(val); }
    if let Some(val) = ext_map.get("zoomSmooth").and_then(|v| v.parse::<bool>().ok()) { opts.zoom_smooth = Some(val); }
    if let Some(val) = ext_map.get("zoomSensitivity").and_then(|v| v.parse::<bool>().ok()) { opts.zoom_sensitivity = Some(val); }
    if let Some(val) = ext_map.get("fps").and_then(|v| v.parse::<bool>().ok()) { opts.fps = Some(val); }
    if let Some(val) = ext_map.get("fpsCorner") { opts.fps_corner = Some(val.clone()); }
    if let Some(val) = ext_map.get("fpsLows").and_then(|v| v.parse::<bool>().ok()) { opts.fps_lows = Some(val); }
    if let Some(val) = ext_map.get("keystrokes").and_then(|v| v.parse::<bool>().ok()) { opts.keystrokes = Some(val); }
    if let Some(val) = ext_map.get("keystrokesCorner") { opts.keystrokes_corner = Some(val.clone()); }
    if let Some(val) = ext_map.get("keystrokesCps").and_then(|v| v.parse::<bool>().ok()) { opts.keystrokes_cps = Some(val); }
    if let Some(val) = ext_map.get("minimap").and_then(|v| v.parse::<bool>().ok()) { opts.minimap = Some(val); }
    if let Some(val) = ext_map.get("minimapCorner") { opts.minimap_corner = Some(val.clone()); }
    if let Some(val) = ext_map.get("minimapSize").and_then(|v| v.parse::<u32>().ok()) { opts.minimap_size = Some(val); }
    if let Some(val) = ext_map.get("minimapShape") { opts.minimap_shape = Some(val.clone()); }
    if let Some(val) = ext_map.get("minimapZoom").and_then(|v| v.parse::<f64>().ok()) { opts.minimap_zoom = Some(val); }
    if let Some(val) = ext_map.get("minimapRotate").and_then(|v| v.parse::<bool>().ok()) { opts.minimap_rotate = Some(val); }
    if let Some(val) = ext_map.get("mouseTweaks").and_then(|v| v.parse::<bool>().ok()) { opts.mouse_tweaks = Some(val); }
    if let Some(val) = ext_map.get("mouseTweaksWheel").and_then(|v| v.parse::<bool>().ok()) { opts.mouse_tweaks_wheel = Some(val); }
    if let Some(val) = ext_map.get("sort").and_then(|v| v.parse::<bool>().ok()) { opts.sort = Some(val); }
    if let Some(val) = ext_map.get("sortKey") { opts.sort_key = Some(val.clone()); }
    if let Some(val) = ext_map.get("discordPresence").and_then(|v| v.parse::<bool>().ok()) { opts.discord_presence = Some(val); }
    if let Some(val) = ext_map.get("autoReconnect").and_then(|v| v.parse::<bool>().ok()) { opts.auto_reconnect = Some(val); }
    if let Some(val) = ext_map.get("ownNameTag").and_then(|v| v.parse::<bool>().ok()) { opts.own_name_tag = Some(val); }
    if let Some(val) = ext_map.get("no_ai").and_then(|v| v.parse::<bool>().ok()) { opts.no_ai = Some(val); }
    if let Some(val) = ext_map.get("agentControl").and_then(|v| v.parse::<bool>().ok()) { opts.agent_control = Some(val); }

    Ok(opts)
}

#[tauri::command]
pub async fn horizon_options_set(app: AppHandle, instance_id: String, options: HorizonOptions) -> Result<(), String> {
    let game_dir = paths::instance(&app, &instance_id)?;
    std::fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

    let settings_file = game_dir.join("horizon-launcher-settings.json");
    let json_bytes = serde_json::to_vec_pretty(&options).map_err(|e| e.to_string())?;
    std::fs::write(&settings_file, json_bytes).map_err(|e| e.to_string())?;

    // 1. options.txt
    let mut opt_updates = HashMap::new();
    if let Some(rd) = options.render_distance { opt_updates.insert("renderDistance", rd.to_string()); }
    if let Some(v) = options.fov { opt_updates.insert("fov", v.to_string()); }
    if let Some(v) = options.gamma { opt_updates.insert("gamma", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.framerate_limit { opt_updates.insert("maxFps", v.to_string()); }
    if let Some(v) = options.view_bobbing { opt_updates.insert("bobView", v.to_string()); }
    if let Some(v) = options.gui_scale { opt_updates.insert("guiScale", v.to_string()); }
    if let Some(v) = options.high_contrast { opt_updates.insert("highContrast", v.to_string()); }
    if let Some(v) = options.menu_blur { opt_updates.insert("menuBackgroundBlurriness", v.to_string()); }
    if let Some(v) = options.mouse_sensitivity { opt_updates.insert("mouseSensitivity", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.invert_y { opt_updates.insert("invertYMouse", v.to_string()); }
    if let Some(v) = options.auto_jump { opt_updates.insert("autoJump", v.to_string()); }
    if let Some(v) = options.toggle_crouch { opt_updates.insert("toggleCrouch", v.to_string()); }
    if let Some(v) = options.toggle_sprint { opt_updates.insert("toggleSprint", v.to_string()); }
    if let Some(v) = options.directional_audio { opt_updates.insert("directionalAudio", v.to_string()); }
    if let Some(v) = options.subtitles { opt_updates.insert("showSubtitles", v.to_string()); }

    if let Some(v) = options.sound_master { opt_updates.insert("soundCategory_master", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.sound_music { opt_updates.insert("soundCategory_music", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.sound_weather { opt_updates.insert("soundCategory_weather", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.sound_blocks { opt_updates.insert("soundCategory_block", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.sound_hostile { opt_updates.insert("soundCategory_hostile", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.sound_neutral { opt_updates.insert("soundCategory_neutral", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.sound_players { opt_updates.insert("soundCategory_player", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.sound_ambient { opt_updates.insert("soundCategory_ambient", format!("{:.2}", v / 100.0)); }
    if let Some(v) = options.sound_voice { opt_updates.insert("soundCategory_voice", format!("{:.2}", v / 100.0)); }

    let _ = write_or_update_key_value_file(&game_dir.join("options.txt"), &opt_updates);

    // 2. horizon-graphics.txt
    let mut gfx = HashMap::new();
    let preset = options.preset.as_deref().unwrap_or("custom");
    gfx.insert("preset", preset.to_string());
    if let Some(lod) = options.lod_distance { gfx.insert("lodDistance", lod.to_string()); }
    if let Some(fd) = &options.far_detail { gfx.insert("farDetail", fd.clone()); }
    if let Some(c) = options.cave_culling { gfx.insert("caveCulling", c.to_string()); }
    if let Some(e) = options.entity_culling { gfx.insert("entityCulling", e.to_string()); }
    if let Some(a) = options.animated_textures { gfx.insert("animatedTextures", a.to_string()); }
    if let Some(d) = options.dither_cutout_mips { gfx.insert("ditherCutoutMips", d.to_string()); }
    if let Some(f) = options.fxaa { gfx.insert("fxaa", f.to_string()); }
    if let Some(t) = options.taa { gfx.insert("taa", t.to_string()); }
    if let Some(p) = &options.present_mode { gfx.insert("presentMode", p.clone()); }
    if let Some(r) = options.resolution_scale { gfx.insert("resolutionScale", format!("{:.2}", r)); }
    if let Some(u) = &options.upscaling { gfx.insert("upscaling", u.clone()); }
    if let Some(cu) = options.chunk_updates { gfx.insert("chunkUpdates", cu.to_string()); }
    if let Some(ub) = options.upload_budget_kib { gfx.insert("uploadBudgetKiB", ub.to_string()); }
    if let Some(w) = options.workers { gfx.insert("workers", w.to_string()); }
    if let Some(sc) = options.shadow_cache { gfx.insert("shadowCache", sc.to_string()); }
    if let Some(api) = &options.graphics_api { gfx.insert("graphicsApi", api.clone()); }
    if let Some(s) = options.sky { gfx.insert("sky", s.to_string()); }
    if let Some(f) = options.fog { gfx.insert("fog", f.to_string()); }
    if let Some(w) = options.weather { gfx.insert("weather", w.to_string()); }
    if let Some(h) = options.hdr { gfx.insert("hdr", h.to_string()); }
    if let Some(v) = options.hdr_paper_white { gfx.insert("hdrPaperWhite", v.to_string()); }
    if let Some(v) = options.hdr_peak { gfx.insert("hdrPeak", v.to_string()); }
    if let Some(v) = options.hdr_black_level { gfx.insert("hdrBlackLevel", format!("{:.3}", v)); }
    if let Some(v) = options.hdr_ui_brightness { gfx.insert("hdrUiBrightness", format!("{:.2}", v)); }
    let _ = write_or_update_key_value_file(&game_dir.join("horizon-graphics.txt"), &gfx);

    // 3. horizon-extras.txt
    let mut ext = HashMap::new();
    if let Some(b) = options.fullbright { ext.insert("fullbright", b.to_string()); }
    if let Some(d) = options.dynamic_lights { ext.insert("dynamicLights", d.to_string()); }
    if let Some(z) = options.zoom { ext.insert("zoom", z.to_string()); }
    if let Some(k) = &options.zoom_key { ext.insert("zoomKey", k.clone()); }
    if let Some(l) = options.zoom_level { ext.insert("zoomLevel", l.to_string()); }
    if let Some(s) = options.zoom_smooth { ext.insert("zoomSmooth", s.to_string()); }
    if let Some(s) = options.zoom_sensitivity { ext.insert("zoomSensitivity", s.to_string()); }
    if let Some(f) = options.fps { ext.insert("fps", f.to_string()); }
    if let Some(c) = &options.fps_corner { ext.insert("fpsCorner", c.clone()); }
    if let Some(l) = options.fps_lows { ext.insert("fpsLows", l.to_string()); }
    if let Some(k) = options.keystrokes { ext.insert("keystrokes", k.to_string()); }
    if let Some(c) = &options.keystrokes_corner { ext.insert("keystrokesCorner", c.clone()); }
    if let Some(c) = options.keystrokes_cps { ext.insert("keystrokesCps", c.to_string()); }
    if let Some(m) = options.minimap { ext.insert("minimap", m.to_string()); }
    if let Some(c) = &options.minimap_corner { ext.insert("minimapCorner", c.clone()); }
    if let Some(s) = options.minimap_size { ext.insert("minimapSize", s.to_string()); }
    if let Some(sh) = &options.minimap_shape { ext.insert("minimapShape", sh.clone()); }
    if let Some(z) = options.minimap_zoom { ext.insert("minimapZoom", format!("{:.1}", z)); }
    if let Some(r) = options.minimap_rotate { ext.insert("minimapRotate", r.to_string()); }
    if let Some(mt) = options.mouse_tweaks { ext.insert("mouseTweaks", mt.to_string()); }
    if let Some(w) = options.mouse_tweaks_wheel { ext.insert("mouseTweaksWheel", w.to_string()); }
    if let Some(s) = options.sort { ext.insert("sort", s.to_string()); }
    if let Some(k) = &options.sort_key { ext.insert("sortKey", k.clone()); }
    if let Some(dp) = options.discord_presence { ext.insert("discordPresence", dp.to_string()); }
    if let Some(ar) = options.auto_reconnect { ext.insert("autoReconnect", ar.to_string()); }
    if let Some(nt) = options.own_name_tag { ext.insert("ownNameTag", nt.to_string()); }
    if let Some(na) = options.no_ai { ext.insert("no_ai", na.to_string()); }
    if let Some(ac) = options.agent_control { ext.insert("agentControl", ac.to_string()); }
    let _ = write_or_update_key_value_file(&game_dir.join("horizon-extras.txt"), &ext);

    Ok(())
}

#[tauri::command]
pub async fn horizon_prepare_sync(app: AppHandle, state: State<'_, AppState>, instance_id: String) -> Result<(), String> {
    ensure_horizon_engine(&app, &state, &instance_id, true).await?;
    Ok(())
}

pub(crate) fn hide_console(cmd: &mut tokio::process::Command) {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = cmd;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maven_paths() {
        assert_eq!(
            maven_path("net.fabricmc:fabric-loader:0.16.9").unwrap(),
            "net/fabricmc/fabric-loader/0.16.9/fabric-loader-0.16.9.jar"
        );
        assert_eq!(
            maven_path("org.lwjgl:lwjgl:3.3.3:natives-windows").unwrap(),
            "org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-windows.jar"
        );
        assert_eq!(maven_path("de.oceanlabs.mcp:mcp_config:1.20.1@zip").unwrap(), "de/oceanlabs/mcp/mcp_config/1.20.1/mcp_config-1.20.1.zip");
    }

    #[test]
    fn substitution() {
        let mut v = HashMap::new();
        v.insert("a", "1".to_string());
        assert_eq!(substitute("x${a}y${b}", &v), "x1y${b}");
        assert_eq!(substitute("-Dfoo=${a}", &v), "-Dfoo=1");
    }

    #[test]
    fn rules() {
        let f = HashMap::new();
        let win_only = json!([{ "action": "allow", "os": { "name": os_name() } }]);
        assert!(rules_allow(Some(&win_only), &f));
        let not_here = json!([{ "action": "allow" }, { "action": "disallow", "os": { "name": os_name() } }]);
        assert!(!rules_allow(Some(&not_here), &f));
        let demo = json!([{ "action": "allow", "features": { "is_demo_user": true } }]);
        assert!(!rules_allow(Some(&demo), &f));
    }

    #[test]
    fn merging_keeps_child_first() {
        let parent = json!({"id":"1.21.4","mainClass":"net.minecraft.client.main.Main","libraries":[{"name":"org.ow2.asm:asm:9.1"}],"arguments":{"game":["--a"],"jvm":["-Dp"]}});
        let child = json!({"id":"fabric","inheritsFrom":"1.21.4","mainClass":"net.fabricmc.loader.impl.launch.knot.KnotClient","libraries":[{"name":"org.ow2.asm:asm:9.7"}],"arguments":{"game":[],"jvm":["-Dc"]}});
        let m = merge(parent, child);
        assert_eq!(m["mainClass"], "net.fabricmc.loader.impl.launch.knot.KnotClient");
        assert_eq!(m["libraries"][0]["name"], "org.ow2.asm:asm:9.7");
        assert_eq!(m["arguments"]["jvm"], json!(["-Dp", "-Dc"]));
        assert!(m.get("inheritsFrom").is_none());
        let plan = plan_libraries(&m, Path::new("/tmp/libs")).unwrap();
        assert_eq!(plan.classpath.len(), 1, "asm duplicado deve ser removido");
        assert!(plan.classpath[0].to_string_lossy().contains("9.7"));
    }
}
