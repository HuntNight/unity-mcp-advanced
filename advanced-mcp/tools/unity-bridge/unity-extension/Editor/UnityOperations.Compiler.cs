using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using UnityEngine;
using UnityEditor;
using System.CodeDom.Compiler;
using System.Text;
using System.Text.RegularExpressions;
using System.IO;

namespace UnityBridge
{
    public static partial class UnityOperations
    {
        public static OperationResult ExecuteCode(UnityRequest request)
        {
            try
            {
                var code = request.GetValue<string>("code");
                if (string.IsNullOrEmpty(code))
                    return OperationResult.Fail("Code parameter is required");
                var safeMode = request.GetValue("safe_mode", true);
                var validateOnly = request.GetValue("validate_only", false);
                
                var unescapedCode = JsonUtils.Unescape(code);
                var stmtError = ValidateStatementsOnly(unescapedCode);
                if (!string.IsNullOrEmpty(stmtError))
                    return OperationResult.Fail(stmtError);
                if (safeMode)
                {
                    var validationError = ValidateUserCode(unescapedCode);
                    if (!string.IsNullOrEmpty(validationError))
                        return OperationResult.Fail(validationError);
                }

                var compilationResult = EnsureCompilationComplete();
                if (!compilationResult.Success)
                    return compilationResult;

                var result = ExecuteCodeDirect(unescapedCode, validateOnly);

                if (!result.Success)
                    return OperationResult.Fail($"Code execution failed: {result.ErrorMessage}");

                var successMessage = validateOnly ? "Code compiled successfully" : "Code executed successfully";
                if (!validateOnly && result.Value != null) successMessage += $"\nReturn Value: {result.Value}";
                return OperationResult.Ok(successMessage, result.Value);
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Code execution error: {ex.Message}");
            }
        }

        private static OperationResult EnsureCompilationComplete(int timeoutSeconds = 30)
        {
            try
            {
                UnityEditor.AssetDatabase.Refresh(UnityEditor.ImportAssetOptions.ForceUpdate);

                if (UnityEditor.EditorApplication.isCompiling)
                {
                    var timeout = DateTime.UtcNow.AddSeconds(timeoutSeconds);
                    while (UnityEditor.EditorApplication.isCompiling && DateTime.UtcNow < timeout)
                    {
                        System.Threading.Thread.Sleep(100);
                    }

                    if (UnityEditor.EditorApplication.isCompiling)
                        return OperationResult.Fail("Compilation timeout after 30 seconds");
                }

                if (UnityEditor.EditorUtility.scriptCompilationFailed)
                {
                    return OperationResult.Fail("Script compilation failed. Check Unity Console for errors.");
                }

                System.Threading.Thread.Sleep(500);
                UnityEditor.AssetDatabase.Refresh();

                return OperationResult.Ok("Compilation and domain reload complete");
            }
            catch (Exception ex)
            {
                return OperationResult.Fail($"Compilation check error: {ex.Message}");
            }
        }

        private static CodeExecutionResult ExecuteCodeDirect(string code, bool validateOnly)
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "UnityMCP_" + Guid.NewGuid().ToString());
            Directory.CreateDirectory(tempDir);
            string sourcePath = Path.Combine(tempDir, "UserCode.cs");
            string dllPath = Path.Combine(tempDir, $"UserCode_{Guid.NewGuid().ToString("N")}.dll");

