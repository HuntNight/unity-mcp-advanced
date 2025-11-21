using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;

namespace UnityBridge
{
    public static partial class UnityOperations
    {
        private const int DefaultTimeoutMs = 5000;
        
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
        
        public static OperationResult SetPlayMode(UnityRequest request)
        {
            var enabled = request.GetValue("enabled", true);

            if (EditorApplication.isPlaying == enabled)
            {
                return OperationResult.Ok($"Play Mode is already {(enabled ? "enabled" : "disabled")}");
            }
            
            EditorApplication.isPlaying = enabled;
            return OperationResult.Ok($"Switched Play Mode to: {(enabled ? "enabled" : "disabled")}");
        }

    }
}
