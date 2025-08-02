#!/usr/bin/env node

/**
 * 🔥 ОСНОВНОЙ MCP СЕРВЕР - ДИНАМИЧЕСКАЯ АРХИТЕКТУРА
 * 
 * 🎯 АРХИТЕКТУРНАЯ ИДЕЯ: Выносим ВСЮ инфраструктуру в отдельные файлы!
 * Теперь в каждом MCP сервере нужно только описать команды и их логику.
 * Если захотим добавить глобальную фичу (скриншот, погода) - меняем в одном месте!
 * 
 * 🚀 ЭТО НАСТОЯЩИЙ DRY - Don't Repeat Yourself!
 */

// 🎯 ОБЯЗАТЕЛЬНЫЕ ИМПОРТЫ для любого MCP сервера
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

// 🔧 ДОПОЛНИТЕЛЬНЫЕ ИМПОРТЫ
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 🎨 ИМПОРТЫ НАШИХ МОДУЛЕЙ
import { logInfo, logError, logSuccess, extractErrorDetails } from './logger.js';
import {
  addSystemScreenshotParameter,
  applyDecorators,
  initializeDefaultDecorators,
  addDecorator,
  removeDecorator,
  clearDecorators,
  getActiveDecorators
} from './decorators.js';
import { validateToolResponse } from './validation.js';
import { createResponseContent } from './responseHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🚨 УБРАЛИ БУФЕР НАХУЙ! ДЕЛАЕМ ПРАВИЛЬНО ЧЕРЕЗ ПРОМИСЫ!

/**
 * 🎯 СОЗДАНИЕ MCP СЕРВЕРА - УНИВЕРСАЛЬНАЯ ФУНКЦИЯ (v2: поддержка modules с namespace)
 * 
 * @param {Object} config - Конфигурация сервера
 * @param {string} config.name - Имя сервера
 * @param {string} config.version - Версия сервера
 * @param {string} [config.modulesPath] - Путь к папке с модулями
 * @returns {Object} Готовый к запуску сервер
 */
