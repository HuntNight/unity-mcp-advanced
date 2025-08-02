# 🔌 Unity Bridge API Reference

Полная документация HTTP API для Unity Bridge v2.0

## 🌐 Базовый URL

```
http://localhost:7777
```

## 📋 Endpoints

### 1. **POST /api/execute**

Выполнение произвольного C# кода через ModernCodeExecutor v2.0

#### Запрос
```json
{
    "code": "string",    // C# код для выполнения
    "taskId": "string"   // Уникальный ID задачи
}
```

#### Ответ
```json
{
    "status": "success|error",
    "message": "string",
    "data": "any",                    // Результат выполнения кода
    "using_modern_executor": true,    // Всегда true в v2.0
    "execution_time_ms": 42,          // Время выполнения в миллисекундах  
    "cache_stats": {                  // Статистика кеша
        "cached_assemblies": 5,
        "total_executions": 123,
        "cache_hits": 100,
        "cache_misses": 23
    },
    "error_details": "string",        // Детали ошибки (если есть)
    "errors": []                      // Ошибки Unity из ErrorBuffer
}
```

#### Примеры

**Простое выражение:**
```json
{
    "code": "return Application.unityVersion;",
    "taskId": "test-001"
}
```

**С using statements:**
```json
{
    "code": "using System.Linq;\nvar objects = UnityEngine.Object.FindObjectsOfType<Transform>().Where(t => t.name.Contains(\"Cube\")).ToArray();\nreturn objects.Length;",
    "taskId": "linq-test"
}
```

**Создание GameObject:**
```json
{
    "code": "var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);\ncube.name = \"APICube\";\ncube.transform.position = Vector3.up * 3f;\nreturn $\"Создан куб: {cube.name}\";",
    "taskId": "create-cube"
}
```

### 2. **POST /api/screenshot**

Создание скриншота Game View

#### Запрос
```json
{
    "taskId": "string"   // Уникальный ID задачи
}
```

#### Ответ
```json
{
    "status": "success|error",
    "image": "base64_string",         // PNG изображение в base64
    "message": "Screenshot captured", 
    "errors": []                      // Ошибки Unity из ErrorBuffer
}
```

### 3. **POST /api/camera_screenshot**

Создание скриншота с произвольной позиции камеры

#### Запрос
```json
{
    "position": [x, y, z],    // Позиция камеры (массив из 3 чисел)
    "target": [x, y, z],      // На что смотрит камера (массив из 3 чисел)
    "fov": 60,                // Поле зрения (опционально, по умолчанию 60)
    "width": 1920,            // Ширина (опционально, по умолчанию 1920)
    "height": 1080,           // Высота (опционально, по умолчанию 1080)
    "taskId": "string"        // Уникальный ID задачи
}
```

#### Ответ
```json
{
    "status": "success|error",
    "image": "base64_string",    // PNG изображение в base64
    "message": "string",         // Информация о скриншоте
    "errors": []                 // Ошибки Unity из ErrorBuffer
}
```

#### Пример
```json
{
    "position": [10, 5, 10],
    "target": [0, 0, 0],
    "fov": 45,
    "width": 1280,
    "height": 720,
    "taskId": "cam-shot-001"
}
```

### 4. **POST /api/scene_hierarchy**

Получение полной иерархии объектов активной сцены Unity

#### Запрос
```json
{
    "detailed": false,        // Режим анализа (опционально, по умолчанию false)
    "taskId": "string"        // Уникальный ID задачи
}
```

