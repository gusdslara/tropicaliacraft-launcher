//! Servidores locais: Paper, Purpur, Fabric, híbridos (Magma, Mohist, Arclight) e o Pumpkin (Rust, sem Java).
//! O frontend resolve a URL do JAR pelas APIs de cada motor; aqui baixamos, aceitamos a EULA,
//! editamos o server.properties e controlamos o processo com console em tempo real.

use crate::download::{self, Job};
use crate::{AppState, game, java, paths};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

pub struct RunningServer {
    pub stdin: tokio::process::ChildStdin,
    pub pid: Option<u32>,
    pub name: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ServerLog {
    id: String,
    line: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub id: String,
    pub status: String,
    pub code: Option<i32>,
}

fn emit_status(app: &AppHandle, id: &str, status: &str, code: Option<i32>) {
    let _ = app.emit("server://status", ServerStatus { id: id.into(), status: status.into(), code });
}

/// Mensagem do próprio launcher no console do servidor (Java, erros, encerramento).
fn console(app: &AppHandle, id: &str, msg: impl AsRef<str>) {
    let _ = app.emit("server://log", ServerLog { id: id.into(), line: format!("[Tropicalia] {}", msg.as_ref()) });
}

/// Limpa uma linha crua do processo: aceita bytes fora do UTF-8 (antes a leitura parava na primeira
/// linha inválida e o console "congelava"), tira cores ANSI e fica só com o último trecho após um CR.
pub(crate) fn clean_line(raw: &[u8]) -> String {
    let text = String::from_utf8_lossy(raw);
    let text = text.trim_end_matches(['\n', '\r']);
    let text = text.rsplit('\r').next().unwrap_or("");
    let mut out = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&n) = chars.peek() {
                    chars.next();
                    if ('@'..='~').contains(&n) {
                        break;
                    }
                }
            }
            continue;
        }
        if c.is_control() && c != '\t' {
            continue;
        }
        out.push(c);
    }
    out
}

/// Repassa cada linha de stdout/stderr para o console; `on_line` vê a linha antes (ex.: detectar "Done").
fn pipe_to_console(
    app: &AppHandle,
    id: &str,
    pipe: Box<dyn tokio::io::AsyncRead + Unpin + Send>,
    on_line: impl Fn(&AppHandle, &str, &str) + Send + 'static,
) -> tokio::task::JoinHandle<()> {
    let app = app.clone();
    let id = id.to_string();
    tokio::spawn(async move {
        let mut reader = BufReader::new(pipe);
        let mut buf = Vec::with_capacity(512);
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = clean_line(&buf);
                    if line.trim().is_empty() {
                        continue;
                    }
                    on_line(&app, &id, &line);
                    let _ = app.emit("server://log", ServerLog { id: id.clone(), line });
                }
            }
        }
    })
}

#[tauri::command]
pub async fn server_install(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    url: String,
    sha1: Option<String>,
    sha256: Option<String>,
    installer: Option<bool>,
    native: Option<bool>,
    minecraft_version: Option<String>,
) -> Result<(), String> {
    let dir = paths::server(&app, &server_id)?;
    let jar = dir.join("server.jar");
    let _ = std::fs::remove_file(&jar);
    if native.unwrap_or(false) {
        return install_native(&app, &state, &server_id, &dir, url, sha256).await;
    }
    let _ = std::fs::remove_file(dir.join(NATIVE_BIN));
    if installer.unwrap_or(false) {
        let mc = minecraft_version.ok_or("Versão do Minecraft obrigatória para o instalador")?;
        return run_installer(&app, &state, &server_id, &dir, url, &mc).await;
    }
    download::emit(&app, &server_id, "server", 0, 1, "Baixando o motor do servidor");
    download::fetch(&state.http, &Job { url, path: jar, sha1, sha256, size: None }).await?;
    download::emit(&app, &server_id, "server", 1, 1, "Motor instalado");
    Ok(())
}

