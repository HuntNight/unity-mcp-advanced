using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;
using UnityEditor;
using System.CodeDom.Compiler;
using System.Text;
using System.Text.RegularExpressions;
using System.IO;

namespace UnityBridge
{
    public static partial class UnityOperations
    {
        private const int DefaultTimeoutMs = 5000;

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

        private static Vector3 ParseVector3(object data)
        {
            if (data is List<object> list && list.Count >= 3)
            {
                var x = Convert.ToSingle(list[0]);
                var y = Convert.ToSingle(list[1]);
                var z = Convert.ToSingle(list[2]);
                return new Vector3(x, y, z);
            }
            if (data is Dictionary<string, object> dict)
            {
                float Get(string k) => dict.ContainsKey(k) ? Convert.ToSingle(dict[k]) : 0f;
                return new Vector3(Get("x"), Get("y"), Get("z"));
            }
            
            throw new ArgumentException("Vector3 data must be array of 3 numbers");
        }

        private static string ValidateUserCode(string code)
        {
            var forbiddenPatterns = new[]
            {
                @"\bSystem\.IO\b",
                @"\bSystem\.Net\b",
                @"\bSystem\.Diagnostics\b",
                @"\bSystem\.Threading\b",
                @"\bSystem\.Reflection\.Emit\b",
                @"\bProcess\.Start\b",
                @"\bnew\s+Process\s*\(",
                @"\bFile\.",
                @"\bDirectory\.",
                @"\bEnvironment\.",
                @"DllImport",
                @"\bApplication\.Quit\b",
                @"\bEditorApplication\.Exit\b"
            };

            foreach (var p in forbiddenPatterns)
            {
                if (Regex.IsMatch(code, p))
                {
                    return $"Forbidden API usage detected: pattern '{p}'";
                }
            }

            // Statements + Functions режим: запрещаем только объявления типов и namespace
            try
            {
                var lines = code.Split('\n');
                for (int i = 0; i < lines.Length; i++)
                {
                    var rawLine = lines[i];
                    var trimmed = rawLine.Trim();

                    // Пропускаем пустые строки и комментарии
                    if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("//"))
                        continue;

                    // Блоки namespace запрещены
                    if (Regex.IsMatch(trimmed, @"^\s*namespace\s+\w+", RegexOptions.IgnoreCase))
                    {
                        return "Statements-only: объявления namespace запрещены. Оставьте только инструкции и выражения.";
                    }

                    // Детектируем объявления типов (class/interface/enum/struct)
                    if (Regex.IsMatch(trimmed,
                        @"^\s*(public\s+|private\s+|internal\s+|protected\s+)?(static\s+)?(class|interface|enum|struct)\s+\w+",
                        RegexOptions.IgnoreCase))
                    {
                        return "Statements-only: объявления class/interface/enum/struct запрещены. Используйте только инструкции без определения типов.";
                    }

                    // Объявления функций РАЗРЕШЕНЫ (обрабатываются и статифицируются позже)
                }
            }
            catch { /* ignore and allow fallback */ }

            return null;
        }

        public static OperationResult SetPlayMode(UnityRequest request)
        {
            var enabled = request.GetValue("enabled", true);

            try
            {
                if (EditorApplication.isPlaying == enabled)
                {
                    return OperationResult.Ok($"Play Mode is already {(enabled ? "enabled" : "disabled")}");
                }

                // Первичная попытка — синхронно, чтобы сразу узнать об ошибке
                try
                {
                    EditorApplication.isPlaying = enabled;
                    if (EditorApplication.isPlaying == enabled)
                    {
                        return OperationResult.Ok($"Play Mode switched: {(enabled ? "enabled" : "disabled")}");
                    }
                }
                catch (Exception ex)
                {
                    return OperationResult.Fail($"Play Mode change failed: {ex.Message}");
                }

                // Фолбэк: schedule через delayCall (например, если сразу не сработало)
                EditorApplication.delayCall += () =>
                {
                    try
                    {
                        EditorApplication.isPlaying = enabled;
                    }
                    catch (Exception ex)
                    {
                        Debug.LogError($"Play Mode delayCall failed: {ex.Message}");
                    }
                };

                return OperationResult.Ok($"Play Mode switch scheduled (retry): {(enabled ? "enabled" : "disabled")}, current state: {(EditorApplication.isPlaying ? "enabled" : "disabled")}");
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Play Mode handler error: {ex.Message}");
            }
        }
    }
}
