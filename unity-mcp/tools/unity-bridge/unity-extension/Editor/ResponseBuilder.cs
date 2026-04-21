using System;
using System.Collections.Generic;
using System.Linq;

namespace UnityBridge
{
    public static class ResponseBuilder
    {
        public static Dictionary<string, object> BuildResponse(OperationResult result, bool allowLargeResponse, string requestId, string endpoint, long durationMs, List<string> logs = null)
        {
            var messages = new List<UnityMessage>();

            if (result.Success)
            {
                if (!string.IsNullOrEmpty(result.Message))
                    messages.Add(UnityMessage.TextMessage(result.Message));
                if (result.Data is ImagePayload imagePayload)
                    messages.Add(UnityMessage.Image(imagePayload.Base64, "Unity Screenshot"));
                else if (result.Data is string resultText && !string.IsNullOrEmpty(resultText))
                    messages.Add(UnityMessage.TextMessage(resultText));
                else if (result.Data != null)
                    messages.Add(UnityMessage.TextMessage(FormatData(result.Data)));
            }
            else
            {
                messages.Add(UnityMessage.TextMessage($"Error: {result.Error}"));
            }
            var effectiveLogs = logs ?? new List<string>();
            if (effectiveLogs.Count > 0)
                AddUnityErrors(messages, effectiveLogs);

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

                                messages[i] = UnityMessage.TextMessage(truncatedContent);

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

            return CreateResponse(result, messages, requestId, endpoint, durationMs, effectiveLogs);
        }
        
        public static Dictionary<string, object> BuildErrorResponse(string error, string requestId, string endpoint, long durationMs, List<string> logs = null)
        {
            var messages = new List<UnityMessage> { UnityMessage.TextMessage($"Error: {error}") };
            var effectiveLogs = logs ?? ErrorCollector.GetRecentErrors(maxCount: 5, errorsOnly: true);
            AddUnityErrors(messages, effectiveLogs);
            return CreateResponse(OperationResult.Fail(error), messages, requestId, endpoint, durationMs, effectiveLogs);
        }
        
        public static Dictionary<string, object> BuildCompilationErrorResponse(string requestId, string endpoint, long durationMs)
        {
            var status = ErrorCollector.GetCompilationStatus();
            var messages = new List<UnityMessage>
            {
                UnityMessage.TextMessage($"Compilation Error: {status}")
            };

            var logs = ErrorCollector.GetRecentErrors(maxCount: 5, errorsOnly: true);
            AddUnityErrors(messages, logs);
            return CreateResponse(OperationResult.Fail(status), messages, requestId, endpoint, durationMs, logs);
        }
        
        private static Dictionary<string, object> CreateResponse(OperationResult result, List<UnityMessage> messages, string requestId, string endpoint, long durationMs, List<string> logs) =>
            new Dictionary<string, object>
            {
                { "success", result.Success },
                { "error", result.Success ? null : result.Error },
                { "errorCode", result.Success ? null : result.ErrorCode },
                { "data", SerializeData(result.Data) },
                { "logs", logs ?? new List<string>() },
                { "meta", new Dictionary<string, object>
                    {
                        { "requestId", requestId },
                        { "endpoint", endpoint },
                        { "durationMs", durationMs },
                        { "timestampUtc", DateTime.UtcNow.ToString("O") }
                    }
                },
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
            
            return JsonUtils.ToJson(data);
        }

        private static object SerializeData(object data)
        {
            if (data == null)
                return null;
            if (data is ImagePayload img)
                return img.Base64;
            if (data is string text)
                return text;
            return data;
        }
    }
} 