#### Ответ
```json
{
    "status": "success|error",
    "message": "string",              // Информация об операции
    "scene_name": "string",           // Имя активной сцены
    "scene_path": "string",           // Путь к файлу сцены
    "detailed_mode": false,           // Используемый режим
    "hierarchy": [                    // Массив корневых GameObject
        {
            "name": "GameObject",     // Имя объекта
            "active": true,           // Активен ли объект
            "tag": "Untagged",        // Тег объекта
            "layer": "Default",       // Слой объекта
            "instanceId": 12345,      // ID экземпляра (только в детальном режиме)
            "position": {             // Позиция (только в детальном режиме)
                "x": 0.0, "y": 0.0, "z": 0.0
            },
            "rotation": {             // Поворот (только в детальном режиме)
                "x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0
            },
            "localScale": {           // Масштаб (только в детальном режиме)
                "x": 1.0, "y": 1.0, "z": 1.0
            },
            "monoBehaviours": [       // MonoBehaviour компоненты (только в детальном режиме)
                "PlayerController", "HealthSystem"
            ],
            "otherComponents": [      // Другие компоненты (только в детальном режиме)
                "Rigidbody", "Collider", "Renderer"
            ],
            "children": [             // Дочерние объекты (рекурсивно)
                // ... аналогичная структура для дочерних объектов
            ]
        }
    ],
    "errors": []                      // Ошибки Unity из ErrorBuffer
}
```

#### Примеры

**Базовый режим:**
```json
{
    "detailed": false,
    "taskId": "hierarchy-basic"
}
```

**Детальный режим:**
```json
{
    "detailed": true,
    "taskId": "hierarchy-detailed"
}
```

## 🔧 Статусы ответов

### Success Response
```json
{
    "status": "success",
    "message": "Operation completed successfully",
    "data": "result_data"
}
```

### Error Response
```json
{
    "status": "error",
    "message": "Error description",
    "error_details": "Detailed error information"
}
```

## 🎯 Unity C# API Поддержка

### ✅ Полностью поддерживаемые namespace'ы

- **UnityEngine** - Основные классы Unity
- **UnityEditor** - Editor API
- **System** - Базовые .NET типы
- **System.Collections** - Коллекции
- **System.Collections.Generic** - Типизированные коллекции
- **System.Linq** - LINQ методы
- **UnityEngine.UI** - UI система
- **UnityEngine.SceneManagement** - Управление сценами

### 🎮 Основные Unity классы

**GameObject и Transform:**
```csharp
var obj = GameObject.CreatePrimitive(PrimitiveType.Cube);
obj.transform.position = new Vector3(1, 2, 3);
obj.transform.rotation = Quaternion.Euler(45, 0, 0);
obj.transform.localScale = Vector3.one * 2f;
```

**Renderer и Material:**
```csharp
var renderer = obj.GetComponent<Renderer>();
renderer.material.color = Color.red;
renderer.material.SetFloat("_Metallic", 0.5f);
```

**Light и Camera:**
```csharp
var light = new GameObject("MyLight").AddComponent<Light>();
light.type = LightType.Point;
light.intensity = 2f;
light.color = Color.yellow;
```

**Physics:**
```csharp
var rb = obj.AddComponent<Rigidbody>();
rb.AddForce(Vector3.up * 10f, ForceMode.Impulse);
```

### 📊 LINQ Примеры

**Поиск объектов:**
```csharp
using System.Linq;

var allCubes = UnityEngine.Object.FindObjectsOfType<Transform>()
    .Where(t => t.name.Contains("Cube"))
    .ToArray();
```

**Группировка по материалам:**
```csharp
using System.Linq;

var renderers = UnityEngine.Object.FindObjectsOfType<Renderer>();
var groupedByMaterial = renderers
    .GroupBy(r => r.material.name)
    .ToDictionary(g => g.Key, g => g.Count());
```

**Сортировка по позиции:**
```csharp
using System.Linq;

var sortedByHeight = UnityEngine.Object.FindObjectsOfType<Transform>()
    .OrderBy(t => t.position.y)
    .Select(t => t.name)
    .ToArray();
```

## ⚡ Производительность

### Оптимизации

