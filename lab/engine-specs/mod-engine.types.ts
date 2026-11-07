/**
 * Contratos de Tipos para Modloaders, Mods e Modpacks (Modrinth & CurseForge)
 * Diretório: tropicalia-launcher-lab/engine-specs/mod-engine.types.ts
 */

export type ModLoaderType = 'vanilla' | 'fabric' | 'neoforge' | 'forge' | 'quilt';

export type GameEdition = 'java' | 'bedrock';

export interface ModDependency {
  projectId: string;
  versionId?: string;
  dependencyType: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface ModItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  iconUrl?: string;
  author: string;
  source: 'modrinth' | 'curseforge' | 'local';
  downloads: number;
  categories: string[];
  clientSide: 'required' | 'optional' | 'unsupported';
  serverSide: 'required' | 'optional' | 'unsupported';
  latestCompatibleVersion?: {
    id: string;
    versionNumber: string;
    gameVersions: string[];
    loaders: ModLoaderType[];
    downloadUrl: string;
    filename: string;
    fileSize: number;
    sha1: string;
    sha512?: string;
    dependencies: ModDependency[];
  };
}

export interface ModpackManifest {
  formatVersion: number;
  game: 'minecraft';
  name: string;
  summary?: string;
  versionId: string;
  dependencies: {
    minecraft: string;
    [loader: string]: string; // ex.: fabricLoader: "0.16.9"
  };
  files: Array<{
    path: string;
    hashes: {
      sha1: string;
      sha512?: string;
    };
    downloads: string[];
    fileSize: number;
  }>;
}

export interface GameInstanceProfile {
  id: string;
  name: string;
  edition: GameEdition;
  gameVersion: string; // ex.: "1.21.4"
  loader: ModLoaderType;
  loaderVersion?: string; // ex.: "0.16.9"
  iconPath?: string;
  customResolution?: {
    width: number;
    height: number;
  };
  memoryAllocation: {
    minMb: number; // -Xms
    maxMb: number; // -Xmx
  };
  customJvmArgs?: string[];
  javaPath?: string; // Caminho customizado ou gerenciado pelo launcher
  installedMods: Array<{
    filename: string;
    enabled: boolean;
    modId?: string;
    name: string;
    version: string;
    source: 'modrinth' | 'curseforge' | 'manual';
    autoUpdated: boolean;
  }>;
  createdAt: string;
  lastPlayedAt?: string;
  playTimeMinutes: number;
}
