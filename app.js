// Dorizz Chess Duel - Realtime Telegram Mini App
// Powered by Chess.js, MQTT over WebSockets, and Web Audio API

(function() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  // Audio Synthesizer (Web Audio API)
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  function playSound(type) {
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'move') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === 'capture') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
      osc.start(now);
      osc.stop(now + 0.12);
    } else if (type === 'check') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (type === 'notify') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.15);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }

  function triggerHaptic(type) {
    if (!tg?.HapticFeedback) return;
    try {
      if (type === 'move') tg.HapticFeedback.impactOccurred('light');
      else if (type === 'capture') tg.HapticFeedback.impactOccurred('medium');
      else if (type === 'check') tg.HapticFeedback.notificationOccurred('warning');
      else if (type === 'win') tg.HapticFeedback.notificationOccurred('success');
    } catch(e) {}
  }

  // Game Engine & State
  const chess = new Chess();
  let mySide = 'w'; // 'w' = White, 'b' = Black
  let isFlipped = false;
  let selectedSquare = null;
  let legalMoves = [];
  let lastMove = null;
  let isPassAndPlay = false;

  // Identity Resolution
  const tgUser = tg?.initDataUnsafe?.user;
  let myId = tgUser ? String(tgUser.id) : ('guest_' + Math.random().toString(36).substring(2, 7));
  let myName = 'Om Do 👑';

  // Read URL query parameters
  const urlParams = new URLSearchParams(window.location.search);
  const paramPlayer = (urlParams.get('p') || urlParams.get('user') || '').toLowerCase();
  let roomName = urlParams.get('room') || 'dorizz-omdo-tulip';

  if (paramPlayer === 'tulip' || paramPlayer === 'ajeng' || tgUser?.username?.toLowerCase() === 'puspetpus') {
    myName = 'Tante Tulip 🌷';
    mySide = 'b';
    isFlipped = true;
  } else {
    myName = 'Om Do 👑';
    mySide = 'w';
    isFlipped = false;
  }

  // DOM Elements
  const boardEl = document.getElementById('board');
  const connDot = document.getElementById('connDot');
  const roomLabel = document.getElementById('roomLabel');
  const identityBar = document.getElementById('identityBar');
  const chooseOmDo = document.getElementById('chooseOmDo');
  const chooseTulip = document.getElementById('chooseTulip');

  const topName = document.getElementById('topName');
  const topAvatar = document.getElementById('topAvatar');
  const topSideBadge = document.getElementById('topSideBadge');
  const topTurnIndicator = document.getElementById('topTurnIndicator');
  const topCaptured = document.getElementById('topCaptured');

  const bottomName = document.getElementById('bottomName');
  const bottomAvatar = document.getElementById('bottomAvatar');
  const bottomSideBadge = document.getElementById('bottomSideBadge');
  const bottomTurnIndicator = document.getElementById('bottomTurnIndicator');
  const bottomCaptured = document.getElementById('bottomCaptured');

  const topCard = document.getElementById('topPlayerCard');
  const bottomCard = document.getElementById('bottomPlayerCard');
  const quickToast = document.getElementById('quickToast');

  const btnFlip = document.getElementById('btnFlip');
  const btnEmoteToggle = document.getElementById('btnEmoteToggle');
  const btnResign = document.getElementById('btnResign');
  const btnNewGame = document.getElementById('btnNewGame');
  const btnSettings = document.getElementById('btnSettings');
  const emoteDrawer = document.getElementById('emoteDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const inputRoom = document.getElementById('inputRoom');
  const inputCustomFen = document.getElementById('inputCustomFen');
  const modeOnline = document.getElementById('modeOnline');
  const modePassPlay = document.getElementById('modePassPlay');
  const settingsLockedNotice = document.getElementById('settingsLockedNotice');

  const gameOverModal = document.getElementById('gameOverModal');
  const gameOverIcon = document.getElementById('gameOverIcon');
  const gameOverTitle = document.getElementById('gameOverTitle');
  const gameOverSubtitle = document.getElementById('gameOverSubtitle');
  const btnPlayAgain = document.getElementById('btnPlayAgain');

  // WebRTC Voice Communication Elements
  const btnVoiceCall = document.getElementById('btnVoiceCall');
  const voiceLabel = document.getElementById('voiceLabel');
  const voiceWidget = document.getElementById('voiceWidget');
  const voiceStatus = document.getElementById('voiceStatus');
  const btnToggleMic = document.getElementById('btnToggleMic');
  const btnEndCall = document.getElementById('btnEndCall');
  const incomingCallModal = document.getElementById('incomingCallModal');
  const incomingCallAvatar = document.getElementById('incomingCallAvatar');
  const incomingCallerName = document.getElementById('incomingCallerName');
  const btnAcceptCall = document.getElementById('btnAcceptCall');
  const btnRejectCall = document.getElementById('btnRejectCall');
  const remoteAudio = document.getElementById('remoteAudio');

  // WebRTC State
  let localStream = null;
  let peerConnection = null;
  let isCallActive = false;
  let isMicMuted = false;
  let iceCandidatesQueue = [];

  const rtcServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' }
    ]
  };

  // Game Session Persistence & Anti-Cheat
  const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const STORAGE_KEY = 'dorizz_chess_state_' + roomName;

  function isGameActive() {
    return (chess.fen() !== INITIAL_FEN || chess.history().length > 0) && !chess.game_over();
  }

  function saveLocalState() {
    try {
      if (chess.fen() === INITIAL_FEN && chess.history().length === 0) return;
      const state = {
        fen: chess.fen(),
        pgn: chess.pgn(),
        lastMove: lastMove,
        savedAt: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch(e) {}
  }

  function clearLocalState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch(e) {}
  }

  function restoreLocalState() {
    try {
      const fenParam = urlParams.get('fen');
      if (fenParam) {
        try {
          const decoded = decodeURIComponent(fenParam).replace(/_/g, ' ');
          if (chess.load(decoded)) {
            lastMove = null;
            saveLocalState();
            return true;
          }
        } catch (e) {
          console.warn('Invalid URL fen param:', e);
        }
      }

      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data) return false;

      let success = false;
      if (data.pgn) {
        success = chess.load_pgn(data.pgn);
      }
      if (!success && data.fen && data.fen !== INITIAL_FEN) {
        success = chess.load(data.fen);
      }

      if (success) {
        lastMove = data.lastMove || null;
        return true;
      }
    } catch(e) {}
    return false;
  }

  function updateLockState() {
    const active = isGameActive();

    // When duel is active, completely hide role picker bar to prevent changing side
    if (identityBar) {
      identityBar.classList.toggle('hidden', active);
    }

    // Lock mode selection in settings modal
    if (modeOnline && modePassPlay) {
      modeOnline.disabled = active;
      modePassPlay.disabled = active;
      modeOnline.classList.toggle('disabled-btn', active);
      modePassPlay.classList.toggle('disabled-btn', active);
    }

    if (settingsLockedNotice) {
      settingsLockedNotice.classList.toggle('hidden', !active);
    }
  }

  // MQTT Connection
  let mqttClient = null;
  const mqttBroker = 'wss://broker.emqx.io:8084/mqtt';
  const mqttTopic = 'dorizz/chess/v1/' + roomName;

  function initMQTT() {
    if (isPassAndPlay) {
      connDot.classList.add('connected');
      roomLabel.innerText = 'Pass & Play';
      return;
    }

    connDot.classList.remove('connected');
    roomLabel.innerText = 'Room: ' + roomName;

    try {
      mqttClient = mqtt.connect(mqttBroker, {
        clientId: 'dorizz_' + myId + '_' + Math.random().toString(16).substring(2, 7),
        keepalive: 30,
        reconnectPeriod: 2000
      });

      mqttClient.on('connect', () => {
        connDot.classList.add('connected');
        mqttClient.subscribe(mqttTopic, (err) => {
          if (!err) {
            broadcast({ type: 'presence', senderId: myId, name: myName, side: mySide });
            if (isGameActive()) {
              broadcast({
                type: 'sync_response',
                fen: chess.fen(),
                pgn: chess.pgn(),
                lastMove: lastMove
              });
            } else {
              broadcast({ type: 'sync_request' });
            }
          }
        });
      });

      mqttClient.on('message', (topic, payload) => {
        try {
          const data = JSON.parse(payload.toString());
          if (data.senderId === myId) return;
          handleRemoteMessage(data);
        } catch (e) {
          console.error(e);
        }
      });

      mqttClient.on('error', (err) => {
        console.error('MQTT error', err);
        connDot.classList.remove('connected');
      });

      mqttClient.on('close', () => {
        connDot.classList.remove('connected');
      });
    } catch(err) {
      console.error(err);
    }
  }

  function broadcast(data) {
    if (isPassAndPlay || !mqttClient || !mqttClient.connected) return;
    data.senderId = myId;
    data.senderName = myName;
    mqttClient.publish(mqttTopic, JSON.stringify(data));
  }

  function handleRemoteMessage(data) {
    if (data.type === 'move') {
      if (chess.game_over()) return;

      // Reject remote move if side does not match active turn
      if (data.side && data.side !== chess.turn()) {
        console.warn('Move rejected: side does not match active turn');
        return;
      }

      const res = chess.move(data.move);
      if (res) {
        lastMove = { from: res.from, to: res.to };
        const isCapture = !!res.captured;
        playSound(isCapture ? 'capture' : 'move');
        triggerHaptic(isCapture ? 'capture' : 'move');
        saveLocalState();
        renderBoard();
        checkGameStatus();
        updateLockState();
      }
    } else if (data.type === 'resign') {
      clearLocalState();
      const winnerName = (data.loserSide === 'w') ? 'Tante Tulip 🌷' : 'Om Do 👑';
      gameOverIcon.innerText = '🏆';
      gameOverTitle.innerText = data.loserName + ' Menyerah! 🏳️';
      gameOverSubtitle.innerText = winnerName + ' Memenangkan Duel Ini!';
      gameOverModal.classList.remove('hidden');
      playSound('notify');
      triggerHaptic('win');
      updateLockState();
    } else if (data.type === 'taunt') {
      showToast(data.msg);
      playSound('notify');
      triggerHaptic('move');
    } else if (data.type === 'new_game') {
      clearLocalState();
      chess.reset();
      lastMove = null;
      selectedSquare = null;
      legalMoves = [];
      gameOverModal.classList.add('hidden');
      renderBoard();
      updateLockState();
      showToast(data.senderName + ' memulai permainan baru!');
      playSound('notify');
    } else if (data.type === 'presence') {
      if (data.side !== mySide) {
        topName.innerText = data.name;
        topAvatar.innerText = data.name.includes('Tulip') ? '🌷' : '👑';
      }
      if (!data.isAck) {
        broadcast({ type: 'presence', senderId: myId, name: myName, side: mySide, isAck: true });
      }
    } else if (data.type === 'sync_request') {
      if (chess.fen() !== INITIAL_FEN || chess.history().length > 0) {
        broadcast({
          type: 'sync_response',
          fen: chess.fen(),
          pgn: chess.pgn(),
          lastMove: lastMove
        });
      }
    } else if (data.type === 'sync_response') {
      if (data.fen && data.fen !== chess.fen()) {
        let synced = false;
        if (data.pgn) {
          synced = chess.load_pgn(data.pgn);
        }
        if (!synced && data.fen) {
          synced = chess.load(data.fen);
        }
        if (synced) {
          lastMove = data.lastMove || null;
          saveLocalState();
          renderBoard();
          updatePlayerCards();
          updateLockState();
          showToast('Sesi duel tersinkronisasi! ⚡');
        }
      }
    } else if (data.type === 'rtc_invite') {
      handleCallInvite(data);
    } else if (data.type === 'rtc_accept') {
      handleCallAccepted();
    } else if (data.type === 'rtc_reject') {
      showToast((data.senderName || 'Lawan') + ' menolak panggilan suara');
      resetCallUI();
    } else if (data.type === 'rtc_offer') {
      handleRemoteOffer(data);
    } else if (data.type === 'rtc_answer') {
      handleRemoteAnswer(data);
    } else if (data.type === 'rtc_candidate') {
      handleRemoteCandidate(data);
    } else if (data.type === 'rtc_end') {
      showToast('Panggilan suara diakhiri oleh ' + (data.senderName || 'Lawan'));
      resetCallUI();
    }
  }

  // Toast Notification
  let toastTimer = null;
  function showToast(msg) {
    quickToast.innerText = msg;
    quickToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      quickToast.classList.remove('show');
    }, 2400);
  }

  // Board Rendering
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  function renderBoard() {
    boardEl.innerHTML = '';

    const currentFiles = isFlipped ? [...files].reverse() : files;
    const currentRanks = isFlipped ? [...ranks].reverse() : ranks;

    const turn = chess.turn();
    const inCheck = chess.in_check();

    let checkSquare = null;
    if (inCheck) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const sq = files[c] + ranks[r];
          const p = chess.get(sq);
          if (p && p.type === 'k' && p.color === turn) {
            checkSquare = sq;
            break;
          }
        }
      }
    }

    currentRanks.forEach((rank, rIdx) => {
      currentFiles.forEach((file, fIdx) => {
        const squareId = file + rank;
        const squareEl = document.createElement('div');
        squareEl.className = 'square';
        squareEl.dataset.square = squareId;

        const fileNum = files.indexOf(file);
        const rankNum = parseInt(rank) - 1;
        const isLight = (fileNum + rankNum) % 2 !== 0;
        squareEl.classList.add(isLight ? 'light' : 'dark');

        if (selectedSquare === squareId) {
          squareEl.classList.add('selected');
        }
        if (lastMove && (lastMove.from === squareId || lastMove.to === squareId)) {
          squareEl.classList.add('last-move');
        }
        if (checkSquare === squareId) {
          squareEl.classList.add('check');
        }

        const piece = chess.get(squareId);
        if (piece) {
          const pieceKey = piece.color + piece.type.toUpperCase();
          const pieceEl = document.createElement('div');
          pieceEl.className = 'piece';
          pieceEl.innerHTML = PIECE_SVGS[pieceKey] || '';
          squareEl.appendChild(pieceEl);
        }

        const legalMove = legalMoves.find(m => m.to === squareId);
        if (legalMove) {
          const hintEl = document.createElement('div');
          hintEl.className = legalMove.captured ? 'hint-capture' : 'hint-dot';
          squareEl.appendChild(hintEl);
        }

        if (fIdx === 7) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'coord rank';
          rankLabel.innerText = rank;
          squareEl.appendChild(rankLabel);
        }
        if (rIdx === 7) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'coord file';
          fileLabel.innerText = file;
          squareEl.appendChild(fileLabel);
        }

        squareEl.addEventListener('click', () => handleSquareClick(squareId));
        boardEl.appendChild(squareEl);
      });
    });

    updatePlayerCards();
  }

  function handleSquareClick(squareId) {
    if (chess.game_over()) return;

    const currentTurn = chess.turn();

    // Strict Anti-Cheat: Reject click if not player's turn or trying to move opponent piece
    if (!isPassAndPlay && mySide !== currentTurn) {
      showToast('Bukan giliranmu! Menunggu giliran lawan.');
      return;
    }

    if (selectedSquare) {
      const move = legalMoves.find(m => m.to === squareId);
      if (move) {
        const moveData = {
          from: selectedSquare,
          to: squareId,
          promotion: 'q'
        };
        const executed = chess.move(moveData);
        if (executed) {
          lastMove = { from: executed.from, to: executed.to };
          const isCapture = !!executed.captured;
          playSound(isCapture ? 'capture' : 'move');
          triggerHaptic(isCapture ? 'capture' : 'move');

          saveLocalState();
          broadcast({ type: 'move', move: moveData, side: mySide, fen: chess.fen(), pgn: chess.pgn() });

          selectedSquare = null;
          legalMoves = [];
          renderBoard();
          checkGameStatus();
          updateLockState();
          return;
        }
      }

      const clickedPiece = chess.get(squareId);
      if (clickedPiece && (isPassAndPlay || clickedPiece.color === currentTurn)) {
        selectSquare(squareId);
        return;
      }

      selectedSquare = null;
      legalMoves = [];
      renderBoard();
    } else {
      const piece = chess.get(squareId);
      if (!piece) return;
      if (!isPassAndPlay && piece.color !== mySide) {
        showToast('Itu bidak lawan! Bidakmu ' + (mySide === 'w' ? 'Putih ⚪' : 'Hitam ⚫'));
        return;
      }
      if (piece.color !== currentTurn) {
        showToast('Sekarang giliran lawan!');
        return;
      }
      selectSquare(squareId);
    }
  }

  function selectSquare(sq) {
    selectedSquare = sq;
    legalMoves = chess.moves({ square: sq, verbose: true });
    renderBoard();
  }

  function updatePlayerCards() {
    const turn = chess.turn();
    const active = isGameActive();

    const bottomSide = isFlipped ? 'b' : 'w';
    const topSide = isFlipped ? 'w' : 'b';

    const lockBadge = active ? ' 🔒' : '';

    bottomSideBadge.innerText = (bottomSide === 'w' ? '⚪ Putih' : '⚫ Hitam') + lockBadge;
    topSideBadge.innerText = (topSide === 'w' ? '⚪ Putih' : '⚫ Hitam') + lockBadge;

    if (bottomSide === mySide) {
      bottomName.innerText = myName;
      bottomAvatar.innerText = myName.includes('Tulip') ? '🌷' : '👑';
    } else {
      bottomName.innerText = myName.includes('Tulip') ? 'Om Do 👑' : 'Tante Tulip 🌷';
      bottomAvatar.innerText = myName.includes('Tulip') ? '👑' : '🌷';
    }

    if (topSide === mySide) {
      topName.innerText = myName;
      topAvatar.innerText = myName.includes('Tulip') ? '🌷' : '👑';
    } else {
      topName.innerText = myName.includes('Tulip') ? 'Om Do 👑' : 'Tante Tulip 🌷';
      topAvatar.innerText = myName.includes('Tulip') ? '👑' : '🌷';
    }

    if (turn === bottomSide) {
      bottomCard.classList.add('active-turn');
      topCard.classList.remove('active-turn');
      bottomTurnIndicator.innerText = (bottomSide === mySide || isPassAndPlay) ? 'Giliran Kamu 🔥' : 'Giliran Lawan';
      topTurnIndicator.innerText = 'Menunggu...';
    } else {
      topCard.classList.add('active-turn');
      bottomCard.classList.remove('active-turn');
      topTurnIndicator.innerText = 'Sedang Berpikir... ⏳';
      bottomTurnIndicator.innerText = 'Menunggu Lawan';
    }

    updateCapturedPieces();
  }

  function updateCapturedPieces() {
    const history = chess.history({ verbose: true });
    const capturedByWhite = [];
    const capturedByBlack = [];

    history.forEach(m => {
      if (m.captured) {
        if (m.color === 'w') capturedByWhite.push('b' + m.captured.toUpperCase());
        else capturedByBlack.push('w' + m.captured.toUpperCase());
      }
    });

    const bottomSide = isFlipped ? 'b' : 'w';
    const bottomCaps = bottomSide === 'w' ? capturedByWhite : capturedByBlack;
    const topCaps = bottomSide === 'w' ? capturedByBlack : capturedByWhite;

    renderCaps(bottomCaptured, bottomCaps);
    renderCaps(topCaptured, topCaps);
  }

  function renderCaps(container, capsList) {
    container.innerHTML = '';
    capsList.forEach(k => {
      const d = document.createElement('div');
      d.className = 'captured-icon';
      d.innerHTML = PIECE_SVGS[k] || '';
      container.appendChild(d);
    });
  }

  function checkGameStatus() {
    if (chess.in_checkmate()) {
      const winnerColor = chess.turn() === 'w' ? 'Hitam' : 'Putih';
      const winnerName = (winnerColor === 'Putih') ? 'Om Do 👑' : 'Tante Tulip 🌷';
      playSound('check');
      triggerHaptic('win');

      gameOverIcon.innerText = '🏆';
      gameOverTitle.innerText = 'SKAKMAT! 🏆';
      gameOverSubtitle.innerText = winnerName + ' Keluar Sebagai Juara!';
      gameOverModal.classList.remove('hidden');
    } else if (chess.in_draw()) {
      let reason = 'Remis (Draw)';
      if (chess.in_stalemate()) reason = 'Remis karena Stalemate!';
      else if (chess.in_threefold_repetition()) reason = 'Remis 3x Posisi Berulang!';
      else if (chess.insufficient_material()) reason = 'Remis Kurang Perwira!';

      gameOverIcon.innerText = '🤝';
      gameOverTitle.innerText = 'REMIS! 🤝';
      gameOverSubtitle.innerText = reason;
      gameOverModal.classList.remove('hidden');
    } else if (chess.in_check()) {
      playSound('check');
      triggerHaptic('check');
      showToast('🔥 SKAK!');
    }
  }

  // Event Listeners
  btnFlip.addEventListener('click', () => {
    isFlipped = !isFlipped;
    renderBoard();
  });

  // Identity Switcher (Only allowed before match starts)
  chooseOmDo.addEventListener('click', () => {
    if (isGameActive()) {
      showToast('🔒 Pertandingan aktif! Peran sudah dikunci.');
      return;
    }
    myName = 'Om Do 👑';
    mySide = 'w';
    isFlipped = false;
    chooseOmDo.classList.add('active');
    chooseTulip.classList.remove('active');
    renderBoard();
    updateLockState();
    broadcast({ type: 'presence', senderId: myId, name: myName, side: mySide });
    showToast('Masuk sebagai Om Do (Putih ⚪)');
  });

  chooseTulip.addEventListener('click', () => {
    if (isGameActive()) {
      showToast('🔒 Pertandingan aktif! Peran sudah dikunci.');
      return;
    }
    myName = 'Tante Tulip 🌷';
    mySide = 'b';
    isFlipped = true;
    chooseTulip.classList.add('active');
    chooseOmDo.classList.remove('active');
    renderBoard();
    updateLockState();
    broadcast({ type: 'presence', senderId: myId, name: myName, side: mySide });
    showToast('Masuk sebagai Tante Tulip (Hitam ⚫)');
  });

  btnEmoteToggle.addEventListener('click', () => {
    emoteDrawer.classList.toggle('hidden');
  });

  btnCloseDrawer.addEventListener('click', () => {
    emoteDrawer.classList.add('hidden');
  });

  document.querySelectorAll('.emote-btn').forEach(b => {
    b.addEventListener('click', (e) => {
      const msg = e.target.dataset.msg;
      broadcast({ type: 'taunt', msg: msg });
      showToast(msg);
      emoteDrawer.classList.add('hidden');
      playSound('notify');
    });
  });

  btnResign.addEventListener('click', () => {
    if (!isGameActive()) {
      showToast('Pertandingan belum dimulai.');
      return;
    }
    if (confirm('Apakah kamu yakin ingin MENYERAH pada duel ini?')) {
      clearLocalState();
      const winnerName = (mySide === 'w') ? 'Tante Tulip 🌷' : 'Om Do 👑';
      broadcast({ type: 'resign', loserSide: mySide, loserName: myName });
      gameOverIcon.innerText = '🏳️';
      gameOverTitle.innerText = 'Kamu Menyerah! 🏳️';
      gameOverSubtitle.innerText = winnerName + ' Memenangkan Pertandingan!';
      gameOverModal.classList.remove('hidden');
      updateLockState();
    }
  });

  btnNewGame.addEventListener('click', () => {
    const isOngoing = isGameActive();
    const promptText = isOngoing
      ? 'Pertandingan sedang aktif! Jika diulang, kamu dianggap MENYERAH. Lanjutkan?'
      : 'Mulai duel catur baru?';

    if (confirm(promptText)) {
      clearLocalState();
      chess.reset();
      lastMove = null;
      selectedSquare = null;
      legalMoves = [];
      gameOverModal.classList.add('hidden');
      renderBoard();
      updateLockState();
      broadcast({ type: 'new_game' });
      showToast('Papan catur direset untuk ronde baru!');
      playSound('notify');
    }
  });

  btnPlayAgain.addEventListener('click', () => {
    clearLocalState();
    chess.reset();
    lastMove = null;
    selectedSquare = null;
    legalMoves = [];
    gameOverModal.classList.add('hidden');
    renderBoard();
    updateLockState();
    broadcast({ type: 'new_game' });
  });

  btnSettings.addEventListener('click', () => {
    inputRoom.value = roomName;
    updateLockState();
    settingsModal.classList.remove('hidden');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  modeOnline.addEventListener('click', () => {
    if (isGameActive()) {
      showToast('🔒 Mode terkunci saat duel aktif!');
      return;
    }
    isPassAndPlay = false;
    modeOnline.classList.add('active');
    modePassPlay.classList.remove('active');
  });

  modePassPlay.addEventListener('click', () => {
    if (isGameActive()) {
      showToast('🔒 Mode terkunci saat duel aktif!');
      return;
    }
    isPassAndPlay = true;
    modePassPlay.classList.add('active');
    modeOnline.classList.remove('active');
  });

  btnSaveSettings.addEventListener('click', () => {
    const newRoom = inputRoom.value.trim() || 'dorizz-omdo-tulip';
    if (inputCustomFen && inputCustomFen.value.trim()) {
      const fenVal = inputCustomFen.value.trim();
      const loaded = chess.load(fenVal);
      if (loaded) {
        saveLocalState();
        broadcast({ type: 'sync_response', fen: chess.fen(), pgn: chess.pgn() });
        showToast('Posisi papan berhasil dipulihkan! 🎯');
      } else {
        showToast('Format posisi FEN tidak valid!');
      }
      inputCustomFen.value = '';
    }
    if (newRoom !== roomName) {
      roomName = newRoom;
      if (mqttClient) {
        mqttClient.end();
      }
      initMQTT();
    }
    settingsModal.classList.add('hidden');
    renderBoard();
    updateLockState();
  });

  // Sync initial selector button visual state
  if (mySide === 'b') {
    chooseTulip.classList.add('active');
    chooseOmDo.classList.remove('active');
  } else {
    chooseOmDo.classList.add('active');
    chooseTulip.classList.remove('active');
  }

  // WebRTC Voice Call Logic
  async function getAudioStream() {
    if (localStream) return localStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      return localStream;
    } catch (err) {
      console.error('Error accessing microphone:', err);
      showToast('⚠️ Izin mikrofon ditolak atau tidak tersedia di browser');
      return null;
    }
  }

  function createPeerConnection() {
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    peerConnection = new RTCPeerConnection(rtcServers);

    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        broadcast({
          type: 'rtc_candidate',
          candidate: event.candidate
        });
      }
    };

    peerConnection.ontrack = (event) => {
      if (remoteAudio) {
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(e => console.warn('Autoplay prevented:', e));
      }
      isCallActive = true;
      voiceWidget.classList.remove('hidden');
      voiceStatus.innerText = '🟢 Suara Terhubung (' + (mySide === 'w' ? 'Tante Tulip' : 'Om Do') + ')';
      btnVoiceCall.classList.add('in-call');
      voiceLabel.innerText = 'Call Aktif';
      showToast('📞 Suara terhubung! Silakan berbicara');
      playSound('notify');
    };

    peerConnection.onconnectionstatechange = () => {
      if (!peerConnection) return;
      const state = peerConnection.connectionState;
      if (state === 'connected') {
        isCallActive = true;
        voiceStatus.innerText = '🟢 Suara Terhubung';
      } else if (state === 'disconnected' || state === 'failed') {
        voiceStatus.innerText = '⚠️ Koneksi suara terputus';
      } else if (state === 'closed') {
        resetCallUI();
      }
    };

    return peerConnection;
  }

  function resetCallUI() {
    isCallActive = false;
    isMicMuted = false;
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    iceCandidatesQueue = [];

    if (voiceWidget) voiceWidget.classList.add('hidden');
    if (incomingCallModal) incomingCallModal.classList.add('hidden');
    if (btnVoiceCall) {
      btnVoiceCall.classList.remove('in-call');
      voiceLabel.innerText = 'Voice Call';
    }
    if (btnToggleMic) {
      btnToggleMic.innerText = '🎙️';
      btnToggleMic.classList.remove('muted');
    }
    if (remoteAudio) {
      remoteAudio.srcObject = null;
    }
  }

  async function startCall() {
    if (isPassAndPlay) {
      showToast('Voice call hanya aktif di Mode Online');
      return;
    }
    if (isCallActive) {
      showToast('Panggilan suara sedang berlangsung');
      return;
    }

    const stream = await getAudioStream();
    if (!stream) return;

    voiceWidget.classList.remove('hidden');
    voiceStatus.innerText = 'Memanggil lawan...';
    btnVoiceCall.classList.add('in-call');
    voiceLabel.innerText = 'Memanggil...';

    broadcast({
      type: 'rtc_invite',
      callerName: myName,
      callerSide: mySide
    });
    showToast('📞 Memanggil lawan...');
  }

  async function handleCallInvite(data) {
    if (isCallActive) return;
    if (incomingCallerName) {
      incomingCallerName.innerText = data.callerName + ' Mengajak Bicara';
    }
    if (incomingCallAvatar) {
      incomingCallAvatar.innerText = (data.callerName && data.callerName.includes('Tulip')) ? '🌷' : '👑';
    }
    if (incomingCallModal) {
      incomingCallModal.classList.remove('hidden');
    }
    playSound('notify');
    triggerHaptic('win');
  }

  async function acceptCall() {
    if (incomingCallModal) incomingCallModal.classList.add('hidden');
    const stream = await getAudioStream();
    if (!stream) {
      broadcast({ type: 'rtc_reject' });
      return;
    }

    voiceWidget.classList.remove('hidden');
    voiceStatus.innerText = 'Menghubungkan suara...';

    createPeerConnection();
    broadcast({ type: 'rtc_accept' });
  }

  function rejectCall() {
    if (incomingCallModal) incomingCallModal.classList.add('hidden');
    broadcast({ type: 'rtc_reject' });
    showToast('Panggilan ditolak');
  }

  async function handleCallAccepted() {
    voiceStatus.innerText = 'Menegosiasikan koneksi...';
    const pc = createPeerConnection();

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      await pc.setLocalDescription(offer);

      broadcast({
        type: 'rtc_offer',
        sdp: offer
      });
    } catch (err) {
      console.error('Error creating WebRTC offer:', err);
      resetCallUI();
    }
  }

  async function handleRemoteOffer(data) {
    if (!peerConnection) {
      createPeerConnection();
    }

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

      while (iceCandidatesQueue.length > 0) {
        const cand = iceCandidatesQueue.shift();
        await peerConnection.addIceCandidate(cand);
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      broadcast({
        type: 'rtc_answer',
        sdp: answer
      });
    } catch (err) {
      console.error('Error handling remote offer:', err);
    }
  }

  async function handleRemoteAnswer(data) {
    if (!peerConnection) return;
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp));

      while (iceCandidatesQueue.length > 0) {
        const cand = iceCandidatesQueue.shift();
        await peerConnection.addIceCandidate(cand);
      }
    } catch (err) {
      console.error('Error handling remote answer:', err);
    }
  }

  async function handleRemoteCandidate(data) {
    if (!data.candidate) return;
    try {
      const rtcCandidate = new RTCIceCandidate(data.candidate);
      if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        await peerConnection.addIceCandidate(rtcCandidate);
      } else {
        iceCandidatesQueue.push(rtcCandidate);
      }
    } catch (err) {
      console.error('Error adding ICE candidate:', err);
    }
  }

  function endCall(notifyRemote = true) {
    if (notifyRemote) {
      broadcast({ type: 'rtc_end' });
    }
    resetCallUI();
    showToast('Panggilan suara diakhiri');
  }

  function toggleMic() {
    if (!localStream) return;
    isMicMuted = !isMicMuted;
    localStream.getAudioTracks().forEach(track => {
      track.enabled = !isMicMuted;
    });

    btnToggleMic.innerText = isMicMuted ? '🔇' : '🎙️';
    btnToggleMic.classList.toggle('muted', isMicMuted);
    showToast(isMicMuted ? 'Mikrofon di-mute' : 'Mikrofon aktif');
  }

  // Voice Call Button Listeners
  if (btnVoiceCall) btnVoiceCall.addEventListener('click', startCall);
  if (btnAcceptCall) btnAcceptCall.addEventListener('click', acceptCall);
  if (btnRejectCall) btnRejectCall.addEventListener('click', rejectCall);
  if (btnEndCall) btnEndCall.addEventListener('click', () => endCall(true));
  if (btnToggleMic) btnToggleMic.addEventListener('click', toggleMic);

  // Initialization
  const restored = restoreLocalState();
  renderBoard();
  updateLockState();
  initMQTT();
  if (restored) {
    showToast('Sesi duel dipulihkan! 🔄');
  }

})();
