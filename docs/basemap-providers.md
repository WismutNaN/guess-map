# Провайдеры подложки (Basemap Providers)

## 1. Обзор

Приложение поддерживает несколько провайдеров подложки карты. Слои знаний (hints) рендерятся поверх подложки и не зависят от выбранного провайдера. Переключение провайдера не требует переделки логики слоёв.

## 2. Архитектура

```
┌────────────────────────────────┐
│       BasemapProvider          │ ◄── абстракция
│  ──────────────────────────    │
│  + id: string                  │
│  + name: string                │
│  + getStyle(): MapLibreStyle   │
│  + getAttribution(): string    │
│  + requiresApiKey(): boolean   │
└────────────┬───────────────────┘
             │
    ┌────────┼────────────┐
    │        │            │
┌───▼──┐ ┌──▼─────┐ ┌────▼─────┐
│ OSM  │ │ PMTiles│ │ Google   │
│ Raster│ │ Vector │ │ (future) │
└──────┘ └────────┘ └──────────┘
```

### 2.1. Интерфейс провайдера

Каждый провайдер реализует:

| Метод | Описание |
|-------|----------|
| `getStyle()` | MapLibre Style JSON (или URL) |
| `getAttribution()` | HTML-строка атрибуции |
| `requiresApiKey()` | Нужен ли ключ API |
| `validateApiKey(key)` | Проверка ключа |
| `getConfig()` | Специфические настройки |

## 3. Провайдеры

### 3.1. Open Vector Basemap (default)

**Источник:** Self-hosted PMTiles или OpenMapTiles-совместимый tile server.

**Плюсы:**
- Бесплатный, без API-ключа
- Офлайн-работа с локальным PMTiles world map
- Полный контроль стиля
- Быстрый рендер через MapLibre

**Файлы:**
- `assets/basemap/world.pmtiles` — bundled world basemap
- `assets/basemap/style.json` — MapLibre style

**Подключение:**
```js
// PMTiles protocol
import { Protocol } from "pmtiles";
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

const style = {
  version: 8,
  sources: {
    basemap: {
      type: "vector",
      url: "pmtiles:///assets/basemap/world.pmtiles"
    }
  },
  layers: [/* OpenMapTiles-compatible layers */]
};
```

### 3.2. OSM Raster Tiles (fallback)

**Источник:** OpenStreetMap tile servers (raster).

**Плюсы:**
- Простейшее подключение
- Не требует скачивания данных

**Минусы:**
- Растровый рендер (нет data-driven styling подложки)
- Требуется интернет
- Ограничения по rate limiting

**Подключение:**
```js
{
  sources: {
    basemap: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors"
    }
  }
}
```

### 3.3. Google Map Tiles (future, optional)

**Источник:** Google Map Tiles API.

**Ограничения:**
- Требуется API key и session token
- Строгие условия атрибуции (логотип Google, нельзя скрывать)
- Запрет на prefetch/cache/offline
- Платный при превышении бесплатных лимитов

**Доступные стили:** Roadmap, Satellite, Terrain

**Статус:** Закладывается как расширение второй очереди. Не является обязательной зависимостью для MVP.

## 4. Переключение в UI

Settings → Map → Basemap Provider:

```
┌────────────────────────────────┐
│ Basemap Provider               │
│                                │
│ ● Vector (offline, default)    │
│ ○ OSM Raster (online)          │
│ ○ Google Maps (requires key)   │
│                                │
│ API Key: [____________] [Test] │
│                                │
│ Style variant:                 │
│ [Standard ▼]                  │
│  · Standard                    │
│  · Light                       │
│  · Dark                        │
│  · Satellite (Google only)     │
└────────────────────────────────┘
```

Переключение вызывает `map.setStyle(newStyle)`. MapLibre обрабатывает diff стилей — hint-слои сохраняются.

## 5. Стили подложки

Для векторного провайдера поставляются несколько стилевых вариантов:

| Стиль | Описание | Когда использовать |
|-------|----------|--------------------|
| Standard | Нейтральная карта, баланс деталей | По умолчанию |
| Light | Светлый минималистичный фон | Когда много hint-слоёв включено |
| Dark | Тёмный фон | Для контрастных подсказок, ночной режим |
| Minimal | Только границы и водоёмы | Максимальный фокус на подсказках |

## 6. Атрибуция

Каждый провайдер определяет свою строку атрибуции. Она отображается в правом нижнем углу карты (MapLibre AttributionControl). Атрибуция обязательна и не может быть скрыта.
