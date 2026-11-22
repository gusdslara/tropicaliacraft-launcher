// TropicaliaCraft Seed Tool — ponte WASM para a biblioteca cubiomes (MIT, Cubitect).
// Compilado com: zig cc -target wasm32-wasi -mexec-model=reactor (ver build.sh)
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "generator.h"
#include "finders.h"
#include "util.h"

#define EXPORT __attribute__((visibility("default")))

// ---------------------------------------------------------------- estado
static int g_mc = MC_1_21_WD;
static uint32_t g_flags = 0;
static Generator g_ov, g_ne;          // overworld / nether
static uint64_t g_seed = 0;
static int g_ov_ready = 0, g_ne_ready = 0;

static int *g_buf = NULL;  static size_t g_buf_len = 0;     // biomas
static int g_out[4096];                                      // posições (x,z,...)
static unsigned char g_bytes[256 * 256];                     // slime chunks
static unsigned char g_colors[256][3];
static int g_colors_init = 0;

static void ensure_ov(void) { if (!g_ov_ready) { applySeed(&g_ov, DIM_OVERWORLD, g_seed); g_ov_ready = 1; } }
static void ensure_ne(void) { if (!g_ne_ready) { applySeed(&g_ne, DIM_NETHER, g_seed); g_ne_ready = 1; } }


EXPORT void st_set_version(int mc, int large_biomes)
{
    g_mc = mc;
    g_flags = large_biomes ? LARGE_BIOMES : 0;
    setupGenerator(&g_ov, g_mc, g_flags);
    setupGenerator(&g_ne, g_mc, g_flags);
    g_ov_ready = g_ne_ready = 0;
}

EXPORT void st_set_seed(int64_t seed) { g_seed = (uint64_t)seed; g_ov_ready = g_ne_ready = 0; }

EXPORT int *st_out_ptr(void) { return g_out; }
EXPORT unsigned char *st_bytes_ptr(void) { return g_bytes; }

EXPORT const char *st_biome_name(int id) { const char *s = biome2str(g_mc, id); return s ? s : ""; }
EXPORT int st_biome_color(int id)
{
    if (!g_colors_init) { initBiomeColors(g_colors); g_colors_init = 1; }
    if (id < 0 || id > 255) return 0;
    return (g_colors[id][0] << 16) | (g_colors[id][1] << 8) | g_colors[id][2];
}

/** Gera biomas numa área (coordenadas na escala pedida: 1, 4, 16, 64 ou 256). */
EXPORT int *st_gen_area(int dim, int scale, int x, int z, int w, int h, int y)
{
    Generator *g;
    if (dim == DIM_NETHER) { ensure_ne(); g = &g_ne; } else { ensure_ov(); g = &g_ov; }
    Range r = { scale, x, z, w, h, y, 1 };
    size_t need = getMinCacheSize(g, scale, w, 1, h);
    if (need > g_buf_len) { free(g_buf); g_buf = (int *)malloc(need * sizeof(int)); g_buf_len = need; }
    if (!g_buf || genBiomes(g, g_buf, r)) return NULL;
    return g_buf;
}

EXPORT int st_biome_at(int dim, int x, int y, int z)
{
    Generator *g;
    if (dim == DIM_NETHER) { ensure_ne(); g = &g_ne; } else { ensure_ov(); g = &g_ov; }
    return getBiomeAt(g, 4, x >> 2, y >> 2, z >> 2);
}

static int viable(int stype, Generator *g, int x, int z)
{
    if (!isViableStructurePos(stype, g, x, z, 0)) return 0;
    if (g_mc >= MC_1_18 && (stype == Desert_Pyramid || stype == Jungle_Temple || stype == Mansion))
        if (!isViableStructureTerrain(stype, g, x, z)) return 0;
    return 1;
}

