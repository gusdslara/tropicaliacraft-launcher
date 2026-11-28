<!-- Tela de abertura do jogo Java no desktop: logo, depois o progresso real (downloads, Java, assets). -->
<script lang="ts">
 import { onMount } from 'svelte';
 import { detectLanguage } from '$lib/i18n';
 import { stageLabel, type LaunchTask } from '$lib/state.svelte';
 import ProgressBar from './ProgressBar.svelte';

 let { task }: { task?: LaunchTask } = $props();
 let notice = $state(false);
 const lines = {
  pt: ['Carregando o jogo...', 'Na primeira vez baixamos o Minecraft e o Java. Pode levar alguns minutos.'],
  en: ['Loading the game...', 'The first run downloads Minecraft and Java. It can take a few minutes.'],
  es: ['Cargando el juego...', 'La primera vez se descargan Minecraft y Java. Puede tardar unos minutos.']
 }[detectLanguage()];
 const fraction = $derived(task && task.total > 1 ? task.current / task.total : null);
 onMount(() => {
  const timer = setTimeout(() => { notice = true; }, 2200);
  return () => clearTimeout(timer);
 });
</script>

<div class="launch-screen" role="status" aria-live="polite">
 {#if notice}
  <div class="notice">
   <img class="creeper" src="/images/tropi_creeper.png" alt="" />
   <h1>{lines[0]}</h1>
   <p>{lines[1]}</p>
   {#if task}
    <div class="progress">
     <ProgressBar
      value={fraction ?? 0}
      indeterminate={fraction === null}
      label={stageLabel(task.stage)}
      detail={fraction === null ? task.message : `${task.current}/${task.total} · ${task.message}`}
     />
    </div>
   {/if}
  </div>
 {:else}
  <img class="wordmark" src="/images/tropicalia_logo.png" alt="TropicaliaCraft" />
 {/if}
</div>

<style>
 .launch-screen { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: #000; padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)); text-align: center; }
 .wordmark { width: min(75vw, 560px, 120dvh); max-width: 100%; height: auto; animation: logo-fade 2.2s ease-in-out both; }
 .notice { width: min(100%, 560px); color: white; }
 .creeper { display: block; height: clamp(48px, 22dvh, 120px); width: auto; margin: 0 auto 16px; }
 h1 { font-size: clamp(18px, 3vw, 40px); margin: 0; }
 p { color: #9ba1a6; font-size: clamp(12px, 1.8vw, 18px); margin: 12px 0 0; }
 .progress { margin-top: 28px; text-align: left; }
 @keyframes logo-fade { 0%, 100% { opacity: 0; } 30%, 70% { opacity: 1; } }
 @media (prefers-reduced-motion: reduce) { .wordmark { animation: none; } }
</style>
