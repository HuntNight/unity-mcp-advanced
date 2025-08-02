using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEditor;
using System.CodeDom.Compiler;
using System.Text;

namespace UnityBridge
{
    public static class UnityOperations
    {
        public static OperationResult TakeScreenshot(UnityRequest request)
        {
            try
            {
                var viewType = request.GetValue("view_type", "game");
                var width = request.GetValue("width", 1920);
                var height = request.GetValue("height", 1080);
                
                var texture = CaptureGameView(width, height);
                var imageBytes = texture.EncodeToPNG();
                UnityEngine.Object.DestroyImmediate(texture);
                
                var base64 = Convert.ToBase64String(imageBytes);
                var message = $"{viewType.ToUpper()} screenshot captured ({imageBytes.Length} bytes)";
                
                return OperationResult.Ok(message, base64);
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Screenshot failed: {ex.Message}");
            }
        }
        
        public static OperationResult TakeCameraScreenshot(UnityRequest request)
        {
            try
            {
                var position = ParseVector3(request.Data.GetValueOrDefault("position"));
                var target = ParseVector3(request.Data.GetValueOrDefault("target"));
                var fov = request.GetValue("fov", 60f);
                var width = request.GetValue("width", 1920);
                var height = request.GetValue("height", 1080);
                
                var base64 = CaptureFromPosition(position, target, fov, width, height);
                var message = $"Camera screenshot from {position} to {target} ({fov}° FOV)";
                
                return OperationResult.Ok(message, base64);
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Camera screenshot failed: {ex.Message}");
            }
        }
        
        public static OperationResult ExecuteCode(UnityRequest request)
        {
            try
            {
                var code = request.GetValue<string>("code");
                if (string.IsNullOrEmpty(code))
                    return OperationResult.Fail("Code parameter is required");
                
                var unescapedCode = JsonUtils.Unescape(code);
                
                var result = ExecuteCodeDirect(unescapedCode);
                
                if (result.Success)
                    return OperationResult.Ok("Code executed successfully", result.Value);
                else
                    return OperationResult.Fail($"Code execution failed: {result.ErrorMessage}");
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Code execution error: {ex.Message}");
            }
        }
        
        private static CodeExecutionResult ExecuteCodeDirect(string code)
        {
            try
            {
                var fullCode = GenerateFullCodeForExecution(code);
                
                var provider = new Microsoft.CSharp.CSharpCodeProvider();
                var parameters = new System.CodeDom.Compiler.CompilerParameters();
                
                parameters.ReferencedAssemblies.Add("mscorlib.dll");
                parameters.ReferencedAssemblies.Add("System.dll");
                parameters.ReferencedAssemblies.Add("System.Core.dll");
                parameters.ReferencedAssemblies.Add(typeof(UnityEngine.GameObject).Assembly.Location);
                parameters.ReferencedAssemblies.Add(typeof(UnityEditor.EditorWindow).Assembly.Location);
                
                foreach (var asm in System.AppDomain.CurrentDomain.GetAssemblies())
                {
                    try
                    {
                        var name = asm.GetName().Name;
                        if ((name.StartsWith("UnityEngine") || name.StartsWith("UnityEditor")) 
                            && !string.IsNullOrEmpty(asm.Location))
                        {
                            parameters.ReferencedAssemblies.Add(asm.Location);
                        }
                    }
                    catch { /* ignore */ }
                }
                
                foreach (var asm in System.AppDomain.CurrentDomain.GetAssemblies())
                {
                    try
                    {
                        var name = asm.GetName().Name;
                        if ((name.StartsWith("System") || name.StartsWith("mscorlib") || name == "netstandard") 
                            && !string.IsNullOrEmpty(asm.Location))
                        {
                            parameters.ReferencedAssemblies.Add(asm.Location);
                        }
                    }
                    catch { /* ignore */ }
                }
                
                parameters.GenerateInMemory = true;
                parameters.GenerateExecutable = false;
                
                var results = provider.CompileAssemblyFromSource(parameters, fullCode);
                
                if (results.Errors.HasErrors)
                {
                    var cleanedErrors = results.Errors.Cast<System.CodeDom.Compiler.CompilerError>()
                        .Select(error => CleanCompilerErrorPath(error.ToString()));
                    var errorMsg = string.Join("; ", cleanedErrors);
                    return new CodeExecutionResult { Success = false, ErrorMessage = errorMsg };
                }
                
                var assembly = results.CompiledAssembly;
                var type = assembly.GetType("DynamicCodeExecutor");
                var method = type.GetMethod("Execute", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.Public);
                var result = method.Invoke(null, null);
                
                return new CodeExecutionResult { Success = true, Value = result?.ToString() ?? "null" };
            }
            catch (Exception ex)
            {
                return new CodeExecutionResult { Success = false, ErrorMessage = ex.Message };
            }
        }
        
