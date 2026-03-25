# PLAN.md — План разработки GuessMap

## Принципы плана

- **Рабочий продукт на каждой фазе** — после каждой фазы пользователь получает что-то, что можно запустить и использовать
- **Раннее получение фидбека** — Phase 1 уже показывает карту, Phase 2 уже показывает данные на карте
- **Тесты на каждой фазе** — unit, integration, e2e где применимо
- **Gate criteria** — чёткие условия перехода на следующую фазу

---

## Phase 1: Skeleton — Каркас приложения

### Цель
Tauri-окно с интерактивной картой мира. Пользователь может pan/zoom, видит границы стран и города.

### Релевантная документация
- [Архитектура](architecture.md) — стек, слои приложения, структура проекта
- [Модель данных](data-model.md) — все таблицы SQLite, включая `app_settings` для персистенции состояния
- [Источники геоданных](geodata-sources.md) — Natural Earth наборы, pipeline импорта, `geometry_ref`, вычисление anchor
- [Картографический движок](map-engine.md) §2.1 — структура sources (basemap, regions-countries, cities)
- [Провайдеры подложки](basemap-providers.md) §3.2 — OSM Raster Tiles как стартовый провайдер

### Задачи

| # | Задача | Файлы/модули |
|---|--------|-------------|
| 1.1 | Инициализировать Tauri 2 проект с React + TypeScript + Vite | `src/`, `src-tauri/` |
| 1.2 | Подключить MapLibre GL JS, рендер пустой карты | `src/components/MapView.tsx` |
| 1.3 | Подключить OSM Raster basemap (тайлы по URL) | `src/map/basemap.ts` |
| 1.4 | Настроить SQLite через Tauri SQL plugin | `src-tauri/src/db/` |
| 1.5 | Написать SQL миграции для всех таблиц: `region`, `hint_type`, `hint_type_field`, `region_hint`, `asset`, `revision_log`, `app_settings` | `src-tauri/migrations/` |
| 1.6 | Импортировать Natural Earth countries GeoJSON → таблица `region` (level=country) | `src-tauri/src/import/` |
| 1.7 | Импортировать Natural Earth admin1 GeoJSON → таблица `region` (level=admin1) | `src-tauri/src/import/` |
| 1.8 | Отобразить полигоны стран на карте (GeoJSON source + fill layer) | `src/map/layers/regions.ts` |
| 1.9 | Отобразить города (Natural Earth populated places, zoom-dependent) | `src/map/layers/cities.ts` |
| 1.10 | Сохранение/восстановление позиции карты в `app_settings` | `src/map/persistence.ts` |

### Тесты

| Тип | Что тестируется |
|-----|----------------|
| Unit (Rust) | Миграции применяются без ошибок на пустой БД |
| Unit (Rust) | Импорт Natural Earth: парсинг GeoJSON, создание region записей |
| Unit (Rust) | `app_settings` CRUD: get/set/default |
| Integration (Rust) | Полный pipeline: миграция → импорт → SELECT regions count > 200 |
| E2E | Приложение запускается, MapLibre рендерит карту без ошибок в консоли |

### Gate Criteria (переход на Phase 2)

- [x] Приложение запускается через `npx tauri dev`
- [x] Карта показывает мировую подложку с pan/zoom
- [x] На карте видны полигоны ≥ 200 стран с границами (245 стран, 10m Natural Earth)
- [x] На карте видны города с zoom-зависимой фильтрацией (7342 города, scalerank filter)
- [x] SQLite содержит ≥ 200 country records и ≥ 3000 admin1 records (245 + 4584 = 4829)
- [x] Позиция карты сохраняется между перезапусками (app_settings + debounce)
- [x] Все тесты проходят (7 unit + 1 integration)

---

## Phase 2: Hint Rendering — Подсказки на карте

### Цель
Данные подсказок видны на карте. Слои переключаются. Данные заполняются через seed (не через UI — это Phase 3).

