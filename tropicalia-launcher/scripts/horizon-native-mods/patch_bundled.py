"""Leave only smartf3 in the Android hand-bundle: zoom, minimap and recipes now come from the real
native mods (horizon-mixins), on every platform."""
import io, re, sys

root = sys.argv[1]
p = root + '/crates/horizon-client/src/game/android_bundled.rs'
s = io.open(p, encoding='utf-8').read()

# 1. module declarations of zoom/minimap/recipes (each is a cfg line + path line + mod line)
s = re.sub(r'#\[cfg\(target_os = "android"\)\]\n#\[path = "android_bundled/(zoom|minimap|recipes)/[^"]+"\]\n[^\n]*mod \w+;\n\n?', '', s)

# 2. calls into them inside the dispatchers
drop = ('zoom_key::', 'zoom_wheel::', 'zoom_zoom::', 'zoom_list::', 'zoom_settings::', 'zoom_click::',
        'minimap_list::', 'minimap_settings::', 'minimap_click::', 'minimap_minimap::',
        'recipes_list::', 'recipes_settings::', 'recipes_click::', 'recipes_frame::', 'recipes_event::',
        'official_zoom::reset', 'official_minimap::reset', 'official_recipes::set_viewer')
s = '\n'.join(l for l in s.split('\n') if not any(d in l for d in drop))
io.open(p, 'w', encoding='utf-8', newline='').write(s)

g = root + '/crates/horizon-client/src/game.rs'
t = io.open(g, encoding='utf-8').read()
old = 'official_minimap, official_recipes, official_recipes_glue, official_zoom, smartf3,'
assert t.count(old) == 1
t = t.replace(old, 'smartf3,')
io.open(g, 'w', encoding='utf-8', newline='').write(t)
print('ok')
