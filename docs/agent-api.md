# Agent API

## 1. Обзор

Agent API — локальный HTTP-сервер, запускаемый внутри Tauri-приложения, предоставляющий REST/JSON интерфейс для программного наполнения базы знаний. Основное назначение — дать LLM-агентам простой доступ к чтению и записи данных без использования UI.

**Ключевые принципы:**
- Только localhost (127.0.0.1), порт настраивается
- Все мутации логируются в `revision_log` с `created_by = "agent"`
- Полная паритетность с UI — агент может делать всё то же, что пользователь
- Пакетные операции для массового наполнения
- Валидация по `hint_type.schema_json`

## 2. Архитектура

```
┌─────────────────┐     HTTP (localhost)      ┌──────────────────┐
│   LLM Agent     │ ──────────────────────── │   AgentServer    │
│   (external)    │     JSON request/resp     │   (Rust, Actix)  │
└─────────────────┘                           └────────┬─────────┘
                                                       │
                                              ┌────────▼─────────┐
                                              │  Domain Services │
                                              │  (shared with UI)│
                                              └────────┬─────────┘
                                                       │
                                              ┌────────▼─────────┐
                                              │     SQLite       │
                                              └──────────────────┘
```

AgentServer использует те же domain services, что и Tauri IPC commands. Это гарантирует идентичное поведение, валидацию и логирование.

## 3. Авторизация

### 3.1. API Token

При первом включении Agent API генерируется случайный токен, который отображается в UI (Settings → Agent API). Все запросы должны содержать заголовок:

```
Authorization: Bearer <token>
```

### 3.2. Настройки

В Settings:
- **Enable Agent API:** toggle on/off
- **Port:** число (default: 21345)
- **Token:** отображение, копирование, перегенерация
- **Auto-approve:** toggle — авто-принимать изменения или показывать confirm dialog

## 4. Endpoints

### 4.1. Справочники

#### `GET /api/hint-types`

Список всех типов подсказок.

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "code": "driving_side",
      "title": "Сторона движения",
      "display_family": "polygon_fill",
      "schema_json": {"properties": {"side": {"type": "string", "enum": ["left","right","mixed"]}}},
      "is_active": true
    }
  ]
}
```

#### `POST /api/hint-types`

Создать новый тип подсказки.

**Request:**
```json
{
  "code": "vegetation",
  "title": "Растительность",
  "display_family": "icon",
  "schema_json": {
    "properties": {
      "biome": {"type": "string"},
      "key_species": {"type": "string"}
    }
  }
}
```

#### `GET /api/hint-types/:code`

Получить тип подсказки по коду, включая поля (`hint_type_field`).

### 4.2. Регионы

#### `GET /api/regions`

Список регионов с фильтрацией.

**Query params:**
- `country_code` — фильтр по стране (ISO 3166-1 alpha-2)
- `region_level` — `country`, `admin1`, `admin2`, `theme_region`
- `search` — поиск по имени (LIKE)
- `parent_id` — дочерние региона
- `limit`, `offset` — пагинация

**Response:**
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "Karnataka",
      "name_en": "Karnataka",
      "country_code": "IN",
      "region_level": "admin1",
      "anchor_lng": 75.71,
      "anchor_lat": 15.32
    }
  ],
  "total": 36
}
```

#### `GET /api/regions/:id`

Полная информация о регионе, включая все привязанные подсказки.

#### `GET /api/regions/:id/hints`

Все подсказки региона.

### 4.3. Подсказки (hints)

#### `POST /api/hints`

Создать одну подсказку.

**Request:**
```json
{
  "region_id": "uuid",
  "hint_type_code": "driving_side",
  "short_value": "Left",
  "data_json": {"side": "left"},
  "confidence": 1.0,
  "source_note": "Wikipedia"
}
```

**Response:**
```json
{
  "id": "uuid",
  "created": true
}
```

#### `POST /api/hints/batch`

Массовое создание подсказок (основной endpoint для LLM-агентов).