### Релевантная документация
- [Система подсказок](hint-system.md) — типы, display families, встроенные типы (seed data), слоты позиционирования
- [Модель данных](data-model.md) §3.2, §3.4, §4 — таблицы `hint_type`, `region_hint`, seed data
- [Картографический движок](map-engine.md) §2.2 — стратегия компиляции GeoJSON ↔ SQLite (point sources vs polygon enrichment)
- [Картографический движок](map-engine.md) §4 — data-driven styling: fill color, symbol, zoom expressions
- [Картографический движок](map-engine.md) §8 — управление изображениями / sprites (ленивая загрузка, fallback)
- [Режимы отображения](display-modes.md) §6 — zoom-зависимая фильтрация городов

### Задачи

| # | Задача | Файлы/модули |
|---|--------|-------------|
| 2.1 | Seed данные: встроенные `hint_type` (13 типов из спецификации) | `src-tauri/src/seed/` |
| 2.2 | Seed данные: `driving_side` для всех стран (~195 записей) | `src-tauri/src/seed/` |
| 2.3 | Seed данные: `flag` для всех стран (icon_asset → bundled flag images) | `src-tauri/src/seed/`, `assets/flags/` |
| 2.4 | Tauri command `hint::list_by_type` — получить все hints для данного типа | `src-tauri/src/commands/hint.rs` |
| 2.5 | Tauri command `hint::list_by_region` — получить все hints для региона | `src-tauri/src/commands/hint.rs` |
| 2.6 | LayerCompiler: сборка point GeoJSON из region_hint + region anchor | `src-tauri/src/compiler/` |
| 2.7 | LayerCompiler: polygon enrichment (добавление hint properties в region GeoJSON) | `src-tauri/src/compiler/` |
| 2.8 | Driving side layer: polygon fill с data-driven color | `src/map/layers/hint-fill.ts` |
| 2.9 | Flag layer: symbol с icon-image из bundled флагов | `src/map/layers/hint-symbol.ts` |
| 2.10 | Image management: `map.addImage()` для флагов при загрузке слоя | `src/map/images.ts` |
| 2.11 | Layer Panel (React): список hint_type с checkbox видимости | `src/components/LayerPanel.tsx` |
| 2.12 | Переключение слоёв: toggle visibility через MapLibre `setLayoutProperty` | `src/map/layers/manager.ts` |
| 2.13 | IPC event `layer:updated` — фронтенд обновляет source при изменении данных | `src/map/events.ts` |
| 2.14 | Zoom-dependent visibility: `minzoom`/`maxzoom` на слоях | `src/map/layers/` |

### Тесты

| Тип | Что тестируется |
|-----|----------------|
| Unit (Rust) | LayerCompiler: point GeoJSON содержит правильные coordinates и properties |
| Unit (Rust) | LayerCompiler: polygon enrichment добавляет driving_side в properties |
| Unit (Rust) | Seed: после seed ≥ 195 region_hint записей для driving_side |
| Unit (TS) | LayerManager: toggle visibility переключает layout property |
| Unit (TS) | ImageManager: addImage вызывается с правильными ID |
| Integration | Полный pipeline: seed → compile → GeoJSON содержит features с properties |
| E2E | Карта показывает цветовую заливку driving_side (синий/красный) |
| E2E | Карта показывает флаги стран при zoom ≥ 4 |
| E2E | Checkbox в Layer Panel скрывает/показывает слой |

### Gate Criteria

- [x] На карте видна заливка driving_side (left=синий, right=красный) для всех стран (polygon enrichment + data-driven fill-color)
- [x] На карте видны флаги стран при достаточном зуме (emoji symbol layer, minzoom 2)
- [x] Layer Panel показывает ≥ 5 типов подсказок с checkbox (13 типов, 2 с данными, остальные disabled)
- [x] Включение/выключение слоя мгновенно отражается на карте (setLayoutProperty visibility toggle)
- [x] LayerCompiler корректно собирает GeoJSON (unit тесты — compile_point_layer, compile_polygon_enrichment)
- [x] Все тесты проходят (14 total: 13 unit + 1 integration)

---

## Phase 3: Knowledge Editor — Редактор знаний

