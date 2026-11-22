"""Every native mod compiled into the Tropicalia engine is opt-in on every platform and listed in the
title menu's Mods page (before, only the 4 hand-ported Android modules were)."""
import io, json, os, re, sys

stage, bundles, index = sys.argv[1], sys.argv[2], sys.argv[3]
ids = sorted(os.listdir(bundles)) + ['smartf3']
projects = {p['id']: p for p in json.load(io.open(index, encoding='utf-8'))['projects']}


def rs(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


rows = []
for i in sorted(set(ids)):
    p = projects.get(i, {})
    name = p.get('name') or i
    summary = (p.get('summary') or '').strip().split('\n')[0][:140]
    rows.append(f'    ({rs(i)}, {rs(name)}, {rs(summary)}),')

p = os.path.join(stage, 'crates/horizon-client-render/src/mod_list.rs')
s = io.open(p, encoding='utf-8').read()
start = s.index('/// Fixed native modules compiled into Android APKs, all opt-in.')
end = s.index('];', start) + 2
s = s[:start] + (
    '/// Native mods compiled into the Tropicalia engine (Android and desktop), all opt-in: off until\n'
    '/// the player turns them on in the launcher or in Options > Mods.\n'
    f'pub const ANDROID_BUNDLED: [(&str, &str, &str); {len(rows)}] = [\n' + '\n'.join(rows) + '\n];'
) + s[end:]
old = '        #[cfg(target_os = "android")]\n        let disabled = {'
assert s.count(old) == 1
s = s.replace(old, '        let disabled = {')
old = 'installed: if cfg!(target_os = "android") {'
assert s.count(old) == 1
s = s.replace(old, 'installed: if true {')
io.open(p, 'w', encoding='utf-8', newline='').write(s)
print(len(rows), 'mods listed')
