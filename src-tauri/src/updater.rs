//! Auto-atualizador sem instalador externo do SO:
//! Baixa o binário/zip atualizado, substitui o executável atual e reinicia o launcher.

use sha1::{Digest, Sha1};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub target_version: String,
    pub download_url: String,
    pub sha1: Option<String>,
    pub binary_name: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub current: usize,
    pub total: usize,
    pub message: String,
}

/// Substitui o executável atual pelo novo arquivo de forma segura.
/// No Windows, renomeia o arquivo atual (que está em execução e travado para sobrescrita)
/// para .old_launcher, copia o novo para o caminho original e prepara a deleção.
/// No Linux/macOS, o unlink/rename substitui o inode em execução normalmente.
fn replace_current_exe(new_exe: &Path) -> Result<(), String> {
    let current_exe = env::current_exe().map_err(|e| format!("Falha ao obter executável atual: {e}"))?;
    
    #[cfg(target_os = "windows")]
    {
        let mut old_exe = current_exe.clone();
        old_exe.set_extension("old_launcher");
        if old_exe.exists() {
            let _ = fs::remove_file(&old_exe);
        }
        fs::rename(&current_exe, &old_exe)
            .map_err(|e| format!("Falha ao mover executável atual para backup: {e}"))?;
        
        if let Err(e) = fs::copy(new_exe, &current_exe) {
            // Em caso de falha, tenta restaurar
            let _ = fs::rename(&old_exe, &current_exe);
            return Err(format!("Falha ao posicionar novo executável: {e}"));
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(new_exe).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o755);
        let _ = fs::set_permissions(new_exe, perms);

        let backup = current_exe.with_extension("old_launcher");
        let _ = fs::rename(&current_exe, &backup);
        if let Err(e) = fs::rename(new_exe, &current_exe) {
            let _ = fs::rename(&backup, &current_exe);
            return Err(format!("Falha ao atualizar binário Linux/macOS: {e}"));
        }
    }

    Ok(())
}

/// Extrai zip e localiza o executável dentro
fn extract_zip_and_find_exe(zip_path: &Path, extract_to: &Path, expected_binary: Option<&str>) -> Result<PathBuf, String> {
    let file = fs::File::open(zip_path).map_err(|e| format!("Falha ao abrir zip: {e}"))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("Arquivo ZIP inválido: {e}"))?;

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("Erro no arquivo ZIP #{i}: {e}"))?;
        let outpath = match file.enclosed_name() {
            Some(path) => extract_to.join(path),
            None => continue,
        };

        if file.name().ends_with('/') {
            fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = outpath.parent() {
                if !p.exists() {
                    fs::create_dir_all(p).map_err(|e| e.to_string())?;
                }
            }
            let mut outfile = fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut file, &mut outfile).map_err(|e| e.to_string())?;
        }
    }

    if let Some(bin) = expected_binary {
        let direct = extract_to.join(bin);
        if direct.exists() {
            return Ok(direct);
        }
    }

    // Busca .exe dentro da pasta extraída
    for entry in walk_dir(extract_to)? {
        let ext = entry.extension().and_then(|e| e.to_str()).unwrap_or("");
        if ext.eq_ignore_ascii_case("exe") || entry.file_name().and_then(|n| n.to_str()).unwrap_or("").contains("launcher") {
            return Ok(entry);
        }
    }

    Err("Nenhum binário executável encontrado dentro do pacote de atualização.".into())
}

fn walk_dir(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if let Ok(mut sub) = walk_dir(&p) {
                    files.append(&mut sub);
                }
            } else {
                files.push(p);
            }
        }
    }
    Ok(files)
}

#[tauri::command]
pub async fn apply_launcher_update(app: AppHandle, info: UpdateInfo) -> Result<(), String> {
    use futures_util::StreamExt;
    use tokio::io::AsyncWriteExt;

    let temp_dir = env::temp_dir().join(format!("tp_update_{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    fs::create_dir_all(&temp_dir).map_err(|e| format!("Falha ao criar diretório temporário: {e}"))?;

    let is_zip = info.download_url.ends_with(".zip");
    let downloaded_file = temp_dir.join(if is_zip { "update.zip" } else { "update.bin" });

    // 1. Download do arquivo com progresso
    let client = crate::download::client();
    let res = client.get(&info.download_url).send().await.map_err(|e| format!("Falha na conexão: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Download falhou com status HTTP {}", res.status()));
    }

    let total_size = res.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(&downloaded_file).await.map_err(|e| e.to_string())?;
    let mut stream = res.bytes_stream();
    let mut downloaded: usize = 0;
    let mut hasher = Sha1::new();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Erro de transmissão: {e}"))?;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        hasher.update(&chunk);
        downloaded += chunk.len();

        let _ = app.emit(
            "launcher://update-progress",
            UpdateProgress {
                current: downloaded,
                total: total_size as usize,
                message: format!("Baixando atualização… ({:.1} MB)", downloaded as f64 / 1_048_576.0),
            },
        );
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);

    // 2. Verificação de integridade SHA-1 se fornecido
    if let Some(expected_sha1) = &info.sha1 {
        let expected = expected_sha1.trim().to_lowercase();
        if !expected.is_empty() {
            let actual = hex::encode(hasher.finalize());
            if actual != expected {
                return Err(format!("Hash SHA-1 divergente (esperado: {expected}, recebido: {actual})"));
            }
        }
    }

    // 3. Obtenção do novo executável
    let new_exe_path = if is_zip {
        let extract_path = temp_dir.join("extracted");
        fs::create_dir_all(&extract_path).map_err(|e| e.to_string())?;
        extract_zip_and_find_exe(&downloaded_file, &extract_path, info.binary_name.as_deref())?
    } else {
        downloaded_file
    };

    // 4. Substituição do executável atual
    let _ = app.emit(
        "launcher://update-progress",
        UpdateProgress {
            current: downloaded,
            total: downloaded,
            message: "Aplicando atualização e reiniciando o launcher…".into(),
        },
    );

    replace_current_exe(&new_exe_path)?;

    // 5. Reinicialização do processo
    let current_exe = env::current_exe().map_err(|e| e.to_string())?;
    
    #[cfg(target_os = "windows")]
    {
        // Spawna o novo executável desvinculado e encerra o atual
        let _ = std::process::Command::new(&current_exe).spawn();
        std::process::exit(0);
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new(&current_exe).spawn();
        std::process::exit(0);
    }
}