        private static string CleanCompilerErrorPath(string errorMessage)
        {
            if (string.IsNullOrEmpty(errorMessage))
                return errorMessage;
                
            try
            {
                var tempPath = System.IO.Path.GetTempPath().TrimEnd(System.IO.Path.DirectorySeparatorChar, System.IO.Path.AltDirectorySeparatorChar);
                var pattern = System.Text.RegularExpressions.Regex.Escape(tempPath) + @"[/\\][^/\\]*\.cs\((\d+),(\d+)\)\s*:";
                var replacement = @"UserCode.cs($1,$2) :";
                var cleanedError = System.Text.RegularExpressions.Regex.Replace(errorMessage, pattern, replacement);
                return cleanedError;
            }
            catch
            {
                return errorMessage;
            }
        }
        
        private static string GenerateFullCodeForExecution(string userCode)
        {
            var defaultUsings = new[]
            {
                "System",
                "System.Collections.Generic", 
                "System.Linq",
                "UnityEngine",
                "UnityEditor"
            };
            
            var allUsings = new HashSet<string>(defaultUsings);
            var codeLines = userCode.Split('\n');
            
            var parseResult = ParseAdvancedCode(codeLines, allUsings);
            
            var usings = string.Join("\n", allUsings.OrderBy(u => u).Select(u => $"using {u};"));
            
            var generatedCode = $@"{usings}

{parseResult.ClassDefinitions}

public class DynamicCodeExecutor
{{
{parseResult.LocalFunctions}
    
    public static object Execute()
    {{
        {parseResult.ExecutableCode}
    }}
}}";

            return generatedCode;
        }
        
        private static CodeParseResult ParseAdvancedCode(string[] codeLines, HashSet<string> allUsings)
        {
            var result = new CodeParseResult();
            var executableLines = new List<string>();
            var currentSection = CodeSection.Using;
            var braceDepth = 0;
            var currentBlock = new List<string>();
            var blockType = "";
            
            for (int i = 0; i < codeLines.Length; i++)
            {
                var line = codeLines[i];
                var trimmedLine = line.Trim();
                
                if (currentSection == CodeSection.Using && trimmedLine.StartsWith("using "))
                {
                    ExtractUsing(trimmedLine, allUsings);
                    continue;
                }
                
                if (currentSection == CodeSection.Using && (string.IsNullOrWhiteSpace(trimmedLine) || trimmedLine.StartsWith("//")))
                {
                    continue;
                }
                
                if (currentSection == CodeSection.Using)
                {
                    currentSection = CodeSection.Code;
                }
                
                if (braceDepth == 0 && IsBlockStart(trimmedLine))
                {
                    blockType = GetBlockType(trimmedLine);
                    currentBlock.Clear();
                    currentBlock.Add(line);
                    braceDepth += CountBraces(line, true) - CountBraces(line, false);
                    
                    if (braceDepth == 0)
                    {
                        for (int j = i + 1; j < codeLines.Length; j++)
                        {
                            var nextLine = codeLines[j];
                            currentBlock.Add(nextLine);
                            braceDepth += CountBraces(nextLine, true) - CountBraces(nextLine, false);
                            if (braceDepth > 0) 
                            {
                                i = j;
                                break;
                            }
                        }
                    }
                    continue;
                }
                
                if (braceDepth > 0)
                {
                    currentBlock.Add(line);
                    braceDepth += CountBraces(trimmedLine, true) - CountBraces(trimmedLine, false);
                    
                    if (braceDepth == 0)
                    {
                        var blockCode = string.Join("\n", currentBlock);
                        
                        if (blockType == "class" || blockType == "interface" || blockType == "enum" || blockType == "struct")
                        {
                            result.ClassDefinitions += blockCode + "\n\n";
                        }
                        else if (blockType == "function")
                        {
                            var staticFunction = blockCode;
                            if (!staticFunction.ToLower().Contains("static"))
                            {
                                var lines = staticFunction.Split('\n');
                                for (int k = 0; k < lines.Length; k++)
                                {
                                    var currentLine = lines[k];
                                    if (System.Text.RegularExpressions.Regex.IsMatch(currentLine, @"^\s*[\w<>\[\]]+\s+\w+\s*\("))
                                    {
                                        lines[k] = currentLine.Replace(currentLine.Trim(), "static " + currentLine.Trim());
                                        break;
                                    }
                                }
                                staticFunction = string.Join("\n", lines);
                            }
                            result.LocalFunctions += "    " + staticFunction.Replace("\n", "\n    ") + "\n\n";
                        }
                    }
                    continue;
                }
                
                executableLines.Add(line);
            }
            
            var executableCode = string.Join("\n", executableLines).Trim();
            
            result.ExecutableCode = EnsureReturnStatement(executableCode);
            
            return result;
        }
        
