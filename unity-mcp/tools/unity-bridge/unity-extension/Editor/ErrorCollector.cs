using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace UnityBridge
{
    public static class ErrorCollector
    {
        private static readonly List<string> entries = new List<string>();
        private static readonly int maxEntries = 200;
        
        static ErrorCollector()
        {
            Application.logMessageReceived += OnLogReceived;
        }
        
        public static void AddError(string message) => 
            AddToCollection($"[Error] {message}");
            
        public static void AddWarning(string message) => 
            AddToCollection($"[Warning] {message}");
            
        public static void AddInfo(string message) => 
            AddToCollection($"[Info] {message}");
        
        public static int GetCursor()
        {
            lock (entries)
                return entries.Count;
        }

        public static List<string> GetEntriesSince(int cursor, bool errorsOnly = false)
        {
            lock (entries)
            {
                IEnumerable<string> query = entries.Skip(Math.Max(0, cursor));
                if (errorsOnly)
                    query = query.Where(IsErrorEntry);
                return query.ToList();
            }
        }

        public static List<string> GetAndClearErrors()
        {
            lock (entries)
            {
                var result = entries.ToList();
                entries.Clear();
                return result;
            }
        }

        public static List<string> GetRecentErrors(int maxCount = 5, bool errorsOnly = true)
        {
            lock (entries)
            {
                var filtered = entries.AsEnumerable();
                if (errorsOnly)
                    filtered = filtered.Where(IsErrorEntry);

                return filtered.TakeLast(maxCount).ToList();
            }
        }

        public static bool HasErrors()
        {
            lock (entries)
                return entries.Count > 0;
        }
        
        public static bool HasCompilationErrors()
        {
            try
            {
                return UnityEditor.EditorUtility.scriptCompilationFailed;
            }
            catch
            {
                return false;
            }
        }
        
        public static string GetCompilationStatus()
        {
            try
            {
                if (UnityEditor.EditorApplication.isCompiling) 
                    return "Unity is compiling...";
                if (HasCompilationErrors()) 
                    return "Unity has compilation errors! Check Console window.";
                return null;
            }
            catch
            {
                return null;
            }
        }
        
        private static void OnLogReceived(string logString, string stackTrace, LogType type)
        {
            switch (type)
            {
                case LogType.Error:
                case LogType.Exception:
                    if (!ShouldIgnoreError(logString))
                        AddToCollection($"[Unity Error] {logString}");
                    break;
                case LogType.Warning:
                    if (!ShouldIgnoreWarning(logString))
                        AddToCollection($"[Unity Warning] {logString}");
                    break;
            }
        }
        
        private static void AddToCollection(string message)
        {
            lock (entries)
            {
                entries.Add($"{DateTime.Now:HH:mm:ss} {message}");
                
                while (entries.Count > maxEntries)
                    entries.RemoveAt(0);
            }
        }

        private static bool IsErrorEntry(string entry) =>
            entry.Contains("[Unity Error]") ||
            entry.Contains("[Error]");
        
        private static bool ShouldIgnoreError(string message) =>
            message.Contains("ErrorCollector") || 
            message.Contains("Unity Bridge") ||
            message.Contains("MCP");
            
        private static bool ShouldIgnoreWarning(string message) =>
            message.Contains("Inspector") ||
            message.Contains("deprecated") ||
            ShouldIgnoreError(message);
    }
} 