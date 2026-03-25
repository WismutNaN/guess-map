# Картографический движок

## 1. Обзор

Карта построена на **MapLibre GL JS** — открытом WebGL-рендере векторных карт. Вся визуализация подсказок идёт через нативные map layers (fill, symbol, line), а не через DOM-оверлеи. HTML-элементы (popup, tooltip) используются только для hover, pin и активного выделения.

## 2. Структура источников данных (sources)

MapLibre оперирует понятием **source** (источник данных) и **layer** (визуальный слой, привязанный к source).

### 2.1. Источники

| Source ID | Тип | Описание | Откуда данные |
|-----------|-----|----------|---------------|
| `basemap` | vector | Подложка (OSM-based) | PMTiles / URL-провайдер |
| `regions-countries` | geojson | Полигоны стран | Bundled GeoJSON / PMTiles |
| `regions-admin1` | geojson | Полигоны admin-1 регионов | Bundled GeoJSON / PMTiles |
| `hints-{hint_type_code}` | geojson | Точки подсказок по типу | Compiled из SQLite |
| `cities` | geojson | Населённые пункты | Natural Earth populated places |

### 2.2. Стратегия компиляции: GeoJSON ↔ SQLite

Подсказки хранятся в SQLite, но MapLibre работает с GeoJSON/vector sources. Компиляция — это процесс создания GeoJSON из данных БД.

#### Два типа compiled sources:

**Point sources (`hints-{code}`)** — для `icon`, `text`, `image`, `composite` display families:

```
LayerCompiler выполняет:
  SELECT rh.*, r.anchor_lng, r.anchor_lat, r.name, r.country_code
  FROM region_hint rh
  JOIN region r ON rh.region_id = r.id
  WHERE rh.hint_type_id = :type_id AND rh.is_visible = 1

  → Для каждой строки создаёт GeoJSON Point Feature:
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [anchor_lng, anchor_lat] },
      properties: {
        id, region_id, short_value, full_value, color,
        icon_asset, min_zoom, max_zoom, priority, confidence,
        ...data_json (flattened)
      }
    }
```

**Polygon enrichment (`regions-countries`, `regions-admin1`)** — для `polygon_fill`:

```
LayerCompiler НЕ создаёт новый GeoJSON.
Вместо этого обогащает properties существующих polygon features:

1. Загружает bundled GeoJSON с геометриями регионов
2. Для каждого feature находит region_hint по geometry_ref → region_id
3. Добавляет hint properties в feature.properties:
   feature.properties.driving_side = "left"
   feature.properties.coverage_provider = "Google"
4. Сохраняет enriched GeoJSON

Enrichment запускается при:
  - Старте приложения
  - Изменении hint с display_family = "polygon_fill"
  - Команде layer::compile
```

#### Обновление в реальном времени:

1. При изменении hint — LayerCompiler пересобирает GeoJSON для затронутого `hint_type`
2. Отправляет IPC event `layer:updated` с payload `{source_id, geojson}`
3. React MapView вызывает `map.getSource(id).setData(geojson)`
4. MapLibre перерисовывает затронутые слои

Для point sources (~200 стран, ~4500 admin1) GeoJSON достаточно. PMTiles используется только для basemap и bundled region geometries.

## 3. Структура слоёв (layers)

### 3.1. Базовые слои

```
z-order (снизу вверх):
─────────────────────────
  basemap-fill          ← заливка подложки
  basemap-boundary      ← границы на подложке
  basemap-labels        ← подписи подложки
─────────────────────────
  region-fill           ← цветовая заливка регионов (driving_side, coverage, etc.)
  region-boundary       ← границы регионов (тонкая линия)
  region-highlight      ← подсветка выбранного региона
─────────────────────────
  hint-icons            ← иконки подсказок (флаги, болларды, etc.)
  hint-images           ← мини-изображения (письменность, знаки)
  hint-labels           ← текстовые подписи
─────────────────────────
  city-labels           ← подписи городов
  selection-outline     ← обводка текущего выделения
```

### 3.2. Динамические hint-слои

Для каждого активного `hint_type` создаётся до 3 слоёв в зависимости от `display_family`:

| display_family | Создаваемые слои |
|---------------|-----------------|
| `polygon_fill` | `hint-{code}-fill`, `hint-{code}-outline` |
| `icon` | `hint-{code}-symbol` |
| `text` | `hint-{code}-label` |
| `image` | `hint-{code}-symbol` (с `icon-image`) |
| `composite` | `hint-{code}-symbol`, `hint-{code}-label` |

## 4. Data-Driven Styling

### 4.1. Заливка полигонов (driving side)

```js
{
  id: "hint-driving_side-fill",
  type: "fill",
  source: "regions-countries",
  paint: {
    "fill-color": [
      "match", ["get", "driving_side"],
      "left",  "#4A90D9",   // синий
      "right", "#D94A4A",   // красный
      "mixed", "#D9A84A",   // жёлтый
      "#CCCCCC"             // unknown
    ],
    "fill-opacity": [
      "interpolate", ["linear"], ["zoom"],
      2, 0.4,
      6, 0.25,
      10, 0.15
    ]
  }
}
```

### 4.2. Иконки подсказок (флаги)

```js
{
  id: "hint-flag-symbol",
  type: "symbol",
  source: "hints-flag",
  layout: {
    "icon-image": ["get", "icon_asset"],
    "icon-size": [
      "interpolate", ["linear"], ["zoom"],
      3, 0.3,
      6, 0.6,
      10, 1.0
    ],
    "icon-allow-overlap": false,
    "symbol-sort-key": ["get", "priority"]
  },
  minzoom: 2,
  maxzoom: 22
}
```

