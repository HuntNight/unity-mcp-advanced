# 🔥 Claude Enhanced MCP — Модульная архитектура

## 🚨 ВАЖНО: ОСТАНАВЛИВАЙ РАБОТУ И ПРОСИ ПОЛЬЗОВАТЕЛЯ ПЕРЕЗАГРУЗИТЬ MCP сервер в Cursor после любых изменений в скриптах MCP!

## 📁 Структура проекта

```
claude-mcp/
├── index.js              # Главный файл
├── tools/                # Модули MCP инструментов
│   ├── unity.js          # Unity Bridge инструменты (ПЕРЕПИСАН!)
│   ├── git.js            # Git операции
│   ├── filesystem.js     # Файловые операции
│   ├── smart-files.js    # Умные файловые операции (НОВОЕ!)
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
    inputSchema: {
      type: "object",
      properties: {
        param: { type: "string", description: "Параметр" }
      },
      required: ["param"]
    },
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

- **unity.js** - 🎮 Unity Bridge — Полный контроль Unity (2 инструмента)
  - screenshot - скриншот Unity Editor
  - execute - универсальное выполнение операций (создание/удаление объектов, перемещение, Play Mode, получение информации)
- **git.js** - Git операции с автопоиском репозитория (9 инструментов)
- **filesystem.js** - Умные файловые операции (10 инструментов)
- **smart-files.js** - 🧠 Умные файловые операции с DRY архитектурой (6 инструментов)
  - read_file - чтение с автопоиском и подсказками
  - edit_file - редактирование с автосозданием папок
  - delete_file - удаление с подтверждением
  - list_dir - листинг с подробной статистикой
  - file_search - поиск файлов с паттернами
  - grep_search - поиск по содержимому с контекстом
- **terminal.js** - Системная информация, порты, процессы (6 инструментов)

**Всего: 33 инструмента**

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