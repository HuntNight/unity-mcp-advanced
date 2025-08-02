#!/usr/bin/env node

/**
 * 🌉 UNITY BRIDGE MCP SERVER - ПРОЗРАЧНЫЙ МОСТ К UNITY API! 🌉
 * 
 * Революционный MCP сервер для управления Unity Editor через HTTP API.
 * Один раз настроили - навсегда получили доступ ко ВСЕМ Unity API!
 * 
 * 🔥 ВОЗМОЖНОСТИ:
 * - Универсальная рефлексия для вызова любых Unity методов
 * - Создание и управление GameObjects в реальном времени
 * - Скриншоты Game View и Scene View
 * - Управление Play Mode и симуляцией
 * - Полный доступ к Unity Editor API без изменения расширения
 * 
 * 🚀 ПРОЗРАЧНЫЙ МОСТ - НИКОГДА НЕ НУЖНО МЕНЯТЬ КОД РАСШИРЕНИЯ!
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

const UNITY_BASE_URL = 'http://localhost:7777';

class UnityBridgeServer {
  constructor() {
    this.server = new Server(
      {
        name: 'unity-bridge',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'unity_connect',
          description: '🔌 Подключение к Unity Bridge и проверка состояния',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'unity_api_call',
          description: '🔥 УНИВЕРСАЛЬНЫЙ ВЫЗОВ ЛЮБЫХ UNITY API - ПРОЗРАЧНЫЙ МОСТ!',
          inputSchema: {
            type: 'object',
            properties: {
              target: {
                type: 'string',
                description: 'Класс Unity для вызова (например: EditorApplication, GameObject, Camera)',
              },
              method: {
                type: 'string',
                description: 'Метод или свойство для вызова',
              },
              operation: {
                type: 'string',
                enum: ['get_property', 'set_property', 'call_method', 'call_static', 'create_object', 'find_object'],
                description: 'Тип операции',
              },
              args: {
                type: 'array',
                description: 'Аргументы для метода (если нужны)',
                items: { type: 'any' },
              },
              value: {
                type: 'any',
                description: 'Значение для установки (для set_property)',
              },
            },
            required: ['target', 'operation'],
          },
        },
        {
          name: 'unity_create_object',
          description: '🎮 Создание GameObject в Unity сцене',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Имя объекта',
                default: 'New GameObject',
              },
              type: {
                type: 'string',
                enum: ['empty', 'cube', 'sphere', 'plane', 'cylinder'],
                description: 'Тип объекта',
                default: 'empty',
              },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  z: { type: 'number' },
                },
                description: 'Позиция объекта в мире',
                default: { x: 0, y: 0, z: 0 },
              },
            },
            required: [],
          },
        },
        {
          name: 'unity_find_objects',
          description: '🔍 Поиск объектов в Unity сцене',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['name', 'tag'],
                description: 'Тип поиска',
                default: 'name',
              },
              value: {
                type: 'string',
                description: 'Значение для поиска',
              },
            },
            required: ['value'],
          },
        },
        {
          name: 'unity_move_object',
          description: '📍 Перемещение объекта в Unity сцене',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Имя объекта для перемещения',
              },
              position: {
                type: 'object',
                properties: {
                  x: { type: 'number' },
                  y: { type: 'number' },
                  z: { type: 'number' },
                },
                description: 'Новая позиция объекта',
              },
            },
            required: ['name', 'position'],
          },
        },
        {
          name: 'unity_play_mode',
          description: '▶️ Управление Play Mode в Unity',
          inputSchema: {
            type: 'object',
            properties: {
              action: {
                type: 'string',
                enum: ['play', 'stop', 'pause', 'toggle'],
                description: 'Действие с Play Mode',
                default: 'toggle',
              },
            },
            required: [],
          },
        },
        {
          name: 'unity_screenshot',
          description: '📸 Создание скриншота Unity Game View',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'unity_info',
          description: 'ℹ️ Получение информации о Unity проекте',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'unity_connect':
            return await this.handleConnect();
          case 'unity_api_call':
            return await this.handleApiCall(args);
          case 'unity_create_object':
            return await this.handleCreateObject(args);
          case 'unity_find_objects':
            return await this.handleFindObjects(args);
          case 'unity_move_object':
            return await this.handleMoveObject(args);
          case 'unity_play_mode':
            return await this.handlePlayMode(args);
          case 'unity_screenshot':
            return await this.handleScreenshot();
          case 'unity_info':
            return await this.handleInfo();
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Неизвестный инструмент: ${name}`
            );
        }
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Ошибка выполнения ${name}: ${error.message}`
        );
      }
    });
  }

  async makeUnityRequest(endpoint, method = 'GET', data = null) {
    const url = `${UNITY_BASE_URL}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      return result;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Unity Bridge недоступен. Убедитесь что Unity запущен и Unity Bridge Window открыт.');
      }
      throw new Error(`Ошибка соединения с Unity: ${error.message}`);
    }
  }

  async handleConnect() {
    try {
      const result = await this.makeUnityRequest('/health');
      return {
        content: [
          {
            type: 'text',
            text: `🌉 Unity Bridge подключен!\n\nСтатус: ${result.status}\nВремя: ${result.timestamp}\n\n✅ Готов к приему команд!`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Не удалось подключиться к Unity Bridge!\n\nОшибка: ${error.message}\n\n💡 Проверьте:\n- Unity запущен\n- Unity Bridge Window открыт (Window → Claude → Unity Bridge)\n- HTTP сервер запущен на порту 7777`,
          },
        ],
      };
    }
  }

  async handleApiCall(args) {
    const { target, method, operation, args: methodArgs, value } = args;
    
    const data = {
      target,
      method,
      operation,
      args: methodArgs || [],
      value,
    };

    const result = await this.makeUnityRequest('/unity/api', 'POST', data);
    
    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `🔥 УНИВЕРСАЛЬНЫЙ API ВЫЗОВ ВЫПОЛНЕН!\n\nЦель: ${target}\nМетод: ${method || 'N/A'}\nОперация: ${operation}\n\nРезультат:\n${JSON.stringify(result.result, null, 2)}`,
          },
        ],
      };
    } else {
      throw new Error(result.error || 'Неизвестная ошибка Unity API');
    }
  }

  async handleCreateObject(args) {
    const { name = 'New GameObject', type = 'empty', position = { x: 0, y: 0, z: 0 } } = args;
    
    const data = { name, type, position };
    const result = await this.makeUnityRequest('/unity/create-object', 'POST', data);
    
    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `🎮 Объект создан!\n\nИмя: ${result.name}\nID: ${result.object_id}\nПозиция: (${result.position.x}, ${result.position.y}, ${result.position.z})`,
          },
        ],
      };
    } else {
      throw new Error(result.error || 'Ошибка создания объекта');
    }
  }

  async handleFindObjects(args) {
    const { type = 'name', value } = args;
    
    const data = { type, value };
    const result = await this.makeUnityRequest('/unity/find-objects', 'POST', data);
    
    if (result.success) {
      const objectsList = result.objects.map(obj => 
        `- ${obj.name} (ID: ${obj.id}, Позиция: ${obj.position.x}, ${obj.position.y}, ${obj.position.z})`
      ).join('\n');
      
      return {
        content: [
          {
            type: 'text',
            text: `🔍 Найдено объектов: ${result.count}\n\n${objectsList}`,
          },
        ],
      };
    } else {
      throw new Error(result.error || 'Ошибка поиска объектов');
    }
  }

  async handleMoveObject(args) {
    const { name, position } = args;
    
    const data = { name, position };
    const result = await this.makeUnityRequest('/unity/move-object', 'POST', data);
    
    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `📍 Объект перемещен!\n\nИмя: ${result.object_name}\nНовая позиция: (${result.new_position.x}, ${result.new_position.y}, ${result.new_position.z})`,
          },
        ],
      };
    } else {
      throw new Error(result.error || 'Ошибка перемещения объекта');
    }
  }

  async handlePlayMode(args) {
    const { action = 'toggle' } = args;
    
    const data = { action };
    const result = await this.makeUnityRequest('/unity/play-mode', 'POST', data);
    
    if (result.success) {
      const status = result.is_playing ? 'ЗАПУЩЕН' : 'ОСТАНОВЛЕН';
      const pauseStatus = result.is_paused ? ' (НА ПАУЗЕ)' : '';
      
      return {
        content: [
          {
            type: 'text',
            text: `▶️ Play Mode: ${status}${pauseStatus}`,
          },
        ],
      };
    } else {
      throw new Error(result.error || 'Ошибка управления Play Mode');
    }
  }

  async handleScreenshot() {
    const result = await this.makeUnityRequest('/unity/screenshot');
    
    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `📸 Скриншот создан!\n\nРазмер: ${result.width}x${result.height}\nФормат: ${result.format}`,
          },
          {
            type: 'image',
            data: result.screenshot,
            mimeType: 'image/png',
          },
        ],
      };
    } else {
      throw new Error(result.error || 'Ошибка создания скриншота');
    }
  }

  async handleInfo() {
    const result = await this.makeUnityRequest('/unity/info');
    
    if (result.success) {
      return {
        content: [
          {
            type: 'text',
            text: `ℹ️ Информация о Unity проекте:\n\nВерсия Unity: ${result.unity_version}\nНазвание проекта: ${result.project_name}\nПуть к данным: ${result.data_path}\nPlay Mode: ${result.is_playing ? 'Активен' : 'Остановлен'}\nКоличество сцен: ${result.scene_count}\nАктивная сцена: ${result.active_scene}`,
          },
        ],
      };
    } else {
      throw new Error(result.error || 'Ошибка получения информации Unity');
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('🌉 Unity Bridge MCP Server запущен!');
  }
}

const server = new UnityBridgeServer();
server.run().catch(console.error); 