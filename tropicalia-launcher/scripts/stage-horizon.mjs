#!/usr/bin/env node
// Coloca o motor Horizon Rust do TropicaliaCraft dentro do instalador desktop (all-in-one, como o APK).
//
//   node scripts/stage-horizon.mjs --bin <pasta com horizon-client[.exe]> [--data <engine-data.zip>]
//
// Copia para src-tauri/resources/horizon/:
//   - horizon-client(.exe) (+ DLLs/dylibs ao lado, se houver)
//   - engine-data.zip (dados do motor, os mesmos do APK)
// O tauri.<plataforma>.conf.json empacota essa pasta; o launcher instala a partir dela no primeiro uso.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(root, '..');
const args = process.argv.slice(2);
const arg = (name, def) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : def;
};

const binDir = resolve(arg('--bin', ''));
const data = resolve(arg('--data', join(repo, 'assets', 'engine-data.zip')));
const exe = process.platform === 'win32' ? 'horizon-client.exe' : 'horizon-client';
const out = join(root, 'src-tauri', 'resources', 'horizon');

if (!existsSync(join(binDir, exe))) {
	console.error(`Não achei ${exe} em ${binDir}. Compile o Horizon antes (tools/horizon-android).`);
	process.exit(1);
}
if (!existsSync(data) || statSync(data).size < 1000) {
	console.error(`Não achei o engine-data.zip em ${data}.`);
	process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
copyFileSync(join(binDir, exe), join(out, exe));
for (const f of readdirSync(binDir)) {
	if (/\.(dll|dylib|so(\.\d+)*)$/i.test(f)) copyFileSync(join(binDir, f), join(out, f));
}
copyFileSync(data, join(out, 'engine-data.zip'));
for (const f of readdirSync(out)) console.log(`  horizon/${f}  ${(statSync(join(out, f)).size / 1048576).toFixed(1)} MB`);
console.log('Motor Horizon pronto para empacotar.');
