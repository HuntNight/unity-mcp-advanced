using UnityEngine;
using UnityEditor;

namespace UnityBridge
{
    /// <summary>
    /// Простой UI для управления Unity Bridge
    /// Новая функциональная архитектура - минимальный интерфейс
    /// </summary>
    public class UnityBridgeWindow : EditorWindow
    {
        private string statusMessage = "";
        private Vector2 scrollPosition;
        private bool autoStartEnabled = true;
        private int serverPort = 7777;
        
        [MenuItem("Window/Unity Bridge")]
        public static void ShowWindow()
        {
            var window = GetWindow<UnityBridgeWindow>("Unity Bridge");
            window.minSize = new Vector2(400, 300);
        }
        
        private void OnEnable()
        {
            // Автостарт при включении (если нужно)
            if (autoStartEnabled && !UnityBridge.IsRunning)
            {
                var started = UnityBridge.StartServer(serverPort);
                statusMessage = started ? "Server auto-started" : "Failed to auto-start server";
            }
            
            UpdateStatus();
        }
        
        private void OnDisable()
        {
            // При отключении окна сервер продолжает работать
        }
        
        private void OnGUI()
        {
            EditorGUILayout.Space(10);
            
            // Заголовок
            GUILayout.Label("Unity Bridge MCP", EditorStyles.boldLabel);
            EditorGUILayout.Space(5);
            
            // Статус сервера
            EditorGUILayout.BeginHorizontal();
            var isRunning = UnityBridge.IsRunning;
            var statusColor = isRunning ? Color.green : Color.red;
            var statusText = isRunning ? "RUNNING" : "STOPPED";
            
            var oldColor = GUI.color;
            GUI.color = statusColor;
            GUILayout.Label($"Status: {statusText}", EditorStyles.boldLabel);
            GUI.color = oldColor;
            
            GUILayout.FlexibleSpace();
            EditorGUILayout.EndHorizontal();
            
            // Настройки
            EditorGUILayout.Space(10);
            GUILayout.Label("Settings", EditorStyles.boldLabel);
            
            serverPort = EditorGUILayout.IntField("Server Port:", serverPort);
            autoStartEnabled = EditorGUILayout.Toggle("Auto Start:", autoStartEnabled);
            
            // Кнопки управления
            EditorGUILayout.Space(10);
            EditorGUILayout.BeginHorizontal();
            
            GUI.enabled = !isRunning;
            if (GUILayout.Button("Start Server", GUILayout.Height(30)))
            {
                var started = UnityBridge.StartServer(serverPort);
                statusMessage = started ? "Server started successfully" : "Failed to start server";
                UpdateStatus();
            }
            
            GUI.enabled = isRunning;
            if (GUILayout.Button("Stop Server", GUILayout.Height(30)))
            {
                UnityBridge.StopServer();
                statusMessage = "Server stopped";
                UpdateStatus();
            }
            
            GUI.enabled = true;
            EditorGUILayout.EndHorizontal();
            
            // Информация о сервере
            if (isRunning)
            {
                EditorGUILayout.Space(10);
                GUILayout.Label("Server Info", EditorStyles.boldLabel);
                EditorGUILayout.LabelField("URL:", $"http://localhost:{serverPort}");
                EditorGUILayout.LabelField("Endpoints:", "/api/screenshot, /api/execute, /api/scene_hierarchy");
            }
            
            // Статусные сообщения
            EditorGUILayout.Space(10);
            GUILayout.Label("Status Messages", EditorStyles.boldLabel);
            
            scrollPosition = EditorGUILayout.BeginScrollView(scrollPosition, GUILayout.Height(100));
            
            if (!string.IsNullOrEmpty(statusMessage))
            {
                EditorGUILayout.LabelField(statusMessage, EditorStyles.wordWrappedLabel);
            }
            
            var bridgeStatus = UnityBridge.GetStatus();
            EditorGUILayout.LabelField(bridgeStatus, EditorStyles.wordWrappedLabel);
            
            EditorGUILayout.EndScrollView();
            
            // Кнопки тестирования
            EditorGUILayout.Space(10);
            GUILayout.Label("Quick Test", EditorStyles.boldLabel);
            
            EditorGUILayout.BeginHorizontal();
            
            if (GUILayout.Button("Test Screenshot") && isRunning)
            {
                TestScreenshot();
            }
            
            if (GUILayout.Button("Clear Messages"))
            {
                statusMessage = "";
                ErrorCollector.GetAndClearErrors(); // Очищаем логи
            }
            
            EditorGUILayout.EndHorizontal();
            
            // Информация о проекте
            EditorGUILayout.Space(15);
            GUILayout.Label("About", EditorStyles.boldLabel);
            EditorGUILayout.LabelField("Unity Bridge MCP", "Functional Architecture v2.0");
            EditorGUILayout.LabelField("Architecture:", "7 modules, ~400 lines total");
            EditorGUILayout.LabelField("Principles:", "Functional, DRY, Simple");
        }
        
        private void UpdateStatus()
        {
            // Принудительно обновляем окно
            Repaint();
        }
        
        private void TestScreenshot()
        {
            try
            {
                // Простой тест - создаем запрос и проверяем ответ
                var testData = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "width", 800 },
                    { "height", 600 },
                    { "view_type", "game" }
                };
                
                var request = new UnityRequest("/api/screenshot", testData);
                var result = UnityOperations.TakeScreenshot(request);
                
                if (result.Success)
                {
                    var dataSize = result.Data?.ToString()?.Length ?? 0;
                    statusMessage = $"Screenshot test: SUCCESS ({dataSize} chars base64)";
                }
                else
                {
                    statusMessage = $"Screenshot test: FAILED - {result.Error}";
                }
            }
            catch (System.Exception ex)
            {
                statusMessage = $"Screenshot test: ERROR - {ex.Message}";
            }
            
            UpdateStatus();
        }
    }
} 