1. **Кеширование компиляций** - повторные выполнения схожего кода выполняются мгновенно
2. **Выполнение в главном потоке** - все операции Unity выполняются корректно
3. **Пулинг задач** - эффективная обработка множественных запросов

### Метрики

- **Первая компиляция**: 50-200ms
- **Повторная компиляция (кеш)**: 5-10ms
- **Выполнение простого кода**: 1-5ms
- **Выполнение сложного кода**: 10-100ms

## 🛡️ Безопасность

### Ограничения

- Сервер доступен только на `localhost`
- Порт по умолчанию `7777`
- Все операции выполняются в контексте Unity Editor
- Нет доступа к файловой системе вне Unity проекта

### Лучшие практики

1. Используйте `try-catch` для обработки ошибок
2. Освобождайте ресурсы с `DestroyImmediate` в Editor Mode
3. Избегайте бесконечных циклов
4. Используйте `Debug.Log` для отладки

## 🐛 Отладка

### ErrorBuffer

Все ошибки Unity автоматически перехватываются и включаются в ответы API в поле `errors`:

```json
{
    "errors": [
        {
            "type": "Error",
            "message": "NullReferenceException: Object reference not set to an instance of an object",
            "stackTrace": "...",
            "timestamp": "2024-12-15T10:30:00Z"
        }
    ]
}
```

### Типы ошибок

- **Log** - Обычные логи (`Debug.Log`)
- **Warning** - Предупреждения (`Debug.LogWarning`)  
- **Error** - Ошибки (`Debug.LogError`)
- **Exception** - Исключения

## 🚀 Продвинутые примеры

### Создание анимированной сцены

```csharp
using System.Linq;

// Создаем анимированную планетарную систему
for(int i = 0; i < 8; i++) {
    var angle = (i * 45f) * Mathf.Deg2Rad;
    var radius = 3f + i * 0.5f;
    
    var planet = GameObject.CreatePrimitive(PrimitiveType.Sphere);
    planet.name = $"Planet_{i}";
    
    // Позиция по орбите
    planet.transform.position = new Vector3(
        Mathf.Cos(angle) * radius,
        Mathf.Sin(i * 0.1f) * 2f, // Вертикальная волна
        Mathf.Sin(angle) * radius
    );
    
    // Уникальный цвет и размер
    var renderer = planet.GetComponent<Renderer>();
    var hue = i / 8f;
    renderer.material.color = Color.HSVToRGB(hue, 0.8f, 1f);
    
    var scale = 0.5f + i * 0.1f;
    planet.transform.localScale = Vector3.one * scale;
    
    // Добавляем вращение
    var rotator = planet.AddComponent<Rigidbody>();
    rotator.useGravity = false;
    rotator.angularVelocity = new Vector3(0, i * 0.5f, 0);
}

// Центральное солнце
var sun = GameObject.CreatePrimitive(PrimitiveType.Sphere);
sun.name = "Sun";
sun.transform.position = Vector3.zero;
sun.transform.localScale = Vector3.one * 2f;
sun.GetComponent<Renderer>().material.color = Color.yellow;

// Освещение
var light = new GameObject("SystemLight").AddComponent<Light>();
light.type = LightType.Point;
light.intensity = 2f;
light.range = 20f;
light.color = Color.white;

return $"Создана планетарная система с {8} планетами и солнцем!";
```

### Анализ сцены с LINQ

