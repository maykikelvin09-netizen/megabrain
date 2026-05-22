const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { OpenAI } = require('openai');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const knowledgePath = path.join(__dirname, '../workspace/inbox/modeloiasemlimites/BLUEPRINTS/sales-page-influencer.txt');
let knowledgeBase = "";
try {
    knowledgeBase = fs.readFileSync(knowledgePath, 'utf8');
} catch (error) {
    console.error("Erro ao ler arquivo da sales page:", error);
}

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    }
});

client.on('qr', (qr) => {
    console.log("⬇️  ESCANEIE O QR CODE ABAIXO COM O SEU WHATSAPP  ⬇️");
    qrcode.generate(qr, { small: true });
});

// Função auxiliar para criar delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function processMessage(message, chat) {
    // 1. Ignora grupos e status
    if (chat.isGroup || message.isStatus) return;

    const userMsg = message.body;
    const userId = message.from;
    const BOT_SIGNATURE = '\u200B';
    
    // 2. Filtro de Mídia (Ignorar Áudios e Imagens)
    if (message.hasMedia || message.type === 'audio' || message.type === 'ptt') {
        console.log(`🎤 Áudio/Mídia recebido de ${userId}. Bot em silêncio para o Marco assumir.`);
        return;
    }

    try {
        // 3. Verifica se Marco já assumiu
        const recentMsgs = await chat.fetchMessages({ limit: 15 });
        const didMarcoTakeOver = recentMsgs.some(m => m.fromMe && !m.body.startsWith(BOT_SIGNATURE));
        
        if (didMarcoTakeOver) {
            console.log(`🔇 O Marco já assumiu a conversa com ${userId}. O bot ficará quieto.`);
            return;
        }

        // 4. Lógica Híbrida: Mensagem padrão vs Dúvida real
        const isInitialTrigger = userMsg.includes("Olá, tenho uma dúvida sobre o Influencer IA Sem Limites");
        const didBotAlreadyReplyToTrigger = recentMsgs.some(m => m.fromMe && m.body.includes("qual seria a dúvida?"));

        if (isInitialTrigger && !didBotAlreadyReplyToTrigger) {
            console.log(`📩 Lead detectado (${userId}). Preparando saudação padrão (Sem IA)...`);
            
            const hour = new Date().getHours();
            let greeting = "Boa noite";
            if (hour >= 5 && hour < 12) greeting = "Bom dia";
            else if (hour >= 12 && hour < 18) greeting = "Boa tarde";

            const reply = `${greeting}, qual seria a dúvida?`;

            // --- DELAY HUMANO ESTRATÉGICO ---
            const delayMs = 2000 + (reply.length * 40);
            console.log(`⏱️ Aguardando ${delayMs}ms para enviar: "${reply}"`);
            
            await chat.sendStateTyping();
            await sleep(delayMs);
            await chat.clearState();

            await client.sendMessage(userId, BOT_SIGNATURE + reply);
            console.log(`🤖 Saudação enviada para ${userId}`);
            return; // Interrompe para não chamar a IA

        } else if (isInitialTrigger && didBotAlreadyReplyToTrigger) {
            // Cliente mandou a mensagem padrão de novo (spam), ignora.
            return;
        }

        // Se chegou aqui e não tem isInitialTrigger na frase, quer dizer que ele fez uma pergunta normal
        // E precisamos checar se ele realmente é um Lead (ou seja, se no histórico ele mandou a frase padrão)
        const isLeadInHistory = recentMsgs.some(m => m.body && m.body.includes("Influencer IA Sem Limites"));
        if (!isLeadInHistory) {
            return; // Ignora se for família, amigos, etc.
        }

        // 5. Inteligência Artificial: O cliente fez uma pergunta real
        console.log(`📩 Processando dúvida com IA para (${userId}): ${userMsg}`);

        // Monta o histórico das últimas mensagens
        let conversationHistory = [];
        for (let msg of recentMsgs) {
            // Ignora mensagens padrão de gatilho e saudações automáticas para não confundir a IA
            if (msg.body && msg.body.includes("Olá, tenho uma dúvida sobre o Influencer IA Sem Limites")) continue;
            if (msg.body && msg.body.includes("qual seria a dúvida?")) continue;

            // Ignora áudios
            if (msg.hasMedia || msg.type === 'audio' || msg.type === 'ptt') continue;

            if (msg.fromMe) {
                conversationHistory.push({ role: "assistant", content: msg.body.replace(BOT_SIGNATURE, '') });
            } else {
                conversationHistory.push({ role: "user", content: msg.body });
            }
        }

        const systemPrompt = `Sua identidade: Você é um ser humano no WhatsApp vendendo o treinamento "Influencer IA Sem Limites".
Seu estilo é EXTREMAMENTE curto, informal e direto (nada de textões de IA). Você fala igual a um brasileiro no WhatsApp.

INFORMAÇÕES DO PRODUTO (USE APENAS ISSO PARA RESPONDER):
${knowledgeBase}

REGRAS:
1. Responda a dúvida do cliente de forma direta usando as INFORMAÇÕES DO PRODUTO.
2. Mande no máximo 1 ou 2 frases curtas sem enrolação. Nada de frases de telemarketing.
3. Se o cliente perguntar "valores", "preço" ou quiser comprar, mande o link: https://www.modeloiasemlimites.com.br/influencer/
4. NUNCA invente informações. Se não souber, diga "Deixa eu confirmar isso aqui rapidão".
5. NUNCA comece sua frase dando "bom dia/boa tarde", pois isso já foi dito. Apenas vá direto ao ponto respondendo.
6. Se o cliente pedir para ver exemplos, fotos ou vídeos gerados, responda APENAS com a palavra exata [ENVIAR_EXEMPLOS] e mais nada.
7. IMPORTANTE: NUNCA repita o nome do treinamento ("Influencer IA Sem Limites") nas suas respostas. Trate apenas como "o treinamento", "o curso" ou nem cite o nome, apenas responda a dúvida para parecer bem natural e fluido.`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...conversationHistory
        ];

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: messages,
            temperature: 0.3, // Menos alucinação
        });

        const reply = completion.choices[0].message.content;

        // --- INTERCEPTADOR DE EXEMPLOS ---
        if (reply.includes("[ENVIAR_EXEMPLOS]")) {
            console.log(`🎥 Lead (${userId}) pediu exemplos. Enviando mídia de visualização única...`);
            
            const exemplosFolder = path.join(__dirname, 'exemplos');
            if (fs.existsSync(exemplosFolder)) {
                const files = fs.readdirSync(exemplosFolder);
                let sentMedia = false;
                
                await chat.sendStateTyping();
                await sleep(2000);
                await chat.clearState();

                for (const file of files) {
                    if (file.endsWith('.mp4') || file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.jpeg')) {
                        const filePath = path.join(exemplosFolder, file);
                        const media = MessageMedia.fromFilePath(filePath);
                        await client.sendMessage(userId, media, { isViewOnce: true });
                        sentMedia = true;
                        await sleep(1000); // pequeno delay entre os arquivos para não bugar o zap
                    }
                }
                
                if (sentMedia) {
                    const followup = "Esses são alguns exemplos do que a IA consegue fazer! 😎 Ficou mais alguma dúvida?";
                    await sleep(1500);
                    await client.sendMessage(userId, BOT_SIGNATURE + followup);
                    console.log(`🤖 Exemplos enviados para ${userId}`);
                } else {
                    console.log(`⚠️ Nenhuma mídia encontrada na pasta exemplos para enviar.`);
                }
            } else {
                console.log(`⚠️ Pasta exemplos não encontrada!`);
            }
            return; // Termina a função para não enviar o "[ENVIAR_EXEMPLOS]" em texto
        }

        // Se não for pedido de exemplo, segue o fluxo normal de texto
        const delayMs = 2000 + (reply.length * 40);
        console.log(`⏱️ Aguardando ${delayMs}ms para simular digitação humana de IA...`);
        
        await chat.sendStateTyping();
        await sleep(delayMs);
        await chat.clearState();

        await client.sendMessage(userId, BOT_SIGNATURE + reply);
        console.log(`🤖 Resposta de IA enviada para ${userId}`);

    } catch (error) {
        console.error("Erro no processamento:", error);
    }
}

client.on('ready', async () => {
    console.log('✅ O Bot do "Influencer IA" está conectado!');
    console.log('🎧 Escutando novas mensagens em tempo real...');
});

const userTimers = new Map();
const userChains = new Map();

client.on('message', async (message) => {
    const chat = await message.getChat();
    // Marca como lida para não ficar verde se o bot já vai responder
    await chat.sendSeen(); 

    // Ignora grupos e status para não criar timers desnecessários
    if (chat.isGroup || message.isStatus) return;

    const userId = message.from;

    // Se o usuário mandar outra mensagem antes dos 4 segundos, cancela o timer anterior
    if (userTimers.has(userId)) {
        clearTimeout(userTimers.get(userId));
    }

    // Cria um novo timer de 4 segundos
    const timer = setTimeout(async () => {
        userTimers.delete(userId);
        
        // Sequencializa o processamento por usuário para evitar respostas duplicadas
        const previousChain = userChains.get(userId) || Promise.resolve();
        const nextChain = previousChain.then(async () => {
            await processMessage(message, chat);
        }).catch(err => console.error("Erro na fila de processamento:", err));
        
        userChains.set(userId, nextChain);
        
    }, 4000);

    userTimers.set(userId, timer);
});

client.initialize();
