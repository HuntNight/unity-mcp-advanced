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
  const normalize = (resp) => {
    let data = resp;
    // Если пришла строка — пробуем распарсить JSON
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { /* ignore */ }
    }
    // Если верхний уровень — массив сообщений
    if (Array.isArray(data)) {
      return { messages: data };
    }
    // Если messages — строка с JSON
    if (data && typeof data.messages === 'string') {
      try {
        const parsed = JSON.parse(data.messages);
        if (Array.isArray(parsed)) data.messages = parsed;
      } catch { /* ignore */ }
    }
    // Если messages — объект-словарь, превращаем в массив
    if (data && data.messages && !Array.isArray(data.messages) && typeof data.messages === 'object') {
      data.messages = Object.values(data.messages);
    }
    return data;
  };

  const unityData = normalize(unityResponse);

  // Новая Unity архитектура возвращает { messages: [...] }
  if (unityData && Array.isArray(unityData.messages)) {
    const content = [];
    for (const msg of unityData.messages) {
      if (msg && msg.type === 'text') {
        content.push({ type: 'text', text: String(msg.content ?? '') });
      } else if (msg && msg.type === 'image') {
        if (msg.text) {
          content.push({ type: 'text', text: String(msg.text) });
        }
        content.push({ type: 'image', data: String(msg.content ?? ''), mimeType: 'image/png' });
      }
    }
    if (content.length > 0) return { content };
  }

  // Fallback для старого формата Unity API
  return convertLegacyResponse(unityData ?? unityResponse);
}

/**
 * Fallback для старого формата Unity (временно)
 */
