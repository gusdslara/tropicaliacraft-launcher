import sys

with open(r'tropicalia-launcher\src-tauri\src\java.rs', 'r', encoding='utf-8') as f:
    text = f.read()

target = """    download::emit(app, owner, "java", 0, 1, format!("Buscando Java ({component})"));
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
        })?;"""

replacement = """    download::emit(app, owner, "java", 0, 1, format!("Buscando Java ({component})"));
    let index: HashMap<String, HashMap<String, Vec<RuntimeEntry>>> =
        download::get_json(client, RUNTIME_INDEX).await?;
    let mut entry_opt = index.get(platform_key()).and_then(|p| p.get(component)).and_then(|v| v.first());
    if entry_opt.is_none() && cfg!(target_os = "android") {
        // Fallback para x86_64/linux caso o dispositivo reporte arm ou plataforma não mapeada na Mojang
        entry_opt = index.get("linux").and_then(|p| p.get(component)).and_then(|v| v.first());
    }
    let entry = entry_opt.ok_or_else(|| {
        format!(
            "A Mojang não publica o Java '{component}' para {}. Defina um Java manual em Ajustes.",
            platform_key()
        )
    })?;"""

if target in text:
    text = text.replace(target, replacement)
    with open(r'tropicalia-launcher\src-tauri\src\java.rs', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Replaced java entry lookup successfully!")
else:
    print("Target not found!")