/// Executável do servidor nativo (Pumpkin) dentro da pasta do servidor.
const NATIVE_BIN: &str = if cfg!(windows) { "pumpkin.exe" } else { "pumpkin" };
/// No APK o Pumpkin vai junto em `jniLibs` com nome de biblioteca (como o `libjava_exec.so`): a pasta
/// de bibliotecas nativas é o único lugar de onde o Android deixa um app executar um programa.
const ANDROID_BUNDLED_BIN: &str = "libpumpkin.so";
/// Carregador do próprio Android: executa um programa que está na pasta de dados do app
/// (onde o `exec` direto é proibido desde o Android 10). Usado só quando o Pumpkin foi baixado.
const ANDROID_LINKER: &str = "/system/bin/linker64";

/// Pumpkin que veio dentro do APK, se este build o incluiu.
fn bundled_native(app: &AppHandle) -> Option<std::path::PathBuf> {
    if !cfg!(target_os = "android") {
        return None;
    }
    let bin = java::android_native_lib_dir(app).ok()?.join(ANDROID_BUNDLED_BIN);
    bin.is_file().then_some(bin)
}

/// Programa do servidor nativo: o do APK (Android) ou o baixado para a pasta do servidor.
pub fn native_binary(app: &AppHandle, dir: &std::path::Path) -> Option<std::path::PathBuf> {
    bundled_native(app).or_else(|| {
        let bin = dir.join(NATIVE_BIN);
        bin.is_file().then_some(bin)
    })
}

/// Comando que inicia o servidor nativo. No Android, um executável baixado passa pelo carregador do sistema.
fn native_command(app: &AppHandle, bin: &std::path::Path) -> tokio::process::Command {
    if cfg!(target_os = "android") && bundled_native(app).as_deref() != Some(bin) {
        let mut cmd = tokio::process::Command::new(ANDROID_LINKER);
        cmd.arg(bin);
        return cmd;
    }
    tokio::process::Command::new(bin)
}

/// O Pumpkin já vem no app (APK com `libpumpkin.so`)? Aí a instalação não baixa nada.
#[tauri::command]
pub fn server_native_bundled(app: AppHandle) -> bool {
    bundled_native(&app).is_some()
}

/// Pumpkin: um executável único publicado no GitHub (conferido pelo SHA-256 do release), sem Java.
async fn install_native(
    app: &AppHandle,
    state: &AppState,
    id: &str,
    dir: &std::path::Path,
    url: String,
    sha256: Option<String>,
) -> Result<(), String> {
    if bundled_native(app).is_some() {
        download::emit(app, id, "server", 1, 1, "Motor instalado (incluso no app)");
        return Ok(());
    }
    if cfg!(target_os = "android") && !std::path::Path::new(ANDROID_LINKER).exists() {
        return Err("Este aparelho não é 64 bits: o servidor em Rust (Pumpkin) precisa de Android arm64.".into());
    }
    if url.trim().is_empty() {
        return Err("Sem link para baixar o Pumpkin. Verifique a internet e tente de novo.".into());
    }
    let bin = dir.join(NATIVE_BIN);
    download::emit(app, id, "server", 0, 1, "Baixando o servidor Pumpkin (cerca de 130 MB)");
    // Sem hash conhecido (URL manual) o arquivo antigo passaria por válido: baixa de novo.
    if sha256.is_none() {
        let _ = std::fs::remove_file(&bin);
    }
    download::fetch(&state.http, &Job { url, path: bin.clone(), sha1: None, sha256, size: None }).await?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).map_err(|e| e.to_string())?;
    }
    download::emit(app, id, "server", 1, 1, "Motor instalado");
    Ok(())
}

