# GuessMap — Спецификация

Интерактивный гео-атлас подсказок для тренировки GeoGuessr.
Desktop-приложение на Tauri 2 + React + MapLibre GL JS.

## Документация по модулям

| Документ | Зона ответственности |
|----------|---------------------|
| [Архитектура](architecture.md) | Общая структура системы, стек, слои приложения, потоки данных |
| [Модель данных](data-model.md) | Таблицы SQLite, ER-диаграмма, правила целостности, механизм расширяемости |
| [Система подсказок](hint-system.md) | Типы подсказок, display families, JSON Schema расширяемость, валидация |
| [Картографический движок](map-engine.md) | MapLibre sources/layers, data-driven styling, zoom-levels, взаимодействие |
| [Редактор знаний](knowledge-editor.md) | UI редактора, формы, поиск, multi-select, массовые операции, anchor editing |
| [Agent API](agent-api.md) | REST API для LLM-агентов, endpoints, batch operations, авторизация |
| [Провайдеры подложки](basemap-providers.md) | Basemap providers: OSM, PMTiles vector, Google (future) |
| [Источники геоданных](geodata-sources.md) | Natural Earth, импорт регионов, geometry_ref, ограничения |
| [Режимы отображения](display-modes.md) | Density presets, presentation modes, города, управление плотностью |
| [MVP Roadmap](mvp-roadmap.md) | Фазы разработки, зависимости, что исключено |

## Ключевые архитектурные решения

1. **Viewer-first** — границы не редактируются, только атрибуты и привязки
2. **Data-driven extensibility** — новые типы подсказок через данные, без миграций
3. **Dual access** — наполнение через UI и через Agent API (для LLM-агентов)
4. **Map-native rendering** — всё через MapLibre layers, минимум DOM-оверлеев
5. **Local-first** — SQLite + файлы, без зависимости от облака
6. **Pluggable basemap** — провайдер подложки заменяется без переделки слоёв

## Стек

- **Tauri 2** + **Rust** — shell, backend, IPC
- **React** + **TypeScript** — frontend
- **MapLibre GL JS** — WebGL-карта
- **SQLite** — хранилище данных
- **PMTiles** — compiled overlay layers

## Исходная спецификация

Подробное описание продуктовых требований и рекомендаций: [first_spec.md](first_spec.md)
