# Модель данных

## 1. Общие принципы

- **SQLite** — единственный источник истины для всех структурированных данных
- Модель оптимизирована под расширяемость: новые типы подсказок добавляются без миграций
- Изображения хранятся файлово, в БД — только метаданные и путь
- Все мутации логируются в `revision_log`

## 2. ER-диаграмма

```
┌──────────────┐       ┌───────────────┐       ┌──────────────────┐
│    Region    │       │   HintType    │       │      Asset       │
│──────────────│       │───────────────│       │──────────────────│
│ id (PK)      │       │ id (PK)       │       │ id (PK)          │
│ name         │       │ code (UNIQUE) │       │ file_path        │
│ name_en      │       │ title         │       │ kind             │
│ country_code │       │ description   │       │ mime_type        │
│ region_level │       │ display_family│       │ width            │
│ parent_id(FK)│       │ default_icon  │       │ height           │
│ geometry_ref │       │ schema_json   │       │ caption          │
│ anchor_lng   │       │ sort_order    │       │ created_at       │
│ anchor_lat   │       │ is_active     │       └──────────────────┘
│ anchor_off_x │       │ created_at    │              ▲
│ anchor_off_y │       └───────┬───────┘              │
│ priority     │               │                      │
│ is_active    │               │                      │
│ created_at   │       ┌───────▼───────────────┐      │
└──────┬───────┘       │     RegionHint        │      │
       │               │──────────────────────-│      │
       │               │ id (PK)               │      │
       └───────────────│ region_id (FK)         │      │
                       │ hint_type_id (FK)      │      │
                       │ short_value            │      │
                       │ full_value             │      │
                       │ data_json              │      │
                       │ image_asset_id (FK)────│──────┘
                       │ icon_asset_id (FK)─────│──────┘
                       │ color                  │
                       │ sort_order             │
                       │ min_zoom               │
                       │ max_zoom               │
                       │ is_visible             │
                       │ confidence             │
                       │ source_note            │
                       │ created_by             │
                       │ created_at             │
                       │ updated_at             │
                       └────────────────────────┘

┌─────────────────────────┐       ┌─────────────────────┐
│     RevisionLog         │       │   HintTypeField     │
│─────────────────────────│       │─────────────────────│
│ id (PK)                 │       │ id (PK)             │
│ entity_type             │       │ hint_type_id (FK)   │
│ entity_id               │       │ field_code          │
│ action                  │       │ field_label         │
│ diff_json               │       │ field_type          │
│ created_by              │       │ is_required         │
│ created_at              │       │ default_value       │
│ comment                 │       │ options_json        │
└─────────────────────────┘       │ sort_order          │
                                  └─────────────────────┘
```

## 3. Таблицы

### 3.1. `region`

Описывает географический регион с геометрией и точкой привязки.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT PK | UUID |
| `name` | TEXT NOT NULL | Название на оригинальном языке |
| `name_en` | TEXT | Название на английском |
| `country_code` | TEXT | ISO 3166-1 alpha-2 |
| `region_level` | TEXT NOT NULL | `country`, `admin1`, `admin2`, `theme_region` |
| `parent_id` | TEXT FK | Ссылка на родительский регион (для иерархии) |
| `geometry_ref` | TEXT | Ключ геометрии во внешнем GeoJSON/PMTiles |
| `anchor_lng` | REAL | Долгота точки привязки |
| `anchor_lat` | REAL | Широта точки привязки |
| `anchor_offset_x` | REAL DEFAULT 0 | Смещение по X в пикселях |
| `anchor_offset_y` | REAL DEFAULT 0 | Смещение по Y в пикселях |
| `priority` | INTEGER DEFAULT 0 | Приоритет отображения (больше = важнее) |
| `is_active` | BOOLEAN DEFAULT 1 | Активен ли регион |
| `created_at` | TEXT | ISO 8601 timestamp |

**Индексы:**
- `idx_region_country` ON (`country_code`)
- `idx_region_level` ON (`region_level`)
- `idx_region_parent` ON (`parent_id`)
- `idx_region_name` ON (`name`)

### 3.2. `hint_type`

Справочник типов подсказок. Расширяется пользователем и агентом.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT PK | UUID |
| `code` | TEXT UNIQUE NOT NULL | Машинный код: `flag`, `driving_side`, `script_sample`, `phone_hint`, `road_marking`, `sign`, `pole`, `bollard`, `coverage`, `camera_meta`, `car_type`, `vegetation`, `note`, ... |
| `title` | TEXT NOT NULL | Человекочитаемое название |
| `description` | TEXT | Описание типа подсказки |
| `display_family` | TEXT | Семейство отображения: `polygon_fill`, `icon`, `text`, `image`, `composite` |
| `default_icon` | TEXT | Путь к иконке по умолчанию |
| `schema_json` | TEXT | JSON Schema для `data_json` в `RegionHint` — определяет дополнительные поля для этого типа |
| `sort_order` | INTEGER DEFAULT 0 | Порядок в UI |
| `is_active` | BOOLEAN DEFAULT 1 | Показывать ли в списке |
| `created_at` | TEXT | ISO 8601 |