export function createMcpServer({ name, version, modulesPath = '../tools' }) {
  const server = new Server({ name, version }, { capabilities: { tools: {} } });

  // 🔥 ДИНАМИЧЕСКИЕ МОДУЛИ В РАНТАЙМЕ!
  let loadedModules = new Map(); // name -> module
  let allTools = new Map();      // toolName -> handler

  // 🔧 ES MODULES: используем __dirname для совместимости
  // mcpServer.js лежит в utils/, а tools/ рядом с index.js
  const toolsDir = path.resolve(__dirname, '..', modulesPath);

  // 🚀 ПРОМИС ИНИЦИАЛИЗАЦИИ - ЖДЁМ ЗАГРУЗКИ ВСЕХ МОДУЛЕЙ!
  let initializationPromise = null;

  /**
   * 🔄 ДИНАМИЧЕСКАЯ ЗАГРУЗКА ВСЕХ МОДУЛЕЙ ИЗ ПАПКИ
   */
  async function loadModulesFromDirectory() {
    logInfo(`🔍 Ищем модули в: ${toolsDir}`);

    if (!fs.existsSync(toolsDir)) {
      logError(`❌ Папка не существует: ${toolsDir}`);
      fs.mkdirSync(toolsDir, { recursive: true });
      return;
    }

    const files = fs.readdirSync(toolsDir)
      .filter(file => file.endsWith('.js'))
      .filter(file => !file.startsWith('.'));

    logInfo(`📁 Найдено ${files.length} JS файлов: ${files.join(', ')}`);

    for (const file of files) {
      await loadSingleModule(file);
    }

    logSuccess(`🎯 Загрузка завершена: ${allTools.size} инструментов`);
  }

  /**
   * 🔥 ЗАГРУЗКА ОДНОГО МОДУЛЯ С HOT RELOAD
   */
  async function loadSingleModule(filename) {
    try {
      const filePath = path.join(toolsDir, filename);
      const moduleName = path.basename(filename, '.js');

      // 🚀 HOT RELOAD: добавляем timestamp для обхода кэша
      const moduleUrl = `file://${filePath}?t=${Date.now()}`;

      const moduleExports = await import(moduleUrl);

      // Ищем экспортированный модуль (может быть разные форматы)
      let moduleData = null;

      if (moduleExports.default) {
        moduleData = moduleExports.default;
      } else if (moduleExports[`${moduleName}Module`]) {
        moduleData = moduleExports[`${moduleName}Module`];
      } else {
        // Ищем первый объект с tools
        for (const [key, value] of Object.entries(moduleExports)) {
          if (value && typeof value === 'object' && value.tools) {
            moduleData = value;
            break;
          }
        }
      }

      if (!moduleData || !moduleData.tools) {
        return;
      }

      // 🆕 ADD: добавляем новые инструменты
      const toolsAdded = [];

      // Поддерживаем и массив и объект tools
      const toolsToProcess = Array.isArray(moduleData.tools)
        ? moduleData.tools
        : Object.entries(moduleData.tools);

      for (const toolItem of toolsToProcess) {
        let toolName, toolConfig;

        if (Array.isArray(moduleData.tools)) {
          // Если tools - массив, берём name из объекта
          toolConfig = toolItem;
          toolName = toolConfig.name;
        } else {
          // Если tools - объект, используем ключ как имя
          [toolName, toolConfig] = toolItem;
        }

        const fullToolName = `${moduleName}_${toolName}`;

        // Добавляем systemScreenshot параметр если его нет
        const enhancedTool = addSystemScreenshotParameter(toolConfig);

        allTools.set(fullToolName, enhancedTool);
        toolsAdded.push(fullToolName);
      }

      // Сохраняем модуль
      loadedModules.set(moduleName, moduleData);

      logSuccess(`✅ Module ${moduleName} loaded: ${toolsAdded.join(', ')}`);

    } catch (error) {
      const errorDetails = extractErrorDetails(error);
      logError(`❌ Failed to load module ${filename}: ${errorDetails}`);
    }
  }

  /**
   * 🔄 HOT RELOAD - ПЕРЕЧИТАТЬ ВСЕ МОДУЛИ
   */
  async function reloadAllModules() {
    logInfo('🔄 HOT RELOAD: Reloading all modules...');

    // Очищаем все
    loadedModules.clear();
    allTools.clear();

    // Перезагружаем
    await loadModulesFromDirectory();

    return {
      success: true,
      modulesLoaded: loadedModules.size,
      toolsLoaded: allTools.size,
      modules: Array.from(loadedModules.keys()),
      tools: Array.from(allTools.keys())
    };
  }

  /**
   * 🔄 RELOAD SINGLE MODULE - перезагрузить один модуль
   */
  async function reloadSingleModule(filename) {
    logInfo(`🔄 HOT RELOAD: Reloading single module: ${filename}`);

    // Удаляем старые инструменты этого модуля
    const moduleName = path.basename(filename, '.js');
    const toolsToRemove = [];

    for (const [toolName] of allTools) {
      if (toolName.startsWith(`${moduleName}_`)) {
        toolsToRemove.push(toolName);
      }
    }

    toolsToRemove.forEach(toolName => allTools.delete(toolName));
    loadedModules.delete(moduleName);

    // Загружаем заново
    await loadSingleModule(filename);

    return {
      success: true,
      reloadedModule: moduleName,
      toolsRemoved: toolsToRemove,
      toolsAdded: Array.from(allTools.keys()).filter(name => name.startsWith(`${moduleName}_`))
    };
  }

  // 🎯 НАСТРОЙКА ОБРАБОТЧИКОВ MCP СЕРВЕРА

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Ждём инициализации если она ещё не завершена
    if (initializationPromise) {
      await initializationPromise;
    }

    const tools = Array.from(allTools.entries()).map(([name, config]) => ({
      name,
      description: config.description || 'No description',
      inputSchema: config.inputSchema || { type: 'object', properties: {} }
    }));

    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    // 🔥 ГЛОБАЛЬНЫЙ TRY/CATCH - ЛОВИМ ВСЁ И ОБОРАЧИВАЕМ В КРАСИВЫЙ ТЕКСТ!
    try {
      if (!allTools.has(name)) {
        throw new Error(`❌ **TOOL NOT FOUND** ❌\n\n` +
          `🔧 **Requested Tool:** ${name}\n` +
          `📋 **Available Tools:** ${Array.from(allTools.keys()).join(', ')}\n\n` +
          `🛠️ **Powered by MCP Error Handler!**`);
      }

      const tool = allTools.get(name);

      // 🔧 СОЗДАЕМ КОНТЕКСТ ДЛЯ HANDLER'А С ФУНКЦИЯМИ ЛОГИРОВАНИЯ
      const context = {
        log: logInfo,  // Основная функция логирования
        logInfo,
        logError,
        logSuccess,
        createResponse: createResponseContent  // 🔥 ИСПОЛЬЗУЕМ ПРАВИЛЬНУЮ ФУНКЦИЮ!
      };

      // 🎯 ВЫПОЛНЯЕМ HANDLER - МОЖЕТ БРОСИТЬ throw new Error()!
      logInfo(`🚀 EXECUTING TOOL: ${name} with args: ${JSON.stringify(args)}`);
      let result = await tool.handler(args || {}, context);
      logInfo(`✅ TOOL EXECUTED: ${name} - result type: ${typeof result}`);

      // 🔍 ВАЛИДАЦИЯ ОТВЕТА ИНСТРУМЕНТА - МОЖЕТ БРОСИТЬ ОШИБКУ!
      validateToolResponse(result, name);

      // 🤖 АВТОМАТИЧЕСКОЕ ОБОРАЧИВАНИЕ ТЕКСТА В ПРАВИЛЬНЫЙ MCP ФОРМАТ!
      // Если функция вернула просто строку - оборачиваем в createResponseContent
      if (typeof result === 'string') {
        result = createResponseContent(result);
      }
      // Если функция вернула объект с content массивом - доверяемся ей полностью!
      // (например, для скриншотов, сложных ответов и т.д.)

      // 🎨 ПОЛУЧАЕМ ДЕКОРАТОРЫ ДЛЯ ТРЁХУРОВНЕВОЙ СИСТЕМЫ
      const rawToolDecorators = tool.decorators || [];

      // Преобразуем tool decorators (могут быть функциями которые принимают args)
      const toolDecorators = [];
      for (const decorator of rawToolDecorators) {
        if (typeof decorator === 'function') {
          // Если это функция, вызываем её с args чтобы получить реальный декоратор
          const realDecorator = decorator(args);
          if (typeof realDecorator === 'function') {
            toolDecorators.push(realDecorator);
          }
        }
      }

      // Находим модуль для получения module decorators
      const moduleName = name.split('_')[0];
      const moduleData = loadedModules.get(moduleName);
      const moduleDecorators = moduleData?.decorators || [];

      // 🐛 DEBUG: Логируем количество декораторов ПЕРЕД применением (ВАЖНО: до debug logs decorator!)
      logInfo(`🎨 DECORATORS: Tool=${toolDecorators.length}, Module=${moduleDecorators.length}, System=${getActiveDecorators().length} for ${name}`);
      if (toolDecorators.length > 0) {
        logInfo(`🔧 Tool decorators found: ${toolDecorators.map(d => d.name || 'anonymous').join(', ')}`);
      }
      if (moduleDecorators.length > 0) {
        logInfo(`🎭 Module decorators found: ${moduleDecorators.map(d => d.name || 'anonymous').join(', ')}`);
      }

      // 🎨 ПРИМЕНЯЕМ ТРЁХУРОВНЕВЫЕ ДЕКОРАТОРЫ С НОВОЙ АРХИТЕКТУРОЙ - МОГУТ БРОСИТЬ ОШИБКИ!
      result = await applyDecorators(async () => result, args, toolDecorators, moduleDecorators);

      // Если декораторы уже создали правильный MCP response с content массивом, возвращаем как есть
      if (result && result.content && Array.isArray(result.content)) {
        return result;
      }

      // Иначе создаем стандартный MCP response (на всякий случай)
      return {
        content: [
          {
            type: "text",
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      };

    } catch (error) {
      // 🔥 ЕДИНЫЙ ОБРАБОТЧИК ВСЕХ ОШИБОК - КРАСИВОЕ ФОРМАТИРОВАНИЕ СО STACK TRACE!
      const errorMessage = error.message || 'Unknown error';
      const stackTrace = error.stack || 'No stack trace available';

      logError(`Tool execution failed: ${errorMessage}`);

      // 🎨 СОЗДАЁМ КРАСИВУЮ ОШИБКУ С ПОЛНЫМ КОНТЕКСТОМ!
      const beautifulError = `🚨 **ERROR OCCURRED** 🚨

❌ **Message:** ${errorMessage}

🔧 **Tool:** ${name}
📝 **Arguments:** ${JSON.stringify(args, null, 2)}

📚 **Stack Trace:**
\`\`\`
${stackTrace}
\`\`\`

🛠️ **Powered by MCP Error Handler - ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ!**`;

      // 🎯 ВОЗВРАЩАЕМ КАК ОБЫЧНЫЙ RESPONSE (ПОХУЙ НА MCP СТАНДАРТЫ!)
      // Пользователь сможет прочитать и понять что это ошибка!
      return createResponseContent(beautifulError);
    }
  });

  // 🚀 ВОЗВРАЩАЕМ ОБЪЕКТ СЕРВЕРА С ДОПОЛНИТЕЛЬНЫМИ МЕТОДАМИ
  return {
    server,

    // 🔥 МЕТОДЫ ДЛЯ УПРАВЛЕНИЯ МОДУЛЯМИ
    loadModulesFromDirectory,
    reloadAllModules,
    reloadSingleModule,

    // 🎨 МЕТОДЫ ДЛЯ УПРАВЛЕНИЯ ДЕКОРАТОРАМИ  
    addDecorator,
    removeDecorator,
    clearDecorators,
    getActiveDecorators,

    // 📊 ГЕТТЕРЫ ДЛЯ ОТЛАДКИ
    get loadedModules() { return loadedModules; },
    get allTools() { return allTools; },

    /**
     * 🚀 ЗАПУСК СЕРВЕРА
     */
    async start() {
      // 🎨 ИНИЦИАЛИЗИРУЕМ ДЕКОРАТОРЫ
      initializeDefaultDecorators();

      // 🔥 ЗАГРУЖАЕМ ВСЕ МОДУЛИ
      initializationPromise = loadModulesFromDirectory();
      await initializationPromise;

      // 🚀 ЗАПУСКАЕМ СЕРВЕР
      const transport = new StdioServerTransport();
      await server.connect(transport);

      logSuccess(`🚀 MCP Server "${name}" v${version} started with ${allTools.size} tools!`);
    }
  };
} 