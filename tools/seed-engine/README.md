# Seed Tool — engine (WASM)

Engine de geração de mundo usada pela página **/seed** (Seed Finder).

- `seedtool.c` — ponte em C: busca de seeds por condições (estruturas, biomas, fortalezas, bioma do spawn),
  mapa de biomas, estruturas numa área, spawn e slime chunks.
- Usa a biblioteca **[cubiomes](https://github.com/Cubitect/cubiomes)** (licença MIT, © Cubitect),
  commit `e61f905` — Java Edition até 1.21.4 (Winter Drop).
- `build.sh` baixa o cubiomes e gera `public/wasm/cubiomes.wasm` (~500 KB, ~200 KB com gzip).
  O arquivo gerado fica versionado, então o build do site **não** precisa do zig.

```sh
pip install ziglang
sh tools/seed-engine/build.sh
```

Wrapper TypeScript: `src/app/seed/engine/cubiomes.ts`.
