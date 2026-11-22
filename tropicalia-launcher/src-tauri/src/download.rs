//! Motor de download: verificação SHA-1, retomada (pula arquivos já válidos) e lotes paralelos.

use futures_util::StreamExt;
use serde::Serialize;
use sha1::{Digest, Sha1};
use sha2::Sha256;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

pub const USER_AGENT: &str = concat!(
    "TropicaliaLauncher/",
    env!("CARGO_PKG_VERSION"),
    " (+https://tropicaliacraft.com.br)"
);

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(std::time::Duration::from_secs(15))
        .build()
        .expect("reqwest client")
}

#[derive(Clone, Debug)]
pub struct Job {
    pub url: String,
    pub path: PathBuf,
    pub sha1: Option<String>,
    pub sha256: Option<String>,
    pub size: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// Quem pediu (id da instância/servidor) para o frontend saber qual barra atualizar.
    pub owner: String,
    pub stage: String,
    pub current: usize,
    pub total: usize,
    pub bytes: u64,
    pub message: String,
}

pub fn emit(app: &AppHandle, owner: &str, stage: &str, current: usize, total: usize, message: impl Into<String>) {
    let _ = app.emit(
        "launcher://progress",
        Progress {
            owner: owner.to_string(),
            stage: stage.to_string(),
            current,
            total,
            bytes: 0,
            message: message.into(),
        },
    );
}

pub fn sha1_file(path: &Path) -> Option<String> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut h = Sha1::new();
    std::io::copy(&mut f, &mut h).ok()?;
    Some(hex::encode(h.finalize()))
}

pub fn sha256_file(path: &Path) -> Option<String> {
    let mut f = std::fs::File::open(path).ok()?;
    let mut h = Sha256::new();
    std::io::copy(&mut f, &mut h).ok()?;
    Some(hex::encode(h.finalize()))
}

/// Já existe e é válido? (hash se tivermos, senão tamanho, senão só existência)
pub fn is_valid(job: &Job) -> bool {
    let Ok(meta) = std::fs::metadata(&job.path) else { return false };
    if !meta.is_file() {
        return false;
    }
    if let Some(sha) = &job.sha256 {
        return sha256_file(&job.path).is_some_and(|h| h.eq_ignore_ascii_case(sha));
    }
    if let Some(sha) = &job.sha1 {
        return sha1_file(&job.path).is_some_and(|h| h.eq_ignore_ascii_case(sha));
    }
    if let Some(size) = job.size {
        return meta.len() == size;
    }
    meta.len() > 0
}

/// Baixa um arquivo para `job.path` (via arquivo .part) e confere o SHA-1.
pub async fn fetch(client: &reqwest::Client, job: &Job) -> Result<u64, String> {
    if is_valid(job) {
        return Ok(0);
    }
    if let Some(parent) = job.path.parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    let mut last_err = String::new();
    for attempt in 0..3 {
        if attempt > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(600 * attempt)).await;
        }
        match fetch_once(client, job).await {
            Ok(n) => return Ok(n),
            Err(e) => last_err = e,
        }
    }
    Err(format!("Falha ao baixar {}: {last_err}", job.url))
}

async fn fetch_once(client: &reqwest::Client, job: &Job) -> Result<u64, String> {
    let resp = client.get(&job.url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let tmp = job.path.with_extension(format!(
        "{}part",
        job.path.extension().map(|e| format!("{}.", e.to_string_lossy())).unwrap_or_default()
    ));
    let mut file = tokio::fs::File::create(&tmp).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha1::new();
    let mut hasher256 = Sha256::new();
    let mut stream = resp.bytes_stream();
    let mut total = 0u64;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        hasher256.update(&chunk);
        total += chunk.len() as u64;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    if let Some(expected) = &job.sha256 {
        let got = hex::encode(hasher256.finalize());
        if !got.eq_ignore_ascii_case(expected) {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(format!("SHA-256 não confere (esperado {expected}, veio {got})"));
        }
    }
    if let Some(expected) = &job.sha1 {
        let got = hex::encode(hasher.finalize());
        if !got.eq_ignore_ascii_case(expected) {
            let _ = tokio::fs::remove_file(&tmp).await;
            return Err(format!("SHA-1 não confere (esperado {expected}, veio {got})"));
        }
    }
    tokio::fs::rename(&tmp, &job.path).await.map_err(|e| e.to_string())?;
    Ok(total)
}

/// Baixa vários arquivos em paralelo (até `parallel` simultâneos) emitindo progresso.
pub async fn fetch_all(
    app: &AppHandle,
    client: &reqwest::Client,
    owner: &str,
    stage: &str,
    jobs: Vec<Job>,
    parallel: usize,
) -> Result<(), String> {
    let pending: Vec<Job> = jobs.into_iter().filter(|j| !is_valid(j)).collect();
    let total = pending.len();
    if total == 0 {
        return Ok(());
    }
    let sem = Arc::new(Semaphore::new(parallel.max(1)));
    let done = Arc::new(AtomicUsize::new(0));
    let bytes = Arc::new(AtomicU64::new(0));
    let mut handles = Vec::with_capacity(total);
    for job in pending {
        let sem = sem.clone();
        let done = done.clone();
        let bytes = bytes.clone();
        let client = client.clone();
        let app = app.clone();
        let owner = owner.to_string();
        let stage = stage.to_string();
        handles.push(tokio::spawn(async move {
            let _permit = sem.acquire_owned().await.map_err(|e| e.to_string())?;
            let n = fetch(&client, &job).await?;
            let b = bytes.fetch_add(n, Ordering::Relaxed) + n;
            let d = done.fetch_add(1, Ordering::Relaxed) + 1;
            if d == total || d % 8 == 0 {
                let _ = app.emit(
                    "launcher://progress",
                    Progress {
                        owner,
                        stage,
                        current: d,
                        total,
                        bytes: b,
                        message: job.path.file_name().map(|f| f.to_string_lossy().to_string()).unwrap_or_default(),
                    },
                );
            }
            Ok::<(), String>(())
        }));
    }
    let mut first_err = None;
    for h in handles {
        match h.await {
            Ok(Ok(())) => {}
            Ok(Err(e)) => {
                first_err.get_or_insert(e);
            }
            Err(e) => {
                first_err.get_or_insert(e.to_string());
            }
        }
    }
    match first_err {
        Some(e) => Err(e),
        None => Ok(()),
    }
}

pub async fn get_json<T: serde::de::DeserializeOwned>(client: &reqwest::Client, url: &str) -> Result<T, String> {
    let resp = client.get(url).send().await.map_err(|e| format!("{url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("{url}: HTTP {}", resp.status()));
    }
    resp.json::<T>().await.map_err(|e| format!("{url}: {e}"))
}