### Цель
Пользователь может выбрать регион на карте и добавить/отредактировать подсказку через UI. Полный workflow без ручного SQL.

### Релевантная документация
- [Редактор знаний](knowledge-editor.md) — компоновка экрана, Region Inspector, формы, поиск, загрузка изображений
- [Система подсказок](hint-system.md) §3 — жизненный цикл подсказки, валидация по schema_json
- [Модель данных](data-model.md) §6 — механизм расширяемости, JSON Schema в `schema_json`, `data_json`
- [Модель данных](data-model.md) §3.5, §3.6 — таблицы `asset`, `revision_log`
- [Картографический движок](map-engine.md) §6 — hover, click/select, highlight через feature-state
- [Редактор знаний](knowledge-editor.md) §7 — управление якорем (anchor editing)

### Задачи

| # | Задача | Файлы/модули |
|---|--------|-------------|
| 3.1 | Click handler: клик на регион → определение region_id через MapLibre queryRenderedFeatures | `src/map/interaction.ts` |
| 3.2 | Highlight выбранного региона (feature-state или отдельный layer) | `src/map/layers/selection.ts` |
| 3.3 | Region Inspector панель: показать info о выбранном регионе + список hints | `src/components/RegionInspector.tsx` |
| 3.4 | Tauri commands: `hint::create`, `hint::update`, `hint::delete` | `src-tauri/src/commands/hint.rs` |
| 3.5 | Tauri command: `region::search` — поиск по имени (LIKE) | `src-tauri/src/commands/region.rs` |
| 3.6 | SearchBar компонент: autocomplete с debounce, fly to region | `src/components/SearchBar.tsx` |
| 3.7 | Форма добавления hint: выбор типа, short_value, full_value, color | `src/components/HintForm.tsx` |
| 3.8 | Динамическая генерация полей формы из `hint_type.schema_json` | `src/components/DynamicFields.tsx` |
| 3.9 | Загрузка изображений: Tauri file dialog → копирование в assets → создание asset record | `src-tauri/src/commands/asset.rs` |
| 3.10 | Preview загруженного изображения в форме | `src/components/AssetUpload.tsx` |
| 3.11 | Revision log: запись при каждом create/update/delete hint | `src-tauri/src/services/revision.rs` |
| 3.12 | Live update: после сохранения hint → LayerCompiler → обновление карты | integration |
| 3.13 | Toggle между Study Mode и Editor Mode | `src/components/Toolbar.tsx` |

### Тесты

| Тип | Что тестируется |
|-----|----------------|
| Unit (Rust) | `hint::create` создаёт запись + revision_log |
| Unit (Rust) | `hint::update` обновляет запись + revision_log с diff |
| Unit (Rust) | `hint::delete` удаляет запись + revision_log |
| Unit (Rust) | `region::search("karn")` возвращает Karnataka |
| Unit (Rust) | `data_json` валидируется по `schema_json` — невалидные отклоняются |
| Unit (Rust) | Asset: файл копируется, record создаётся с width/height |
| Unit (TS) | DynamicFields: генерирует input для string, select для enum, checkbox для boolean |
| Unit (TS) | HintForm: submit вызывает invoke с правильными данными |
| Integration | Create hint → карта обновляется (source.setData вызван) |
| E2E | Клик на страну → Inspector показывает имя и existing hints |
| E2E | Добавление hint → карта обновляется, hint виден |
| E2E | Поиск "india" → результат, клик → карта летит к Индии |

### Gate Criteria

- [ ] Клик на регион выделяет его и показывает Inspector
- [ ] Форма добавления hint работает для ≥ 3 типов подсказок (driving_side, flag, note)
- [ ] Динамические поля генерируются из schema_json
- [ ] Загрузка изображения работает (file picker → preview → сохранение)
- [ ] После сохранения hint карта обновляется без перезагрузки
- [ ] Поиск регионов работает с autocomplete
- [ ] Revision log содержит записи для всех операций
- [ ] Все тесты проходят

---

## Phase 4: Agent API — API для LLM-агентов

