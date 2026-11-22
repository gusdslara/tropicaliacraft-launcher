#!/bin/sh
# Compila a engine do Seed Tool (cubiomes + seedtool.c) para public/wasm/cubiomes.wasm
# Requisitos: git, python3 e o zig via pip  ->  pip install ziglang
set -e
cd "$(dirname "$0")"
CUBIOMES_COMMIT=e61f905
if [ ! -d cubiomes ]; then
  git clone https://github.com/Cubitect/cubiomes.git cubiomes
  git -C cubiomes checkout "$CUBIOMES_COMMIT"
fi
CUB=./cubiomes
EXPORTS=$(grep -v '^#define' seedtool.c | grep -o 'EXPORT [^(]*(' | sed -E 's/.* \*?([a-z_0-9]+)\($/\1/' | sed 's/^/-Wl,--export=/' | tr '\n' ' ')
python3 -m ziglang cc -target wasm32-wasi -Oz -flto -I"$CUB" -mexec-model=reactor \
  -Wl,--export=_initialize $EXPORTS -Wl,--strip-all -Wno-everything \
  -o ../../public/wasm/cubiomes.wasm seedtool.c "$CUB"/generator.c "$CUB"/layers.c "$CUB"/biomenoise.c \
  "$CUB"/biomes.c "$CUB"/noise.c "$CUB"/finders.c "$CUB"/util.c
ls -la ../../public/wasm/cubiomes.wasm
