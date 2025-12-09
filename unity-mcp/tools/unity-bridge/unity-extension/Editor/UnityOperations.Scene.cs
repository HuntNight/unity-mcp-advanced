using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;
using UnityEditor;
using System.Text;
using System.Text.RegularExpressions;

namespace UnityBridge
{
    public static partial class UnityOperations
    {
        public static OperationResult GetSceneHierarchySimple(UnityRequest request)
        {
            try
            {
                var nameGlob = request.GetValue<string>("name_glob", null);
                var nameRegex = request.GetValue<string>("name_regex", null);
                var tagGlob = request.GetValue<string>("tag_glob", null);
                var maxResults = request.GetValue("max_results", 0);
                var maxDepth = request.GetValue("max_depth", -1);
                var pathFilter = request.GetValue<string>("path", null);
                var pathMode = DetectPathMode(pathFilter); // auto: exact|glob|regex

                // Note: startswith(GameObject.name, ...) → glob применяется только в scene_grep, не здесь

                var summary = request.GetValue("summary", false);

                var scene = UnityEditor.SceneManagement.EditorSceneManager.GetActiveScene();
                var rootObjects = scene.GetRootGameObjects();

                string resultText = FormatSceneHierarchySimple(
                    scene,
                    rootObjects,
                    nameGlob,
                    nameRegex,
                    tagGlob,
                    maxResults,
                    maxDepth,
                    pathFilter,
                    pathMode,
                    summary
                );

                var message = $"Scene '{scene.name}' analyzed";
                return OperationResult.Ok(message, resultText);
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
            
            var idStr = $"@{obj.GetInstanceID()}";
            sb.AppendLine($"{prefix}{treeSymbol}{objectInfo} — id: {idStr}");
            
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
                    .ToList();

                if (components.Count > 0)
                {
                    sb.AppendLine($"{detailPrefix}🔧 Components ({components.Count}): {string.Join(", ", components.Select(c => c.GetType().Name))}");
                    foreach (var comp in components)
                    {
                        sb.AppendLine($"{detailPrefix}- {comp.GetType().Name}");
                        AppendComponentDetails(sb, detailPrefix + "   ", comp);
                    }
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

        private static string FormatSceneHierarchySimple(
            UnityEngine.SceneManagement.Scene scene,
            GameObject[] rootObjects,
            string nameGlob,
            string nameRegex,
            string tagGlob,
            int maxResults,
            int maxDepth,
            string pathFilter,
            string pathMode,
            bool summary = false
        )
        {
            var start = DateTime.UtcNow;
            var nameGlobRegex = string.IsNullOrEmpty(nameGlob) ? null : new Regex(GlobToRegex(nameGlob), RegexOptions.IgnoreCase);
            var nameRegexCompiled = string.IsNullOrEmpty(nameRegex) ? null : new Regex(nameRegex, RegexOptions.IgnoreCase);
            var tagRegex = string.IsNullOrEmpty(tagGlob) ? null : new Regex(GlobToRegex(tagGlob), RegexOptions.IgnoreCase);

            var subtreeRoots = (!string.IsNullOrEmpty(pathFilter))
                ? ResolvePathRoots(rootObjects, pathFilter, pathMode, true, true)
                : rootObjects.ToList();

            int scanned = 0, matched = 0, emitted = 0;
            bool timedOut = false;
            var maxCount = maxResults > 0 ? maxResults : int.MaxValue;
            var sb = new System.Text.StringBuilder();

            void Emit(GameObject obj, string path)
            {
                var idStr = $"@{obj.GetInstanceID()}";
                var comps = obj.GetComponents<Component>()
                    .Where(c => c != null)
                    .Select(c => c.GetType().Name)
                    .ToArray();
                sb.AppendLine($"• {obj.name} — id: {idStr}");
                if (comps.Length > 0)
                {
                    sb.AppendLine($"   components: {string.Join(", ", comps)}");
                }
            }

            void Traverse(GameObject obj, string path, int depth)
            {
                if (timedOut) return;
                if ((DateTime.UtcNow - start).TotalMilliseconds > DefaultTimeoutMs) { timedOut = true; return; }
                if (maxDepth >= 0 && depth > maxDepth) return;

                scanned++;
                bool passName = (nameGlobRegex == null && nameRegexCompiled == null)
                    || (nameGlobRegex != null && nameGlobRegex.IsMatch(obj.name))
                    || (nameRegexCompiled != null && nameRegexCompiled.IsMatch(obj.name));
                bool passTag = tagRegex == null || tagRegex.IsMatch(obj.tag ?? "");
                if (passName && passTag)
                {
                    matched++;
                    if (emitted < maxCount)
                    {
                        emitted++;
                        Emit(obj, path);
                    }
                }
                if (emitted >= maxCount) return;

                var childCount = obj.transform.childCount;
                for (int i = 0; i < childCount; i++)
                {
                    var child = obj.transform.GetChild(i).gameObject;
                    Traverse(child, path + "/" + child.name, depth + 1);
                    if (timedOut || emitted >= maxCount) return;
                }
            }

            foreach (var root in subtreeRoots)
            {
                Traverse(root, root.name, 0);
                if (timedOut || emitted >= maxCount) break;
            }

            bool truncated = (maxResults > 0 && matched > emitted) || timedOut;
            var header = $"🏞️  Scene: {scene.name}\n" +
                $"📦 Path: {pathFilter ?? "(root)"} | max_depth={maxDepth}\n" +
                $"📄 Limit: {(maxResults <= 0 ? "∞" : maxResults.ToString())}\n" +
                $"⏱️ Scan: scanned={scanned}, matched={matched}, emitted={emitted}{(timedOut ? " (timed out)" : "")}{(truncated ? " (truncated)" : "")}\n";

            if (truncated)
            {
                sb.AppendLine("⚠️ Results truncated by limit or timeout");
                sb.AppendLine();
            }
            else
            {
                sb.AppendLine();
            }

            if (summary)
            {
                sb.Clear();
                sb.Append(header);
                sb.AppendLine("(Summary mode: list hidden)");
                return sb.ToString();
            }

            sb.Insert(0, header);

            sb.AppendLine("📋 Results:\n");

            if (emitted == 0) sb.AppendLine("(no results)");

            return sb.ToString();
        }
        
        private static string FormatSceneHierarchyFiltered(UnityEngine.SceneManagement.Scene scene, GameObject[] rootObjects,
            bool detailed, string nameGlob, int maxResults, int maxDepth, bool includeInactive, int offset, int timeoutMs)
        {
            var sb = new System.Text.StringBuilder();
            var start = DateTime.UtcNow;
            var regex = string.IsNullOrEmpty(nameGlob) ? null : new Regex(GlobToRegex(nameGlob), RegexOptions.IgnoreCase);

            int scanned = 0;
            int matched = 0;
            int emitted = 0;
            bool timedOut = false;

            void Traverse(GameObject obj, string path, int depth)
            {
                if (timedOut) return;
                if ((DateTime.UtcNow - start).TotalMilliseconds > timeoutMs)
                {
                    timedOut = true;
                    return;
                }

                if (!includeInactive && !obj.activeInHierarchy)
                    return;

                if (maxDepth >= 0 && depth > maxDepth)
                    return;

                scanned++;
                bool isMatch = regex == null || regex.IsMatch(obj.name);
                if (isMatch)
                {
                    matched++;
                    if (matched > offset && (maxResults <= 0 || emitted < maxResults))
                    {
                        emitted++;
                        AppendObjectLine(sb, obj, path, detailed);
                    }
                }

                var childCount = obj.transform.childCount;
                for (int i = 0; i < childCount; i++)
                {
                    var child = obj.transform.GetChild(i).gameObject;
                    Traverse(child, path + "/" + child.name, depth + 1);
                    if (timedOut) return;
                    if (maxResults > 0 && emitted >= maxResults) return;
                }
            }

            foreach (var root in rootObjects)
            {
                Traverse(root, root.name, 0);
                if (timedOut) break;
                if (maxResults > 0 && emitted >= maxResults) break;
            }

            sb.Insert(0, $"🏞️  Scene: {scene.name}\n" +
                        $"🔎 Filter: {(string.IsNullOrEmpty(nameGlob) ? "(none)" : nameGlob)} | include_inactive={includeInactive} | max_depth={maxDepth}\n" +
                        $"📄 Paging: offset={offset}, limit={(maxResults <= 0 ? "∞" : maxResults)}\n" +
                        $"⏱️ Scan: scanned={scanned}, matched={matched}, emitted={emitted}{(timedOut ? " (timed out)" : "")}\n\n" +
                        "📋 Results:\n");

            if (emitted == 0)
            {
                sb.AppendLine("(no results)");
            }

            return sb.ToString();
        }

        private static string FormatSceneHierarchyAdvanced(
            UnityEngine.SceneManagement.Scene scene,
            GameObject[] rootObjects,
            bool detailed,
            string nameGlob,
            string nameRegex,
            string tagGlob,
            List<string> componentsAny,
            List<string> componentsAll,
            int maxResults,
            int maxDepth,
            bool includeInactive,
            int offset,
            int timeoutMs,
            string pathFilter,
            string pathMode,
            bool caseInsensitive
        )
        {
            var start = DateTime.UtcNow;
            var nameGlobRegex = string.IsNullOrEmpty(nameGlob) ? null : new Regex(GlobToRegex(nameGlob), RegexOptions.IgnoreCase);
            var nameRegexCompiled = string.IsNullOrEmpty(nameRegex) ? null : new Regex(nameRegex, RegexOptions.IgnoreCase);
            var tagRegex = string.IsNullOrEmpty(tagGlob) ? null : new Regex(GlobToRegex(tagGlob), RegexOptions.IgnoreCase);

            var compAny = (componentsAny ?? new List<string>()).Select(s => s.ToLowerInvariant()).ToList();
            var compAll = (componentsAll ?? new List<string>()).Select(s => s.ToLowerInvariant()).ToList();

            var subtreeRoots = (!string.IsNullOrEmpty(pathFilter))
                ? ResolvePathRoots(rootObjects, pathFilter, pathMode, includeInactive, caseInsensitive)
                : rootObjects.ToList();

            int scanned = 0, matched = 0, emitted = 0;
            bool timedOut = false;
            var maxCount = maxResults > 0 ? maxResults : int.MaxValue;
            var results = new List<GameObject>();

            void Traverse(GameObject obj, string path, int depth)
            {
                if (timedOut) return;
                if ((DateTime.UtcNow - start).TotalMilliseconds > DefaultTimeoutMs) { timedOut = true; return; }
                if (maxDepth >= 0 && depth > maxDepth) return;

                scanned++;
                bool passName = (nameGlobRegex == null && nameRegexCompiled == null)
                    || (nameGlobRegex != null && nameGlobRegex.IsMatch(obj.name))
                    || (nameRegexCompiled != null && nameRegexCompiled.IsMatch(obj.name));
                bool passTag = tagRegex == null || tagRegex.IsMatch(obj.tag ?? "");
                bool passComponents = true;
                if (compAny.Count > 0 || compAll.Count > 0)
                {
                    var comps = obj.GetComponents<Component>().Where(c => c != null).Select(c => c.GetType().Name.ToLowerInvariant()).ToList();
                    if (compAny.Count > 0) passComponents &= comps.Any(cn => compAny.Any(p => cn.Contains(p)));
                    if (compAll.Count > 0) passComponents &= compAll.All(req => comps.Any(cn => cn.Contains(req)));
                }

                bool isMatch = passName && passTag && passComponents;
                if (isMatch)
                {
                    matched++;
                    if (matched > offset && emitted < maxCount)
                    {
                        emitted++;
                        results.Add(obj);
                    }
                }
                if (emitted >= maxCount) return;

                var childCount = obj.transform.childCount;
                for (int i = 0; i < childCount; i++)
                {
                    var child = obj.transform.GetChild(i).gameObject;
                    Traverse(child, path + "/" + child.name, depth + 1);
                    if (timedOut || emitted >= maxCount) return;
                }
            }

            foreach (var root in subtreeRoots)
            {
                Traverse(root, root.name, 0);
                if (timedOut || emitted >= maxCount) break;
            }

            var sb = new System.Text.StringBuilder();
            bool truncated = (maxResults > 0 && emitted < matched) || timedOut;
            sb.AppendLine($"🏞️  Scene: {scene.name}");
            sb.AppendLine($"🔎 Filters: nameGlob='{nameGlob}', nameRegex='{nameRegex}', tagGlob='{tagGlob}', any=[{string.Join(",", componentsAny)}], all=[{string.Join(",", componentsAll)}]");
            sb.AppendLine($"📦 Path: {pathFilter ?? "(root)"} | include_inactive={includeInactive} | max_depth={maxDepth}");
            sb.AppendLine($"📄 Paging: offset={offset}, limit={(maxResults <= 0 ? "∞" : maxResults.ToString())}");
            sb.AppendLine($"⏱️ Scan: scanned={scanned}, matched={matched}, emitted={emitted}{(timedOut ? " (timed out)" : "")}{(truncated ? " (truncated)" : "")}");
            sb.AppendLine();
            sb.AppendLine("📋 Results:");

            int printed = 0; int skipped = 0;
            void TraversePrint(GameObject obj, string path, int depth)
            {
                if (printed >= emitted) return;
                if (!includeInactive && !obj.activeInHierarchy) return;
                if (maxDepth >= 0 && depth > maxDepth) return;
                bool passNameP = (nameGlobRegex == null && nameRegexCompiled == null)
                    || (nameGlobRegex != null && nameGlobRegex.IsMatch(obj.name))
                    || (nameRegexCompiled != null && nameRegexCompiled.IsMatch(obj.name));
                bool passTagP = tagRegex == null || tagRegex.IsMatch(obj.tag ?? "");
                bool passCompP = true;
                if (compAny.Count > 0 || compAll.Count > 0)
                {
                    var comps = obj.GetComponents<Component>().Where(c => c != null).Select(c => c.GetType().Name.ToLowerInvariant()).ToList();
                    if (compAny.Count > 0) passCompP &= comps.Any(cn => compAny.Any(p => cn.Contains(p)));
                    if (compAll.Count > 0) passCompP &= compAll.All(req => comps.Any(cn => cn.Contains(req)));
                }
                bool isMatchP = passNameP && passTagP && passCompP;
                if (isMatchP)
                {
                    if (skipped < offset) { skipped++; }
                    else if (printed < emitted)
                    {
                        var statusIcon = obj.activeInHierarchy ? "✅" : "❌";
                        var layerName = LayerMask.LayerToName(obj.layer);
                        var tag = obj.tag != "Untagged" ? $" [{obj.tag}]" : "";
                        var layerStr = !string.IsNullOrEmpty(layerName) && layerName != "Default" ? $" (layer: {layerName})" : "";
                        var idStr = $"@{obj.GetInstanceID()}";
                        sb.AppendLine($"• {statusIcon} {obj.name}{tag}{layerStr} — path: {path} — id: {idStr}");
                        if (detailed)
                        {
                            var t = obj.transform;
                            var pos = t.position; var rot = t.eulerAngles; var scale = t.localScale;
                            sb.AppendLine($"   📍 pos: ({pos.x:F2},{pos.y:F2},{pos.z:F2}) | 🔄 rot: ({rot.x:F1}°, {rot.y:F1}°, {rot.z:F1}°) | 📏 scale: ({scale.x:F2},{scale.y:F2},{scale.z:F2})");
                            var compObjs = obj.GetComponents<Component>().Where(c => c != null).ToList();
                            var comps = string.Join(", ", compObjs.Select(c => c.GetType().Name));
                            if (!string.IsNullOrEmpty(comps)) sb.AppendLine($"   🔧 {comps}");
                            foreach (var comp in compObjs.Where(c => !(c is Transform)))
                            {
                                sb.AppendLine($"   - {comp.GetType().Name}");
                                AppendComponentDetails(sb, "      ", comp);
                            }
                        }
                        printed++;
                    }
                }
                var childCount = obj.transform.childCount;
                for (int i = 0; i < childCount; i++)
                {
                    var child = obj.transform.GetChild(i).gameObject;
                    TraversePrint(child, path + "/" + child.name, depth + 1);
                    if (printed >= emitted) return;
                }
            }
            var rootsToPrint = (!string.IsNullOrEmpty(pathFilter)) ? ResolvePathRoots(rootObjects, pathFilter, pathMode, includeInactive, caseInsensitive) : rootObjects.ToList();
            foreach (var root in rootsToPrint)
            {
                TraversePrint(root, root.name, 0);
                if (printed >= emitted) break;
            }
            return sb.ToString();
        }

        private static string FormatSceneSelectQueryWhere(
            UnityEngine.SceneManagement.Scene scene,
            GameObject[] rootObjects,
            List<string> selectList,
            string whereExpr,
            string nameGlob,
            string nameRegex,
            string tagGlob,
            int maxResults,
            int maxDepth,
            string pathFilter,
            string pathMode
        )
        {
            var start = DateTime.UtcNow;
            var nameGlobRegex = string.IsNullOrEmpty(nameGlob) ? null : new Regex(GlobToRegex(nameGlob), RegexOptions.IgnoreCase);
            var nameRegexCompiled = string.IsNullOrEmpty(nameRegex) ? null : new Regex(nameRegex, RegexOptions.IgnoreCase);
            var tagRegex = string.IsNullOrEmpty(tagGlob) ? null : new Regex(GlobToRegex(tagGlob), RegexOptions.IgnoreCase);

            var subtreeRoots = (!string.IsNullOrEmpty(pathFilter))
                ? ResolvePathRoots(rootObjects, pathFilter, pathMode, true, true)
                : rootObjects.ToList();

            int scanned = 0, matched = 0, emitted = 0;
            bool timedOut = false;
            var maxCount = maxResults > 0 ? maxResults : int.MaxValue;
            var sb = new System.Text.StringBuilder();
            var where = WhereDsl.TryParse(whereExpr);

            void Traverse(GameObject obj, string path, int depth)
            {
                if (timedOut) return;
                if ((DateTime.UtcNow - start).TotalMilliseconds > DefaultTimeoutMs) { timedOut = true; return; }
                if (maxDepth >= 0 && depth > maxDepth) return;

                scanned++;
                bool passName = (nameGlobRegex == null && nameRegexCompiled == null)
                    || (nameGlobRegex != null && nameGlobRegex.IsMatch(obj.name))
                    || (nameRegexCompiled != null && nameRegexCompiled.IsMatch(obj.name));
                bool passTag = tagRegex == null || tagRegex.IsMatch(obj.tag ?? "");
                bool passWhere = where == null || WhereDsl.Evaluate(where, obj, path);
                bool isMatch = passName && passTag && passWhere;
                if (isMatch)
                {
                    matched++;
                    if (emitted < maxCount)
                    {
                        emitted++;
                        EmitSelectionLine(sb, obj, path, selectList);
                    }
                }
                if (emitted >= maxCount) return;

                var childCount = obj.transform.childCount;
                for (int i = 0; i < childCount; i++)
                {
                    var child = obj.transform.GetChild(i).gameObject;
                    Traverse(child, path + "/" + child.name, depth + 1);
                    if (timedOut || emitted >= maxCount) return;
                }
            }

            foreach (var root in subtreeRoots)
            {
                Traverse(root, root.name, 0);
                if (timedOut || emitted >= maxCount) break;
            }

            // Header
            var selectPreview = string.Join(", ", selectList);
            bool truncated = (maxResults > 0 && emitted < matched) || timedOut;
            sb.Insert(0,
                $"🏞️  Scene: {scene.name}\n" +
                $"🎯 Select: [{selectPreview}]\n" +
                (!string.IsNullOrEmpty(whereExpr) ? $"🔎 Where: {whereExpr}\n" : string.Empty) +
                $"📦 Path: {pathFilter ?? "(root)"} | max_depth={maxDepth}\n" +
                $"📄 Limit: {(maxResults <= 0 ? "∞" : maxResults.ToString())}\n" +
                $"⏱️ Scan: scanned={scanned}, matched={matched}, emitted={emitted}{(timedOut ? " (timed out)" : "")}{(truncated ? " (truncated)" : "")}\n\n" +
                "📋 Results:\n");

            if (emitted == 0)
            {
                sb.AppendLine("(no results)");
            }

            return sb.ToString();
        }

        private static void EmitSelectionLine(System.Text.StringBuilder sb, GameObject obj, string path, List<string> selectList)
        {
            var statusIcon = obj.activeInHierarchy ? "✅" : "❌";
            var idStr = obj.GetInstanceID();
            sb.AppendLine($"• {path} - id:{idStr}");

            if (selectList == null || selectList.Count == 0)
                return;

            var parts = new List<string>();
            foreach (var raw in selectList)
            {
                var token = (raw ?? string.Empty).Trim();
                if (string.IsNullOrEmpty(token)) continue;

                try
                {
                    string label = token;
                    object value = EvaluateSelectToken(obj, path, token);
                    parts.Add($"{label} = {FormatValueForText(value)}");
                }
                catch (Exception ex)
                {
                    parts.Add($"{token} = <error: {ex.Message}>");
                }
            }
            if (parts.Count > 0)
                sb.AppendLine("   " + string.Join(" | ", parts));
        }

        private static object EvaluateSelectToken(GameObject obj, string path, string token)
        {
            // Built-in fields
            switch (token)
            {
                case "name": return obj.name;
                case "path": return path;
                case "id": return obj.GetInstanceID();
                case "active": return obj.activeInHierarchy;
                case "tag": return obj.tag;
                case "layer": return LayerMask.LayerToName(obj.layer);
            }

            // New style: ComponentName.memberPath, e.g., Transform.position, Camera.fieldOfView, GameObject.name
            var value = ResolveComponentExpression(obj, path, token);
            // special-case positions to show vector nicely
            if (value is Vector3 v3 && token.EndsWith("position", StringComparison.OrdinalIgnoreCase))
                return v3;
            return value;
        }

        private static object ResolveComponentExpression(GameObject obj, string goPath, string expr)
        {
            if (string.IsNullOrWhiteSpace(expr)) return null;
            var dot = expr.IndexOf('.');
            string head = dot >= 0 ? expr.Substring(0, dot) : expr;
            string tail = dot >= 0 ? expr.Substring(dot + 1) : string.Empty;

            object root = null;
            if (string.Equals(head, "GameObject", StringComparison.OrdinalIgnoreCase)) root = obj;
            else if (string.Equals(head, "Transform", StringComparison.OrdinalIgnoreCase)) root = obj.transform;
            else
            {
                var comp = FindComponentByTypeName(obj, head);
                if (comp == null) return null;
                root = comp;
            }

            if (string.IsNullOrEmpty(tail)) return root;
            return GetObjectMemberByPath(root, tail);
        }

        private static object GetObjectMemberByPath(object root, string memberPath)
        {
            if (root == null) return null;
            if (string.IsNullOrWhiteSpace(memberPath)) return root;

            object current = root;
            var segments = memberPath.Split(new[] {'.'}, StringSplitOptions.RemoveEmptyEntries);
            foreach (var seg in segments)
            {
                if (current == null) return null;
                var type = current.GetType();

                // Special aliases
                if (current is GameObject go)
                {
                    if (string.Equals(seg, "transform", StringComparison.OrdinalIgnoreCase)) { current = go.transform; continue; }
                    if (string.Equals(seg, "name", StringComparison.OrdinalIgnoreCase)) { current = go.name; continue; }
                    if (string.Equals(seg, "tag", StringComparison.OrdinalIgnoreCase)) { current = go.tag; continue; }
                    if (string.Equals(seg, "layer", StringComparison.OrdinalIgnoreCase)) { current = LayerMask.LayerToName(go.layer); continue; }
                    if (string.Equals(seg, "active", StringComparison.OrdinalIgnoreCase)) { current = go.activeInHierarchy; continue; }
                }

                // Support indexers in segment, e.g. sharedMaterials[0]
                string baseName = seg;
                int? index = null;
                int lb = seg.IndexOf('[');
                int rb = seg.EndsWith("]") ? seg.LastIndexOf(']') : -1;
                if (lb >= 0 && rb > lb)
                {
                    baseName = seg.Substring(0, lb);
                    var idxStr = seg.Substring(lb + 1, rb - lb - 1);
                    if (int.TryParse(idxStr, out var parsedIdx)) index = parsedIdx;
                }

                // Try property first
                var prop = !string.IsNullOrEmpty(baseName) ? type.GetProperty(baseName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.IgnoreCase) : null;
                if (prop != null && prop.CanRead && prop.GetIndexParameters().Length == 0)
                {
                    try {
                        current = prop.GetValue(current, null);
                        if (index.HasValue) current = TryIndexInto(current, index.Value);
                        continue;
                    } catch { return null; }
                }
                // Then field
                var field = !string.IsNullOrEmpty(baseName) ? type.GetField(baseName, BindingFlags.Instance | BindingFlags.Public | BindingFlags.IgnoreCase) : null;
                if (field != null)
                {
                    try {
                        current = field.GetValue(current);
                        if (index.HasValue) current = TryIndexInto(current, index.Value);
                        continue;
                    } catch { return null; }
                }

                // Unknown segment
                return null;
            }
            return current;
        }

        private static object TryIndexInto(object container, int index)
        {
            if (container == null) return null;
            try
            {
                if (container is System.Array arr)
                {
                    return (index >= 0 && index < arr.Length) ? arr.GetValue(index) : null;
                }
                if (container is System.Collections.IList list)
                {
                    return (index >= 0 && index < list.Count) ? list[index] : null;
                }
                // Try default indexer Item[int]
                var t = container.GetType();
                var idxer = t.GetProperty("Item", BindingFlags.Instance | BindingFlags.Public, null, null, new[] { typeof(int) }, null);
                if (idxer != null)
                {
                    return idxer.GetValue(container, new object[] { index });
                }
                // As a fallback, iterate enumerable
                if (container is System.Collections.IEnumerable enumerable && !(container is string))
                {
                    int i = 0;
                    foreach (var item in enumerable)
                    {
                        if (i++ == index) return item;
                    }
                    return null;
                }
            }
            catch { }
            return null;
        }

        private static Component FindComponentByTypeName(GameObject obj, string typeNameRaw)
        {
            if (obj == null || string.IsNullOrWhiteSpace(typeNameRaw)) return null;
            var typeName = typeNameRaw.Trim();
            var comps = obj.GetComponents<Component>();
            foreach (var c in comps)
            {
                if (c == null) continue;
                var t = c.GetType();
                if (string.Equals(t.Name, typeName, StringComparison.OrdinalIgnoreCase)) return c;
                if (!string.IsNullOrEmpty(t.FullName) && string.Equals(t.FullName, typeName, StringComparison.OrdinalIgnoreCase)) return c;
                // allow suffix match, e.g., UnityEngine.UI.Text -> Text
                if (t.FullName != null && t.FullName.EndsWith("." + typeName, StringComparison.OrdinalIgnoreCase)) return c;
            }
            return null;
        }

        // WHERE DSL (упрощённая реализация)
        private static class WhereDsl
        {
            public abstract class Node { }
            public sealed class And : Node { public Node L; public Node R; }
            public sealed class Or : Node { public Node L; public Node R; }
            public sealed class Not : Node { public Node X; }
            public sealed class Cmp : Node { public string Left; public string Op; public string Right; }
            public sealed class Func : Node { public string Name; public string Arg1; public string Arg2; }

            public static Node TryParse(string expr)
            {
                if (string.IsNullOrWhiteSpace(expr)) return null;
                try { return new Parser(expr).Parse(); } catch { return null; }
            }

            public static string TryExtractNameStartsWithToGlob(string expr, out string glob)
            {
                glob = null;
                if (string.IsNullOrWhiteSpace(expr)) return expr;
                try
                {
                    var pattern = new System.Text.RegularExpressions.Regex(@"startswith\(\s*GameObject\.name\s*,\s*""([^""]+)""\s*\)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                    var m = pattern.Match(expr);
                    if (m.Success)
                    {
                        var prefix = m.Groups[1].Value;
                        glob = prefix + "*";
                        var reduced = pattern.Replace(expr, "true");
                        return reduced;
                    }
                }
                catch { }
                return expr;
            }

            public static bool Evaluate(Node node, GameObject obj, string path)
            {
                if (node == null) return true;
                switch (node)
                {
                    case And a: return Evaluate(a.L, obj, path) && Evaluate(a.R, obj, path);
                    case Or o: return Evaluate(o.L, obj, path) || Evaluate(o.R, obj, path);
                    case Not n: return !Evaluate(n.X, obj, path);
                    case Cmp c:
                        try {
                            var lv = ResolveValue(obj, path, c.Left);
                            var rv = ParseLiteralOrPath(obj, path, c.Right);
                            return Compare(lv, rv, c.Op);
                        } catch (Exception ex) { throw new Exception($"Evaluate Cmp error: {c.Left} {c.Op} {c.Right} on {obj.name}: {ex}"); }

                    case Func f:
                    {
                        var name = f.Name.ToLowerInvariant();
                        if (name == "hascomp")
                        {
                            var type = TrimQuotes(f.Arg1);
                            return FindComponentByTypeName(obj, type) != null;
                        }
                        var left = ResolveValue(obj, path, f.Arg1);
                        var right = TrimQuotes(f.Arg2);
                        var s = Convert.ToString(left)?.ToLowerInvariant() ?? string.Empty;
                        var patt = (right ?? string.Empty).ToLowerInvariant();
                        if (name == "contains") return s.Contains(patt);
                        if (name == "startswith") return s.StartsWith(patt);
                        if (name == "endswith") return s.EndsWith(patt);
                        if (name == "matches")
                        {
                            try { return System.Text.RegularExpressions.Regex.IsMatch(Convert.ToString(left) ?? string.Empty, right, System.Text.RegularExpressions.RegexOptions.IgnoreCase); }
                            catch { return false; }
                        }
                        return false;
                    }
                }
                return false;
            }

            private static string TrimQuotes(string s)
            {
                if (s == null) return null;
                s = s.Trim();
                if (s.Length >= 2 && ((s[0] == '"' && s[s.Length - 1] == '"') || (s[0] == '\'' && s[s.Length - 1] == '\'')))
                {
                    return s.Substring(1, s.Length - 2);
                }
                return s;
            }

            private static object ParseLiteralOrPath(GameObject obj, string path, string token)
            {
                if (string.IsNullOrWhiteSpace(token)) return null;
                var t = token.Trim();
                if (t.Equals("true", StringComparison.OrdinalIgnoreCase)) return true;
                if (t.Equals("false", StringComparison.OrdinalIgnoreCase)) return false;
                if (double.TryParse(t, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var num)) return num;
                if ((t.StartsWith("\"") && t.EndsWith("\"")) || (t.StartsWith("'") && t.EndsWith("'"))) return TrimQuotes(t);
                return ResolveValue(obj, path, t);
            }

            private static bool Compare(object left, object right, string op)
            {
                int cmp = 0;
                double? ln = ToNumber(left); double? rn = ToNumber(right);
                if (ln.HasValue && rn.HasValue)
                {
                    cmp = ln.Value.CompareTo(rn.Value);
                }
                else
                {
                    try {
                        var ls = Convert.ToString(left)?.ToLowerInvariant();
                        var rs = Convert.ToString(right)?.ToLowerInvariant();
                        cmp = string.Compare(ls, rs, StringComparison.Ordinal);
                    } catch (Exception ex) { UnityEngine.Debug.LogError($"Compare-String error: {ex}"); return false; }
                }
                switch (op)
                {
                    case "==": return cmp == 0;
                    case "!=": return cmp != 0;
                    case ">": return cmp > 0;
                    case ">=": return cmp >= 0;
                    case "<": return cmp < 0;
                    case "<=": return cmp <= 0;
                    case "contains": return (Convert.ToString(left)?.ToLowerInvariant() ?? "").Contains(Convert.ToString(right)?.ToLowerInvariant() ?? "");
                    case "startswith": 
                        try {
                             var l = (Convert.ToString(left)?.ToLowerInvariant() ?? "");
                             var r = (Convert.ToString(right)?.ToLowerInvariant() ?? "");
                             return l.StartsWith(r);
                        } catch (Exception ex) { throw new Exception($"StartsWith error: {ex}"); }
                    case "endswith": return (Convert.ToString(left)?.ToLowerInvariant() ?? "").EndsWith(Convert.ToString(right)?.ToLowerInvariant() ?? "");
                    case "matches": 
                        try { return System.Text.RegularExpressions.Regex.IsMatch(Convert.ToString(left) ?? "", Convert.ToString(right) ?? "", System.Text.RegularExpressions.RegexOptions.IgnoreCase); }
                        catch { return false; }
                }
                return false;
            }

            private static double? ToNumber(object v)
            {
                try
                {
                    if (v is int i) return i;
                    if (v is long l) return l;
                    if (v is float f) return f;
                    if (v is double d) return d;
                    if (v is decimal m) return (double)m;
                    if (double.TryParse(Convert.ToString(v), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var dd)) return dd;
                }
                catch { }
                return null;
            }

            private static object ResolveValue(GameObject obj, string path, string expr)
            {
                if (string.IsNullOrWhiteSpace(expr)) return null;
                expr = expr.Trim();

                // Built-in aliases
                if (string.Equals(expr, "name", StringComparison.OrdinalIgnoreCase)) return obj.name;
                if (string.Equals(expr, "tag", StringComparison.OrdinalIgnoreCase)) return obj.tag;
                if (string.Equals(expr, "layer", StringComparison.OrdinalIgnoreCase)) return LayerMask.LayerToName(obj.layer);
                if (string.Equals(expr, "active", StringComparison.OrdinalIgnoreCase)) return obj.activeInHierarchy;
                if (string.Equals(expr, "path", StringComparison.OrdinalIgnoreCase)) return path;
                if (string.Equals(expr, "id", StringComparison.OrdinalIgnoreCase)) return obj.GetInstanceID();

                // New style: ComponentName.member
                return ResolveComponentExpression(obj, path, expr);
            }

            private sealed class Parser
            {
                private readonly string _s;
                private int _i;
                public Parser(string s) { _s = s ?? string.Empty; _i = 0; }
                public Node Parse() { var n = ParseOr(); Skip(); return n; }
                private Node ParseOr() { var n = ParseAnd(); while (MatchWord("or")) { var r = ParseAnd(); n = new Or { L = n, R = r }; } return n; }
                private Node ParseAnd() { var n = ParseNot(); while (MatchWord("and")) { var r = ParseNot(); n = new And { L = n, R = r }; } return n; }
                private Node ParseNot() { if (MatchWord("not")) return new Not { X = ParseNot() }; return ParseAtom(); }
                private Node ParseAtom()
                {
                    Skip();
                    if (Peek() == '(') { _i++; var n = ParseOr(); Skip(); if (Peek()==')') _i++; return n; }
                    // function: name(arg1[,arg2])
                    var id = ReadIdent();
                    Skip();
                    if (Peek() == '(')
                    {
                        _i++;
                        var arg1 = ReadArg();
                        string arg2 = null;
                        Skip();
                        if (Peek() == ',') { _i++; arg2 = ReadArg(); }
                        Skip(); if (Peek()==')') _i++;
                        return new Func { Name = id, Arg1 = arg1, Arg2 = arg2 };
                    }
                    // comparison: ident op value
                    var op = ReadOp();
                    var rhs = ReadArg();
                    return new Cmp { Left = id, Op = op, Right = rhs };
                }
                private string ReadIdent()
                {
                    Skip();
                    int start = _i;
                    while (_i < _s.Length && (char.IsLetterOrDigit(_s[_i]) || _s[_i]=='_' || _s[_i]=='.' || _s[_i]==':' || _s[_i]=='[' || _s[_i]==']')) _i++;
                    return _s.Substring(start, _i - start);
                }
                private string ReadArg()
                {
                    Skip();
                    if (Peek()=='"' || Peek()=='\'') return ReadQuoted();
                    int start = _i; int paren = 0;
                    while (_i < _s.Length)
                    {
                        char c = _s[_i];
                        if (c=='(') paren++; else if (c==')') { if (paren==0) break; paren--; }
                        if (paren==0 && (c==',' || c==')')) break;
                        if (c==' ' && paren==0) break;
                        _i++;
                    }
                    return _s.Substring(start, _i - start).Trim();
                }
                private string ReadQuoted()
                {
                    char q = _s[_i++]; int start = _i; while (_i < _s.Length && _s[_i] != q) _i++; var s = _s.Substring(start, Math.Max(0,_i-start)); if (_i<_s.Length) _i++; return q + s + q;
                }
                private string ReadOp()
                {
                    Skip();
                    var ops = new[]{"==","!=",">=","<=",">","<", "contains", "startswith", "endswith", "matches"};
                    foreach (var op in ops) if (_s.Substring(_i).StartsWith(op)) { _i += op.Length; return op; }
                    // fallback to equality
                    return "==";
                }
                private void Skip() { while (_i < _s.Length && char.IsWhiteSpace(_s[_i])) _i++; }
                private bool MatchWord(string w) { Skip(); int s=_i; foreach (var ch in w){ if (_i>=_s.Length) { _i=s; return false; } if (char.ToLowerInvariant(_s[_i++])!=ch) { _i=s; return false; } } if (_i<_s.Length && char.IsLetterOrDigit(_s[_i])) { _i=s; return false; } return true; }
                private char Peek() => _i < _s.Length ? _s[_i] : '\0';
            }
        }

        private static List<GameObject> ResolvePathRoots(GameObject[] roots, string pathFilter, string pathMode, bool includeInactive, bool caseInsensitive)
        {
            var candidates = roots.ToList();
            var segments = pathFilter.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);

            // First segment: match against roots as well
            if (segments.Length > 0)
            {
                var first = segments[0];
                var nextRoots = new List<GameObject>();
                System.Text.RegularExpressions.Regex matcher = BuildSegmentMatcher(first, pathMode, caseInsensitive);

                foreach (var root in roots)
                {
                    if (!includeInactive && !root.activeInHierarchy) continue;
                    bool match = matcher == null ? true : matcher.IsMatch(root.name);
                    if (match) nextRoots.Add(root);
                }

                candidates = nextRoots;
                segments = segments.Skip(1).ToArray();
                if (candidates.Count == 0) return new List<GameObject>();
            }

            foreach (var seg in segments)
            {
                var next = new List<GameObject>();
                Regex matcher = BuildSegmentMatcher(seg, pathMode, caseInsensitive);

                foreach (var node in candidates)
                {
                    var count = node.transform.childCount;
                    for (int i = 0; i < count; i++)
                    {
                        var child = node.transform.GetChild(i).gameObject;
                        if (!includeInactive && !child.activeInHierarchy) continue;
                        bool match = matcher == null ? true : matcher.IsMatch(child.name);
                        if (match) next.Add(child);
                    }
                }
                candidates = next;
                if (candidates.Count == 0) break;
            }
            return candidates.Count > 0 ? candidates : new List<GameObject>();
        }

        private static Dictionary<string, object> SerializeGo(GameObject obj, string path, bool detailed)
        {
            var dict = new Dictionary<string, object>();
            dict["name"] = obj.name;
            dict["path"] = path;
            dict["active"] = obj.activeInHierarchy;
            dict["tag"] = obj.tag;
            dict["layer"] = LayerMask.LayerToName(obj.layer);
            dict["id"] = obj.GetInstanceID();
            if (detailed)
            {
                var t = obj.transform;
                dict["position"] = new Dictionary<string, object> { { "x", t.position.x }, { "y", t.position.y }, { "z", t.position.z } };
                dict["rotation"] = new Dictionary<string, object> { { "x", t.eulerAngles.x }, { "y", t.eulerAngles.y }, { "z", t.eulerAngles.z } };
                dict["scale"] = new Dictionary<string, object> { { "x", t.localScale.x }, { "y", t.localScale.y }, { "z", t.localScale.z } };
                var compObjs = obj.GetComponents<Component>().Where(c => c != null).ToArray();
                dict["componentNames"] = compObjs.Select(c => c.GetType().Name).ToArray();
                var compDetails = new List<Dictionary<string, object>>();
                foreach (var comp in compObjs)
                {
                    compDetails.Add(ReflectComponentToDict(comp));
                }
                dict["components"] = compDetails;
            }
            return dict;
        }

        private static void AppendObjectLine(System.Text.StringBuilder sb, GameObject obj, string path, bool detailed)
        {
            var statusIcon = obj.activeInHierarchy ? "✅" : "❌";
            var layerName = LayerMask.LayerToName(obj.layer);
            var tag = obj.tag != "Untagged" ? $" [{obj.tag}]" : "";
            var layerStr = !string.IsNullOrEmpty(layerName) && layerName != "Default" ? $" (layer: {layerName})" : "";
            var idStr = $"@{obj.GetInstanceID()}";
            sb.AppendLine($"• {statusIcon} {obj.name}{tag}{layerStr} — path: {path} — id: {idStr}");

            if (detailed)
            {
                var t = obj.transform;
                var pos = t.position; var rot = t.eulerAngles; var scale = t.localScale;
                sb.AppendLine($"   📍 pos: ({pos.x:F2},{pos.y:F2},{pos.z:F2}) | 🔄 rot: ({rot.x:F1}°, {rot.y:F1}°, {rot.z:F1}°) | 📏 scale: ({scale.x:F2},{scale.y:F2},{scale.z:F2})");
                var components = obj.GetComponents<Component>().Where(c => c != null);
                var comps = string.Join(", ", components.Select(c => c.GetType().Name));
                if (!string.IsNullOrEmpty(comps)) sb.AppendLine($"   🔧 {comps}");
                foreach (var comp in components)
                {
                    sb.AppendLine($"   - {comp.GetType().Name}");
                    AppendComponentDetails(sb, "      ", comp);
                }
            }
        }

        private static string GlobToRegex(string glob)
        {
            var escaped = Regex.Escape(glob).Replace("\\*", ".*").Replace("\\?", ".");
            return "^" + escaped + "$";
        }

        private static string DetectPathMode(string pathFilter)
        {
            if (string.IsNullOrEmpty(pathFilter)) return "exact";
            // Detect regex meta in any segment
            foreach (var ch in pathFilter)
            {
                if (ch == '^' || ch == '$' || ch == '(' || ch == ')' || ch == '|' || ch == '{' || ch == '}' || ch == '\\')
                    return "regex";
            }
            // Detect glob meta
            if (pathFilter.IndexOf('*') >= 0 || pathFilter.IndexOf('?') >= 0 || pathFilter.IndexOf('[') >= 0)
                return "glob";
            return "exact";
        }

        private static Regex BuildSegmentMatcher(string segment, string pathMode, bool caseInsensitive)
        {
            var options = caseInsensitive ? RegexOptions.IgnoreCase : RegexOptions.None;
            try
            {
                if (pathMode == "glob") return new Regex(GlobToRegex(segment), options);
                if (pathMode == "regex") return new Regex(segment, options);
                // exact -> regex equivalent
                return new Regex("^" + Regex.Escape(segment) + "$", options);
            }
            catch
            {
                return new Regex("^" + Regex.Escape(segment) + "$", options);
            }
        }

        // Reflection helpers are appended at end of file
        private static bool IsObsolete(MemberInfo member)
        {
            try { return Attribute.IsDefined(member, typeof(ObsoleteAttribute)); } catch { return false; }
        }

        private static void AppendComponentDetails(StringBuilder sb, string indent, Component comp)
        {
            if (!AppendComponentDetailsCurated(sb, indent, comp))
            {
                AppendComponentReflectionDetails(sb, indent, comp);
            }
        }

        private static void AppendComponentReflectionDetails(StringBuilder sb, string indent, Component comp)
        {
            try
            {
                var type = comp.GetType();
                var flags = BindingFlags.Instance | BindingFlags.Public;

                var fields = type.GetFields(flags);
                foreach (var f in fields)
                {
                    if (IsObsolete(f)) continue;
                    try
                    {
                        var value = f.GetValue(comp);
                        sb.AppendLine($"{indent}• {f.Name}: {FormatValueForText(value)}");
                    }
                    catch { /* skip noisy errors */ }
                }

                var props = type.GetProperties(flags)
                    .Where(p => p.CanRead && p.GetIndexParameters().Length == 0);
                foreach (var p in props)
                {
                    if (IsObsolete(p)) continue;
                    try
                    {
                        var value = p.GetValue(comp, null);
                        sb.AppendLine($"{indent}• {p.Name}: {FormatValueForText(value)}");
                    }
                    catch { /* skip noisy errors */ }
                }
            }
            catch (Exception ex)
            {
                sb.AppendLine($"{indent}• <reflection_error>: {ex.Message}");
            }
        }

        private const int ReflectionMaxItems = 20;
        private const int ReflectionMaxStringLen = 512;

        private static Dictionary<string, object> ReflectComponentToDict(Component comp)
        {
            var payload = new Dictionary<string, object>();
            try
            {
                payload["type"] = comp.GetType().Name;
                var data = new Dictionary<string, object>();
                var flags = BindingFlags.Instance | BindingFlags.Public;

                foreach (var f in comp.GetType().GetFields(flags))
                {
                    if (IsObsolete(f)) continue;
                    try
                    {
                        var value = f.GetValue(comp);
                        data[f.Name] = SerializeValueForJson(value);
                    }
                    catch { /* skip noisy errors */ }
                }

                foreach (var p in comp.GetType().GetProperties(flags))
                {
                    if (!p.CanRead || p.GetIndexParameters().Length > 0) continue;
                    if (IsObsolete(p)) continue;
                    try
                    {
                        var value = p.GetValue(comp, null);
                        data[p.Name] = SerializeValueForJson(value);
                    }
                    catch { /* skip noisy errors */ }
                }

                payload["data"] = data;
            }
            catch (Exception ex)
            {
                payload["error"] = ex.Message;
            }
            return payload;
        }

        private static bool TrySerializeComponentCurated(Component comp, out Dictionary<string, object> result)
        {
            result = null;
            if (comp == null) return false;

            Dictionary<string, object> Make(string type) => new Dictionary<string, object> { { "type", type }, { "data", new Dictionary<string, object>() } };

            switch (comp)
            {
                case Camera cam:
                {
                    var d = new Dictionary<string, object>
                    {
                        { "nearClipPlane", cam.nearClipPlane },
                        { "farClipPlane", cam.farClipPlane },
                        { "fieldOfView", cam.fieldOfView },
                        { "orthographic", cam.orthographic },
                        { "orthographicSize", cam.orthographicSize },
                        { "clearFlags", cam.clearFlags.ToString() },
                        { "backgroundColor", SerializeValueForJson(cam.backgroundColor) },
                        { "enabled", cam.enabled },
                        { "isActiveAndEnabled", cam.isActiveAndEnabled }
                    };
                    result = new Dictionary<string, object> { { "type", nameof(Camera) }, { "data", d } };
                    return true;
                }
                case Light light:
                {
                    var d = new Dictionary<string, object>
                    {
                        { "type", light.type.ToString() },
                        { "color", SerializeValueForJson(light.color) },
                        { "intensity", light.intensity },
                        { "range", light.range },
                        { "spotAngle", light.spotAngle },
                        { "shadows", light.shadows.ToString() },
                        { "shadowStrength", light.shadowStrength },
                        { "enabled", light.enabled },
                        { "isActiveAndEnabled", light.isActiveAndEnabled }
                    };
                    result = new Dictionary<string, object> { { "type", nameof(Light) }, { "data", d } };
                    return true;
                }
                case MeshRenderer mr:
                {
                    var d = new Dictionary<string, object>
                    {
                        { "enabled", mr.enabled },
                        { "shadowCastingMode", mr.shadowCastingMode.ToString() },
                        { "receiveShadows", mr.receiveShadows },
                        { "materials", mr.sharedMaterials?.Select(m => m ? m.name : "null").ToList() }
                    };
                    result = new Dictionary<string, object> { { "type", nameof(MeshRenderer) }, { "data", d } };
                    return true;
                }
                case MeshFilter mf:
                {
                    var d = new Dictionary<string, object>
                    {
                        { "sharedMesh", mf.sharedMesh ? mf.sharedMesh.name : null }
                    };
                    result = new Dictionary<string, object> { { "type", nameof(MeshFilter) }, { "data", d } };
                    return true;
                }
                case BoxCollider bc:
                {
                    var d = new Dictionary<string, object>
                    {
                        { "enabled", bc.enabled },
                        { "isTrigger", bc.isTrigger },
                        { "center", SerializeValueForJson(bc.center) },
                        { "size", SerializeValueForJson(bc.size) }
                    };
                    result = new Dictionary<string, object> { { "type", nameof(BoxCollider) }, { "data", d } };
                    return true;
                }
                case Collider col:
                {
                    var b = col.bounds;
                    var d = new Dictionary<string, object>
                    {
                        { "enabled", col.enabled },
                        { "isTrigger", col.isTrigger },
                        { "bounds", new Dictionary<string, object>{{"center", SerializeValueForJson(b.center)},{"size", SerializeValueForJson(b.size)}} }
                    };
                    result = new Dictionary<string, object> { { "type", col.GetType().Name }, { "data", d } };
                    return true;
                }
                case Rigidbody rb:
                {
                    var d = new Dictionary<string, object>
                    {
                        { "mass", rb.mass },
                        { "drag", rb.linearDamping },
                        { "angularDrag", rb.angularDamping },
                        { "useGravity", rb.useGravity },
                        { "isKinematic", rb.isKinematic },
                        { "constraints", rb.constraints.ToString() }
                    };
                    result = new Dictionary<string, object> { { "type", nameof(Rigidbody) }, { "data", d } };
                    return true;
                }
                case AudioSource src:
                {
                    var d = new Dictionary<string, object>
                    {
                        { "clip", src.clip ? src.clip.name : null },
                        { "volume", src.volume },
                        { "spatialBlend", src.spatialBlend },
                        { "loop", src.loop },
                        { "playOnAwake", src.playOnAwake }
                    };
                    result = new Dictionary<string, object> { { "type", nameof(AudioSource) }, { "data", d } };
                    return true;
                }
                case AudioListener al:
                {
                    var d = new Dictionary<string, object>
                    {
                        { "enabled", al.enabled },
                        { "isActiveAndEnabled", al.isActiveAndEnabled }
                    };
                    result = new Dictionary<string, object> { { "type", nameof(AudioListener) }, { "data", d } };
                    return true;
                }
                case Animator an:
                {
                    var d = new Dictionary<string, object>
                    {
                        { "enabled", an.enabled },
                        { "speed", an.speed },
                        { "applyRootMotion", an.applyRootMotion },
                        { "updateMode", an.updateMode.ToString() },
                        { "controller", an.runtimeAnimatorController ? an.runtimeAnimatorController.name : null }
                    };
                    result = new Dictionary<string, object> { { "type", nameof(Animator) }, { "data", d } };
                    return true;
                }
            }

            return false;
        }

        private static bool AppendComponentDetailsCurated(StringBuilder sb, string indent, Component comp)
        {
            switch (comp)
            {
                case Camera cam:
                    sb.AppendLine($"{indent}• nearClipPlane: {cam.nearClipPlane}");
                    sb.AppendLine($"{indent}• farClipPlane: {cam.farClipPlane}");
                    sb.AppendLine($"{indent}• fieldOfView: {cam.fieldOfView}");
                    sb.AppendLine($"{indent}• orthographic: {cam.orthographic}");
                    if (cam.orthographic) sb.AppendLine($"{indent}• orthographicSize: {cam.orthographicSize}");
                    sb.AppendLine($"{indent}• clearFlags: {cam.clearFlags}");
                    sb.AppendLine($"{indent}• backgroundColor: {FormatValueForText(cam.backgroundColor)}");
                    sb.AppendLine($"{indent}• enabled: {cam.enabled}");
                    sb.AppendLine($"{indent}• isActiveAndEnabled: {cam.isActiveAndEnabled}");
                    return true;
                case Light light:
                    sb.AppendLine($"{indent}• type: {light.type}");
                    sb.AppendLine($"{indent}• color: {FormatValueForText(light.color)}");
                    sb.AppendLine($"{indent}• intensity: {light.intensity}");
                    if (light.type != LightType.Directional) sb.AppendLine($"{indent}• range: {light.range}");
                    if (light.type == LightType.Spot) sb.AppendLine($"{indent}• spotAngle: {light.spotAngle}");
                    sb.AppendLine($"{indent}• shadows: {light.shadows}");
                    sb.AppendLine($"{indent}• enabled: {light.enabled}");
                    sb.AppendLine($"{indent}• isActiveAndEnabled: {light.isActiveAndEnabled}");
                    return true;
                case MeshRenderer mr:
                    sb.AppendLine($"{indent}• enabled: {mr.enabled}");
                    sb.AppendLine($"{indent}• shadowCastingMode: {mr.shadowCastingMode}");
                    sb.AppendLine($"{indent}• receiveShadows: {mr.receiveShadows}");
                    var mats = mr.sharedMaterials?.Select(m => m ? m.name : "null");
                    if (mats != null) sb.AppendLine($"{indent}• materials: [{string.Join(", ", mats)}]");
                    return true;
                case MeshFilter mf:
                    sb.AppendLine($"{indent}• sharedMesh: {(mf.sharedMesh ? mf.sharedMesh.name : "null")}");
                    return true;
                case BoxCollider bc:
                    sb.AppendLine($"{indent}• enabled: {bc.enabled}");
                    sb.AppendLine($"{indent}• isTrigger: {bc.isTrigger}");
                    sb.AppendLine($"{indent}• center: {FormatValueForText(bc.center)}");
                    sb.AppendLine($"{indent}• size: {FormatValueForText(bc.size)}");
                    return true;
                case Collider col:
                    sb.AppendLine($"{indent}• enabled: {col.enabled}");
                    sb.AppendLine($"{indent}• isTrigger: {col.isTrigger}");
                    var b = col.bounds; sb.AppendLine($"{indent}• bounds: center={FormatValueForText(b.center)}, size={FormatValueForText(b.size)}");
                    return true;
                case Rigidbody rb:
                    sb.AppendLine($"{indent}• mass: {rb.mass}");
                    sb.AppendLine($"{indent}• useGravity: {rb.useGravity}");
                    sb.AppendLine($"{indent}• isKinematic: {rb.isKinematic}");
                    sb.AppendLine($"{indent}• constraints: {rb.constraints}");
                    return true;
                case AudioSource src:
                    sb.AppendLine($"{indent}• clip: {(src.clip ? src.clip.name : "null")}");
                    sb.AppendLine($"{indent}• volume: {src.volume}");
                    sb.AppendLine($"{indent}• loop: {src.loop}");
                    sb.AppendLine($"{indent}• playOnAwake: {src.playOnAwake}");
                    return true;
                case AudioListener al:
                    sb.AppendLine($"{indent}• enabled: {al.enabled}");
                    sb.AppendLine($"{indent}• isActiveAndEnabled: {al.isActiveAndEnabled}");
                    return true;
                case Animator an:
                    sb.AppendLine($"{indent}• controller: {(an.runtimeAnimatorController ? an.runtimeAnimatorController.name : "null")}");
                    sb.AppendLine($"{indent}• speed: {an.speed}");
                    sb.AppendLine($"{indent}• applyRootMotion: {an.applyRootMotion}");
                    sb.AppendLine($"{indent}• updateMode: {an.updateMode}");
                    return true;
            }
            return false;
        }

        private static object SerializeValueForJson(object value, int depth = 0)
        {
            if (value == null) return null;

            if (value is string s)
            {
                return s.Length > ReflectionMaxStringLen ? s.Substring(0, ReflectionMaxStringLen) + "…" : s;
            }

            if (value is bool || value is int || value is long || value is float || value is double || value is decimal)
                return value;

            if (value is Enum) return value.ToString();

            if (value is Vector2 v2) return new Dictionary<string, object>{{"x",v2.x},{"y",v2.y}};
            if (value is Vector3 v3) return new Dictionary<string, object>{{"x",v3.x},{"y",v3.y},{"z",v3.z}};
            if (value is Vector4 v4) return new Dictionary<string, object>{{"x",v4.x},{"y",v4.y},{"z",v4.z},{"w",v4.w}};
            if (value is Quaternion q) return new Dictionary<string, object>{{"x",q.x},{"y",q.y},{"z",q.z},{"w",q.w}};
            if (value is Color col) return new Dictionary<string, object>{{"r",col.r},{"g",col.g},{"b",col.b},{"a",col.a}};
            if (value is Bounds b) return new Dictionary<string, object>{{"center", SerializeValueForJson(b.center)},{"size", SerializeValueForJson(b.size)}};
            if (value is Rect r) return new Dictionary<string, object>{{"x",r.x},{"y",r.y},{"width",r.width},{"height",r.height}};

            if (value is UnityEngine.Object uo)
            {
                var objInfo = new Dictionary<string, object>{{"__type", uo.GetType().Name}, {"name", uo.name}};
                if (uo is GameObject go) objInfo["path"] = BuildPath(go);
                if (uo is Component comp) objInfo["path"] = BuildPath(comp.gameObject);
                return objInfo;
            }

            if (value is IDictionary dict)
            {
                var res = new Dictionary<string, object>();
                int i = 0;
                foreach (DictionaryEntry entry in dict)
                {
                    if (i++ >= ReflectionMaxItems) { res["__truncated"] = true; break; }
                    res[Convert.ToString(entry.Key)] = SerializeValueForJson(entry.Value, depth + 1);
                }
                return res;
            }

            if (value is IEnumerable enumerable && !(value is string))
            {
                var list = new List<object>();
                int i = 0;
                foreach (var item in enumerable)
                {
                    if (i++ >= ReflectionMaxItems) { list.Add("…"); break; }
                    list.Add(SerializeValueForJson(item, depth + 1));
                }
                return list;
            }

            // fallback to string
            return value.ToString();
        }

        private static string FormatValueForText(object value, int depth = 0)
        {
            if (value == null) return "null";
            if (value is string s) return s.Length > ReflectionMaxStringLen ? s.Substring(0, ReflectionMaxStringLen) + "…" : s;
            if (value is bool || value is int || value is long || value is float || value is double || value is decimal || value is Enum) return Convert.ToString(value);
            if (value is Vector2 v2) return $"({v2.x:F2},{v2.y:F2})";
            if (value is Vector3 v3) return $"({v3.x:F2},{v3.y:F2},{v3.z:F2})";
            if (value is Vector4 v4) return $"({v4.x:F2},{v4.y:F2},{v4.z:F2},{v4.w:F2})";
            if (value is Quaternion q) return $"({q.x:F2},{q.y:F2},{q.z:F2},{q.w:F2})";
            if (value is Color col) return $"rgba({col.r:F2},{col.g:F2},{col.b:F2},{col.a:F2})";
            if (value is Bounds b) return $"center={FormatValueForText(b.center)}, size={FormatValueForText(b.size)}";
            if (value is Rect r) return $"x={r.x:F2},y={r.y:F2},w={r.width:F2},h={r.height:F2}";
            if (value is UnityEngine.Object uo)
            {
                if (uo is GameObject go) return $"{uo.GetType().Name}('{uo.name}', path='{BuildPath(go)}')";
                if (uo is Component comp) return $"{uo.GetType().Name}('{uo.name}', path='{BuildPath(comp.gameObject)}')";
                return $"{uo.GetType().Name}('{uo.name}')";
            }
            if (value is IEnumerable enumerable && !(value is string))
            {
                var items = new List<string>();
                int i = 0;
                foreach (var item in enumerable)
                {
                    if (i++ >= ReflectionMaxItems) { items.Add("…"); break; }
                    items.Add(FormatValueForText(item, depth + 1));
                }
                return "[" + string.Join(", ", items) + "]";
            }
            return Convert.ToString(value);
        }

        public static OperationResult GetObjectsInRadius(UnityRequest request)
        {
            try
            {
                // Входные параметры
                var centerObjName = request.GetValue<string>("center_object", null);
                var centerPosObj = request.Data.GetValueOrDefault("center_position");
                Vector3? centerFromPosition = null;
                if (centerPosObj != null)
                {
                    try { centerFromPosition = ParseVector3(centerPosObj); } catch { centerFromPosition = null; }
                }
                var radius = Math.Max(0.01f, request.GetValue("radius", 5f));
                var maxResults = request.GetValue("max_results", 100);
                var includeInactive = request.GetValue("include_inactive", false);
                var nameGlob = request.GetValue<string>("name_glob", null);
                var nameRegex = request.GetValue<string>("name_regex", null);
                var tagGlob = request.GetValue<string>("tag_glob", null);
                var componentsAny = request.Data != null && request.Data.ContainsKey("components_any") && request.Data["components_any"] is System.Collections.IEnumerable anyList
                    ? anyList.Cast<object>().Select(o => o.ToString()).ToList() : new List<string>();
                var componentsAll = request.Data != null && request.Data.ContainsKey("components_all") && request.Data["components_all"] is System.Collections.IEnumerable allList
                    ? allList.Cast<object>().Select(o => o.ToString()).ToList() : new List<string>();
                var caseInsensitive = request.GetValue("case_insensitive", true);
                var detailed = request.GetValue("detailed", false);

                // Определяем центр
                Vector3 center;
                if (!string.IsNullOrEmpty(centerObjName))
                {
                    var candidates = UnityEngine.Object.FindObjectsOfType<GameObject>();
                    var found = candidates.FirstOrDefault(go => go != null && string.Equals(go.name, centerObjName, caseInsensitive ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal));
                    if (found == null)
                        return OperationResult.Fail($"Center object '{centerObjName}' not found");
                    center = found.transform.position;
                }
                else if (centerFromPosition.HasValue)
                {
                    center = centerFromPosition.Value;
                }
                else
                {
                    // если ничего не задано — центр активной камеры/сцены (0,0,0)
                    center = Camera.main != null ? Camera.main.transform.position : Vector3.zero;
                }

                // Фильтры
                var nameGlobRegex = string.IsNullOrEmpty(nameGlob) ? null : new Regex(GlobToRegex(nameGlob), caseInsensitive ? RegexOptions.IgnoreCase : RegexOptions.None);
                var nameRegexCompiled = string.IsNullOrEmpty(nameRegex) ? null : new Regex(nameRegex, caseInsensitive ? RegexOptions.IgnoreCase : RegexOptions.None);
                var tagRegex = string.IsNullOrEmpty(tagGlob) ? null : new Regex(GlobToRegex(tagGlob), caseInsensitive ? RegexOptions.IgnoreCase : RegexOptions.None);
                var compAny = (componentsAny ?? new List<string>()).Select(s => s.ToLowerInvariant()).ToList();
                var compAll = (componentsAll ?? new List<string>()).Select(s => s.ToLowerInvariant()).ToList();

                // Поиск кандидатов — безопасный и быстрый: сначала фильтруем по расстоянию, затем по критериям
                var allObjects = UnityEngine.Object.FindObjectsOfType<GameObject>();
                var collected = new List<Dictionary<string, object>>();

                foreach (var go in allObjects)
                {
                    if (go == null) continue;
                    if (!includeInactive && !go.activeInHierarchy) continue;

                    var pos = go.transform.position;
                    if (Vector3.SqrMagnitude(pos - center) > radius * radius) continue;

                    bool passName = (nameGlobRegex == null && nameRegexCompiled == null)
                        || (nameGlobRegex != null && nameGlobRegex.IsMatch(go.name))
                        || (nameRegexCompiled != null && nameRegexCompiled.IsMatch(go.name));
                    if (!passName) continue;

                    bool passTag = tagRegex == null || tagRegex.IsMatch(go.tag ?? "");
                    if (!passTag) continue;

                    if (compAny.Count > 0 || compAll.Count > 0)
                    {
                        var comps = go.GetComponents<Component>().Where(c => c != null).Select(c => c.GetType().Name.ToLowerInvariant()).ToList();
                        bool passComponents = true;
                        if (compAny.Count > 0) passComponents &= comps.Any(cn => compAny.Any(p => cn.Contains(p)));
                        if (compAll.Count > 0) passComponents &= compAll.All(req => comps.Any(cn => cn.Contains(req)));
                        if (!passComponents) continue;
                    }

                    collected.Add(SerializeGo(go, BuildPath(go), detailed));
                    if (collected.Count >= Math.Max(1, maxResults)) break;
                }

                // Ответ только текстом
                var sb = new StringBuilder();
                sb.AppendLine($"📍 Center: ({center.x:F2},{center.y:F2},{center.z:F2}), r={radius:F2}");
                sb.AppendLine($"🔎 Returned: {collected.Count}");
                foreach (var d in collected)
                {
                    var name = d.ContainsKey("name") ? d["name"] : "?";
                    var path = d.ContainsKey("path") ? d["path"] : "?";
                    var active = d.ContainsKey("active") ? d["active"].ToString() : "?";
                    sb.AppendLine($"• {(active=="True"?"✅":"❌")} {name} — {path}");
                }
                return OperationResult.Ok($"Radius query at {center} (r={radius})", sb.ToString());
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Scene radius failed: {ex.Message}");
            }
        }

        private static string BuildPath(GameObject go)
        {
            var stack = new Stack<string>();
            var t = go.transform;
            while (t != null)
            {
                stack.Push(t.name);
                t = t.parent;
            }
            return string.Join("/", stack.ToArray());
        }

        public static OperationResult SceneGrep(UnityRequest request)
        {
            try
            {
                var nameGlob = request.GetValue<string>("name_glob", null);
                var nameRegex = request.GetValue<string>("name_regex", null);
                var tagGlob = request.GetValue<string>("tag_glob", null);
                var selectList = request.Data != null && request.Data.ContainsKey("select") && request.Data["select"] is System.Collections.IEnumerable selectEnumerable
                    ? selectEnumerable.Cast<object>().Select(o => o?.ToString() ?? string.Empty).Where(s => !string.IsNullOrWhiteSpace(s)).ToList()
                    : new List<string>();
                var whereExpr = request.GetValue<string>("where", null) ?? string.Empty;
                var maxResults = request.GetValue("max_results", 100);
                var maxDepth = request.GetValue("max_depth", -1);
                var pathFilter = request.GetValue<string>("path", null);
                var pathMode = DetectPathMode(pathFilter);

                var scene = UnityEditor.SceneManagement.EditorSceneManager.GetActiveScene();
                var rootObjects = scene.GetRootGameObjects();

                var text = FormatSceneSelectQueryWhere(
                    scene,
                    rootObjects,
                    selectList,
                    whereExpr,
                    nameGlob,
                    nameRegex,
                    tagGlob,
                    maxResults,
                    maxDepth,
                    pathFilter,
                    pathMode
                );

                return OperationResult.Ok("Scene grep completed", text);
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Scene grep failed: {ex.Message}");
            }
        }
    }
}
