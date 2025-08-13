# Unity Bridge MCP

Прозрачный мост между AI и Unity3D для выполнения C# кода и управления 3D сценой.

## Инструменты

### `unity_execute` — C# Code Executor (инструкции + функции, без классов)
Выполнение C# кода в Unity Editor в надёжном режиме: последовательность инструкций и объявления функций разрешены. Классы/namespace запрещены. Объявленные функции автоматически помечаются как `static`, чтобы их можно было вызывать из основного статического контекста выполнения.

**✅ Поддерживается:**
- Инструкции C# на верхнем уровне, `using`-директивы
- Полный Unity API (GameObject, Transform, Material, Rigidbody, Shader, etc.)
- LINQ, циклы, коллекции, математика (Math/Mathf, Vector*, Quaternion)

**❌ Запрещается:**
- class/interface/struct/enum
- namespace

При нарушении правил выполнение не начнётся — вернётся понятная ошибка.

### `unity_screenshot` - Game View Screenshot
Скриншот текущего состояния Game View.

### `unity_camera_screenshot` - Custom Camera Screenshot  
Скриншот с произвольной позиции камеры.
- `position` - позиция камеры [x, y, z]
- `target` - точка направления [x, y, z]
- `width/height` - разрешение (256-4096px)
- `fov` - поле зрения (10-179°)

### `unity_scene_hierarchy` - Scene Analysis
Анализ объектов сцены и их иерархии.
- `detailed: false` - только имена и структура
- `detailed: true` - + позиции, компоненты, свойства

## Примеры использования

### Простое создание объектов
```csharp
var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
cube.name = "MyCube";
cube.transform.position = new Vector3(0, 1, 0);
return "Куб создан!";
```

### Класс с методами
```csharp
public class ObjectBuilder
{
    public string Name { get; set; }
    
    public ObjectBuilder(string name) { Name = name; }
    
    public GameObject CreateCube(Vector3 pos, Color color)
    {
        var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
        cube.name = Name;
        cube.transform.position = pos;
        
        var material = new Material(Shader.Find("Standard"));
        material.color = color;
        cube.GetComponent<MeshRenderer>().material = material;
        
        return cube;
    }
}

var builder = new ObjectBuilder("TestCube");
var cube = builder.CreateCube(Vector3.zero, Color.red);
return $"Создан: {cube.name}";
```

### Функции (топ-уровневые и локальные)
```csharp
GameObject CreatePhysicsCube(Vector3 pos, float mass)
{
    var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
    cube.transform.position = pos;
    
    var rb = cube.AddComponent<Rigidbody>();
    rb.mass = mass;
    
    return cube;
}

// Создаем несколько кубов с физикой
for (int i = 0; i < 3; i++)
{
    CreatePhysicsCube(new Vector3(i * 2, 5, 0), 1f + i);
}

return "Кубы с физикой созданы!";
```

### LINQ и анализ данных
```csharp
using System.Linq;

var allObjects = GameObject.FindObjectsOfType<GameObject>();
var cubes = allObjects.Where(obj => obj.name.Contains("Cube")).ToList();
var averageY = cubes.Average(obj => obj.transform.position.y);
var highest = cubes.OrderByDescending(obj => obj.transform.position.y).First();

return $"Найдено кубов: {cubes.Count}, средняя высота: {averageY:F2}, самый высокий: {highest.name}";
```

### Циклы и структуры
```csharp
// Создаем пирамиду
for (int layer = 0; layer < 4; layer++)
{
    for (int i = 0; i <= layer; i++)
    {
        var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        sphere.name = $"Pyramid_L{layer}_I{i}";
        sphere.transform.position = new Vector3(i - layer * 0.5f, layer, 0);
        sphere.transform.localScale = Vector3.one * 0.8f;
    }
}

return "Пирамида из сфер создана!";
```

## Техническая архитектура

**Unity Extension:** 7 C# модулей (~400 строк)
- `UnityBridge.cs` - главный композитор
- `UnityOperations.cs` - Unity API операции  
- `HttpServer.cs` - HTTP сервер (порт 7777)
- `Messages.cs` - структуры данных
- `ResponseBuilder.cs` - построитель ответов
- `ErrorCollector.cs` - сборщик ошибок
- `JsonUtils.cs` - JSON утилиты

**JavaScript Bridge:** Прозрачная передача запросов
- Конвертация Unity ответов в MCP формат
- Обработка ошибок подключения
- Timeout: 30 секунд для execute, 10-20 для остальных

**Протокол:** HTTP JSON через localhost:7777
- `/api/execute` - выполнение C# кода
- `/api/screenshot` - Game View скриншот  
- `/api/camera_screenshot` - кастомный скриншот
- `/api/scene_hierarchy` - анализ сцены

## Установка

1. Открыть Unity проект
2. Скопировать `unity-extension/Editor/` в `Assets/Editor/`
3. Открыть `Window → Unity Bridge`
4. Сервер запустится автоматически на порту 7777

## Ограничения

- Работает только в Unity Editor (не в Play Mode)
- Требует Unity 2020.3+ с URP
- Создание материалов в Edit Mode может вызывать предупреждения
- Сложные ООП паттерны не поддерживаются
- Внешние библиотеки недоступны 