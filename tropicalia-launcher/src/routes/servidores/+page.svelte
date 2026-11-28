<!-- Atalho antigo: a central de servidores agora também fica na aba "Criar servidor" da tela inicial. -->
<script lang="ts">
	import { page } from '$app/state';
	import ServerManager from '$lib/components/ServerManager.svelte';
</script>

<ServerManager initialId={page.url.searchParams.get('id')} />
