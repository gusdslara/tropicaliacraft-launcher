<script lang="ts">
 import { onMount } from 'svelte';
 import { detectLanguage } from '$lib/i18n';
 let notice = $state(false);
 const lines = {
  pt: ['Carregando o jogo...', 'Aguarde, isso pode levar alguns instantes.'],
  en: ['Loading the game...', 'Please wait, this can take a moment.'],
  es: ['Cargando el juego...', 'Espera, esto puede tardar unos momentos.']
 }[detectLanguage()];
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
  </div>
 {:else}
  <img class="wordmark" src="/images/tropicalia_logo.png" alt="TropicaliaCraft" />
 {/if}
</div>

<style>
 .launch-screen { position: fixed; inset: 0; z-index: 10000; display: grid; place-items: center; background: #000; padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left)); text-align: center; }
 .wordmark { width: min(75vw, 560px, 120dvh); max-width: 100%; height: auto; animation: logo-fade 2.2s ease-in-out both; }
 .notice { max-width: 100%; color: white; }
 .creeper { display: block; height: clamp(48px, 22dvh, 120px); width: auto; margin: 0 auto 16px; }
 h1 { font-size: clamp(18px, 3vw, 40px); margin: 0; }
 p { color: #9ba1a6; font-size: clamp(12px, 1.8vw, 22px); margin: 12px 0 0; }
 @keyframes logo-fade { 0%, 100% { opacity: 0; } 30%, 70% { opacity: 1; } }
 @media (prefers-reduced-motion: reduce) { .wordmark { animation: none; } }
</style>
