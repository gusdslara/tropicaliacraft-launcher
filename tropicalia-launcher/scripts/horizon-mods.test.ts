import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

let registryRequests = 0;
const calls: Array<{command: string; args: any}> = [];
const platform = {
    isTauri: true,
    getJson: async () => { registryRequests++; throw new Error('offline'); },
    call: async (command: string, args: any) => {
        calls.push({command, args});
        if (command === 'horizon_native_mods') return ['zoom', 'minimap', 'recipes', 'smartf3'];
    }
};
// Compile the real service with isolated dependencies, so the state suite's mocks
// cannot replace this platform or inherit its offline behavior.
const source = readFileSync(new URL('../src/lib/services/horizon-mods.ts', import.meta.url), 'utf8')
    .replace("import { call, getJson, isTauri } from '$lib/platform';", 'const { call, getJson, isTauri } = platform;')
    .replace("import INDEX_DATA from '$lib/data/horizon-mods-index.json';", 'const INDEX_DATA = registry;');
const compiled = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText;
const service: any = {};
new Function('platform', 'registry', 'exports', compiled)(platform,
    JSON.parse(readFileSync(new URL('../src/lib/data/horizon-mods-index.json', import.meta.url), 'utf8')), service);
const {seedHorizonInstanceMods, ensureHorizonModsInstalled} = service;

function instance() { return {id: 'offline-rust', loader: 'horizon-rust', content: {}} as any; }

test('a native-only Rust profile prepares offline with its selected switches and no catalog request', async () => {
    calls.length = 0;
    const profile = instance();
    seedHorizonInstanceMods(profile, ['zoom', 'minimap']);
    await ensureHorizonModsInstalled(profile);
    expect(registryRequests).toBe(0);
    expect(calls.some(c => c.command === 'content_install')).toBe(false);
    const states = calls.findLast(c => c.command === 'horizon_mods_state_set_bulk')!.args.states;
    expect(states.zoom).toBe(true);
    expect(states.minimap).toBe(true);
    expect(states.recipes).toBe(false);
    expect(states.smartf3).toBe(false);
});

test('an older profile cannot claim a native mod absent from its engine is enabled', async () => {
    calls.length = 0;
    const profile = instance();
    seedHorizonInstanceMods(profile, ['appleskin', 'zoom']);
    await ensureHorizonModsInstalled(profile);
    const active = Object.values(profile.content).filter((item: any) => !item.filename.endsWith('.disabled')) as any[];
    expect(active.map(item => item.projectId)).toEqual(['zoom']);
    expect(calls.findLast(c => c.command === 'horizon_mods_state_set_bulk')!.args.states.appleskin).toBe(false);
});
