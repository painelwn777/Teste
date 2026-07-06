(function () {
    'use strict';

    // --- ESTADO GLOBAL ---
    const state = {
        etapa: 'inicio',
        nome: '',
        conversa: [],
        progresso: 1,
        arquivosPendentes: [],
        theme: 'auto',
        protocol: '',
        timelineEvents: {},
        lastUpdate: null,
        soundEnabled: true,
        vibrationEnabled: true,
        notificationsEnabled: false,
        isSending: false,
        lastSendTime: 0,
        messageCounter: 0,
        telegramMessageIds: {},
        replyTo: null,
        currentClientId: null,
        clientSessions: {}
    };

    // --- CACHE DE ELEMENTOS DOM (Performance + Segurança) ---
    const dom = {};
    const ids = [
        'chatBody', 'userInput', 'btnSend', 'btnMic', 'btnAttach', 
        'attachMenu', 'fileInput', 'typingIndicator', 'headerStatus', 
        'btnTheme', 'btnStatus', 'btnMenu', 'btnInstall', 'toast', 
        'splash', 'app', 'quickReplies', 'progressFill', 'progressPercent', 
        'timeline', 'statusModal', 'uploadModal', 'replyPreview', 
        'replyToName', 'replyToContent', 'cancelReply', 'botName', 'botPhoto',
        'splashStatus', 'uploadFilename', 'uploadBar', 'uploadStatus', 'uploadPreview',
        'statusCurrent', 'statusLastUpdate', 'statusEta', 'statusProtocol', 'statusClient',
        'closeStatus', 'btnNotify'
    ];

    function cacheDOM() {
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) dom[id] = el;
            else console.warn(`Elemento não encontrado: #${id}`);
        });
    }

    let eventsBound = false;
    let saveTimeout = null;

    // --- INICIALIZAÇÃO BLINDADA ---
    function init() {
        try {
            cacheDOM();
            
            // 1. GARANTIA DE ID ÚNICO PERSISTENTE
            if (!localStorage.getItem('chat_client_id')) {
                const newId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
                localStorage.setItem('chat_client_id', newId);
            }
            state.currentClientId = localStorage.getItem('chat_client_id');

            cleanLocalStorage();
            
            if (document.documentElement) document.documentElement.classList.add('auto');
            if (dom.botName) dom.botName.textContent = window.CONFIG?.botName || 'Pedro';
            if (window.CONFIG?.botPhoto && dom.botPhoto) dom.botPhoto.src = window.CONFIG.botPhoto;

            loadState();
            
            if (!state.protocol) state.protocol = generateProtocol();

            renderAllMessages();
            updateProgressBar(false);
            updateTimeline();
            updateStatusCard();

            if (state.conversa.length === 0) {
                startConversation();
            } else {
                showQuickRepliesForStage();
            }

            if (!eventsBound) {
                bindEvents();
                eventsBound = true;
            }

            applyTheme();
            requestNotificationPermission();
            
            if (dom.splashStatus) setTimeout(() => { dom.splashStatus.textContent = 'Quase lá...'; }, 1500);
            setTimeout(() => {
                if (dom.splash) dom.splash.style.display = 'none';
                if (dom.app) {
                    dom.app.classList.remove('hidden');
                    setTimeout(scrollToBottom, 100);
                }
            }, 2900);

            setupPWA();
            checkForUpdates();
            startTelegramPolling();
        } catch (e) {
            console.error('Erro crítico na inicialização:', e);
            // Fallback para evitar tela branca eterna
            if (dom.splash) dom.splash.style.display = 'none';
            if (dom.app) dom.app.classList.remove('hidden');
        }
    }

    // --- GERENCIAMENTO DE ESTADO (OTIMIZADO COM DEBOUNCE) ---
    function saveState() {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            try {
                const data = {
                    etapa: state.etapa,
                    nome: state.nome,
                    conversa: state.conversa.slice(-50),
                    progresso: state.progresso,
                    arquivosPendentes: state.arquivosPendentes.slice(-5),
                    protocol: state.protocol,
                    timelineEvents: state.timelineEvents,
                    lastUpdate: state.lastUpdate,
                    messageCounter: state.messageCounter,
                    telegramMessageIds: state.telegramMessageIds,
                    currentClientId: state.currentClientId,
                    version: '2.2-fix'
                };
                localStorage.setItem('chat_state', JSON.stringify(data));
                localStorage.setItem('chat_state_backup', JSON.stringify(data));
            } catch (e) {
                console.warn('Erro ao salvar estado:', e);
            }
        }, 500);
    }

    // --- CARREGAMENTO DE ESTADO COM PROTEÇÃO DE ID ---
    function loadState() {
        try {
            let saved = localStorage.getItem('chat_state');
            if (!saved) saved = localStorage.getItem('chat_state_backup');
            if (saved) {
                const data = JSON.parse(saved);
                
                // Só carrega se o ID bater. Se for diferente, ignora o histórico antigo.
                if (data.currentClientId && data.currentClientId === state.currentClientId) {
                    Object.keys(state).forEach(key => {
                        if (data.hasOwnProperty(key)) {
                            state[key] = data[key];
                        }
                    });
                } else {
                    console.log('ID de cliente diferente. Iniciando novo.');
                    state.conversa = [];
                    state.etapa = 'inicio';
                    state.progresso = 1;
                    state.timelineEvents = {};
                    state.arquivosPendentes = [];
                }
            }
        } catch (e) {
            console.warn('Erro ao carregar estado:', e);
            localStorage.removeItem('chat_state');
            localStorage.removeItem('chat_state_backup');
        }
    }

    function cleanLocalStorage() {
        try {
            const chatState = localStorage.getItem('chat_state');
            if (chatState) {
                const data = JSON.parse(chatState);
                if (data.conversa && data.conversa.length > 50) {
                    data.conversa = data.conversa.slice(-50);
                    localStorage.setItem('chat_state', JSON.stringify(data));
                }
            }
        } catch (e) {
            console.warn('Erro na limpeza:', e);
        }
    }

    // --- FUNÇÕES AUXILIARES ---
    function generateProtocol() {
        const d = new Date();
        const rand = Math.floor(Math.random() * 9000) + 1000;
        return `EMP-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${rand}`;
    }

    function nextMessageId() {
        state.messageCounter++;
        return 'msg_' + state.messageCounter + '_' + Date.now();
    }

    function currentTime() {
        const d = new Date();
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    }

    function currentDateTime() {
        const d = new Date();
        return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} • ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes/1024).toFixed(1) + ' KB';
        return (bytes/(1024*1024)).toFixed(1) + ' MB';
    }

    // --- RENDERIZAÇÃO DE MENSAGENS ---
    function renderAllMessages() {
        if (!dom.chatBody) return;
        dom.chatBody.innerHTML = '';
        
        const sep = document.createElement('div');
        sep.className = 'date-separator';
        sep.innerHTML = '<span>🔒 Mensagens criptografadas • HOJE</span>';
        dom.chatBody.appendChild(sep);

        state.conversa.forEach(msg => appendMessageDOM(msg, false));
        scrollToBottom();
    }

    function appendMessageDOM(msg, animate = true) {
        if (!dom.chatBody) return;
        if (document.querySelector(`[data-message-id="${msg.id}"]`)) return;

        const div = document.createElement('div');
        div.className = `message ${msg.type}`;
        div.dataset.messageId = msg.id;
        if (msg.telegramMessageId) div.dataset.telegramId = msg.telegramMessageId;
        if (msg.type === 'received') div.dataset.author = msg.author || 'Pedro';
        if (!animate) div.style.animation = 'none';

        const bubble = document.createElement('div');
        bubble.className = 'bubble';

        if (msg.replyTo) {
            const replyBox = document.createElement('div');
            replyBox.className = 'bubble-reply';
            replyBox.innerHTML = `<div class="bubble-reply-name">↩ ${escapeHtml(msg.replyTo.author || 'Mensagem')}</div><div class="bubble-reply-text">${escapeHtml(msg.replyTo.text || '')}</div>`;
            bubble.appendChild(replyBox);
        }

        const content = document.createElement('div');
        content.className = 'msg-content';
        content.innerHTML = msg.content;
        bubble.appendChild(content);

        const meta = document.createElement('div');
        meta.className = 'bubble-meta';
        const checkClass = msg.check || 'read';
        meta.innerHTML = `<span>${msg.time}</span>${msg.type === 'sent' ? `<span class="check ${checkClass}">✓✓</span>` : ''}`;
        bubble.appendChild(meta);

        div.appendChild(bubble);
        dom.chatBody.appendChild(div);
        
        attachSwipeEvents(div);
        if (animate) scrollToBottom(true);
    }

    function scrollToBottom(smooth = false) {
        if (!dom.chatBody) return;
        requestAnimationFrame(() => {
            dom.chatBody.scrollTo({ top: dom.chatBody.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
        });
    }

    // --- LÓGICA DO CHAT ---
    function addMessage(content, type = 'received', check = 'read', replyTo = null, author = null) {
        const id = nextMessageId();
        const msg = {
            id,
            content,
            type,
            time: currentTime(),
            check,
            author: author || (type === 'received' ? 'Pedro' : (state.nome || 'Você')),
            replyTo: replyTo,
            clientId: state.currentClientId
        };
        state.conversa.push(msg);
        appendMessageDOM(msg, true);
        saveState();

        if (type === 'received') {
            playMessageSound();
            vibrate([50, 30, 50]);
        } else {
            playSendSound();
            vibrate(30);
            setTimeout(() => markAsRead(msg), 1500);
        }
        
        state.lastUpdate = currentDateTime();
        updateStatusCard();
        return msg;
    }

    function markAsRead(msg) {
        const idx = state.conversa.indexOf(msg);
        if (idx > -1) {
            state.conversa[idx].check = 'read';
            const msgEl = document.querySelector(`.message[data-message-id="${msg.id}"] .check`);
            if (msgEl) msgEl.classList.add('read');
            saveState();
        }
    }

    function showTyping() {
        if (dom.typingIndicator) dom.typingIndicator.classList.remove('hidden');
        if (dom.headerStatus) dom.headerStatus.textContent = 'digitando...';
        scrollToBottom();
    }

    function hideTyping() {
        if (dom.typingIndicator) dom.typingIndicator.classList.add('hidden');
        if (dom.headerStatus) dom.headerStatus.textContent = 'online';
    }

    function botReply(content, delay = 1200, replyTo = null) {
        showTyping();
        setTimeout(() => {
            hideTyping();
            addMessage(content, 'received', 'read', replyTo);
        }, delay);
    }

    // --- INTERAÇÃO E SWIPE ---
    function attachSwipeEvents(msgElement) {
        let startX = 0, startY = 0;
        let isSwiping = false;
        let isHorizontal = null;

        msgElement.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isSwiping = false;
            isHorizontal = null;
        }, { passive: true });

        msgElement.addEventListener('touchmove', (e) => {
            const x = e.touches[0].clientX;
            const y = e.touches[0].clientY;
            const dx = x - startX;
            const dy = y - startY;

            if (isHorizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                isHorizontal = Math.abs(dx) > Math.abs(dy);
            }

            if (isHorizontal && dx > 10) {
                isSwiping = true;
                msgElement.classList.add('swiping');
                const translate = Math.min(dx, 120);
                msgElement.style.transform = `translateX(${translate}px)`;
                if (translate > 60) msgElement.classList.add('swiped');
                else msgElement.classList.remove('swiped');
            }
        }, { passive: true });

        msgElement.addEventListener('touchend', (e) => {
            if (!isSwiping) {
                msgElement.classList.remove('swiping', 'swiped');
                msgElement.style.transform = '';
                return;
            }
            const endX = e.changedTouches[0].clientX;
            const dx = endX - startX;
            msgElement.classList.remove('swiping');
            msgElement.style.transform = '';
            if (dx > 80) activateReply(msgElement);
            msgElement.classList.remove('swiped');
        });

        msgElement.addEventListener('dblclick', () => activateReply(msgElement));
    }

    function activateReply(msgElement) {
        const msgId = msgElement.dataset.messageId;
        const telegramId = msgElement.dataset.telegramId;
        const author = msgElement.dataset.author || 'Mensagem';
        const contentEl = msgElement.querySelector('.msg-content');
        const text = contentEl ? contentEl.innerText.trim() : '';

        state.replyTo = {
            id: msgId,
            telegramMessageId: telegramId || null,
            author: author,
            text: text.substring(0, 100)
        };

        if (dom.replyToName) dom.replyToName.textContent = `Respondendo a ${author}`;
        if (dom.replyToContent) dom.replyToContent.textContent = state.replyTo.text;
        if (dom.replyPreview) dom.replyPreview.classList.remove('hidden');
        
        vibrate(30);
        if (dom.userInput) dom.userInput.focus();
    }

    function cancelReplyAction() {
        state.replyTo = null;
        if (dom.replyPreview) dom.replyPreview.classList.add('hidden');
    }

    // --- ÁUDIO E VIBRAÇÃO ---
    let audioCtx = null;
    function getAudioContext() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { return null; }
        }
        return audioCtx;
    }

    function playTone(freq, duration, startTime, type = 'sine', vol = 0.1) {
        const ctx = getAudioContext();
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = type;
        gain.gain.setValueAtTime(0, startTime);
        gain.gain.linearRampToValueAtTime(vol, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        osc.start(startTime); osc.stop(startTime + duration);
    }

    function playMessageSound() {
        if (!state.soundEnabled) return;
        const ctx = getAudioContext();
        if (!ctx) return;
        const now = ctx.currentTime;
        playTone(800, 0.15, now);
        playTone(1000, 0.15, now + 0.12);
    }

    function playSendSound() {
        if (!state.soundEnabled) return;
        const ctx = getAudioContext();
        if (!ctx) return;
        playTone(600, 0.1, ctx.currentTime);
    }

    function vibrate(pattern) {
        if (!state.vibrationEnabled) return;
        if ('vibrate' in navigator) {
            try { navigator.vibrate(pattern); } catch (e) {}
        }
    }

    // --- FLUXO DA CONVERSA ---
    function startConversation() {
        const msg = window.CONFIG.mensagens.pedirNome();
        state.etapa = 'inicio';
        state.progresso = 1;
        botReply(msg, 800);
        saveState();
        updateProgressBar(false);
    }

    function processUserInput(text) {
        const now = Date.now();
        if (now - state.lastSendTime < 500) { showToast('⏳ Aguarde um momento...'); return; }
        if (state.isSending) return;

        state.isSending = true;
        state.lastSendTime = now;

        try {
            const clean = text.trim().toLowerCase();
            const currentReply = state.replyTo;
            
            addMessage(text, 'sent', 'pending', currentReply);
            sendToTelegram(text, currentReply);
            cancelReplyAction();
            
            if (dom.quickReplies) dom.quickReplies.classList.add('hidden');

            handleStageLogic(clean, text);
        } catch (e) {
            console.error('Erro ao processar input:', e);
            botReply('Ops, ocorreu um erro. Tente novamente.', 1000);
        } finally {
            state.isSending = false;
        }
    }

    function handleStageLogic(clean, originalText) {
        if (state.etapa === 'inicio') {
            if (clean.length < 3) {
                botReply('Por favor, informe seu <b>nome completo</b>. 😊', 800);
                return;
            }
            state.nome = originalText.trim();
            state.etapa = 'apresentacao';
            state.progresso = 1;
            markTimelineEvent('cadastro');
            saveState();
            updateProgressBar(false);
            
            setTimeout(() => {
                botReply(window.CONFIG.mensagens.apresentacao(state.nome), 1500);
                showQuickRepliesForStage();
            }, 300);
            return;
        }

        if (state.etapa === 'apresentacao') {
            if (/^(sim|ok|interesse|quero|pode|claro|yes)$/i.test(clean)) {
                state.etapa = 'prova_social';
                state.progresso = 2;
                saveState(); 
                updateProgressBar(false);
                
                setTimeout(() => {
                    botReply(window.CONFIG.mensagens.provaSocial(), 1500);
                    setTimeout(() => {
                        state.etapa = 'documentos';
                        saveState();
                        botReply(window.CONFIG.mensagens.documentos(state.nome), 2000);
                        showQuickRepliesForStage();
                    }, 3500);
                }, 300);
            } else if (/n[aã]o|desisto|sair|cancelar/i.test(clean)) {
                state.etapa = 'fim';
                saveState();
                setTimeout(() => botReply(window.CONFIG.mensagens.semInteresse(state.nome), 1500), 300);
            } else {
                setTimeout(() => botReply(window.CONFIG.mensagens.padrao(state.nome), 1000), 300);
            }
            return;
        }

        if (state.etapa === 'prova_social') {
            return;
        }

        if (state.etapa === 'documentos') {
            if (/^(enviado|feito|pronto|ok|conclu[ií]do)$/i.test(clean)) {
                if (state.arquivosPendentes.length === 0) {
                    botReply('📎 Envie os documentos solicitados antes de continuar. Use o botão 📎.', 1000);
                    return;
                }
                markTimelineEvent('documentos');
                state.etapa = 'checkout';
                state.progresso = 3;
                saveState(); 
                updateProgressBar(false);
                
                setTimeout(() => {
                    markTimelineEvent('analise');
                    botReply(window.CONFIG.mensagens.checkoutLink(state.nome), 2000);
                    showQuickRepliesForStage();
                }, 800);
            } else {
                botReply('📨 Recebi sua mensagem. Continue enviando os documentos e digite <b>ENVIADO</b> quando concluir.', 1000);
            }
            return;
        }

        if (state.etapa === 'checkout') {
            state.etapa = 'aguardando_comprovante';
            state.progresso = 4;
            markTimelineEvent('pagamento');
            saveState(); 
            updateProgressBar(false);
            
            botReply('✅ Recebemos seu comprovante! Nossa equipe está analisando. A liberação ocorrerá entre <b>15 minutos e 24 horas</b>. Você será notificado em breve. 🔔', 1500);
            sendNotification('✅ Pagamento confirmado', 'Seu comprovante foi recebido. Aguarde a liberação.');
            
            setTimeout(() => {
                markTimelineEvent('liberacao');
                botReply(`🎉 <b>${state.nome}</b>, seu empréstimo foi <b>APROVADO</b> e o valor será transferido em breve para a chave Pix informada!<br><br>📋 Protocolo: <b>${state.protocol}</b>`, 2000);
                sendNotification('🎉 Empréstimo aprovado!', 'Seu valor será transferido em instantes.');
            }, 10000);
            return;
        }

        if (state.etapa === 'fim') {
            botReply('🙏 Obrigado pelo contato! Tenha um excelente dia.', 1000);
            return;
        }

        botReply(window.CONFIG.mensagens.padrao(state.nome || 'amigo'), 1000);
    }

    // --- CORREÇÃO DAS RESPOSTAS RÁPIDAS ---
    function showQuickRepliesForStage() {
        const replies = {
            'apresentacao': ['Sim, tenho interesse', 'Não tenho interesse'],
            'documentos': ['Enviado', 'Preciso de ajuda'],
            'checkout': ['Já paguei', 'Enviar comprovante']
        };
        const options = replies[state.etapa];
        
        if (!dom.quickReplies) return;

        if (!options || options.length === 0) {
            dom.quickReplies.classList.add('hidden');
            dom.quickReplies.innerHTML = '';
            return;
        }

        dom.quickReplies.innerHTML = '';
        options.forEach(text => {
            const btn = document.createElement('button');
            btn.className = 'quick-reply';
            btn.textContent = text;
            
            // Correção: Chama diretamente o processamento ao invés de simular clique
            btn.addEventListener('click', () => {
                if (dom.userInput) dom.userInput.value = text;
                processUserInput(text);
            });
            
            dom.quickReplies.appendChild(btn);
        });
        dom.quickReplies.classList.remove('hidden');
    }

    // --- UI UPDATES ---
    function updateProgressBar(shouldSave = true) {
        const map = {
            'inicio': 1, 'apresentacao': 1,
            'prova_social': 2, 'documentos': 2,
            'checkout': 3,
            'aguardando_comprovante': 4,
            'fim': 4
        };
        const step = map[state.etapa] || 1;
        state.progresso = step;
        const percent = Math.min(100, Math.round((step / 4) * 100));

        if (dom.progressFill) dom.progressFill.style.width = percent + '%';
        if (dom.progressPercent) dom.progressPercent.textContent = percent + '%';

        document.querySelectorAll('.progress-step').forEach(el => {
            const s = parseInt(el.dataset.step);
            el.classList.remove('active', 'completed');
            if (s < step) el.classList.add('completed');
            else if (s === step) el.classList.add('active');
        });

        document.querySelectorAll('.progress-line').forEach((line, i) => {
            if (i + 1 < step) line.classList.add('filled');
            else line.classList.remove('filled');
        });

        if (shouldSave) saveState();
    }

    function markTimelineEvent(event) {
        state.timelineEvents[event] = currentDateTime();
        state.lastUpdate = currentDateTime();
        updateTimeline();
        updateStatusCard();
        saveState();
    }

    function updateTimeline() {
        const events = ['cadastro', 'documentos', 'analise', 'pagamento', 'liberacao'];
        const items = document.querySelectorAll('.timeline-item');
        
        items.forEach((item, i) => {
            const ev = events[i];
            const isCompleted = !!state.timelineEvents[ev];
            if (isCompleted !== item.classList.contains('completed')) {
                item.classList.toggle('completed', isCompleted);
                if (isCompleted) {
                    const timeEl = item.querySelector('.timeline-time');
                    if (timeEl) timeEl.textContent = state.timelineEvents[ev];
                }
            }
        });

        const nextEvent = events.find(ev => !state.timelineEvents[ev]);
        if (nextEvent) {
            const activeItem = document.querySelector(`.timeline-item[data-event="${nextEvent}"]`);
            if (activeItem && !activeItem.classList.contains('active')) {
                activeItem.classList.add('active');
            }
        }
    }

    function updateStatusCard() {
        const statusMap = {
            'inicio': ' Coletando dados',
            'apresentacao': '👋 Apresentação enviada',
            'prova_social': ' Mostrando comprovantes',
            'documentos': ' Aguardando documentos',
            'checkout': '💳 Aguardando pagamento',
            'aguardando_comprovante': '🔍 Em análise',
            'fim': '✅ Finalizado'
        };
        const etaMap = { 1: '~1 minuto', 2: '~3 minutos', 3: '~5 minutos', 4: '~24 horas' };

        if (dom.statusCurrent) dom.statusCurrent.textContent = statusMap[state.etapa] || 'Iniciando';
        if (dom.statusLastUpdate) dom.statusLastUpdate.textContent = state.lastUpdate || '—';
        if (dom.statusEta) dom.statusEta.textContent = etaMap[state.progresso] || '—';
        if (dom.statusProtocol) dom.statusProtocol.textContent = state.protocol;
        if (dom.statusClient) dom.statusClient.textContent = state.nome || 'Aguardando...';
    }

    // --- UPLOAD E ARQUIVOS ---
    function handleFile(file) {
        if (!file) return;
        
        if (file.size > 10 * 1024 * 1024) {
            showToast('❌ Arquivo muito grande (Máx 10MB)');
            return;
        }

        if (dom.uploadFilename) dom.uploadFilename.textContent = file.name;
        if (dom.uploadBar) dom.uploadBar.style.width = '0%';
        if (dom.uploadStatus) dom.uploadStatus.textContent = 'Preparando...';
        
        const preview = dom.uploadPreview;
        if (preview) preview.innerHTML = '<div class="file-icon">📎</div>';
        if (dom.uploadModal) dom.uploadModal.classList.remove('hidden');

        const isImage = file.type.startsWith('image/');
        if (isImage) {
            if (dom.uploadStatus) dom.uploadStatus.textContent = 'Comprimindo imagem...';
            compressImage(file, 0.7, 1280)
                .then(blob => processCompressedFile(blob, file.name, file.type, true))
                .catch(err => {
                    console.error('Erro compressão:', err);
                    processCompressedFile(file, file.name, file.type, false);
                });
        } else {
            processCompressedFile(file, file.name, file.type, false);
        }
    }

    function processCompressedFile(fileOrBlob, originalName, originalType, compressed) {
        const reader = new FileReader();
        let progress = 0;
        let progressInterval;

        const cleanup = () => {
            if (progressInterval) clearInterval(progressInterval);
        };

        try {
            progressInterval = setInterval(() => {
                progress += Math.random() * 15;
                if (progress > 90) progress = 90;
                if (dom.uploadBar) dom.uploadBar.style.width = progress + '%';
                if (dom.uploadStatus) dom.uploadStatus.textContent = `Enviando... ${Math.round(progress)}%`;
            }, 150);

            reader.onload = (e) => {
                cleanup();
                const dataUrl = e.target.result;
                const isImage = originalType.startsWith('image/');
                const isVideo = originalType.startsWith('video/');
                
                if (dom.uploadPreview) {
                    if (isImage) dom.uploadPreview.innerHTML = `<img src="${dataUrl}" alt="preview">`;
                    else if (isVideo) dom.uploadPreview.innerHTML = `<video src="${dataUrl}" controls></video>`;
                    else dom.uploadPreview.innerHTML = '<div class="file-icon"></div>';
                }

                if (dom.uploadBar) dom.uploadBar.style.width = '100%';
                if (dom.uploadStatus) dom.uploadStatus.textContent = compressed ? '✅ Imagem comprimida e enviada!' : '✅ Enviado com sucesso!';

                let previewHtml = '';
                if (isImage) previewHtml = `<img src="${dataUrl}" alt="${originalName}">`;
                else if (isVideo) previewHtml = `<video src="${dataUrl}" controls style="max-width:100%; border-radius:8px; margin:6px 0;"></video>`;
                else previewHtml = `📎 <b>${originalName}</b><br><small>${formatSize(fileOrBlob.size)}</small>`;

                setTimeout(() => {
                    addMessage(previewHtml, 'sent');
                    state.arquivosPendentes.push({
                        name: originalName,
                        size: fileOrBlob.size,
                        type: originalType,
                        data: dataUrl
                    });
                    saveState();
                    sendFileToTelegram(fileOrBlob, originalName);
                    if (dom.uploadModal) dom.uploadModal.classList.add('hidden');
                    
                    if (dataUrl.startsWith('blob:')) URL.revokeObjectURL(dataUrl);
                }, 600);
            };

            reader.onerror = () => {
                cleanup();
                showToast('❌ Erro ao ler arquivo');
                if (dom.uploadModal) dom.uploadModal.classList.add('hidden');
            };

            reader.readAsDataURL(fileOrBlob);
        } catch (e) {
            cleanup();
            console.error('Erro processamento:', e);
            showToast('❌ Erro no processamento');
        }
    }

    function compressImage(file, quality, maxWidth) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            
            img.onload = () => {
                URL.revokeObjectURL(url);
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                canvas.toBlob(
                    blob => {
                        if (blob) resolve(blob);
                        else reject(new Error('Falha na compressão'));
                    },
                    file.type || 'image/jpeg',
                    quality
                );
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Erro ao carregar imagem'));
            };
            img.src = url;
        });
    }

    // --- TELEGRAM INTEGRATION ---
    async function sendToTelegram(text, replyTo = null) {
        const cfg = window.CONFIG;
        if (!cfg.telegramToken || !cfg.telegramChatId) return;

        const payload = {
            chat_id: cfg.telegramChatId,
            text: `📨 ${text.replace(/<[^>]+>/g, '')}\n📋 Protocolo: ${state.protocol}\n Cliente: ${state.nome || 'N/I'}\n🆔 ID: ${state.currentClientId}`,
            parse_mode: 'HTML'
        };

        if (replyTo && replyTo.telegramMessageId) {
            payload.reply_to_message_id = parseInt(replyTo.telegramMessageId);
            payload.allow_sending_without_reply = true;
        }

        try {
            const res = await fetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.ok && data.result) {
                const lastMsg = state.conversa[state.conversa.length - 1];
                if (lastMsg && lastMsg.type === 'sent') {
                    lastMsg.telegramMessageId = data.result.message_id;
                    state.telegramMessageIds[lastMsg.id] = data.result.message_id;
                    saveState();
                }
            }
        } catch (e) {
            console.warn('Erro Telegram:', e);
        }
    }

    async function sendFileToTelegram(fileOrBlob, fileName) {
        const cfg = window.CONFIG;
        if (!cfg.telegramToken || !cfg.telegramChatId) return;

        try {
            const formData = new FormData();
            formData.append('chat_id', cfg.telegramChatId);
            formData.append('document', fileOrBlob, fileName);
            formData.append('caption', `📎 Arquivo de ${state.nome || 'cliente'}: ${fileName}\n📋 ${state.protocol}\n🆔 ID: ${state.currentClientId}`);

            const res = await fetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendDocument`, {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.ok && data.result) {
                const lastMsg = state.conversa[state.conversa.length - 1];
                if (lastMsg) {
                    lastMsg.telegramMessageId = data.result.message_id;
                    state.telegramMessageIds[lastMsg.id] = data.result.message_id;
                    saveState();
                }
            }
        } catch (e) {
            console.warn('Erro envio arquivo Telegram:', e);
        }
    }

    // --- POLLING TELEGRAM COM FILTRO RÍGIDO ---
    let lastUpdateId = 0;
    let pollingErrorCount = 0;
    let pollingInterval = null;

    async function pollTelegram() {
        const cfg = window.CONFIG;
        if (!cfg.telegramToken) return;

        try {
            const res = await fetch(`https://api.telegram.org/bot${cfg.telegramToken}/getUpdates?offset=${lastUpdateId + 1}&timeout=1`);
            if (!res.ok) {
                pollingErrorCount++;
                if (pollingErrorCount > 10) {
                    console.warn('Muitos erros de polling, pausando...');
                    stopTelegramPolling();
                    setTimeout(startTelegramPolling, 30000);
                }
                return;
            }
            
            const data = await res.json();
            if (!data.ok || !data.result) return;
            
            pollingErrorCount = 0;
            
            for (const update of data.result) {
                lastUpdateId = Math.max(lastUpdateId, update.update_id);
                const msg = update.message;
                
                // Filtro 1: Chat ID correto
                if (!msg || msg.chat.id.toString() !== cfg.telegramChatId.toString()) continue;
                // Filtro 2: Não é bot
                if (msg.from && msg.from.is_bot) continue;

                const text = msg.text || msg.caption || '';
                
                // Filtro 3: EXTRAÇÃO RÍGIDA DO CLIENT ID
                const clientIdMatch = text.match(/ID: (client_\d+_[a-z0-9]+)/);
                const messageClientId = clientIdMatch ? clientIdMatch[1] : null;

                // REGRA DE OURO: Se não tem ID ou o ID é diferente do meu, IGNORA TOTALMENTE
                if (!messageClientId || messageClientId !== state.currentClientId) {
                    continue; 
                }

                const replyTo = msg.reply_to_message ? {
                    id: 'tg_' + msg.reply_to_message.message_id,
                    author: 'Você',
                    text: (msg.reply_to_message.text || msg.reply_to_message.caption || '').substring(0, 100),
                    telegramMessageId: msg.reply_to_message.message_id
                } : null;

                const telegramMsgId = msg.message_id;
                
                // Filtro 4: Evitar duplicatas visuais
                const jaExiste = state.conversa.some(m => m.telegramMessageId === telegramMsgId);
                if (jaExiste) continue;

                // Adiciona apenas se passou por todos os filtros
                addMessage(escapeHtml(text), 'received', 'read', replyTo, 'Operador');
                
                const lastMsg = state.conversa[state.conversa.length - 1];
                if (lastMsg) {
                    lastMsg.telegramMessageId = telegramMsgId;
                    state.telegramMessageIds[lastMsg.id] = telegramMsgId;
                    saveState();
                }
            }
        } catch (e) {
            pollingErrorCount++;
            console.warn('Erro no polling:', e);
        }
    }

    function startTelegramPolling() {
        if (pollingInterval) return;
        pollingInterval = setInterval(pollTelegram, 3000);
        pollTelegram();
    }

    function stopTelegramPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    // --- NOTIFICAÇÕES E TEMA ---
    function requestNotificationPermission() {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'granted') state.notificationsEnabled = true;
    }

    function sendNotification(title, body) {
        if (!state.notificationsEnabled || Notification.permission !== 'granted') return;
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
        
        try {
            const n = new Notification(title, {
                body,
                icon: 'imagens/icon-192.png',
                badge: 'imagens/icon-192.png',
                tag: 'emprestimo-' + Date.now(),
                vibrate: [200, 100, 200]
            });
            setTimeout(() => n.close(), 6000);
        } catch (e) {
            console.warn('Erro notificação:', e);
        }
    }

    function applyTheme() {
        const saved = localStorage.getItem('theme') || 'auto';
        state.theme = saved;
        
        document.documentElement.classList.remove('auto');
        if (saved === 'dark') {
            document.body.classList.add('dark');
        } else if (saved === 'light') {
            document.body.classList.remove('dark');
        } else {
            document.documentElement.classList.add('auto');
            document.body.classList.remove('dark');
        }
    }

    function toggleTheme() {
        const cycle = { 'auto': 'light', 'light': 'dark', 'dark': 'auto' };
        const next = cycle[state.theme] || 'auto';
        state.theme = next;
        localStorage.setItem('theme', next);
        applyTheme();
        const labels = { auto: '🌗 Automático', light: '☀️ Claro', dark: ' Escuro' };
        showToast(labels[next]);
    }

    function showToast(msg) {
        if (!dom.toast) return;
        dom.toast.textContent = msg;
        dom.toast.classList.add('show');
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => dom.toast.classList.remove('show'), 2500);
    }

    // --- PWA SETUP ---
    let deferredPrompt = null;
    function setupPWA() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js')
                .then(reg => {
                    console.log('✅ SW registrado');
                    reg.addEventListener('updatefound', () => {
                        const nw = reg.installing;
                        nw.addEventListener('statechange', () => {
                            if (nw.state === 'activated') {
                                showToast('🆕 Nova versão disponível! Recarregue.');
                                sendNotification(' Atualização disponível', 'Uma nova versão do app foi instalada.');
                            }
                        });
                    });
                })
                .catch(err => console.warn('SW erro:', err));
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            if (!localStorage.getItem('pwa_installed') && dom.btnInstall) {
                dom.btnInstall.classList.remove('hidden');
            }
        });

        if (dom.btnInstall) {
            dom.btnInstall.addEventListener('click', async () => {
                if (!deferredPrompt) {
                    showToast('Use o menu do navegador para instalar');
                    return;
                }
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') {
                    localStorage.setItem('pwa_installed', '1');
                    showToast('✅ Aplicativo instalado!');
                }
                deferredPrompt = null;
                dom.btnInstall.classList.add('hidden');
            });
        }

        window.addEventListener('appinstalled', () => {
            localStorage.setItem('pwa_installed', '1');
            if (dom.btnInstall) dom.btnInstall.classList.add('hidden');
        });
    }

    function checkForUpdates() {
        setInterval(() => {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.getRegistration().then(reg => {
                    if (reg) reg.update();
                });
            }
        }, 5 * 60 * 1000);
    }

    // --- EVENT BINDING ---
    function bindEvents() {
        if (dom.btnSend) {
            dom.btnSend.addEventListener('click', () => {
                const text = dom.userInput ? dom.userInput.value.trim() : '';
                if (!text) return;
                if (dom.userInput) dom.userInput.value = '';
                if (dom.userInput) dom.userInput.focus();
                toggleSendMic();
                processUserInput(text);
            });
        }

        if (dom.userInput) {
            dom.userInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (dom.btnSend) dom.btnSend.click();
                }
            });
            dom.userInput.addEventListener('input', toggleSendMic);
        }

        if (dom.cancelReply) {
            dom.cancelReply.addEventListener('click', cancelReplyAction);
        }

        if (dom.btnAttach) {
            dom.btnAttach.addEventListener('click', (e) => {
                e.stopPropagation();
                if (dom.attachMenu) dom.attachMenu.classList.toggle('hidden');
            });
        }

        document.addEventListener('click', (e) => {
            if (dom.attachMenu && !dom.attachMenu.contains(e.target) && e.target !== dom.btnAttach) {
                dom.attachMenu.classList.add('hidden');
            }
        });

        document.querySelectorAll('.attach-item').forEach(item => {
            item.addEventListener('click', () => {
                const type = item.dataset.type;
                if (dom.attachMenu) dom.attachMenu.classList.add('hidden');
                
                if (!dom.fileInput) return;

                switch (type) {
                    case 'image': dom.fileInput.accept = 'image/'; dom.fileInput.click(); break;
                    case 'video': dom.fileInput.accept = 'video/'; dom.fileInput.click(); break;
                    case 'document': dom.fileInput.accept = '.pdf,.doc,.docx,.txt'; dom.fileInput.click(); break;
                    case 'camera':
                        dom.fileInput.accept = 'image/';
                        dom.fileInput.setAttribute('capture', 'environment');
                        dom.fileInput.click();
                        dom.fileInput.removeAttribute('capture');
                        break;
                    case 'audio': dom.fileInput.accept = 'audio/'; dom.fileInput.click(); break;
                    case 'location': sendLocation(); break;
                    case 'contact': sendContact(); break;
                    case 'other': dom.fileInput.accept = '.apk,.zip,.rar'; dom.fileInput.click(); break;
                }
            });
        });

        if (dom.fileInput) {
            dom.fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) handleFile(file);
                dom.fileInput.value = '';
            });
        }

        if (dom.btnTheme) dom.btnTheme.addEventListener('click', toggleTheme);
        
        if (dom.btnStatus) {
            dom.btnStatus.addEventListener('click', () => {
                updateStatusCard();
                if (dom.statusModal) dom.statusModal.classList.remove('hidden');
            });
        }

        if (dom.closeStatus) {
            dom.closeStatus.addEventListener('click', () => {
                if (dom.statusModal) dom.statusModal.classList.add('hidden');
            });
        }

        if (dom.statusModal) {
            dom.statusModal.addEventListener('click', (e) => {
                if (e.target === dom.statusModal) dom.statusModal.classList.add('hidden');
            });
        }

        if (dom.btnNotify) {
            dom.btnNotify.addEventListener('click', async () => {
                if (!('Notification' in window)) {
                    showToast('❌ Navegador não suporta notificações');
                    return;
                }
                const perm = await Notification.requestPermission();
                if (perm === 'granted') {
                    state.notificationsEnabled = true;
                    showToast(' Notificações ativadas!');
                    sendNotification('🔔 Notificações ativadas', 'Você será avisado sobre cada etapa do atendimento.');
                } else {
                    showToast('🔕 Notificações bloqueadas');
                }
            });
        }

        if (dom.btnMenu) {
            dom.btnMenu.addEventListener('click', () => {
                if (dom.timeline) dom.timeline.classList.toggle('expanded');
            });
        }

        const resumeAudio = () => {
            const ctx = getAudioContext();
            if (ctx && ctx.state === 'suspended') ctx.resume();
        };
        document.body.addEventListener('touchstart', resumeAudio, { once: true });
        document.body.addEventListener('click', resumeAudio, { once: true });
    }

    function toggleSendMic() {
        if (!dom.userInput || !dom.btnSend || !dom.btnMic) return;
        if (dom.userInput.value.trim()) {
            dom.btnSend.classList.remove('hidden');
            dom.btnMic.classList.add('hidden');
        } else {
            dom.btnSend.classList.add('hidden');
            dom.btnMic.classList.remove('hidden');
        }
    }

    function sendLocation() {
        if (!navigator.geolocation) {
            showToast('❌ Geolocalização não suportada');
            return;
        }
        showToast('📍 Obtendo localização...');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                const msg = `<b>Minha localização</b><br><a href="https://maps.google.com/?q=${latitude},${longitude}" target="_blank" style="color:var(--wa-green);">Ver no mapa</a><br><small>${latitude.toFixed(5)}, ${longitude.toFixed(5)}</small>`;
                addMessage(msg, 'sent');
                sendToTelegram(` Localização: ${latitude}, ${longitude}`);
            },
            () => showToast('❌ Não foi possível obter localização'),
            { timeout: 10000 }
        );
    }

    function sendContact() {
        const msg = ` <b>Meu contato</b><br>${state.nome || 'Cliente'}<br><small>Compartilhado via app</small>`;
        addMessage(msg, 'sent');
        sendToTelegram(`👤 Contato: ${state.nome}`);
    }

    // Start
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

})();