**Ключевая идея расширяемости:** `schema_json` определяет, какие дополнительные поля есть у подсказок данного типа. Например, для `car_type` это может быть `{"properties": {"brand": {"type": "string"}, "has_blur": {"type": "boolean"}}}`. UI и Agent API используют эту схему для валидации и генерации форм.

### 3.3. `hint_type_field`

Описание полей для конкретного типа подсказки (альтернатива/дополнение к `schema_json` для UI).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT PK | UUID |
| `hint_type_id` | TEXT FK | Ссылка на `hint_type` |
| `field_code` | TEXT NOT NULL | Машинный код поля |
| `field_label` | TEXT NOT NULL | Подпись в UI |
| `field_type` | TEXT NOT NULL | `string`, `number`, `boolean`, `enum`, `color`, `image` |
| `is_required` | BOOLEAN DEFAULT 0 | Обязательное ли |
| `default_value` | TEXT | Значение по умолчанию |
| `options_json` | TEXT | Для `enum`: `["left", "right", "mixed"]` |
| `sort_order` | INTEGER DEFAULT 0 | Порядок в форме |

### 3.4. `region_hint`

Конкретная подсказка, привязанная к региону.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT PK | UUID |
| `region_id` | TEXT FK NOT NULL | Ссылка на `region` |
| `hint_type_id` | TEXT FK NOT NULL | Ссылка на `hint_type` |
| `short_value` | TEXT | Краткое значение (для подписи на карте) |
| `full_value` | TEXT | Полное описание |
| `data_json` | TEXT | Произвольные данные согласно `hint_type.schema_json` |
| `image_asset_id` | TEXT FK | Основное изображение-пример |
| `icon_asset_id` | TEXT FK | Кастомная иконка |
| `color` | TEXT | Цвет (hex, например `#FF5733`) |
| `sort_order` | INTEGER DEFAULT 0 | Порядок отображения |
| `min_zoom` | REAL DEFAULT 0 | Минимальный зум видимости |
| `max_zoom` | REAL DEFAULT 22 | Максимальный зум видимости |
| `is_visible` | BOOLEAN DEFAULT 1 | Видимость |
| `confidence` | REAL DEFAULT 1.0 | Уверенность (0.0–1.0) |
| `source_note` | TEXT | Источник данных |
| `created_by` | TEXT DEFAULT 'user' | `user` или `agent` |
| `created_at` | TEXT | ISO 8601 |
| `updated_at` | TEXT | ISO 8601 |

**Индексы:**
- `idx_rh_region` ON (`region_id`)
- `idx_rh_type` ON (`hint_type_id`)
- `idx_rh_region_type` ON (`region_id`, `hint_type_id`)
- `idx_rh_created_by` ON (`created_by`)

**Ключевая идея:** `data_json` + `schema_json` из `hint_type` обеспечивают произвольное расширение без миграций. Когда нужен новый тип подсказки (например, `vegetation`), достаточно:
1. Добавить запись в `hint_type` с `code = "vegetation"` и `schema_json`
2. Начать создавать `region_hint` с `hint_type_id` этого типа

### 3.5. `asset`

Метаданные файловых ресурсов (изображения, иконки).

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT PK | UUID |
| `file_path` | TEXT NOT NULL | Относительный путь в assets-директории |
| `kind` | TEXT NOT NULL | `flag`, `sample`, `icon`, `thumbnail`, `photo` |
| `mime_type` | TEXT | MIME-тип файла |
| `width` | INTEGER | Ширина в пикселях |
| `height` | INTEGER | Высота в пикселях |
| `caption` | TEXT | Подпись |
| `created_at` | TEXT | ISO 8601 |

### 3.6. `revision_log`

Журнал всех изменений для аудита и отката.

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | TEXT PK | UUID |
| `entity_type` | TEXT NOT NULL | `region`, `region_hint`, `hint_type`, `asset` |
| `entity_id` | TEXT NOT NULL | ID изменённой сущности |
| `action` | TEXT NOT NULL | `create`, `update`, `delete`, `batch_create`, `batch_update` |
| `diff_json` | TEXT | JSON-diff: `{"field": {"old": ..., "new": ...}}` |
| `created_by` | TEXT DEFAULT 'user' | `user`, `agent`, `import` |
| `created_at` | TEXT NOT NULL | ISO 8601 |
| `comment` | TEXT | Комментарий к изменению |

