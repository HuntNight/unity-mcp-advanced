using System;
using System.Collections.Generic;
using System.Threading;
using UnityEngine;
using UnityEditor;

namespace UnityBridge
{
    /// <summary>
    /// Главный композитор Unity Bridge - новая функциональная архитектура
    /// Объединяет все модули в единый пайплайн обработки
    /// Заменяет сложный UnityBridgeAPI
    /// </summary>
    public static class UnityBridge
    {
        private static HttpServer server;
        private static readonly Queue<Action> mainThreadQueue = new Queue<Action>();
        private static readonly object queueLock = new object();
        private static readonly Dictionary<string, object> pendingResults = new Dictionary<string, object>();
        private static readonly object resultsLock = new object();
        
        static UnityBridge()
        {
            EditorApplication.update += ProcessMainThreadQueue;
        }
        
        public static bool StartServer(int port = 7777)
        {
            try
            {
                // 🚀 Настройка UTF-8 кодировки для поддержки кириллицы
                try
                {
                    System.Console.OutputEncoding = System.Text.Encoding.UTF8;
                }
                catch
                {
                    // Игнорируем ошибки настройки кодировки консоли
                }
                
                ErrorCollector.AddInfo("Starting Unity Bridge...");
                
                server = new HttpServer(port, HandleRequest);
                var started = server.Start();
                
                if (started)
                    ErrorCollector.AddInfo($"Unity Bridge started on port {port}");
                else
                    ErrorCollector.AddError("Failed to start Unity Bridge server");
                    
                return started;
            }
            catch (Exception ex)
            {
                ErrorCollector.AddError($"Unity Bridge startup error: {ex.Message}");
                Debug.LogError($"Unity Bridge startup error: {ex}");
                return false;
            }
        }
        
        public static void StopServer()
        {
            try
            {
                server?.Stop();
                server = null;
                ErrorCollector.AddInfo("Unity Bridge stopped");
            }
            catch (Exception ex)
            {
                ErrorCollector.AddError($"Unity Bridge stop error: {ex.Message}");
                Debug.LogError($"Unity Bridge stop error: {ex}");
            }
        }
        
        public static bool IsRunning => server != null;
        
        // Главный обработчик запросов (функциональный пайплайн)
        private static Dictionary<string, object> HandleRequest(string endpoint, Dictionary<string, object> data)
        {
            try
            {
                // Проверка компиляции
                var compilationError = ErrorCollector.GetCompilationStatus();
                if (!string.IsNullOrEmpty(compilationError))
                    return ResponseBuilder.BuildCompilationErrorResponse();
                
                // Создание запроса
                var request = new UnityRequest(endpoint, data);
                
                // Маршрутизация и выполнение
                var result = RouteRequest(request);
                
                // Построение ответа
                var allowLarge = request.GetValue("allow_large_response", false);
                return ResponseBuilder.BuildResponse(result, allowLarge);
            }
            catch (Exception ex)
            {
                ErrorCollector.AddError($"Request handling error: {ex.Message}");
                return ResponseBuilder.BuildErrorResponse($"Request failed: {ex.Message}");
            }
        }
        
        // Функциональная маршрутизация запросов
        private static OperationResult RouteRequest(UnityRequest request)
        {
            switch (request.Endpoint)
            {
                case "/api/screenshot":
                    return ExecuteOnMainThread(() => UnityOperations.TakeScreenshot(request));
                    
                case "/api/camera_screenshot":
                    return ExecuteOnMainThread(() => UnityOperations.TakeCameraScreenshot(request));
                    
                case "/api/execute":
                    return ExecuteOnMainThread(() => UnityOperations.ExecuteCode(request));
                    
                case "/api/scene_hierarchy":
                    return ExecuteOnMainThread(() => UnityOperations.GetSceneHierarchySimple(request));
                
                case "/api/scene_radius":
                    return ExecuteOnMainThread(() => UnityOperations.GetObjectsInRadius(request));
                
                case "/api/scene_grep":
                    return ExecuteOnMainThread(() => UnityOperations.SceneGrep(request));

                case "/api/play_mode":
                    return ExecuteOnMainThread(() => UnityOperations.SetPlayMode(request));
                    
                default:
                    return OperationResult.Fail($"Unknown endpoint: {request.Endpoint}");
            }
        }
        
        // Выполнение на главном потоке Unity
        private static OperationResult ExecuteOnMainThread(Func<OperationResult> operation)
        {
            if (IsMainThread())
                return operation();
            
            var taskId = Guid.NewGuid().ToString();
            var completed = false;
            OperationResult result = default;
            
            EnqueueMainThreadTask(() =>
            {
                try
                {
                    result = operation();
                }
                catch (Exception ex)
                {
                    result = OperationResult.Fail($"Main thread execution error: {ex.Message}");
                }
                finally
                {
                    completed = true;
                }
            });
            
            // Ожидание результата
            var timeout = DateTime.UtcNow.AddSeconds(30);
            while (!completed && DateTime.UtcNow < timeout)
            {
                Thread.Sleep(50);
            }
            
            if (!completed)
                return OperationResult.Fail("Operation timed out");
                
            return result;
        }
        
        private static void EnqueueMainThreadTask(Action action)
        {
            lock (queueLock)
            {
                mainThreadQueue.Enqueue(action);
            }
        }
        
        private static void ProcessMainThreadQueue()
        {
            lock (queueLock)
            {
                var processedCount = 0;
                while (mainThreadQueue.Count > 0 && processedCount < 10) // Ограничение для производительности
                {
                    try
                    {
                        var action = mainThreadQueue.Dequeue();
                        action();
                        processedCount++;
                    }
                    catch (Exception ex)
                    {
                        Debug.LogError($"Main thread task error: {ex.Message}");
                    }
                }
            }
        }
        
        private static bool IsMainThread()
        {
            return Thread.CurrentThread.ManagedThreadId == 1; // Unity main thread обычно имеет ID 1
        }
        
        // Утилитарные функции
        public static string GetStatus()
        {
            var status = IsRunning ? "Running" : "Stopped";
            var errors = ErrorCollector.HasErrors() ? $" ({ErrorCollector.GetAndClearErrors().Count} errors)" : "";
            var compilation = ErrorCollector.HasCompilationErrors() ? " [COMPILATION ERRORS]" : "";
            
            return $"Unity Bridge: {status}{errors}{compilation}";
        }
        
        public static void LogInfo(string message)
        {
            ErrorCollector.AddInfo(message);
            Debug.Log($"[Unity Bridge] {message}");
        }
        
        public static void LogError(string message)
        {
            ErrorCollector.AddError(message);
            Debug.LogError($"[Unity Bridge] {message}");
        }
    }
} 