### Цель
LLM-агент может программно читать и писать данные через HTTP API. Может заполнить driving_side для всех стран за один batch-запрос.

### Релевантная документация
- [Agent API](agent-api.md) — все endpoints, формат запросов/ответов, авторизация, rate limiting, WebSocket
- [Agent API](agent-api.md) §5, §6 — примеры сценариев заполнения (driving_side, создание нового типа)
- [Архитектура](architecture.md) §6 — конкурентный доступ к SQLite: WAL mode, connection pool, busy timeout
- [Модель данных](data-model.md) §3.7 — `app_settings`: хранение порта, токена, auto-approve
- [Система подсказок](hint-system.md) §7 — правила валидации при сохранении hint

### Задачи

| # | Задача | Файлы/модули |
|---|--------|-------------|
| 4.1 | HTTP-сервер внутри Tauri (axum, localhost-only) | `src-tauri/src/agent/server.rs` |
| 4.2 | API token: генерация, хранение хеша в app_settings, проверка Bearer | `src-tauri/src/agent/auth.rs` |
| 4.3 | SQLite WAL mode + connection pool (r2d2) для конкурентного доступа | `src-tauri/src/db/pool.rs` |
| 4.4 | `GET /api/hint-types` — список типов | `src-tauri/src/agent/routes/` |
| 4.5 | `GET /api/regions` — список регионов с фильтрацией | `src-tauri/src/agent/routes/` |
| 4.6 | `GET /api/regions/:id` — регион с hints | `src-tauri/src/agent/routes/` |
| 4.7 | `POST /api/hints` — создание одного hint | `src-tauri/src/agent/routes/` |
| 4.8 | `POST /api/hints/batch` — массовое создание (до 10 000) | `src-tauri/src/agent/routes/` |
| 4.9 | `POST /api/hints/by-country` — hint для всех регионов страны | `src-tauri/src/agent/routes/` |
| 4.10 | `PUT /api/hints/:id`, `DELETE /api/hints/:id` | `src-tauri/src/agent/routes/` |
| 4.11 | `POST /api/layers/compile` — пересборка слоёв | `src-tauri/src/agent/routes/` |
| 4.12 | `GET /api/stats` — статистика базы | `src-tauri/src/agent/routes/` |
| 4.13 | `GET /api/schema` — OpenAPI-совместимая схема | `src-tauri/src/agent/routes/` |
| 4.14 | Settings UI: toggle Agent API, порт, токен, auto-approve | `src/components/Settings.tsx` |
| 4.15 | IPC event при изменениях через Agent API → обновление карты в UI | integration |
| 4.16 | Rate limiting: 100 req/sec | `src-tauri/src/agent/middleware.rs` |

### Тесты

| Тип | Что тестируется |
|-----|----------------|
| Unit (Rust) | Auth: Bearer token verification, reject invalid |
| Unit (Rust) | Batch hints: транзакционность (all-or-nothing) |
| Unit (Rust) | Batch hints: валидация data_json по schema_json |
| Unit (Rust) | Rate limiter: > 100 req/sec → 429 |
| Integration (Rust) | GET /api/regions?country_code=IN → возвращает admin1 регионы |
| Integration (Rust) | POST /api/hints/batch → 195 hints created, revision_log записан |
| Integration (Rust) | POST /api/hints/by-country → hints для всех регионов страны |
| Integration (Rust) | Concurrent: UI write + Agent batch → оба succeed (WAL) |
| E2E | Включить Agent API в Settings → HTTP-сервер доступен на localhost |
| E2E | curl POST /api/hints/batch → данные появляются на карте |
| E2E | Невалидный токен → 401 |

### Gate Criteria

- [ ] Agent API запускается и отвечает на localhost
- [ ] `POST /api/hints/batch` с 195 записями driving_side выполняется < 5 секунд
- [ ] Данные от агента видны на карте после `POST /api/layers/compile`
- [ ] Concurrent доступ (UI + Agent) не вызывает ошибок
- [ ] Невалидный data_json отклоняется с 400 и описанием ошибки
- [ ] OpenAPI schema доступна на `GET /api/schema`
- [ ] Все тесты проходят

