/**
 * Unity Bridge MCP Module - Прозрачный мост
 * 
 * Новая упрощенная архитектура:
 * • Unity возвращает готовый массив messages
 * • JS просто передает данные без обработки
 * • Максимальная прозрачность связи
 */

import axios from 'axios';

const UNITY_BASE_URL = 'http://localhost:7777';

/**
 * Конвертер Unity messages в MCP формат
 */
function convertToMCPResponse(unityResponse) {
  // Новая Unity архитектура возвращает { messages: [...] }
  if (unityResponse.messages && Array.isArray(unityResponse.messages)) {
    const content = [];
    
    for (const msg of unityResponse.messages) {
      if (msg.type === 'text') {
        content.push({
          type: 'text',
          text: msg.content
        });
      } else if (msg.type === 'image') {
        // Добавляем описание изображения если есть
        if (msg.text) {
          content.push({
            type: 'text', 
            text: msg.text
              });
            }
        // Затем само изображение
        content.push({
          type: 'image',
          data: msg.content,
          mimeType: 'image/png'
        });
      }
    }
    
    return { content };
  }
  
  // Fallback для старого формата Unity API
  return convertLegacyResponse(unityResponse);
    }

/**
 * Fallback для старого формата Unity (временно)
 */
function convertLegacyResponse(unityData) {
  const content = [];
        
  // Основное сообщение
  if (unityData.message) {
    content.push({
      type: 'text',
      text: unityData.message
    });
  }
  
  // Данные результата
  if (unityData.data && unityData.data !== unityData.message) {
    content.push({
      type: 'text', 
      text: unityData.data
    });
  }
  
  // Изображение для скриншотов
  if (unityData.image) {
    content.push({
      type: 'text',
      text: 'Unity Screenshot'
    });
    content.push({
      type: 'image',
      data: unityData.image,
      mimeType: 'image/png'
    });
  }
  
  // Ошибки Unity
  if (unityData.errors && unityData.errors.length > 0) {
    const errorText = unityData.errors.map(err => {
      if (typeof err === 'object') {
        const level = err.Level || err.level || 'Info';
        const message = err.Message || err.message || 'Unknown error';
        return `${level}: ${message}`;
      }
      return err.toString();
    }).join('\n');
    
    content.push({
      type: 'text',
      text: `Unity Logs:\n${errorText}`
    });
  }
  
  // Если нет контента, добавляем статус
  if (content.length === 0) {
    content.push({
      type: 'text',
      text: `Unity Status: ${unityData.status || 'Unknown'}`
    });
  }
  
  return { content };
  }
  
/**
 * Универсальный обработчик Unity запросов
 */
async function handleUnityRequest(endpoint, data = {}, timeout = 10000) {
  try {
    // 🚀 Убеждаемся что данные корректно сериализуются в UTF-8
    const jsonData = JSON.stringify(data);
    
    const response = await axios.post(`${UNITY_BASE_URL}${endpoint}`, jsonData, {
      timeout,
      responseType: 'json',
      headers: { 
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json; charset=utf-8'
      }
    });
    
    return convertToMCPResponse(response.data);
  } catch (error) {
    const errorContent = [{
      type: 'text',
      text: `Unity Connection Error: ${error.message}\n\nПроверьте:\n• Unity запущен\n• Unity Bridge Window открыт\n• HTTP сервер работает на порту 7777`
    }];
    
    // Добавляем детали ошибки если есть
    if (error.response?.data) {
      try {
        const unityError = convertToMCPResponse(error.response.data);
        errorContent.push(...unityError.content);
      } catch {
        errorContent.push({
          type: 'text',
          text: `Unity Error Details: ${JSON.stringify(error.response.data)}`
        });
      }
    }
    
    return { content: errorContent };
        }
}

