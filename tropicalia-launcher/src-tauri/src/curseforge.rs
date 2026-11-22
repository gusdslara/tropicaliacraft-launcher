use serde_json::Value;
use std::collections::HashMap;

/// API key stays in the native request header; destinations and endpoints are fixed.
#[tauri::command]
pub async fn curseforge_get(api_key: String, path: String, query: HashMap<String, String>) -> Result<Value, String> {
    let parts: Vec<_> = path.split('/').collect();
    let numeric = |s: &str| !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit());
    let allowed = path == "/mods/search"
        || (parts.len() == 3 && parts[1] == "mods" && numeric(parts[2]))
        || (parts.len() == 4 && parts[1] == "mods" && numeric(parts[2]) && parts[3] == "files")
        || (parts.len() == 5 && parts[1] == "mods" && numeric(parts[2]) && parts[3] == "files" && numeric(parts[4]));
    if !path.starts_with('/') || !allowed { return Err("Endpoint CurseForge inválido".into()); }
    if api_key.trim().is_empty() { return Err("Configure a chave CurseForge em Ajustes.".into()); }
    let allowed_query = ["gameId", "classId", "searchFilter", "gameVersion", "modLoaderType", "modLoaderTypes", "sortField", "sortOrder", "index", "pageSize"];
    if query.keys().any(|key| !allowed_query.contains(&key.as_str())) { return Err("Filtro CurseForge inválido".into()); }
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(30)).user_agent(crate::download::USER_AGENT).build().map_err(|e| e.to_string())?;
    let response = client.get(format!("https://api.curseforge.com/v1{path}"))
        .query(&query).header("x-api-key", api_key.trim()).send().await.map_err(|e| e.to_string())?;
    match response.status().as_u16() {
        401 | 403 => return Err("Chave CurseForge inválida ou sem acesso. Confira Ajustes.".into()),
        429 => return Err("Limite CurseForge atingido. Aguarde e tente novamente.".into()),
        _ => {}
    }
    response.error_for_status().map_err(|e| e.to_string())?.json().await.map_err(|e| e.to_string())
}
