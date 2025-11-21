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

        public static Dictionary<string, object> BuildResponse(OperationResult result, bool allowLargeResponse, List<string> errors = null)
        {
            var messages = new List<UnityMessage>();

            if (result.Success)
            {
                if (!string.IsNullOrEmpty(result.Message))
                    messages.Add(UnityMessage.TextMessage(result.Message));
                if (result.Data is ImagePayload img)
                {
                    messages.Add(UnityMessage.Image(img.Base64, "Unity Screenshot"));
                }
                else if (result.Data is string s)
                {
                    if (!string.IsNullOrEmpty(s)) messages.Add(UnityMessage.TextMessage(s));
                }
                else if (result.Data != null)
                {
                    messages.Add(UnityMessage.TextMessage(FormatData(result.Data)));
                }
            }
            else
            {
                messages.Add(UnityMessage.TextMessage($"Error: {result.Error}"));
            }

            var unityErrors = errors ?? ErrorCollector.GetRecentErrors(maxCount: 5, errorsOnly: true);
            if (unityErrors.Count > 0)
                AddUnityErrors(messages, unityErrors);

            // Size guard: truncate total text length to 5000 unless explicitly allowed
            try
            {
                if (!allowLargeResponse)
                {
                    int accumulated = 0;
                    for (int i = 0; i < messages.Count; i++)
                    {
                        if (messages[i].Type == "text" && messages[i].Content != null)
                        {
                            var content = messages[i].Content;
                            if (accumulated + content.Length > 5000)
                            {
                                // Обрезать текущее сообщение - создать новый immutable объект
                                int remainingChars = 5000 - accumulated;
                                string truncatedContent;
                                if (remainingChars > 15)
                                {
                                    truncatedContent = content.Substring(0, remainingChars - 15) + "\n[truncated...]";
                                }
                                else
                                {
                                    truncatedContent = "[truncated...]";
                                }

                                // Заменить сообщение новым объектом (immutable struct)
                                messages[i] = UnityMessage.TextMessage(truncatedContent);

                                // Удалить все последующие сообщения
                                if (i + 1 < messages.Count)
                                {
                                    messages.RemoveRange(i + 1, messages.Count - i - 1);
                                }
                                break;
                            }
                            accumulated += content.Length;
                        }
                    }
                }
            }
            catch { /* ignore guard failures */ }

            return CreateResponse(messages);
        }
        
        public static Dictionary<string, object> BuildErrorResponse(string error, List<string> errors = null)
        {
            var messages = new List<UnityMessage> { UnityMessage.TextMessage($"Error: {error}") };
            AddUnityErrors(messages, errors ?? ErrorCollector.GetRecentErrors(maxCount: 5, errorsOnly: true));
            return CreateResponse(messages);
        }
        
        public static Dictionary<string, object> BuildCompilationErrorResponse()
        {
            var status = ErrorCollector.GetCompilationStatus();
            var messages = new List<UnityMessage>
            {
                UnityMessage.TextMessage($"Compilation Error: {status}")
            };

            AddUnityErrors(messages, ErrorCollector.GetRecentErrors(maxCount: 5, errorsOnly: true));
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