// Unity инструменты
const unityTools = [
  {
    name: "screenshot",
    description: 'Unity Game View скриншот',
    inputSchema: {
      type: 'object',
      properties: {
        systemScreenshot: {
          type: 'boolean',
          default: false,
          description: '🖥️ Включить скриншот рабочего стола. ИСПОЛЬЗОВАТЬ ТОЛЬКО ПРИ СТРОГОЙ НЕОБХОДИМОСТИ УВИДЕТЬ ЭКРАН ПОЛЬЗОВАТЕЛЯ И НЕ ИСПОЛЬЗОВАТЬ ПРОСТО ТАК!'
        }
      },
      required: []
    },
    handler: async (params) => {
      return await handleUnityRequest('/api/screenshot');
    }
  },
  
  {
    name: "camera_screenshot", 
    description: 'Unity скриншот с произвольной позиции камеры',
    inputSchema: {
      type: 'object',
      properties: {
        position: {
          type: 'array',
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Позиция камеры [x, y, z]'
        },
        target: {
          type: 'array', 
          items: { type: 'number' },
          minItems: 3,
          maxItems: 3,
          description: 'Точка направления камеры [x, y, z]'
        },
        width: {
          type: 'number',
          default: 1920,
          minimum: 256,
          maximum: 4096,
          description: 'Ширина скриншота в пикселях'
        },
        height: {
          type: 'number',
          default: 1080,
          minimum: 256,
          maximum: 4096,
          description: 'Высота скриншота в пикселях'
        },
        fov: {
          type: 'number',
          default: 60,
          minimum: 10,
          maximum: 179,
          description: 'Поле зрения камеры в градусах'
        },
        systemScreenshot: {
          type: 'boolean',
          default: false,
          description: '🖥️ Включить скриншот рабочего стола. ИСПОЛЬЗОВАТЬ ТОЛЬКО ПРИ СТРОГОЙ НЕОБХОДИМОСТИ УВИДЕТЬ ЭКРАН ПОЛЬЗОВАТЕЛЯ И НЕ ИСПОЛЬЗОВАТЬ ПРОСТО ТАК!'
        }
      },
      required: ['position', 'target']
    },
    handler: async (params) => {
      const requestBody = {
        position: params.position,
        target: params.target,
        fov: params.fov || 60,
        width: params.width || 1920,
        height: params.height || 1080
      };
      
      return await handleUnityRequest('/api/camera_screenshot', requestBody, 20000);
    }
  },

  {
    name: "scene_hierarchy",
    description: 'Unity сцена: анализ объектов и иерархии',
    inputSchema: {
      type: 'object',
      properties: {
        detailed: {
          type: 'boolean',
          default: false,
          description: 'Детальный режим: false - только имена и структура, true - + позиция, компоненты, свойства'
        },
        systemScreenshot: {
          type: 'boolean',
          default: false,
          description: '🖥️ Включить скриншот рабочего стола. ИСПОЛЬЗОВАТЬ ТОЛЬКО ПРИ СТРОГОЙ НЕОБХОДИМОСТИ УВИДЕТЬ ЭКРАН ПОЛЬЗОВАТЕЛЯ И НЕ ИСПОЛЬЗОВАТЬ ПРОСТО ТАК!'
        }
      },
      required: []
    },
    handler: async (params) => {
      const requestBody = {
        detailed: params.detailed || false
      };
      
      return await handleUnityRequest('/api/scene_hierarchy', requestBody, 15000);
    }
  },

  {
    name: "execute",
    description: 'Unity C# Code Executor - выполнение C# кода в Unity Editor.\n\n✅ ПОДДЕРЖИВАЕТСЯ:\n• Простые классы с методами и конструкторами\n• Локальные функции (автоматически static)\n• Полный Unity API (GameObject, Transform, Material, Rigidbody, etc.)\n• LINQ операции (Where, Select, GroupBy, Sum, etc.)\n• Циклы, коллекции, математические вычисления\n• Using statements, многострочный код\n\n❌ НЕ ПОДДЕРЖИВАЕТСЯ:\n• Интерфейсы, абстрактные классы, наследование\n• Внешние библиотеки (JSON.NET, System.IO)\n• Атрибуты [Serializable], [System.Flags]\n• Сложная инициализация массивов в классах\n\n🎯 ПРИМЕРЫ:\n• Создание объектов: GameObject.CreatePrimitive(PrimitiveType.Cube)\n• Классы: public class Builder { public GameObject Create() {...} }\n• Функции: GameObject CreateCube(Vector3 pos) {...}\n• LINQ: objects.Where(o => o.name.Contains("Test")).ToList()',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'C# код для выполнения в Unity Editor'
        },
        systemScreenshot: {
          type: 'boolean',
          default: false,
          description: '🖥️ Включить скриншот рабочего стола. ИСПОЛЬЗОВАТЬ ТОЛЬКО ПРИ СТРОГОЙ НЕОБХОДИМОСТИ УВИДЕТЬ ЭКРАН ПОЛЬЗОВАТЕЛЯ И НЕ ИСПОЛЬЗОВАТЬ ПРОСТО ТАК!'
        }
      },
      required: ['code']
    },
    handler: async (params) => {
        const requestBody = {
        code: params.code
      };
      
      return await handleUnityRequest('/api/execute', requestBody, 30000);
    }
  }
];

export const unityModule = {
  name: 'unity',
  description: 'Unity Bridge: прозрачный мост AI ↔ Unity3D. Выполнение любого C# кода, скриншоты, анализ сцены.',
  tools: unityTools,
  
  decorators: {
    disableSystemInfo: true,
    disableDebugLogs: true
  }
}; 