/// Forge/NeoForge: baixa o instalador e roda `--installServer` (bibliotecas + patches do servidor).
async fn run_installer(
    app: &AppHandle,
    state: &AppState,
    id: &str,
    dir: &std::path::Path,
    url: String,
    mc: &str,
) -> Result<(), String> {
    let installer = dir.join("installer.jar");
    download::emit(app, id, "server", 0, 3, "Baixando o instalador");
    download::fetch(&state.http, &Job { url, path: installer.clone(), sha1: None, sha256: None, size: None }).await?;

    download::emit(app, id, "java", 1, 3, "Preparando o Java");
    console(app, id, format!("Preparando o Java para o Minecraft {mc}…"));
    let shared = paths::shared(app)?;
    let component = game::java_component_for(&state.http, &shared, mc).await?;
    let java = java::resolve(app, &state.http, id, None, &component, true)
        .await
        .inspect_err(|e| console(app, id, format!("Erro: {e}")))?;
    console(app, id, "Rodando o instalador do servidor…");

    download::emit(app, id, "server", 2, 3, "Instalando o servidor (pode levar alguns minutos)");
    let mut cmd = tokio::process::Command::new(&java);
    java::configure_command(&mut cmd, app, &component);
    cmd.arg("-jar")
        .arg("installer.jar")
        .arg("--installServer")
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    game::hide_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| format!("Falha ao abrir o instalador: {e}"))?;
    let mut tasks = Vec::new();
    for pipe in [
        child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
        child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
    ]
    .into_iter()
    .flatten()
    {
        tasks.push(pipe_to_console(app, id, pipe, |_, _, _| {}));
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    for t in tasks {
        let _ = t.await;
    }
    if !status.success() {
        return Err(format!("O instalador terminou com erro ({status}). Veja o console."));
    }
    let _ = std::fs::remove_file(&installer);
    let _ = std::fs::remove_file(dir.join("installer.jar.log"));
    if launch_target(dir).is_none() {
        return Err("Instalação concluída, mas o servidor não foi encontrado na pasta.".into());
    }
    download::emit(app, id, "server", 3, 3, "Motor instalado");
    Ok(())
}

/// Como iniciar o servidor desta pasta: `-jar server.jar`, o @argfile do Forge/NeoForge moderno
/// ou o `forge-*.jar` dos instaladores antigos (1.16 e anteriores).
pub fn launch_target(dir: &std::path::Path) -> Option<Vec<String>> {
    if dir.join("server.jar").is_file() {
        return Some(vec!["-jar".into(), "server.jar".into()]);
    }
    let args_name = if cfg!(target_os = "windows") { "win_args.txt" } else { "unix_args.txt" };
    for group in ["net/neoforged/neoforge", "net/neoforged/forge", "net/minecraftforge/forge"] {
        let Ok(entries) = std::fs::read_dir(dir.join("libraries").join(group)) else { continue };
        let mut versions: Vec<_> = entries.flatten().map(|e| e.path()).filter(|p| p.join(args_name).is_file()).collect();
        versions.sort();
        if let Some(v) = versions.pop() {
            let rel = v.join(args_name);
            let rel = rel.strip_prefix(dir).unwrap_or(&rel).to_string_lossy().replace('\\', "/");
            return Some(vec![format!("@{rel}")]);
        }
    }
    let legacy = std::fs::read_dir(dir).ok()?.flatten().map(|e| e.file_name().to_string_lossy().to_string()).find(|n| {
        n.ends_with(".jar") && (n.starts_with("forge-") || n.starts_with("minecraftforge-")) && !n.contains("installer")
    })?;
    Some(vec!["-jar".into(), legacy])
}

#[tauri::command]
pub fn server_installed(app: AppHandle, server_id: String) -> Result<bool, String> {
    let dir = paths::server(&app, &server_id)?;
    Ok(launch_target(&dir).is_some() || native_binary(&app, &dir).is_some())
}