**Индексы:**
- `idx_revlog_entity` ON (`entity_type`, `entity_id`)
- `idx_revlog_time` ON (`created_at`)
- `idx_revlog_by` ON (`created_by`)

## 4. Встроенные типы подсказок (seed data)

При первом запуске в `hint_type` загружаются:

| code | title | display_family | schema_json (сокращённо) |
|------|-------|---------------|-------------------------|
| `flag` | Флаг | `icon` | — |
| `driving_side` | Сторона движения | `polygon_fill` | `{side: enum[left,right,mixed]}` |
| `script_sample` | Образец письменности | `image` | `{script_name: string}` |
| `phone_hint` | Телефонная подсказка | `text` | `{prefix: string, format: string}` |
| `road_marking` | Дорожная разметка | `image` | `{marking_type: string}` |
| `sign` | Дорожный знак | `image` | `{sign_type: string}` |
| `pole` | Столб/опора | `image` | `{material: string, color: string}` |
| `bollard` | Болларды | `image` | `{bollard_type: string}` |
| `coverage` | Покрытие | `polygon_fill` | `{provider: string, year: number}` |
| `camera_meta` | Google Car | `text` | `{generation: string, has_blur: boolean}` |
| `car_type` | Тип машины съёмки | `icon` | `{brand: string, model: string, color: string}` |
| `vegetation` | Растительность | `icon` | `{biome: string, key_species: string}` |
| `note` | Заметка | `text` | — |

### 3.7. `app_settings`

Персистентное хранилище настроек приложения (key-value).

| Поле | Тип | Описание |
|------|-----|----------|
| `key` | TEXT PK | Ключ настройки |
| `value` | TEXT NOT NULL | JSON-значение |
| `updated_at` | TEXT | ISO 8601 |

**Хранимые настройки:**

| Ключ | Тип значения | Описание |
|------|-------------|----------|
| `map.center_lng` | number | Последняя позиция карты: долгота |
| `map.center_lat` | number | Последняя позиция карты: широта |
| `map.zoom` | number | Последний уровень зума |
| `map.basemap_provider` | string | Активный провайдер подложки |
| `map.basemap_style` | string | Вариант стиля подложки |
| `map.density_preset` | string | Активный пресет плотности |
| `map.presentation_mode` | string | Режим представления подсказок |
| `layers.visible` | string[] | Список включённых hint_type codes |
| `agent.enabled` | boolean | Agent API включён |
| `agent.port` | number | Порт Agent API |
| `agent.token_hash` | string | bcrypt-хеш API-токена |
| `agent.auto_approve` | boolean | Авто-принимать изменения от агента |
| `editor.last_country` | string | Последняя выбранная страна |
| `export.last_path` | string | Последний путь экспорта |

**Примечание:** Токен Agent API хранится как bcrypt-хеш. Открытый токен показывается пользователю только при генерации и не сохраняется.

## 5. Правила целостности

1. `region_hint.region_id` → `region.id` (CASCADE DELETE)
2. `region_hint.hint_type_id` → `hint_type.id` (RESTRICT DELETE)
3. `region_hint.image_asset_id` → `asset.id` (SET NULL)
4. `region_hint.icon_asset_id` → `asset.id` (SET NULL)
5. `region.parent_id` → `region.id` (SET NULL)
6. `hint_type_field.hint_type_id` → `hint_type.id` (CASCADE DELETE)

## 6. Механизм расширяемости

### 6.1. Добавление нового типа подсказки

Не требует миграции БД. Процесс:

1. Вставить запись в `hint_type` с уникальным `code` и `schema_json`
2. Опционально добавить записи в `hint_type_field` для UI-формы
3. Создавать `region_hint` с `data_json`, соответствующим схеме

### 6.2. JSON Schema в `hint_type.schema_json`

Формат — подмножество JSON Schema Draft 7:

```json
{
  "properties": {
    "brand": { "type": "string", "title": "Марка" },
    "model": { "type": "string", "title": "Модель" },
    "color": { "type": "string", "title": "Цвет", "format": "color" },
    "has_blur": { "type": "boolean", "title": "Размытие лиц" }
  },
  "required": ["brand"]
}
```

UI генерирует форму на основе этой схемы. Agent API валидирует `data_json` при вставке.

### 6.3. `data_json` в `region_hint`

Хранит произвольные данные согласно схеме типа:

```json
{
  "brand": "Google",
  "model": "Chevrolet Cobalt",
  "color": "white",
  "has_blur": true
}
```
