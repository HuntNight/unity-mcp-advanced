#!/usr/bin/env node

/**
 * 🚨 ВНИМАНИЕ ДЛЯ ИИ: ЭТОТ СЕРВЕР НЕ ЗАПУСКАТЬ ЧЕРЕЗ ТЕРМИНАЛ!
 * 
 * ❌ НЕ ДЕЛАТЬ: node index.js
 * ❌ НЕ ДЕЛАТЬ: run_terminal_cmd с запуском сервера
 * 
 * ✅ ПРАВИЛЬНО: Попросить пользователя перезапустить сервер в настройках Cursor'а
 * 
 * MCP сервер работает ТОЛЬКО через интеграцию с Cursor'ом!
 * Запуск через терминал НЕ РАБОТАЕТ и бесит пользователя!
 */

/**
 * 🚀 ДИНАМИЧЕСКАЯ АРХИТЕКТУРА MCP - РЕВОЛЮЦИЯ!
 * 
 * 🔥 АРХИТЕКТУРНАЯ ИДЕЯ: Динамическая загрузка модулей!
 * 
 * 🏗️ НОВАЯ АРХИТЕКТУРА:
 * ├── utils/           # 🔧 Общие утилиты + динамическая загрузка
 * ├── tools/           # 🎯 Модули загружаются ДИНАМИЧЕСКИ!
 * │   ├── unity.js         # 🎮 Unity Bridge API (ПЕРЕПИСАН!)
 * │   ├── terminal.js      # 💻 Все terminal команды
 * │   ├── filesystem.js    # 📁 Все файловые операции
 * │   └── git.js           # 🔧 Git операции
 * └── index.js         # 🚀 Просто создаёт сервер и говорит "загрузи модули"
 * 
 * 💡 РЕВОЛЮЦИОННЫЕ ВОЗМОЖНОСТИ:
 * - 🔄 HOT RELOAD: изменил файл → перезагрузил → работает!
 * - 🆕 ADD: добавил новый файл в tools/ → автоматически подхватился!
 * - 🔄 REPLACE: файл с тем же именем → заменяет старые инструменты!
 * - 🚀 LIVE CODING: пишешь код в чате → сохраняется → применяется!
 * 
 * 🎯 НИКАКИХ СТАТИЧЕСКИХ ИМПОРТОВ!
 * Всё загружается динамически из папки tools/
 */

import { createMcpServer } from './utils/mcpServer.js';

// 🚨 ГЛОБАЛЬНАЯ ЗАЩИТА ОТ ПАДЕНИЯ СЕРВЕРА! 🚨
// Эти обработчики ловят ВСЕ unhandled errors которые могут уронить процесс!

process.on('uncaughtException', (error) => {
  console.error('🚨 UNCAUGHT EXCEPTION - СЕРВЕР НЕ УПАДЁТ!');
  console.error('❌ Error:', error.message);
  console.error('📚 Stack:', error.stack);
  console.error('🛡️ Сервер продолжает работать благодаря глобальной защите!');
  // НЕ ВЫЗЫВАЕМ process.exit() - пусть сервер продолжает работать!
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED PROMISE REJECTION - СЕРВЕР НЕ УПАДЁТ!');
  console.error('❌ Reason:', reason);
  console.error('📍 Promise:', promise);
  console.error('🛡️ Сервер продолжает работать благодаря глобальной защите!');
  // НЕ ВЫЗЫВАЕМ process.exit() - пусть сервер продолжает работать!
});

// 🔥 ДОПОЛНИТЕЛЬНАЯ ЗАЩИТА ОТ CHILD_PROCESS ОШИБОК
process.on('error', (error) => {
  console.error('🚨 PROCESS ERROR - СЕРВЕР НЕ УПАДЁТ!');
  console.error('❌ Error:', error.message);
  console.error('🛡️ Сервер продолжает работать благодаря глобальной защите!');
});

// 🚀 СОЗДАЁМ СЕРВЕР С ДИНАМИЧЕСКОЙ ЗАГРУЗКОЙ
const server = createMcpServer({
  name: "claude-enhanced-mcp",
  version: "2.0.0-DYNAMIC-PROTECTED", // 🛡️ Обновил версию!
  modulesPath: './tools'  // 🔥 Папка для динамического сканирования!
});

// 🧹 Graceful shutdown (пока оставляем для совместимости)
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 Shutting down gracefully...');
  process.exit(0);
});

// 🚀 ЗАПУСК ДИНАМИЧЕСКОГО MCP СЕРВЕРА!
server.start();

/**
 * 🎉 ДИНАМИЧЕСКАЯ РЕВОЛЮЦИЯ ЗАВЕРШЕНА!
 * 
 * 🔥 ПРЕИМУЩЕСТВА НОВОЙ АРХИТЕКТУРЫ:
 * ✅ Модули загружаются динамически из папки tools/
 * ✅ HOT RELOAD без перезапуска MCP сервера
 * ✅ Добавил файл → сразу работает
 * ✅ Изменил файл → перезагрузил → работает
 * ✅ LIVE CODING прямо в чате!
 * ✅ Никаких статических импортов
 * ✅ Полная гибкость и расширяемость
 * ✅ 🛡️ ГЛОБАЛЬНАЯ ЗАЩИТА ОТ ПАДЕНИЯ СЕРВЕРА!
 * 
 * 🚀 КАК ДОБАВИТЬ НОВЫЙ МОДУЛЬ:
 * 1. Создать tools/мой-модуль.js
 * 2. Экспортировать объект с tools: { toolName: { description, inputSchema, handler } }
 * 3. Всё! Модуль автоматически подхватится при старте
 * 4. Для hot reload: используй live_code_deploy или reloadAllModules()
 * 
 * 🛡️ ГЛОБАЛЬНАЯ ЗАЩИТА:
 * - uncaughtException: ловит все синхронные ошибки
 * - unhandledRejection: ловит все асинхронные Promise ошибки  
 * - process error: ловит ошибки самого процесса
 * - child_process spawn ENOENT: теперь НЕ РОНЯЕТ сервер!
 * 
 * 🏆 ЭТО ОТЛИЧНАЯ АРХИТЕКТУРНАЯ ИДЕЯ!
 * ДИНАМИЧЕСКАЯ ЗАГРУЗКА + HOT RELOAD + ГЛОБАЛЬНАЯ ЗАЩИТА = ИДЕАЛЬНАЯ АРХИТЕКТУРА!
 */ 