#[tauri::command]
pub fn server_set_eula(app: AppHandle, server_id: String, accepted: bool) -> Result<(), String> {
    let dir = paths::server(&app, &server_id)?;
    let body = format!(
        "# Aceito pelo TropicaliaLauncher - https://aka.ms/MinecraftEULA\neula={}\n",
        if accepted { "true" } else { "false" }
    );
    std::fs::write(dir.join("eula.txt"), body).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn server_read_properties(app: AppHandle, server_id: String) -> Result<BTreeMap<String, String>, String> {
    let path = paths::server(&app, &server_id)?.join("server.properties");
    let text = std::fs::read_to_string(path).unwrap_or_default();
    Ok(parse_properties(&text))
}

/// Atualiza só as chaves enviadas, preservando comentários e a ordem do arquivo.
#[tauri::command]
pub fn server_write_properties(app: AppHandle, server_id: String, values: BTreeMap<String, String>) -> Result<(), String> {
    let path = paths::server(&app, &server_id)?.join("server.properties");
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    std::fs::write(&path, update_properties(&text, &values)).map_err(|e| e.to_string())
}

pub fn parse_properties(text: &str) -> BTreeMap<String, String> {
    text.lines()
        .filter(|l| !l.trim_start().starts_with('#') && !l.trim_start().starts_with('!'))
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (unescape(k.trim()), unescape(v.trim())))
        .collect()
}

/// Java `.properties` escapes: `\uXXXX` (with surrogate pairs), `\n`, `\t`, `\:`, `\=` and `\\`.
fn unescape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars();
    let mut high: Option<u16> = None;
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('r') => out.push('\r'),
            Some('f') => out.push('\u{c}'),
            Some('u') => {
                let hex: String = chars.by_ref().take(4).collect();
                match u16::from_str_radix(&hex, 16) {
                    Ok(unit) if (0xD800..0xDC00).contains(&unit) => high = Some(unit),
                    Ok(unit) => {
                        let units: Vec<u16> = high.take().into_iter().chain(std::iter::once(unit)).collect();
                        out.push_str(&String::from_utf16_lossy(&units));
                    }
                    Err(_) => {
                        out.push('u');
                        out.push_str(&hex);
                    }
                }
            }
            Some(other) => out.push(other),
            None => {}
        }
    }
    out
}

/// Non-ASCII is written as `\uXXXX`: every server version (hybrids on old bases read the file as
/// ISO-8859-1) then shows `§` colours and accents in the MOTD correctly.
fn escape_value(v: &str) -> String {
    let mut out = String::with_capacity(v.len());
    for c in v.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            // The MOTD's second line: Minecraft reads `\n` as a line break.
            '\n' => out.push_str("\\n"),
            '\r' => {}
            c if (c as u32) < 0x20 || (c as u32) > 0x7e => {
                let mut buf = [0u16; 2];
                for unit in c.encode_utf16(&mut buf) {
                    out.push_str(&format!("\\u{:04X}", unit));
                }
            }
            c => out.push(c),
        }
    }
    out
}

/// Vanilla's player lists, editable from the launcher.
const PLAYER_LISTS: [&str; 4] = ["whitelist.json", "ops.json", "banned-players.json", "banned-ips.json"];

fn player_list_path(app: &AppHandle, server_id: &str, file: &str) -> Result<std::path::PathBuf, String> {
    if !PLAYER_LISTS.contains(&file) {
        return Err(format!("Lista desconhecida: {file}"));
    }
    Ok(paths::server(app, server_id)?.join(file))
}

/// Reads whitelist/ops/bans; a missing or broken file is an empty list.
#[tauri::command]
pub fn server_read_list(app: AppHandle, server_id: String, file: String) -> Result<Vec<serde_json::Value>, String> {
    let path = player_list_path(&app, &server_id, &file)?;
    let text = std::fs::read_to_string(path).unwrap_or_default();
    Ok(serde_json::from_str::<Vec<serde_json::Value>>(&text).unwrap_or_default())
}

#[tauri::command]
pub fn server_write_list(app: AppHandle, server_id: String, file: String, entries: Vec<serde_json::Value>) -> Result<(), String> {
    let path = player_list_path(&app, &server_id, &file)?;
    let body = serde_json::to_string_pretty(&entries).map_err(|e| e.to_string())?;
    std::fs::write(path, body + "\n").map_err(|e| e.to_string())
}

/// `server-icon.png` (64×64; the frontend resizes it). `None` when there is no icon.
#[tauri::command]
pub fn server_read_icon(app: AppHandle, server_id: String) -> Result<Option<Vec<u8>>, String> {
    let path = paths::server(&app, &server_id)?.join("server-icon.png");
    Ok(std::fs::read(path).ok())
}