### 4.3. Слоты позиционирования

Для одновременного отображения нескольких подсказок вокруг anchor-точки региона используются фиксированные смещения:

```
              ┌─────┐
              │ flag │  offset: [0, -30]
              └──┬──┘
                 │
  ┌──────┐   ┌──┴──┐   ┌──────────┐
  │ meta │───│ CTR │───│  script  │
  │      │   │     │   │  sample  │
  └──────┘   └──┬──┘   └──────────┘
  [-40, 0]      │       [40, 0]
              ┌──┴──┐
              │phone│  offset: [0, 30]
              └─────┘
```

Реализуется через `icon-offset` / `text-offset` в MapLibre expressions, привязанных к `hint_type.code`.

## 5. Zoom-зависимое отображение

### 5.1. Уровни детализации

| Zoom | Название | Что показывается |
|------|---------|------------------|
| 1–3 | World | Заливка полигонов стран, столицы, флаги крупных стран |
| 4–6 | Continental | Все страновые подсказки, крупные города, границы admin1 |
| 7–9 | Country | Admin1 подсказки, все города, региональные различия |
| 10–13 | Regional | Полная детализация, мини-изображения, множественные подсказки |
| 14+ | Local | Все подсказки, расширенные карточки по hover |

### 5.2. Управление видимостью

Каждый `region_hint` имеет `min_zoom` и `max_zoom`. MapLibre слои используют эти значения:

```js
filter: [
  "all",
  ["<=", ["get", "min_zoom"], currentZoom],
  [">=", ["get", "max_zoom"], currentZoom]
]
```

Дополнительно, глобальные пресеты плотности (см. [Display Modes](display-modes.md)) сдвигают пороги видимости.

## 6. Взаимодействие с картой

### 6.1. Hover

При наведении на регион или подсказку:
- Подсвечивается полигон региона (`region-highlight` layer, `feature-state`)
- Появляется HTML tooltip с `short_value` и мини-иконкой
- Tooltip исчезает при уходе курсора

### 6.2. Click / Select

При клике:
- Регион выделяется обводкой (`selection-outline`)
- Открывается боковая панель `RegionInspector` с полным списком подсказок
- Если включён режим Knowledge Editor — открывается форма редактирования

### 6.3. Multi-select

При зажатом Ctrl/Cmd + клик:
- Добавляется к текущему выделению
- Список выбранных отображается в панели
- Доступны массовые операции

### 6.4. Lasso select

Опционально: прямоугольное выделение через Shift+drag.

## 7. Collision management

MapLibre автоматически управляет коллизиями символов. Настройки:

- `icon-allow-overlap: false` — скрывать перекрывающиеся иконки
- `symbol-sort-key` — приоритет: подсказки с высоким `priority` показываются первыми
- `text-optional: true` — скрывать текст, если не влезает, но оставлять иконку

Для отладки коллизий: `map.showCollisionBoxes = true`.

## 8. Управление изображениями (Image / Sprite Management)

MapLibre требует, чтобы все иконки и изображения для symbol layers были загружены в карту через `map.addImage()` или спрайт-лист. При потенциально сотнях уникальных изображений нужна стратегия.

### 8.1. Стратегия: ленивая загрузка + кеш

```
1. При старте: загружаются только builtin иконки (~15 шт: флаги-заглушки, типовые иконки)
2. При включении слоя: загружаются все image_asset для этого hint_type
3. Загруженные изображения кешируются в Map instance (map.hasImage() проверка)
4. При выключении слоя: изображения НЕ удаляются (остаются в кеше до перезагрузки)
```

### 8.2. Именование

Формат image ID в MapLibre: `asset:{asset_id}`

```js
// При загрузке
const img = await loadImage(asset.file_path);
map.addImage(`asset:${asset.id}`, img);

// В layer style
"icon-image": ["concat", "asset:", ["get", "icon_asset_id"]]
```

### 8.3. Fallback

Если изображение не загружено (ещё грузится, ошибка загрузки):
- MapLibre автоматически скрывает символ с отсутствующим `icon-image`
- Используется `"icon-image": ["coalesce", ["image", ["concat", "asset:", ["get", "icon_asset_id"]]], ["image", "default-hint-icon"]]`
- `default-hint-icon` — generic иконка, загружается при старте

### 8.4. Ограничения размеров

- Иконки: до 64×64px, автоматическое масштабирование при загрузке
- Sample images: до 256×128px
- Форматы: PNG (с прозрачностью), WebP, JPEG
- MapLibre ограничение: одно изображение ≤ 1024×1024px

### 8.5. Sprite sheet (future optimization)

При большом количестве иконок (> 200) — компилировать sprite sheet:
1. LayerCompiler собирает все используемые иконки
2. Генерирует sprite.png + sprite.json
3. MapLibre загружает через `style.sprite` URL
4. Ускоряет начальную загрузку vs поштучный `addImage()`

## 9. Интеграция с PMTiles

Для overlay-слоёв с большим количеством данных (> 10 000 features):

1. LayerCompiler экспортирует данные в PMTiles формат
2. PMTiles файл сохраняется в assets-директории
3. MapLibre подключает через `pmtiles` protocol: `addProtocol()`
4. Source указывает на локальный PMTiles: `pmtiles:///path/to/overlay.pmtiles`

Пересборка PMTiles запускается:
- Вручную через UI ("Compile layers")
- Автоматически при сохранении, если изменений > N
- Через Agent API command `layer::compile`
