const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

app.use(express.json());

// ============ БАЗОВЫЕ ОПЕРАЦИИ ============

// Открыть файл в VS Code
app.post('/api/file/open', (req, res) => {
  const { path: filePath } = req.body;
  exec(`code "${filePath}"`, (error) => {
    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
    res.json({ success: true, message: `Файл ${filePath} открыт в VS Code` });
  });
});

// Создать файл
app.post('/api/file/create', (req, res) => {
  const { path: filePath, content = '' } = req.body;
  fs.writeFileSync(filePath, content);
  res.json({ success: true, message: `Файл ${filePath} создан` });
});

// Выполнить команду в терминале
app.post('/api/terminal/execute', (req, res) => {
  const { command } = req.body;
  exec(command, (error, stdout, stderr) => {
    res.json({
      success: !error,
      stdout,
      stderr,
      error: error?.message
    });
  });
});

// Статус
app.get('/api/status', (req, res) => {
  res.json({
    success: true,
    status: 'VS Code Bridge работает! 🚀',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 VS Code Bridge запущен на порту ${PORT}`);
}); 