function convertLegacyResponse(unityData) {
  const content = [];

  // Основное сообщение
  if (unityData && unityData.message) {
    content.push({ type: 'text', text: String(unityData.message) });
  }

  // Данные результата
  if (unityData && unityData.data && unityData.data !== unityData.message) {
    content.push({ type: 'text', text: typeof unityData.data === 'string' ? unityData.data : JSON.stringify(unityData.data) });
  }

  // Изображение для скриншотов
  if (unityData && unityData.image) {
    content.push({ type: 'text', text: 'Unity Screenshot' });
    content.push({ type: 'image', data: String(unityData.image), mimeType: 'image/png' });
  }

  // Ошибки Unity
  if (unityData && unityData.errors && unityData.errors.length > 0) {
    const errorText = unityData.errors.map(err => {
      if (typeof err === 'object') {
        const level = err.Level || err.level || 'Info';
        const message = err.Message || err.message || 'Unknown error';
        return `${level}: ${message}`;
      }
      return err?.toString?.() ?? String(err);
    }).join('\n');
    content.push({ type: 'text', text: `Unity Logs:\n${errorText}` });
  }

  // Если нет контента — показываем сырой ответ, чтобы не терять данные
  if (content.length === 0) {
    try {
      content.push({ type: 'text', text: `Raw Unity response: ${JSON.stringify(unityData)}` });
    } catch {
      content.push({ type: 'text', text: `Raw Unity response (non-serializable)` });
    }
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
        width: {
          type: 'number',
          minimum: 256,
          maximum: 4096,
          description: 'Ширина скриншота'
        },
        height: {
          type: 'number',
          minimum: 256,
          maximum: 4096,
          description: 'Высота скриншота'
        },
        view_type: {
          type: 'string',
          enum: ['game', 'scene'],
          default: 'game',
          description: 'Источник: game или scene'
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
      const requestBody = {};
      if (typeof params?.width === 'number') requestBody.width = params.width;
      if (typeof params?.height === 'number') requestBody.height = params.height;
      if (typeof params?.view_type === 'string') requestBody.view_type = params.view_type;
      return await handleUnityRequest('/api/screenshot', requestBody);
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
    description: 'Unity сцена: просмотр иерархии с ограничением глубины и лимитом. Без детального режима. Всегда нечувствительно к регистру, неактивные объекты включены и помечаются. Можно стартовать с path (root по умолчанию). Поддерживает auto-path: exact | glob | regex (определяется автоматически по строке). Возвращает: имя, id, список компонент. Встроенный лимит ответа 5000 символов (перекрывается allow_large_response).',
    inputSchema: {
      type: 'object',
      properties: {
        name_glob: { type: 'string', description: 'Glob фильтр по имени' },
        name_regex: { type: 'string', description: 'Regex (C#/.NET) фильтр по имени' },
        tag_glob: { type: 'string', description: 'Glob фильтр по тегу' },
        path: { type: 'string', description: 'Путь через "/" (например: "World/City/Quarter/Car"). Auto-path: exact (строка без спецсимволов), glob (если есть * ? [..]), regex (если есть ^ $ ( ) | { } \\). Все матчи — нечувствительны к регистру' },
        max_results: {
          type: 'number',
          default: 0,
          description: 'Максимум результатов (0 = без лимита)'
        },
        max_depth: {
          type: 'number',
          default: -1,
          description: 'Максимальная глубина обхода (−1 = без лимита)'
        },
        allow_large_response: {
          type: 'boolean',
          default: false,
          description: 'Снять ограничение 5000 символов (опасно для LLM)'
        }
      },
      required: []
    },
    handler: async (params) => {
      const requestBody = {
        name_glob: params.name_glob,
        name_regex: params.name_regex,
        tag_glob: params.tag_glob,
        path: params.path,
        max_results: typeof params.max_results === 'number' ? params.max_results : undefined,
        max_depth: typeof params.max_depth === 'number' ? params.max_depth : undefined,
        allow_large_response: !!params.allow_large_response
      };
      
      return await handleUnityRequest('/api/scene_hierarchy', requestBody, 15000);
    }
  },

  {
    name: "execute",
    description: 'Unity C# Code Executor — режим: инструкции + функции (без классов).\n\n✅ ПОДДЕРЖИВАЕТСЯ:\n• Последовательность инструкций C# и топ-уровневые функции (локальные и обычные) — функции автоматически делаются static\n• Полный Unity API (GameObject, Transform, Material, Rigidbody, etc.)\n• LINQ, циклы, коллекции, математические выражения\n• Using-директивы (на верхнем уровне)\n\n❌ ЗАПРЕЩЕНО:\n• Любые объявления class/interface/struct/enum\n• namespace\n\n💡 ПРИМЕР:\nGameObject CreateCube(Vector3 p) { var go = GameObject.CreatePrimitive(PrimitiveType.Cube); go.transform.position = p; return go; }\nvar a = CreateCube(new Vector3(0,1,0));\nreturn a.name;\n',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'C# код для выполнения в Unity Editor'
        },
        safe_mode: {
          type: 'boolean',
          default: true,
          description: 'Безопасный режим: базовая проверка кода на опасные операции'
        },
        validate_only: {
          type: 'boolean',
          default: false,
          description: 'Только скомпилировать, не выполнять'
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
        code: params.code,
        safe_mode: params.safe_mode !== false,
        validate_only: !!params.validate_only
      };
      
      return await handleUnityRequest('/api/execute', requestBody, 30000);
    }
  }
  ,
  {
    name: "scene_grep",
    description: 'Unity сцена: WHERE + SELECT DSL (всегда нечувствительно к регистру).\n\nWHERE-DSL: and/or/not, скобки (), сравнения (==,!=,>,>=,<,<=), строки: contains, startswith, endswith, matches (regex), hasComp(Type). Пути: name, id, path, active, tag, layer, GameObject.*, Transform.*, Camera.*, Light.*, Rigidbody.*, а также <Component>.<property> и индексация массивов: materials[0].name.\n\nSELECT-DSL: список полей или алиасов: ["GameObject.name", "Transform.position", "pos = Transform.position", "materials[0].name"].\n\nВажно: для префиксного поиска используйте name_glob="Prefix*". Вызов startswith(GameObject.name, "Prefix") будет автоматически превращён в name_glob и исключён из WHERE для эффективности.\n\nФормат вывода для каждого совпадения: "• <полный путь к объекту> - id:<InstanceId>", затем выбранные поля. Неактивные объекты помечаются в заголовке. Встроенный лимит ответа 5000 символов (перекрывается allow_large_response). Поддерживает name_glob/tag_glob/path/max_depth/max_results. Параметра path_mode нет: auto-path (exact|glob|regex) определяется автоматически по строке path.',
    inputSchema: {
      type: 'object',
      properties: {
        name_glob: { type: 'string', description: 'Glob фильтр по имени' },
        name_regex: { type: 'string', description: 'Regex (C#/.NET) фильтр по имени' },
        tag_glob: { type: 'string', description: 'Glob фильтр по тегу' },
        where: { type: 'string', description: 'WHERE-DSL: and/or/not, скобки, сравнения (==,!=,>,>=,<,<=), contains/startswith/endswith/matches, hasComp(Type). Пути: name,id,path,active,tag,layer, GameObject.*, Transform.*, <Component>.<property>' },
        select: {
          type: 'array',
          items: { type: 'string' },
          description: 'Какие поля выбрать у совпавших объектов. Примеры: ["GameObject.name","path","Transform.position","Light.intensity","pos = Transform.position","materials[0].name"]'
        },
        max_results: { type: 'number', default: 100, description: 'Максимум результатов' },
        path: { type: 'string', description: 'Ограничение поддерева (root по умолчанию). Путь через "/". Auto-path: exact (строка без спецсимволов), glob (если есть * ? [..]), regex (если есть ^ $ ( ) | { } \\). Все матчи — нечувствительны к регистру' },
        max_depth: { type: 'number', default: -1, description: 'Макс. глубина (−1 = без лимита)' },
        allow_large_response: {
          type: 'boolean',
          default: false,
          description: 'Снять ограничение 5000 символов (опасно для LLM)'
        }
      },
      required: []
    },
    handler: async (params) => {
      const requestBody = {
        name_glob: params.name_glob,
        name_regex: params.name_regex,
        tag_glob: params.tag_glob,
        where: typeof params.where === 'string' ? params.where : undefined,
        select: Array.isArray(params.select) ? params.select : undefined,
        max_results: typeof params.max_results === 'number' ? params.max_results : 100,
        allow_large_response: !!params.allow_large_response,
        path: params.path,
        max_depth: typeof params.max_depth === 'number' ? params.max_depth : undefined
      };
      return await handleUnityRequest('/api/scene_grep', requestBody, 20000);
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