**Request:**
```json
{
  "hints": [
    {
      "region_id": "uuid-1",
      "hint_type_code": "driving_side",
      "short_value": "Left",
      "data_json": {"side": "left"},
      "confidence": 1.0,
      "source_note": "Wikipedia"
    },
    {
      "region_id": "uuid-2",
      "hint_type_code": "driving_side",
      "short_value": "Right",
      "data_json": {"side": "right"},
      "confidence": 1.0,
      "source_note": "Wikipedia"
    }
  ]
}
```

**Response:**
```json
{
  "created": 2,
  "errors": [],
  "ids": ["uuid-a", "uuid-b"]
}
```

Если часть записей невалидна, они возвращаются в `errors` с индексом и описанием ошибки. Валидные записи всё равно создаются (partial success).

#### `PUT /api/hints/:id`

Обновить подсказку.

#### `DELETE /api/hints/:id`

Удалить подсказку.

#### `POST /api/hints/by-country`

Удобный endpoint: создать подсказки для всех регионов страны.

**Request:**
```json
{
  "country_code": "IN",
  "region_level": "admin1",
  "hint_type_code": "driving_side",
  "short_value": "Left",
  "data_json": {"side": "left"},
  "confidence": 1.0,
  "source_note": "National law"
}
```

Создаёт подсказку для каждого региона указанного уровня в стране.

### 4.4. Ассеты

#### `POST /api/assets/upload`

Загрузить изображение (multipart/form-data).

**Form fields:**
- `file` — файл изображения
- `kind` — `flag`, `sample`, `icon`, `thumbnail`, `photo`
- `caption` — описание

**Response:**
```json
{
  "id": "uuid",
  "file_path": "assets/samples/kannada_script.png",
  "width": 200,
  "height": 100
}
```

#### `GET /api/assets/:id`

Получить метаданные ассета.

### 4.5. Компиляция слоёв

#### `POST /api/layers/compile`

Запустить пересборку compiled layers для указанных hint types.

**Request:**
```json
{
  "hint_type_codes": ["driving_side", "flag"]
}
```

Или без тела — пересобрать все.

### 4.6. Метаинформация

#### `GET /api/schema`

OpenAPI-совместимая схема всех endpoints. Полезно для LLM-агентов для автоматического понимания API.

#### `GET /api/stats`

Статистика базы знаний:

```json
{
  "regions_total": 4500,
  "regions_with_hints": 1200,
  "hints_total": 3400,
  "hints_by_type": {
    "flag": 195,
    "driving_side": 195,
    "script_sample": 42,
    "phone_hint": 180
  },
  "hints_by_author": {
    "user": 400,
    "agent": 3000
  }
}
```

## 5. Пример сценария: LLM-агент заполняет driving_side

```
1. GET /api/hint-types → найти code="driving_side", запомнить schema
2. GET /api/regions?region_level=country → получить все страны с ID
3. Агент использует свои знания для формирования данных
4. POST /api/hints/batch → отправить пакет из ~195 записей
5. POST /api/layers/compile → пересобрать слой
6. Пользователь видит обновлённую карту
```

## 6. Пример сценария: LLM-агент создаёт новый тип подсказки

```
1. POST /api/hint-types → создать "car_type" с schema_json
2. GET /api/regions?country_code=BR&region_level=admin1 → регионы Бразилии
3. POST /api/hints/batch → заполнить данные о типах машин
4. POST /api/layers/compile
```

## 7. Обработка ошибок

Все ошибки возвращаются в формате:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "data_json.side must be one of: left, right, mixed",
    "field": "data_json.side",
    "index": 3
  }
}
```

HTTP-коды:
- `200` — успех
- `201` — создано
- `400` — ошибка валидации
- `401` — невалидный токен
- `404` — сущность не найдена
- `409` — конфликт (дубликат)
- `500` — внутренняя ошибка

## 8. Rate limiting

Для предотвращения случайного флуда:
- Max 100 requests/second
- Max 10 000 hints в одном batch
- Max 50MB на upload файла

## 9. Events (WebSocket)

Опциональный WebSocket endpoint `ws://localhost:21345/ws` для получения событий:

```json
{"event": "hint:created", "data": {"id": "uuid", "region_id": "uuid", "hint_type_code": "flag"}}
{"event": "hint:updated", "data": {"id": "uuid"}}
{"event": "layer:compiled", "data": {"hint_type_code": "driving_side"}}
```

Полезно для мониторинга прогресса пакетного заполнения.
