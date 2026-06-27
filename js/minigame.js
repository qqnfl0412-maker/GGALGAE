/* ============================================================
   minigame.js  –  사다리타기 & 핀볼 (Plinko) mini-games

   Public API: window.openMiniGame(gameType, players, onResult)
     gameType : 'ladder' | 'plinko'
     players  : string[]
     onResult : (orderedPlayers: string[] | null) => void
   ============================================================ */

(function () {
  /* ── module state ── */
  let _onResult = null;
  let _orderedPlayers = null;
  let _animFrame = null;
  let _gameType = null;
  let _L = null;   // ladder state
  let _P = null;   // plinko state

  const COLORS = [
    '#4f8ef7', '#e85d4a', '#43b97f', '#f7a735',
    '#a47fff', '#30bcd9', '#e97fc4', '#8bc34a',
    '#ff7043', '#26c6da', '#ab47bc', '#66bb6a'
  ];

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.openMiniGame = function (gameType, players, onResult) {
    if (!players || players.length < 2) return;
    _onResult  = onResult;
    _orderedPlayers = null;
    _gameType  = gameType;

    const modal    = document.getElementById('miniGameModal');
    const title    = document.getElementById('miniGameTitle');
    const startBtn = document.getElementById('miniGameStartBtn');
    const canvas   = document.getElementById('miniGameCanvas');
    const result   = document.getElementById('miniGameResultPanel');
    const actions  = document.getElementById('miniGameActions');
    const topSlots = document.getElementById('ladderTopSlots');
    const botSlots = document.getElementById('ladderBottomSlots');

    if (!modal || !canvas) return;

    title.textContent = gameType === 'ladder' ? '사다리타기' : '핀볼';
    result.innerHTML  = '';
    result.style.display = 'none';
    actions.style.display = 'none';
    window._closeLadderPicker();
    modal.classList.remove('hidden');

    const courseBtn = document.getElementById('miniGameCourseBtn');

    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
    _L = null; _P = null;

    requestAnimationFrame(() => {
      const inner = modal.querySelector('.minigame-modal-content');
      const w = inner.clientWidth;

      if (gameType === 'ladder') {
        canvas.width  = w;
        canvas.height = Math.round(Math.min(window.innerHeight * 0.58, 430));
        const laneNums = document.getElementById('ladderLaneNumbers');
        if (laneNums) laneNums.style.display = 'flex';
        topSlots.style.display = 'flex';
        botSlots.style.display = 'flex';
        if (startBtn)  { startBtn.style.display = 'inline-block'; startBtn.disabled = false; startBtn.textContent = '시작'; }
        if (courseBtn) courseBtn.style.display = 'none';
        _initLadder(canvas, players, (ordered) => {
          _orderedPlayers = ordered;
          _renderResult(players, ordered);
          actions.style.display = 'flex';
        });
      } else {
        canvas.width  = w;
        canvas.height = Math.round(Math.min(window.innerHeight * 0.60, 420));
        topSlots.style.display = 'none';
        botSlots.style.display = 'none';
        if (startBtn)  { startBtn.style.display = 'inline-block'; startBtn.disabled = false; }
        if (courseBtn) { courseBtn.style.display = 'inline-block'; courseBtn.textContent = '코스 1'; }
        _initPlinko(canvas, players, (ordered) => {
          _orderedPlayers = ordered;
          _renderResult(players, ordered);
          actions.style.display = 'flex';
        });
      }
    });
  };

  window._startMiniGame = function () {
    if (_gameType === 'ladder' && _L && _L.phase !== 'done') {
      _startLadderAnim();
    } else if (_gameType === 'plinko' && _P && _P.phase === 'setup') {
      _startPlinkoRace();
    }
  };

  window._changePlinkoCourse = function () {
    if (!_P || _P.phase !== 'setup') return;
    _P.courseIdx = (_P.courseIdx + 1) % _COURSES.length;
    _P.resolved  = _resolveCourse(_COURSES[_P.courseIdx], _P.W);
    const courseBtn = document.getElementById('miniGameCourseBtn');
    if (courseBtn) courseBtn.textContent = `코스 ${_P.courseIdx + 1}`;
    _drawPlinkoSetup();
  };

  window._confirmMiniGame = function () {
    const cb = _onResult, ordered = _orderedPlayers;
    _closeModal();
    if (cb && ordered) cb(ordered);
  };

  window._cancelMiniGame = function () {
    const cb = _onResult;
    _closeModal();
    if (cb) cb(null);
  };

  window._closeMiniGame = function () {
    const cb = _onResult;
    _closeModal();
    if (cb) cb(null);
  };

  window._closeLadderPicker = function () {
    const popup = document.getElementById('ladderPickerPopup');
    const bd    = document.getElementById('ladderPickerBackdrop');
    if (popup) popup.classList.add('hidden');
    if (bd)    bd.classList.add('hidden');
  };

  window._selectPickerItem = function (idx) {
    window._closeLadderPicker();
    if (!_L || _L.phase !== 'setup') return;

    if (_L.pickerType === 'top') {
      const newPlayer = _L.players[idx];
      const curPlayer = _L.topAssign[_L.pickerSlotIdx];
      const otherSlot = _L.topAssign.findIndex(p => p === newPlayer);
      if (otherSlot >= 0 && otherSlot !== _L.pickerSlotIdx) {
        _L.topAssign[otherSlot] = curPlayer;
      }
      _L.topAssign[_L.pickerSlotIdx] = newPlayer;
    } else {
      // Swap bottom order positions
      const a = _L.pickerSlotIdx, b = idx;
      const tmp = _L.botOrder[a];
      _L.botOrder[a] = _L.botOrder[b];
      _L.botOrder[b] = tmp;
    }
    _updateSlotButtons();
    _drawLadder();
  };

  /* ============================================================
     SHARED HELPERS
     ============================================================ */
  function _closeModal() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
    _onResult = null; _orderedPlayers = null; _gameType = null; _L = null; _P = null;
    const m  = document.getElementById('miniGameModal');
    if (m) m.classList.add('hidden');
    const ln = document.getElementById('ladderLaneNumbers');
    const ts = document.getElementById('ladderTopSlots');
    const bs = document.getElementById('ladderBottomSlots');
    if (ln) { ln.style.display = 'none'; ln.innerHTML = ''; }
    if (ts) { ts.style.display = 'none'; ts.innerHTML = ''; }
    if (bs) { bs.style.display = 'none'; bs.innerHTML = ''; }
    const cb = document.getElementById('miniGameCourseBtn');
    if (cb) cb.style.display = 'none';
    window._closeLadderPicker();
  }

  function _renderResult(players, ordered) {
    const panel = document.getElementById('miniGameResultPanel');
    if (!panel) return;
    const mc = Math.min(Math.floor(ordered.length / 4), 6);
    const lines = [];
    for (let i = 0; i < mc; i++) {
      const tA = [ordered[i * 4], ordered[i * 4 + 1]].join(' / ');
      const tB = [ordered[i * 4 + 2], ordered[i * 4 + 3]].join(' / ');
      lines.push(`<div class="result-line"><span class="result-court">${i + 1}코트</span> ${_esc(tA)} vs ${_esc(tB)}</div>`);
    }
    const wait = ordered.slice(mc * 4);
    if (wait.length) lines.push(`<div class="result-line result-wait">대기: ${_esc(wait.join(' / '))}</div>`);
    panel.innerHTML = lines.join('');
    panel.style.display = 'block';
  }

  function _esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function _hexToRgb(hex) {
    return [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16)
    ];
  }

  /* ============================================================
     LADDER GAME
     ============================================================ */

  function _makeDefaultLabels(N, matchCount) {
    const labels = [];
    for (let i = 0; i < N; i++) {
      if (i < matchCount * 4) {
        const c = Math.floor(i / 4) + 1;
        const t = Math.floor((i % 4) / 2) === 0 ? 'A팀' : 'B팀';
        labels.push(`${c}코트${t}`);
      } else {
        labels.push('대기');
      }
    }
    return labels;
  }

  function _genLadder(N, rows) {
    const grid = Array.from({ length: rows }, () => new Array(N - 1).fill(false));
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < N - 1) {
        if (Math.random() < 0.68) { grid[r][c] = true; c += 2; }
        else c++;
      }
    }
    return grid;
  }

  function _traceLadder(rungs, start, numRows) {
    let lane = start;
    for (let r = 0; r < numRows; r++) {
      if (lane < rungs[r].length && rungs[r][lane])    lane++;
      else if (lane > 0 && rungs[r][lane - 1])         lane--;
    }
    return lane;
  }

  function _laneX(i) {
    const { N, canvas } = _L;
    return (i + 0.5) * canvas.width / N;
  }

  function _initLadder(canvas, players, onDone) {
    const N        = players.length;
    const numRows  = Math.max(20, Math.min(30, N + 14));
    const rungs    = _genLadder(N, numRows);
    const finals   = players.map((_, i) => _traceLadder(rungs, i, numRows));
    const mc       = Math.min(Math.floor(N / 4), 6);
    const defLabels = _makeDefaultLabels(N, mc);

    _L = {
      canvas, players, N, numRows, rungs, finals, mc,
      topAssign: [...players],
      botOrder:  Array.from({ length: N }, (_, i) => i),
      defLabels,
      phase: 'setup',   // 'setup' | 'revealed' | 'done'
      playerState: Array.from({ length: N }, () => ({
        status: 'waiting',  // 'waiting' | 'running' | 'done'
        progress: 0,
        startTs: null,
      })),
      paths: null,
      ANIM_DURATION: 3600,
      pickerType: null,
      pickerSlotIdx: -1,
      onDone,
    };

    _L.paths = Array.from({ length: N }, (_, pi) => _computePath(pi));
    _updateSlotButtons();
    _drawLadder();
  }

  /* ── slot buttons ── */
  function _updateSlotButtons() {
    if (!_L) return;
    const { N, topAssign, botOrder, defLabels, phase, playerState } = _L;

    // Lane number row
    const numEl = document.getElementById('ladderLaneNumbers');
    if (numEl) {
      numEl.innerHTML = '';
      for (let i = 0; i < N; i++) {
        const d = document.createElement('div');
        d.className = 'ladder-slot-number';
        d.textContent = i + 1;
        numEl.appendChild(d);
      }
    }

    // Player name slots
    const topSlots = document.getElementById('ladderTopSlots');
    if (topSlots) {
      topSlots.innerHTML = '';
      for (let i = 0; i < N; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ladder-slot-btn ladder-slot-top';
        const nm = topAssign[i] || '?';
        btn.textContent = nm.length > 3 ? nm.slice(0, 3) : nm;
        btn.title = nm;
        btn.style.color = COLORS[i % COLORS.length];

        if (phase === 'setup') {
          // Setup: click to rearrange via picker
          (function (idx) { btn.onclick = () => _openTopPicker(idx); })(i);
        } else if (phase === 'revealed') {
          // Revealed: click to start that player
          const ps = playerState[i];
          if (ps.status === 'waiting') {
            (function (idx) { btn.onclick = () => _startPlayerAt(idx); })(i);
          } else {
            btn.disabled = true;
            btn.style.opacity = ps.status === 'running' ? '0.65' : '0.40';
          }
        } else {
          btn.disabled = true;
          btn.style.opacity = '0.40';
        }
        topSlots.appendChild(btn);
      }
    }

    // Bottom result slots (display only)
    const botSlots = document.getElementById('ladderBottomSlots');
    if (botSlots) {
      botSlots.innerHTML = '';
      for (let i = 0; i < N; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ladder-slot-btn ladder-slot-bottom';
        btn.textContent = defLabels[botOrder[i]];
        btn.disabled = true;
        botSlots.appendChild(btn);
      }
    }
  }

  /* ── picker (setup only) ── */
  function _openTopPicker(slotIdx) {
    if (!_L || _L.phase !== 'setup') return;
    _L.pickerType    = 'top';
    _L.pickerSlotIdx = slotIdx;

    const popup = document.getElementById('ladderPickerPopup');
    const bd    = document.getElementById('ladderPickerBackdrop');
    if (!popup || !bd) return;

    popup.innerHTML = _L.players.map((p, i) => {
      const isCur = (_L.topAssign[slotIdx] === p);
      return `<button type="button" class="ladder-picker-item${isCur ? ' active' : ''}" onclick="_selectPickerItem(${i})">${_esc(p)}</button>`;
    }).join('');

    _positionPicker(slotIdx);
    popup.classList.remove('hidden');
    bd.classList.remove('hidden');
  }

  function _positionPicker(slotIdx) {
    const popup   = document.getElementById('ladderPickerPopup');
    const slotsEl = document.getElementById('ladderTopSlots');
    if (!popup || !slotsEl) return;

    const btns = slotsEl.querySelectorAll('.ladder-slot-btn');
    if (slotIdx >= btns.length) return;

    const btnRect = btns[slotIdx].getBoundingClientRect();
    let top  = btnRect.bottom + 4;
    if (top + 200 > window.innerHeight) top = btnRect.top - 204;
    const left = Math.max(4, Math.min(btnRect.left, window.innerWidth - 148));

    popup.style.top  = top + 'px';
    popup.style.left = left + 'px';
  }

  /* ── start a single player (revealed phase only) ── */
  function _startPlayerAt(laneIdx) {
    if (!_L || _L.phase !== 'revealed') return;
    const ps = _L.playerState[laneIdx];
    if (!ps || ps.status !== 'waiting') return;

    ps.status = 'running';
    _updateSlotButtons();

    if (!_animFrame) {
      _animFrame = requestAnimationFrame(_ladderTick);
    }
  }

  /* ── 시작 / 전체 출발 button handler ── */
  function _startLadderAnim() {
    if (!_L || _L.phase === 'done') return;

    if (_L.phase === 'setup') {
      // First press: reveal ladder, change button to '전체 출발'
      _L.phase = 'revealed';
      _updateSlotButtons();
      _drawLadder();
      const sb = document.getElementById('miniGameStartBtn');
      if (sb) sb.textContent = '전체 출발';
      return;
    }

    // Second press (전체 출발): start all remaining 'waiting' players
    let anyNew = false;
    for (const ps of _L.playerState) {
      if (ps.status === 'waiting') { ps.status = 'running'; anyNew = true; }
    }
    _updateSlotButtons();

    if (anyNew && !_animFrame) {
      _animFrame = requestAnimationFrame(_ladderTick);
    }
  }

  /* ── per-player animation tick ── */
  function _ladderTick(ts) {
    if (!_L) { _animFrame = null; return; }
    const { playerState, ANIM_DURATION } = _L;

    let anyRunning = false;
    for (const ps of playerState) {
      if (ps.status !== 'running') continue;
      if (!ps.startTs) ps.startTs = ts;
      ps.progress = Math.min((ts - ps.startTs) / ANIM_DURATION, 1);
      if (ps.progress >= 1) {
        ps.status   = 'done';
        ps.progress = 1;
      } else {
        anyRunning = true;
      }
    }

    _drawLadder();

    if (playerState.every(ps => ps.status === 'done')) {
      _animFrame = null;
      _L.phase = 'done';
      _updateSlotButtons();
      const sb = document.getElementById('miniGameStartBtn');
      if (sb) sb.style.display = 'none';
      _deliverResult();
      return;
    }

    if (anyRunning) {
      _animFrame = requestAnimationFrame(_ladderTick);
    } else {
      _animFrame = null;
    }
  }

  /* ── result delivery ── */
  function _deliverResult() {
    if (!_L) return;
    const { topAssign, finals, botOrder, N, onDone } = _L;
    const orderedPlayers = new Array(N).fill('');
    for (let lane = 0; lane < N; lane++) {
      orderedPlayers[botOrder[finals[lane]]] = topAssign[lane];
    }
    setTimeout(() => { if (_L) onDone(orderedPlayers); }, 500);
  }

  /* ── path computation ── */
  function _computePath(playerIdx) {
    const { canvas, N, numRows, rungs } = _L;
    const H    = canvas.height;
    const rowH = H / numRows;
    let lane   = playerIdx;
    const pts  = [{ x: _laneX(lane), y: 0 }];

    for (let r = 0; r < numRows; r++) {
      const midY = (r + 0.5) * rowH;
      pts.push({ x: _laneX(lane), y: midY });
      if (lane < N - 1 && rungs[r][lane]) {
        lane++;
        pts.push({ x: _laneX(lane), y: midY });
      } else if (lane > 0 && rungs[r][lane - 1]) {
        lane--;
        pts.push({ x: _laneX(lane), y: midY });
      }
    }
    pts.push({ x: _laneX(lane), y: H });
    return pts;
  }

  function _getMarkerPos(playerIdx, progress) {
    const { N, numRows, rungs, canvas, finals } = _L;
    const H    = canvas.height;
    const rowH = H / numRows;
    let lane   = playerIdx;

    const curDist    = progress * numRows;
    const completedR = Math.floor(curDist);
    const rowFrac    = curDist - completedR;

    for (let r = 0; r < Math.min(completedR, numRows); r++) {
      if (lane < N - 1 && rungs[r][lane])      lane++;
      else if (lane > 0 && rungs[r][lane - 1]) lane--;
    }

    let x;
    // Last 4 rows: snap straight to final lane — no lateral sliding near bottom
    if (completedR >= numRows - 4) {
      x = _laneX(finals[playerIdx]);
    } else {
      x = _laneX(lane);
      if (completedR < numRows && rungs[completedR]) {
        if (lane < N - 1 && rungs[completedR][lane] && rowFrac >= 0.4) {
          const t = (rowFrac - 0.4) / 0.6;
          x = _laneX(lane) + (_laneX(lane + 1) - _laneX(lane)) * t;
        } else if (lane > 0 && rungs[completedR][lane - 1] && rowFrac >= 0.4) {
          const t = (rowFrac - 0.4) / 0.6;
          x = _laneX(lane) + (_laneX(lane - 1) - _laneX(lane)) * t;
        }
      }
    }

    const y = Math.min(progress * (H + rowH), H);
    return { x, y };
  }

  /* ── canvas draw ── */
  function _drawLadder() {
    if (!_L) return;
    const { canvas, N, numRows, rungs, finals, topAssign, phase, playerState, paths } = _L;
    const ctx  = canvas.getContext('2d');
    const W    = canvas.width, H = canvas.height;
    const rowH = H / numRows;

    ctx.clearRect(0, 0, W, H);

    /* === SETUP: eye-catching blindfold === */
    if (phase === 'setup') {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0,    '#1a5fa8');
      grad.addColorStop(0.35, '#0c3e82');
      grad.addColorStop(0.65, '#0c3e82');
      grad.addColorStop(1,    '#1a5fa8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 16;
      for (let x = -H; x < W + H; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + H, H);
        ctx.stroke();
      }
      ctx.restore();

      ctx.globalAlpha = 0.18;
      ctx.lineWidth   = 1.5;
      ctx.strokeStyle = '#90c8ff';
      for (let i = 0; i < N; i++) {
        ctx.beginPath();
        ctx.moveTo(_laneX(i), 0);
        ctx.lineTo(_laneX(i), H);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle    = 'rgba(255,255,255,0.55)';
      ctx.font         = '22px sans-serif';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔒', W / 2, H / 2 - 22);
      ctx.font      = '11px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.fillText('이름 클릭 → 배치 변경', W / 2, H / 2 + 8);
      ctx.fillText('시작 버튼 → 가림막 제거', W / 2, H / 2 + 26);
      return;
    }

    /* === REVEALED / DONE: draw ladder === */
    ctx.fillStyle = '#131620';
    ctx.fillRect(0, 0, W, H);

    /* 1. Rungs */
    ctx.lineWidth   = 2;
    ctx.strokeStyle = '#7080b0';
    for (let r = 0; r < numRows; r++) {
      const y = (r + 0.5) * rowH;
      for (let c = 0; c < N - 1; c++) {
        if (rungs[r][c]) {
          ctx.beginPath();
          ctx.moveTo(_laneX(c), y);
          ctx.lineTo(_laneX(c + 1), y);
          ctx.stroke();
        }
      }
    }

    /* 2. Completed path highlights */
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.5;
    for (let pi = 0; pi < N; pi++) {
      if (playerState[pi].status !== 'done') continue;
      const [r, g, b] = _hexToRgb(COLORS[pi % COLORS.length]);
      ctx.strokeStyle = `rgba(${r},${g},${b},0.84)`;
      ctx.beginPath();
      paths[pi].forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
      ctx.stroke();
    }

    /* 3. Moving markers */
    for (let pi = 0; pi < N; pi++) {
      const ps = playerState[pi];
      if (ps.status !== 'running') continue;
      const { x, y } = _getMarkerPos(pi, ps.progress);
      _drawMarker(ctx, x, y, COLORS[pi % COLORS.length], topAssign[pi], 1.0);
    }

    /* 4. Lane lines (always on top) */
    ctx.lineWidth = 2;
    ctx.lineCap   = 'butt';
    for (let i = 0; i < N; i++) {
      ctx.strokeStyle = '#4a5078';
      ctx.beginPath();
      ctx.moveTo(_laneX(i), 0);
      ctx.lineTo(_laneX(i), H);
      ctx.stroke();
    }

    /* 5. Done-player final markers at bottom */
    for (let pi = 0; pi < N; pi++) {
      if (playerState[pi].status !== 'done') continue;
      _drawMarker(ctx, _laneX(finals[pi]), H - 11, COLORS[pi % COLORS.length], topAssign[pi], 1.0);
    }
  }

  function _drawMarker(ctx, x, y, color, name, alpha) {
    const [r, g, b] = _hexToRgb(color);
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.45})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font         = 'bold 8px sans-serif';
    ctx.fillStyle    = `rgba(255,255,255,${alpha})`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.length > 2 ? name.slice(0, 2) : name, x, y);
  }

  /* ============================================================
     PLINKO RACING GAME
     ============================================================ */

  /* obstacle definition helpers */
  function _B(fx, y, r)           { return { type: 'bumper',   fx, y, r: r || 10 }; }
  function _Lb(fx, y, fw)         { return { type: 'launcher', fx, y, fw: fw || 0.35 }; }
  function _Dt(fx, y, fw)         { return { type: 'delay',    fx, y, fw: fw || 0.30 }; }
  function _Rp(fx1, y1, fx2, y2)  { return { type: 'ramp',    fx1, y1, fx2, y2 }; }
  function _Bst(fx, y, fw, h)     { return { type: 'boost',   fx, y, fw: fw || 0.50, h: h || 35 }; }
  function _Slw(fx, y, fw, h)     { return { type: 'slow',    fx, y, fw: fw || 0.40, h: h || 55 }; }

  /* ── 3 course layouts ── */
  const _COURSES = [
    /* 코스 1: 클래식 */
    { name: '클래식', obs: [
      _B(0.50,  180),
      _B(0.17,280), _B(0.33,280), _B(0.50,280), _B(0.67,280), _B(0.83,280),
      _B(0.25,370), _B(0.42,370), _B(0.58,370), _B(0.75,370),
      _Lb(0.50,450,0.55),
      _B(0.20,540), _B(0.40,540), _B(0.60,540), _B(0.80,540),
      _B(0.30,630), _B(0.50,630), _B(0.70,630),
      _Dt(0.50,710,0.38),
      _B(0.17,820), _B(0.33,820), _B(0.50,820), _B(0.67,820), _B(0.83,820),
      _B(0.25,910), _B(0.50,910), _B(0.75,910),
      _Rp(0.06,1010, 0.38,945), _Rp(0.94,1010, 0.62,945),
      _B(0.20,1060), _B(0.40,1060), _B(0.60,1060), _B(0.80,1060),
      _B(0.30,1150), _B(0.50,1150), _B(0.70,1150),
      _Lb(0.27,1240,0.27), _Lb(0.73,1240,0.27),
      _B(0.17,1340), _B(0.33,1340), _B(0.50,1340), _B(0.67,1340), _B(0.83,1340),
      _B(0.25,1430), _B(0.50,1430), _B(0.75,1430),
      _Bst(0.50,1510,0.80,35),
      _B(0.20,1600), _B(0.40,1600), _B(0.60,1600), _B(0.80,1600),
      _B(0.30,1690), _B(0.50,1690), _B(0.70,1690),
      _B(0.17,1780), _B(0.50,1780), _B(0.83,1780),
      _B(0.25,1900), _B(0.50,1900), _B(0.75,1900),
      _B(0.17,1990), _B(0.33,1990), _B(0.50,1990), _B(0.67,1990), _B(0.83,1990),
      _B(0.30,2080), _B(0.70,2080),
      _B(0.50,2170),
    ]},

    /* 코스 2: 카오스 */
    { name: '카오스', obs: [
      _B(0.25,200), _B(0.75,200),
      _B(0.17,280), _B(0.33,280), _B(0.50,280), _B(0.67,280), _B(0.83,280),
      _Lb(0.50,370,0.65),
      _B(0.12,460), _B(0.28,460), _B(0.50,460), _B(0.72,460), _B(0.88,460),
      _B(0.20,550), _B(0.40,550), _B(0.60,550), _B(0.80,550),
      _Dt(0.28,640,0.28), _Dt(0.72,640,0.28),
      _B(0.17,730), _B(0.33,730), _B(0.50,730), _B(0.67,730), _B(0.83,730),
      _B(0.25,820), _B(0.50,820), _B(0.75,820),
      _Lb(0.17,910,0.25), _Lb(0.83,910,0.25),
      _B(0.12,1010), _B(0.30,1010), _B(0.50,1010), _B(0.70,1010), _B(0.88,1010),
      _B(0.20,1100), _B(0.40,1100), _B(0.60,1100), _B(0.80,1100),
      _Lb(0.50,1190,0.40),
      _Dt(0.50,1280,0.35),
      _B(0.17,1380), _B(0.33,1380), _B(0.50,1380), _B(0.67,1380), _B(0.83,1380),
      _B(0.25,1470), _B(0.50,1470), _B(0.75,1470),
      _Lb(0.25,1560,0.25), _Lb(0.75,1560,0.25),
      _Bst(0.50,1640,0.70,35),
      _B(0.17,1760), _B(0.33,1760), _B(0.50,1760), _B(0.67,1760), _B(0.83,1760),
      _B(0.25,1850), _B(0.50,1850), _B(0.75,1850),
      _B(0.17,1940), _B(0.50,1940), _B(0.83,1940),
      _B(0.33,2030), _B(0.67,2030),
      _B(0.20,2120), _B(0.50,2120), _B(0.80,2120),
    ]},

    /* 코스 3: 미로 */
    { name: '미로', obs: [
      _Rp(0.04,260, 0.40,180), _Rp(0.96,260, 0.60,180),
      _B(0.25,300), _B(0.50,300), _B(0.75,300),
      _B(0.17,390), _B(0.37,390), _B(0.63,390), _B(0.83,390),
      _Slw(0.15,470,0.28,60), _Slw(0.57,470,0.28,60),
      _B(0.50,515),
      _B(0.25,620), _B(0.50,620), _B(0.75,620),
      _Rp(0.08,720, 0.42,660), _Rp(0.92,720, 0.58,660),
      _B(0.15,790), _B(0.30,790), _B(0.50,790), _B(0.70,790), _B(0.85,790),
      _B(0.22,880), _B(0.42,880), _B(0.62,880), _B(0.82,880),
      _B(0.15,960), _B(0.38,960), _B(0.62,960), _B(0.85,960),
      _Lb(0.50,1050,0.38),
      _Dt(0.28,1140,0.28), _Dt(0.72,1140,0.28),
      _B(0.17,1240), _B(0.33,1240), _B(0.50,1240), _B(0.67,1240), _B(0.83,1240),
      _B(0.25,1330), _B(0.50,1330), _B(0.75,1330),
      _Rp(0.04,1450, 0.38,1370), _Rp(0.96,1450, 0.62,1370),
      _Slw(0.50,1470,0.40,50),
      _B(0.17,1580), _B(0.33,1580), _B(0.50,1580), _B(0.67,1580), _B(0.83,1580),
      _B(0.25,1670), _B(0.50,1670), _B(0.75,1670),
      _Bst(0.50,1750,0.80,40),
      _B(0.20,1870), _B(0.40,1870), _B(0.60,1870), _B(0.80,1870),
      _B(0.30,1960), _B(0.50,1960), _B(0.70,1960),
      _B(0.17,2050), _B(0.50,2050), _B(0.83,2050),
      _B(0.33,2140), _B(0.67,2140),
      _B(0.50,2230),
    ]},
  ];

  const _COURSE_H = 2400;
  const _FINISH_Y = 2340;
  const _P_BALL_R = 7;
  const _GRAVITY  = 360;

  /* convert fractional-x course def → pixel coords */
  function _resolveCourse(course, W) {
    return course.obs.map(o => {
      switch (o.type) {
        case 'bumper':   return { type: 'bumper',   x: o.fx*W,  y: o.y, r: o.r };
        case 'launcher': return { type: 'launcher', x: o.fx*W,  y: o.y, w: o.fw*W };
        case 'delay':    return { type: 'delay',    x: o.fx*W,  y: o.y, w: o.fw*W };
        case 'boost':    return { type: 'boost',    x: o.fx*W,  y: o.y, w: o.fw*W, h: o.h };
        case 'slow':     return { type: 'slow',     x: o.fx*W,  y: o.y, w: o.fw*W, h: o.h };
        case 'ramp':     return { type: 'ramp',    x1: o.fx1*W, y1: o.y1, x2: o.fx2*W, y2: o.y2 };
        default:         return o;
      }
    });
  }

  /* ── init (setup phase) ── */
  function _initPlinko(canvas, players, onDone) {
    const N = players.length;
    const W = canvas.width;
    const H = canvas.height;
    _P = {
      canvas, players, onDone,
      phase: 'setup',
      courseIdx: 0,
      W, H,
      cameraY: 0,
      finishOrder: [],
      resolved: _resolveCourse(_COURSES[0], W),
      balls: Array.from({ length: N }, (_, i) => ({
        x: W / 2 + (i - (N - 1) / 2) * 2.5,
        y: 50, vx: 0, vy: 0,
        r: _P_BALL_R, playerIdx: i, finished: false, frozenUntil: 0,
      })),
    };
    _drawPlinkoSetup();
  }

  function _drawPlinkoSetup() {
    if (!_P) return;
    const { canvas, balls, H, resolved, courseIdx } = _P;
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f1018';
    ctx.fillRect(0, 0, W, H);

    for (const obs of resolved) {
      const minY = obs.type === 'ramp' ? Math.min(obs.y1, obs.y2) : obs.y;
      if (minY > H + 30) continue;
      _drawPlinkoObs(ctx, obs, 0);
    }
    if (_FINISH_Y < H + 30) _drawPlinkoFinish(ctx, W, H, _FINISH_Y);

    for (let i = 0; i < balls.length; i++) {
      _drawPlinkoBall(ctx, balls[i], balls[i].y, i, _P.players, _P.finishOrder);
    }

    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, H - 30, W, 30);
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8090b8';
    ctx.fillText(`코스 ${courseIdx + 1}: ${_COURSES[courseIdx].name}  ·  시작 버튼을 눌러 레이스 시작`, W / 2, H - 15);
  }

  /* ── start race ── */
  function _startPlinkoRace() {
    if (!_P) return;
    const sb = document.getElementById('miniGameStartBtn');
    const cb = document.getElementById('miniGameCourseBtn');
    if (sb) sb.style.display = 'none';
    if (cb) cb.style.display = 'none';

    const N = _P.players.length;
    const W = _P.W;
    _P.balls = Array.from({ length: N }, (_, i) => ({
      x: W / 2 + (i - (N - 1) / 2) * 2.5,
      y: 50,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() * 25),
      r: _P_BALL_R, playerIdx: i, finished: false, frozenUntil: 0,
    }));
    _P.cameraY      = 0;
    _P.finishOrder  = [];
    _P.phase        = 'running';

    let lastTs = null;
    function tick(ts) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      _updatePlinko(dt);
      _drawPlinkoRace();
      if (_P && _P.phase === 'running') {
        _animFrame = requestAnimationFrame(tick);
      } else {
        _animFrame = null;
      }
    }
    _animFrame = requestAnimationFrame(tick);
  }

  /* ── physics ── */
  function _updatePlinko(dt) {
    if (!_P || _P.phase !== 'running') return;
    const { balls, resolved, W } = _P;
    const now = Date.now();

    for (const ball of balls) {
      if (ball.finished) continue;

      if (ball.frozenUntil > 0) {
        if (now < ball.frozenUntil) { ball.vx = 0; ball.vy = 0; continue; }
        ball.frozenUntil = 0;
        ball.vy = 75;
      }

      ball.vy += _GRAVITY * dt;

      for (const obs of resolved) {
        const hw = obs.w ? obs.w / 2 : 0;
        if (obs.type === 'boost' && ball.x >= obs.x - hw && ball.x <= obs.x + hw &&
            ball.y >= obs.y && ball.y <= obs.y + obs.h) {
          ball.vy = Math.min(ball.vy + 240 * dt, 900);
        }
        if (obs.type === 'slow' && ball.x >= obs.x - hw && ball.x <= obs.x + hw &&
            ball.y >= obs.y && ball.y <= obs.y + obs.h) {
          ball.vx *= Math.pow(0.04, dt);
          ball.vy *= Math.pow(0.15, dt);
          if (ball.vy < 45) ball.vy = 45;
        }
      }

      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;

      if (ball.x < ball.r)       { ball.x = ball.r;       ball.vx =  Math.abs(ball.vx) * 0.5; }
      if (ball.x > W - ball.r)   { ball.x = W - ball.r;   ball.vx = -Math.abs(ball.vx) * 0.5; }

      for (const obs of resolved) {
        if      (obs.type === 'bumper')   _collideBumper(ball, obs);
        else if (obs.type === 'launcher') _collideLauncher(ball, obs);
        else if (obs.type === 'delay')    _collideDelay(ball, obs);
        else if (obs.type === 'ramp')     _collideRamp(ball, obs);
      }

      if (ball.y >= _FINISH_Y) {
        ball.x = Math.max(ball.r, Math.min(W - ball.r, ball.x));
        ball.y = _FINISH_Y; ball.vx = 0; ball.vy = 0;
        ball.finished = true;
        _P.finishOrder.push(ball.playerIdx);
      }
    }

    _separateBalls(balls);

    /* camera: smooth follow of leading (lowest y) ball */
    let leadY = 0;
    for (const b of balls) { if (b.y > leadY) leadY = b.y; }
    const targetCam = Math.max(0, Math.min(leadY - _P.H * 0.32, _COURSE_H - _P.H));
    _P.cameraY += (targetCam - _P.cameraY) * Math.min(1, 4 * dt);

    if (balls.every(b => b.finished)) {
      _P.phase = 'done';
      setTimeout(() => {
        if (_P) _P.onDone(_P.finishOrder.map(idx => _P.players[idx]));
      }, 900);
    }
  }

  function _collideBumper(ball, obs) {
    const dx = ball.x - obs.x, dy = ball.y - obs.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const minD = ball.r + obs.r;
    if (dist < minD && dist > 0.01) {
      const nx = dx/dist, ny = dy/dist;
      const vn = ball.vx*nx + ball.vy*ny;
      if (vn < 0) { ball.vx -= 1.75*vn*nx; ball.vy -= 1.75*vn*ny; }
      ball.x = obs.x + nx*(minD + 0.5);
      ball.y = obs.y + ny*(minD + 0.5);
    }
  }

  function _collideLauncher(ball, obs) {
    const hw = obs.w / 2;
    if (ball.x < obs.x - hw || ball.x > obs.x + hw) return;
    if (ball.y + ball.r >= obs.y - 5 && ball.y + ball.r < obs.y + 10 && ball.vy > 0) {
      ball.y = obs.y - 5 - ball.r;
      ball.vy = -710; ball.vx *= 0.3;
    }
  }

  function _collideDelay(ball, obs) {
    if (ball.frozenUntil > 0) return;
    const hw = obs.w / 2;
    if (ball.x < obs.x - hw || ball.x > obs.x + hw) return;
    if (ball.y + ball.r >= obs.y - 5 && ball.y + ball.r < obs.y + 10 && ball.vy > 0) {
      ball.y = obs.y - 5 - ball.r;
      ball.vx = 0; ball.vy = 0;
      ball.frozenUntil = Date.now() + 1500;
    }
  }

  function _collideRamp(ball, obs) {
    const abx = obs.x2-obs.x1, aby = obs.y2-obs.y1;
    const len2 = abx*abx + aby*aby;
    if (len2 < 0.001) return;
    const t  = Math.max(0, Math.min(1, ((ball.x-obs.x1)*abx + (ball.y-obs.y1)*aby) / len2));
    const cx = obs.x1 + t*abx, cy = obs.y1 + t*aby;
    const dx = ball.x - cx, dy = ball.y - cy;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < ball.r + 3 && dist > 0.01) {
      const nx = dx/dist, ny = dy/dist;
      const vn = ball.vx*nx + ball.vy*ny;
      if (vn < 0) { ball.vx -= 1.60*vn*nx; ball.vy -= 1.60*vn*ny; }
      ball.x = cx + nx*(ball.r + 3.5);
      ball.y = cy + ny*(ball.r + 3.5);
    }
  }

  function _separateBalls(balls) {
    for (let i = 0; i < balls.length; i++) {
      if (balls[i].finished) continue;
      for (let j = i+1; j < balls.length; j++) {
        if (balls[j].finished) continue;
        const dx = balls[j].x-balls[i].x, dy = balls[j].y-balls[i].y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const minD = balls[i].r + balls[j].r;
        if (dist < minD && dist > 0.01) {
          const nx = dx/dist, ny = dy/dist;
          const ov = (minD - dist) * 0.55;
          balls[i].x -= ov*nx; balls[i].y -= ov*ny;
          balls[j].x += ov*nx; balls[j].y += ov*ny;
          const rv = (balls[j].vx-balls[i].vx)*nx + (balls[j].vy-balls[i].vy)*ny;
          if (rv < 0) {
            balls[i].vx += rv*0.30*nx; balls[i].vy += rv*0.30*ny;
            balls[j].vx -= rv*0.30*nx; balls[j].vy -= rv*0.30*ny;
          }
        }
      }
    }
  }

  /* ── drawing ── */
  function _drawPlinkoRace() {
    if (!_P) return;
    const { canvas, balls, cameraY, resolved, H, players, finishOrder } = _P;
    const ctx = canvas.getContext('2d');
    const W   = canvas.width;
    const toY = vy => vy - cameraY;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0f1018';
    ctx.fillRect(0, 0, W, H);

    /* subtle grid */
    ctx.strokeStyle = '#15182a'; ctx.lineWidth = 1;
    const g0 = Math.ceil(cameraY / 150) * 150;
    for (let gy = g0; gy < cameraY + H; gy += 150) {
      ctx.beginPath(); ctx.moveTo(0, toY(gy)); ctx.lineTo(W, toY(gy)); ctx.stroke();
    }

    const vt = cameraY - 30, vb = cameraY + H + 30;
    for (const obs of resolved) {
      const minY = obs.type==='ramp' ? Math.min(obs.y1,obs.y2) : obs.y;
      const maxY = obs.type==='ramp' ? Math.max(obs.y1,obs.y2)
                 : (obs.type==='slow'||obs.type==='boost') ? obs.y + obs.h : obs.y;
      if (maxY < vt || minY > vb) continue;
      _drawPlinkoObs(ctx, obs, cameraY);
    }

    const fy = toY(_FINISH_Y);
    if (fy > -20 && fy < H + 20) _drawPlinkoFinish(ctx, W, H, fy);

    for (let i = 0; i < balls.length; i++) {
      const b  = balls[i];
      const cy = toY(b.y);
      if (cy < -25 || cy > H + 25) continue;
      _drawPlinkoBall(ctx, b, cy, i, players, finishOrder);
    }

    _drawPlinkoBoard(ctx, W, H, balls, players, finishOrder);
  }

  function _drawPlinkoObs(ctx, obs, camY) {
    const toY = vy => vy - camY;
    if (obs.type === 'bumper') {
      const cy = toY(obs.y);
      ctx.beginPath(); ctx.arc(obs.x, cy, obs.r, 0, Math.PI*2);
      ctx.fillStyle = '#30375e'; ctx.fill();
      ctx.strokeStyle = '#5060a8'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(obs.x - obs.r*0.28, cy - obs.r*0.28, obs.r*0.3, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fill();

    } else if (obs.type === 'launcher') {
      const cy = toY(obs.y), hw = obs.w/2;
      const g  = ctx.createLinearGradient(obs.x-hw, cy-5, obs.x+hw, cy+5);
      g.addColorStop(0,'#c03a00'); g.addColorStop(1,'#ff6a00');
      ctx.fillStyle = g;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(obs.x-hw, cy-5, obs.w, 10, 4); ctx.fill(); }
      else { ctx.fillRect(obs.x-hw, cy-5, obs.w, 10); }
      ctx.strokeStyle = '#ff9830'; ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(obs.x-hw, cy-5, obs.w, 10, 4); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('▲▲', obs.x, cy);

    } else if (obs.type === 'delay') {
      const cy = toY(obs.y), hw = obs.w/2;
      ctx.fillStyle = '#3c0e70';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(obs.x-hw, cy-5, obs.w, 10, 4); ctx.fill(); }
      else { ctx.fillRect(obs.x-hw, cy-5, obs.w, 10); }
      ctx.strokeStyle = '#8040d0'; ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(obs.x-hw, cy-5, obs.w, 10, 4); ctx.stroke(); }
      ctx.fillStyle = '#c8a0ff'; ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('STOP', obs.x, cy);

    } else if (obs.type === 'slow') {
      const ty = toY(obs.y), hw = obs.w/2;
      ctx.fillStyle   = 'rgba(70,20,140,0.22)'; ctx.fillRect(obs.x-hw, ty, obs.w, obs.h);
      ctx.strokeStyle = 'rgba(120,50,210,0.40)'; ctx.lineWidth = 1;
      ctx.strokeRect(obs.x-hw, ty, obs.w, obs.h);
      ctx.fillStyle = 'rgba(190,150,255,0.55)'; ctx.font = '11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⏳', obs.x, ty + obs.h/2);

    } else if (obs.type === 'boost') {
      const ty = toY(obs.y), hw = obs.w/2;
      ctx.fillStyle   = 'rgba(20,160,60,0.18)'; ctx.fillRect(obs.x-hw, ty, obs.w, obs.h);
      ctx.strokeStyle = 'rgba(50,210,90,0.38)'; ctx.lineWidth = 1;
      ctx.strokeRect(obs.x-hw, ty, obs.w, obs.h);
      ctx.fillStyle = 'rgba(100,240,130,0.60)'; ctx.font = '11px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚡', obs.x, ty + obs.h/2);

    } else if (obs.type === 'ramp') {
      ctx.strokeStyle = '#485888'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(obs.x1, toY(obs.y1)); ctx.lineTo(obs.x2, toY(obs.y2)); ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }

  function _drawPlinkoFinish(ctx, W, H, canvasY) {
    ctx.strokeStyle = 'rgba(255,215,0,0.75)'; ctx.lineWidth = 3;
    ctx.setLineDash([8,5]);
    ctx.beginPath(); ctx.moveTo(0, canvasY); ctx.lineTo(W, canvasY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffd700'; ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText('FINISH', W/2, canvasY - 3);
  }

  function _drawPlinkoBall(ctx, ball, canvasY, idx, players, finishOrder) {
    const color = COLORS[ball.playerIdx % COLORS.length];
    const name  = (players[ball.playerIdx] || '?').slice(0, 2);
    const now   = Date.now();

    if (ball.frozenUntil > 0 && now < ball.frozenUntil) {
      const rem = ((ball.frozenUntil - now) / 1000).toFixed(1);
      ctx.fillStyle = 'rgba(200,160,255,0.85)'; ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`⏸${rem}s`, ball.x, canvasY - ball.r - 2);
    }

    ctx.beginPath(); ctx.arc(ball.x, canvasY, ball.r, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = 'bold 7px sans-serif'; ctx.fillStyle = '#fff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, ball.x, canvasY);

    if (ball.finished) {
      const pos   = finishOrder.indexOf(ball.playerIdx);
      const label = String(pos + 1);
      const badgeColor = pos===0?'#ffd700':pos===1?'#c0c0c0':pos===2?'#cd7f32':'#3a4570';
      ctx.beginPath(); ctx.arc(ball.x + ball.r + 7, canvasY, 7, 0, Math.PI*2);
      ctx.fillStyle = badgeColor; ctx.fill();
      ctx.font = 'bold 7px sans-serif'; ctx.fillStyle = pos<3?'#000':'#fff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, ball.x + ball.r + 7, canvasY);
    }
  }

  function _drawPlinkoBoard(ctx, W, H, balls, players, finishOrder) {
    const N = balls.length;
    if (!N) return;
    const sorted = [...balls].sort((a, b) => {
      if (a.finished && b.finished) return finishOrder.indexOf(a.playerIdx) - finishOrder.indexOf(b.playerIdx);
      if (a.finished) return -1; if (b.finished) return 1;
      return b.y - a.y;
    });
    const lh = 15, pad = 5, bw = 76, bh = 8 + N*lh;
    const bx = W - bw - 5, by = 5;
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 5); ctx.fill(); }
    else ctx.fillRect(bx, by, bw, bh);
    ctx.textBaseline = 'middle'; ctx.font = 'bold 9px sans-serif';
    for (let i = 0; i < sorted.length; i++) {
      const b    = sorted[i];
      const ty   = by + 5 + i*lh + lh/2;
      const name = (players[b.playerIdx] || '?').slice(0, 5);
      ctx.fillStyle = b.finished ? '#ffd700' : COLORS[b.playerIdx % COLORS.length];
      ctx.textAlign = 'left';
      ctx.fillText(`${i+1}. ${name}`, bx + pad, ty);
      if (b.finished) {
        ctx.fillStyle = '#ffd700'; ctx.textAlign = 'right';
        ctx.fillText('✓', bx + bw - 3, ty);
      }
    }
  }

})();
