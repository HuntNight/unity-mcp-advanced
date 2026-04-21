using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Threading;
using UnityEngine;
using UnityEditor;
using Stopwatch = System.Diagnostics.Stopwatch;

namespace UnityBridge
{
    public static class UnityBridge
    {
        private static HttpServer server;
        private static readonly Queue<BridgeWorkItem> mainThreadQueue = new Queue<BridgeWorkItem>();
        private static readonly object queueLock = new object();
        private static readonly int mainThreadId;
        private static int currentPort = 7777;

        private sealed class BridgeWorkItem
        {
            public Func<OperationResult> Operation;
            public ManualResetEventSlim WaitHandle;
            public OperationResult Result;
            public Exception Error;
        }
        
        static UnityBridge()
        {
            mainThreadId = Thread.CurrentThread.ManagedThreadId;
            AppDomain.CurrentDomain.AssemblyResolve += ResolveEditorAssembly;
            EditorApplication.update += ProcessMainThreadQueue;
        }
        
        public static bool StartServer(int port = 7777)
        {
            try
            {
                try
                {
                    System.Console.OutputEncoding = System.Text.Encoding.UTF8;
                }
                catch
                {
                }
                
                if (server != null && currentPort != port)
                    StopServer();

                currentPort = port;
                ErrorCollector.AddInfo("Starting Unity Bridge...");

                var newServer = new HttpServer(port, HandleRequest);
                var started = newServer.Start();
                
                if (started)
                {
                    server = newServer;
                    ErrorCollector.AddInfo($"Unity Bridge started on port {port}");
                }
                else
                {
                    server = null;
                    ErrorCollector.AddError("Failed to start Unity Bridge server");
                }
                    
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
        
        public static bool IsRunning => server != null && server.IsRunning;
        
        private static Dictionary<string, object> HandleRequest(string endpoint, Dictionary<string, object> data)
        {
            var requestId = Guid.NewGuid().ToString("N");
            var stopwatch = Stopwatch.StartNew();
            var logCursor = ErrorCollector.GetCursor();
            try
            {
                var compilationError = ErrorCollector.GetCompilationStatus();
                if (!string.IsNullOrEmpty(compilationError))
                    return ResponseBuilder.BuildCompilationErrorResponse(requestId, endpoint, stopwatch.ElapsedMilliseconds);
                
                var request = new UnityRequest(endpoint, data);
                var result = RouteRequest(request);
                var allowLarge = request.GetValue("allow_large_response", false);
                stopwatch.Stop();
                var logs = ErrorCollector.GetEntriesSince(logCursor);
                return ResponseBuilder.BuildResponse(result, allowLarge, requestId, endpoint, stopwatch.ElapsedMilliseconds, logs);
            }
            catch (Exception ex)
            {
                ErrorCollector.AddError($"Request handling error: {ex.Message}");
                stopwatch.Stop();
                var logs = ErrorCollector.GetEntriesSince(logCursor);
                return ResponseBuilder.BuildErrorResponse($"Request failed: {ex.Message}", requestId, endpoint, stopwatch.ElapsedMilliseconds, logs);
            }
        }
        
        private static OperationResult RouteRequest(UnityRequest request)
        {
            switch (request.Endpoint)
            {
                case "/api/health":
                    return ExecuteOnMainThread(() => UnityOperations.GetBridgeHealth(request), request);

                case "/api/screenshot":
                    return ExecuteOnMainThread(() => UnityOperations.TakeScreenshot(request), request);
                    
                case "/api/camera_screenshot":
                    return ExecuteOnMainThread(() => UnityOperations.TakeCameraScreenshot(request), request);
                    
                case "/api/execute":
                    return ExecuteOnMainThread(() => UnityOperations.ExecuteCode(request), request);
                    
                case "/api/scene_hierarchy":
                    return ExecuteOnMainThread(() => UnityOperations.GetSceneHierarchySimple(request), request);
                
                case "/api/scene_radius":
                    return ExecuteOnMainThread(() => UnityOperations.GetObjectsInRadius(request), request);
                
                case "/api/scene_grep":
                    return ExecuteOnMainThread(() => UnityOperations.SceneGrep(request), request);

                case "/api/list_scenes":
                    return ExecuteOnMainThread(() => UnityOperations.ListScenes(request), request);

                case "/api/find_objects":
                    return ExecuteOnMainThread(() => UnityOperations.FindObjects(request), request);

                case "/api/inspect_object":
                    return ExecuteOnMainThread(() => UnityOperations.InspectObject(request), request);

                case "/api/set_transform":
                    return ExecuteOnMainThread(() => UnityOperations.SetTransform(request), request);

                case "/api/set_light":
                    return ExecuteOnMainThread(() => UnityOperations.SetLight(request), request);

                case "/api/set_camera":
                    return ExecuteOnMainThread(() => UnityOperations.SetCamera(request), request);

                case "/api/set_active":
                    return ExecuteOnMainThread(() => UnityOperations.SetActive(request), request);

                case "/api/play_mode":
                    return ExecuteOnMainThread(() => UnityOperations.SetPlayMode(request), request);
                    
                default:
                    return OperationResult.Fail($"Unknown endpoint: {request.Endpoint}");
            }
        }
        
        private static OperationResult ExecuteOnMainThread(Func<OperationResult> operation, UnityRequest request)
        {
            if (IsMainThread())
                return operation();

            var workItem = new BridgeWorkItem
            {
                Operation = operation,
                WaitHandle = new ManualResetEventSlim(false)
            };

            EnqueueMainThreadTask(workItem);

            var timeoutMs = request.GetValue("timeout_ms", 45000);
            if (!workItem.WaitHandle.Wait(timeoutMs))
                return OperationResult.Fail($"Operation timed out after {timeoutMs} ms");

            if (workItem.Error != null)
                return OperationResult.Fail($"Main thread execution error: {workItem.Error.Message}");

            return workItem.Result;
        }
        
        private static void EnqueueMainThreadTask(BridgeWorkItem workItem)
        {
            lock (queueLock)
            {
                mainThreadQueue.Enqueue(workItem);
            }
        }
        
        private static void ProcessMainThreadQueue()
        {
            while (true)
            {
                BridgeWorkItem workItem = null;
                lock (queueLock)
                {
                    if (mainThreadQueue.Count == 0)
                        return;
                    workItem = mainThreadQueue.Dequeue();
                }

                try
                {
                    workItem.Result = workItem.Operation();
                }
                catch (Exception ex)
                {
                    workItem.Error = ex;
                    Debug.LogError($"Main thread task error: {ex.Message}");
                }
                finally
                {
                    workItem.WaitHandle.Set();
                    workItem.WaitHandle.Dispose();
                }
            }
        }
        
        private static bool IsMainThread()
        {
            return Thread.CurrentThread.ManagedThreadId == mainThreadId;
        }
        
        public static string GetStatus()
        {
            var status = IsRunning ? "Running" : "Stopped";
            var errors = ErrorCollector.HasErrors() ? $" ({ErrorCollector.GetRecentErrors(maxCount: 20, errorsOnly: false).Count} logs)" : "";
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

        private static Assembly ResolveEditorAssembly(object sender, ResolveEventArgs args)
        {
            try
            {
                var requestedName = new AssemblyName(args.Name).Name;
                if (string.IsNullOrEmpty(requestedName))
                    return null;

                var loadedAssembly = AppDomain.CurrentDomain
                    .GetAssemblies()
                    .FirstOrDefault(assembly => string.Equals(assembly.GetName().Name, requestedName, StringComparison.OrdinalIgnoreCase));
                if (loadedAssembly != null)
                    return loadedAssembly;

                var candidates = new[]
                {
                    Path.Combine(EditorApplication.applicationContentsPath, "Managed", $"{requestedName}.dll"),
                    Path.Combine(EditorApplication.applicationContentsPath, "NetStandard", "compat", "2.1.0", "shims", "netstandard", $"{requestedName}.dll"),
                    Path.Combine(EditorApplication.applicationContentsPath, "NetStandard", "compat", "2.1.0", "shims", "netfx", $"{requestedName}.dll"),
                    Path.Combine(EditorApplication.applicationContentsPath, "MonoBleedingEdge", "lib", "mono", "4.7.1-api", $"{requestedName}.dll"),
                    Path.Combine(EditorApplication.applicationContentsPath, "MonoBleedingEdge", "lib", "mono", "4.8-api", $"{requestedName}.dll")
                };

                foreach (var candidate in candidates)
                {
                    if (File.Exists(candidate))
                        return Assembly.LoadFrom(candidate);
                }

                var searchRoot = EditorApplication.applicationContentsPath;
                foreach (var dll in Directory.GetFiles(searchRoot, $"{requestedName}.dll", SearchOption.AllDirectories))
                {
                    return Assembly.LoadFrom(dll);
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"AssemblyResolve failed for {args.Name}: {ex.Message}");
            }

            return null;
        }
    }
} 