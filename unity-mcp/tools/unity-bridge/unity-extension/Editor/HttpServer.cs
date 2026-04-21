using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using UnityEngine;

namespace UnityBridge
{
    /// <summary>
    /// Minimal HTTP server used by the Unity bridge.
    /// </summary>
    public class HttpServer
    {
        private readonly int port;
        private readonly Func<string, Dictionary<string, object>, Dictionary<string, object>> requestHandler;
        private readonly List<string> prefixes = new List<string>();
        private HttpListener listener;
        private Thread listenerThread;
        private bool isRunning;

        public bool IsRunning => isRunning && listener != null && listener.IsListening;
        public IReadOnlyList<string> Prefixes => prefixes;
        
        public HttpServer(int port, Func<string, Dictionary<string, object>, Dictionary<string, object>> requestHandler)
        {
            this.port = port;
            this.requestHandler = requestHandler;
        }
        
        public bool Start()
        {
            var startErrors = new List<string>();
            try
            {
                if (!TryStartWithPrefixes(new[] { $"http://localhost:{port}/", $"http://127.0.0.1:{port}/" }, startErrors) &&
                    !TryStartWithPrefixes(new[] { $"http://localhost:{port}/" }, startErrors))
                {
                    throw new InvalidOperationException(string.Join(" | ", startErrors));
                }
                
                isRunning = true;
                listenerThread = new Thread(ListenForRequests) 
                { 
                    IsBackground = true,
                    Name = "UnityBridge-HttpListener"
                };
                listenerThread.Start();
                
                Debug.Log($"HTTP Server started on port {port}");
                return true;
            }
            catch (Exception ex)
            {
                isRunning = false;
                try { listener?.Close(); } catch { }
                listener = null;
                Debug.LogError($"Failed to start HTTP server: {ex.Message}");
                return false;
            }
        }
        
        public void Stop()
        {
            if (!isRunning) return;
            
            try
            {
                isRunning = false;
                listener?.Stop();
                listener?.Close();
                
                if (listenerThread?.IsAlive == true)
                {
                    listenerThread.Join(1000);
                }
                
                Debug.Log("HTTP Server stopped");
            }
            catch (Exception ex)
            {
                Debug.LogError($"Error stopping HTTP server: {ex.Message}");
            }
        }

        private void AddPrefix(string prefix)
        {
            if (listener.Prefixes.Contains(prefix))
                return;
            listener.Prefixes.Add(prefix);
            prefixes.Add(prefix);
        }

        private bool TryStartWithPrefixes(IEnumerable<string> requestedPrefixes, List<string> startErrors)
        {
            try
            {
                listener?.Close();
            }
            catch
            {
            }

            listener = new HttpListener();
            prefixes.Clear();

            foreach (var prefix in requestedPrefixes)
                AddPrefix(prefix);

            try
            {
                listener.Start();
                return true;
            }
            catch (Exception ex)
            {
                startErrors.Add($"{string.Join(", ", requestedPrefixes)} => {ex.Message}");
                try { listener.Close(); } catch { }
                listener = null;
                prefixes.Clear();
                return false;
            }
        }
        
        private void ListenForRequests()
        {
            while (isRunning && listener != null)
            {
                try
                {
                    var context = listener.GetContext();
                    ThreadPool.QueueUserWorkItem(_ => ProcessRequest(context));
                }
                catch (HttpListenerException)
                {
                    if (!isRunning) return;
                }
                catch (Exception ex)
                {
                    if (isRunning)
                        Debug.LogError($"HTTP listener error: {ex.Message}");
                }
            }
        }
        
        private void ProcessRequest(HttpListenerContext context)
        {
            var request = context.Request;
            var response = context.Response;
            
            try
            {
                // CORS headers
                response.AddHeader("Access-Control-Allow-Origin", "*");
                response.AddHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
                response.AddHeader("Access-Control-Allow-Headers", "Content-Type");
                
                // Handle OPTIONS preflight
                if (request.HttpMethod == "OPTIONS")
                {
                    response.StatusCode = 204;
                    response.Close();
                    return;
                }
                
                // Parse request
                var endpoint = request.Url.AbsolutePath;
                var requestData = ParseRequestBody(request);
                
                // Process request
                var responseData = requestHandler(endpoint, requestData);
                
                // Send response
                SendJsonResponse(response, responseData, 200);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Request processing error: {ex.Message}");
                var errorResponse = ResponseBuilder.BuildErrorResponse($"Request processing failed: {ex.Message}", Guid.NewGuid().ToString("N"), request.Url.AbsolutePath, 0);
                SendJsonResponse(response, errorResponse, 500);
            }
        }
        
        private Dictionary<string, object> ParseRequestBody(HttpListenerRequest request)
        {
            if (request.ContentLength64 == 0)
                return new Dictionary<string, object>();
                
            try
            {
                using (var reader = new StreamReader(request.InputStream, Encoding.UTF8))
                {
                    var body = reader.ReadToEnd();
                    return string.IsNullOrWhiteSpace(body) 
                        ? new Dictionary<string, object>() 
                        : JsonUtils.FromJson(body);
                }
            }
            catch (Exception ex)
            {
                Debug.LogWarning($"Failed to parse request body: {ex.Message}");
                return new Dictionary<string, object>();
            }
        }
        
        private void SendJsonResponse(HttpListenerResponse response, Dictionary<string, object> data, int statusCode)
        {
            try
            {
                var json = JsonUtils.ToJson(data);
                var buffer = Encoding.UTF8.GetBytes(json);
                
                response.ContentType = "application/json; charset=utf-8";
                response.ContentEncoding = Encoding.UTF8;
                response.ContentLength64 = buffer.Length;
                response.StatusCode = statusCode;
                
                response.OutputStream.Write(buffer, 0, buffer.Length);
            }
            catch (Exception ex)
            {
                Debug.LogError($"Failed to send response: {ex.Message}");
            }
            finally
            {
                try
                {
                    response.Close();
                }
                catch
                {
                    // Ignore close errors
                }
            }
        }
    }
} 