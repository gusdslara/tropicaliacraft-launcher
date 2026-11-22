import sys

with open(r'tropicalia-launcher\src-tauri\src\java.rs', 'r', encoding='utf-8') as f:
    text = f.read()

target = """pub fn platform_key() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("windows", "x86_64") => "windows-x64",
        ("windows", "aarch64") => "windows-arm64",
        ("windows", _) => "windows-x86",
        ("macos", "aarch64") => "mac-os-arm64",
        ("macos", _) => "mac-os",
        ("linux", "x86") => "linux-i386",
        _ => "linux",
    }
}"""

replacement = """pub fn platform_key() -> &'static str {
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
}"""

if target in text:
    text = text.replace(target, replacement)
    with open(r'tropicalia-launcher\src-tauri\src\java.rs', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Replaced platform_key successfully!")
else:
    print("Target not found!")
