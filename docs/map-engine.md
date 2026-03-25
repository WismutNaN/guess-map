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

### 2.2. Обновление источников

При изменении данных (через UI или Agent API):

1. Rust LayerCompiler собирает GeoJSON из SQLite для затронутого `hint_type`
2. Отправляет через IPC event `layer:updated` с payload `{source_id, geojson}`
3. React MapView вызывает `map.getSource(id).setData(geojson)`
4. MapLibre перерисовывает затронутые слои

Для больших наборов данных используется PMTiles вместо GeoJSON.

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

## 8. Интеграция с PMTiles

Для overlay-слоёв с большим количеством данных (> 10 000 features):

1. LayerCompiler экспортирует данные в PMTiles формат
2. PMTiles файл сохраняется в assets-директории
3. MapLibre подключает через `pmtiles` protocol: `addProtocol()`
4. Source указывает на локальный PMTiles: `pmtiles:///path/to/overlay.pmtiles`

Пересборка PMTiles запускается:
- Вручную через UI ("Compile layers")
- Автоматически при сохранении, если изменений > N
- Через Agent API command `layer::compile`