---

## Phase 5: Bulk Operations — Массовые операции

### Цель
Пользователь может выделить несколько регионов и массово назначить подсказки. Журнал изменений доступен.

### Релевантная документация
- [Редактор знаний](knowledge-editor.md) §6 — multi-select, lasso, bulk actions панель, поддерживаемые массовые операции
- [Редактор знаний](knowledge-editor.md) §9 — журнал изменений (Change Log), фильтры журнала
- [Картографический движок](map-engine.md) §6.3, §6.4 — multi-select и lasso select на карте
- [Система подсказок](hint-system.md) §8 — группировка и фильтрация по типу, региону, автору, уверенности
- [Модель данных](data-model.md) §3.6 — `revision_log`: entity_type, action, diff_json, created_by

### Задачи

| # | Задача | Файлы/модули |
|---|--------|-------------|
| 5.1 | Multi-select: Ctrl+Click добавляет/убирает из выделения | `src/map/interaction.ts` |
| 5.2 | Lasso select: Shift+Drag прямоугольное выделение | `src/map/interaction.ts` |
| 5.3 | "Select all in country" — через фильтр по country_code | `src/components/RegionInspector.tsx` |
| 5.4 | Bulk Actions панель: появляется при > 1 выбранных, назначение hint | `src/components/BulkActions.tsx` |
| 5.5 | Tauri command `hint::batch_create` — создать hint для списка region_id | `src-tauri/src/commands/hint.rs` |
| 5.6 | Tauri command `hint::batch_delete` — удалить hints по типу для списка region_id | `src-tauri/src/commands/hint.rs` |
| 5.7 | Change Log view: список revision_log с фильтрами | `src/components/ChangeLog.tsx` |
| 5.8 | Фильтры: by author (user/agent), by entity_type, by date | `src/components/ChangeLog.tsx` |
| 5.9 | Фильтр "empty regions": показать регионы без подсказок данного типа | `src/components/LayerPanel.tsx` |
| 5.10 | Фильтр по confidence: ползунок минимальной уверенности | `src/components/LayerPanel.tsx` |

### Тесты

| Тип | Что тестируется |
|-----|----------------|
| Unit (Rust) | `hint::batch_create` создаёт N hints + N revision_log записей |
| Unit (Rust) | `hint::batch_delete` удаляет правильные hints |
| Unit (TS) | BulkActions: submit вызывает batch_create с правильными region_ids |
| Unit (TS) | ChangeLog: фильтрация по author, date |
| E2E | Ctrl+Click на 3 региона → "3 selected" в панели |
| E2E | Apply driving_side=left к 5 регионам → все 5 получают подсказку |
| E2E | Change Log показывает batch операцию |

### Gate Criteria

- [ ] Multi-select работает (Ctrl+Click)
- [ ] Bulk apply создаёт hints для всех выбранных регионов
- [ ] Change Log отображает историю с фильтрами
- [ ] Фильтр "empty regions" корректно показывает незаполненные регионы
- [ ] Все тесты проходят

---

## Phase 6: Display & Performance — Режимы отображения

### Цель
Карта остаётся читаемой при любом количестве подсказок. Пользователь управляет плотностью и представлением.

### Релевантная документация
- [Режимы отображения](display-modes.md) — все 4 density presets, 3 presentation modes, реализация через MapLibre properties
- [Режимы отображения](display-modes.md) §4 — TypeScript интерфейсы `DensityPreset`, `applyPresentation()`
- [Картографический движок](map-engine.md) §4.3 — slot positioning (offsets для flag/script/phone/meta)
- [Картографический движок](map-engine.md) §7 — collision management: allow-overlap, sort-key, text-optional
- [Картографический движок](map-engine.md) §5 — zoom-зависимое отображение, уровни детализации
- [first_spec.md](first_spec.md) §16 — нефункциональные требования к производительности

### Задачи