#[tauri::command]
pub fn server_write_icon(app: AppHandle, server_id: String, png: Vec<u8>) -> Result<(), String> {
    if png.len() > 512 * 1024 || !png.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Err("O ícone precisa ser um PNG pequeno (64×64).".into());
    }
    std::fs::write(paths::server(&app, &server_id)?.join("server-icon.png"), png).map_err(|e| e.to_string())
}

pub fn update_properties(text: &str, values: &BTreeMap<String, String>) -> String {
    let mut done = std::collections::HashSet::new();
    let mut out: Vec<String> = text
        .lines()
        .map(|line| {
            if line.trim_start().starts_with('#') {
                return line.to_string();
            }
            if let Some((k, _)) = line.split_once('=') {
                let key = k.trim();
                if let Some(v) = values.get(key) {
                    done.insert(key.to_string());
                    return format!("{key}={}", escape_value(v));
                }
            }
            line.to_string()
        })
        .collect();
    for (k, v) in values {
        if !done.contains(k) {
            out.push(format!("{k}={}", escape_value(v)));
        }
    }
    let mut s = out.join("\n");
    s.push('\n');
    s
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRequest {
    pub server_id: String,
    pub name: String,
    pub minecraft_version: String,
    pub memory_mb: u32,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub jvm_args: Vec<String>,
    /// Servidor nativo (Pumpkin): roda o executável direto, sem Java.
    #[serde(default)]
    pub native: bool,
}

#[tauri::command]
pub async fn server_start(app: AppHandle, state: State<'_, AppState>, req: StartRequest) -> Result<(), String> {
    let id = req.server_id.clone();
    if state.servers.lock().await.contains_key(&id) {
        return Err("Servidor já está rodando".into());
    }
    let dir = paths::server(&app, &id)?;
    let fail = |e: &String| {
        console(&app, &id, format!("Erro: {e}"));
        emit_status(&app, &id, "stopped", None);
    };

    let (mut cmd, started_msg, ready): (tokio::process::Command, String, fn(&str) -> bool) = if req.native {
        let Some(bin) = native_binary(&app, &dir) else {
            return Err("Instale o motor do servidor antes de iniciar".into());
        };
        emit_status(&app, &id, "starting", None);
        let mut cmd = native_command(&app, &bin);
        // Console simples (sem cores/TTY): as linhas chegam limpas no console do launcher.
        cmd.env("NO_COLOR", "1");
        if cfg!(target_os = "android") {
            // Sem /tmp nem HOME graváveis no Android; os certificados do sistema ficam nesta pasta
            // (login de contas originais no online mode).
            let tmp = dir.join(".tmp");
            let _ = std::fs::create_dir_all(&tmp);
            cmd.env("TMPDIR", &tmp)
                .env("HOME", &dir)
                .env("SSL_CERT_DIR", "/system/etc/security/cacerts");
        }
        (cmd, "Iniciando o servidor Pumpkin (Rust)…".to_string(), |line| line.contains("Started server; took"))
    } else {
        let Some(target) = launch_target(&dir) else {
            return Err("Instale o motor do servidor antes de iniciar".into());
        };
        emit_status(&app, &id, "starting", None);
        console(&app, &id, format!("Preparando o Java para o Minecraft {}…", req.minecraft_version));
        let shared = paths::shared(&app)?;
        let component = game::java_component_for(&state.http, &shared, &req.minecraft_version)
            .await
            .inspect_err(fail)?;
        let java = java::resolve(&app, &state.http, &id, req.java_path.as_deref(), &component, true)
            .await
            .inspect_err(fail)?;

        let mem = req.memory_mb.max(512);
        let mut cmd = tokio::process::Command::new(&java);
        java::configure_command(&mut cmd, &app, &component);
        cmd.arg(format!("-Xms{}M", (mem / 2).max(512)))
            .arg(format!("-Xmx{mem}M"));
        // O Java do Pojav se identifica como "25.0.x-internal" e o Paper recusa builds que não são GA;
        // essa propriedade (do próprio Paper) pula só essa checagem de versão.
        // No Android não existe /tmp gravável: o JNA (usado pelo Paper) e o Java usam esta pasta.
        if cfg!(target_os = "android") {
            let tmp = dir.join(".tmp");
            let _ = std::fs::create_dir_all(&tmp);
            cmd.arg("-DPaper.IgnoreJavaVersion=true")
                .arg(format!("-Djava.io.tmpdir={}", tmp.display()))
                .arg(format!("-Djna.tmpdir={}", tmp.display()));
        }
        cmd.args(req.jvm_args.iter().filter(|a| !a.trim().is_empty()))
            .args(&target)
            .arg("nogui");
        (cmd, format!("Iniciando o servidor com {mem} MB de RAM…"), |line| {
            line.contains("Done (") && line.contains(")! For help")
        })
    };

    cmd.current_dir(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    game::hide_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| {
        let msg = format!("Falha ao iniciar o servidor: {e}");
        fail(&msg);
        msg
    })?;
    console(&app, &id, started_msg);

    let stdin = child.stdin.take().ok_or("sem stdin")?;
    for pipe in [
        child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
        child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
    ]
    .into_iter()
    .flatten()
    {
        pipe_to_console(&app, &id, pipe, move |app, id, line| {
            if ready(line) {
                emit_status(app, id, "running", None);
                let app = app.clone();
                tokio::spawn(async move { crate::tray::refresh(&app).await });
            }
        });
    }

    state.servers.lock().await.insert(id.clone(), RunningServer { stdin, pid: child.id(), name: req.name.clone() });
    crate::tray::refresh(&app).await;

    let app2 = app.clone();
    tokio::spawn(async move {
        let code = child.wait().await.ok().and_then(|s| s.code());
        app2.state::<AppState>().servers.lock().await.remove(&id);
        let status = if code == Some(0) { "stopped" } else { "crashed" };
        // dá tempo de as últimas linhas do processo chegarem antes do aviso de encerramento
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        match code {
            Some(0) => console(&app2, &id, "Servidor encerrado."),
            Some(c) => console(&app2, &id, format!("O servidor parou com erro (código {c}).")),
            None => console(&app2, &id, "O servidor foi encerrado pelo sistema (pouca memória?)."),
        }
        emit_status(&app2, &id, status, code);
        crate::tray::refresh(&app2).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn server_command(state: State<'_, AppState>, server_id: String, command: String) -> Result<(), String> {
    let mut servers = state.servers.lock().await;
    let srv = servers.get_mut(&server_id).ok_or("Servidor não está rodando")?;
    let cmd = command.trim_start_matches('/');
    srv.stdin.write_all(format!("{cmd}\n").as_bytes()).await.map_err(|e| e.to_string())?;
    srv.stdin.flush().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn server_stop(app: AppHandle, state: State<'_, AppState>, server_id: String) -> Result<(), String> {
    stop(&app, &state, &server_id).await
}

pub async fn stop(app: &AppHandle, state: &AppState, server_id: &str) -> Result<(), String> {
    let pid = {
        let mut servers = state.servers.lock().await;
        let srv = servers.get_mut(server_id).ok_or("Servidor não está rodando")?;
        emit_status(app, server_id, "stopping", None);
        let _ = srv.stdin.write_all(b"stop\n").await;
        let _ = srv.stdin.flush().await;
        srv.pid
    };
    // Se não parar em 30s, encerra o processo.
    let app2 = app.clone();
    let id = server_id.to_string();
    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(30)).await;
        let still = app2.state::<AppState>().servers.lock().await.contains_key(&id);
        if still {
            if let Some(pid) = pid {
                let mut sys = sysinfo::System::new();
                let p = sysinfo::Pid::from_u32(pid);
                sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[p]), true);
                if let Some(proc_) = sys.process(p) {
                    proc_.kill();
                }
            }
        }
    });
    Ok(())
}

