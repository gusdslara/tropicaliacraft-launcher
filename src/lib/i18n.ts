export type Lang = 'pt' | 'en' | 'es';

export function detectLanguage(): Lang {
	if (typeof navigator === 'undefined') return 'pt';
	const l = (navigator.language || (navigator as any).userLanguage || 'pt').toLowerCase();
	if (l.startsWith('es')) return 'es';
	if (l.startsWith('en')) return 'en';
	return 'pt';
}

export const i18n = {
	pt: {
		home: 'Início',
		instances: 'Instâncias',
		explore: 'Explorar',
		servers: 'Servidores',
		settings: 'Ajustes',
		account: 'Trocar de conta',
		play: 'JOGAR AGORA',
		launching: 'INICIANDO...',
		install: 'INSTALAR',
		downloading: 'BAIXANDO...',
		instructions: {
			title: 'Instruções de Instalação e Uso',
			android: 'Android: Abra o arquivo APK baixado no seu celular e permita a instalação de fontes desconhecidas se solicitado.',
			windows: 'Windows: Execute o instalador ou descompacte o arquivo portable e inicie o Tropicalia Launcher.',
			linux: 'Linux: No Ubuntu/Debian instale com "sudo dpkg -i TropicaliaLauncher*.deb" ou execute o binário diretamente com "chmod +x".'
		}
	},
	en: {
		home: 'Home',
		instances: 'Instances',
		explore: 'Explore',
		servers: 'Servers',
		settings: 'Settings',
		account: 'Switch account',
		play: 'PLAY NOW',
		launching: 'LAUNCHING...',
		install: 'INSTALL',
		downloading: 'DOWNLOADING...',
		instructions: {
			title: 'Installation and Usage Instructions',
			android: 'Android: Open the downloaded APK on your device and allow installation from unknown sources if prompted.',
			windows: 'Windows: Run the setup installer or unpack the portable executable and start Tropicalia Launcher.',
			linux: 'Linux: On Ubuntu/Debian install with "sudo dpkg -i TropicaliaLauncher*.deb" or run the binary directly with "chmod +x".'
		}
	},
	es: {
		home: 'Inicio',
		instances: 'Instancias',
		explore: 'Explorar',
		servers: 'Servidores',
		settings: 'Ajustes',
		account: 'Cambiar cuenta',
		play: 'JUGAR AHORA',
		launching: 'INICIANDO...',
		install: 'INSTALAR',
		downloading: 'DESCARGANDO...',
		instructions: {
			title: 'Instrucciones de Instalación e Uso',
			android: 'Android: Abre el archivo APK descargado en tu dispositivo y permite la instalación de fuentes desconocidas si se te solicita.',
			windows: 'Windows: Ejecuta el instalador o descomprime el ejecutable portable e inicia Tropicalia Launcher.',
			linux: 'Linux: En Ubuntu/Debian instala con "sudo dpkg -i TropicaliaLauncher*.deb" o ejecuta el binario con "chmod +x".'
		}
	}
};
