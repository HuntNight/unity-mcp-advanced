# 🔥 Claude Enhanced MCP — Модульная архитектура

## 🚨 ВАЖНО: ОСТАНАВЛИВАЙ РАБОТУ И ПРОСИ ПОЛЬЗОВАТЕЛЯ ПЕРЕЗАГРУЗИТЬ MCP сервер в Cursor после любых изменений в скриптах MCP!

## 📁 Структура проекта

```
claude-mcp/
├── index.js              # Главный файл
├── tools/                # Модули MCP инструментов
│   ├── unity.js          # Unity Bridge инструменты
│   └── terminal.js       # Системные инструменты
└── utils/                # Общие утилиты
    ├── mcpServer.js      # Динамическая загрузка модулей
    ├── logger.js         # Логирование
    └── decorators.js     # Система декораторов
```

## ⚡ Как добавить новый модуль

1. Создай файл `tools/my-module.js`
2. Используй правильный формат экспорта:

```javascript
export const myTools = [
  {
    name: "tool_name",
    description: "Описание инструмента",
    handler: async (args) => {
      const { param } = args;
      return `Результат: ${param}`;
    }
  }
];

export const myModule = {
  namespace: "my",
  description: "Описание модуля",
  tools: myTools
};
```

3. Перезапусти MCP сервер в Cursor

## 🎨 Система декораторов

Декораторы применяются на трёх уровнях:

### Tool-level (для конкретного инструмента)
```javascript
{
  name: "my_tool",
  decorators: [performanceDecorator],
  handler: async (args) => { /* логика */ }
}
```

### Module-level (для всех инструментов модуля)
```javascript
export const myModule = {
  namespace: "my",
  decorators: [moduleDecorator],
  tools: myTools
};
```

### System-level (глобальные)
Автоматически применяются ко всем инструментам:
- Системная информация
- Логи отладки
- Скриншоты (при `systemScreenshot: true`)

## 🔄 Обработка ошибок

### Успешный результат - `return`
```javascript
return "✅ Операция выполнена";
// или
return { type: "text", text: "Результат" };
```

### Ошибка - `throw new Error()`
```javascript
throw new Error("❌ Что-то пошло не так");
```

## 🔧 Существующие модули

- **unity.js** - 🎮 Unity Bridge — Полный контроль Unity (7 инструментов)
  - screenshot — скриншот Unity Editor. Параметры: `width`, `height`, `view_type` (game/scene).
  - camera_screenshot — скриншот с произвольной позиции камеры. Параметры: `position`, `target`, `fov`, `width`, `height`.
  - scene_hierarchy — просмотр иерархии (имя, id, компоненты). Поддерживает name_glob/name_regex/tag_glob, ограничение по поддереву path с авто-определением типа: exact|glob|regex, max_depth, max_results, summary (true = только статистика). Всегда нечувствительно к регистру, неактивные включены и помечаются. Встроенный лимит ответа 5000 символов (перекрывается allow_large_response).
  - scene_grep — умный WHERE + SELECT DSL для точечного инспектирования сцены. Поддерживает name_glob/name_regex/tag_glob, path (auto-path: exact|glob|regex), max_depth, max_results, where, select, allow_large_response. Всегда нечувствительно к регистру, неактивные включены и помечаются. Ограничение ответа 5000 символов (перекрывается allow_large_response).
  - execute — универсальное выполнение C# кода. Поддерживает `ImageConversion` и основные модули Unity.
  - play_mode — управление режимом Play Mode в Unity Editor
  - scene_radius — поиск объектов в радиусе от точки
- **terminal.js** - Системная информация, порты, процессы (5 инструментов)
  - system_info — мониторинг системы, портов и процессов
  - check_port — проверка статуса порта
  - find_process — поиск процессов по имени
  - safe_curl — HTTP запросы
  - wait_for_user — интерактивный помощник для вопросов

**Всего: 12 инструментов**

## 🛠️ Принципы разработки

- Один файл = одна тематика
- Умные инструменты, не простые алиасы
- Автоматический поиск workspace root, git репозиториев
- Красивые ответы с эмодзи и форматированием
- Graceful error handling

## 📋 Формат экспорта модуля

**Обязательная структура:**
```javascript
// Массив инструментов
export const [namespace]Tools = [ /* инструменты */ ];

// Экспорт модуля
export const [namespace]Module = {
  namespace: "namespace",
  description: "Описание модуля", 
  tools: [namespace]Tools,
  decorators: [] // опционально
};
```

## 🎮 Unity: scene_hierarchy и scene_grep — краткая спецификация

- Общие правила:
  - Нечувствительность к регистру всегда включена
  - Неактивные объекты всегда включены в результаты и помечаются в заголовке
  - Фиксированный таймаут операций Unity 5 секунд (на стороне Unity)
  - Параметр offset отсутствует
  - Ограничение ответа: 5000 символов. Для больших ответов указывайте `allow_large_response: true`

- scene_hierarchy:
  - Параметры: `name_glob`, `name_regex`, `tag_glob`, `path` (auto-path: exact|glob|regex), `max_depth`, `max_results`, `allow_large_response`
  - Вывод: имя объекта, id, список компонент (без детального режима)

- scene_grep:
  - Параметры: `name_glob`, `name_regex`, `tag_glob`, `path` (auto-path: exact|glob|regex), `max_depth`, `max_results`, `where`, `select`, `allow_large_response`
  - WHERE-DSL: `and`/`or`/`not`, скобки `()`, сравнения `== != > >= < <=`, строковые функции `contains`, `startswith`, `endswith`, `matches` (regex), `hasComp(Type)`
  - Пути: `name`, `id`, `path`, `active`, `tag`, `layer`, `GameObject.*`, `Transform.*`, `Camera.*`, `Light.*`, `Rigidbody.*`, `<Component>.<property>`, индексация массивов: `materials[0].name`
  - SELECT-DSL: список полей и/или алиасы: `"GameObject.name"`, `"Transform.position"`, `"pos = Transform.position"`, `"materials[0].name"`
  - Важно: префиксный поиск делайте через `name_glob="Prefix*"`. Конструкция `startswith(GameObject.name, "Prefix")` автоматически конвертируется в `name_glob` и исключается из WHERE для эффективности

### Auto-path: exact | glob | regex

- exact: строка без спецсимволов считается точным путём. Сопоставляется как `^escaped$` (без учёта регистра)
- glob: если присутствуют `*` `?` или диапазоны `[a-z]`, конвертируется в regex через Glob→Regex и матчится без учёта регистра
- regex: если присутствуют явные regex-метасимволы (`^ $ ( ) | { } \` и т.п.), трактуется как C#/.NET RegExp и матчится без учёта регистра

- Примеры:
  - Найти все объекты, начинающиеся на Garden, вывести имя и позицию:
    - `name_glob = "Garden*"`
    - `select = ["GameObject.name", "Transform.position"]`

После изменений в `tools/unity.js` перезапустите MCP сервер в Cursor.

**Автоматическая загрузка:** MCP сервер сканирует папку `tools/` и загружает все `.js` файлы с правильным форматом экспорта.

## ⚠️ Частые ошибки

❌ **Неправильный экспорт:**
```javascript
export default { tools: [...] }; // НЕ РАБОТАЕТ
```

✅ **Правильный экспорт:**
```javascript
export const myModule = { namespace: "my", tools: [...] };
```

❌ **Неправильная сигнатура handler:**
```javascript
handler: async (args, context) => { /* НЕ РАБОТАЕТ */ }
```

✅ **Правильная сигнатура:**
```javascript
handler: async (args) => { /* РАБОТАЕТ */ }
```