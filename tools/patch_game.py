import re

with open(r'tropicalia-launcher/src-tauri/src/game.rs', 'r', encoding='utf-8') as f:
    c = f.read()

target = """        if let Some(w) = app2.get_webview_window("main") {
            let _ = w.show();
            let _ = w.unminimize();
            let _ = w.set_focus();
        }"""

repl = """        if let Some(w) = app2.get_webview_window("main") {
            let _ = w.show();
            #[cfg(desktop)]
            let _ = w.unminimize();
            let _ = w.set_focus();
        }"""

if target in c:
    c = c.replace(target, repl)
    with open(r'tropicalia-launcher/src-tauri/src/game.rs', 'w', encoding='utf-8') as f:
        f.write(c)
    print("Replaced successfully!")
else:
    print("Target not found!")
