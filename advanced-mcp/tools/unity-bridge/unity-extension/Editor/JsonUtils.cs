using System;
using System.Collections.Generic;
using System.Linq;

namespace UnityBridge
{
    /// <summary>
    /// Простые функциональные утилиты для работы с JSON
    /// Функциональный подход - только чистые функции без состояния
    /// </summary>
    public static class JsonUtils
    {
        public static string ToJson(object obj)
        {
            if (obj == null) return "null";
            if (obj is string s) return $"\"{Escape(s)}\"";
            if (obj is bool b) return b.ToString().ToLower();
            if (obj is int || obj is float || obj is double || obj is decimal) return obj.ToString();
            if (obj is Dictionary<string, object> dict) return DictToJson(dict);
            if (obj is System.Collections.IEnumerable list && !(obj is string)) return ArrayToJson(list);
            return $"\"{Escape(obj.ToString())}\"";
        }

        public static Dictionary<string, object> FromJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json) || !json.Trim().StartsWith("{")) 
                return new Dictionary<string, object>();
            
            return ParseObject(json.Trim());
        }

        private static string DictToJson(Dictionary<string, object> dict) =>
            "{" + string.Join(",", dict.Select(kvp => $"\"{kvp.Key}\":{ToJson(kvp.Value)}")) + "}";

        private static string ArrayToJson(System.Collections.IEnumerable list) =>
            "[" + string.Join(",", list.Cast<object>().Select(ToJson)) + "]";

        private static string Escape(string str)
        {
            if (string.IsNullOrEmpty(str)) return "";
            var sb = new System.Text.StringBuilder(str.Length + 16);
            foreach (var ch in str)
            {
                switch (ch)
                {
                    case '\\': sb.Append("\\\\"); break;
                    case '"': sb.Append("\\\""); break;
                    case '\n': sb.Append("\\n"); break;
                    case '\r': sb.Append("\\r"); break;
                    case '\t': sb.Append("\\t"); break;
                    case '\b': sb.Append("\\b"); break;
                    case '\f': sb.Append("\\f"); break;
                    default:
                        if (ch < 0x20)
                        {
                            sb.Append("\\u");
                            sb.Append(((int)ch).ToString("x4"));
                        }
                        else
                        {
                            sb.Append(ch);
                        }
                        break;
                }
            }
            return sb.ToString();
        }
            
        public static string Unescape(string str) =>
            str.Replace("\\n", "\n").Replace("\\r", "\r").Replace("\\\"", "\"").Replace("\\\\", "\\");

        private static Dictionary<string, object> ParseObject(string json)
        {
            var result = new Dictionary<string, object>();
            if (json.Length < 2) return result;
            
            json = json.Substring(1, json.Length - 2); // Remove {}
            var pairs = SplitPairs(json);
            
            foreach (var pair in pairs)
            {
                var colonIndex = pair.IndexOf(':');
                if (colonIndex == -1) continue;
                
                var key = pair.Substring(0, colonIndex).Trim().Trim('"');
                var value = pair.Substring(colonIndex + 1).Trim();
                result[key] = ParseValue(value);
            }
            
            return result;
        }

        private static object ParseValue(string value)
        {
            if (value == "null") return null;
            if (value == "true") return true;
            if (value == "false") return false;
            if (value.StartsWith("\"") && value.EndsWith("\"")) return value.Substring(1, value.Length - 2);
            if (decimal.TryParse(value, out var num)) return num;
            if (value.StartsWith("[") && value.EndsWith("]")) return ParseArray(value);
            return value;
        }

        private static List<object> ParseArray(string json)
        {
            if (json.Length < 2) return new List<object>();
            var content = json.Substring(1, json.Length - 2);
            return SplitPairs(content).Select(ParseValue).ToList();
        }

        private static List<string> SplitPairs(string content)
        {
            var pairs = new List<string>();
            var current = "";
            var depth = 0;
            var inString = false;
            
            foreach (var c in content)
            {
                if (c == '"' && (current.Length == 0 || current[current.Length - 1] != '\\')) inString = !inString;
                if (!inString && (c == '{' || c == '[')) depth++;
                if (!inString && (c == '}' || c == ']')) depth--;
                if (!inString && c == ',' && depth == 0)
                {
                    if (!string.IsNullOrWhiteSpace(current)) pairs.Add(current.Trim());
                    current = "";
                }
                else current += c;
            }
            
            if (!string.IsNullOrWhiteSpace(current)) pairs.Add(current.Trim());
            return pairs;
        }
    }
} 