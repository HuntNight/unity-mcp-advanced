using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace UnityBridge
{
    public static partial class UnityOperations
    {
        private const string ScopeActiveScene = "active_scene";
        private const string ScopeAllLoadedScenes = "all_loaded_scenes";
        private const string ScopeDontDestroyOnLoad = "dont_destroy_on_load";
        private const string ScopeAllLoadedObjects = "all_loaded_objects";

        private sealed class SceneScopeSelection
        {
            public string Scope;
            public string Label;
            public List<Scene> Scenes;
            public List<GameObject> Roots;
            public List<GameObject> Objects;
        }

        public static OperationResult GetBridgeHealth(UnityRequest request)
        {
            var activeScene = EditorSceneManager.GetActiveScene();
            var loadedScenes = GetLoadedScenes().ToList();
            var ddolRoots = GetDontDestroyOnLoadRoots(includeInactive: true);

            var payload = new Dictionary<string, object>
            {
                { "activeScene", activeScene.name },
                { "loadedSceneCount", loadedScenes.Count },
                { "dontDestroyOnLoadRootCount", ddolRoots.Count },
                { "isPlaying", EditorApplication.isPlaying },
                { "isCompiling", EditorApplication.isCompiling },
                { "bridgeRunning", UnityBridge.IsRunning }
            };

            return OperationResult.Ok("Unity Bridge is reachable", payload);
        }

        public static OperationResult ListScenes(UnityRequest request)
        {
            try
            {
                var loadedScenes = GetLoadedScenes().ToList();
                var activeScene = EditorSceneManager.GetActiveScene();
                var lines = new List<string>();

                foreach (var scene in loadedScenes)
                {
                    lines.Add($"• {scene.name} | loaded={scene.isLoaded} | roots={scene.rootCount} | active={(scene == activeScene)} | path={scene.path}");
                }

                var ddolRoots = GetDontDestroyOnLoadRoots(includeInactive: true);
                if (ddolRoots.Count > 0)
                    lines.Add($"• DontDestroyOnLoad | loaded=true | roots={ddolRoots.Count} | active=false | path=<runtime>");

                return OperationResult.Ok("Loaded scenes enumerated", lines.Count > 0 ? string.Join("\n", lines) : "(no loaded scenes)");
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"List scenes failed: {ex.Message}");
            }
        }

        public static OperationResult FindObjects(UnityRequest request)
        {
            try
            {
                var includeInactive = request.GetValue("include_inactive", true);
                var selection = ResolveSceneScope(request, includeInactive);
                var nameGlob = request.GetValue<string>("name_glob", null);
                var nameRegex = request.GetValue<string>("name_regex", null);
                var tagGlob = request.GetValue<string>("tag_glob", null);
                var path = request.GetValue<string>("path", null);
                var component = request.GetValue<string>("component", null);
                var instanceId = request.GetValue("instance_id", 0);
                var maxResults = request.GetValue("max_results", 100);
                var maxCount = maxResults > 0 ? maxResults : int.MaxValue;
                var pathMode = DetectPathMode(path);
                var nameGlobRegex = string.IsNullOrEmpty(nameGlob) ? null : new Regex(GlobToRegex(nameGlob), RegexOptions.IgnoreCase);
                var nameRegexCompiled = string.IsNullOrEmpty(nameRegex) ? null : new Regex(nameRegex, RegexOptions.IgnoreCase);
                var tagRegex = string.IsNullOrEmpty(tagGlob) ? null : new Regex(GlobToRegex(tagGlob), RegexOptions.IgnoreCase);
                var componentNeedle = string.IsNullOrWhiteSpace(component) ? null : component.Trim();
                var roots = string.IsNullOrEmpty(path)
                    ? selection.Roots
                    : ResolvePathRoots(selection.Roots.ToArray(), path, pathMode, includeInactive, true);

                var results = new List<GameObject>();

                foreach (var root in roots)
                {
                    TraverseScope(root, includeInactive, (go) =>
                    {
                        if (results.Count >= maxCount)
                            return false;
                        if (!MatchesCommonFilters(go, nameGlobRegex, nameRegexCompiled, tagRegex, componentNeedle, instanceId))
                            return true;
                        results.Add(go);
                        return true;
                    });

                    if (results.Count >= maxCount)
                        break;
                }

                var lines = results.Select(go =>
                    $"• {go.name} | id=@{go.GetInstanceID()} | scene={go.scene.name} | active={go.activeInHierarchy} | path={BuildPath(go)}");

                if (results.Count == 0)
                {
                    var hint = selection.Scope == ScopeActiveScene
                        ? "No objects matched in active_scene. Runtime preview objects often live in dont_destroy_on_load or all_loaded_objects."
                        : "(no results)";
                    return OperationResult.Ok($"Object search completed in scope '{selection.Scope}'", hint);
                }

                return OperationResult.Ok($"Object search completed in scope '{selection.Scope}'", string.Join("\n", lines));
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Find objects failed: {ex.Message}");
            }
        }

        public static OperationResult InspectObject(UnityRequest request)
        {
            try
            {
                var includeInactive = request.GetValue("include_inactive", true);
                var selection = ResolveSceneScope(request, includeInactive);
                var includeChildren = request.GetValue("include_children", true);
                var includeComponentValues = request.GetValue("include_component_values", false);
                var target = ResolveObject(selection, request);

                if (target == null)
                    return OperationResult.Fail("Object not found in selected scope", "OBJECT_NOT_FOUND");

                var components = target.GetComponents<Component>()
                    .Where(componentItem => componentItem != null)
                    .Select(componentItem => componentItem.GetType().Name)
                    .ToList();

                var sb = new StringBuilder();
                sb.AppendLine($"name={target.name}");
                sb.AppendLine($"id=@{target.GetInstanceID()}");
                sb.AppendLine($"scene={target.scene.name}");
                sb.AppendLine($"path={BuildPath(target)}");
                sb.AppendLine($"activeSelf={target.activeSelf}");
                sb.AppendLine($"activeInHierarchy={target.activeInHierarchy}");
                sb.AppendLine($"tag={target.tag}");
                sb.AppendLine($"layer={LayerMask.LayerToName(target.layer)}");
                sb.AppendLine($"position={target.transform.position}");
                sb.AppendLine($"localPosition={target.transform.localPosition}");
                sb.AppendLine($"rotation={target.transform.eulerAngles}");
                sb.AppendLine($"localRotation={target.transform.localEulerAngles}");
                sb.AppendLine($"localScale={target.transform.localScale}");
                sb.AppendLine($"components={string.Join(", ", components)}");

                var payload = new Dictionary<string, object>
                {
                    { "name", target.name },
                    { "instanceId", target.GetInstanceID() },
                    { "scene", target.scene.name },
                    { "path", BuildPath(target) },
                    { "activeSelf", target.activeSelf },
                    { "activeInHierarchy", target.activeInHierarchy },
                    { "tag", target.tag },
                    { "layer", LayerMask.LayerToName(target.layer) },
                    { "transform", new Dictionary<string, object>
                        {
                            { "position", SerializeValueForJson(target.transform.position) },
                            { "localPosition", SerializeValueForJson(target.transform.localPosition) },
                            { "rotation", SerializeValueForJson(target.transform.eulerAngles) },
                            { "localRotation", SerializeValueForJson(target.transform.localEulerAngles) },
                            { "localScale", SerializeValueForJson(target.transform.localScale) }
                        }
                    },
                    { "componentNames", components }
                };

                if (includeComponentValues)
                {
                    var componentPayload = new List<Dictionary<string, object>>();
                    foreach (var component in target.GetComponents<Component>().Where(componentItem => componentItem != null))
                    {
                        if (TrySerializeComponentCurated(component, out var curated))
                            componentPayload.Add(curated);
                        else
                            componentPayload.Add(ReflectComponentToDict(component));
                    }

                    payload["components"] = componentPayload;
                    sb.AppendLine("componentValues:");
                    foreach (var component in target.GetComponents<Component>().Where(componentItem => componentItem != null))
                    {
                        sb.AppendLine($"- {component.GetType().Name}");
                        AppendComponentDetails(sb, "  ", component);
                    }
                }

                if (includeChildren)
                {
                    var childPayload = new List<Dictionary<string, object>>();
                    sb.AppendLine($"children={target.transform.childCount}");
                    for (int i = 0; i < target.transform.childCount; i++)
                    {
                        var child = target.transform.GetChild(i).gameObject;
                        sb.AppendLine($"- {child.name} | id=@{child.GetInstanceID()} | path={BuildPath(child)}");
                        childPayload.Add(new Dictionary<string, object>
                        {
                            { "name", child.name },
                            { "instanceId", child.GetInstanceID() },
                            { "path", BuildPath(child) },
                            { "activeInHierarchy", child.activeInHierarchy }
                        });
                    }
                    payload["children"] = childPayload;
                }

                payload["summary"] = sb.ToString().Trim();
                return OperationResult.Ok("Object inspection completed", payload);
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Inspect object failed: {ex.Message}");
            }
        }

        private static GameObject ResolveObject(SceneScopeSelection selection, UnityRequest request)
        {
            return ResolveObject(
                selection,
                request.GetValue("instance_id", 0),
                request.GetValue<string>("path", null),
                request.GetValue<string>("name", null));
        }

        private static GameObject ResolveObject(SceneScopeSelection selection, int instanceId = 0, string path = null, string name = null)
        {
            return selection.Objects.FirstOrDefault(go =>
                go != null &&
                ((instanceId != 0 && go.GetInstanceID() == instanceId) ||
                 (!string.IsNullOrEmpty(path) && string.Equals(BuildPath(go), path, StringComparison.OrdinalIgnoreCase)) ||
                 (!string.IsNullOrEmpty(name) && string.Equals(go.name, name, StringComparison.OrdinalIgnoreCase))));
        }

        private static SceneScopeSelection ResolveSceneScope(UnityRequest request, bool includeInactive)
        {
            var normalizedScope = NormalizeScope(request.GetValue<string>("scope", ScopeActiveScene));
            switch (normalizedScope)
            {
                case ScopeAllLoadedScenes:
                    return BuildScopeSelection(normalizedScope, GetLoadedSceneRoots(includeInactive, includeDontDestroyOnLoad: false), includeInactive);
                case ScopeDontDestroyOnLoad:
                    return BuildScopeSelection(normalizedScope, GetDontDestroyOnLoadRoots(includeInactive), includeInactive);
                case ScopeAllLoadedObjects:
                    return BuildScopeSelection(normalizedScope, GetLoadedSceneRoots(includeInactive, includeDontDestroyOnLoad: true), includeInactive);
                default:
                    return BuildScopeSelection(normalizedScope, GetActiveSceneRoots(includeInactive), includeInactive);
            }
        }

        private static SceneScopeSelection BuildScopeSelection(string scope, List<GameObject> roots, bool includeInactive)
        {
            roots = DeduplicateObjects(roots);
            var allObjects = new List<GameObject>();
            foreach (var root in roots)
                TraverseScope(root, includeInactive, (go) => { allObjects.Add(go); return true; });

            var sceneNames = roots
                .Where(root => root != null)
                .Select(root => root.scene.name)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .OrderBy(name => name)
                .ToList();

            return new SceneScopeSelection
            {
                Scope = scope,
                Label = sceneNames.Count > 0 ? string.Join(", ", sceneNames) : scope,
                Scenes = GetLoadedScenes().Where(scene => sceneNames.Contains(scene.name)).ToList(),
                Roots = roots,
                Objects = DeduplicateObjects(allObjects)
            };
        }

        private static string NormalizeScope(string scope)
        {
            switch ((scope ?? string.Empty).Trim().ToLowerInvariant())
            {
                case ScopeAllLoadedScenes:
                    return ScopeAllLoadedScenes;
                case ScopeDontDestroyOnLoad:
                    return ScopeDontDestroyOnLoad;
                case ScopeAllLoadedObjects:
                    return ScopeAllLoadedObjects;
                default:
                    return ScopeActiveScene;
            }
        }

        private static List<Scene> GetLoadedScenes()
        {
            var result = new List<Scene>();
            for (int i = 0; i < SceneManager.sceneCount; i++)
            {
                var scene = SceneManager.GetSceneAt(i);
                if (scene.IsValid() && scene.isLoaded)
                    result.Add(scene);
            }
            return result;
        }

        private static List<GameObject> GetActiveSceneRoots(bool includeInactive)
        {
            var scene = EditorSceneManager.GetActiveScene();
            return FilterRoots(scene.GetRootGameObjects(), includeInactive);
        }

        private static List<GameObject> GetLoadedSceneRoots(bool includeInactive, bool includeDontDestroyOnLoad)
        {
            var roots = new List<GameObject>();
            foreach (var scene in GetLoadedScenes())
                roots.AddRange(FilterRoots(scene.GetRootGameObjects(), includeInactive));
            if (includeDontDestroyOnLoad)
                roots.AddRange(GetDontDestroyOnLoadRoots(includeInactive));
            return DeduplicateObjects(roots);
        }

        private static List<GameObject> GetDontDestroyOnLoadRoots(bool includeInactive)
        {
            var result = new List<GameObject>();
            var allObjects = Resources.FindObjectsOfTypeAll<GameObject>();
            foreach (var go in allObjects)
            {
                if (!IsQueryableObject(go, includeInactive))
                    continue;
                if (!string.Equals(go.scene.name, "DontDestroyOnLoad", StringComparison.OrdinalIgnoreCase))
                    continue;
                if (go.transform.parent != null)
                    continue;
                result.Add(go);
            }
            return DeduplicateObjects(result);
        }

        private static List<GameObject> FilterRoots(IEnumerable<GameObject> roots, bool includeInactive)
        {
            return DeduplicateObjects(roots.Where(go => IsQueryableObject(go, includeInactive)).ToList());
        }

        private static List<GameObject> DeduplicateObjects(IEnumerable<GameObject> objects)
        {
            var seen = new HashSet<int>();
            var result = new List<GameObject>();
            foreach (var go in objects)
            {
                if (go == null)
                    continue;
                if (seen.Add(go.GetInstanceID()))
                    result.Add(go);
            }
            return result;
        }

        private static bool IsQueryableObject(GameObject go, bool includeInactive)
        {
            if (go == null)
                return false;
            if (EditorUtility.IsPersistent(go))
                return false;
            if (!go.scene.IsValid())
                return false;
            if (!includeInactive && !go.activeInHierarchy)
                return false;
            if ((go.hideFlags & HideFlags.HideInHierarchy) != 0)
                return false;
            return true;
        }

        private static void TraverseScope(GameObject root, bool includeInactive, Func<GameObject, bool> visitor)
        {
            if (root == null)
                return;
            if (!IsQueryableObject(root, includeInactive))
                return;
            if (!visitor(root))
                return;
            var childCount = root.transform.childCount;
            for (int i = 0; i < childCount; i++)
                TraverseScope(root.transform.GetChild(i).gameObject, includeInactive, visitor);
        }

        private static bool MatchesCommonFilters(GameObject go, Regex nameGlobRegex, Regex nameRegexCompiled, Regex tagRegex, string componentNeedle, int instanceId)
        {
            if (instanceId != 0 && go.GetInstanceID() != instanceId)
                return false;

            bool passName = (nameGlobRegex == null && nameRegexCompiled == null)
                || (nameGlobRegex != null && nameGlobRegex.IsMatch(go.name))
                || (nameRegexCompiled != null && nameRegexCompiled.IsMatch(go.name));
            if (!passName)
                return false;

            bool passTag = tagRegex == null || tagRegex.IsMatch(go.tag ?? string.Empty);
            if (!passTag)
                return false;

            if (!string.IsNullOrEmpty(componentNeedle))
            {
                var matchesComponent = go.GetComponents<Component>()
                    .Where(componentItem => componentItem != null)
                    .Any(componentItem => componentItem.GetType().Name.IndexOf(componentNeedle, StringComparison.OrdinalIgnoreCase) >= 0);
                if (!matchesComponent)
                    return false;
            }

            return true;
        }
    }
}
