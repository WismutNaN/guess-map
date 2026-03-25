# Редактор знаний (Knowledge Editor)

## 1. Обзор

Knowledge Editor — основной интерфейс для наполнения базы знаний. Позволяет визуально выбирать регионы на карте и назначать им подсказки без ручной работы с ID. Реализуется как режим приложения (toggle) с боковыми панелями поверх карты.

## 2. Компоновка экрана

```
┌────────────────────────────────────────────────────────────────┐
│  Toolbar: [Study Mode | Editor Mode]  [Search...]  [Settings] │
├────────┬──────────────────────────────────────┬────────────────┤
│        │                                      │                │
│ Layer  │                                      │   Region       │
│ Panel  │           MapLibre Map               │   Inspector    │
│        │                                      │                │
│ ────── │                                      │ ───────────    │
│ hint   │                                      │ Properties     │
│ types  │                                      │ form           │
│ list   │                                      │                │
│        │                                      │ ───────────    │
│ ────── │                                      │ Attached       │
│ filter │                                      │ hints list     │
│ options│                                      │                │
│        │                                      │ ───────────    │
│        │                                      │ Bulk actions   │
│        │                                      │                │
├────────┴──────────────────────────────────────┴────────────────┤
│  Status bar: [Selected: 3 regions] [Last save: 2m ago]        │
└────────────────────────────────────────────────────────────────┘
```

## 3. Левая панель: Layer Panel

### 3.1. Список типов подсказок

Древовидный список всех `hint_type` с checkbox-ами видимости:

```
☑ Flags
☑ Driving Side
☐ Script Samples
☑ Phone Hints
☐ Road Markings
☐ Signs
☐ Poles
☐ Bollards
☐ Coverage
☐ Camera Meta
☐ Car Type
☐ Vegetation
☐ Notes
───────────────
[+ New Hint Type]
```

Каждый элемент:
- Checkbox — включает/выключает слой на карте
- Иконка типа
- Название
- Счётчик привязанных подсказок (badge)
- Контекстное меню: Edit Type, Delete Type (если пользовательский)

### 3.2. Фильтры

- **Country filter:** показывать регионы только выбранной страны
- **Level filter:** country / admin1 / admin2 / theme_region
- **Author filter:** user / agent / all
- **Confidence filter:** ползунок минимальной уверенности
- **Empty regions:** показать только регионы без подсказок данного типа

## 4. Правая панель: Region Inspector

Открывается при выборе региона (клик на карте или через поиск).

### 4.1. Заголовок

```
┌────────────────────────────────┐
│ 📍 Karnataka, India           │
│ admin1 · IN-KA                │
│ Anchor: 75.71°E, 15.32°N     │
│ [Edit Anchor] [Deselect]      │
└────────────────────────────────┘
```

### 4.2. Список привязанных подсказок

Для выбранного региона показываются все `region_hint`:

```
┌────────────────────────────────┐
│ ── Attached Hints (4) ──      │
│                                │
│ 🏳 Flag                       │
│   India tricolor               │
│   [Edit] [Delete]              │
│                                │
│ 🚗 Driving Side               │
│   Left                         │
│   [Edit] [Delete]              │
│                                │
│ ✍ Script Sample               │
│   Kannada (ಕನ್ನಡ)              │
│   [image preview]              │
│   [Edit] [Delete]              │
│                                │
│ 📞 Phone Hint                 │
│   +91 80xx (Bangalore prefix)  │
│   [Edit] [Delete]              │
│                                │
│ [+ Add Hint]                   │
└────────────────────────────────┘
```

### 4.3. Форма добавления/редактирования подсказки

При нажатии "Add Hint" или "Edit":

```
┌────────────────────────────────┐
│ ── Add Hint ──                │
│                                │
│ Type: [Script Sample ▼]       │
│                                │
│ Short value:                   │
│ [Kannada                    ]  │
│                                │
│ Full description:              │
│ [Kannada script used in     ]  │
│ [Karnataka state            ]  │
│                                │
│ ── Type-specific fields ──    │
│ Script name:                   │
│ [Kannada                    ]  │
│                                │
│ Image:                         │
│ [📎 Upload] [preview.png]     │
│                                │
│ Color: [#4A90D9]              │
│ Confidence: [0.9 ────●──]    │
│ Zoom: [3] to [22]            │
│ Source: [manual observation]   │
│                                │
│ [Cancel] [Save]               │
└────────────────────────────────┘
```

