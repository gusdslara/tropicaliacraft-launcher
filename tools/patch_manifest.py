import sys

with open(r'tropicalia-launcher\src-tauri\gen\android\app\src\main\AndroidManifest.xml', 'r', encoding='utf-8') as f:
    text = f.read()

target = """    <uses-permission android:name="android.permission.INTERNET" />"""

perms = """    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />
    <uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.VIBRATE" />"""

if target in text:
    text = text.replace(target, perms)
    text = text.replace('<application', '<application\n        android:requestLegacyExternalStorage="true"\n        android:extractNativeLibs="true"')
    with open(r'tropicalia-launcher\src-tauri\gen\android\app\src\main\AndroidManifest.xml', 'w', encoding='utf-8') as f:
        f.write(text)
    print("Updated AndroidManifest.xml successfully!")
else:
    print("Target not found!")
