import { expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { compileModule } from 'svelte/compiler';
import ts from 'typescript';

const listeners = new Map<string, (value: any) => void>();
mock.module('$lib/platform', () => ({
    isTauri: true, secrets: {},
    kv: { get: async (_key: string, fallback: unknown) => fallback, set: async () => {} },
    on: async (event: string, callback: (v: any) => void) => { listeners.set(event, callback); return () => {}; },
    call: async (command: string) => command === 'system_info' ? {os: 'windows', totalMemoryMb: 8192} : []
}));
mock.module('$lib/services/microsoft-auth', () => ({DEFAULT_MS_CLIENT_ID: 'test'}));
mock.module('$lib/services/updates', () => ({checkForLauncherUpdates: async () => ({hasUpdate: false})}));
mock.module('$lib/services/server-engines', () => ({DEFAULT_PROPERTIES: {}, engine: () => ({}), resolveJar: async () => ({})}));
mock.module('$lib/services/horizon-mods', () => ({seedHorizonInstanceMods: () => {}, ensureHorizonModsInstalled: async () => {}}));
const root = resolve(import.meta.dir, '../src/lib');
Bun.plugin({name: 'svelte-state-test', setup(build) {
    build.onResolve({filter: /^\$lib\//}, args => {
        const path = resolve(root, args.path.slice(5));
        for (const suffix of ['', '.ts']) { try { readFileSync(path + suffix); return {path: path + suffix}; } catch {} }
        return undefined;
    });
    build.onLoad({filter: /state\.svelte\.ts$/}, args => {
        const javascript = ts.transpileModule(readFileSync(args.path, 'utf8'), {compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext}}).outputText;
        return {contents: compileModule(javascript, {filename: args.path, generate: 'server'}).js.code, loader: 'js'};
    });
}});
const {app} = await import('../src/lib/state.svelte');
await app.init();

test('content installs release their lock after success and failure, and cannot overlap launch', async () => {
    const instance = app.instances[0];
    let finish!: () => void;
    const pending = app.installContent(instance.id, () => new Promise<void>(resolve => { finish = resolve; }));
    expect(app.contentOperations[instance.id]).toBe(true);
    await expect(app.play(instance)).rejects.toThrow('Aguarde');
    await expect(app.installContent(instance.id, async () => {})).rejects.toThrow();
    finish(); await pending;
    expect(app.contentOperations[instance.id]).toBeUndefined();
    await expect(app.installContent(instance.id, async () => { throw new Error('download failed'); })).rejects.toThrow('download failed');
    expect(app.contentOperations[instance.id]).toBeUndefined();
    expect(await app.installContent(instance.id, async () => 'retry completed')).toBe('retry completed');
});

test('late mod progress cannot recreate a stuck launch bar or overwrite a real launch', () => {
    const progress = listeners.get('launcher://progress')!;
    progress({owner: 'test', stage: 'content', current: 1, total: 2, message: 'late mod'});
    expect(app.tasks.test).toBeUndefined();
    app.tasks.test = {stage: 'launch', current: 0, total: 1, message: 'launching', busy: true};
    progress({owner: 'test', stage: 'content-finished', current: 1, total: 1});
    expect(app.tasks.test.stage).toBe('launch');
    listeners.get('game://started')!({owner: 'test'});
    progress({owner: 'test', stage: 'libraries', current: 1, total: 1});
    expect(app.tasks.test).toBeUndefined();
    listeners.get('game://exit')!({owner: 'test', code: 0});
    expect(app.running.test).toBeUndefined();
});