#[tauri::command]
pub async fn server_running(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    Ok(state.servers.lock().await.keys().cloned().collect())
}

#[tauri::command]
pub fn server_delete(app: AppHandle, server_id: String) -> Result<(), String> {
    std::fs::remove_dir_all(paths::server(&app, &server_id)?).map_err(|e| e.to_string())
}

/// Arquivos TOML de configuração editáveis pelo launcher (hoje só o do Pumpkin).
const TOML_FILES: [&str; 1] = ["pumpkin.toml"];

fn toml_path(app: &AppHandle, server_id: &str, file: &str) -> Result<std::path::PathBuf, String> {
    if !TOML_FILES.contains(&file) {
        return Err(format!("Arquivo de configuração desconhecido: {file}"));
    }
    Ok(paths::server(app, server_id)?.join(file))
}

/// Lê chaves por caminho pontilhado (`networking.java.motd`). Chaves ausentes ficam fora do mapa.
pub fn toml_get(text: &str, keys: &[String]) -> BTreeMap<String, serde_json::Value> {
    let Ok(doc) = text.parse::<toml_edit::DocumentMut>() else { return BTreeMap::new() };
    let mut out = BTreeMap::new();
    for key in keys {
        let mut item: Option<&toml_edit::Item> = Some(doc.as_item());
        for part in key.split('.') {
            item = item.and_then(|i| i.get(part));
        }
        let value = match item.and_then(toml_edit::Item::as_value) {
            Some(toml_edit::Value::String(v)) => serde_json::Value::from(v.value().as_str()),
            Some(toml_edit::Value::Integer(v)) => serde_json::Value::from(*v.value()),
            Some(toml_edit::Value::Float(v)) => serde_json::Value::from(*v.value()),
            Some(toml_edit::Value::Boolean(v)) => serde_json::Value::from(*v.value()),
            _ => continue,
        };
        out.insert(key.clone(), value);
    }
    out
}