/** Estruturas viáveis num retângulo (blocos). Resultado em g_out como pares x,z. */
EXPORT int st_structs_in(int stype, int x0, int z0, int x1, int z1, int max)
{
    StructureConfig sc;
    if (!getStructureConfig(stype, g_mc, &sc)) return 0;
    Generator *g;
    if (sc.dim == DIM_NETHER) { ensure_ne(); g = &g_ne; } else if (sc.dim == DIM_OVERWORLD) { ensure_ov(); g = &g_ov; } else return 0;
    int reg = sc.regionSize * 16, n = 0;
    if (max > 2048) max = 2048;
    for (int rz = floordiv(z0, reg); rz <= floordiv(z1, reg); rz++)
        for (int rx = floordiv(x0, reg); rx <= floordiv(x1, reg); rx++)
        {
            Pos p;
            if (!getStructurePos(stype, g_mc, g_seed, rx, rz, &p)) continue;
            if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1) continue;
            if (!viable(stype, g, p.x, p.z)) continue;
            g_out[2 * n] = p.x; g_out[2 * n + 1] = p.z;
            if (++n >= max) return n;
        }
    return n;
}

EXPORT int st_strongholds(int count)
{
    ensure_ov();
    StrongholdIter sh;
    initFirstStronghold(&sh, g_mc, g_seed);
    int n = 0;
    if (count > 128) count = 128;
    while (n < count)
    {
        int more = nextStronghold(&sh, &g_ov);
        g_out[2 * n] = sh.pos.x; g_out[2 * n + 1] = sh.pos.z; n++;
        if (more <= 0) break;
    }
    return n;
}

EXPORT int st_spawn(void) { ensure_ov(); Pos p = getSpawn(&g_ov); g_out[0] = p.x; g_out[1] = p.z; return 1; }

/** Slime chunks numa área de chunks (w*h <= 65536). 1 = slime chunk. */
EXPORT int st_slime(int cx, int cz, int w, int h)
{
    if (w * h > (int)sizeof(g_bytes)) return 0;
    for (int j = 0; j < h; j++) for (int i = 0; i < w; i++)
        g_bytes[j * w + i] = (unsigned char)isSlimeChunk(g_seed, cx + i, cz + j);
    return 1;
}

// ================================================================ BUSCA
// Condições que o jogador escolhe. Distâncias são medidas a partir do spawn
// (no Nether: do spawn / 8). "raio" = distância máxima em blocos.
enum { C_STRUCT = 1, C_BIOME = 2, C_STRONGHOLD = 3 };
typedef struct { int kind, id, radius, variant, sx, sz, found; } Cond;
#define MAXC 24
static Cond g_conds[MAXC];
static int g_nconds = 0;
static int g_spawn_biome = -1;     // bioma exigido no spawn (-1 = qualquer)
static uint64_t g_rng = 0x9E3779B97F4A7C15ULL;
static int64_t g_res_seed = 0;
static int g_res_spawn[2];
static uint32_t g_checked = 0;

EXPORT void st_reset_conds(void) { g_nconds = 0; g_spawn_biome = -1; }
EXPORT void st_set_spawn_biome(int id) { g_spawn_biome = id; }
EXPORT int st_add_cond(int kind, int id, int radius, int variant)
{
    if (g_nconds >= MAXC) return 0;
    Cond c = { kind, id, radius, variant, 0, 0, 0 };
    g_conds[g_nconds++] = c;
    return 1;
}
EXPORT void st_seed_rng(int64_t s) { g_rng = (uint64_t)s ? (uint64_t)s : 0x9E3779B97F4A7C15ULL; }
EXPORT int64_t st_res_seed(void) { return g_res_seed; }
EXPORT int *st_res_spawn(void) { return g_res_spawn; }
EXPORT uint32_t st_checked(void) { return g_checked; }
/** Posição encontrada para a condição i (x,z em g_out). */
EXPORT int st_res_cond(int i) { if (i < 0 || i >= g_nconds) return 0; g_out[0] = g_conds[i].sx; g_out[1] = g_conds[i].sz; return g_conds[i].found; }

static uint64_t next64(void)
{   // splitmix64
    uint64_t z = (g_rng += 0x9E3779B97F4A7C15ULL);
    z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9ULL;
    z = (z ^ (z >> 27)) * 0x94D049BB133111EBULL;
    return z ^ (z >> 31);
}

