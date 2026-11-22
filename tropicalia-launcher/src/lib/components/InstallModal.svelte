<!-- Instalação em 1 clique: escolhe o destino, resolve dependências obrigatórias e pergunta se instala tudo junto.
     Para modpacks: cria uma instância nova a partir do .mrpack. -->
<script lang="ts">
	import Modal from './Modal.svelte';
	import PixelButton from './PixelButton.svelte';
	import Badge from './Badge.svelte';
	import BlockIcon from './BlockIcon.svelte';
	import { app, toasts } from '$lib/state.svelte';
	import { call } from '$lib/platform';
	import {
		loadersFor,
		planInstall,
		pickBest,
		primaryFile,
		projectVersions,
		toInstalled,
		type ModrinthVersion,
		type PlannedInstall,
		type SearchHit
	} from '$lib/services/modrinth';
	import { getHorizonRegistry, installHorizonMod } from '$lib/services/horizon-mods';
	import { engine } from '$lib/services/server-engines';
	import type { ContentKind, ModLoader } from '$lib/types';
	import { errorMessage, formatBytes, LOADER_LABEL } from '$lib/util/format';
	import { Download, Link2, Package } from 'lucide-svelte';

	let {
		open = $bindable(false),
		project,
		kind,
		target = $bindable('')
	}: { open: boolean; project: SearchHit | null; kind: ContentKind; target: string } = $props();

	// destino: "i:<id>" (instância) ou "s:<id>" (servidor)
	const options = $derived.by(() => {
		const out: Array<{ value: string; label: string }> = [];
		if (kind === 'plugin') {
			for (const s of app.servers.filter((s) => engine(s.engine).accepts.includes('plugin')))
				out.push({ value: `s:${s.id}`, label: `🖥 ${s.name} · ${engine(s.engine).name} ${s.minecraftVersion}` });
			return out;
		}
		for (const i of app.instances)
			out.push({ value: `i:${i.id}`, label: `${i.name} · ${LOADER_LABEL[i.loader]} ${i.gameVersion}` });
		if (kind === 'mod')
			for (const s of app.servers.filter((s) => engine(s.engine).accepts.includes('mod')))
				out.push({ value: `s:${s.id}`, label: `🖥 ${s.name} · ${engine(s.engine).name} ${s.minecraftVersion}` });
		return out;
	});

	let plan = $state<PlannedInstall[]>([]);
	let missing = $state<string[]>([]);
	let resolving = $state(false);
	let installing = $state(false);
	let error = $state('');

	// modpack
	let packVersions = $state<ModrinthVersion[]>([]);
	let packVersionId = $state('');
	let packName = $state('');

	const ctx = $derived.by(() => {
		if (!target) return null;
		const [t, id] = [target.slice(0, 1), target.slice(2)];
		if (t === 'i') {
			const inst = app.instances.find((x) => x.id === id);
			if (!inst) return null;
			return { ownerKind: 'instance' as const, owner: inst, loaders: loadersFor(kind, inst.loader), gameVersion: inst.gameVersion };
		}
		const srv = app.servers.find((x) => x.id === id);
		if (!srv) return null;
		const e = engine(srv.engine);
		const modLoader = e.flavors?.find((f) => f.id === srv.flavor)?.modLoader ?? e.modLoader ?? 'fabric';
		return {
			ownerKind: 'server' as const,
			owner: srv,
			loaders: kind === 'plugin' ? loadersFor('plugin', 'vanilla') : loadersFor('mod', modLoader as ModLoader),
			gameVersion: srv.minecraftVersion
		};
	});

	$effect(() => {
		if (!open || !project) return;
		error = '';
		if (kind === 'modpack') {
			packName = project.title;
			projectVersions(project.project_id, [])
				.then((v) => {
					packVersions = v;
					packVersionId = pickBest(v)?.id ?? '';
				})
				.catch((e) => (error = errorMessage(e)));
			return;
		}
		if (!target || !options.some((o) => o.value === target)) target = options[0]?.value ?? '';
	});

	$effect(() => {
		const c = ctx;
		const p = project;
		if (!open || !p || kind === 'modpack' || !c) return;
		resolving = true;
		plan = [];
		missing = [];
		error = '';

		if (c.loaders.includes('horizon-rust') && kind === 'mod') {
			getHorizonRegistry()
				.then((reg) => {
					if (ctx !== c) return;
					const mod = reg.projects.find((x) => x.id === p.project_id);
					if (!mod || !mod.versions[0]) {
						error = 'Mod Horizon não encontrado no registro oficial.';
						return;
					}
					const v = mod.versions[0];
					plan = [
						{
							root: true,
							project: { id: mod.id, title: mod.name, iconUrl: mod.icon },
							version: { id: v.version, version_number: v.version } as any,
							file: {
								filename: v.file.name,
								url: v.file.url,
								hashes: { sha1: '', sha512: '' },
								size: v.file.size,
								primary: true
							} as any
						}
					];
				})
				.catch((e) => (error = errorMessage(e)))
				.finally(() => (resolving = false));
			return;
		}

		const installed = new Set(Object.values(c.owner.content).map((x) => x.projectId).filter(Boolean) as string[]);
		installed.delete(p.project_id); // permite reinstalar/atualizar o próprio projeto
		planInstall({ id: p.project_id, title: p.title, iconUrl: p.icon_url }, { kind, loaders: c.loaders, gameVersion: c.gameVersion, installed })
			.then((r) => {
				if (ctx !== c) return;
				plan = r.plan;
				missing = r.missing;
			})
			.catch((e) => (error = errorMessage(e)))
			.finally(() => (resolving = false));
	});

	const deps = $derived(plan.filter((p) => !p.root));
	const totalSize = $derived(plan.reduce((s, p) => s + p.file.size, 0));

	async function install(withDeps: boolean) {
		const c = ctx;
		if (!c) return;

		if (c.loaders.includes('horizon-rust') && kind === 'mod') {
			installing = true;
			try {
				const reg = await getHorizonRegistry();
				const mod = reg.projects.find((x) => x.id === project?.project_id);
				if (!mod) throw new Error('Mod Horizon não encontrado.');
				await installHorizonMod(c.owner as any, mod);
				app.saveInstances();
				toasts.ok(`${mod.name} instalado em ${c.owner.name}`);
				open = false;
			} catch (e) {
				error = errorMessage(e);
			} finally {
				installing = false;
			}
			return;
		}
		const items = withDeps ? plan : plan.filter((p) => p.root);
		installing = true;
		try {
			// remove versão antiga do mesmo projeto
			for (const old of Object.values(c.owner.content).filter((x) => items.some((p) => p.project.id === x.projectId))) {
				if (!items.some((p) => p.file.filename === old.filename)) {
					await call('content_delete', { ownerKind: c.ownerKind, ownerId: c.owner.id, kind: old.kind, filename: old.filename }).catch(() => {});
					delete c.owner.content[old.filename];
				}
			}
			await call('content_install', {
				ownerKind: c.ownerKind,
				ownerId: c.owner.id,
				kind,
				files: items.map((p) => ({ url: p.file.url, filename: p.file.filename, sha1: p.file.hashes.sha1, size: p.file.size }))
			});
			app.recordContent(c.owner, items.map((p) => toInstalled(p, kind)));
			c.ownerKind === 'instance' ? app.saveInstances() : app.saveServers();
			toasts.ok(`${project?.title} instalado${items.length > 1 ? ` com ${items.length - 1} dependência(s)` : ''} em ${c.owner.name}`);
			open = false;
		} catch (e) {
			error = errorMessage(e);
		} finally {
			installing = false;
			delete app.tasks[c.owner.id];
		}
	}

	async function installModpack() {
		const v = packVersions.find((x) => x.id === packVersionId);
		if (!v || !project) return;
		installing = true;
		const loader = (['neoforge', 'forge', 'quilt', 'fabric'].find((l) => v.loaders.includes(l)) ?? 'vanilla') as ModLoader;
		const inst = app.newInstance({
			name: packName.trim() || project.title,
			icon: 'diamond',
			gameVersion: v.game_versions[0],
			loader,
			modpack: { projectId: project.project_id, versionId: v.id, name: project.title }
		});
		try {
			const res = await call<{ dependencies: Record<string, string>; files: number }>('mrpack_install', {
				instanceId: inst.id,
				source: primaryFile(v).url
			});
			const d = res.dependencies;
			const mc = d.minecraft ?? inst.gameVersion;
			const patch =
				d['neoforge'] ? { loader: 'neoforge' as const, loaderVersion: d['neoforge'] }
				: d['forge'] ? { loader: 'forge' as const, loaderVersion: `${mc}-${d['forge']}` }
				: d['quilt-loader'] ? { loader: 'quilt' as const, loaderVersion: d['quilt-loader'] }
				: d['fabric-loader'] ? { loader: 'fabric' as const, loaderVersion: d['fabric-loader'] }
				: { loader: 'vanilla' as const, loaderVersion: undefined };
			app.updateInstance(inst.id, { gameVersion: mc, ...patch });
			app.settings.lastInstanceId = inst.id;
			app.saveSettings();
			toasts.ok(`Modpack ${project.title} instalado (${res.files} arquivos). Pronto para jogar!`);
			open = false;
		} catch (e) {
			error = errorMessage(e);
			await app.deleteInstance(inst.id);
		} finally {
			installing = false;
			delete app.tasks[inst.id];
		}
	}

	const task = $derived(ctx ? app.tasks[ctx.owner.id] : undefined);