/// Grava só as chaves enviadas, criando as tabelas que faltarem e preservando o resto do arquivo.
pub fn toml_set(text: &str, values: &BTreeMap<String, serde_json::Value>) -> Result<String, String> {
    let mut doc = text.parse::<toml_edit::DocumentMut>().map_err(|e| format!("TOML inválido: {e}"))?;
    for (key, value) in values {
        let parts: Vec<&str> = key.split('.').collect();
        let (last, tables) = parts.split_last().ok_or("chave vazia")?;
        let mut table = doc.as_table_mut();
        for part in tables {
            let entry = table.entry(part).or_insert_with(|| {
                let mut t = toml_edit::Table::new();
                t.set_implicit(true);
                toml_edit::Item::Table(t)
            });
            table = entry.as_table_mut().ok_or_else(|| format!("{key}: {part} não é uma tabela"))?;
        }
        let new = match value {
            serde_json::Value::String(v) => toml_edit::value(v.as_str()),
            serde_json::Value::Bool(v) => toml_edit::value(*v),
            serde_json::Value::Number(n) if n.is_i64() => toml_edit::value(n.as_i64().unwrap()),
            serde_json::Value::Number(n) => toml_edit::value(n.as_f64().unwrap_or(0.0)),
            other => return Err(format!("{key}: valor não suportado ({other})")),
        };
        table.insert(last, new);
    }
    Ok(doc.to_string())
}

#[tauri::command]
pub fn server_toml_read(app: AppHandle, server_id: String, file: String, keys: Vec<String>) -> Result<BTreeMap<String, serde_json::Value>, String> {
    let text = std::fs::read_to_string(toml_path(&app, &server_id, &file)?).unwrap_or_default();
    Ok(toml_get(&text, &keys))
}

#[tauri::command]
pub fn server_toml_write(app: AppHandle, server_id: String, file: String, values: BTreeMap<String, serde_json::Value>) -> Result<(), String> {
    let path = toml_path(&app, &server_id, &file)?;
    let text = std::fs::read_to_string(&path).unwrap_or_default();
    std::fs::write(&path, toml_set(&text, &values)?).map_err(|e| e.to_string())
}

