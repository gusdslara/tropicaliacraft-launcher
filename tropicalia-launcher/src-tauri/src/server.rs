//! Servidores locais: Paper, Purpur, Fabric e híbridos (Magma, Mohist, Arclight).
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

#[tauri::command]
pub async fn server_install(
    app: AppHandle,
    state: State<'_, AppState>,
    server_id: String,
    url: String,
    sha1: Option<String>,
) -> Result<(), String> {
    let dir = paths::server(&app, &server_id)?;
    let jar = dir.join("server.jar");
    let _ = std::fs::remove_file(&jar);
    download::emit(&app, &server_id, "server", 0, 1, "Baixando o motor do servidor");
    download::fetch(&state.http, &Job { url, path: jar, sha1, sha256: None, size: None }).await?;
    download::emit(&app, &server_id, "server", 1, 1, "Motor instalado");
    Ok(())
}

#[tauri::command]
pub fn server_installed(app: AppHandle, server_id: String) -> Result<bool, String> {
    Ok(paths::server(&app, &server_id)?.join("server.jar").is_file())
}

#[tauri::command]
pub fn server_set_eula(app: AppHandle, server_id: String, accepted: bool) -> Result<(), String> {
    let dir = paths::server(&app, &server_id)?;
    let body = format!(
        "# Aceito pelo Tropicalia Launcher - https://aka.ms/MinecraftEULA\neula={}\n",
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
        .filter(|l| !l.trim_start().starts_with('#'))
        .filter_map(|l| l.split_once('='))
        .map(|(k, v)| (k.trim().to_string(), v.trim().replace("\\:", ":").replace("\\=", "=")))
        .collect()
}

fn escape_value(v: &str) -> String {
    v.replace('\\', "\\\\").replace('\n', " ")
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
}

#[tauri::command]
pub async fn server_start(app: AppHandle, state: State<'_, AppState>, req: StartRequest) -> Result<(), String> {
    let id = req.server_id.clone();
    if state.servers.lock().await.contains_key(&id) {
        return Err("Servidor já está rodando".into());
    }
    let dir = paths::server(&app, &id)?;
    if !dir.join("server.jar").is_file() {
        return Err("Instale o motor do servidor antes de iniciar".into());
    }
    emit_status(&app, &id, "starting", None);

    let shared = paths::shared(&app)?;
    let component = game::java_component_for(&state.http, &shared, &req.minecraft_version)
        .await
        .inspect_err(|_| emit_status(&app, &id, "stopped", None))?;
    let java = java::resolve(&app, &state.http, &id, req.java_path.as_deref(), &component, true)
        .await
        .inspect_err(|_| emit_status(&app, &id, "stopped", None))?;

    let mem = req.memory_mb.max(512);
    let mut cmd = tokio::process::Command::new(&java);
    java::configure_command(&mut cmd, &app, &component);
    cmd.arg(format!("-Xms{}M", (mem / 2).max(512)))
        .arg(format!("-Xmx{mem}M"))
        .args(req.jvm_args.iter().filter(|a| !a.trim().is_empty()))
        .arg("-jar")
        .arg("server.jar")
        .arg("nogui")
        .current_dir(&dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    game::hide_console(&mut cmd);
    let mut child = cmd.spawn().map_err(|e| {
        emit_status(&app, &id, "stopped", None);
        format!("Falha ao iniciar o servidor: {e}")
    })?;

    let stdin = child.stdin.take().ok_or("sem stdin")?;
    for pipe in [
        child.stdout.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
        child.stderr.take().map(|s| Box::new(s) as Box<dyn tokio::io::AsyncRead + Unpin + Send>),
    ]
    .into_iter()
    .flatten()
    {
        let app2 = app.clone();
        let id2 = id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(pipe).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if line.contains("Done (") && line.contains(")! For help") {
                    emit_status(&app2, &id2, "running", None);
                    crate::tray::refresh(&app2).await;
                }
                let _ = app2.emit("server://log", ServerLog { id: id2.clone(), line });
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
    fn properties_roundtrip() {
        let text = "#Minecraft server properties\nmotd=A Minecraft Server\nserver-port=25565\n";
        let mut v = BTreeMap::new();
        v.insert("motd".to_string(), "§aTropicalia".to_string());
        v.insert("pvp".to_string(), "false".to_string());
        let out = update_properties(text, &v);
        assert!(out.starts_with("#Minecraft server properties\nmotd=§aTropicalia\nserver-port=25565\n"));
        assert!(out.contains("pvp=false"));
        let parsed = parse_properties(&out);
        assert_eq!(parsed["server-port"], "25565");
        assert_eq!(parsed["motd"], "§aTropicalia");
    }
}
