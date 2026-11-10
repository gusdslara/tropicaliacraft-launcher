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
    pub game_version: String,
    pub loader: String,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub engine: Option<String>,
    pub account: LaunchAccount,
    pub memory_min_mb: u32,
    pub memory_max_mb: u32,
    #[serde(default)]
    pub jvm_args: Vec<String>,
    #[serde(default)]
    pub java_path: Option<String>,
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
    if req.loader == "horizon-rust" || req.engine.as_deref() == Some("rust") {
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
        });
        let root_dir = paths::root(&app)?;
        let trigger_file = root_dir.join("tropicalia-java-launch.json");
        std::fs::write(&trigger_file, serde_json::to_vec_pretty(&launch_payload).unwrap())
            .map_err(|e| format!("Falha ao acionar o motor Java Android: {e}"))?;

        // Também grava em files/ se existir
        let files_dir = root_dir.join("files");
        if files_dir.exists() || std::fs::create_dir_all(&files_dir).is_ok() {
            let _ = std::fs::write(files_dir.join("tropicalia-java-launch.json"), serde_json::to_vec_pretty(&launch_payload).unwrap());
        }

        // Tenta sincronizar o json da versão e client.jar com PojavLauncher
        let pojav_version_dir = PathBuf::from("/storage/emulated/0/Android/data/net.kdt.pojavlaunch/files/.minecraft/versions").join(&version_id);
        if std::fs::create_dir_all(&pojav_version_dir).is_ok() {
            let src_json = version_json_path(&shared, &version_id);
            if src_json.exists() {
                let _ = std::fs::copy(&src_json, pojav_version_dir.join(format!("{version_id}.json")));
            }
            if client_jar.exists() {
                let _ = std::fs::copy(&client_jar, pojav_version_dir.join(format!("{version_id}.jar")));
            }
        }

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
pub async fn game_kill(state: State<'_, AppState>, instance_id: String) -> Result<(), String> {
    let pid = state.games.lock().await.get(&instance_id).copied();
    match pid {
        Some(pid) if pid != 0 => kill_pid(pid),
        _ => Err("Essa instância não está rodando".into()),
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
    sync_horizon_options_to_dir(&game_dir, req)?;

    // Preparar arquivo de sessão caso o usuário esteja autenticado (Microsoft / MSA)
    let session_file_path = if req.account.user_type == "msa"
        && !req.account.access_token.is_empty()
        && req.account.access_token != "0"
    {
        let sessions_dir = game_dir.join("sessions");
        let _ = std::fs::create_dir_all(&sessions_dir);
        let sf = sessions_dir.join("tropicalia-session.json");
        let session_body = json!({
            "name": req.account.username,
            "uuid": req.account.uuid,
            "access_token": req.account.access_token,
            "user_type": "msa",
            "xuid": null
        });
        let _ = std::fs::write(&sf, serde_json::to_vec(&session_body).unwrap_or_default());
        Some(sf)
    } else {
        None
    };

    #[cfg(target_os = "android")]
    {
        let _ = state;
        download::emit(app, &owner, "launch", 1, 1, "Iniciando Horizon Rust (26.3) no Android…");
        let root_dir = paths::root(app)?;
        let mc_lang = map_to_mc_language(&detect_system_locale());

        let mut extra_args: Vec<String> = Vec::new();
        if let Some(rd) = req.horizon_render_distance {
            extra_args.push("--render-distance".into());
            extra_args.push(rd.to_string());
        }
        if req.horizon_creative.unwrap_or(false) {
            extra_args.push("--creative".into());
        }
        if req.horizon_test_terrain.unwrap_or(false) {
            extra_args.push("--test-terrain".into());
        }
        if req.horizon_pregen.unwrap_or(false) {
            extra_args.push("--pregen".into());
        }
        if let Some(custom_args) = &req.horizon_args {
            for a in custom_args {
                extra_args.push(a.clone());
            }
        }

        let launcher_cfg = json!({
            "name": if req.account.username.is_empty() { "Player" } else { &req.account.username },
            "server": req.server_address.clone().unwrap_or_default(),
            "game_dir": game_dir.to_string_lossy(),
            "session_file": session_file_path.as_ref().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default(),
            "lang": mc_lang,
            "extra_arguments": extra_args,
        });
        let _ = std::fs::write(root_dir.join("android-launcher.json"), serde_json::to_vec_pretty(&launcher_cfg).unwrap());
        let _ = std::fs::write(root_dir.join("android-launch.json"), serde_json::to_vec(&extra_args).unwrap());
        let _ = std::fs::write(root_dir.join("tropicalia-auto.flag"), b"1");
        sync_options_language(&root_dir);
        let _ = sync_horizon_options_to_dir(&root_dir, req);
        let trigger_file = root_dir.join("tropicalia-horizon-launch.json");
        std::fs::write(&trigger_file, serde_json::to_vec_pretty(&launcher_cfg).unwrap())
            .map_err(|e| format!("Falha ao acionar o motor Horizon Rust Android: {e}"))?;

        // Também grava em files/ caso self.home aponte para filesDir
        let files_dir = root_dir.join("files");
        if files_dir.exists() || std::fs::create_dir_all(&files_dir).is_ok() {
            let _ = std::fs::write(files_dir.join("android-launcher.json"), serde_json::to_vec_pretty(&launcher_cfg).unwrap());
            let _ = std::fs::write(files_dir.join("android-launch.json"), serde_json::to_vec(&extra_args).unwrap());
            let _ = std::fs::write(files_dir.join("tropicalia-auto.flag"), b"1");
            sync_options_language(&files_dir);
            let _ = sync_horizon_options_to_dir(&files_dir, req);
            let _ = std::fs::write(files_dir.join("tropicalia-horizon-launch.json"), serde_json::to_vec_pretty(&launcher_cfg).unwrap());
        }

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

        download::emit(app, &owner, "launch", 1, 1, "Iniciando Horizon Rust…".to_string());

        let mut cmd = tokio::process::Command::new(&client_bin);
        cmd.current_dir(&game_dir)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        cmd.arg("--resources").arg(&resources_dir);

        if let Some(rd) = req.horizon_render_distance {
            cmd.arg("--render-distance").arg(rd.to_string());
        }
        if let Some(sf) = &session_file_path {
            cmd.arg("--session-file").arg(sf);
        } else if !req.account.username.is_empty() {
            cmd.arg("--name").arg(&req.account.username);
        }
        if let Some(addr) = &req.server_address {
            cmd.arg("--server").arg(addr);
        }
        if let Some(res) = &req.resolution {
            cmd.arg("--width").arg(res.width.to_string()).arg("--height").arg(res.height.to_string());
        }
        if req.horizon_creative.unwrap_or(false) {
            cmd.arg("--creative");
        }
        if req.horizon_test_terrain.unwrap_or(false) {
            cmd.arg("--test-terrain");
        }
        if req.horizon_pregen.unwrap_or(false) {
            cmd.arg("--pregen");
        }
        if let Some(extra_args) = &req.horizon_args {
            for arg in extra_args {
                cmd.arg(arg);
            }
        }

        cmd.env("HORIZON_HOME", &game_dir);
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
        download::emit(app, owner, "horizon-prepare", 0, 2, "Preparando recursos e texturas de Minecraft 26.3 para Rust…".to_string());

        let mut cmd = tokio::process::Command::new(&prepare_bin);
        cmd.current_dir(&horizon_dir);
        cmd.arg("--prepare");
        cmd.arg("--server-jar").arg(&server_jar);
        cmd.arg("--minecraft-dir").arg(&shared);
        cmd.arg("--root").arg(&horizon_dir);
        hide_console(&mut cmd);

        let out = cmd.output().await.map_err(|e| format!("Falha ao executar horizon-prepare: {e}"))?;
        if !out.status.success() {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let stdout = String::from_utf8_lossy(&out.stdout);
            return Err(format!("horizon-prepare --prepare falhou:\n{stderr}\n{stdout}"));
        }

        download::emit(app, owner, "horizon-prepare", 1, 2, "Extraindo banco sonoro do Horizon Rust…".to_string());
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
    }

    Ok((client_bin, resources_dir))
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct HorizonOptions {
    #[serde(default)]
    pub render_distance: Option<u32>,
    #[serde(default)]
    pub lod_distance: Option<u32>,
    #[serde(default)]
    pub far_detail: Option<String>,
    #[serde(default)]
    pub cave_culling: Option<bool>,
    #[serde(default)]
    pub entity_culling: Option<bool>,
    #[serde(default)]
    pub animated_textures: Option<bool>,
    #[serde(default)]
    pub fxaa: Option<bool>,
    #[serde(default)]
    pub sky: Option<bool>,
    #[serde(default)]
    pub fog: Option<bool>,
    #[serde(default)]
    pub weather: Option<bool>,
    #[serde(default)]
    pub fullbright: Option<bool>,
    #[serde(default)]
    pub dynamic_lights: Option<bool>,
    #[serde(default)]
    pub zoom: Option<bool>,
    #[serde(default)]
    pub fps: Option<bool>,
    #[serde(default)]
    pub keystrokes: Option<bool>,
    #[serde(default)]
    pub minimap: Option<bool>,
    #[serde(default)]
    pub discord_presence: Option<bool>,
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

    // 1. options.txt (idioma, distância de renderização, pacotes de recursos ativos)
    let opt_path = game_dir.join("options.txt");
    let mut opt_updates = HashMap::new();
    if let Some(rd) = req.horizon_render_distance {
        opt_updates.insert("renderDistance", rd.to_string());
    }
    let mc_lang = map_to_mc_language(&detect_system_locale());
    opt_updates.insert("lang", mc_lang.to_string());
    opt_updates.insert("onboardAccessibility", "false".to_string());
    opt_updates.insert("skipMultiplayerWarning", "true".to_string());

    let rp_dir = game_dir.join("resourcepacks");
    if rp_dir.is_dir() {
        let mut active_packs = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&rp_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if !name.ends_with(".disabled") && (name.ends_with(".zip") || entry.path().is_dir()) {
                    active_packs.push(format!("\"file/{name}\""));
                }
            }
        }
        if !active_packs.is_empty() {
            opt_updates.insert("resourcePacks", format!("[{}]", active_packs.join(",")));
        }
    }
    let _ = write_or_update_key_value_file(&opt_path, &opt_updates);

    // 2. horizon-graphics.txt
    let gfx_path = game_dir.join("horizon-graphics.txt");
    let mut gfx_updates = HashMap::new();
    gfx_updates.insert("preset", "custom".to_string());
    if let Some(lod) = req.horizon_lod_distance {
        gfx_updates.insert("lodDistance", lod.to_string());
    }
    if let Some(c) = req.horizon_cave_culling {
        gfx_updates.insert("caveCulling", c.to_string());
    }
    if let Some(e) = req.horizon_entity_culling {
        gfx_updates.insert("entityCulling", e.to_string());
    }
    if let Some(a) = req.horizon_animated_textures {
        gfx_updates.insert("animatedTextures", a.to_string());
    }
    if let Some(f) = req.horizon_fxaa {
        gfx_updates.insert("fxaa", f.to_string());
    }
    let sp_dir = game_dir.join("shaderpacks");
    if sp_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&sp_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if !name.ends_with(".disabled") && (name.ends_with(".hshader") || name.ends_with(".zip")) {
                    gfx_updates.insert("shaderPack", name);
                    break;
                }
            }
        }
    }
    let _ = write_or_update_key_value_file(&gfx_path, &gfx_updates);

    // 3. horizon-extras.txt
    let ext_path = game_dir.join("horizon-extras.txt");
    let mut ext_updates = HashMap::new();
    if let Some(b) = req.horizon_fullbright {
        ext_updates.insert("fullbright", b.to_string());
    }
    if let Some(d) = req.horizon_dynamic_lights {
        ext_updates.insert("dynamicLights", d.to_string());
    }
    if let Some(z) = req.horizon_zoom {
        ext_updates.insert("zoom", z.to_string());
    }
    if let Some(f) = req.horizon_fps {
        ext_updates.insert("fps", f.to_string());
    }
    if let Some(k) = req.horizon_keystrokes {
        ext_updates.insert("keystrokes", k.to_string());
    }
    if let Some(m) = req.horizon_minimap {
        ext_updates.insert("minimap", m.to_string());
    }
    if let Some(dp) = req.horizon_discord_presence {
        ext_updates.insert("discordPresence", dp.to_string());
    }
    let _ = write_or_update_key_value_file(&ext_path, &ext_updates);

    // 4. horizon-mods.txt (habilita todos os .hmod ativos na pasta horizon-mods/ + módulos nativos)
    let mods_dir = game_dir.join("horizon-mods");
    let mut mod_lines = Vec::new();
    if mods_dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&mods_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if let Some(id) = name.strip_suffix(".hmod") {
                    mod_lines.push(format!("mod.{id}:true"));
                } else if let Some(id) = name.strip_suffix(".hmod.disabled") {
                    mod_lines.push(format!("mod.{id}:false"));
                }
            }
        }
    }
    // Módulos nativos embutidos do Horizon
    mod_lines.push(format!("mod.zoom:{}", req.horizon_zoom.unwrap_or(true)));
    mod_lines.push(format!("mod.minimap:{}", req.horizon_minimap.unwrap_or(false)));
    mod_lines.push("mod.recipes:true".to_string());
    mod_lines.push("mod.smartf3:true".to_string());
    let _ = std::fs::write(game_dir.join("horizon-mods.txt"), mod_lines.join("\n") + "\n");

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
    if let Some(rd) = opt_map.get("renderDistance").and_then(|v| v.parse::<u32>().ok()) {
        opts.render_distance = Some(rd);
    }

    let gfx_map = read_key_value_file(&game_dir.join("horizon-graphics.txt"));
    if let Some(lod) = gfx_map.get("lodDistance").and_then(|v| v.parse::<u32>().ok()) {
        opts.lod_distance = Some(lod);
    }
    if let Some(val) = gfx_map.get("farDetail") {
        opts.far_detail = Some(val.clone());
    }
    if let Some(val) = gfx_map.get("caveCulling").and_then(|v| v.parse::<bool>().ok()) {
        opts.cave_culling = Some(val);
    }
    if let Some(val) = gfx_map.get("entityCulling").and_then(|v| v.parse::<bool>().ok()) {
        opts.entity_culling = Some(val);
    }
    if let Some(val) = gfx_map.get("animatedTextures").and_then(|v| v.parse::<bool>().ok()) {
        opts.animated_textures = Some(val);
    }
    if let Some(val) = gfx_map.get("fxaa").and_then(|v| v.parse::<bool>().ok()) {
        opts.fxaa = Some(val);
    }
    if let Some(val) = gfx_map.get("sky").and_then(|v| v.parse::<bool>().ok()) {
        opts.sky = Some(val);
    }
    if let Some(val) = gfx_map.get("fog").and_then(|v| v.parse::<bool>().ok()) {
        opts.fog = Some(val);
    }
    if let Some(val) = gfx_map.get("weather").and_then(|v| v.parse::<bool>().ok()) {
        opts.weather = Some(val);
    }

    let ext_map = read_key_value_file(&game_dir.join("horizon-extras.txt"));
    if let Some(val) = ext_map.get("fullbright").and_then(|v| v.parse::<bool>().ok()) {
        opts.fullbright = Some(val);
    }
    if let Some(val) = ext_map.get("dynamicLights").and_then(|v| v.parse::<bool>().ok()) {
        opts.dynamic_lights = Some(val);
    }
    if let Some(val) = ext_map.get("zoom").and_then(|v| v.parse::<bool>().ok()) {
        opts.zoom = Some(val);
    }
    if let Some(val) = ext_map.get("fps").and_then(|v| v.parse::<bool>().ok()) {
        opts.fps = Some(val);
    }
    if let Some(val) = ext_map.get("keystrokes").and_then(|v| v.parse::<bool>().ok()) {
        opts.keystrokes = Some(val);
    }
    if let Some(val) = ext_map.get("minimap").and_then(|v| v.parse::<bool>().ok()) {
        opts.minimap = Some(val);
    }
    if let Some(val) = ext_map.get("discordPresence").and_then(|v| v.parse::<bool>().ok()) {
        opts.discord_presence = Some(val);
    }

    Ok(opts)
}

