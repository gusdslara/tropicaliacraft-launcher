export interface SkinPreset {
  id: string;
  name: string;
  prompt: string;
  description: string;
  category: 'ia-destaques' | 'tropicaliacraft' | 'classicos';
  icon: string;
  badge?: string;
}

export const SKIN_PRESETS: SkinPreset[] = [
  {
    id: 'masterchief-capivara',
    name: 'Master Chief Capivara',
    prompt: 'skin minecraft masterchief com cabeça de capivara',
    description: 'Armadura Mjolnir Mark VI Spartan com cabeça fofa e orelhas 3D de capivara.',
    category: 'ia-destaques',
    icon: '🦫',
    badge: 'DESTAQUE IA'
  },
  {
    id: 'masterchief-spartan',
    name: 'Master Chief Spartan-117',
    prompt: 'master chief spartan 117 mjolnir armadura verde visor dourado',
    description: 'Armadura Spartan-117 clássica completa em verde militar com visor dourado reflexivo.',
    category: 'ia-destaques',
    icon: '🎖️'
  },
  {
    id: 'capivara-tropical',
    name: 'Capivara Tropicalia',
    prompt: 'capivara tropical com colar de flores havaianas e pelagem fofa',
    description: 'O mascote oficial do TropicaliaCraft com colar de hibiscos e pelagem em degradê.',
    category: 'tropicaliacraft',
    icon: '🌺',
    badge: 'POPULAR'
  },
  {
    id: 'capivara-terno',
    name: 'Don Capivara (De Terno)',
    prompt: 'capivara de terno smoking preto elegante com monóculo de ouro',
    description: 'Capivara refinada com smoking preto, gravata de seda vermelha e monóculo de ouro.',
    category: 'ia-destaques',
    icon: '🎩'
  },
  {
    id: 'samurai-diamante',
    name: 'Samurai de Diamante',
    prompt: 'samurai japonês com armadura de diamante katana e crista dourada',
    description: 'Armadura tradicional japonesa forjada com placas de diamante e crista solar.',
    category: 'tropicaliacraft',
    icon: '⚔️'
  },
  {
    id: 'astronauta-br',
    name: 'Astronauta Brasileiro',
    prompt: 'astronauta com traje espacial branco visor dourado e bandeira do brasil',
    description: 'Traje de exploração espacial com mochila de suporte vital e visor dourado.',
    category: 'ia-destaques',
    icon: '🚀'
  },
  {
    id: 'creeper-nobre',
    name: 'Creeper de Terno',
    prompt: 'creeper de smoking elegante cartola preta e gravata borboleta esmeralda',
    description: 'Creeper diplomata com smoking fino, cartola na camada 3D e gravata esmeralda.',
    category: 'classicos',
    icon: '💣'
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Runner',
    prompt: 'cyberpunk ninja com jaqueta neon ciano e mascara futurista',
    description: 'Jaqueta techwear estilizada com circuitos luminosos ciano e fone 3D.',
    category: 'tropicaliacraft',
    icon: '⚡'
  }
];

export const QUICK_AI_PROMPTS = [
  'skin minecraft masterchief com cabeça de capivara',
  'capivara guerreira com armadura de diamante e coroa',
  'samurai de netherite com máscara de dragão',
  'astronauta com capacete de vidro e mochila a jato',
  'creeper de smoking preto e óculos escuros',
  'mago arcano tropical com capuz de folhas brilhantes',
  'agente cibernético com jaqueta neon e fones de ouvido'
];
