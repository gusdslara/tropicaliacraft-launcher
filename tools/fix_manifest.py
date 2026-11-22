with open(r'tropicalia-launcher\src-tauri\gen\android\app\src\main\AndroidManifest.xml', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('android:extractNativeLibs="true"', '')
with open(r'tropicalia-launcher\src-tauri\gen\android\app\src\main\AndroidManifest.xml', 'w', encoding='utf-8') as f:
    f.write(text)
print("Removed extractNativeLibs successfully!")
