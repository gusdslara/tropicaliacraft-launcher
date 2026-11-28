<!-- Sobre e créditos: projetos que o launcher embute, licenças e avisos legais. -->
<script lang="ts">
	import TropicaliaCard from '$lib/components/TropicaliaCard.svelte';
	import PixelButton from '$lib/components/PixelButton.svelte';
	import Badge from '$lib/components/Badge.svelte';
	import { openUrl } from '$lib/platform';
	import { tr } from '$lib/ui-text';
	import { ENGINES, LIBRARIES, REPO_URL, type Credit } from '$lib/data/credits';
	import { ArrowLeft, Code, ExternalLink, FileText, FolderGit2, Scale, ShieldAlert } from 'lucide-svelte';

	const tone = (license: string) => (license.includes('GPL') ? 'gold' : 'green') as 'gold' | 'green';
	const sourceUrl = (c: Credit) => (c.path ? `${REPO_URL}/tree/main/${c.path.replace(/\{.*\}/, '')}` : c.url);
</script>

<div class="mx-auto flex max-w-[1100px] flex-col gap-5 md:gap-6">
	<div>
		<a href="/ajustes" class="back"><ArrowLeft size={16} /> {tr('Voltar aos ajustes')}</a>
	</div>

	<TropicaliaCard title={tr('Sobre o TropicaliaLauncher')} subtitle={tr('Launcher de código aberto para Minecraft no PC e no celular')}>
		<p class="text-[13px] leading-relaxed text-[#c7d5cc]">
			{tr('O TropicaliaLauncher junta dois jeitos de jogar num app só: o motor Horizon, escrito em Rust, e o runtime Java do PojavLauncher para rodar o Minecraft: Java Edition original no Android. Nada disso existiria sem os projetos abaixo.')}
		</p>
		<div class="mt-4 flex flex-wrap gap-2.5">
			<PixelButton size="sm" icon={FolderGit2} onclick={() => openUrl(REPO_URL)}>{tr('Código-fonte')}</PixelButton>
			<PixelButton size="sm" variant="ghost" icon={FileText} onclick={() => openUrl(`${REPO_URL}/blob/main/THIRD_PARTY_NOTICES.md`)}>
				{tr('Avisos de terceiros')}
			</PixelButton>
			<PixelButton size="sm" variant="ghost" icon={Scale} onclick={() => openUrl(`${REPO_URL}/blob/main/LICENSE`)}>
				{tr('Licença (MIT)')}
			</PixelButton>
		</div>
	</TropicaliaCard>

	<section aria-labelledby="engines-title">
		<h2 id="engines-title" class="section-title font-mc mc-shadow">{tr('Motores e runtimes')}</h2>
		<ul class="grid grid-cols-1 gap-4 md:grid-cols-2">
			{#each ENGINES as c (c.name)}
				<li>
					<TropicaliaCard size="sm" class="h-full">
						<div class="flex h-full flex-col gap-2">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<h3 class="text-[14px] font-semibold text-white">{c.name}</h3>
								<Badge tone={tone(c.license)}><Scale size={11} /> {c.license}</Badge>
							</div>
							<p class="tp-muted text-[12px]">{c.authors}</p>
							<p class="text-[12.5px] leading-relaxed text-[#c7d5cc]">{tr(c.role)}</p>
							{#if c.modified}
								<p class="tp-help text-[11.5px]">
									{tr('Inclui modificações nossas. Código-fonte exato em')} <code class="selectable">{c.path}</code>.
								</p>
							{/if}
							<div class="mt-auto flex flex-wrap gap-2 pt-2">
								<PixelButton size="xs" icon={ExternalLink} onclick={() => openUrl(c.url)}>{tr('Projeto')}</PixelButton>
								<PixelButton size="xs" variant="ghost" icon={Code} onclick={() => openUrl(sourceUrl(c))}>{tr('Nosso código')}</PixelButton>
								<PixelButton size="xs" variant="ghost" icon={Scale} onclick={() => openUrl(c.licenseUrl)}>{tr('Licença')}</PixelButton>
							</div>
						</div>
					</TropicaliaCard>
				</li>
			{/each}
		</ul>
	</section>

	<TropicaliaCard title={tr('Bibliotecas e serviços')} subtitle={tr('Outros projetos de código aberto usados pelo launcher')}>
		<ul class="libs">
			{#each LIBRARIES as c (c.name)}
				<li>
					<button type="button" class="lib" onclick={() => openUrl(c.url)}>
						<span class="min-w-0">
							<span class="block text-[13px] font-semibold text-white">{c.name}</span>
							<span class="tp-muted block text-[11.5px]">{tr(c.role)} · {c.authors}</span>
						</span>
						<span class="flex shrink-0 items-center gap-2">
							<Badge tone={tone(c.license)}>{c.license}</Badge>
							<ExternalLink size={14} class="text-[#93a59a]" aria-hidden="true" />
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</TropicaliaCard>

	<TropicaliaCard title={tr('Avisos legais')} size="sm">
		<div class="flex gap-3">
			<ShieldAlert size={18} class="mt-0.5 shrink-0 text-[#fbbf24]" aria-hidden="true" />
			<div class="space-y-2 text-[12.5px] leading-relaxed text-[#c7d5cc]">
				<p>
					{tr('Não é um produto oficial do Minecraft. Não é aprovado nem associado à Mojang ou à Microsoft. Minecraft é marca registrada da Mojang Synergies AB.')}
				</p>
				<p class="tp-muted">
					{tr('O launcher não inclui arquivos do jogo: o Minecraft: Java Edition é baixado dos servidores da Mojang com a sua conta Microsoft, que precisa ter o jogo comprado.')}
				</p>
				<p class="tp-muted">
					{tr('O runtime Java do Android é uma versão modificada do PojavLauncher (LGPL-3.0). Você pode baixar o código-fonte exato de cada versão no repositório e trocar essa parte por uma versão sua.')}
				</p>
			</div>
		</div>
	</TropicaliaCard>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 44px;
		font-size: 13px;
		font-weight: 600;
		color: var(--tp-muted);
		text-decoration: none;
	}
	.back:hover { color: var(--tp-text); }
	.back:focus-visible, .lib:focus-visible {
		outline: 2px solid var(--tp-green);
		outline-offset: 2px;
	}
	.section-title {
		margin: 0 0 12px;
		font-size: 12px;
		color: #fff;
	}
	ul { list-style: none; margin: 0; padding: 0; }
	.libs { display: grid; gap: 6px; }
	.lib {
		display: flex;
		width: 100%;
		min-height: 52px;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 12px;
		text-align: left;
		background: var(--tp-panel-3);
		border: 0;
		box-shadow: inset 0 0 0 1px var(--tp-border);
		cursor: pointer;
		transition: background-color 120ms ease, box-shadow 120ms ease;
	}
	.lib:hover {
		background: var(--tp-panel-2);
		box-shadow: inset 0 0 0 1px var(--tp-border-strong);
	}
	@media (max-width: 520px) {
		.lib { flex-direction: column; align-items: flex-start; }
	}
	@media (prefers-reduced-motion: reduce) {
		.lib { transition: none; }
	}
</style>