| # | Задача | Файлы/модули |
|---|--------|-------------|
| 6.1 | Density presets: Minimal, Balanced, Dense, Study | `src/map/presets.ts` |
| 6.2 | Presentation modes: Icons only, Icons+Text, Icons+Thumbnails | `src/map/presentation.ts` |
| 6.3 | UI: toolbar controls для density + presentation | `src/components/Toolbar.tsx` |
| 6.4 | Slot positioning: icon-offset для множественных подсказок вокруг anchor | `src/map/layers/slots.ts` |
| 6.5 | Collision management: symbol-sort-key, text-optional, allow-overlap по preset | `src/map/layers/` |
| 6.6 | Сохранение выбранных preset/mode в app_settings | `src/map/persistence.ts` |
| 6.7 | Debug overlay: toggle showCollisionBoxes, showTileBoundaries | `src/components/DebugPanel.tsx` |
| 6.8 | Performance profiling: замер FPS при > 1000 features, оптимизация | profiling |

### Тесты

| Тип | Что тестируется |
|-----|----------------|
| Unit (TS) | Preset application: Minimal скрывает text (textMinZoom=99) |
| Unit (TS) | Presentation mode: icons_only убирает text-field |
| Unit (TS) | Slot positioning: offset корректен для каждого hint_type slot |
| E2E | Переключение Minimal → Dense → визуально больше подсказок |
| E2E | Preset сохраняется между перезапусками |
| Perf | ≥ 30 FPS при 1000 point features + polygon fill на всех странах |

### Gate Criteria

- [ ] 4 density preset переключаются мгновенно
- [ ] 3 presentation mode работают
- [ ] При Dense + все слои включены — FPS ≥ 30
- [ ] Slot positioning: при включении flag + phone + script — иконки не перекрываются
- [ ] Debug overlay работает
- [ ] Все тесты проходят

---

## Phase 7: Basemap & Polish — Подложка и финализация

### Цель
Офлайн-работа с векторным basemap. Создание пользовательских типов подсказок. Экспорт/импорт. Горячие клавиши.

### Релевантная документация
- [Провайдеры подложки](basemap-providers.md) — абстракция BasemapProvider, PMTiles vector, стили, Google (future)
- [Провайдеры подложки](basemap-providers.md) §5 — стили подложки: Standard, Light, Dark, Minimal
- [Архитектура](architecture.md) §7 — экспорт/импорт базы знаний: ZIP формат, режимы merge/replace
- [Система подсказок](hint-system.md) §6 — создание пользовательских hint_type
- [Картографический движок](map-engine.md) §8.5 — sprite sheet compilation для > 200 иконок
- [Картографический движок](map-engine.md) §9 — интеграция с PMTiles (addProtocol, source URL)
- [Источники геоданных](geodata-sources.md) §6 — тематические регионы (GeoJSON upload)
- [Редактор знаний](knowledge-editor.md) §10 — горячие клавиши
- [Agent API](agent-api.md) §4.4, §9 — upload ассетов, WebSocket events

### Задачи

| # | Задача | Файлы/модули |
|---|--------|-------------|
| 7.1 | PMTiles vector basemap: bundled или downloadable world map | `assets/basemap/` |
| 7.2 | Стили подложки: Standard, Light, Dark, Minimal | `src/map/styles/` |
| 7.3 | BasemapProvider абстракция + UI переключения | `src/map/basemap.ts`, `src/components/Settings.tsx` |
| 7.4 | Создание пользовательских hint_type через UI | `src/components/HintTypeEditor.tsx` |
| 7.5 | Export: ZIP с data.json + assets + manifest | `src-tauri/src/services/export.rs` |
| 7.6 | Import: загрузка ZIP, режимы merge/replace | `src-tauri/src/services/import.rs` |
| 7.7 | Agent API endpoints: `GET /api/export`, `POST /api/import` | `src-tauri/src/agent/routes/` |
| 7.8 | POST /api/hint-types — создание типов через Agent API | `src-tauri/src/agent/routes/` |
| 7.9 | POST /api/assets/upload — загрузка изображений через Agent API | `src-tauri/src/agent/routes/` |
| 7.10 | Anchor editing: drag marker на карте для смещения anchor | `src/map/interaction.ts` |
| 7.11 | Горячие клавиши: Ctrl+F, Ctrl+S, Escape, E, Tab, Delete | `src/hooks/useHotkeys.ts` |
| 7.12 | Sprite sheet compilation для > 200 иконок | `src-tauri/src/compiler/sprite.rs` |
| 7.13 | Theme regions: импорт пользовательского GeoJSON | `src-tauri/src/import/` |
| 7.14 | Google basemap provider (опционально) | `src/map/providers/google.ts` |
| 7.15 | WebSocket events для Agent API | `src-tauri/src/agent/ws.rs` |

