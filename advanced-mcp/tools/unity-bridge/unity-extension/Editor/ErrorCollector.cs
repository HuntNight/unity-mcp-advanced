using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace UnityBridge
{
    /// <summary>
    /// Простой функциональный сборщик ошибок Unity
    /// Заменяет сложный ErrorBuffer - следует принципу простоты
    /// </summary>
    public static class ErrorCollector
    {
        private static readonly List<string> errors = new List<string>();
        private static readonly int maxErrors = 50;
        
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
        
        public static List<string> GetAndClearErrors()
        {
            lock (errors)
            {
                var result = errors.ToList();
                errors.Clear();
                return result;
            }
        }
        
        public static bool HasErrors() => errors.Count > 0;
        
        public static bool HasCompilationErrors()
        {
            try
            {
                return UnityEditor.EditorUtility.scriptCompilationFailed;
            }
            catch
            {
                // Если вызов не из главного потока, считаем что ошибок нет
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
                // Если вызов не из главного потока, пропускаем проверку
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
            lock (errors)
            {
                errors.Add($"{DateTime.Now:HH:mm:ss} {message}");
                
                // Ограничиваем размер коллекции
                while (errors.Count > maxErrors)
                    errors.RemoveAt(0);
            }
        }
        
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