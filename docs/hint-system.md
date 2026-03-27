# Система подсказок (Hint System)

## 1. Философия

Система подсказок спроектирована по принципу **data-driven extensibility**: новые типы подсказок добавляются исключительно через данные (записи в таблицах `hint_type` и `hint_type_field`), без необходимости менять код, схему БД или выполнять миграции.

Это позволяет:
- Пользователю создавать собственные типы подсказок через UI
- LLM-агенту программно расширять каталог подсказок
- Добавлять типы вроде «тип машины съёмки», «растительность», «архитектурный стиль» без участия разработчика

Правило слоёв:
- Любой повторяемый вид информации хранится в отдельном `hint_type` (отдельный переключаемый слой в UI).
- `note` используется только для разовых свободных заметок, а не как контейнер для массовых структурных данных.

## 2. Архитектура

```
┌──────────────┐
│  hint_type   │ ◄── определяет ТИП подсказки
│  (справочник)│     (код, название, семейство отображения, JSON-схема)
└──────┬───────┘
       │ 1:N
       │
┌──────▼────────────┐
│  hint_type_field   │ ◄── определяет ПОЛЯ для типа
│  (описание полей)  │     (для генерации UI-формы)
└───────────────────┘

┌──────────────┐
│  region_hint │ ◄── конкретный ЭКЗЕМПЛЯР подсказки
│  (привязка)  │     привязан к region + hint_type
│              │     данные в short_value, full_value, data_json
└──────────────┘
```

## 3. Жизненный цикл типа подсказки

### 3.1. Создание типа

```
1. Пользователь или агент создаёт hint_type:
   code: "vegetation"
   title: "Растительность"
   display_family: "icon"
   schema_json: {
     "properties": {
       "biome": {"type": "string", "enum": ["tropical", "temperate", "arid", "arctic"]},
       "key_species": {"type": "string"},
       "density": {"type": "string", "enum": ["dense", "moderate", "sparse"]}
     },
     "required": ["biome"]
   }

2. Опционально создаёт hint_type_field записи для UI:
   - biome:     field_type=enum, options=["tropical","temperate","arid","arctic"]
   - key_species: field_type=string
   - density:   field_type=enum, options=["dense","moderate","sparse"]

3. Тип сразу доступен в UI и Agent API.
```

### 3.2. Использование типа

```
1. Пользователь выбирает регион (например, "Karnataka, India")
2. Выбирает тип подсказки "Растительность"
3. UI генерирует форму из hint_type_field / schema_json
4. Пользователь заполняет:
   short_value: "Tropical monsoon"
   data_json: {"biome": "tropical", "key_species": "Sandalwood, Teak", "density": "dense"}
5. Сохраняется region_hint
6. Карта обновляется — иконка растительности появляется в слоте regional anchor
```

### 3.3. Расширение типа

Добавление нового поля к существующему типу:

1. Обновить `schema_json` в `hint_type` (добавить новое property)
2. Добавить `hint_type_field` запись
3. Существующие `region_hint` не ломаются — новое поле просто отсутствует в их `data_json`
4. UI показывает новое поле при редактировании

## 4. Display Families

`display_family` определяет, как подсказки данного типа рендерятся на карте.

### 4.1. `polygon_fill`

Заливка полигона региона цветом. Используется для бинарных/категориальных свойств.

- **Примеры:** driving_side, coverage
- **MapLibre:** `fill` layer с data-driven `fill-color`
- **Данные:** `color` из `region_hint` или маппинг из `data_json` значения

### 4.2. `icon`

Иконка в точке anchor региона.

- **Примеры:** flag, vegetation
- **MapLibre:** `symbol` layer с `icon-image`
- **Данные:** `icon_asset_id` или `hint_type.default_icon`

### 4.3. `text`

Текстовая подпись.

- **Примеры:** phone_hint, country_domain, camera_meta, note
- **MapLibre:** `symbol` layer с `text-field`
- **Данные:** `short_value`

