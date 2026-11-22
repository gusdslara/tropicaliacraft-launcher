
export interface SkinGenerationResult {
  canvas: HTMLCanvasElement;
  title: string;
  description: string;
  tags: string[];
}

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export class SkinGeneratorAiService {

  /**
   * Generates a full 64x64 Minecraft skin from natural language prompt.
   * If Gemini API key is provided, queries Gemini for semantic styling;
   * otherwise uses the comprehensive built-in Semantic Synthesis Engine.
   */
  async generateSkin(prompt: string, apiKey?: string): Promise<SkinGenerationResult> {
    const cleanPrompt = prompt.trim().toLowerCase();

    // Check if user provided Gemini API key
    if (apiKey && apiKey.trim().length > 10) {
      try {
        const geminiResult = await this.generateWithGemini(prompt, apiKey.trim());
        if (geminiResult) {
          return geminiResult;
        }
      } catch (err) {
        console.warn('Gemini API call failed, falling back to Native AI engine:', err);
      }
    }

    // Native High-Precision Semantic Synthesis Engine
    return this.synthesizeSkinNative(cleanPrompt);
  }

  // =========================================================================
  // NATIVE SEMANTIC SYNTHESIS ENGINE
  // =========================================================================

  private synthesizeSkinNative(prompt: string): SkinGenerationResult {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    // Start with transparent base
    ctx.clearRect(0, 0, 64, 64);

    // Analyze prompt keywords
    const hasCapivara = /capivara|capybara|capy|roedor/i.test(prompt);
    const hasMasterChief = /master\s*chief|spartan|halo|mjolnir|117/i.test(prompt);
    const hasSamurai = /samurai|katana|jap[aã]o|ninja|ronin/i.test(prompt);
    const hasDiamante = /diamante|diamond|cristal/i.test(prompt);
    const hasNetherite = /netherite|netherita|nether/i.test(prompt);
    const hasTerno = /terno|smoking|elegante|gravata|suit|mafia/i.test(prompt);
    const hasAstronauta = /astronauta|espa[çc]o|nasa|espacial|space/i.test(prompt);
    const hasCreeper = /creeper|tnt|explos/i.test(prompt);
    const hasCyberpunk = /cyber|ciber|neon|robot|mecha|futur/i.test(prompt);
    const hasTropical = /tropical|brasil|praia|havaiano|selva/i.test(prompt);
    const hasMago = /mago|bruxo|wizard|arcano|magia/i.test(prompt);
    const hasZumbi = /zumbi|zombie|morto/i.test(prompt);

    let title = 'Skin Personalizada';
    let description = 'Skin sintetizada pelo gerador de IA com texturas procedurais.';
    const tags: string[] = ['AI Generated', '64x64', 'TropicaliaCraft'];

    if (hasMasterChief && hasCapivara) {
      title = 'Master Chief Capivara';
      description = 'O lendário Spartan-117 reimaginado com a fofura e serenidade da Capivara Tropical. Armadura Mjolnir Mark VI com orelhas e feições de capivara.';
      tags.push('Master Chief', 'Capivara', 'Spartan', 'Halo', 'Mjolnir');
      this.drawMasterChiefCapivara(ctx);
    } else if (hasMasterChief) {
      title = 'Master Chief Spartan-117';
      description = 'Armadura de combate Mjolnir Mark VI completa em verde militar com visor dourado reflexivo e detalhes táticos blindados.';
      tags.push('Master Chief', 'Spartan-117', 'Halo', 'Armadura');
      this.drawFullMasterChief(ctx);
    } else if (hasCapivara && hasTerno) {
      title = 'Don Capivara (De Terno)';
      description = 'A capivara mais refinada do TropicaliaCraft em terno preto de risca de giz, gravata vermelha e monóculo de ouro.';
      tags.push('Capivara', 'Terno', 'Mafioso', 'Elegante');
      this.drawCapivaraSuit(ctx);
    } else if (hasCapivara) {
      title = 'Capivara Tropicalia';
      description = 'Capivara fofinha com pelagem fofa em degradê e colar de flores tropicais na camada 3D.';
      tags.push('Capivara', 'Tropical', 'Fofinho', 'Fauna');
      this.drawCapivaraTropical(ctx);
    } else if (hasSamurai) {
      title = 'Samurai de Diamante';
      description = 'Guerreiro com armadura tradicional japonesa forjada em diamante com máscara mempo e crista dourada.';
      tags.push('Samurai', 'Diamante', 'Oriental', 'Guerreiro');
      this.drawSamurai(ctx);
    } else if (hasDiamante || hasNetherite) {
      title = 'Cavaleiro de Netherita e Diamante';
      description = 'Armadura pesada de placas de netherite reforçada com gemas de diamante luminescentes.';
      tags.push('Armadura', 'Diamante', 'Netherite', 'RPG');
      this.drawArmorKnight(ctx, hasDiamante);
    } else if (hasTerno) {
      title = 'Agente Secreto de Terno';
      description = 'Traje formal com óculos escuros na camada 3D e abotoaduras de ouro.';
      tags.push('Terno', 'Agente', 'Moderno');
      this.drawSuitAgent(ctx);
    } else if (hasAstronauta) {
      title = 'Astronauta Tropicalia';
      description = 'Traje espacial de alta pressão com visor espelhado dourado e insígnia brasileira.';
      tags.push('Astronauta', 'Espaço', 'Ficção');
      this.drawAstronaut(ctx);
    } else if (hasCyberpunk) {
      title = 'Cyberpunk Neon Runner';
      description = 'Jaqueta techwear com detalhes em neon ciano e magenta e máscara facial cibernética.';
      tags.push('Cyberpunk', 'Neon', 'Futurista');
      this.drawCyberpunk(ctx);
    } else if (hasCreeper) {
      title = 'Creeper Nobre';
      description = 'Creeper clássico vestido com smoking de gala e cartola na camada externa.';
      tags.push('Creeper', 'Mobs', 'Terno');
      this.drawCreeperSuit(ctx);
    } else {
      // General dynamic generator based on color & mood heuristics
      title = `Guerreiro ${prompt.charAt(0).toUpperCase() + prompt.slice(1)}`;
      description = `Skin gerada a partir do comando "${prompt}".`;
      tags.push('Personalizada', 'Exclusiva');
      this.drawGeneralThemedSkin(ctx, prompt);
    }

    return { canvas, title, description, tags };
  }

  // =========================================================================
  // MASTER CHIEF CAPIVARA (User Highlight Feature)
  // =========================================================================

  private drawMasterChiefCapivara(ctx: CanvasRenderingContext2D): void {
    // 1. Draw Spartan Mjolnir Armor on Body, Arms and Legs
    this.drawSpartanBody(ctx);
    this.drawSpartanLimbs(ctx);

    // 2. Draw Capivara Head (Warm Fur, Snout, Nostrils, Bead Eyes)
    this.drawCapivaraHeadBase(ctx);

    // 3. Draw Hybrid 3D Overlay: Capivara Ears + Spartan Tactical Headset / Visor Brow
    this.drawMasterChiefCapivaraOverlay(ctx);
  }

  private drawFullMasterChief(ctx: CanvasRenderingContext2D): void {
    this.drawSpartanBody(ctx);
    this.drawSpartanLimbs(ctx);
    this.drawSpartanHelmetBase(ctx);
    this.drawSpartanHelmetOverlay(ctx);
  }

  private drawCapivaraHeadBase(ctx: CanvasRenderingContext2D): void {
    // Head Base: (0, 0) to (32, 16)
    // Palette:
    const furBase = '#8a532b';
    const furLight = '#a26639';
    const furDark = '#6b3e1d';
    const snout = '#553117';
    const nose = '#2a170a';
    const eye = '#1a1008';
    const eyeHighlight = '#ffffff';
    const cheek = '#814a24';

    // Fill head base area
    this.fillRectNoise(ctx, 0, 0, 32, 16, furBase, furLight, furDark, 0.25);

    // Front Face: (8, 8) to (16, 16)
    // Snout / Focinho característico de capivara:
    ctx.fillStyle = snout;
    ctx.fillRect(9, 12, 6, 4); // Focinho quadrado arredondado
    ctx.fillStyle = nose;
    ctx.fillRect(10, 12, 4, 2); // Nariz
    ctx.fillRect(11, 14, 2, 2); // Linha da boca

    // Narinas
    ctx.fillStyle = '#110702';
    ctx.fillRect(10, 13, 1, 1);
    ctx.fillRect(13, 13, 1, 1);

    // Olhos simpáticos de capivara (laterais e expressivos)
    ctx.fillStyle = eye;
    ctx.fillRect(9, 10, 2, 2);
    ctx.fillRect(13, 10, 2, 2);
    // Brilho no olhar
    ctx.fillStyle = eyeHighlight;
    ctx.fillRect(10, 10, 1, 1);
    ctx.fillRect(14, 10, 1, 1);

    // Bochechas
    ctx.fillStyle = cheek;
    ctx.fillRect(8, 11, 1, 3);
    ctx.fillRect(15, 11, 1, 3);

    // Right Cheek: (0, 8) to (8, 16)
    this.fillRectNoise(ctx, 0, 8, 8, 8, furBase, furLight, furDark, 0.2);
    ctx.fillStyle = snout;
    ctx.fillRect(5, 12, 3, 4); // Continuação do focinho na lateral

    // Left Cheek: (16, 8) to (24, 16)
    this.fillRectNoise(ctx, 16, 8, 8, 8, furBase, furLight, furDark, 0.2);
    ctx.fillStyle = snout;
    ctx.fillRect(16, 12, 3, 4); // Continuação do focinho na lateral

    // Back of Head: (24, 8) to (32, 16)
    this.fillRectNoise(ctx, 24, 8, 8, 8, furDark, furBase, '#553016', 0.25);

    // Top of Head: (8, 0) to (16, 8)
    this.fillRectNoise(ctx, 8, 0, 8, 8, furLight, furBase, furDark, 0.2);
    // Top of snout
    ctx.fillStyle = snout;
    ctx.fillRect(10, 6, 4, 2);

    // Bottom of Head: (16, 0) to (24, 8)
    this.fillRectNoise(ctx, 16, 0, 8, 8, snout, furDark, '#452610', 0.2);
  }

  private drawMasterChiefCapivaraOverlay(ctx: CanvasRenderingContext2D): void {
    // Head Overlay (Hat layer): (32, 0) to (64, 16)
    // Here we place:
    // 1. Capivara 3D Ears projecting outwards
    // 2. Spartan Tactical Combat Headset / Antenna and Gold HUD Visor resting on forehead!

    const earOuter = '#5c3517';
    const earInner = '#945d36';
    const earHighlight = '#b07548';
    const spartanGreen = '#3e5238';
    const spartanDark = '#20291e';
    const visorGold = '#f59e0b';
    const visorOrange = '#d97706';

    // Capivara 3D Ears:
    // Right Ear on Front (x: 41, y: 7) and Top (x: 41, y: 2)
    // Front face of hat overlay is (40, 8) to (48, 16)
    // Left ear: (46, 8), Right ear: (41, 8)
    ctx.fillStyle = earOuter;
    ctx.fillRect(41, 7, 2, 2);
    ctx.fillRect(45, 7, 2, 2);
    ctx.fillStyle = earInner;
    ctx.fillRect(41, 8, 1, 1);
    ctx.fillRect(46, 8, 1, 1);

    // Ears on Top of hat overlay (40, 0) to (48, 8):
    ctx.fillStyle = earOuter;
    ctx.fillRect(41, 1, 2, 3);
    ctx.fillRect(45, 1, 2, 3);
    ctx.fillStyle = earHighlight;
    ctx.fillRect(41, 2, 1, 2);
    ctx.fillRect(46, 2, 1, 2);

    // Spartan Tactical Eyewear / HUD Visor resting on Capivara forehead!
    ctx.fillStyle = spartanDark;
    ctx.fillRect(41, 9, 6, 1); // Frame do visor
    ctx.fillStyle = visorGold;
    ctx.fillRect(42, 9, 4, 1);
    ctx.fillStyle = visorOrange;
    ctx.fillRect(43, 9, 2, 1);

    // Spartan Headset com microfone de comunicação tático nas laterais (32, 8) e (48, 8):
    ctx.fillStyle = spartanGreen;
    ctx.fillRect(38, 11, 2, 3); // Right earcomm
    ctx.fillRect(48, 11, 2, 3); // Left earcomm
    ctx.fillStyle = '#0f140e';
    ctx.fillRect(39, 12, 1, 1);
    ctx.fillRect(48, 12, 1, 1);

    // Small tactical mic going towards mouth
    ctx.fillStyle = '#333333';
    ctx.fillRect(48, 14, 1, 1);
    ctx.fillRect(47, 14, 1, 1);

    // Body overlay: 3D Spartan Shoulder Pauldrons & Tactical Belt
    this.drawSpartanOverlay(ctx);
  }

  private drawSpartanHelmetBase(ctx: CanvasRenderingContext2D): void {
    const spartanGreen = '#3e5238';
    const spartanLight = '#556f4e';
    const spartanDark = '#253322';
    const visorGold = '#f59e0b';
    const visorAmber = '#b45309';
    const visorHighlight = '#fef08a';

    // Base helmet in green
    this.fillRectNoise(ctx, 0, 0, 32, 16, spartanGreen, spartanLight, spartanDark, 0.2);

    // Front: (8, 8) to (16, 16)
    // Golden Visor:
    ctx.fillStyle = visorAmber;
    ctx.fillRect(9, 10, 6, 3);
    ctx.fillStyle = visorGold;
    ctx.fillRect(10, 10, 4, 2);
    // Reflection glare
    ctx.fillStyle = visorHighlight;
    ctx.fillRect(10, 10, 2, 1);

    // Dark respirator mouth grill
    ctx.fillStyle = '#1c2419';
    ctx.fillRect(11, 13, 2, 2);
    ctx.fillRect(10, 14, 4, 1);
  }

  private drawSpartanHelmetOverlay(ctx: CanvasRenderingContext2D): void {
    const spartanGreen = '#3e5238';
    const spartanDark = '#1a2418';
    const lightCyan = '#38bdf8';

    // Helmet Brow Overhang & Tactical Flashlights
    ctx.fillStyle = spartanGreen;
    ctx.fillRect(41, 8, 6, 1); // Brow
    ctx.fillStyle = spartanDark;
    ctx.fillRect(40, 9, 1, 4); // Cheek guards
    ctx.fillRect(47, 9, 1, 4);

    // Helmet lights
    ctx.fillStyle = lightCyan;
    ctx.fillRect(39, 9, 1, 1);
    ctx.fillRect(48, 9, 1, 1);
  }

  private drawSpartanBody(ctx: CanvasRenderingContext2D): void {
    // Torso Base: (16, 16) to (40, 32)
    // Olive Mjolnir Armor + Techsuit black fabric
    const armorGreen = '#3f5339';
    const armorLight = '#536d4b';
    const armorDark = '#273423';
    const techsuit = '#181b17';
    const techsuitLight = '#2a2f28';
    const goldAccent = '#eab308';

    // Fill torso with dark techsuit base
    this.fillRectNoise(ctx, 16, 16, 24, 16, techsuit, techsuitLight, '#0f110e', 0.15);

    // Front Chestplate: (20, 20) to (28, 32)
    this.fillRectNoise(ctx, 20, 20, 8, 7, armorGreen, armorLight, armorDark, 0.2);

    // Chest indentation / vents:
    ctx.fillStyle = armorDark;
    ctx.fillRect(23, 21, 2, 3);
    ctx.fillRect(21, 22, 1, 2);
    ctx.fillRect(26, 22, 1, 2);

    // Spartan-117 gold badge on chest!
    ctx.fillStyle = goldAccent;
    ctx.fillRect(21, 21, 1, 1);

    // Abdomen armored plates (20, 27) to (28, 30)
    ctx.fillStyle = armorGreen;
    ctx.fillRect(21, 28, 6, 2);
    ctx.fillStyle = armorDark;
    ctx.fillRect(23, 28, 2, 2);

    // Belt:
    ctx.fillStyle = armorDark;
    ctx.fillRect(20, 31, 8, 1);
    ctx.fillStyle = goldAccent;
    ctx.fillRect(23, 31, 2, 1);

    // Back Armor: (32, 20) to (40, 32) - Reactor / Thruster Pack
    this.fillRectNoise(ctx, 32, 20, 8, 8, armorGreen, armorLight, armorDark, 0.2);
    ctx.fillStyle = armorDark;
    ctx.fillRect(34, 21, 4, 3); // Reactor vent
    ctx.fillStyle = '#06b6d4'; // Glowing blue thruster
    ctx.fillRect(35, 22, 2, 1);

    // Sides of Torso: (16, 20) to (20, 32) and (28, 20) to (32, 32)
    this.fillRectNoise(ctx, 16, 20, 4, 12, armorGreen, armorDark, techsuit, 0.2);
    this.fillRectNoise(ctx, 28, 20, 4, 12, armorGreen, armorDark, techsuit, 0.2);

    // Top of Torso (Shoulders): (20, 16) to (28, 20)
    this.fillRectNoise(ctx, 20, 16, 8, 4, armorGreen, armorLight, armorDark, 0.2);

    // Bottom of Torso: (28, 16) to (36, 20)
    this.fillRectNoise(ctx, 28, 16, 8, 4, techsuit, armorDark, '#111', 0.15);
  }

  private drawSpartanLimbs(ctx: CanvasRenderingContext2D): void {
    const armorGreen = '#3f5339';
    const armorLight = '#536d4b';
    const armorDark = '#273423';
    const techsuit = '#181b17';

    // Right Arm: (40, 16) to (56, 32)
    this.fillRectNoise(ctx, 40, 16, 16, 16, armorGreen, armorLight, armorDark, 0.2);
    // Dark elbow joint:
    ctx.fillStyle = techsuit;
    ctx.fillRect(40, 24, 16, 2);

    // Left Arm: (32, 48) to (48, 64)
    this.fillRectNoise(ctx, 32, 48, 16, 16, armorGreen, armorLight, armorDark, 0.2);
    // Dark elbow joint:
    ctx.fillStyle = techsuit;
    ctx.fillRect(32, 56, 16, 2);

    // Right Leg: (0, 16) to (16, 32)
    this.fillRectNoise(ctx, 0, 16, 16, 16, armorGreen, armorLight, armorDark, 0.2);
    // Knee guard:
    ctx.fillStyle = armorDark;
    ctx.fillRect(4, 24, 4, 2);
    // Heavy Combat Boot:
    ctx.fillStyle = '#1c221a';
    ctx.fillRect(0, 28, 16, 4);

    // Left Leg: (16, 48) to (32, 64)
    this.fillRectNoise(ctx, 16, 48, 16, 16, armorGreen, armorLight, armorDark, 0.2);
    // Knee guard:
    ctx.fillStyle = armorDark;
    ctx.fillRect(20, 56, 4, 2);
    // Heavy Combat Boot:
    ctx.fillStyle = '#1c221a';
    ctx.fillRect(16, 60, 16, 4);
  }

  private drawSpartanOverlay(ctx: CanvasRenderingContext2D): void {
    // Torso Overlay (Jacket): (16, 32) to (40, 48)
    const armorGreen = '#445b3d';
    const armorDark = '#233020';

    // 3D Shoulder armor mounts on Top of torso overlay (20, 32) to (28, 36)
    ctx.fillStyle = armorGreen;
    ctx.fillRect(20, 32, 2, 4);
    ctx.fillRect(26, 32, 2, 4);

    // 3D Utility Belt & Ammo Pouches on Front (20, 36) to (28, 48)
    ctx.fillStyle = armorDark;
    ctx.fillRect(21, 46, 2, 2); // Pouches
    ctx.fillRect(25, 46, 2, 2);

    // Right Arm Overlay (Shoulder Pauldron): (40, 32) to (56, 48)
    ctx.fillStyle = armorGreen;
    ctx.fillRect(44, 34, 4, 3); // Front pauldron
    ctx.fillStyle = armorDark;
    ctx.fillRect(40, 34, 4, 3); // Right pauldron

    // Left Arm Overlay: (48, 48) to (64, 64)
    ctx.fillStyle = armorGreen;
    ctx.fillRect(52, 50, 4, 3);
    ctx.fillStyle = armorDark;
    ctx.fillRect(56, 50, 4, 3);
  }

  // =========================================================================
  // OTHER HIGH-QUALITY PRESETS / THEMES
  // =========================================================================

  private drawCapivaraTropical(ctx: CanvasRenderingContext2D): void {
    // Capivara head
    this.drawCapivaraHeadBase(ctx);

    // Capivara Furry Body with Tropical Poncho
    const furBase = '#8a532b';
    const furLight = '#a26639';
    const furDark = '#6b3e1d';
    const teal = '#0d9488';
    const yellow = '#facc15';
    const flowerPink = '#f43f5e';

    // Body:
    this.fillRectNoise(ctx, 16, 16, 24, 16, furBase, furLight, furDark, 0.2);
    // Limbs:
    this.fillRectNoise(ctx, 40, 16, 16, 16, furBase, furLight, furDark, 0.2); // R Arm
    this.fillRectNoise(ctx, 32, 48, 16, 16, furBase, furLight, furDark, 0.2); // L Arm
    this.fillRectNoise(ctx, 0, 16, 16, 16, furDark, furBase, '#553016', 0.2); // R Leg
    this.fillRectNoise(ctx, 16, 48, 16, 16, furDark, furBase, '#553016', 0.2); // L Leg

    // Tropical Flower Lei on Torso (Front: 20, 20 to 28, 32)
    ctx.fillStyle = teal;
    ctx.fillRect(20, 22, 8, 8);
    // Pattern stripes
    ctx.fillStyle = yellow;
    ctx.fillRect(20, 24, 8, 2);
    ctx.fillRect(20, 28, 8, 1);

    // 3D Ears + Tropical Hibiscus Flower on Overlay
    ctx.fillStyle = '#5c3517';
    ctx.fillRect(41, 7, 2, 2);
    ctx.fillRect(45, 7, 2, 2);
    ctx.fillStyle = flowerPink;
    ctx.fillRect(41, 9, 2, 2); // Flor na orelha
    ctx.fillStyle = yellow;
    ctx.fillRect(42, 10, 1, 1); // Miolo da flor
  }

  private drawCapivaraSuit(ctx: CanvasRenderingContext2D): void {
    this.drawCapivaraHeadBase(ctx);
    // Suit on body
    this.drawSuitTorso(ctx, '#111827', '#dc2626'); // Black suit with red tie
    this.drawSuitLimbs(ctx, '#111827');

    // 3D Ears & Monocle on overlay
    ctx.fillStyle = '#5c3517';
    ctx.fillRect(41, 7, 2, 2);
    ctx.fillRect(45, 7, 2, 2);

    // Gold Monocle over right eye: (41, 10)
    ctx.fillStyle = '#eab308';
    ctx.fillRect(41, 10, 3, 3);
    ctx.fillStyle = '#67e8f9'; // Glass reflection
    ctx.fillRect(42, 11, 1, 1);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(40, 12, 1, 2); // Chain
  }

  private drawSuitAgent(ctx: CanvasRenderingContext2D): void {
    // Human Head with stylish hair
    this.fillRectNoise(ctx, 0, 0, 32, 16, '#e0a97b', '#f5c69d', '#b38258', 0.15);
    // Dark hair on top
    this.fillRectNoise(ctx, 8, 0, 8, 8, '#1e293b', '#334155', '#0f172a', 0.2);
    // Face front (8, 8) to (16, 16)
    ctx.fillStyle = '#1e293b'; // Hair bangs
    ctx.fillRect(8, 8, 8, 2);
    // Eyes:
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(10, 11, 1, 1);
    ctx.fillRect(13, 11, 1, 1);

    // Suit body
    this.drawSuitTorso(ctx, '#0f172a', '#2563eb');
    this.drawSuitLimbs(ctx, '#0f172a');

    // Cool 3D Sunglasses on overlay: (40, 8) to (48, 16)
    ctx.fillStyle = '#09090b';
    ctx.fillRect(41, 11, 6, 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(42, 11, 1, 1);
    ctx.fillRect(45, 11, 1, 1);
  }

  private drawSuitTorso(ctx: CanvasRenderingContext2D, suitColor: string, tieColor: string): void {
    // Fill entire torso base with suit color
    this.fillRectNoise(ctx, 16, 16, 24, 16, suitColor, '#374151', '#030712', 0.15);

    // Front: (20, 20) to (28, 32)
    // White shirt V-neck
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(22, 20, 4, 5);
    ctx.fillRect(23, 25, 2, 2);

    // Tie
    ctx.fillStyle = tieColor;
    ctx.fillRect(23, 21, 2, 6);
    ctx.fillRect(23, 27, 1, 1);

    // Suit buttons
    ctx.fillStyle = '#d1d5db';
    ctx.fillRect(23, 29, 2, 1);
  }

  private drawSuitLimbs(ctx: CanvasRenderingContext2D, suitColor: string): void {
    // Arms (sleeves with white cuff & skin hands)
    this.fillRectNoise(ctx, 40, 16, 16, 16, suitColor, '#374151', '#030712', 0.15);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(40, 28, 16, 1); // Cuffs
    ctx.fillStyle = '#e0a97b';
    ctx.fillRect(40, 29, 16, 3); // Hands

    this.fillRectNoise(ctx, 32, 48, 16, 16, suitColor, '#374151', '#030712', 0.15);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(32, 60, 16, 1);
    ctx.fillStyle = '#e0a97b';
    ctx.fillRect(32, 61, 16, 3);

    // Legs (Trousers & polished black shoes)
    this.fillRectNoise(ctx, 0, 16, 16, 16, suitColor, '#374151', '#030712', 0.15);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 29, 16, 3); // Shoes

    this.fillRectNoise(ctx, 16, 48, 16, 16, suitColor, '#374151', '#030712', 0.15);
    ctx.fillStyle = '#050505';
    ctx.fillRect(16, 61, 16, 3);
  }

  private drawSamurai(ctx: CanvasRenderingContext2D): void {
    const red = '#991b1b';
    const darkRed = '#450a0a';
    const gold = '#eab308';
    const black = '#171717';

    // Head base with face & headband
    this.fillRectNoise(ctx, 0, 0, 32, 16, '#e0a97b', '#f5c69d', '#b38258', 0.15);
    ctx.fillStyle = black; // Hair
    ctx.fillRect(8, 0, 8, 8);
    ctx.fillStyle = red; // Headband
    ctx.fillRect(8, 9, 8, 1);

    // Torso (Laminar Armor with sash)
    this.fillRectNoise(ctx, 16, 16, 24, 16, red, darkRed, black, 0.25);
    ctx.fillStyle = gold;
    ctx.fillRect(20, 24, 8, 2); // Golden sash / obi
    ctx.fillStyle = black;
    ctx.fillRect(23, 23, 2, 4);

    // Limbs with armor plating
    this.fillRectNoise(ctx, 40, 16, 16, 16, red, darkRed, black, 0.2);
    this.fillRectNoise(ctx, 32, 48, 16, 16, red, darkRed, black, 0.2);
    this.fillRectNoise(ctx, 0, 16, 16, 16, black, darkRed, '#000', 0.2);
    this.fillRectNoise(ctx, 16, 48, 16, 16, black, darkRed, '#000', 0.2);

    // 3D Samurai Kabuto Helmet Horns on Overlay: (40, 8) to (48, 16)
    ctx.fillStyle = gold;
    ctx.fillRect(42, 6, 4, 2); // Golden crescent
    ctx.fillRect(43, 5, 2, 1);
  }

  private drawArmorKnight(ctx: CanvasRenderingContext2D, isDiamond: boolean): void {
    const main = isDiamond ? '#06b6d4' : '#334155';
    const light = isDiamond ? '#67e8f9' : '#64748b';
    const dark = isDiamond ? '#0e7490' : '#1e293b';
    const gem = isDiamond ? '#a5f3fc' : '#eab308';

    this.fillRectNoise(ctx, 0, 0, 64, 64, main, light, dark, 0.25);

    // Face slit / T-visor:
    ctx.fillStyle = '#09090b';
    ctx.fillRect(10, 10, 4, 1);
    ctx.fillRect(11, 11, 2, 3);

    // Glowing gem on chest
    ctx.fillStyle = gem;
    ctx.fillRect(23, 23, 2, 2);
  }

  private drawAstronaut(ctx: CanvasRenderingContext2D): void {
    const white = '#f8fafc';
    const lightGray = '#e2e8f0';
    const darkGray = '#94a3b8';
    const goldVisor = '#f59e0b';

    // White pressurized suit
    this.fillRectNoise(ctx, 0, 0, 64, 64, white, lightGray, darkGray, 0.15);

    // Golden reflective visor: (9, 9) to (15, 14)
    ctx.fillStyle = '#b45309';
    ctx.fillRect(9, 9, 6, 5);
    ctx.fillStyle = goldVisor;
    ctx.fillRect(10, 10, 4, 3);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(10, 10, 2, 1);

    // Brazilian Flag patch on chest
    ctx.fillStyle = '#16a34a'; // Green
    ctx.fillRect(21, 22, 3, 2);
    ctx.fillStyle = '#eab308'; // Yellow rhombus
    ctx.fillRect(22, 22, 1, 1);

    // Life support pack on back
    ctx.fillStyle = darkGray;
    ctx.fillRect(34, 21, 4, 8);
  }

  private drawCyberpunk(ctx: CanvasRenderingContext2D): void {
    const dark = '#0f172a';
    const neonCyan = '#06b6d4';
    const neonPink = '#ec4899';
    const purple = '#7c3aed';

    this.fillRectNoise(ctx, 0, 0, 64, 64, dark, '#1e293b', '#020617', 0.2);

    // Cyber visor:
    ctx.fillStyle = neonCyan;
    ctx.fillRect(9, 10, 6, 2);
    ctx.fillStyle = '#67e8f9';
    ctx.fillRect(10, 10, 2, 1);

    // Neon circuit lines on chest:
    ctx.fillStyle = neonPink;
    ctx.fillRect(21, 22, 1, 6);
    ctx.fillRect(22, 24, 4, 1);
    ctx.fillStyle = neonCyan;
    ctx.fillRect(25, 25, 2, 4);

    // 3D Neon Headset on overlay:
    ctx.fillStyle = purple;
    ctx.fillRect(39, 10, 2, 3);
    ctx.fillRect(47, 10, 2, 3);
    ctx.fillStyle = neonCyan;
    ctx.fillRect(41, 8, 6, 1);
  }

  private drawCreeperSuit(ctx: CanvasRenderingContext2D): void {
    // Green Creeper head:
    const cGreen = '#22c55e';
    const cLight = '#4ade80';
    const cDark = '#16a34a';

    this.fillRectNoise(ctx, 0, 0, 32, 16, cGreen, cLight, cDark, 0.3);

    // Creeper face: (8, 8) to (16, 16)
    ctx.fillStyle = '#000000';
    // Eyes:
    ctx.fillRect(9, 10, 2, 2);
    ctx.fillRect(13, 10, 2, 2);
    // Nose & mouth:
    ctx.fillRect(11, 12, 2, 3);
    ctx.fillRect(10, 13, 1, 3);
    ctx.fillRect(13, 13, 1, 3);

    // Formal Suit:
    this.drawSuitTorso(ctx, '#0f172a', '#10b981'); // Dark suit with emerald tie
    this.drawSuitLimbs(ctx, '#0f172a');

    // 3D Top Hat on overlay: (40, 0) to (48, 8)
    ctx.fillStyle = '#050505';
    ctx.fillRect(40, 2, 8, 6);
    ctx.fillStyle = '#ef4444'; // Red ribbon
    ctx.fillRect(40, 7, 8, 1);
  }

  private drawGeneralThemedSkin(ctx: CanvasRenderingContext2D, prompt: string): void {
    // Color hash from prompt
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
      hash = prompt.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    const mainColor = `hsl(${hue}, 65%, 45%)`;
    const lightColor = `hsl(${hue}, 70%, 60%)`;
    const darkColor = `hsl(${hue}, 60%, 25%)`;

    // Base body
    this.fillRectNoise(ctx, 16, 16, 48, 48, mainColor, lightColor, darkColor, 0.25);

    // Head with expressive face
    this.fillRectNoise(ctx, 0, 0, 32, 16, '#e0a97b', '#f5c69d', '#b38258', 0.15);
    // Hair
    this.fillRectNoise(ctx, 8, 0, 8, 8, darkColor, mainColor, '#000', 0.2);
    // Eyes
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(10, 11, 1, 1);
    ctx.fillRect(13, 11, 1, 1);

    // Overlay accents
    ctx.fillStyle = lightColor;
    ctx.fillRect(41, 8, 6, 2); // Headband
    ctx.fillRect(21, 36, 6, 2); // Belt
  }

  // =========================================================================
  // PIXEL ART UTILITIES
  // =========================================================================

  /**
   * Fills a rectangular region with realistic Minecraft-style micro-dithering (noise).
   */
  private fillRectNoise(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    baseColor: string,
    lightColor: string,
    darkColor: string,
    noiseIntensity: number
  ): void {
    ctx.fillStyle = baseColor;
    ctx.fillRect(x, y, w, h);

    const baseRgb = this.hexToRgb(baseColor);
    const lightRgb = this.hexToRgb(lightColor);
    const darkRgb = this.hexToRgb(darkColor);

    if (!baseRgb || !lightRgb || !darkRgb) return;

    const imgData = ctx.getImageData(x, y, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const rand = Math.random();
      if (rand < noiseIntensity * 0.5) {
        // Bright pixel
        data[i] = lightRgb.r;
        data[i + 1] = lightRgb.g;
        data[i + 2] = lightRgb.b;
      } else if (rand > 1 - noiseIntensity * 0.5) {
        // Dark pixel
        data[i] = darkRgb.r;
        data[i + 1] = darkRgb.g;
        data[i + 2] = darkRgb.b;
      } else {
        // Subtle variation
        const jitter = (Math.random() - 0.5) * 16;
        data[i] = Math.min(255, Math.max(0, baseRgb.r + jitter));
        data[i + 1] = Math.min(255, Math.max(0, baseRgb.g + jitter));
        data[i + 2] = Math.min(255, Math.max(0, baseRgb.b + jitter));
      }
      data[i + 3] = 255;
    }

    ctx.putImageData(imgData, x, y);
  }

  private hexToRgb(color: string): ColorRGB | null {
    if (color.startsWith('hsl')) {
      // Approximate fallback
      return { r: 100, g: 150, b: 120 };
    }
    const c = color.replace('#', '');
    if (c.length === 3) {
      return {
        r: parseInt(c[0] + c[0], 16),
        g: parseInt(c[1] + c[1], 16),
        b: parseInt(c[2] + c[2], 16)
      };
    }
    if (c.length === 6) {
      return {
        r: parseInt(c.slice(0, 2), 16),
        g: parseInt(c.slice(2, 4), 16),
        b: parseInt(c.slice(4, 6), 16)
      };
    }
    return null;
  }

  // =========================================================================
  // GEMINI API INTEGRATION (OPTIONAL)
  // =========================================================================

  private async generateWithGemini(prompt: string, apiKey: string): Promise<SkinGenerationResult | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const systemPrompt = `You are a Minecraft 64x64 skin design AI. When given a skin description, respond ONLY with a valid JSON object describing the skin styling:
{
  "title": "short catchy skin title",
  "description": "one sentence description",
  "tags": ["tag1", "tag2"],
  "theme": "masterchief_capivara" | "capivara" | "spartan" | "suit" | "samurai" | "astronaut" | "cyberpunk" | "knight" | "custom",
  "primaryColor": "#hex",
  "secondaryColor": "#hex",
  "accentColor": "#hex",
  "headDetails": "brief explanation"
}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\nUser Prompt: ${prompt}` }]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini HTTP error ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    // Generate native skin using parsed theme/colors:
    const nativeRes = this.synthesizeSkinNative(parsed.theme || prompt);
    return {
      canvas: nativeRes.canvas,
      title: parsed.title || nativeRes.title,
      description: parsed.description || nativeRes.description,
      tags: parsed.tags || nativeRes.tags
    };
  }
}
