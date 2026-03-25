# Режимы отображения

## 1. Обзор

Система предоставляет два измерения управления визуальной плотностью:
- **Density presets** — сколько информации показывать
- **Presentation modes** — как представлять подсказки

Комбинация этих настроек позволяет адаптировать карту под текущую задачу.

## 2. Пресеты плотности (Density Presets)

### 2.1. Minimal

- Только цветовая заливка полигонов (если включена)
- Флаги — только для стран при zoom ≥ 4
- Текстовые подсказки скрыты
- Изображения скрыты
- Города — только столицы

**Когда использовать:** Общий обзор мира, одна категория подсказок.

### 2.2. Balanced (default)

- Заливка полигонов
- Флаги и иконки с collision avoidance
- Короткие текстовые подписи при zoom ≥ 5
- Изображения — при zoom ≥ 8
- Города — столицы + крупные города

**Когда использовать:** Повседневное изучение, средний масштаб.

### 2.3. Dense

- Все иконки с `icon-allow-overlap: true`
- Текстовые подписи для всех видимых подсказок
- Изображения — при zoom ≥ 6
- Множественные подсказки в слотах
- Все города при zoom ≥ 6

**Когда использовать:** Детальное сравнение соседних регионов.

### 2.4. Study

- Максимальная плотность
- Все подсказки отображаются без ограничений коллизий
- Мини-карточки при hover
- Развёрнутые подписи
- Все города

**Когда использовать:** Глубокое изучение конкретной страны/региона.

## 3. Режимы представления подсказок

### 3.1. Icons only

Подсказки показываются только иконками в anchor-точках. Текст отображается при hover.

```
  🇮🇳       🇵🇰       🇧🇩
         🇳🇵
```

### 3.2. Icons + short text

Иконки сопровождаются `short_value`:

```
  🇮🇳 India    🇵🇰 Pakistan    🇧🇩 Bangladesh
          🇳🇵 Nepal
```

### 3.3. Icons + thumbnails

Вместо текста — мини-изображения из `image_asset_id`:

```
  🇮🇳 [देवनागरी]    🇵🇰 [نستعلیق]    🇧🇩 [বাংলা]
```

## 4. Реализация

### 4.1. Density presets в MapLibre

Каждый пресет определяет набор переопределений для map layers:

```typescript
interface DensityPreset {
  id: string;
  label: string;
  overrides: {
    iconAllowOverlap: boolean;
    textMinZoom: number;
    imageMinZoom: number;
    cityScaleRankMax: number;
    collisionEnabled: boolean;
    hintMinZoomShift: number; // сдвиг min_zoom для всех hints
  };
}

const PRESETS: Record<string, DensityPreset> = {
  minimal: {
    id: "minimal",
    label: "Minimal",
    overrides: {
      iconAllowOverlap: false,
      textMinZoom: 99,       // text hidden
      imageMinZoom: 99,      // images hidden
      cityScaleRankMax: 1,   // only capitals
      collisionEnabled: true,
      hintMinZoomShift: 2,   // show hints 2 zoom levels later
    },
  },
  balanced: { /* ... */ },
  dense: { /* ... */ },
  study: { /* ... */ },
};
```

### 4.2. Presentation modes

Управляют layout properties символьных слоёв:

```typescript
type PresentationMode = "icons_only" | "icons_text" | "icons_thumbnails";

function applyPresentation(mode: PresentationMode, map: MapLibreMap) {
  switch (mode) {
    case "icons_only":
      // text-field → "" для всех hint layers
      // icon-image → оставить
      break;
    case "icons_text":
      // text-field → ["get", "short_value"]
      // icon-image → оставить
      break;
    case "icons_thumbnails":
      // text-field → ""
      // icon-image → ["get", "thumbnail_image"]
      break;
  }
}
```

## 5. UI переключения

Toolbar содержит два контрола:

```
[Density: ◉ Minimal ○ Balanced ○ Dense ○ Study]
[Show: ○ Icons ◉ Icons+Text ○ Icons+Images]
```

Переключение мгновенное — только изменение layout/paint properties существующих слоёв.

## 6. Города

### 6.1. Логика отображения

Города из Natural Earth Populated Places отображаются как отдельный слой с zoom-зависимой фильтрацией:

| Zoom | Отображаются |
|------|-------------|
| 1–3 | Только Admin-0 capitals (SCALERANK ≤ 1) |
| 4–5 | + крупнейшие города (SCALERANK ≤ 3) |
| 6–7 | + крупные города (SCALERANK ≤ 5) |
| 8–9 | + средние города (SCALERANK ≤ 7) |
| 10+ | Все города |

### 6.2. Управление

В Layer Panel toggle "Cities" для быстрого включения/выключения, если метки мешают учебным слоям.

## 7. Взаимодействие между режимами и слоями

Все hint-слои подчиняются текущему density preset и presentation mode. При этом:
- `polygon_fill` слои не зависят от presentation mode (заливка всегда видна, если слой включён)
- `icon` / `text` / `image` слои реагируют на оба параметра
- Пользовательские `min_zoom` / `max_zoom` в `region_hint` служат базой, к которой применяется `hintMinZoomShift` из preset
