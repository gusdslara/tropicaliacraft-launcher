import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Execute the production resolver with an in-memory API; no network or filesystem installs.
let source = await readFile(new URL('../src/lib/services/modrinth.ts', import.meta.url), 'utf8');
source = source.replace("import { call, getJson, isTauri } from '$lib/platform';",
    'const { call, getJson, isTauri } = globalThis.modrinthTestPlatform;');
source = source.replace("import { errorMessage } from '$lib/util/format';", 'const errorMessage = String;');
const responses = new Map();
globalThis.modrinthTestPlatform = {
    isTauri: false, call() { throw new Error('Unexpected install'); },
    async getJson(url) {
        const path = new URL(url).pathname.replace('/v2', '');
        if (path === '/projects') return [];
        if (!responses.has(path)) throw new Error(`Unavailable: ${path}`);
        return responses.get(path);
    }
};
const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
}).outputText;
const { planInstall, applyInstallPlan } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const context = { kind: 'mod', loaders: ['fabric'], gameVersion: '26.3', installed: new Set() };
const version = (id, project_id, dependencies = [], loaders = ['fabric']) => ({
    id, project_id, name: id, version_number: id, game_versions: ['26.3'], loaders,
    version_type: 'release', dependencies,
    files: [{ primary: true, filename: `${id}.jar`, url: `https://cdn.modrinth.com/${id}`, hashes: {}, size: 1 }]
});
const dep = (version_id, project_id) => ({ version_id, project_id, file_name: null, dependency_type: 'required' });
const root = { id: 'root', title: 'Example mod' };
responses.set('/version/api-v1', version('api-v1', 'api'));
const result = await planInstall(root, context, version('root-v1', 'root', [dep('api-v1', 'api')]));
assert.deepEqual(result.plan.map(p => p.project.id), ['root', 'api']);
responses.set('/version/api-v1', version('api-v1', 'api', [], ['forge']));
await assert.rejects(() => planInstall(root, context, version('root-v1', 'root', [dep('api-v1', 'api')])), /incompatíveis/);
responses.delete('/version/api-v1');
responses.set('/project/api/version', [version('api-v2', 'api')]);
await assert.rejects(() => planInstall(root, context, version('root-v1', 'root', [dep('api-v1', 'api')])), /indisponíveis/);
await assert.rejects(() => planInstall(root, context, version('root-v1', 'root', [dep(null, null)])), /sem identificação/);
await assert.rejects(() => planInstall(root, context, version('root-v1', 'root', [], ['forge'])), /incompatível/);
responses.set('/version/api-v1', version('api-v1', 'api', [dep('root-v1', 'root')]));
responses.set('/version/root-v1', version('root-v1', 'root', [dep('api-v1', 'api')]));
const cycle = await planInstall(root, context, responses.get('/version/root-v1'));
assert.equal(cycle.plan.length, 2);
await assert.rejects(() => planInstall(root, context, version('root-v2', 'root', [dep('root-v1', 'root')])), /indisponíveis/);
const owner = { id: 'test', name: 'Test', content: { 'api-old.jar': { filename: 'api-old.jar', projectId: 'api', kind: 'mod' } } };
await applyInstallPlan(result.plan, 'mod', { ownerKind: 'instance', owner, loaders: ['fabric'], gameVersion: '26.3' });
assert.equal(owner.content['api-old.jar'], undefined);
assert.equal(owner.content['api-v1.jar'].versionId, 'api-v1');
console.log('8 verificações do resolver Modrinth passaram.');
delete globalThis.modrinthTestPlatform;
