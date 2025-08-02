using System;
using System.Collections.Generic;
using System.Linq;

namespace UnityBridge
{
    /// <summary>
    /// Функциональный построитель ответов Unity Bridge
    /// Преобразует результаты операций в единый формат сообщений
    /// </summary>
    public static class ResponseBuilder
    {
        public static Dictionary<string, object> BuildResponse(OperationResult result, List<string> errors = null)
        {
            var messages = new List<UnityMessage>();
            
            // Добавляем основное сообщение
            if (result.Success)
            {
                messages.Add(UnityMessage.TextMessage(result.Message));
                
                // Добавляем изображение если есть
                if (result.Data is string base64Data && IsBase64Image(base64Data))
                    messages.Add(UnityMessage.Image(base64Data, "Unity Screenshot"));
                
                // Добавляем данные как текст если есть (без ограничений длины!)
                else if (result.Data != null)
                    messages.Add(UnityMessage.TextMessage($"Result: {FormatData(result.Data)}"));
            }
            else
            {
                messages.Add(UnityMessage.TextMessage($"Error: {result.Error}"));
            }
            
            // Добавляем ошибки Unity
            AddUnityErrors(messages, errors ?? ErrorCollector.GetAndClearErrors());
            
            return CreateResponse(messages);
        }
        
        public static Dictionary<string, object> BuildErrorResponse(string error, List<string> errors = null)
        {
            var messages = new List<UnityMessage> { UnityMessage.TextMessage($"Error: {error}") };
            AddUnityErrors(messages, errors ?? ErrorCollector.GetAndClearErrors());
            return CreateResponse(messages);
        }
        
        public static Dictionary<string, object> BuildCompilationErrorResponse()
        {
            var status = ErrorCollector.GetCompilationStatus();
            var messages = new List<UnityMessage> 
            { 
                UnityMessage.TextMessage($"Compilation Error: {status}")
            };
            
            AddUnityErrors(messages, ErrorCollector.GetAndClearErrors());
            return CreateResponse(messages);
        }
        
        private static Dictionary<string, object> CreateResponse(List<UnityMessage> messages) =>
            new Dictionary<string, object>
            {
                { "messages", messages.Select(m => m.ToDictionary()).ToList() }
            };
        
        private static void AddUnityErrors(List<UnityMessage> messages, List<string> errors)
        {
            if (errors?.Count > 0)
            {
                var errorText = string.Join("\n", errors);
                messages.Add(UnityMessage.TextMessage($"Unity Logs:\n{errorText}"));
            }
        }
        
        private static bool IsBase64Image(string data) =>
            !string.IsNullOrEmpty(data) && 
            data.Length > 100 && 
            data.Length % 4 == 0 &&
            System.Text.RegularExpressions.Regex.IsMatch(data, @"^[A-Za-z0-9+/]*={0,2}$");
        
        private static string FormatData(object data)
        {
            if (data == null) return "null";
            if (data is string s) return s;
            if (data is int || data is float || data is bool) return data.ToString();
            
            // Для сложных объектов используем JsonUtils
            return JsonUtils.ToJson(data);
        }
    }
} 