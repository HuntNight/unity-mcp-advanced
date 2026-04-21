using System;
using System.Collections.Generic;
using UnityEngine;

namespace UnityBridge
{
    public static partial class UnityOperations
    {
        public static OperationResult SetTransform(UnityRequest request)
        {
            try
            {
                var includeInactive = request.GetValue("include_inactive", true);
                var selection = ResolveSceneScope(request, includeInactive);
                var target = ResolveObject(selection, request);
                if (target == null)
                    return OperationResult.Fail("Object not found in selected scope", "OBJECT_NOT_FOUND");

                var transform = target.transform;
                var changes = new List<string>();

                if (TryGetVector3(request, "position", out var position))
                {
                    transform.position = position;
                    changes.Add($"position={position}");
                }

                if (TryGetVector3(request, "local_position", out var localPosition))
                {
                    transform.localPosition = localPosition;
                    changes.Add($"localPosition={localPosition}");
                }

                if (TryGetVector3(request, "rotation", out var rotation))
                {
                    transform.eulerAngles = rotation;
                    changes.Add($"rotation={rotation}");
                }

                if (TryGetVector3(request, "local_rotation", out var localRotation))
                {
                    transform.localEulerAngles = localRotation;
                    changes.Add($"localRotation={localRotation}");
                }

                if (TryGetVector3(request, "local_scale", out var localScale))
                {
                    transform.localScale = localScale;
                    changes.Add($"localScale={localScale}");
                }

                if (changes.Count == 0)
                    return OperationResult.Fail("No transform fields were provided.", "VALIDATION_ERROR");

                return OperationResult.Ok(
                    $"Transform updated for {BuildPath(target)}",
                    new Dictionary<string, object>
                    {
                        { "path", BuildPath(target) },
                        { "instanceId", target.GetInstanceID() },
                        { "applied", changes },
                        { "transform", new Dictionary<string, object>
                            {
                                { "position", SerializeValueForJson(transform.position) },
                                { "localPosition", SerializeValueForJson(transform.localPosition) },
                                { "rotation", SerializeValueForJson(transform.eulerAngles) },
                                { "localRotation", SerializeValueForJson(transform.localEulerAngles) },
                                { "localScale", SerializeValueForJson(transform.localScale) }
                            }
                        }
                    });
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Set transform failed: {ex.Message}", "SET_TRANSFORM_FAILED");
            }
        }

        public static OperationResult SetLight(UnityRequest request)
        {
            try
            {
                var includeInactive = request.GetValue("include_inactive", true);
                var selection = ResolveSceneScope(request, includeInactive);
                var target = ResolveObject(selection, request);
                if (target == null)
                    return OperationResult.Fail("Object not found in selected scope", "OBJECT_NOT_FOUND");

                var light = target.GetComponent<Light>();
                if (light == null)
                    return OperationResult.Fail("Target object does not contain a Light component.", "LIGHT_NOT_FOUND");

                var changes = new List<string>();

                if (TryGetFloat(request, "intensity", out var intensity))
                {
                    light.intensity = intensity;
                    changes.Add($"intensity={intensity}");
                }

                if (TryGetFloat(request, "range", out var range))
                {
                    light.range = range;
                    changes.Add($"range={range}");
                }

                if (TryGetFloat(request, "spot_angle", out var spotAngle))
                {
                    light.spotAngle = spotAngle;
                    changes.Add($"spotAngle={spotAngle}");
                }

                if (TryGetFloat(request, "shadow_strength", out var shadowStrength))
                {
                    light.shadowStrength = shadowStrength;
                    changes.Add($"shadowStrength={shadowStrength}");
                }

                if (TryGetColor(request, "color", out var color))
                {
                    light.color = color;
                    changes.Add($"color={color}");
                }

                if (TryGetBool(request, "enabled", out var enabled))
                {
                    light.enabled = enabled;
                    changes.Add($"enabled={enabled}");
                }

                if (TryGetString(request, "light_type", out var lightTypeRaw) &&
                    Enum.TryParse(lightTypeRaw, true, out LightType lightType))
                {
                    light.type = lightType;
                    changes.Add($"type={lightType}");
                }

                if (TryGetString(request, "shadows", out var shadowsRaw) &&
                    Enum.TryParse(shadowsRaw, true, out LightShadows shadows))
                {
                    light.shadows = shadows;
                    changes.Add($"shadows={shadows}");
                }

                if (changes.Count == 0)
                    return OperationResult.Fail("No light fields were provided.", "VALIDATION_ERROR");

                return OperationResult.Ok(
                    $"Light updated for {BuildPath(target)}",
                    new Dictionary<string, object>
                    {
                        { "path", BuildPath(target) },
                        { "instanceId", target.GetInstanceID() },
                        { "applied", changes },
                        { "light", new Dictionary<string, object>
                            {
                                { "type", light.type.ToString() },
                                { "color", SerializeValueForJson(light.color) },
                                { "intensity", light.intensity },
                                { "range", light.range },
                                { "spotAngle", light.spotAngle },
                                { "shadows", light.shadows.ToString() },
                                { "shadowStrength", light.shadowStrength },
                                { "enabled", light.enabled }
                            }
                        }
                    });
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Set light failed: {ex.Message}", "SET_LIGHT_FAILED");
            }
        }

