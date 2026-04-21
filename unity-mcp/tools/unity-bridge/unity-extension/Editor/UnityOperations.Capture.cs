using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEditor;
using System.IO;

namespace UnityBridge
{
    public static partial class UnityOperations
    {
        public static OperationResult TakeScreenshot(UnityRequest request)
        {
            try
            {
                var viewType = request.GetValue("view_type", "game");
                var width = Math.Max(256, Math.Min(4096, request.GetValue("width", 1920)));
                var height = Math.Max(256, Math.Min(4096, request.GetValue("height", 1080)));

                Texture2D texture;
                if (string.Equals(viewType, "scene", StringComparison.OrdinalIgnoreCase))
                    texture = CaptureSceneView(width, height) ?? CaptureGameView(width, height);
                else
                    texture = CaptureGameView(width, height);
                var imageBytes = texture.EncodeToPNG();
                UnityEngine.Object.DestroyImmediate(texture);
                
                var base64 = Convert.ToBase64String(imageBytes);
                var message = $"{viewType.ToUpper()} screenshot captured ({imageBytes.Length} bytes)";
                
                return OperationResult.Ok(message, new ImagePayload(base64));
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
                var includeInactive = request.GetValue("include_inactive", true);
                var fov = request.GetValue("fov", 60f);
                var width = Math.Max(256, Math.Min(4096, request.GetValue("width", 1920)));
                var height = Math.Max(256, Math.Min(4096, request.GetValue("height", 1080)));
                var selection = ResolveSceneScope(request, includeInactive);
                var targetObject = ResolveObject(selection, request);
                var hasObjectSelector = request.Data.ContainsKey("instance_id") || request.Data.ContainsKey("path") || request.Data.ContainsKey("name");

                string base64;
                string message;

                if (targetObject != null)
                {
                    var existingCamera = targetObject.GetComponent<Camera>();
                    if (existingCamera == null)
                        return OperationResult.Fail("Target object does not contain a Camera component.", "CAMERA_NOT_FOUND");

                    base64 = CaptureFromExistingCamera(existingCamera, width, height);
                    message = $"Camera screenshot from existing camera {BuildPath(targetObject)}";
                }
                else
                {
                    if (hasObjectSelector)
                        return OperationResult.Fail("Requested camera object was not found in the selected scope.", "OBJECT_NOT_FOUND");
                    if (!request.Data.ContainsKey("position") || !request.Data.ContainsKey("target"))
                        return OperationResult.Fail("Either an existing camera selector or both position and target are required.", "VALIDATION_ERROR");

                    var position = ParseVector3(request.Data.GetValueOrDefault("position"));
                    var target = ParseVector3(request.Data.GetValueOrDefault("target"));
                    base64 = CaptureFromPosition(position, target, fov, width, height);
                    message = $"Camera screenshot from {position} to {target} ({fov}° FOV)";
                }
                
                return OperationResult.Ok(message, new ImagePayload(base64));
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Camera screenshot failed: {ex.Message}");
            }
        }

        private static Texture2D CaptureGameView(int width, int height)
        {
            return CaptureAllCamerasWithUIEditorMode(width, height);
        }

        private static Texture2D CaptureSceneView(int width, int height)
        {
            return CaptureSceneContentIntelligently(width, height);
        }