static int village_variant_ok(Generator *g, int x, int z, int variant)
{
    if (!variant) return 1;
    int b = getBiomeAt(g, 4, x >> 2, 70 >> 2, z >> 2);
    switch (variant)
    {
    case 1: return b == plains || b == sunflower_plains || b == meadow;
    case 2: return b == desert;
    case 3: return b == savanna || b == savanna_plateau;
    case 4: return b == taiga || b == old_growth_spruce_taiga || b == old_growth_pine_taiga;
    case 5: return b == snowy_plains || b == snowy_taiga || b == snowy_tundra;
    }
    return 1;
}

static long long dist2(int ax, int az, int bx, int bz) { long long dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }

#define MAXCAND 64
typedef struct { int n; int x[MAXCAND], z[MAXCAND]; } Cands;
static Cands g_cands[MAXC];

/** Lista posições candidatas (sem checar bioma) a até r blocos de (cx,cz). */
static int struct_candidates(Cands *out, int stype, uint64_t seed, int cx, int cz, int r)
{
    StructureConfig sc;
    out->n = 0;
    if (!getStructureConfig(stype, g_mc, &sc)) return 0;
    int reg = sc.regionSize * 16;
    long long r2 = (long long)r * r;
    for (int rz = floordiv(cz - r, reg); rz <= floordiv(cz + r, reg); rz++)
        for (int rx = floordiv(cx - r, reg); rx <= floordiv(cx + r, reg); rx++)
        {
            Pos p;
            if (!getStructurePos(stype, g_mc, seed, rx, rz, &p)) continue;
            if (dist2(p.x, p.z, cx, cz) > r2) continue;
            if (out->n < MAXCAND) { out->x[out->n] = p.x; out->z[out->n] = p.z; out->n++; }
        }
    return out->n;
}

static int is_cave_biome(int id) { return id == deep_dark || id == lush_caves || id == dripstone_caves; }