### Тесты

| Тип | Что тестируется |
|-----|----------------|
| Unit (Rust) | Export: ZIP содержит data.json, manifest.json, assets/ |
| Unit (Rust) | Import merge: новые hints добавляются, существующие обновляются |
| Unit (Rust) | Import replace: все hints заменяются |
| Unit (Rust) | Sprite compilation: PNG + JSON генерируются корректно |
| Unit (TS) | HintTypeEditor: submit создаёт hint_type + hint_type_fields |
| Unit (TS) | Basemap switching: setStyle вызывается, hint layers сохраняются |
| Integration | Export → Import → данные идентичны |
| E2E | Переключение basemap: карта рендерится с новым стилем |
| E2E | Создание custom hint_type → доступен в Layer Panel |
| E2E | Export → удалить БД → Import → все данные на месте |

### Gate Criteria

- [ ] Офлайн-режим: приложение работает без интернета (PMTiles basemap)
- [ ] Пользователь может создать собственный hint_type через UI
- [ ] Export → Import round-trip сохраняет все данные
- [ ] ≥ 3 стиля подложки доступны и переключаются
- [ ] Горячие клавиши работают
- [ ] Все тесты проходят

---

## Сводная таблица фаз

| Phase | Название | Ключевой результат | Зависит от |
|-------|---------|-------------------|------------|
| 1 | Skeleton | Карта мира с границами и городами | — |
| 2 | Hint Rendering | Подсказки видны на карте | Phase 1 |
| 3 | Knowledge Editor | Пользователь добавляет подсказки через UI | Phase 2 |
| 4 | Agent API | LLM-агент заполняет данные через HTTP | Phase 2 |
| 5 | Bulk Operations | Массовые операции, журнал изменений | Phase 3 |
| 6 | Display & Performance | Пресеты плотности, производительность | Phase 2 |
| 7 | Basemap & Polish | Офлайн basemap, export/import, custom types | Phase 3, 4 |

```
Phase 1 ──→ Phase 2 ──┬──→ Phase 3 ──→ Phase 5
                       │                  │
                       ├──→ Phase 4 ──────┤
                       │                  │
                       └──→ Phase 6       └──→ Phase 7
```

Phase 3 и Phase 4 разрабатываются параллельно.
Phase 5 и Phase 6 разрабатываются параллельно.
Phase 7 — финализация после Phase 3+4.

---

## Стратегия тестирования

### Инструменты

| Уровень | Rust (backend) | TypeScript (frontend) |
|---------|---------------|----------------------|
| Unit | `cargo test` (встроенный) | `vitest` |
| Integration | `cargo test` + test SQLite DB | `vitest` + mock IPC |
| E2E | — | `@playwright/test` или `tauri-driver` |
| Performance | `criterion` (benchmarks) | Chrome DevTools / MapLibre FPS counter |

### Покрытие по фазам

| Phase | Unit (Rust) | Unit (TS) | Integration | E2E |
|-------|------------|-----------|-------------|-----|
| 1 | ✅ | — | ✅ | ✅ (smoke) |
| 2 | ✅ | ✅ | ✅ | ✅ |
| 3 | ✅ | ✅ | ✅ | ✅ |
| 4 | ✅ | — | ✅ | ✅ |
| 5 | ✅ | ✅ | — | ✅ |
| 6 | — | ✅ | — | ✅ + perf |
| 7 | ✅ | ✅ | ✅ | ✅ |