### 4.4. `image`

Мини-изображение (скриншот, образец).

- **Примеры:** script_sample, road_marking, sign
- **MapLibre:** `symbol` layer с загруженным в карту image
- **Данные:** `image_asset_id` → загружается как `map.addImage()`

### 4.5. `composite`

Комбинация иконки + текста.

- **MapLibre:** `symbol` layer с `icon-image` + `text-field`
- Используется когда нужно показать и иконку, и подпись

## 5. Встроенные типы

Приложение поставляется с набором предустановленных `hint_type`. Они помечены как `is_builtin` (неудаляемые, но настраиваемые):

| Code | Display | Slot | Описание |
|------|---------|------|----------|
| `flag` | icon | top | Флаг страны/региона |
| `driving_side` | polygon_fill | — | Сторона движения |
| `script_sample` | image | right | Образец письменности |
| `phone_hint` | text | bottom | Телефонный формат/код |
| `country_domain` | text | bottom | Национальный домен (ccTLD) |
| `road_marking` | image | — | Тип дорожной разметки |
| `sign` | image | — | Дорожные знаки |
| `pole` | image | — | Столбы |
| `bollard` | icon | — | Болларды |
| `coverage` | polygon_fill | — | Покрытие Google/другими |
| `camera_meta` | text | left | Google Car (признаки машины/камеры) |
| `camera_gen1` | polygon_fill | — | Camera Gen 1 |
| `camera_gen2` | polygon_fill | — | Camera Gen 2 |
| `camera_gen3` | polygon_fill | — | Camera Gen 3 |
| `camera_gen4` | polygon_fill | — | Camera Gen 4 |
| `camera_low_cam` | polygon_fill | — | Low Cam |
| `camera_shit_cam` | polygon_fill | — | Shit Cam |
| `camera_small_cam` | polygon_fill | — | Small Cam |
| `camera_trekker_gen2` | polygon_fill | — | Trekker (Gen2) |
| `camera_trekker_gen3` | polygon_fill | — | Trekker (Gen3) |
| `camera_trekker_gen4` | polygon_fill | — | Trekker (Gen4) |
| `camera_gens_tag` | text | left | Тег со всеми типами генераций по стране |
| `snow_outdoor` | polygon_fill | — | Snow coverage (outdoor) |
| `snow_indoor` | polygon_fill | — | Snow coverage (indoor) |
| `vegetation` | icon | — | Растительность |
| `note` | text | — | Произвольная заметка |

## 6. Пользовательские типы

Пользователь может создавать собственные типы через Knowledge Editor:

1. Нажать "New Hint Type" в панели слоёв
2. Заполнить: code, title, display_family
3. Определить поля (field_code, field_type, options)
4. Выбрать или загрузить иконку по умолчанию
5. Тип появляется в списке слоёв и доступен для привязки

## 7. Валидация

### 7.1. При сохранении `region_hint`

1. `region_id` должен существовать и быть `is_active`
2. `hint_type_id` должен существовать
3. Если `hint_type.schema_json` определён — `data_json` валидируется по нему
4. `color` (если указан) — валидный hex
5. `min_zoom <= max_zoom`
6. `confidence` в диапазоне [0.0, 1.0]

### 7.2. При создании `hint_type`

1. `code` — уникальный, snake_case, латиница
2. `display_family` — один из допустимых значений
3. `schema_json` (если указан) — валидный JSON Schema

## 8. Группировка и фильтрация

### 8.1. По типу

Каждый `hint_type` — отдельный переключаемый слой в UI. Пользователь включает/выключает типы независимо.

### 8.2. По региону

Фильтр "показывать подсказки только для текущей страны" фильтрует `region_hint` через `region.country_code`.

### 8.3. По автору

Фильтр `created_by`: показывать только пользовательские, только агентские, или все.

### 8.4. По уверенности

Фильтр по `confidence`: скрывать подсказки с низкой уверенностью (< порога).