Поля "Type-specific fields" генерируются динамически из `hint_type.schema_json` / `hint_type_field`.

## 5. Поиск регионов

### 5.1. Строка поиска

Глобальный поиск в toolbar:
- Поиск по `region.name` и `region.name_en`
- Autocomplete с debounce (300ms)
- Результаты группируются по стране
- Клик по результату → карта летит к региону, регион выделяется

### 5.2. Пример результатов

```
Search: "karn"
─────────────────
🇮🇳 India
  Karnataka (admin1)
  Karnal, Haryana (admin2)
🇦🇹 Austria
  Kärnten / Carinthia (admin1)
```

## 6. Multi-select и массовые операции

### 6.1. Способы мультивыбора

- **Ctrl+Click** — добавить/убрать регион из выделения
- **Shift+Drag** — прямоугольное выделение (lasso)
- **"Select all in country"** — через контекстное меню или фильтр
- **Результаты поиска** — checkbox-ы для массового выбора

### 6.2. Панель массовых операций

Появляется когда выбрано > 1 региона:

```
┌────────────────────────────────┐
│ ── Bulk Actions (5 selected) ─│
│                                │
│ Selected regions:              │
│  · Karnataka                   │
│  · Tamil Nadu                  │
│  · Kerala                      │
│  · Andhra Pradesh              │
│  · Telangana                   │
│  [Clear selection]             │
│                                │
│ Apply to all selected:         │
│ Type: [Driving Side ▼]        │
│ Value: [Left ▼]               │
│ Confidence: [1.0]             │
│                                │
│ [Apply to 5 regions]          │
└────────────────────────────────┘
```

### 6.3. Поддерживаемые массовые операции

- Назначить один hint всем выбранным
- Назначить общую иконку
- Выставить общие zoom-правила (`min_zoom`, `max_zoom`)
- Применить общий приоритет отображения
- Удалить подсказки определённого типа у всех выбранных

## 7. Управление якорем (Anchor)

### 7.1. Зачем

Центр региона может быть неудобен для отображения подсказок (маленькие, вытянутые, островные регионы). Якорь позволяет сместить точку привязки.

### 7.2. UI

В Region Inspector кнопка "Edit Anchor" переводит карту в режим размещения якоря:
1. Показывается текущий anchor (маркер)
2. Пользователь перетаскивает маркер
3. Или вводит координаты вручную
4. Дополнительно: offset в пикселях (`anchor_offset_x`, `anchor_offset_y`)
5. Подтверждение → сохранение в `region`

## 8. Загрузка изображений

### 8.1. Процесс

1. Пользователь нажимает "Upload" в форме подсказки
2. Открывается системный file picker (Tauri dialog)
3. Файл копируется в управляемую assets-директорию
4. Создаётся запись в `asset` с размерами и метаданными
5. `image_asset_id` записывается в `region_hint`
6. Превью отображается в форме и на карте

### 8.2. Поддерживаемые форматы

- PNG, JPEG, WebP, SVG (для иконок)
- Рекомендуемый размер для samples: 200×100px
- Рекомендуемый размер для иконок: 32×32px или 64×64px

## 9. Журнал изменений

### 9.1. Доступ

Кнопка "History" в toolbar или в Region Inspector.

### 9.2. Отображение

```
┌────────────────────────────────┐
│ ── Change Log ──              │
│                                │
│ 2026-03-26 14:30 · user       │
│ Updated region_hint for        │
│ Karnataka: script_sample       │
│ short_value: "" → "Kannada"    │
│                                │
│ 2026-03-26 14:25 · agent      │
│ Batch created 28 region_hints  │
│ driving_side for South Asia    │
│                                │
│ 2026-03-26 13:00 · user       │
│ Created hint_type: vegetation  │
│                                │
│ [Load more...]                │
└────────────────────────────────┘
```

### 9.3. Фильтры журнала

- По типу сущности: region, region_hint, hint_type, asset
- По автору: user, agent
- По дате
- По конкретному региону

## 10. Горячие клавиши

| Клавиша | Действие |
|---------|----------|
| `Ctrl+F` | Фокус на поиск |
| `Ctrl+S` | Сохранить текущие изменения |
| `Ctrl+Z` | Отменить последнее изменение |
| `Escape` | Снять выделение / закрыть панель |
| `Ctrl+Click` | Multi-select |
| `Shift+Drag` | Lasso select |
| `Delete` | Удалить выбранную подсказку |
| `E` | Режим редактирования выбранного |
| `Tab` | Переключение между Study / Editor mode |