/// IPs locais para mostrar "Conecte em 192.168.x.x:25565" para quem está na mesma rede.
#[tauri::command]
pub fn local_ips() -> Vec<String> {
    let mut out = Vec::new();
    // Truque sem dependências: um socket UDP "conectado" revela o IP de saída da LAN.
    if let Ok(sock) = std::net::UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                out.push(addr.ip().to_string());
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_line_handles_invalid_utf8_ansi_and_cr() {
        assert_eq!(clean_line(b"\x1b[32m[12:00:00 INFO]: Done (3.1s)! For help\x1b[0m\r\n"), "[12:00:00 INFO]: Done (3.1s)! For help");
        assert_eq!(clean_line(b"caf\xe9 ok\n"), "caf\u{fffd} ok");
        assert_eq!(clean_line(b"10%\r50%\r100%\n"), "100%");
    }

    #[test]
    fn properties_roundtrip() {
        let text = "#Minecraft server properties\nmotd=A Minecraft Server\nserver-port=25565\n";
        let mut v = BTreeMap::new();
        v.insert("motd".to_string(), "§aTropicalia".to_string());
        v.insert("pvp".to_string(), "false".to_string());
        let out = update_properties(text, &v);
        assert!(out.starts_with("#Minecraft server properties\nmotd=\\u00A7aTropicalia\nserver-port=25565\n"));
        assert!(out.contains("pvp=false"));
        let parsed = parse_properties(&out);
        assert_eq!(parsed["server-port"], "25565");
        assert_eq!(parsed["motd"], "§aTropicalia");
    }

    #[test]
    fn properties_read_raw_utf8_and_escapes() {
        let parsed = parse_properties("motd=§aOlá\\u0021\nlevel-seed=a\\:b\\=c\nicon=\\uD83C\\uDF34\n");
        assert_eq!(parsed["motd"], "§aOlá!");
        assert_eq!(parsed["level-seed"], "a:b=c");
        assert_eq!(parsed["icon"], "🌴");

        let mut v = BTreeMap::new();
        v.insert("motd".to_string(), "Linha 1\nLinha 2".to_string());
        let out = update_properties("", &v);
        assert!(out.contains("motd=Linha 1\\nLinha 2\n"));
        assert_eq!(parse_properties(&out)["motd"], "Linha 1\nLinha 2");
    }

    #[test]
    fn toml_reads_and_writes_dotted_keys_preserving_the_rest() {
        let text = "# cfg\nseed = \"1\"\n\n[networking.java]\nmotd = \"old\" # keep\nmax_players = 1000\n";
        let mut v = BTreeMap::new();
        v.insert("networking.java.motd".to_string(), serde_json::json!("Tropicalia"));
        v.insert("networking.java.online_mode".to_string(), serde_json::json!(false));
        v.insert("networking.bedrock.enabled".to_string(), serde_json::json!(false));
        v.insert("white_list".to_string(), serde_json::json!(true));
        let out = toml_set(text, &v).unwrap();
        assert!(out.starts_with("# cfg\nseed = \"1\"\n"));
        assert!(out.contains("max_players = 1000"));
        let keys: Vec<String> = ["networking.java.motd", "networking.java.online_mode", "networking.bedrock.enabled", "white_list", "networking.java.max_players", "missing.key"]
            .iter().map(|k| k.to_string()).collect();
        let got = toml_get(&out, &keys);
        assert_eq!(got["networking.java.motd"], "Tropicalia");
        assert_eq!(got["networking.java.online_mode"], false);
        assert_eq!(got["networking.bedrock.enabled"], false);
        assert_eq!(got["white_list"], true);
        assert_eq!(got["networking.java.max_players"], 1000);
        assert!(!got.contains_key("missing.key"));
        // arquivo ainda inexistente: cria só o que foi pedido
        let fresh = toml_set("", &v).unwrap();
        assert_eq!(toml_get(&fresh, &keys)["networking.java.motd"], "Tropicalia");
    }
}
