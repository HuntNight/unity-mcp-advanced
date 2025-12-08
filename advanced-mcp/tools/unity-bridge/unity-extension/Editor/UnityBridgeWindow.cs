using UnityEngine;
using UnityEditor;
using System.IO;

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
        private Vector2 logScroll;
        private Vector2 configScroll;
        private string lastTestResult = "";
        private string[] recentLogs = new string[0];
        private GUIStyle titleStyle;
        private GUIStyle badgeStyle;
        private GUIStyle codeStyle;
        private bool showTests = true;
        private bool showConfig = true;
        private bool showServerInfo = true;
        
        [MenuItem("Window/Unity Bridge")]
        public static void ShowWindow()
        {
            var window = GetWindow<UnityBridgeWindow>("Unity Bridge");
            window.minSize = new Vector2(560, 600);
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

            // Стили
            titleStyle = new GUIStyle(EditorStyles.boldLabel)
            {
                fontSize = 18
            };
            badgeStyle = new GUIStyle(EditorStyles.boldLabel)
            {
                normal = { textColor = Color.white },
                alignment = TextAnchor.MiddleCenter
            };
            codeStyle = new GUIStyle(EditorStyles.textArea)
            {
                fontSize = 12,
                wordWrap = false
            };
            try
            {
                var monoFont = Font.CreateDynamicFontFromOSFont(new[] { "Menlo", "Consolas", "Courier New", "Monaco" }, 12);
                if (monoFont != null)
                {
                    codeStyle.font = monoFont;
                }
            }
            catch { /* ignore missing fonts */ }
        }
        
        private void OnDisable()
        {
            // При отключении окна сервер продолжает работать
        }
        
        private void OnGUI()
        {
            EditorGUILayout.Space(10);
            
            // Заголовок
            GUILayout.Label("Unity Bridge MCP", titleStyle);
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
            
            // ПАНЕЛЬ УПРАВЛЕНИЯ СЕРВЕРОМ
            EditorGUILayout.Space(8);
            EditorGUILayout.BeginVertical("box");
            GUILayout.Label("Server Control", EditorStyles.boldLabel);
            serverPort = EditorGUILayout.IntField("Server Port", serverPort);
            autoStartEnabled = EditorGUILayout.Toggle("Auto Start", autoStartEnabled);
            EditorGUILayout.BeginHorizontal();
            GUI.enabled = !isRunning;
            if (GUILayout.Button("Start Server", GUILayout.Height(26)))
            {
                var started = UnityBridge.StartServer(serverPort);
                statusMessage = started ? "Server started successfully" : "Failed to start server";
                UpdateStatus();
            }
            GUI.enabled = isRunning;
            if (GUILayout.Button("Stop Server", GUILayout.Height(26)))
            {
                UnityBridge.StopServer();
                statusMessage = "Server stopped";
                UpdateStatus();
            }
            GUI.enabled = true;
            if (GUILayout.Button("Refresh Logs", GUILayout.Height(26)))
            {
                recentLogs = ErrorCollector.GetAndClearErrors().ToArray();
                statusMessage = recentLogs.Length > 0 ? $"Fetched {recentLogs.Length} log(s)" : "No new logs";
            }
            EditorGUILayout.EndHorizontal();
            if (isRunning)
            {
                EditorGUILayout.Space(2);
                EditorGUILayout.LabelField("URL", $"http://localhost:{serverPort}");
                EditorGUILayout.LabelField("Endpoints", "/api/screenshot, /api/camera_screenshot, /api/execute, /api/scene_hierarchy, /api/scene_grep");
            }
            EditorGUILayout.EndVertical();
            
            // Статусные сообщения
            EditorGUILayout.Space(8);
            EditorGUILayout.BeginVertical("box");
            GUILayout.Label("Status & Logs", EditorStyles.boldLabel);
            scrollPosition = EditorGUILayout.BeginScrollView(scrollPosition, GUILayout.Height(120));
            if (!string.IsNullOrEmpty(statusMessage))
            {
                EditorGUILayout.HelpBox(statusMessage, MessageType.Info);
            }
            var bridgeStatus = UnityBridge.GetStatus();
            EditorGUILayout.LabelField(bridgeStatus, EditorStyles.wordWrappedLabel);
            if (recentLogs.Length > 0)
            {
                GUILayout.Space(4);
                foreach (var log in recentLogs)
                {
                    EditorGUILayout.LabelField("• " + log, EditorStyles.wordWrappedLabel);
                }
            }
            EditorGUILayout.EndScrollView();
            EditorGUILayout.EndVertical();
            
            // ТЕСТЫ MCP ИНСТРУМЕНТОВ
            EditorGUILayout.Space(8);
            showTests = EditorGUILayout.Foldout(showTests, "MCP Tools Tests", true);
            if (showTests)
            {
                EditorGUILayout.BeginVertical("box");
                EditorGUILayout.LabelField("Run quick tests to validate tools", EditorStyles.miniLabel);
                EditorGUILayout.Space(4);
                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("Test Screenshot (Game)", GUILayout.Height(24)))
                {
                    if (isRunning) TestScreenshot(); else statusMessage = "Start server first";
                }
                if (GUILayout.Button("Test Screenshot (Scene)", GUILayout.Height(24)))
                {
                    if (isRunning) TestScreenshotScene(); else statusMessage = "Start server first";
                }
                if (GUILayout.Button("Test Camera Screenshot", GUILayout.Height(24)))
                {
                    if (isRunning) TestCameraScreenshot(); else statusMessage = "Start server first";
                }
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("Test Scene Hierarchy", GUILayout.Height(24)))
                {
                    if (isRunning) TestSceneHierarchy(); else statusMessage = "Start server first";
                }
                if (GUILayout.Button("Test Grep (Garden*)", GUILayout.Height(24)))
                {
                    if (isRunning) TestSceneGrep_Garden(); else statusMessage = "Start server first";
                }
                if (GUILayout.Button("Test Grep (hasComp(Camera))", GUILayout.Height(24)))
                {
                    if (isRunning) TestSceneGrep_Camera(); else statusMessage = "Start server first";
                }
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("Test Execute (return 2)", GUILayout.Height(24)))
                {
                    if (isRunning) TestExecute(); else statusMessage = "Start server first";
                }
                if (GUILayout.Button("Clear Messages", GUILayout.Height(24)))
                {
                    statusMessage = "";
                    ErrorCollector.GetAndClearErrors();
                    recentLogs = new string[0];
                }
                EditorGUILayout.EndHorizontal();

                if (!string.IsNullOrEmpty(lastTestResult))
                {
                    EditorGUILayout.Space(4);
                    EditorGUILayout.HelpBox(lastTestResult, MessageType.None);
                }
                EditorGUILayout.EndVertical();
            }
            
            // КОНФИГ ДЛЯ CURSOR MCP
            EditorGUILayout.Space(8);
            showConfig = EditorGUILayout.Foldout(showConfig, "Cursor MCP Configuration", true);
            if (showConfig)
            {
                EditorGUILayout.BeginVertical("box");
                var configJson = BuildCursorMcpConfigJson();
                EditorGUILayout.LabelField("Copy this JSON into Cursor settings (mcpServers)", EditorStyles.miniLabel);
                configScroll = EditorGUILayout.BeginScrollView(configScroll, GUILayout.Height(140));
                EditorGUILayout.TextArea(configJson, codeStyle, GUILayout.ExpandHeight(true));
                EditorGUILayout.EndScrollView();

                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("Copy to Clipboard", GUILayout.Height(24)))
                {
                    EditorGUIUtility.systemCopyBuffer = configJson;
                    statusMessage = "Config copied to clipboard";
                }
                if (GUILayout.Button("Reveal index.js in Finder", GUILayout.Height(24)))
                {
                    var idx = GetAdvancedMcpIndexPath();
                    if (File.Exists(idx)) EditorUtility.RevealInFinder(idx);
                }
                if (GUILayout.Button("Open README", GUILayout.Height(24)))
                {
                    var readme = Path.Combine(Directory.GetParent(Application.dataPath).FullName, "advanced-mcp/README.md");
                    if (File.Exists(readme)) EditorUtility.OpenWithDefaultApp(readme);
                }
                EditorGUILayout.EndHorizontal();
                EditorGUILayout.EndVertical();
            }
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
                    lastTestResult = $"Screenshot (Game): SUCCESS ({dataSize} chars base64)";
                }
                else
                {
                    lastTestResult = $"Screenshot (Game): FAILED - {result.Error}";
                }
            }
            catch (System.Exception ex)
            {
                lastTestResult = $"Screenshot (Game): ERROR - {ex.Message}";
            }
            
            UpdateStatus();
        }

        private void TestScreenshotScene()
        {
            try
            {
                var testData = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "width", 800 },
                    { "height", 600 },
                    { "view_type", "scene" }
                };
                var request = new UnityRequest("/api/screenshot", testData);
                var result = UnityOperations.TakeScreenshot(request);
                if (result.Success)
                {
                    var dataSize = result.Data?.ToString()?.Length ?? 0;
                    lastTestResult = $"Screenshot (Scene): SUCCESS ({dataSize} chars base64)";
                }
                else lastTestResult = $"Screenshot (Scene): FAILED - {result.Error}";
            }
            catch (System.Exception ex)
            {
                lastTestResult = $"Screenshot (Scene): ERROR - {ex.Message}";
            }
            UpdateStatus();
        }

        private void TestCameraScreenshot()
        {
            try
            {
                var data = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "position", new System.Collections.Generic.List<object>{ 0f, 2f, -5f } },
                    { "target", new System.Collections.Generic.List<object>{ 0f, 0f, 0f } },
                    { "fov", 60 },
                    { "width", 800 },
                    { "height", 600 }
                };
                var request = new UnityRequest("/api/camera_screenshot", data);
                var result = UnityOperations.TakeCameraScreenshot(request);
                if (result.Success)
                {
                    var dataSize = result.Data?.ToString()?.Length ?? 0;
                    lastTestResult = $"Camera Screenshot: SUCCESS ({dataSize} chars base64)";
                }
                else lastTestResult = $"Camera Screenshot: FAILED - {result.Error}";
            }
            catch (System.Exception ex)
            {
                lastTestResult = $"Camera Screenshot: ERROR - {ex.Message}";
            }
            UpdateStatus();
        }

        private void TestSceneHierarchy()
        {
            try
            {
                var data = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "name_glob", "Cube*" },
                    { "max_results", 20 },
                    { "max_depth", 3 },
                    { "allow_large_response", false }
                };
                var request = new UnityRequest("/api/scene_hierarchy", data);
                var result = UnityOperations.GetSceneHierarchySimple(request);
                if (result.Success)
                {
                    var preview = (result.Data?.ToString() ?? "").Split('\n');
                    var head = string.Join("\n", System.Linq.Enumerable.Take(preview, 6));
                    lastTestResult = $"Scene Hierarchy: SUCCESS\n{head}\n...";
                }
                else lastTestResult = $"Scene Hierarchy: FAILED - {result.Error}";
            }
            catch (System.Exception ex)
            {
                lastTestResult = $"Scene Hierarchy: ERROR - {ex.Message}";
            }
            UpdateStatus();
        }

        private void TestExecute()
        {
            try
            {
                var data = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "code", "return 1+1;" },
                    { "safe_mode", true },
                    { "validate_only", false }
                };
                var request = new UnityRequest("/api/execute", data);
                var result = UnityOperations.ExecuteCode(request);
                if (result.Success)
                {
                    lastTestResult = $"Execute: SUCCESS — Result: {result.Data}";
                }
                else lastTestResult = $"Execute: FAILED — {result.Error}";
            }
            catch (System.Exception ex)
            {
                lastTestResult = $"Execute: ERROR — {ex.Message}";
            }
            UpdateStatus();
        }

        private void TestSceneGrep_Garden()
        {
            try
            {
                var data = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "name_glob", "Garden*" },
                    { "select", new System.Collections.Generic.List<object>{ "GameObject.name", "Transform.position" } },
                    { "max_results", 10 },
                    { "allow_large_response", false }
                };
                var request = new UnityRequest("/api/scene_grep", data);
                var result = UnityOperations.SceneGrep(request);
                if (result.Success)
                {
                    var preview = (result.Data?.ToString() ?? "").Split('\n');
                    var head = string.Join("\n", System.Linq.Enumerable.Take(preview, 10));
                    lastTestResult = $"Scene Grep (Garden*): SUCCESS\n{head}\n...";
                }
                else lastTestResult = $"Scene Grep (Garden*): FAILED - {result.Error}";
            }
            catch (System.Exception ex)
            {
                lastTestResult = $"Scene Grep (Garden*): ERROR - {ex.Message}";
            }
            UpdateStatus();
        }

        private void TestSceneGrep_Camera()
        {
            try
            {
                var data = new System.Collections.Generic.Dictionary<string, object>
                {
                    { "where", "hasComp(Camera)" },
                    { "select", new System.Collections.Generic.List<object>{ "GameObject.name", "Transform.position", "Camera.fieldOfView" } },
                    { "max_results", 5 },
                    { "allow_large_response", false }
                };
                var request = new UnityRequest("/api/scene_grep", data);
                var result = UnityOperations.SceneGrep(request);
                if (result.Success)
                {
                    var preview = (result.Data?.ToString() ?? "").Split('\n');
                    var head = string.Join("\n", System.Linq.Enumerable.Take(preview, 10));
                    lastTestResult = $"Scene Grep (hasComp(Camera)): SUCCESS\n{head}\n...";
                }
                else lastTestResult = $"Scene Grep (hasComp(Camera)): FAILED - {result.Error}";
            }
            catch (System.Exception ex)
            {
                lastTestResult = $"Scene Grep (hasComp(Camera)): ERROR - {ex.Message}";
            }
            UpdateStatus();
        }

        private string BuildCursorMcpConfigJson()
        {
            var indexPath = GetAdvancedMcpIndexPath().Replace("\\", "/");
            var json =
                "{\n" +
                "  \"mcpServers\": {\n" +
                "    \"enhanced-mcp\": {\n" +
                "      \"command\": \"node\",\n" +
                $"      \"args\": [ \"{indexPath}\" ],\n" +
                "      \"env\": { \"NODE_ENV\": \"production\" }\n" +
                "    }\n" +
                "  }\n" +
                "}";
            return json;
        }

        private string GetAdvancedMcpIndexPath()
        {
            var projectRoot = Directory.GetParent(Application.dataPath).FullName;
            return Path.Combine(projectRoot, "advanced-mcp", "index.js");
        }
    }
} 