#[tauri::command]
pub async fn horizon_options_set(app: AppHandle, instance_id: String, options: HorizonOptions) -> Result<(), String> {
    let game_dir = paths::instance(&app, &instance_id)?;
    std::fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;

    let settings_file = game_dir.join("horizon-launcher-settings.json");
    let json_bytes = serde_json::to_vec_pretty(&options).map_err(|e| e.to_string())?;
    std::fs::write(&settings_file, json_bytes).map_err(|e| e.to_string())?;

    if let Some(rd) = options.render_distance {
        let mut map = HashMap::new();
        map.insert("renderDistance", rd.to_string());
        let _ = write_or_update_key_value_file(&game_dir.join("options.txt"), &map);
    }

    let mut gfx = HashMap::new();
    gfx.insert("preset", "custom".to_string());
    if let Some(lod) = options.lod_distance {
        gfx.insert("lodDistance", lod.to_string());
    }
    if let Some(fd) = &options.far_detail {
        gfx.insert("farDetail", fd.clone());
    }
    if let Some(c) = options.cave_culling {
        gfx.insert("caveCulling", c.to_string());
    }
    if let Some(e) = options.entity_culling {
        gfx.insert("entityCulling", e.to_string());
    }
    if let Some(a) = options.animated_textures {
        gfx.insert("animatedTextures", a.to_string());
    }
    if let Some(f) = options.fxaa {
        gfx.insert("fxaa", f.to_string());
    }
    if let Some(s) = options.sky {
        gfx.insert("sky", s.to_string());
    }
    if let Some(f) = options.fog {
        gfx.insert("fog", f.to_string());
    }
    if let Some(w) = options.weather {
        gfx.insert("weather", w.to_string());
    }
    let _ = write_or_update_key_value_file(&game_dir.join("horizon-graphics.txt"), &gfx);

    let mut ext = HashMap::new();
    if let Some(b) = options.fullbright {
        ext.insert("fullbright", b.to_string());
    }
    if let Some(d) = options.dynamic_lights {
        ext.insert("dynamicLights", d.to_string());
    }
    if let Some(z) = options.zoom {
        ext.insert("zoom", z.to_string());
    }
    if let Some(f) = options.fps {
        ext.insert("fps", f.to_string());
    }
    if let Some(k) = options.keystrokes {
        ext.insert("keystrokes", k.to_string());
    }
    if let Some(m) = options.minimap {
        ext.insert("minimap", m.to_string());
    }
    if let Some(dp) = options.discord_presence {
        ext.insert("discordPresence", dp.to_string());
    }
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
