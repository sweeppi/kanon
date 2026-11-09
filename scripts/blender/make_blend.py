# Создание model-src/body.blend из GLB с морфами (shape keys).
#
# Запуск (PowerShell, из папки проекта):
#   & "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python scripts/blender/make_blend.py
#
# Что делает: импортирует model-src/body-uncompressed.glb (без meshopt-сжатия), проверяет, что пришли все
# 30 морфов, ставит их в 0, добавляет простой материал и сохраняет model-src/body.blend.
# Приложению .blend не нужен — он для ручной доработки модели (новые морфы, правка формы).
# После правок в Blender: File → Export → glTF 2.0 (включить Shape Keys) → затем сжать:
#   npx gltf-transform meshopt input.glb public/models/body.glb
# (landmarks.json при этом пересоздаётся только скриптом npm run model — правки формы в Blender его не обновят).

import os
import sys
import bpy

EXPECTED = 30
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "model-src", "body-uncompressed.glb")
OUT = os.path.join(ROOT, "model-src", "body.blend")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if not meshes:
    print("ОШИБКА: в GLB нет меша")
    sys.exit(1)
body = meshes[0]
body.name = "Body"
body.data.name = "Body"

keys = body.data.shape_keys
names = [k.name for k in keys.key_blocks[1:]] if keys else []  # [0] — Basis
print(f"Shape keys: {len(names)}")
for n in names:
    print("  ", n)
if len(names) != EXPECTED:
    print(f"ОШИБКА: ожидалось {EXPECTED} shape keys, получено {len(names)}")
    sys.exit(2)
for kb in keys.key_blocks[1:]:
    kb.value = 0.0
    kb.slider_min = -1.0  # MakeHuman-стиль: incr/decr раздельно, но удобно двигать в обе стороны
    kb.slider_max = 1.6

mat = bpy.data.materials.new("Skin")
mat.diffuse_color = (0.81, 0.78, 0.72, 1.0)
body.data.materials.clear()
body.data.materials.append(mat)

print(f"Вершин: {len(body.data.vertices)}, полигонов: {len(body.data.polygons)}")
bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print("Сохранено:", OUT, os.path.getsize(OUT), "байт")