</script>

<Modal bind:open title={kind === 'modpack' ? 'Instalar modpack' : `Instalar ${project?.title ?? ''}`} width={620}>
	{#if project}
		<div class="mb-4 flex items-center gap-3">
			{#if project.icon_url}<img src={project.icon_url} alt="" class="h-12 w-12 rounded-sm" />{:else}<BlockIcon size={48} />{/if}
			<div class="min-w-0">
				<div class="font-mc mc-shadow-sm truncate text-[13px] text-white">{project.title}</div>
				<div class="tp-muted truncate text-xs">{project.description}</div>
			</div>
		</div>

		{#if kind === 'modpack'}
			<div class="grid gap-4">
				<div>
					<label class="tp-label" for="pack-name">Nome da instância</label>
					<input id="pack-name" class="tp-input" bind:value={packName} />
				</div>
				<div>
					<label class="tp-label" for="pack-ver">Versão do modpack</label>
					<select id="pack-ver" class="tp-select" bind:value={packVersionId} disabled={!packVersions.length}>
						{#each packVersions as v (v.id)}
							<option value={v.id}>{v.version_number} · MC {v.game_versions.join(', ')} · {v.loaders.map((l) => LOADER_LABEL[l] ?? l).join('/')}</option>
						{/each}
					</select>
					<p class="tp-help">O launcher baixa todos os mods do pacote, aplica as configs e já deixa o modloader certo.</p>
				</div>
			</div>
		{:else if !options.length}
			<p class="tp-muted text-[13px]">
				{kind === 'plugin' ? 'Crie um servidor Paper, Purpur ou híbrido primeiro.' : 'Crie uma instância primeiro.'}
			</p>
		{:else}
			<label class="tp-label" for="target">Instalar em</label>
			<select id="target" class="tp-select" bind:value={target}>
				{#each options as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
			</select>

			<div class="mt-4">
				{#if resolving}
					<p class="tp-muted text-[13px]">Verificando versões e dependências…</p>
				{:else if plan.length}
					<div class="tp-slot divide-y divide-[#1d2a23]">
						{#each plan as p (p.project.id)}
							<div class="flex items-center gap-3 px-3 py-2.5">
								{#if p.project.iconUrl}<img src={p.project.iconUrl} alt="" class="h-8 w-8 rounded-sm" />{:else}<Package size={30} class="text-[#93a59a]" />{/if}
								<div class="min-w-0 flex-1">
									<div class="truncate text-[13px] font-semibold">{p.project.title}</div>
									<div class="tp-muted truncate font-mono text-[11px]">{p.file.filename} · {formatBytes(p.file.size)}</div>
								</div>
								{#if p.root}<Badge tone="green">Pedido</Badge>{:else}<Badge tone="blue"><Link2 size={11} /> Dependência</Badge>{/if}
							</div>
						{/each}
					</div>
					{#if deps.length}
						<p class="mt-3 text-[13px] text-[#c7d5cc]">
							<b class="text-white">{project.title}</b> precisa de {deps.length === 1 ? 'mais 1 projeto' : `mais ${deps.length} projetos`} para funcionar. Instalar tudo junto?
						</p>
					{/if}
					{#if missing.length}
						<p class="mt-2 text-[12px] text-[#fbbf24]">Sem versão compatível para: {missing.join(', ')}</p>
					{/if}
				{/if}
			</div>
		{/if}

		{#if error}<p class="err selectable mt-4">{error}</p>{/if}
		{#if task && installing}
			<p class="tp-muted mt-3 font-mono text-[11px]">{task.current}/{task.total} · {task.message}</p>
		{/if}
	{/if}

	{#snippet footer()}
		<PixelButton variant="ghost" onclick={() => (open = false)}>Cancelar</PixelButton>
		{#if kind === 'modpack'}
			<PixelButton variant="emerald" icon={Download} loading={installing} disabled={!packVersionId} onclick={installModpack}>Instalar modpack</PixelButton>
		{:else}
			{#if deps.length}
				<PixelButton loading={installing} disabled={resolving || !plan.length} onclick={() => install(false)}>Só ele</PixelButton>
			{/if}
			<PixelButton variant="emerald" icon={Download} loading={installing} disabled={resolving || !plan.length} onclick={() => install(true)}>
				{deps.length ? `Instalar tudo (${plan.length})` : 'Instalar'} · {formatBytes(totalSize)}
			</PixelButton>
		{/if}
	{/snippet}
</Modal>

<style>
	.err {
		padding: 10px 12px;
		font-size: 13px;
		color: #fecaca;
		background: #2e1111;
		box-shadow: inset 0 0 0 1px #7f1d1d;
	}
</style>
