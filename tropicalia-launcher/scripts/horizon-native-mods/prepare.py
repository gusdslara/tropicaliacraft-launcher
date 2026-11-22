"""Monta o código do Horizon com os mods nativos (.hnmod) do registro aplicados, pronto para compilar.

    python scripts/horizon-native-mods/prepare.py --work <pasta de trabalho> [--horizon ../tools/horizon-android]

Passos (os mesmos do launcher oficial do Horizon, docs/native-mods.md):
  1. baixa os .hnmod do índice do registro e fica com os que usam só os pontos de gancho
     ("hooks" <= NATIVE_HOOKS_API do fork) e cujos alvos existem no fork;
  2. copia o fork (só código) para <work>/src, tira do pacote fixo do Android os 3 mods que agora vêm
     de verdade (zoom, minimap, recipes) e faz um commit local (o horizon-mixins confere a revisão);
  3. ajusta cada mod para esse commit, com os consertos para o fork (patch_mods abaixo);
  4. roda `horizon-mixins apply` em <work>/stage e marca todos os mods embutidos como opt-in.

Depois: compile <work>/stage (Android: --package horizon-android; Windows: -p horizon-client).
A lista final de ids precisa bater com BUILT_IN_NATIVE_MODS em src-tauri/src/content.rs.
Requer: git, Python 3.11+, o horizon-mixins (MIXINS_REV) e o toolchain GNU 1.95.0 no Windows.
"""
import argparse, io, json, os, re, shutil, subprocess, sys, tomllib, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
LAUNCHER = os.path.dirname(os.path.dirname(HERE))
INDEX = os.path.join(LAUNCHER, 'static', 'data', 'horizon-mods-index.json')
MIXINS_REV = 'a2af5c0dd4117d51ecd70066ba7a00b4a2c10dab'
# Fora mesmo usando só ganchos: dependem de partes do Horizon mais novo que o fork não tem
# (fullbright_nofog: o gancho native_render_fog; jade: o ajudante native_view_hit).
SKIP = {'fullbright_nofog', 'jade'}


def patch_mods(bundles):
    """Consertos de compatibilidade com o fork Android do Horizon."""
    # xtoxray recria MeshTables sem o campo que o fork acrescentou.
    p = os.path.join(bundles, 'xtoxray', 'filter.rs')
    s = io.open(p, encoding='utf-8').read()
    if 'animated_layers' not in s:
        s = s.replace('lava_flow: from.lava_flow,',
                      'lava_flow: from.lava_flow,\n                        animated_layers: from.animated_layers.clone(),')
        io.open(p, 'w', encoding='utf-8', newline='').write(s)


def hooks_api(horizon):
    text = io.open(os.path.join(horizon, 'crates/horizon-client/src/game/native_hooks.rs'), encoding='utf-8').read()
    return int(re.search(r'const NATIVE_HOOKS_API: u32 = (\d+);', text).group(1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--work', required=True)
    ap.add_argument('--horizon', default=os.path.join(LAUNCHER, '..', 'tools', 'horizon-android'))
    ap.add_argument('--mixins', default=None, help='horizon-mixins(.exe); padrão: <work>/tool/bin')
    a = ap.parse_args()
    work, horizon = os.path.abspath(a.work), os.path.abspath(a.horizon)
    os.makedirs(work, exist_ok=True)
    api = hooks_api(horizon)

    # 1. mods
    dl, bundles = os.path.join(work, 'dl'), os.path.join(work, 'bundles')
    shutil.rmtree(bundles, ignore_errors=True)
    os.makedirs(dl, exist_ok=True); os.makedirs(bundles)
    for p in json.load(io.open(INDEX, encoding='utf-8'))['projects']:
        if p.get('kind') != 'native-mod' or p['id'] in SKIP:
            continue
        f = os.path.join(dl, p['id'] + '.hnmod')
        if not os.path.isfile(f):
            urllib.request.urlretrieve(p['versions'][0]['file']['url'], f)
        z = zipfile.ZipFile(f)
        meta = json.loads(z.read('horizon-native.json'))
        if not meta.get('hooks') or meta['hooks'] > api:
            continue
        prefix = f"mixins/{p['id']}/"
        for n in z.namelist():
            if n.startswith(prefix) and not n.endswith('/'):
                out = os.path.normpath(os.path.join(bundles, p['id'], n[len(prefix):]))
                if not out.startswith(os.path.join(bundles, p['id'])):
                    sys.exit(f'caminho inválido em {f}: {n}')
                os.makedirs(os.path.dirname(out), exist_ok=True)
                open(out, 'wb').write(z.read(n))
    patch_mods(bundles)

    # 2. fonte do fork
    src = os.path.join(work, 'src')
    shutil.rmtree(src, ignore_errors=True)
    skip_dirs = {'target', 'target-gnu', '.local', '.git', 'bench', 'benchmarks'}
    shutil.copytree(horizon, src, ignore=lambda d, names: [n for n in names if d == horizon and n in skip_dirs])
    subprocess.check_call([sys.executable, '-I', os.path.join(HERE, 'patch_bundled.py'), src])
    git = ['git', '-C', src, '-c', 'user.name=build', '-c', 'user.email=build@localhost', '-c', 'commit.gpgsign=false']
    subprocess.check_call(['git', 'init', '-q', src])
    subprocess.check_call(git + ['add', '-A'])
    subprocess.check_call(git + ['commit', '-qm', 'tropicalia native build base'])
    rev = subprocess.check_output(['git', '-C', src, 'rev-parse', 'HEAD'], text=True).strip()

    # 3. fixa cada mod nesse commit (o que o launcher oficial chama de repin)
    for mid in os.listdir(bundles):
        p = os.path.join(bundles, mid, 'horizon-mixin.toml')
        t = io.open(p, encoding='utf-8').read()
        t = re.sub(r'(horizon_revision\s*=\s*")[0-9a-f]+(")', r'\g<1>' + rev + r'\2', t)
        io.open(p, 'w', encoding='utf-8', newline='').write(t)
        tomllib.loads(t)

    # 4. aplica e marca como opt-in
    tool = a.mixins or os.path.join(work, 'tool', 'bin', 'horizon-mixins' + ('.exe' if os.name == 'nt' else ''))
    if not os.path.isfile(tool):
        subprocess.check_call(['cargo', 'install', '--locked', '--git', 'https://github.com/horizon-rust/horizon-mixins',
                               '--rev', MIXINS_REV, '--root', os.path.join(work, 'tool'), 'horizon-mixins-cli'])
    stage = os.path.join(work, 'stage')
    shutil.rmtree(stage, ignore_errors=True)
    subprocess.check_call([tool, 'apply', '--workspace', src, '--mods', bundles, '--out', stage], cwd=src)
    subprocess.check_call([sys.executable, '-I', os.path.join(HERE, 'patch_modlist.py'), stage, bundles, INDEX])
    ids = sorted(set(os.listdir(bundles)) | {'smartf3'})
    print(json.dumps({'stage': stage, 'mods': ids}, indent=1))


if __name__ == '__main__':
    main()