```csharp
using System.Linq;

// Анализируем все объекты в сцене
var allTransforms = UnityEngine.Object.FindObjectsOfType<Transform>();

// Статистика по типам объектов
var stats = allTransforms
    .GroupBy(t => {
        var renderer = t.GetComponent<Renderer>();
        if (renderer != null) {
            var mesh = renderer.GetComponent<MeshFilter>()?.sharedMesh;
            return mesh?.name ?? "Unknown Mesh";
        }
        return "No Renderer";
    })
    .ToDictionary(g => g.Key, g => g.Count());

// Объекты по высоте
var heightGroups = allTransforms
    .Where(t => t.GetComponent<Renderer>() != null)
    .GroupBy(t => {
        var y = t.position.y;
        if (y < 0) return "Underground";
        if (y < 2) return "Ground";
        if (y < 5) return "Low";
        if (y < 10) return "High";
        return "Sky";
    })
    .ToDictionary(g => g.Key, g => g.Count());

// Цветовая статистика
var colorStats = allTransforms
    .Select(t => t.GetComponent<Renderer>())
    .Where(r => r != null)
    .GroupBy(r => r.material.color.ToString())
    .ToDictionary(g => g.Key, g => g.Count());

var result = new {
    TotalObjects = allTransforms.Length,
    TypeStats = stats,
    HeightGroups = heightGroups,
    ColorStats = colorStats
};

return $"Анализ сцены завершен: {result.TotalObjects} объектов";
```

### Анализ иерархии сцены

```csharp
using System.Linq;

// Получаем всю иерархию через MCP
// unity_scene_hierarchy detailed=true

// Альтернативный C# анализ
var scene = UnityEditor.SceneManagement.EditorSceneManager.GetActiveScene();
var rootObjects = scene.GetRootGameObjects();

var hierarchyAnalysis = rootObjects.Select(root => new {
    Name = root.name,
    Active = root.activeInHierarchy,
    ComponentCount = root.GetComponents<Component>().Length,
    ChildrenCount = root.transform.childCount,
    TotalDescendants = root.GetComponentsInChildren<Transform>().Length - 1,
    HasMonoBehaviours = root.GetComponents<MonoBehaviour>().Length > 0,
    Position = root.transform.position,
    Bounds = root.GetComponent<Renderer>()?.bounds.size ?? Vector3.zero
}).ToArray();

return $"Корневых объектов: {hierarchyAnalysis.Length}, " +
       $"С MonoBehaviour: {hierarchyAnalysis.Count(h => h.HasMonoBehaviours)}, " +
       $"Активных: {hierarchyAnalysis.Count(h => h.Active)}";
```

## Unity C# API Support

### Supported Features
- ✅ **Full Unity API** - Complete access to Unity Engine and Editor APIs
- ✅ **LINQ Operations** - `System.Linq` fully supported for advanced queries
- ✅ **Using Statements** - Automatic injection and user-defined using statements
- ✅ **Object Creation** - Create GameObjects, Components, Materials, etc.
- ✅ **Scene Manipulation** - Modify transforms, hierarchies, properties
- ✅ **Asset Management** - Work with prefabs, textures, meshes
- ✅ **Editor Extensions** - Access to UnityEditor namespace

### ⚠️ Class Name Conflicts

**CRITICAL**: Some Unity classes conflict with .NET system types. Always use full namespaces:

| Unity Class | System Conflict | Correct Usage |
|-------------|----------------|---------------|
| `Object` | `object` | `UnityEngine.Object.FindObjectsOfType<T>()` |
| `Random` | `System.Random` | `UnityEngine.Random.Range(0, 10)` |
| `Debug` | `System.Diagnostics.Debug` | `UnityEngine.Debug.Log("message")` |
| `Application` | Various | `UnityEngine.Application.isPlaying` |

### Examples

#### ❌ Wrong - Causes Compilation Errors
```csharp
// Error: Object is ambiguous
var cubes = Object.FindObjectsOfType<Transform>();

// Error: Random is ambiguous  
float value = Random.Range(0f, 1f);
```

#### ✅ Correct - Full Namespace Usage
```csharp
// Works perfectly
var cubes = UnityEngine.Object.FindObjectsOfType<Transform>();

// Also works
float value = UnityEngine.Random.Range(0f, 1f);

// With explicit using statement
using UnityEngine;
var cubes = Object.FindObjectsOfType<Transform>();
```

---

**📘 Unity Bridge API - Full Unity Power via HTTP!** ⚡ 