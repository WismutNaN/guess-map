# Архитектура системы

## 1. Обзор

**GuessMap** — desktop-приложение для тренировки GeoGuessr в формате интерактивного гео-атласа подсказок. Приложение является **viewer-first**: пользователь работает с готовыми геометриями регионов, назначая им атрибуты и подсказки через визуальный интерфейс. Редактирование границ не предусмотрено.

## 2. Технологический стек

| Слой | Технология | Назначение |
|------|-----------|------------|
| Shell | **Tauri 2** | Нативная оболочка, IPC, доступ к FS и SQLite |
| Backend | **Rust** | Команды Tauri, бизнес-логика, компиляция слоёв, Agent API |
| Frontend | **React + TypeScript** | UI: редактор знаний, панели, контролы |
| Карта | **MapLibre GL JS** | WebGL-рендер карты, слои, expressions, символы |
| БД | **SQLite** (Tauri SQL plugin) | Локальное хранилище: регионы, подсказки, ассеты, лог |
| Тайлы | **PMTiles** | Compiled overlay layers для быстрого рендера |
| Файлы | **Tauri FS plugin** | Управление изображениями и ресурсами |

## 3. Высокоуровневая архитектура

```
┌─────────────────────────────────────────────────────┐
│                    Tauri Shell                       │
│  ┌───────────────────────┐  ┌─────────────────────┐ │
│  │     React Frontend    │  │    Rust Backend      │ │
│  │                       │  │                      │ │
│  │  ┌─────────────────┐  │  │  ┌────────────────┐  │ │
│  │  │   MapLibre GL   │  │  │  │  Tauri Commands │  │ │
│  │  │   (WebGL Map)   │  │  │  │  (IPC handlers) │  │ │
│  │  └─────────────────┘  │  │  └───────┬────────┘  │ │
│  │  ┌─────────────────┐  │  │          │           │ │
│  │  │ Knowledge Editor│  │  │  ┌───────▼────────┐  │ │
│  │  │  (React panels) │  │  │  │  Domain Logic  │  │ │
│  │  └─────────────────┘  │  │  │  (Rust modules)│  │ │
│  │  ┌─────────────────┐  │  │  └───────┬────────┘  │ │
│  │  │  Layer Controls │  │  │          │           │ │
│  │  │  (React panels) │  │  │  ┌───────▼────────┐  │ │
│  │  └─────────────────┘  │  │  │    Storage     │  │ │
│  └───────────┬───────────┘  │  │ SQLite + FS    │  │ │
│              │ IPC (invoke) │  └────────────────┘  │ │
│              └──────────────┘                      │ │
│                                                    │ │
│  ┌─────────────────────────────────────────────┐   │ │
│  │              Agent API (HTTP)               │   │ │
│  │         localhost-only REST/JSON             │   │ │
│  └─────────────────────────────────────────────┘   │ │
└─────────────────────────────────────────────────────┘

┌──────────────┐  ┌──────────────┐  ┌────────────────┐
│  SQLite DB   │  │  Assets Dir  │  │  PMTiles Files │
│  (regions,   │  │  (images,    │  │  (compiled     │
│   hints,     │  │   icons,     │  │   overlay      │
│   log)       │  │   samples)   │  │   layers)      │
└──────────────┘  └──────────────┘  └────────────────┘
```

## 4. Слои приложения

### 4.1. Presentation Layer (React)

- **MapView** — контейнер MapLibre GL JS, управление источниками и слоями
- **LayerPanel** — переключение слоёв подсказок, пресеты плотности
- **KnowledgeEditor** — поиск/выбор регионов, редактирование свойств, массовые операции
- **RegionInspector** — просмотр и редактирование свойств выбранного региона
- **SearchBar** — поиск регионов по названию
- **AssetManager** — загрузка и управление изображениями

### 4.2. IPC Layer (Tauri invoke)

Все вызовы Rust из фронтенда идут через типизированный `invoke()`. Команды группируются по доменам:

- `region::*` — CRUD регионов, поиск, фильтрация
- `hint::*` — CRUD подсказок, массовые операции
- `asset::*` — загрузка/удаление ассетов
- `layer::*` — компиляция слоёв, экспорт GeoJSON
- `agent::*` — API для LLM-агентов (см. [Agent API](agent-api.md))

### 4.3. Domain Layer (Rust)

- **RegionService** — управление регионами, геометриями, якорями
- **HintService** — управление подсказками, типами, валидация
- **AssetService** — управление файлами изображений
- **LayerCompiler** — сборка GeoJSON/PMTiles из данных БД
- **RevisionService** — журнал изменений
- **AgentServer** — HTTP-сервер для LLM-агентов

### 4.4. Storage Layer

- **SQLite** — единственный источник истины для структурированных данных
- **File System** — хранение изображений и иконок в управляемой директории
- **PMTiles** — скомпилированные тайлы для быстрого рендера overlay-слоёв

## 5. Потоки данных

### 5.1. Пользователь редактирует подсказку

```
User click → React KnowledgeEditor → invoke("hint::upsert", data)
  → Rust HintService → SQLite INSERT/UPDATE
  → Rust LayerCompiler → обновление GeoJSON source
  → IPC event → React MapView → MapLibre source update
  → Карта перерисовывается
```

### 5.2. LLM-агент добавляет данные

```
LLM Agent → HTTP POST /api/hints/batch → AgentServer
  → HintService → SQLite batch INSERT
  → LayerCompiler → пересборка затронутых слоёв
  → IPC event → MapView обновляется (если открыт)
```

### 5.3. Переключение слоя

```
User toggle → React LayerPanel → MapLibre setLayoutProperty(visibility)
  → Мгновенное включение/выключение (данные уже загружены)
```

## 6. Конкурентный доступ к SQLite

UI (Tauri IPC) и Agent API (HTTP-сервер) работают с одной БД одновременно. Стратегия:

1. **WAL mode** — включается при инициализации: `PRAGMA journal_mode=WAL`. Позволяет одновременные чтения и один параллельный писатель без блокировки читателей.
2. **Единый connection pool** — Rust-сторона владеет пулом соединений (`r2d2` или `deadpool`). И IPC commands, и AgentServer используют один пул.
3. **Транзакции** — batch-операции (Agent API `POST /hints/batch`) выполняются в одной транзакции. При ошибке — rollback всей транзакции (атомарность).
4. **Busy timeout** — `PRAGMA busy_timeout=5000`. Если БД заблокирована, ожидание до 5 секунд вместо немедленной ошибки.

## 7. Экспорт и импорт базы знаний

### 7.1. Экспорт

Формат: ZIP-архив со структурой:

```
guessmap-export-2026-03-26.zip
├── data.json          # все hint_type, region_hint, привязки
├── settings.json      # пользовательские hint_type (не builtin)
├── assets/            # все изображения
│   ├── flags/
│   ├── samples/
│   └── icons/
└── manifest.json      # версия формата, дата, статистика
```

### 7.2. Импорт

Режимы:
- **Merge** — добавить новые, обновить существующие (по region_id + hint_type_code)
- **Replace** — полная замена всех подсказок
- **Selective** — пользователь выбирает, какие hint_type импортировать

### 7.3. Agent API endpoints

- `GET /api/export` — скачать ZIP-архив базы знаний
- `POST /api/import` — загрузить ZIP-архив (multipart/form-data), query param `mode=merge|replace`

## 8. Принципы архитектуры

1. **Viewer-first** — границы не редактируются, только атрибуты и привязки
2. **Extensible hints** — новые типы подсказок добавляются через данные, без изменения схемы (см. [Hint System](hint-system.md))
3. **Dual access** — данные доступны и через UI, и через Agent API
4. **Map-native rendering** — основной рендер через MapLibre layers, HTML-оверлеи только для hover/pin/selection
5. **Local-first** — все данные хранятся локально, нет зависимости от внешних сервисов
6. **Zoom-dependent visualization** — плотность и детализация привязаны к масштабу карты
7. **Pluggable basemap** — провайдер подложки заменяется без переделки слоёв знаний
