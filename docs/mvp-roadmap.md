# MVP Roadmap

## 1. Принципы приоритизации

- Viewer-first: сначала карта и отображение, потом редактор
- Сначала данные, потом polish: рабочий pipeline важнее идеального UI
- Расширяемость с первого дня: hint_type + schema_json сразу, не хардкод
- Agent API рано: позволяет быстро наполнить базу и тестировать визуализацию

## 2. Этапы

### Phase 1: Foundation (Каркас)

**Цель:** Рабочее приложение с картой и минимальной структурой данных.

| Задача | Модуль |
|--------|--------|
| Tauri 2 проект с React + TypeScript | architecture |
| MapLibre GL JS интеграция, базовый рендер | map-engine |
| OSM Raster basemap (простейший провайдер) | basemap-providers |
| SQLite подключение через Tauri SQL plugin | data-model |
| Миграции: таблицы region, hint_type, region_hint, asset, revision_log | data-model |
| Импорт Natural Earth countries + admin1 → region | geodata-sources |
| Отображение полигонов стран на карте | map-engine |
| Отображение городов (populated places) | map-engine |

**Результат:** Приложение запускается, показывает карту мира с границами стран и городами.

---

### Phase 2: Hint System Core (Ядро подсказок)

**Цель:** Возможность создавать, хранить и визуализировать подсказки.

| Задача | Модуль |
|--------|--------|
| Seed данные для встроенных hint_type (flag, driving_side, etc.) | hint-system |
| CRUD для region_hint через Tauri commands | data-model |
| LayerCompiler: region_hint → GeoJSON source | map-engine |
| Data-driven styling для polygon_fill (driving_side) | map-engine |
| Data-driven styling для icon (flags) | map-engine |
| Data-driven styling для text (phone_hint) | map-engine |
| Zoom-dependent visibility для подсказок | map-engine |
| Переключение слоёв on/off | map-engine |

**Результат:** На карте видны подсказки, слои переключаются. Данные пока через seed или ручной SQL.

---

### Phase 3: Knowledge Editor (Редактор знаний)

**Цель:** Пользователь может наполнять базу через UI.

| Задача | Модуль |
|--------|--------|
| Click-select региона на карте | knowledge-editor |
| Region Inspector панель (просмотр привязанных hints) | knowledge-editor |
| Форма добавления/редактирования hint | knowledge-editor |
| Динамическая генерация формы из schema_json | knowledge-editor, hint-system |
| Поиск регионов по названию | knowledge-editor |
| Загрузка изображений (asset upload) | knowledge-editor |
| Highlight выбранного региона | map-engine |
| Сохранение изменений + revision_log | data-model |

**Результат:** Полный workflow: выбрал регион → добавил подсказку → увидел на карте.

---

### Phase 4: Agent API (API для агентов)

**Цель:** LLM-агент может программно наполнять базу.

| Задача | Модуль |
|--------|--------|
| HTTP-сервер на Actix/Axum внутри Tauri | agent-api |
| Endpoints: GET regions, GET hint-types | agent-api |
| Endpoints: POST hints, POST hints/batch | agent-api |
| Endpoint: POST hints/by-country | agent-api |
| Валидация data_json по schema_json | agent-api, hint-system |
| API token и настройки в UI | agent-api |
| Endpoint: GET /api/schema (OpenAPI) | agent-api |
| Endpoint: GET /api/stats | agent-api |
| Пересборка слоёв после batch insert | map-engine |

**Результат:** LLM-агент заполняет driving_side для всех стран за один вызов.

---

### Phase 5: Bulk Operations & Polish (Массовые операции)

**Цель:** Продвинутый workflow редактирования.

| Задача | Модуль |
|--------|--------|
| Multi-select (Ctrl+Click) | knowledge-editor |
| Lasso select (Shift+Drag) | knowledge-editor |
| Bulk apply hint to selected regions | knowledge-editor |
| Bulk delete hints | knowledge-editor |
| "Select all in country" | knowledge-editor |
| Журнал изменений (Change Log view) | knowledge-editor |
| Фильтры: by author, by confidence, empty regions | knowledge-editor |

**Результат:** Пользователь может быстро размечать целые страны.

---

### Phase 6: Display Modes & Performance (Режимы отображения)

**Цель:** Управление визуальной плотностью и производительность.

| Задача | Модуль |
|--------|--------|
| Density presets (Minimal, Balanced, Dense, Study) | display-modes |
| Presentation modes (Icons, Icons+Text, Icons+Thumbnails) | display-modes |
| PMTiles для overlay layers (компиляция) | map-engine |
| Collision management tuning | map-engine |
| Debug tools (showCollisionBoxes, showTileBoundaries) | map-engine |
| Slot positioning для множественных подсказок | map-engine |

**Результат:** Карта остаётся читаемой при любом количестве подсказок.

---

### Phase 7: Basemap & Extras (Подложка и расширения)

**Цель:** Продвинутые провайдеры и дополнительные возможности.

| Задача | Модуль |
|--------|--------|
| PMTiles vector basemap (offline) | basemap-providers |
| Несколько стилей подложки (Light, Dark, Minimal) | basemap-providers |
| Переключение провайдера в UI | basemap-providers |
| Google basemap (опционально) | basemap-providers |
| Создание пользовательских hint_type через UI | hint-system |
| Импорт тематических регионов (GeoJSON upload) | geodata-sources |
| Anchor editing (drag marker) | knowledge-editor |
| Undo/Redo | knowledge-editor |
| WebSocket events для Agent API | agent-api |
| Горячие клавиши | knowledge-editor |

**Результат:** Полнофункциональное приложение по спецификации.

## 3. Зависимости между фазами

```
Phase 1 (Foundation)
  └→ Phase 2 (Hint System Core)
       ├→ Phase 3 (Knowledge Editor)
       │    └→ Phase 5 (Bulk Operations)
       ├→ Phase 4 (Agent API)
       └→ Phase 6 (Display Modes)
            └→ Phase 7 (Basemap & Extras)
```

Phase 3 и Phase 4 могут разрабатываться параллельно после Phase 2.

## 4. Что явно исключено из MVP

- Редактор границ / рисование полигонов
- Сложная GIS-топология (snapping, vertex editing)
- Полный мировой контент по всем типам подсказок
- Мультиязычный UI
- Облачная синхронизация
- Мобильная версия