        private static string EnsureReturnStatement(string code)
        {
            if (string.IsNullOrWhiteSpace(code))
            {
                return "return \"Definitions processed.\";";
            }

            return code + "\nreturn \"Execution finished successfully.\";";
        }

        private static void ExtractUsing(string line, HashSet<string> usings)
        {
            try
            {
                var usingPart = line.Substring(6).Trim();
                if (usingPart.EndsWith(";"))
                    usingPart = usingPart.Substring(0, usingPart.Length - 1).Trim();
                
                usingPart = usingPart.Replace("\"", "").Replace("'", "").Trim();
                
                if (!string.IsNullOrWhiteSpace(usingPart) && System.Text.RegularExpressions.Regex.IsMatch(usingPart, @"^[a-zA-Z_][a-zA-Z0-9_.]*$"))
                {
                    usings.Add(usingPart);
                }
            }
            catch { /* ignore */ }
        }
        
        private static bool IsBlockStart(string line)
        {
            if (System.Text.RegularExpressions.Regex.IsMatch(line, 
                @"^\s*(public\s+|private\s+|internal\s+|protected\s+)?(static\s+)?(class\s+|interface\s+|enum\s+|struct\s+)\w+", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return true;
            }
            
            if (System.Text.RegularExpressions.Regex.IsMatch(line, 
                @"^\s*(public\s+|private\s+|internal\s+|protected\s+)?(static\s+)?[\w<>\[\]]+\s+\w+\s*\([^)]*\)", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return true;
            }
            
            return false;
        }
        
        private static string GetBlockType(string line)
        {
            var lowerLine = line.ToLower();
            if (lowerLine.Contains("class ")) return "class";
            if (lowerLine.Contains("interface ")) return "interface";  
            if (lowerLine.Contains("enum ")) return "enum";
            if (lowerLine.Contains("struct ")) return "struct";
            
            if (System.Text.RegularExpressions.Regex.IsMatch(line, 
                @"^\s*(public\s+|private\s+|internal\s+|protected\s+)?(static\s+)?[\w<>\[\]]+\s+\w+\s*\([^)]*\)", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return "function";
            }
            
            return "unknown";  
        }
        
        private static int CountBraces(string line, bool opening)
        {
            return line.Count(c => c == (opening ? '{' : '}'));
        }
        
        private class CodeParseResult
        {
            public string ClassDefinitions { get; set; } = "";
            public string LocalFunctions { get; set; } = "";
            public string ExecutableCode { get; set; } = "";
        }
        
        private enum CodeSection
        {
            Using,
            Code
        }
        
        private class CodeExecutionResult
        {
            public bool Success { get; set; }
            public string Value { get; set; }
            public string ErrorMessage { get; set; }
        }
        
        public static OperationResult GetSceneHierarchy(UnityRequest request)
        {
            try
            {
                var detailed = request.GetValue("detailed", false);
                var scene = UnityEditor.SceneManagement.EditorSceneManager.GetActiveScene();
                var rootObjects = scene.GetRootGameObjects();
                
                var hierarchyText = FormatSceneHierarchy(scene, rootObjects, detailed);
                
                var message = $"Scene '{scene.name}' analyzed: {rootObjects.Length} root objects";
                return OperationResult.Ok(message, hierarchyText);
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Scene hierarchy failed: {ex.Message}");
            }
        }
        
        private static string FormatSceneHierarchy(UnityEngine.SceneManagement.Scene scene, GameObject[] rootObjects, bool detailed)
        {
            var sb = new System.Text.StringBuilder();
            var totalObjects = UnityEngine.Object.FindObjectsOfType<GameObject>().Length;
            
            sb.AppendLine($"🏞️  Scene: {scene.name}");
            sb.AppendLine($"📊 Stats: {rootObjects.Length} root objects, {totalObjects} total objects");
            sb.AppendLine($"🔍 Mode: {(detailed ? "Detailed" : "Basic")}");
            sb.AppendLine();
            sb.AppendLine("📋 Hierarchy:");
            
            for (int i = 0; i < rootObjects.Length; i++)
            {
                var isLast = i == rootObjects.Length - 1;
                FormatGameObjectHierarchy(rootObjects[i], sb, "", isLast, detailed);
            }
            
            return sb.ToString();
        }
        
        private static void FormatGameObjectHierarchy(GameObject obj, System.Text.StringBuilder sb, string prefix, bool isLast, bool detailed)
        {
            var treeSymbol = isLast ? "└── " : "├── ";
            var childPrefix = prefix + (isLast ? "    " : "│   ");
            
            var statusIcon = obj.activeInHierarchy ? "✅" : "❌";
            var objectInfo = $"{statusIcon} {obj.name}";
            
            if (obj.tag != "Untagged")
                objectInfo += $" [{obj.tag}]";
            
            var layerName = LayerMask.LayerToName(obj.layer);
            if (!string.IsNullOrEmpty(layerName) && layerName != "Default")
                objectInfo += $" (layer: {layerName})";
            
            sb.AppendLine($"{prefix}{treeSymbol}{objectInfo}");
            
            if (detailed)
            {
                var detailPrefix = prefix + (isLast ? "    " : "│   ") + "    ";
                var transform = obj.transform;
                
                var pos = transform.position;
                var rot = transform.eulerAngles;  
                var scale = transform.localScale;
                
                sb.AppendLine($"{detailPrefix}📍 Position: ({pos.x:F2}, {pos.y:F2}, {pos.z:F2})");
                sb.AppendLine($"{detailPrefix}🔄 Rotation: ({rot.x:F1}°, {rot.y:F1}°, {rot.z:F1}°)");
                sb.AppendLine($"{detailPrefix}📏 Scale: ({scale.x:F2}, {scale.y:F2}, {scale.z:F2})");
                
                var components = obj.GetComponents<Component>()
                    .Where(c => c != null)
                    .Select(c => c.GetType().Name)
                    .Where(name => name != "Transform")
                    .ToList();
                
                if (components.Count > 0)
                {
                    sb.AppendLine($"{detailPrefix}🔧 Components: {string.Join(", ", components)}");
                }
            }
            
            var childCount = obj.transform.childCount;
            for (int i = 0; i < childCount; i++)
            {
                var child = obj.transform.GetChild(i).gameObject;
                var isLastChild = i == childCount - 1;
                FormatGameObjectHierarchy(child, sb, childPrefix, isLastChild, detailed);
            }
        }
        
        private static Texture2D CaptureGameView(int width, int height)
        {
            try
            {
                var gameViewTexture = TryCaptureGameViewReflection(width, height);
                if (gameViewTexture != null)
                    return gameViewTexture;
                
                return CaptureAllCamerasWithUIEditorMode(width, height);
            }
            catch (Exception ex)
            {
                Debug.LogError($"CaptureGameView error: {ex.Message}");
                return CreateErrorTexture(width, height, $"Screenshot Error: {ex.Message}");
            }
        }
        
        private static Texture2D ScaleTexture(Texture2D source, int targetWidth, int targetHeight)
        {
            var scaled = new Texture2D(targetWidth, targetHeight, TextureFormat.RGB24, false);
            var rt = RenderTexture.GetTemporary(targetWidth, targetHeight);
            
            Graphics.Blit(source, rt);
            RenderTexture.active = rt;
            scaled.ReadPixels(new Rect(0, 0, targetWidth, targetHeight), 0, 0);
            scaled.Apply();
            
            RenderTexture.active = null;
            RenderTexture.ReleaseTemporary(rt);
            
            return scaled;
        }
        
        private static Texture2D TryCaptureGameViewReflection(int width, int height)
        {
            try
            {
                var gameViewType = System.Type.GetType("UnityEditor.GameView,UnityEditor");
                if (gameViewType != null)
                {
                    var gameView = EditorWindow.GetWindow(gameViewType);
                    if (gameView != null)
                    {
                        var method = gameViewType.GetMethod("GetMainGameViewRenderTexture", 
                            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
                        
                        if (method != null)
                        {
                            var renderTexture = method.Invoke(null, null) as RenderTexture;
                            if (renderTexture != null)
                            {
                                var texture = new Texture2D(width, height, TextureFormat.RGB24, false);
                                var originalRT = RenderTexture.active;
                                
                                RenderTexture.active = renderTexture;
                                texture.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                                texture.Apply();
                                RenderTexture.active = originalRT;
                                
                                return texture;
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"GameView reflection failed: {ex.Message}");
            }
            
            return null;
        }
        
        private static Texture2D CaptureAllCamerasWithUIEditorMode(int width, int height)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGB24, false);
            var renderTexture = new RenderTexture(width, height, 24);
            var originalRT = RenderTexture.active;
            
            try
            {
                RenderTexture.active = renderTexture;
                
                GL.Clear(true, true, Color.clear);
                
                var cameras = Camera.allCameras.Where(c => c != null && c.enabled).ToArray();
                if (cameras.Length == 0 && Camera.main != null)
                {
                    cameras = new[] { Camera.main };
                }
                
                foreach (var camera in cameras)
                {
                    var originalTarget = camera.targetTexture;
                    camera.targetTexture = renderTexture;
                    camera.Render();
                    camera.targetTexture = originalTarget;
                }
                
                Canvas.ForceUpdateCanvases();
                
                var overlayCanvases = UnityEngine.Object.FindObjectsOfType<Canvas>()
                    .Where(c => c.renderMode == RenderMode.ScreenSpaceOverlay && c.enabled)
                    .OrderBy(c => c.sortingOrder)
                    .ToList();
                
                var originalCanvasSettings = new List<(Canvas canvas, RenderMode originalMode, Camera originalCamera)>();
                
                try
                {
                    foreach (var canvas in overlayCanvases)
                    {
                        originalCanvasSettings.Add((canvas, canvas.renderMode, canvas.worldCamera));
                        
                        canvas.renderMode = RenderMode.ScreenSpaceCamera;
                        canvas.worldCamera = cameras.FirstOrDefault() ?? Camera.main;
                        canvas.planeDistance = 1f;
                    }
                    
                    Canvas.ForceUpdateCanvases();
                    
                    foreach (var camera in cameras)
                    {
                        var originalTarget = camera.targetTexture;
                        camera.targetTexture = renderTexture;
                        camera.Render();
                        camera.targetTexture = originalTarget;
                    }
                }
                finally
                {
                    foreach (var (canvas, originalMode, originalCamera) in originalCanvasSettings)
                    {
                        if (canvas != null)
                        {
                            canvas.renderMode = originalMode;
                            canvas.worldCamera = originalCamera;
                        }
                    }
                    
                    Canvas.ForceUpdateCanvases();
                }
                
                texture.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                texture.Apply();
            }
            finally
            {
                RenderTexture.active = originalRT;
                UnityEngine.Object.DestroyImmediate(renderTexture);
            }
            
            return texture;
        }
        
        private static Texture2D CreateErrorTexture(int width, int height, string errorMessage)
        {
            var texture = new Texture2D(width, height, TextureFormat.RGB24, false);
            var pixels = new Color32[width * height];
            
            for (int i = 0; i < pixels.Length; i++)
                pixels[i] = new Color32(128, 0, 0, 255);
                
            texture.SetPixels32(pixels);
            texture.Apply();
            
            Debug.LogError(errorMessage);
            return texture;
        }
        
        private static string CaptureFromPosition(Vector3 position, Vector3 target, float fov, int width, int height)
        {
            var cameraObj = new GameObject("TempCamera");
            var camera = cameraObj.AddComponent<Camera>();
            
            try
            {
                camera.transform.position = position;
                camera.transform.LookAt(target);
                camera.fieldOfView = fov;
                camera.aspect = (float)width / height;
                
                var renderTexture = new RenderTexture(width, height, 24);
                camera.targetTexture = renderTexture;
                camera.Render();
                
                RenderTexture.active = renderTexture;
                var texture = new Texture2D(width, height, TextureFormat.RGB24, false);
                texture.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                texture.Apply();
                
                var imageBytes = texture.EncodeToPNG();
                var base64 = Convert.ToBase64String(imageBytes);
                
                RenderTexture.active = null;
                renderTexture.Release();
                UnityEngine.Object.DestroyImmediate(texture);
                
                return base64;
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(cameraObj);
            }
        }
        
        private static Vector3 ParseVector3(object data)
        {
            if (data is List<object> list && list.Count >= 3)
            {
                var x = Convert.ToSingle(list[0]);
                var y = Convert.ToSingle(list[1]);
                var z = Convert.ToSingle(list[2]);
                return new Vector3(x, y, z);
            }
            
            throw new ArgumentException("Vector3 data must be array of 3 numbers");
        }
    }
}
