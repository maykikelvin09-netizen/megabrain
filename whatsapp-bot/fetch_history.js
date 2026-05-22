const { Client, LocalAuth } = require('whatsapp-web.js');
const fs = require('fs');

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
});

client.on('ready', async () => {
    console.log('Cliente pronto, buscando histórico...');
    try {
        const chats = await client.getChats();
        let historyOutput = "";
        let foundCount = 0;

        for (const chat of chats) {
            if (chat.isGroup) continue;

            const messages = await chat.fetchMessages({ limit: 20 });
            
            // Verifica se a conversa contém a mensagem padrão
            const hasTrigger = messages.some(m => m.body && m.body.includes('Influencer IA Sem Limites'));
            
            // Verifica se o usuário (dono do zap) respondeu
            const hasMyReply = messages.some(m => m.fromMe);

            if (hasTrigger && hasMyReply) {
                historyOutput += `\n--- CONVERSA COM ${chat.name || chat.id._serialized} ---\n`;
                for (const m of messages) {
                    const sender = m.fromMe ? "MARCO (Você)" : "LEAD";
                    historyOutput += `[${sender}]: ${m.body}\n`;
                }
                foundCount++;
                if (foundCount >= 5) break; // Pega só os 5 primeiros exemplos para não ficar gigante
            }
        }

        fs.writeFileSync('history_examples.txt', historyOutput);
        console.log(`Histórico salvo com sucesso! Encontradas ${foundCount} conversas.`);
        process.exit(0);

    } catch (err) {
        console.error("Erro:", err);
        process.exit(1);
    }
});

client.initialize();