        public static OperationResult SetCamera(UnityRequest request)
        {
            try
            {
                var includeInactive = request.GetValue("include_inactive", true);
                var selection = ResolveSceneScope(request, includeInactive);
                var target = ResolveObject(selection, request);
                if (target == null)
                    return OperationResult.Fail("Object not found in selected scope", "OBJECT_NOT_FOUND");

                var camera = target.GetComponent<Camera>();
                if (camera == null)
                    return OperationResult.Fail("Target object does not contain a Camera component.", "CAMERA_NOT_FOUND");

                var changes = new List<string>();

                if (TryGetFloat(request, "field_of_view", out var fieldOfView))
                {
                    camera.fieldOfView = fieldOfView;
                    changes.Add($"fieldOfView={fieldOfView}");
                }

                if (TryGetFloat(request, "near_clip_plane", out var nearClipPlane))
                {
                    camera.nearClipPlane = nearClipPlane;
                    changes.Add($"nearClipPlane={nearClipPlane}");
                }

                if (TryGetFloat(request, "far_clip_plane", out var farClipPlane))
                {
                    camera.farClipPlane = farClipPlane;
                    changes.Add($"farClipPlane={farClipPlane}");
                }

                if (TryGetBool(request, "orthographic", out var orthographic))
                {
                    camera.orthographic = orthographic;
                    changes.Add($"orthographic={orthographic}");
                }

                if (TryGetFloat(request, "orthographic_size", out var orthographicSize))
                {
                    camera.orthographicSize = orthographicSize;
                    changes.Add($"orthographicSize={orthographicSize}");
                }

                if (TryGetBool(request, "enabled", out var enabled))
                {
                    camera.enabled = enabled;
                    changes.Add($"enabled={enabled}");
                }

                if (TryGetString(request, "clear_flags", out var clearFlagsRaw) &&
                    Enum.TryParse(clearFlagsRaw, true, out CameraClearFlags clearFlags))
                {
                    camera.clearFlags = clearFlags;
                    changes.Add($"clearFlags={clearFlags}");
                }

                if (TryGetColor(request, "background_color", out var backgroundColor))
                {
                    camera.backgroundColor = backgroundColor;
                    changes.Add($"backgroundColor={backgroundColor}");
                }

                if (changes.Count == 0)
                    return OperationResult.Fail("No camera fields were provided.", "VALIDATION_ERROR");

                return OperationResult.Ok(
                    $"Camera updated for {BuildPath(target)}",
                    new Dictionary<string, object>
                    {
                        { "path", BuildPath(target) },
                        { "instanceId", target.GetInstanceID() },
                        { "applied", changes },
                        { "camera", new Dictionary<string, object>
                            {
                                { "fieldOfView", camera.fieldOfView },
                                { "nearClipPlane", camera.nearClipPlane },
                                { "farClipPlane", camera.farClipPlane },
                                { "orthographic", camera.orthographic },
                                { "orthographicSize", camera.orthographicSize },
                                { "enabled", camera.enabled },
                                { "clearFlags", camera.clearFlags.ToString() },
                                { "backgroundColor", SerializeValueForJson(camera.backgroundColor) }
                            }
                        }
                    });
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Set camera failed: {ex.Message}", "SET_CAMERA_FAILED");
            }
        }

        public static OperationResult SetActive(UnityRequest request)
        {
            try
            {
                var includeInactive = true;
                var selection = ResolveSceneScope(request, includeInactive);
                var target = ResolveObject(selection, request);
                if (target == null)
                    return OperationResult.Fail("Object not found in selected scope", "OBJECT_NOT_FOUND");

                var active = request.GetValue("active", true);
                target.SetActive(active);

                return OperationResult.Ok(
                    $"Active state updated for {BuildPath(target)}",
                    new Dictionary<string, object>
                    {
                        { "path", BuildPath(target) },
                        { "instanceId", target.GetInstanceID() },
                        { "activeSelf", target.activeSelf },
                        { "activeInHierarchy", target.activeInHierarchy }
                    });
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Set active failed: {ex.Message}", "SET_ACTIVE_FAILED");
            }
        }

        private static bool TryGetVector3(UnityRequest request, string key, out Vector3 value)
        {
            value = default;
            if (!request.Data.ContainsKey(key))
                return false;
            value = ParseVector3(request.Data[key]);
            return true;
        }

        private static bool TryGetColor(UnityRequest request, string key, out Color value)
        {
            value = default;
            if (!request.Data.ContainsKey(key))
                return false;

            var raw = request.Data[key];
            if (raw is IList<object> list && list.Count >= 3)
            {
                var r = Convert.ToSingle(list[0]);
                var g = Convert.ToSingle(list[1]);
                var b = Convert.ToSingle(list[2]);
                var a = list.Count >= 4 ? Convert.ToSingle(list[3]) : 1f;
                value = new Color(r, g, b, a);
                return true;
            }

            if (raw is Dictionary<string, object> dict)
            {
                float Get(string component, float fallback) =>
                    dict.TryGetValue(component, out var item) ? Convert.ToSingle(item) : fallback;
                value = new Color(Get("r", 0f), Get("g", 0f), Get("b", 0f), Get("a", 1f));
                return true;
            }

            return false;
        }

        private static bool TryGetFloat(UnityRequest request, string key, out float value)
        {
            value = default;
            if (!request.Data.ContainsKey(key))
                return false;
            value = Convert.ToSingle(request.Data[key]);
            return true;
        }

        private static bool TryGetBool(UnityRequest request, string key, out bool value)
        {
            value = default;
            if (!request.Data.ContainsKey(key))
                return false;
            value = Convert.ToBoolean(request.Data[key]);
            return true;
        }

        private static bool TryGetString(UnityRequest request, string key, out string value)
        {
            value = null;
            if (!request.Data.ContainsKey(key))
                return false;
            value = request.Data[key]?.ToString();
            return !string.IsNullOrWhiteSpace(value);
        }
    }
}
