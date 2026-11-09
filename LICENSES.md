# Лицензии

Код приложения «Канон» — MIT (свободно для личного и любого использования).

## 3D-модель

| Что | Источник | Лицензия |
|---|---|---|
| Базовый меш `base.obj` и морфы `.target` | MakeHuman, репозиторий https://github.com/makehumancommunity/makehuman, коммит `a8bc2d54ff0ac92e78ff71431b1023eda42bf482` (`model-src/makehuman/SOURCE_COMMIT.txt`) | **CC0 1.0** — ассеты явно выпущены в общественное достояние в сентябре 2020 (текст: `model-src/makehuman/LICENSE.ASSETS.md`, заголовки каждого `.target`) |
| `public/models/body.glb`, `model-src/body-uncompressed.glb`, `src/lib/model/landmarks.json` | Производные, созданы `scripts/build-model.ts` из ассетов выше | CC0 (производная CC0-ассетов; дополнительно MIT для скрипта) |
| `model-src/body.blend` | Создан в Blender 5.2.3 скриптом `scripts/blender/make_blend.py` из `body-uncompressed.glb` | CC0. Blender (GPL-3.0) — только инструмент, в проект не входит; файлы, созданные в Blender, лицензией GPL не связаны |

Использованные морфы MakeHuman: `macrodetails/{caucasian,african,asian}-male-young`, `universal-male-young-{average,max,min}muscle-*`, `macrodetails/height/male-young-averagemuscle-averageweight-{max,min}height`, `measure/measure-{neck,bust,waist,hips,upperarm,thigh,calf,wrist,ankle,knee}-circ-{incr,decr}`, `measure/measure-shoulder-dist-{incr,decr}`, `armslegs/{l,r}-lowerarm-muscle-{incr,decr}`.

Программа MakeHuman (AGPL) **не используется и не распространяется** — только CC0-ассеты.

## Данные

| Что | Лицензия | Как соблюдается |
|---|---|---|
| Open Food Facts (поиск продуктов) | Open Database License (ODbL) 1.0; изображения — CC BY-SA | Атрибуция и ссылка на лицензию в окне поиска. Данные запрашиваются по требованию и не распространяются как база |
| PubMed / Crossref (метаданные статей) | Публичные метаданные | Только библиографические ссылки |

## Шрифты и иконки

| Что | Лицензия |
|---|---|
| Шрифты | Системные (San Francisco на iPhone, Segoe UI на Windows) — в приложение не встраиваются |
| Иконки приложения и интерфейса | Нарисованы для проекта (`scripts/make-icons.mjs`, SVG в коде) — MIT |

## Библиотеки (runtime)

| Пакет | Лицензия |
|---|---|
| react, react-dom | MIT |
| three | MIT |
| @react-three/fiber, @react-three/drei | MIT |
| dexie, dexie-react-hooks | Apache-2.0 |
| workbox (через vite-plugin-pwa) | MIT |

Инструменты сборки (vite, vitest, typescript, @gltf-transform/*, meshoptimizer, fake-indexeddb) — MIT / Apache-2.0, в приложение не попадают (кроме декодера meshopt внутри three — MIT).

## Эвристики, использованные с указанием авторства

- Пропорции Стива Ривза: Reeves S., Little J. «Building the Classic Physique — The Natural Way», 1995 — используются только числовые соотношения (факты), текст книги не воспроизводится.
- Формулы Casey Butt: «Your Muscular Potential», 4-е изд. — только коэффициенты формул.
