// Dorizz Chess Duel - Realtime Telegram Mini App
// Powered by Chess.js, MQTT over WebSockets, and Web Audio API

(function() {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  // --- Audio Synthesizer (Zero External Assets) ---
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
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.1); // A5
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

  // --- Game State ---
  const chess = new Chess();
  let mySide = 'w'; // 'w', 'b', or 's' (spectator)
  let isFlipped = false;
  let selectedSquare = null;
  let legalMoves = [];
  let lastMove = null;
  let isPassAndPlay = false;

  // Identity
  const tgUser = tg?.initDataUnsafe?.user;
  let myId = tgUser ? String(tgUser.id) : ('guest_' + Math.random().toString(36).substring(2, 7));
  let myName = tgUser ? (tgUser.first_name + (tgUser.last_name ? ' ' + tgUser.last_name : '')) : 'Pemain';

  // Customize default names for Om Do & Tante Tulip
  if (myId === '8247396122' || myName.toLowerCase().includes('rido')) {
    myName = 'Om Do 👑';
    mySide = 'w';
  } else if (myName.toLowerCase().includes('ajeng') || tgUser?.username?.toLowerCase() === 'puspetpus') {
    myName = 'Tante Tulip 🌷';
    mySide = 'b';
    isFlipped = true;
  }

  // Room config from URL param or default
  const urlParams = new URLSearchParams(window.location.search);
  let roomName = urlParams.get('room') || 'dorizz-omdo-tulip';
  if (urlParams.get('side')) {
    mySide = urlParams.get('side');
    isFlipped = (mySide === 'b');
  }

  // DOM Elements
  const boardEl = document.getElementById('board');
  const connDot = document.getElementById('connDot');
  const roomLabel = document.getElementById('roomLabel');
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
  const btnRole = document.getElementById('btnRole');
  const btnEmoteToggle = document.getElementById('btnEmoteToggle');
  const btnNewGame = document.getElementById('btnNewGame');
  const btnSettings = document.getElementById('btnSettings');
  const emoteDrawer = document.getElementById('emoteDrawer');
  const btnCloseDrawer = document.getElementById('btnCloseDrawer');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const btnSaveSettings = document.getElementById('btnSaveSettings');
  const inputRoom = document.getElementById('inputRoom');
  const modeOnline = document.getElementById('modeOnline');
  const modePassPlay = document.getElementById('modePassPlay');
  const pickWhite = document.getElementById('pickWhite');
  const pickBlack = document.getElementById('pickBlack');
  const pickSpectator = document.getElementById('pickSpectator');
  const gameOverModal = document.getElementById('gameOverModal');
  const gameOverTitle = document.getElementById('gameOverTitle');
  const gameOverSubtitle = document.getElementById('gameOverSubtitle');
  const btnPlayAgain = document.getElementById('btnPlayAgain');

  // --- MQTT Client Setup ---
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
        clientId: 'dorizz_' + myId + '_' + Math.random().toString(16).substr(2, 5),
        keepalive: 30,
        reconnectPeriod: 2000
      });

      mqttClient.on('connect', () => {
        connDot.classList.add('connected');
        mqttClient.subscribe(mqttTopic, (err) => {
          if (!err) {
            broadcast({ type: 'presence', senderId: myId, name: myName, side: mySide });
          }
        });
      });

      mqttClient.on('message', (topic, payload) => {
        try {
          const data = JSON.parse(payload.toString());
          if (data.senderId === myId) return; // ignore self
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
      const res = chess.move(data.move);
      if (res) {
        lastMove = { from: res.from, to: res.to };
        const isCapture = !!res.captured;
        playSound(isCapture ? 'capture' : 'move');
        triggerHaptic(isCapture ? 'capture' : 'move');
        renderBoard();
        checkGameStatus();
      }
    } else if (data.type === 'taunt') {
      showToast(data.msg);
      playSound('notify');
      triggerHaptic('move');
    } else if (data.type === 'new_game') {
      chess.reset();
      lastMove = null;
      selectedSquare = null;
      legalMoves = [];
      gameOverModal.classList.add('hidden');
      renderBoard();
      showToast(data.senderName + ' memulai permainan baru!');
      playSound('notify');
    } else if (data.type === 'presence') {
      // Update opponent label if not spectator
      if (data.side !== mySide) {
        topName.innerText = data.name;
        topAvatar.innerText = data.name.includes('Tulip') ? '🌷' : (data.name.includes('Do') ? '👑' : '♟️');
      }
    }
  }

  // --- UI Toast ---
  let toastTimer = null;
  function showToast(msg) {
    quickToast.innerText = msg;
    quickToast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      quickToast.classList.remove('show');
    }, 2400);
  }

  // --- Board Rendering ---
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];

  function renderBoard() {
    boardEl.innerHTML = '';

    const currentFiles = isFlipped ? [...files].reverse() : files;
    const currentRanks = isFlipped ? [...ranks].reverse() : ranks;

    const turn = chess.turn(); // 'w' or 'b'
    const inCheck = chess.in_check();

    // Find King in check square
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

        // Color shading
        const fileNum = files.indexOf(file);
        const rankNum = parseInt(rank) - 1;
        const isLight = (fileNum + rankNum) % 2 !== 0;
        squareEl.classList.add(isLight ? 'light' : 'dark');

        // Highlights
        if (selectedSquare === squareId) {
          squareEl.classList.add('selected');
        }
        if (lastMove && (lastMove.from === squareId || lastMove.to === squareId)) {
          squareEl.classList.add('last-move');
        }
        if (checkSquare === squareId) {
          squareEl.classList.add('check');
        }

        // Piece
        const piece = chess.get(squareId);
        if (piece) {
          const pieceKey = piece.color + piece.type.toUpperCase();
          const pieceEl = document.createElement('div');
          pieceEl.className = 'piece';
          pieceEl.innerHTML = PIECE_SVGS[pieceKey] || '';
          squareEl.appendChild(pieceEl);
        }

        // Move hint
        const legalMove = legalMoves.find(m => m.to === squareId);
        if (legalMove) {
          const hintEl = document.createElement('div');
          hintEl.className = legalMove.captured ? 'hint-capture' : 'hint-dot';
          squareEl.appendChild(hintEl);
        }

        // Coordinates
        if (fIdx === (isFlipped ? 7 : 7)) {
          const rankLabel = document.createElement('span');
          rankLabel.className = 'coord rank';
          rankLabel.innerText = rank;
          squareEl.appendChild(rankLabel);
        }
        if (rIdx === (isFlipped ? 7 : 7)) {
          const fileLabel = document.createElement('span');
          fileLabel.className = 'coord file';
          fileLabel.innerText = file;
          squareEl.appendChild(fileLabel);
        }

        // Click handler
        squareEl.addEventListener('click', () => handleSquareClick(squareId));
        boardEl.appendChild(squareEl);
      });
    });

    updatePlayerCards();
  }

  function handleSquareClick(squareId) {
    if (chess.game_over()) return;

    const currentTurn = chess.turn();

    // Check turn in online mode
    if (!isPassAndPlay && mySide !== 's' && mySide !== currentTurn) {
      showToast('Sekarang giliran lawan!');
      return;
    }

    if (selectedSquare) {
      // Try to execute move
      const move = legalMoves.find(m => m.to === squareId);
      if (move) {
        const moveData = {
          from: selectedSquare,
          to: squareId,
          promotion: 'q' // Auto queen for snappy mobile play
        };
        const executed = chess.move(moveData);
        if (executed) {
          lastMove = { from: executed.from, to: executed.to };
          const isCapture = !!executed.captured;
          playSound(isCapture ? 'capture' : 'move');
          triggerHaptic(isCapture ? 'capture' : 'move');

          broadcast({ type: 'move', move: moveData, fen: chess.fen() });

          selectedSquare = null;
          legalMoves = [];
          renderBoard();
          checkGameStatus();
          return;
        }
      }

      // If clicked another own piece, select that instead
      const clickedPiece = chess.get(squareId);
      if (clickedPiece && (isPassAndPlay || clickedPiece.color === currentTurn)) {
        selectSquare(squareId);
        return;
      }

      // Deselect
      selectedSquare = null;
      legalMoves = [];
      renderBoard();
    } else {
      // Initial selection
      const piece = chess.get(squareId);
      if (!piece) return;
      if (!isPassAndPlay && piece.color !== mySide) {
        return;
      }
      if (piece.color !== currentTurn) {
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
    const isMyTurn = (turn === mySide);

    const bottomSide = isFlipped ? 'b' : 'w';
    const topSide = isFlipped ? 'w' : 'b';

    bottomSideBadge.innerText = bottomSide === 'w' ? '⚪ Putih' : '⚫ Hitam';
    topSideBadge.innerText = topSide === 'w' ? '⚪ Putih' : '⚫ Hitam';

    if (bottomSide === mySide) {
      bottomName.innerText = myName;
      bottomAvatar.innerText = myName.includes('Tulip') ? '🌷' : (myName.includes('Do') ? '👑' : '😎');
    } else {
      bottomName.innerText = 'Lawan';
      bottomAvatar.innerText = '♟️';
    }

    if (topSide === mySide) {
      topName.innerText = myName;
      topAvatar.innerText = myName.includes('Tulip') ? '🌷' : (myName.includes('Do') ? '👑' : '😎');
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

    // Tally captured pieces
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
      const isWinner = (chess.turn() !== mySide);
      playSound('check');
      triggerHaptic('win');

      gameOverTitle.innerText = 'SKAKMAT! 🏆';
      gameOverSubtitle.innerText = winnerColor + ' Keluar Sebagai Juara!';
      gameOverModal.classList.remove('hidden');
    } else if (chess.in_draw()) {
      let reason = 'Remis (Draw)';
      if (chess.in_stalemate()) reason = 'Remis karena Stalemate!';
      else if (chess.in_threefold_repetition()) reason = 'Remis 3x Posisi Berulang!';
      else if (chess.insufficient_material()) reason = 'Remis Kurang Perwira!';

      gameOverTitle.innerText = 'REMIS! 🤝';
      gameOverSubtitle.innerText = reason;
      gameOverModal.classList.remove('hidden');
    } else if (chess.in_check()) {
      playSound('check');
      triggerHaptic('check');
      showToast('🔥 SKAK!');
    }
  }

  // --- Event Listeners ---
  btnFlip.addEventListener('click', () => {
    isFlipped = !isFlipped;
    renderBoard();
  });

  btnRole.addEventListener('click', () => {
    if (mySide === 'w') mySide = 'b';
    else if (mySide === 'b') mySide = 'w';
    isFlipped = (mySide === 'b');
    renderBoard();
    showToast('Kamu sekarang sisi ' + (mySide === 'w' ? 'Putih' : 'Hitam'));
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

  btnNewGame.addEventListener('click', () => {
    if (confirm('Mulai ulang duel catur dari awal?')) {
      chess.reset();
      lastMove = null;
      selectedSquare = null;
      legalMoves = [];
      gameOverModal.classList.add('hidden');
      renderBoard();
      broadcast({ type: 'new_game' });
      showToast('Papan catur direset!');
      playSound('notify');
    }
  });

  btnPlayAgain.addEventListener('click', () => {
    chess.reset();
    lastMove = null;
    selectedSquare = null;
    legalMoves = [];
    gameOverModal.classList.add('hidden');
    renderBoard();
    broadcast({ type: 'new_game' });
  });

  btnSettings.addEventListener('click', () => {
    inputRoom.value = roomName;
    settingsModal.classList.remove('hidden');
  });

  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  modeOnline.addEventListener('click', () => {
    isPassAndPlay = false;
    modeOnline.classList.add('active');
    modePassPlay.classList.remove('active');
  });

  modePassPlay.addEventListener('click', () => {
    isPassAndPlay = true;
    modePassPlay.classList.add('active');
    modeOnline.classList.remove('active');
  });

  pickWhite.addEventListener('click', () => {
    mySide = 'w';
    isFlipped = false;
    pickWhite.classList.add('active');
    pickBlack.classList.remove('active');
    pickSpectator.classList.remove('active');
  });

  pickBlack.addEventListener('click', () => {
    mySide = 'b';
    isFlipped = true;
    pickBlack.classList.add('active');
    pickWhite.classList.remove('active');
    pickSpectator.classList.remove('active');
  });

  pickSpectator.addEventListener('click', () => {
    mySide = 's';
    pickSpectator.classList.add('active');
    pickWhite.classList.remove('active');
    pickBlack.classList.remove('active');
  });

  btnSaveSettings.addEventListener('click', () => {
    const newRoom = inputRoom.value.trim() || 'dorizz-omdo-tulip';
    if (newRoom !== roomName) {
      roomName = newRoom;
      if (mqttClient) {
        mqttClient.end();
      }
      initMQTT();
    }
    settingsModal.classList.add('hidden');
    renderBoard();
  });

  // Start everything!
  renderBoard();
  initMQTT();

})();
