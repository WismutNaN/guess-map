# Источники геоданных

## 1. Обзор

Приложение не предусматривает редактирование границ. Геометрии регионов берутся из готовых открытых наборов данных и используются как-есть. Это осознанное архитектурное решение, упрощающее систему.

## 2. Источники

### 2.1. Natural Earth (основной)

**URL:** https://www.naturalearthdata.com

Открытый набор векторных и растровых данных для картографии.

#### Используемые наборы (масштаб 1:10m):

| Набор | Файл | Описание | Кол-во объектов |
|-------|------|----------|----------------|
| Admin-0 Countries | `ne_10m_admin_0_countries` | Полигоны стран | ~260 |
| Admin-1 States/Provinces | `ne_10m_admin_1_states_provinces` | Полигоны регионов | ~4 500 |
| Populated Places | `ne_10m_populated_places` | Города с атрибутами | ~7 300 |

#### Ключевые атрибуты Admin-0:
- `ISO_A2` — код страны (ISO 3166-1 alpha-2)
- `NAME`, `NAME_EN` — названия
- `geometry` — MultiPolygon

#### Ключевые атрибуты Admin-1:
- `iso_3166_2` — код региона
- `name`, `name_en` — названия
- `admin` — название страны
- `iso_a2` — код страны
- `geometry` — MultiPolygon

#### Ключевые атрибуты Populated Places:
- `NAME` — название
- `ADM1NAME` — регион
- `SOV0NAME` — страна
- `SCALERANK` — ранг масштаба (0 = крупнейшие, 10 = мелкие)
- `FEATURECLA` — класс (Admin-0 capital, Admin-1 capital, Populated place)
- `POP_MAX` — население
- `LONGITUDE`, `LATITUDE` — координаты

### 2.2. GeoNames (перспективный)

**URL:** https://www.geonames.org

Более 11 млн географических названий. Может использоваться для:
- Расширенного поиска по городам
- Альтернативных названий на разных языках
- Более полного набора населённых пунктов

**Статус:** Не включается в MVP, закладывается как опция.

## 3. Pipeline импорта

### 3.1. Первоначальная загрузка

При первом запуске (или по команде "Reimport geodata"):

```
1. Читаем bundled GeoJSON файлы из assets/geodata/
2. Для каждого country feature:
   → INSERT INTO region (name, name_en, country_code, region_level='country', geometry_ref, anchor_lng, anchor_lat)
   → anchor = centroid полигона
3. Для каждого admin1 feature:
   → Находим parent region по country_code
   → INSERT INTO region (name, name_en, country_code, region_level='admin1', parent_id, geometry_ref, anchor_lng, anchor_lat)
4. Для populated places:
   → Сохраняем в отдельный GeoJSON source для карты
   → Не создаём записи в region (города — это layer подложки, не редактируемые сущности)
```

### 3.2. Формат geometry_ref

`geometry_ref` — ключ, связывающий запись в `region` с геометрией в GeoJSON/PMTiles файле. Формат:

```
{source_file}:{feature_id}
```

Примеры:
- `countries:RU` — Россия в файле стран
- `admin1:IN-KA` — Karnataka в файле admin1

### 3.3. Вычисление anchor

По умолчанию anchor = centroid полигона. Для некоторых регионов (островные, вытянутые) centroid может оказаться за пределами полигона. В таких случаях используется `polylabel` (pole of inaccessibility) — точка, максимально удалённая от краёв полигона.

Пользователь может позже вручную сместить anchor через UI.

## 4. Bundled файлы

В директории `assets/geodata/` приложение поставляет:

```
assets/
  geodata/
    ne_10m_admin_0_countries.geojson    (~25 MB simplified)
    ne_10m_admin_1_states_provinces.geojson  (~60 MB simplified)
    ne_10m_populated_places.geojson     (~3 MB)
```

### 4.1. Simplification

Для уменьшения размера и ускорения рендера геометрии упрощаются на этапе сборки:
- `mapshaper` или `tippecanoe` для simplification
- Целевая точность: ~100m при zoom 10
- Формат: GeoJSON (для импорта) + PMTiles (для рендера)

### 4.2. PMTiles для рендера

Для быстрого рендера на карте геометрии конвертируются в PMTiles:

```
assets/
  tiles/
    regions-countries.pmtiles
    regions-admin1.pmtiles
    cities.pmtiles
```

## 5. Ограничения Natural Earth

| Ограничение | Влияние | Решение |
|-------------|---------|---------|
| Границы — de facto | Спорные территории показываются по факту | Зафиксировано как осознанное решение для учебного атласа |
| Admin-1 неполон для мелких стран | Нет субрегионов для микрогосударств | Приемлемо — подсказки привязываются к уровню country |
| Нет admin-2 | Нет районов/округов | При необходимости добавляются как `theme_region` |

## 6. Тематические регионы

Помимо administrative boundaries, система поддерживает `theme_region` — пользовательские наборы регионов для специфических подсказок:

- Языковые зоны (не совпадают с admin-границами)
- Климатические зоны
- Зоны покрытия Google Street View

Тематические регионы загружаются пользователем как GeoJSON файлы через UI или Agent API.

## 7. Обновление геоданных

Геоданные обновляются редко (Natural Earth — раз в несколько лет). Процесс:
1. Разработчик обновляет bundled файлы в новой версии приложения
2. При обновлении приложения запускается миграция: сравнение geometry_ref, обновление изменившихся полигонов
3. Пользовательские подсказки сохраняются (привязка по `region.id`, не по геометрии)
