const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 80;

// Middleware para JSON
app.use(express.json({ limit: '50mb' }));
// Servir arquivos estáticos do diretório atual
app.use(express.static(__dirname));

// 🔍 Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        message: 'Sistema de Voz Simplificado funcionando!'
    });
});

// 🏠 Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// 🚀 Iniciar servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Node.js rodando em: http://localhost:${PORT}`);
    console.log(`📁 Servindo arquivos da pasta: ${__dirname}`);
    console.log(`🌐 Abra seu navegador e acesse: http://localhost:${PORT}`);
    console.log(`🔍 Para verificar o status: http://localhost:${PORT}/health`);
    console.log(`⏹️  Para parar o servidor: Ctrl+C`);
});

// 🛡️ Tratamento de erros
process.on('uncaughtException', (error) => {
    console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Promise rejeitada:', reason);
});