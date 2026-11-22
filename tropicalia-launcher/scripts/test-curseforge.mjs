import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
let response;
let lastRequest;
let hasKey = true;
globalThis.cfTestPlatform = {
    secrets: { get: async () => hasKey ? 'test-key' : null },
    call: async (command, request) => { assert.equal(command, 'curseforge_get'); lastRequest = request; return response; }
};
let source = await readFile(new URL('../src/lib/services/curseforge.ts', import.meta.url), 'utf8');
source = source.replace("import { call, secrets } from '$lib/platform';", 'const { call, secrets } = globalThis.cfTestPlatform;');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const cf = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const file = { id: 9, modId: 123, displayName: 'test', fileName: 'test.jar', fileLength: 100, downloadUrl: 'https://cdn.example/test.jar',
    gameVersions: ['26.3', 'NeoForge'], releaseType: 1, fileDate: '2026-11-11', hashes: [{ algo: 1, value: 'abc' }],
    dependencies: [{ modId: 456, relationType: 3 }, { modId: 789, relationType: 5 }] };
const mapped = cf.fileVersion(file);
assert.deepEqual(mapped.loaders, ['neoforge']);
assert.equal(mapped.files[0].hashes.sha1, 'abc');
assert.equal(mapped.dependencies[0].dependency_type, 'required');
assert.equal(mapped.dependencies[1].dependency_type, 'incompatible');
assert.throws(() => cf.fileVersion({ ...file, downloadUrl: null }), /não permite download direto/);
response = { data: [], pagination: { totalCount: 0, index: 0, pageSize: 20 } };
await cf.search({ kind: 'mod', query: 'test', gameVersion: '26.3', loaders: ['neoforge'], index: 'updated' });
assert.equal(lastRequest.query.modLoaderTypes, '[6]');
assert.equal(lastRequest.query.gameVersion, '26.3');
assert.equal(lastRequest.query.sortField, '3');
await assert.rejects(() => cf.search({ kind: 'modpack', query: '' }), /aba Mods/);
response = { data: { allowModDistribution: false } };
await assert.rejects(() => cf.versions('curseforge:123', ['fabric'], '26.3'), /não permite distribuição/);
hasKey = false;
await assert.rejects(() => cf.api('/mods/search'), /Configure a chave/);
console.log('7 verificações CurseForge passaram (mapeamento, dependências, filtros, restrições e chave).');
delete globalThis.cfTestPlatform;