static int check_seed(uint64_t seed)
{
    // Margem para a pré-checagem a partir de (0,0): o spawn quase sempre fica
    // a menos de ~300 blocos da origem.
    const int M = 320;
    g_seed = seed; g_ov_ready = g_ne_ready = 0;

    // 1) Pré-filtro barato: só a posição das estruturas (depende só da seed)
    for (int i = 0; i < g_nconds; i++)
    {
        Cond *c = &g_conds[i];
        if (c->kind != C_STRUCT) continue;
        StructureConfig sc;
        if (!getStructureConfig(c->id, g_mc, &sc)) return 0;
        int nether = sc.dim == DIM_NETHER;
        int r = c->radius + (nether ? M / 8 + 8 : M);
        if (!struct_candidates(&g_cands[i], c->id, seed, 0, 0, r)) return 0;
    }
    // Fortaleza (stronghold): posições aproximadas (±112) não dependem de bioma a partir da 1.19.3
    for (int i = 0; i < g_nconds; i++)
    {
        if (g_conds[i].kind != C_STRONGHOLD || g_mc < MC_1_19_4) continue;
        StrongholdIter sh; initFirstStronghold(&sh, g_mc, seed);
        long long lim = (long long)(g_conds[i].radius + M + 112);
        int ok = 0;
        for (int k = 0; k < 3 && !ok; k++)
        {
            if (dist2(sh.nextapprox.x, sh.nextapprox.z, 0, 0) <= lim * lim) ok = 1;
            nextStronghold(&sh, NULL);
        }
        if (!ok) return 0;
    }

    // 2) Biomas: valida as estruturas do Overworld (barato) antes do spawn (caro)
    ensure_ov();
    for (int i = 0; i < g_nconds; i++)
    {
        Cond *c = &g_conds[i];
        if (c->kind != C_STRUCT) continue;
        StructureConfig sc; getStructureConfig(c->id, g_mc, &sc);
        if (sc.dim != DIM_OVERWORLD) continue;
        Cands *cd = &g_cands[i]; int k = 0;
        for (int j = 0; j < cd->n; j++)
            if (viable(c->id, &g_ov, cd->x[j], cd->z[j]) &&
                (c->id != Village || village_variant_ok(&g_ov, cd->x[j], cd->z[j], c->variant)))
            { cd->x[k] = cd->x[j]; cd->z[k] = cd->z[j]; k++; }
        cd->n = k;
        if (!k) return 0;
    }

    // 3) Spawn e distâncias reais
    Pos sp = getSpawn(&g_ov);
    if (g_spawn_biome >= 0)
    {
        int b = getBiomeAt(&g_ov, 4, sp.x >> 2, 64 >> 2, sp.z >> 2);
        if (b != g_spawn_biome) return 0;
    }

    // Da checagem mais barata para a mais cara: estruturas, biomas, fortalezas
    static const int order[3] = { C_STRUCT, C_BIOME, C_STRONGHOLD };
    for (int pass = 0; pass < 3; pass++)
    for (int i = 0; i < g_nconds; i++)
    {
        Cond *c = &g_conds[i];
        if (c->kind != order[pass]) continue;
        c->found = 0;
        long long r2 = (long long)c->radius * c->radius, best = -1;
        if (c->kind == C_STRUCT)
        {
            StructureConfig sc; getStructureConfig(c->id, g_mc, &sc);
            int nether = sc.dim == DIM_NETHER;
            int ox = nether ? floordiv(sp.x, 8) : sp.x, oz = nether ? floordiv(sp.z, 8) : sp.z;
            Cands *cd = &g_cands[i];
            if (nether) ensure_ne();
            for (int j = 0; j < cd->n; j++)
            {
                long long d = dist2(cd->x[j], cd->z[j], ox, oz);
                if (d > r2 || (best >= 0 && d >= best)) continue;
                if (nether && !viable(c->id, &g_ne, cd->x[j], cd->z[j])) continue;
                best = d; c->sx = cd->x[j]; c->sz = cd->z[j];
            }
        }
        else if (c->kind == C_STRONGHOLD)
        {
            StrongholdIter sh; initFirstStronghold(&sh, g_mc, seed);
            for (int k = 0; k < 3; k++)
            {
                int more = nextStronghold(&sh, &g_ov);
                long long d = dist2(sh.pos.x, sh.pos.z, sp.x, sp.z);
                if (d <= r2 && (best < 0 || d < best)) { best = d; c->sx = sh.pos.x; c->sz = sh.pos.z; }
                if (more <= 0) break;
            }
        }
        else if (c->kind == C_BIOME)
        {
            int y = is_cave_biome(c->id) ? -48 : 64;
            int step = c->radius / 12; if (step < 32) step = 32;
            for (int dz = -c->radius; dz <= c->radius && best < 0; dz += step)
                for (int dx = -c->radius; dx <= c->radius; dx += step)
                {
                    long long d = (long long)dx * dx + (long long)dz * dz;
                    if (d > r2) continue;
                    int x = sp.x + dx, z = sp.z + dz;
                    if (getBiomeAt(&g_ov, 4, x >> 2, y >> 2, z >> 2) == c->id) { best = d; c->sx = x; c->sz = z; break; }
                }
        }
        if (best < 0) return 0;
        c->found = 1;
    }

    g_res_spawn[0] = sp.x; g_res_spawn[1] = sp.z;
    return 1;
}

/** Testa até 'tries' seeds aleatórias. Retorna 1 se achou (ver st_res_*). */
EXPORT int st_search(int tries)
{
    for (int t = 0; t < tries; t++)
    {
        uint64_t seed = next64();
        g_checked++;
        if (check_seed(seed)) { g_res_seed = (int64_t)seed; return 1; }
    }
    return 0;
}

/** Testa uma seed específica com as condições atuais. */
EXPORT int st_check(int64_t seed)
{
    if (check_seed((uint64_t)seed)) { g_res_seed = seed; return 1; }
    return 0;
}

EXPORT void *st_malloc(int n) { return malloc(n); }
EXPORT void st_free(void *p) { free(p); }
