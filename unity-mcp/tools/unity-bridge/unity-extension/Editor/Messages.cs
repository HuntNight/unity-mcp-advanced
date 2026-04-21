using System;
using System.Collections.Generic;

namespace UnityBridge
{
    /// <summary>
    /// Shared message and operation result types for the Unity bridge.
    /// </summary>
    
    public struct UnityMessage
    {
        public readonly string Type;
        public readonly string Content;
        public readonly string Text;
        
        public UnityMessage(string type, string content, string text = null)
        {
            Type = type;
            Content = content;
            Text = text;
        }
        
        public static UnityMessage TextMessage(string content) => 
            new UnityMessage("text", content);
            
        public static UnityMessage Image(string base64Content, string description = null) => 
            new UnityMessage("image", base64Content, description ?? "Unity Image");
            
        public Dictionary<string, object> ToDictionary() =>
            Text != null && Type == "image" 
                ? new Dictionary<string, object> { {"type", Type}, {"content", Content}, {"text", Text} }
                : new Dictionary<string, object> { {"type", Type}, {"content", Content} };
    }
    
    public struct OperationResult
    {
        public readonly bool Success;
        public readonly string Message;
        public readonly object Data;
        public readonly string Error;
        public readonly string ErrorCode;
        
        public OperationResult(bool success, string message, object data = null, string error = null, string errorCode = null)
        {
            Success = success;
            Message = message;
            Data = data;
            Error = error;
            ErrorCode = errorCode;
        }
        
        public static OperationResult Ok(string message, object data = null) => 
            new OperationResult(true, message, data);
            
        public static OperationResult Fail(string error, string errorCode = null) => 
            new OperationResult(false, null, null, error, errorCode);
    }
    
    public struct UnityRequest
    {
        public readonly string Endpoint;
        public readonly Dictionary<string, object> Data;
        
        public UnityRequest(string endpoint, Dictionary<string, object> data)
        {
            Endpoint = endpoint;
            Data = data ?? new Dictionary<string, object>();
        }
        
        public T GetValue<T>(string key, T defaultValue = default(T))
        {
            if (!Data.ContainsKey(key)) return defaultValue;
            try { return (T)Convert.ChangeType(Data[key], typeof(T)); }
            catch { return defaultValue; }
        }
    }
    public struct ImagePayload
    {
        public readonly string Base64;
        public ImagePayload(string base64) => Base64 = base64;
    }
} 