            try
            {
                var fullCode = GenerateFullCodeForExecution(code);
                File.WriteAllText(sourcePath, fullCode);

                var references = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                
                AddAssemblyIfNotExists(references, "mscorlib.dll");
                AddAssemblyIfNotExists(references, "System.dll");
                AddAssemblyIfNotExists(references, "System.Core.dll");
                
                AddAssemblyIfNotExists(references, typeof(UnityEngine.GameObject).Assembly.Location);
                AddAssemblyIfNotExists(references, typeof(UnityEditor.EditorWindow).Assembly.Location);
                
                var allowedUnityAssemblies = new[] {
                    "UnityEngine.CoreModule", "UnityEngine.IMGUIModule", "UnityEngine.PhysicsModule",
                    "UnityEngine.AnimationModule", "UnityEngine.AudioModule", "UnityEngine.ParticleSystemModule",
                    "UnityEngine.TerrainModule", "UnityEngine.UIModule", "UnityEngine.TextRenderingModule",
                    "UnityEngine.UIElementsModule", "UnityEngine.ImageConversionModule", "UnityEditor.CoreModule"
                };

                foreach (var asm in AppDomain.CurrentDomain.GetAssemblies())
                {
                    try
                    {
                        if (asm.IsDynamic || string.IsNullOrEmpty(asm.Location)) continue;
                        
                        var name = asm.GetName().Name;
                        if (allowedUnityAssemblies.Contains(name) || 
                            name == "Assembly-CSharp" || 
                            name == "Assembly-CSharp-Editor" ||
                            name == "netstandard")
                        {
                            AddAssemblyIfNotExists(references, asm.Location);
                        }
                    }
                    catch { /* ignore */ }
                }

                var compilerPath = FindRoslynCompiler();
                if (string.IsNullOrEmpty(compilerPath))
                {
                    return new CodeExecutionResult { Success = false, ErrorMessage = "Roslyn compiler (csc.exe) not found in Unity installation." };
                }

                var compileResult = CompileWithRoslyn(compilerPath, sourcePath, dllPath, references);
                
                if (!compileResult.Success)
                {
                    var cleanedError = CleanCompilerErrorPath(compileResult.ErrorMessage, fullCode);
                    return new CodeExecutionResult { Success = false, ErrorMessage = cleanedError };
                }

                if (validateOnly)
                {
                    return new CodeExecutionResult { Success = true, Value = "Compilation OK" };
                }

                // Load assembly from bytes to avoid file locking and force fresh load
                byte[] assemblyBytes = File.ReadAllBytes(dllPath);
                
                // Try to cleanup immediately
                try { File.Delete(dllPath); } catch { /* ignore */ }

                var assembly = Assembly.Load(assemblyBytes);
                var type = assembly.GetType("DynamicCodeExecutor");
                var method = type.GetMethod("Execute", BindingFlags.Static | BindingFlags.Public);
                var result = method.Invoke(null, null);

                return new CodeExecutionResult { Success = true, Value = result?.ToString() ?? "null" };
            }
            catch (Exception ex)
            {
                var actualEx = ex is System.Reflection.TargetInvocationException tie ? tie.InnerException ?? ex : ex;
                var stackTrace = actualEx.StackTrace ?? "";
                var userCodePreview = GetCodePreview(code, actualEx);
                var errorMsg = $"{actualEx.GetType().Name}: {actualEx.Message}\n\nКод:\n{userCodePreview}\n\nСтек вызовов:\n{stackTrace}";
                return new CodeExecutionResult { Success = false, ErrorMessage = errorMsg };
            }
            finally
            {
                try { Directory.Delete(tempDir, true); } catch { }
            }
        }

        private static string FindRoslynCompiler()
        {
            var root = EditorApplication.applicationContentsPath;
            var candidates = new[] {
                "MonoBleedingEdge/lib/mono/msbuild/Current/bin/Roslyn/csc.exe",
                "Tools/Roslyn/csc.exe",
                "DotNetSdkRoslyn/csc.exe"
            };

            foreach (var relPath in candidates)
            {
                var path = Path.Combine(root, relPath);
                if (File.Exists(path)) return path;
            }
            
            try
            {
                var files = Directory.GetFiles(root, "csc.exe", SearchOption.AllDirectories);
                return files.FirstOrDefault(f => f.Contains("Roslyn"));
            }
            catch { return null; }
        }

        private static (bool Success, string ErrorMessage) CompileWithRoslyn(string compilerPath, string sourcePath, string outputDll, HashSet<string> references)
        {
            var args = new StringBuilder();
            args.Append($"/target:library /out:\"{outputDll}\" /nologo /langversion:latest ");
            foreach (var refPath in references)
            {
                args.Append($"/reference:\"{refPath}\" ");
            }
            args.Append($"\"{sourcePath}\"");

            var fileName = compilerPath;
            var arguments = args.ToString();

            if (UnityEngine.Application.platform == UnityEngine.RuntimePlatform.OSXEditor || 
                UnityEngine.Application.platform == UnityEngine.RuntimePlatform.LinuxEditor)
            {
                var root = EditorApplication.applicationContentsPath;
                var monoPath = Path.Combine(root, "MonoBleedingEdge/bin/mono");
                if (File.Exists(monoPath))
                {
                    fileName = monoPath;
                    arguments = $"\"{compilerPath}\" {arguments}";
                }
            }

            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = fileName,
                Arguments = arguments,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            try
            {
                using (var p = System.Diagnostics.Process.Start(psi))
                {
                    var outputTask = p.StandardOutput.ReadToEndAsync();
                    var errorTask = p.StandardError.ReadToEndAsync();
                    
                    p.WaitForExit();
                    
                    outputTask.Wait();
                    errorTask.Wait();
                    
                    var output = outputTask.Result;
                    var error = errorTask.Result;

                    if (p.ExitCode != 0)
                    {
                        return (false, output + "\n" + error);
                    }
                    return (true, null);
                }
            }
            catch (Exception ex)
            {
                return (false, $"Compiler launch failed: {ex.Message}");
            }
        }

        private static void AddAssemblyIfNotExists(HashSet<string> references, string path)
        {
            if (!string.IsNullOrEmpty(path) && !references.Contains(path))
            {
                references.Add(path);
            }
        }
        
        private static bool ContainsProblematicTypes(System.Reflection.Assembly assembly)
        {
            try
            {
                var assemblyName = assembly.GetName().Name;
                
                if (assemblyName == "System.Windows.Forms" ||
                    assemblyName.Contains("WindowsForms") ||
                    assemblyName.Contains("Windows.Forms"))
                {
                    return true;
                }
                
                var types = assembly.GetExportedTypes();
                return types.Any(t => 
                    t.Namespace == "System.Windows.Forms" ||
                    t.FullName == "System.Windows.Forms.SaveFileDialog" ||
                    t.FullName == "System.Windows.Forms.OpenFileDialog" ||
                    t.FullName == "System.Windows.Forms.DialogResult");
            }
            catch
            {
                return false;
            }
        }
        
        private static string CleanCompilerErrorPath(string errorMessage, string userCode = null)
        {
            if (string.IsNullOrEmpty(errorMessage))
                return errorMessage;
                
            try
            {
                var tempPath = System.IO.Path.GetTempPath().TrimEnd(System.IO.Path.DirectorySeparatorChar, System.IO.Path.AltDirectorySeparatorChar);
                var pattern = System.Text.RegularExpressions.Regex.Escape(tempPath) + @"[/\\][^/\\]*\.cs\((\d+),(\d+)\)\s*:";

                var cleanedError = System.Text.RegularExpressions.Regex.Replace(errorMessage, pattern, match => {
                    var lineNum = int.Parse(match.Groups[1].Value);
                    var colNum = match.Groups[2].Value;

                    if (!string.IsNullOrEmpty(userCode))
                    {
                        var offset = CalculateLineOffset(userCode);
                        lineNum = System.Math.Max(1, lineNum - offset);
                    }

                    return $"UserCode.cs({lineNum},{colNum}) :";
                });

                if (!string.IsNullOrEmpty(userCode))
                {
                    var match = System.Text.RegularExpressions.Regex.Match(cleanedError, @"UserCode\.cs\((\d+),");
                    if (match.Success && int.TryParse(match.Groups[1].Value, out int errorLineNum))
                    {
                        var lines = userCode.Split('\n');
                        var contextStart = Math.Max(0, errorLineNum - 4);
                        var contextEnd = Math.Min(lines.Length - 1, errorLineNum + 2);
                        
                        var sb = new StringBuilder();
                        sb.AppendLine("\nContext:");
                        for (int i = contextStart; i <= contextEnd; i++)
                        {
                            var marker = (i == errorLineNum - 1) ? ">> " : "   ";
                            sb.AppendLine($"{marker}{i + 1}: {lines[i]}");
                        }
                        cleanedError += sb.ToString();
                    }
                    else 
                    {
                         var codePreview = string.Join("\n", userCode.Split('\n').Take(20));
                         cleanedError += $"\n\nИсходный код (preview):\n{codePreview}";
                    }

                    if (cleanedError.Contains("CS0246"))
                    {
                        cleanedError += "\n💡 Подсказка: Тип или пространство имен не найдено. Возможно, скрипт еще не скомпилирован или вы забыли using.";
                    }
                    else if (cleanedError.Contains("CS1061"))
                    {
                        cleanedError += "\n💡 Подсказка: 'Type' does not contain a definition for 'Member'. Проверьте имя метода или свойства.";
                    }
                    else if (cleanedError.Contains("CS1501"))
                    {
                        cleanedError += "\n💡 Подсказка: No overload for method takes N arguments. Проверьте аргументы функции.";
                    }
                }

                return cleanedError;
            }
            catch
            {
                return errorMessage;
            }
        }

        private static int CalculateLineOffset(string userCode)
        {
            return 7 + 1 + 1 + 1;
        }

        private static string GetCodePreview(string userCode, Exception ex)
        {
            var lines = userCode.Split('\n');
            return lines.Length > 10 ? string.Join("\n", lines.Take(10)) : userCode;
        }

        private static void ProcessAccumulatedBlock(List<string> currentBlock, string blockType, CodeParseResult result)
        {
            var blockCode = string.Join("\n", currentBlock);

            if (blockType == "class" || blockType == "interface" || blockType == "enum" || blockType == "struct")
            {
                result.ClassDefinitions += blockCode + "\n\n";
            }
            else if (blockType == "function")
            {
                var lines = blockCode.Split('\n');
                bool signatureInjected = false;

                for (int k = 0; k < lines.Length; k++)
                {
                    var sigLine = lines[k];
                    var m = System.Text.RegularExpressions.Regex.Match(sigLine,
                        @"^(\s*)(?:(public|private|internal|protected)\s+)?(?:(static)\s+)?([\w<>\[\]]+\s+\w+\s*\(.*)");
                    if (m.Success)
                    {
                        var indent = m.Groups[1].Value;
                        var access = m.Groups[2].Success ? m.Groups[2].Value + " " : string.Empty;
                        var hasStatic = m.Groups[3].Success;
                        var rest = m.Groups[4].Value;
                        if (!hasStatic)
                        {
                            lines[k] = $"{indent}{access}static {rest}";
                        }
                        signatureInjected = true;
                        break;
                    }
                }

                if (!signatureInjected)
                {
                    for (int k = 0; k < lines.Length; k++)
                    {
                        var trimmed = lines[k].TrimStart();
                        if (string.IsNullOrWhiteSpace(trimmed)) continue;
                        if (trimmed.StartsWith("[")) continue;
                        if (trimmed.StartsWith("//")) continue;
                        lines[k] = lines[k].Insert(lines[k].IndexOf(trimmed), "static ");
                        break;
                    }
                }

                var staticFunction = string.Join("\n", lines);
                result.LocalFunctions += "    " + staticFunction.Replace("\n", "\n    ") + "\n\n";
            }
        }

        private static string GenerateFullCodeForExecution(string userCode)
        {
            var defaultUsings = new[]
            {
                "System",
                "System.Collections.Generic", 
                "System.Linq",
                "UnityEngine",
                "UnityEditor",
                "Random = UnityEngine.Random",
                "Object = UnityEngine.Object"
            };
            
            var allUsings = new HashSet<string>(defaultUsings);
            var codeLines = userCode.Split('\n');
            
            var parseResult = ParseAdvancedCode(codeLines, allUsings);
            
            var orderedUsings = allUsings
                .OrderBy(u => u.Contains("=") ? 1 : 0)
                .ThenBy(u => u);
            var usings = string.Join("\n", orderedUsings.Select(u => $"using {u};"));
            
            var generatedCode = $@"{usings}

{parseResult.ClassDefinitions}

public class DynamicCodeExecutor
{{
{parseResult.LocalFunctions}
    
    public static object Execute()
    {{
        {parseResult.ExecutableCode}
    }}
}}";

            return generatedCode;
        }
        
        private static CodeParseResult ParseAdvancedCode(string[] codeLines, HashSet<string> allUsings)
        {
            var result = new CodeParseResult();
            var executableLines = new List<string>();
            var currentSection = CodeSection.Using;
            var braceDepth = 0;
            var currentBlock = new List<string>();
            var blockType = "";
            
            for (int i = 0; i < codeLines.Length; i++)
            {
                var line = codeLines[i];
                var trimmedLine = line.Trim();
                
                if (currentSection == CodeSection.Using && trimmedLine.StartsWith("using "))
                {
                    ExtractUsing(trimmedLine, allUsings);
                    continue;
                }
                
                if (currentSection == CodeSection.Using && (string.IsNullOrWhiteSpace(trimmedLine) || trimmedLine.StartsWith("//")))
                {
                    continue;
                }
                
                if (currentSection == CodeSection.Using)
                {
                    currentSection = CodeSection.Code;
                }
                
                if (braceDepth == 0 && IsBlockStart(trimmedLine))
                {
                    blockType = GetBlockType(trimmedLine);
                    currentBlock.Clear();
                    currentBlock.Add(line);
                    braceDepth += CountBraces(line, true) - CountBraces(line, false);

                    if (blockType == "function" && braceDepth == 0)
                    {
                        if (i + 1 < codeLines.Length)
                        {
                            var nextLineTrimmed = codeLines[i + 1].Trim();
                            if (nextLineTrimmed.StartsWith("{"))
                            {
                                i++;
                                currentBlock.Add(codeLines[i]);
                                braceDepth += CountBraces(codeLines[i], true) - CountBraces(codeLines[i], false);
                            }
                        }
                    }

                    if (braceDepth == 0)
                    {
                        var oneLineBlock = string.Join("\n", currentBlock);
                        if (blockType == "class" || blockType == "interface" || blockType == "enum" || blockType == "struct")
                        {
                            result.ClassDefinitions += oneLineBlock + "\n\n";
                        }
                        else if (blockType == "function")
                        {
                            string functionOnly = oneLineBlock;
                            string trailing = string.Empty;
                            int openIdx = oneLineBlock.IndexOf('{');
                            if (openIdx >= 0)
                            {
                                int closeIdx = oneLineBlock.IndexOf('}', openIdx + 1);
                                if (closeIdx > openIdx)
                                {
                                    functionOnly = oneLineBlock.Substring(0, closeIdx + 1);
                                    trailing = oneLineBlock.Substring(closeIdx + 1);
                                }
                            }
                            var lines = new[] { functionOnly };
                            bool signatureInjected = false;
                            for (int k = 0; k < lines.Length; k++)
                            {
                                var sigLine = lines[k];
                                var m = System.Text.RegularExpressions.Regex.Match(sigLine,
                                    @"^(\s*)(?:(public|private|internal|protected)\s+)?(?:(static)\s+)?([\w<>\[\]]+\s+\w+\s*\(.*)");
                                if (m.Success)
                                {
                                    var indent = m.Groups[1].Value;
                                    var access = m.Groups[2].Success ? m.Groups[2].Value + " " : string.Empty;
                                    var hasStatic = m.Groups[3].Success;
                                    var rest = m.Groups[4].Value;
                                    if (!hasStatic)
                                    {
                                        lines[k] = $"{indent}{access}static {rest}";
                                    }
                                    signatureInjected = true;
                                    break;
                                }
                            }
                            if (!signatureInjected)
                            {
                                for (int k = 0; k < lines.Length; k++)
                                {
                                    var trimmed = lines[k].TrimStart();
                                    if (string.IsNullOrWhiteSpace(trimmed)) continue;
                                    if (trimmed.StartsWith("[")) continue;
                                    if (trimmed.StartsWith("//")) continue;
                                    lines[k] = lines[k].Insert(lines[k].IndexOf(trimmed), "static ");
                                    break;
                                }
                            }
                            var staticFunction = string.Join("\n", lines);
                            result.LocalFunctions += "    " + staticFunction.Replace("\n", "\n    ") + "\n\n";

                            if (!string.IsNullOrWhiteSpace(trailing))
                            {
                                var tail = trailing.Trim();
                                if (tail.Length > 0)
                                {
                                    executableLines.Add(tail);
                                }
                            }
                        }
                        continue;
                    }
                    else
                    {
                        for (int j = i + 1; j < codeLines.Length; j++)
                        {
                            var nextLine = codeLines[j];
                            currentBlock.Add(nextLine);
                            braceDepth += CountBraces(nextLine, true) - CountBraces(nextLine, false);
                            if (braceDepth == 0)
                            {
                                i = j;
                                ProcessAccumulatedBlock(currentBlock, blockType, result);
                                break;
                            }
                        }
                        continue;
                    }
                }
                
                if (braceDepth > 0)
                {
                    currentBlock.Add(line);
                    braceDepth += CountBraces(trimmedLine, true) - CountBraces(trimmedLine, false);
                    
                    if (braceDepth == 0)
                    {
                        ProcessAccumulatedBlock(currentBlock, blockType, result);
                    }
                    continue;
                }
                
                executableLines.Add(line);
            }
            
            var executableCode = string.Join("\n", executableLines).Trim();
            
            result.ExecutableCode = EnsureReturnStatement(executableCode);
            
            return result;
        }
        
        private static string EnsureReturnStatement(string code)
        {
            if (string.IsNullOrWhiteSpace(code))
            {
                return "return \"Definitions processed.\";";
            }

            return code + "\nreturn \"Execution finished successfully.\";";
        }

        private static void ExtractUsing(string line, HashSet<string> usings)
        {
            try
            {
                var usingPart = line.Substring(6).Trim();
                if (usingPart.EndsWith(";"))
                    usingPart = usingPart.Substring(0, usingPart.Length - 1).Trim();
                
                usingPart = usingPart.Replace("\"", "").Replace("'", "").Trim();
                
                if (!string.IsNullOrWhiteSpace(usingPart) && System.Text.RegularExpressions.Regex.IsMatch(usingPart, @"^[a-zA-Z_][a-zA-Z0-9_.]*$"))
                {
                    usings.Add(usingPart);
                }
            }
            catch { /* ignore */ }
        }
        
        private static bool IsBlockStart(string line)
        {
            if (System.Text.RegularExpressions.Regex.IsMatch(line, 
                @"^\s*(public\s+|private\s+|internal\s+|protected\s+)?(static\s+)?(class\s+|interface\s+|enum\s+|struct\s+)\w+", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return true;
            }
            
            if (System.Text.RegularExpressions.Regex.IsMatch(line, 
                @"^\s*(public\s+|private\s+|internal\s+|protected\s+)?(static\s+)?[\w<>\[\]]+\s+\w+\s*\([^)]*\)", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return true;
            }
            
            return false;
        }
        
        private static string GetBlockType(string line)
        {
            var lowerLine = line.ToLower();
            if (lowerLine.Contains("class ")) return "class";
            if (lowerLine.Contains("interface ")) return "interface";  
            if (lowerLine.Contains("enum ")) return "enum";
            if (lowerLine.Contains("struct ")) return "struct";
            
            if (System.Text.RegularExpressions.Regex.IsMatch(line, 
                @"^\s*(public\s+|private\s+|internal\s+|protected\s+)?(static\s+)?[\w<>\[\]]+\s+\w+\s*\([^)]*\)", 
                System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            {
                return "function";
            }
            
            return "unknown";  
        }
        
        private static int CountBraces(string line, bool opening)
        {
            return line.Count(c => c == (opening ? '{' : '}'));
        }

        private class CodeParseResult
        {
            public string ClassDefinitions { get; set; } = "";
            public string LocalFunctions { get; set; } = "";
            public string ExecutableCode { get; set; } = "";
        }
        
        private enum CodeSection
        {
            Using,
            Code
        }
        
        private class CodeExecutionResult
        {
            public bool Success { get; set; }
            public string Value { get; set; }
            public string ErrorMessage { get; set; }
        }

        private static string ValidateUserCode(string code)
        {
            var forbiddenPatterns = new[]
            {
                @"\bSystem\.IO\b",
                @"\bSystem\.Net\b",
                @"\bSystem\.Diagnostics\b",
                @"\bSystem\.Threading\b",
                @"\bSystem\.Reflection\.Emit\b",
                @"\bProcess\.Start\b",
                @"\bnew\s+Process\s*\(",
                @"\bFile\.",
                @"\bDirectory\.",
                @"\bEnvironment\.",
                @"DllImport",
                @"\bApplication\.Quit\b",
                @"\bEditorApplication\.Exit\b"
            };

            foreach (var p in forbiddenPatterns)
            {
                if (Regex.IsMatch(code, p))
                {
                    return $"Forbidden API usage detected: pattern '{p}'";
                }
            }

            // Statements + Functions режим: запрещаем только объявления типов и namespace
            try
            {
                var lines = code.Split('\n');
                for (int i = 0; i < lines.Length; i++)
                {
                    var rawLine = lines[i];
                    var trimmed = rawLine.Trim();

                    // Пропускаем пустые строки и комментарии
                    if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("//"))
                        continue;

                    // Блоки namespace запрещены
                    if (Regex.IsMatch(trimmed, @"^\s*namespace\s+\w+", RegexOptions.IgnoreCase))
                    {
                        return "Statements-only: объявления namespace запрещены. Оставьте только инструкции и выражения.";
                    }

                    // Детектируем объявления типов (class/interface/enum/struct)
                    if (Regex.IsMatch(trimmed,
                        @"^\s*(public\s+|private\s+|internal\s+|protected\s+)?(static\s+)?(class|interface|enum|struct)\s+\w+",
                        RegexOptions.IgnoreCase))
                    {
                        return "Statements-only: объявления class/interface/enum/struct запрещены. Используйте только инструкции без определения типов.";
                    }

                    // Объявления функций РАЗРЕШЕНЫ (обрабатываются и статифицируются позже)
                }
            }
            catch { /* ignore and allow fallback */ }

            return null;
        }

        private static string ValidateStatementsOnly(string code)
        {
            try
            {
                var lines = code.Split('\n');
                for (int i = 0; i < lines.Length; i++)
                {
                    var rawLine = lines[i];
                    var trimmed = rawLine.Trim();

                    if (string.IsNullOrWhiteSpace(trimmed) || trimmed.StartsWith("//"))
                        continue;

                    if (Regex.IsMatch(trimmed, @"^\s*namespace\s+\w+", RegexOptions.IgnoreCase))
                    {
                        return "Statements+Functions: объявления namespace запрещены.";
                    }

                    if (Regex.IsMatch(trimmed,
                        @"^\s*(public\s+|private\s+|internal\s+|protected\s+)?(static\s+)?(class|interface|enum|struct)\s+\w+",
                        RegexOptions.IgnoreCase))
                    {
                        return "Statements+Functions: объявления class/interface/enum/struct запрещены.";
                    }
                    // Объявления функций разрешены
                }
            }
            catch { }

            return null;
        }
    }
}