        private static Texture2D CaptureAllCamerasWithUIEditorMode(int width, int height)
        {
            var renderTexture = new RenderTexture(width, height, 24);
            var originalRT = RenderTexture.active;
            var texture = new Texture2D(width, height, TextureFormat.RGB24, false);
            
            try
            {
                RenderTexture.active = renderTexture;
                GL.Clear(true, true, Color.gray);
                
                var cameras = Camera.allCameras
                    .OrderBy(c => c.depth)
                    .ToList();
                
                if (cameras.Count == 0)
                {
                    return CreateErrorTexture(width, height, "No cameras found in scene");
                }

                var originalCanvasSettings = new List<(Canvas canvas, RenderMode mode, Camera camera)>();
                var canvases = UnityEngine.Object.FindObjectsOfType<Canvas>();
                
                try
                {
                    foreach (var canvas in canvases)
                    {
                        if (canvas.renderMode == RenderMode.ScreenSpaceOverlay)
                        {
                            originalCanvasSettings.Add((canvas, canvas.renderMode, canvas.worldCamera));
                            canvas.renderMode = RenderMode.ScreenSpaceCamera;
                            canvas.worldCamera = cameras.Last();
                        }
                    }
                    
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

        private static string CaptureFromExistingCamera(Camera sourceCamera, int width, int height)
        {
            var renderTexture = new RenderTexture(width, height, 24);
            var originalTargetTexture = sourceCamera.targetTexture;
            var originalActive = RenderTexture.active;

            try
            {
                sourceCamera.targetTexture = renderTexture;
                sourceCamera.Render();

                RenderTexture.active = renderTexture;
                var texture = new Texture2D(width, height, TextureFormat.RGB24, false);
                texture.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                texture.Apply();

                var imageBytes = texture.EncodeToPNG();
                UnityEngine.Object.DestroyImmediate(texture);
                return Convert.ToBase64String(imageBytes);
            }
            finally
            {
                sourceCamera.targetTexture = originalTargetTexture;
                RenderTexture.active = originalActive;
                UnityEngine.Object.DestroyImmediate(renderTexture);
            }
        }
        
        private static Texture2D CaptureSceneContentIntelligently(int width, int height)
        {
            try
            {
                var allRenderers = UnityEngine.Object.FindObjectsOfType<Renderer>()
                    .Where(r => r != null && r.enabled && r.gameObject.activeInHierarchy)
                    .ToList();

                if (allRenderers.Count == 0)
                {
                    Debug.LogWarning("No visible renderers found, falling back to camera-based capture");
                    return CaptureAllCamerasWithUIEditorMode(width, height);
                }

                var combinedBounds = CalculateCombinedBounds(allRenderers);
                
                return CaptureWithOptimalCameraPosition(combinedBounds, width, height);
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"Intelligent scene capture failed: {ex.Message}, falling back to camera-based capture");
                return CaptureAllCamerasWithUIEditorMode(width, height);
            }
        }

        private static Bounds CalculateCombinedBounds(List<Renderer> renderers)
        {
            if (renderers.Count == 0)
                return new Bounds(Vector3.zero, Vector3.one);

            var bounds = renderers[0].bounds;
            
            for (int i = 1; i < renderers.Count; i++)
            {
                bounds.Encapsulate(renderers[i].bounds);
            }

            var minSize = 1f;
            if (bounds.size.magnitude < minSize)
            {
                bounds.size = Vector3.one * minSize;
            }

            return bounds;
        }

        private static Texture2D CaptureWithOptimalCameraPosition(Bounds targetBounds, int width, int height)
        {
            var cameraObj = new GameObject("IntelligentScreenshotCamera");
            var camera = cameraObj.AddComponent<Camera>();
            
            try
            {
                camera.fieldOfView = 60f;
                camera.aspect = (float)width / height;
                camera.nearClipPlane = 0.1f;
                camera.farClipPlane = 1000f;
                camera.clearFlags = CameraClearFlags.Color;
                camera.backgroundColor = Color.gray;

                var cameraPosition = CalculateOptimalCameraPosition(targetBounds, camera);
                camera.transform.position = cameraPosition;
                camera.transform.LookAt(targetBounds.center);

                var renderTexture = new RenderTexture(width, height, 24);
                camera.targetTexture = renderTexture;
                camera.Render();

                RenderTexture.active = renderTexture;
                var texture = new Texture2D(width, height, TextureFormat.RGB24, false);
                texture.ReadPixels(new Rect(0, 0, width, height), 0, 0);
                texture.Apply();

                RenderTexture.active = null;
                renderTexture.Release();

                Debug.Log($"Intelligent screenshot captured: bounds center {targetBounds.center}, size {targetBounds.size}, camera at {cameraPosition}");
                return texture;
            }
            finally
            {
                UnityEngine.Object.DestroyImmediate(cameraObj);
            }
        }

        private static Vector3 CalculateOptimalCameraPosition(Bounds bounds, Camera camera)
        {
            var maxDimension = Mathf.Max(bounds.size.x, bounds.size.y, bounds.size.z);
            var distance = maxDimension / (2f * Mathf.Tan(0.5f * camera.fieldOfView * Mathf.Deg2Rad));
            
            distance *= 1.5f; 

            return bounds.center + new Vector3(distance, distance, -distance).normalized * distance;
        }
    }
}
