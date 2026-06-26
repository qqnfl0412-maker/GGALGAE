/* ============================================================
   minigame.js  –  사다리타기 & 핀볼 (Plinko) mini-games
   Public API: window.openMiniGame(gameType, players, onResult)
     gameType : 'ladder' | 'plinko'
     players  : string[] – active player names
     onResult : (orderedPlayers: string[] | null) => void
                null = cancelled
   ============================================================ */

(function () {
  /* ── module state ── */
  let _onResult = null;
  let _orderedPlayers = null;
  let _animFrame = null;

  const COLORS = [
    '#4f8ef7', '#e85d4a', '#43b97f', '#f7a735',
    '#a47fff', '#30bcd9', '#e97fc4', '#8bc34a',
    '#ff7043', '#26c6da', '#ab47bc', '#66bb6a'
  ];

  /* ============================================================
     PUBLIC: open the mini-game modal
     ============================================================ */
  window.openMiniGame = function (gameType, players, onResult) {
    if (!players || players.length < 2) return;
    _onResult = onResult;
    _orderedPlayers = null;

    const modal   = document.getElementById('miniGameModal');
    const title   = document.getElementById('miniGameTitle');
    const canvas  = document.getElementById('miniGameCanvas');
    const result  = document.getElementById('miniGameResultPanel');
    const actions = document.getElementById('miniGameActions');

    if (!modal || !canvas) return;

    title.textContent = gameType === 'ladder' ? '사다리타기' : '핀볼';
    result.innerHTML  = '';
    result.style.display = 'none';
    actions.style.display = 'none';
    modal.classList.remove('hidden');

    // Size canvas to content width
    requestAnimationFrame(() => {
      const inner = modal.querySelector('.minigame-modal-content');
      const w = inner.clientWidth;
      const h = Math.round(Math.min(window.innerHeight * 0.52, 380));
      canvas.width  = w;
      canvas.height = h;

      if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }

      const done = (ordered) => {
        _orderedPlayers = ordered;
        _renderResult(players, ordered);
        actions.style.display = 'flex';
      };

      if (gameType === 'ladder') {
        _runLadder(canvas, players, done);
      } else {
        _runPlinko(canvas, players, done);
      }
    });
  };

  /* ── confirm / cancel buttons ── */
  window._confirmMiniGame = function () {
    const cb = _onResult;
    const ordered = _orderedPlayers;
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

  function _closeModal() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
    _onResult = null;
    _orderedPlayers = null;
    const m = document.getElementById('miniGameModal');
    if (m) m.classList.add('hidden');
  }

  /* ── result panel ── */
  function _renderResult(players, ordered) {
    const panel = document.getElementById('miniGameResultPanel');
    if (!panel) return;
    const matchCount = Math.min(Math.floor(ordered.length / 4), 6);
    const lines = [];
    for (let i = 0; i < matchCount; i++) {
      const tA = [ordered[i * 4], ordered[i * 4 + 1]].join(' / ');
      const tB = [ordered[i * 4 + 2], ordered[i * 4 + 3]].join(' / ');
      lines.push(`<div class="result-line"><span class="result-court">${i + 1}코트</span>  ${_esc(tA)} vs ${_esc(tB)}</div>`);
    }
    const waiting = ordered.slice(matchCount * 4);
    if (waiting.length) {
      lines.push(`<div class="result-line result-wait">대기: ${_esc(waiting.join(' / '))}</div>`);
    }
    panel.innerHTML = lines.join('');
    panel.style.display = 'block';
  }

  function _esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ============================================================
     LADDER GAME  (사다리타기)
     ============================================================ */
  function _runLadder(canvas, players, onDone) {
    const ctx = canvas.getContext('2d');
    const N   = players.length;
    const W   = canvas.width;
    const H   = canvas.height;

    const PAD    = Math.max(18, Math.round(W / (N * 2.5)));  // side padding
    const usableW = W - PAD * 2;
    const laneW  = N > 1 ? usableW / (N - 1) : usableW;

    const LABEL_TOP    = 18;
    const LABEL_BOTTOM = 16;
    const GRID_TOP     = LABEL_TOP + 14;
    const GRID_BOTTOM  = H - LABEL_BOTTOM - 18;
    const GRID_H       = GRID_BOTTOM - GRID_TOP;

    const NUM_ROWS = Math.max(8, Math.min(12, N + 4));
    const rowH     = GRID_H / NUM_ROWS;

    const rungs  = _genLadder(N, NUM_ROWS);
    const finals = players.map((_, i) => _traceLadder(rungs, i, NUM_ROWS));

    // orderedPlayers: finalPosition → player name
    const posToPlayer = new Array(N);
    players.forEach((p, i) => { posToPlayer[finals[i]] = p; });

    const DURATION = 2400; // ms
    let startTs = null;

    function laneX(i) { return PAD + i * laneW; }

    function getMarker(playerIdx, progress) {
      let lane = playerIdx;
      const totalDist = NUM_ROWS;
      const currentDist = progress * totalDist;
      const done  = Math.floor(currentDist);
      const frac  = currentDist - done;

      for (let r = 0; r < Math.min(done, NUM_ROWS); r++) {
        if (lane < N - 1 && rungs[r][lane])       lane++;
        else if (lane > 0 && rungs[r][lane - 1])  lane--;
      }

      let x = laneX(lane);
      // Interpolate horizontal movement through the rung midpoint
      if (done < NUM_ROWS) {
        const row = rungs[done];
        if (lane < N - 1 && row[lane] && frac >= 0.4) {
          const t = (frac - 0.4) / 0.6;
          x = laneX(lane) + (laneX(lane + 1) - laneX(lane)) * t;
        } else if (lane > 0 && row[lane - 1] && frac >= 0.4) {
          const t = (frac - 0.4) / 0.6;
          x = laneX(lane) + (laneX(lane - 1) - laneX(lane)) * t;
        }
      }

      const y = GRID_TOP + Math.min(progress * (GRID_H + rowH), GRID_H);
      return { x, y };
    }

    function draw(ts) {
      if (!startTs) startTs = ts;
      const progress = Math.min((ts - startTs) / DURATION, 1);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#131620';
      ctx.fillRect(0, 0, W, H);

      // Lane lines
      ctx.strokeStyle = '#3a4060';
      ctx.lineWidth = 2;
      for (let i = 0; i < N; i++) {
        const x = laneX(i);
        ctx.beginPath();
        ctx.moveTo(x, GRID_TOP);
        ctx.lineTo(x, GRID_BOTTOM);
        ctx.stroke();
      }

      // Rungs
      ctx.lineWidth = 2;
      for (let r = 0; r < NUM_ROWS; r++) {
        const y = GRID_TOP + r * rowH + rowH * 0.5;
        for (let c = 0; c < N - 1; c++) {
          if (rungs[r][c]) {
            ctx.strokeStyle = '#606890';
            ctx.beginPath();
            ctx.moveTo(laneX(c), y);
            ctx.lineTo(laneX(c + 1), y);
            ctx.stroke();
          }
        }
      }

      // Top labels
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        const x = laneX(i);
        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = COLORS[i % COLORS.length];
        const name = players[i].length > 3 ? players[i].slice(0, 3) : players[i];
        ctx.fillText(name, x, LABEL_TOP - 2);
      }

      // Bottom position labels
      const matchCount = Math.floor(N / 4);
      ctx.font = 'bold 10px sans-serif';
      for (let i = 0; i < N; i++) {
        const x = laneX(i);
        let label;
        if (i < matchCount * 4) {
          label = `${Math.floor(i / 4) + 1}코트`;
        } else {
          label = '대기';
        }
        ctx.fillStyle = '#666';
        ctx.fillText(label, x, GRID_BOTTOM + LABEL_BOTTOM);
      }

      // Animated markers
      for (let pi = 0; pi < N; pi++) {
        const { x, y } = getMarker(pi, progress);
        const color = COLORS[pi % COLORS.length];

        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = 'bold 8px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lbl = players[pi].length > 2 ? players[pi].slice(0, 2) : players[pi];
        ctx.fillText(lbl, x, y);
      }

      if (progress < 1) {
        _animFrame = requestAnimationFrame(draw);
      } else {
        _animFrame = null;
        // Final frame: show markers at their final lane
        for (let pi = 0; pi < N; pi++) {
          const fl = finals[pi];
          const x  = laneX(fl);
          const y  = GRID_BOTTOM - 2;
          const color = COLORS[pi % COLORS.length];

          ctx.beginPath();
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.font = 'bold 8px sans-serif';
          ctx.fillStyle = '#fff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lbl = players[pi].length > 2 ? players[pi].slice(0, 2) : players[pi];
          ctx.fillText(lbl, x, y);
        }
        setTimeout(() => onDone(posToPlayer), 200);
      }
    }

    _animFrame = requestAnimationFrame(draw);
  }

  function _genLadder(N, rows) {
    const grid = Array.from({ length: rows }, () => new Array(N - 1).fill(false));
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < N - 1) {
        if (Math.random() < 0.44) {
          grid[r][c] = true;
          c += 2; // skip one to avoid adjacency
        } else {
          c++;
        }
      }
    }
    return grid;
  }

  function _traceLadder(rungs, start, numRows) {
    let lane = start;
    for (let r = 0; r < numRows; r++) {
      if (lane < rungs[r].length && rungs[r][lane])       lane++;
      else if (lane > 0 && rungs[r][lane - 1])            lane--;
    }
    return lane;
  }

  /* ============================================================
     PLINKO GAME  (핀볼)
     ============================================================ */
  function _runPlinko(canvas, players, onDone) {
    const ctx = canvas.getContext('2d');
    const N   = players.length;
    const W   = canvas.width;
    const H   = canvas.height;

    // Pre-determine final slot assignments via Fisher-Yates shuffle
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const PAD      = 16;
    const slotW    = (W - PAD * 2) / N;
    const PEG_ROWS = Math.min(7, Math.max(5, N - 1));
    const TOP_Y    = PAD + 20;
    const BOT_Y    = H - PAD - 24;
    const usableH  = BOT_Y - TOP_Y;

    // Peg positions (staggered triangular grid)
    const pegs = [];
    for (let r = 0; r < PEG_ROWS; r++) {
      const count   = N + 1;
      const offset  = (r % 2 === 0) ? 0 : slotW * 0.5;
      const startX  = PAD + offset;
      for (let c = 0; c < count - (r % 2); c++) {
        pegs.push({
          x: startX + c * slotW,
          y: TOP_Y + (r + 1) * (usableH / (PEG_ROWS + 1))
        });
      }
    }

    // Ball state: all N balls launch sequentially, guided to their target slot
    const balls    = [];
    let launched   = 0;
    let launchTimer = 0;
    const LAUNCH_DELAY = Math.min(600, 3200 / N); // ms between balls

    const GRAVITY = 380;
    const BOUNCE  = 0.28;
    const PEG_R   = 5;
    const BALL_R  = 7;

    function launchNext() {
      if (launched >= N) return;
      const slot    = launched;           // target slot index (in shuffled order)
      const targetX = PAD + (slot + 0.5) * slotW;
      const startX  = targetX + (Math.random() - 0.5) * slotW * 0.6;
      balls.push({
        x: startX, y: TOP_Y - 10,
        vx: (Math.random() - 0.5) * 40,
        vy: 0,
        targetX,
        idx: launched,
        landed: false
      });
      launched++;
    }

    launchNext();

    let lastTs = null;
    let allDone = false;

    function update(dt) {
      launchTimer += dt * 1000;
      if (launchTimer >= LAUNCH_DELAY && launched < N) {
        launchTimer -= LAUNCH_DELAY;
        launchNext();
      }

      for (const b of balls) {
        if (b.landed) continue;

        // Gravity
        b.vy += GRAVITY * dt;

        // Weak horizontal pull toward target slot (subtle guidance)
        const dx = b.targetX - b.x;
        b.vx += dx * 0.8 * dt;
        b.vx += (Math.random() - 0.5) * 60 * dt; // slight noise

        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Peg collisions
        for (const p of pegs) {
          const ddx = b.x - p.x;
          const ddy = b.y - p.y;
          const dist = Math.sqrt(ddx * ddx + ddy * ddy);
          const minD = BALL_R + PEG_R;
          if (dist < minD && dist > 0.01) {
            const nx = ddx / dist;
            const ny = ddy / dist;
            const vDotN = b.vx * nx + b.vy * ny;
            if (vDotN < 0) {
              b.vx -= (1 + BOUNCE) * vDotN * nx;
              b.vy -= (1 + BOUNCE) * vDotN * ny;
            }
            b.x = p.x + nx * (minD + 0.5);
            b.y = p.y + ny * (minD + 0.5);
          }
        }

        // Side walls
        if (b.x < PAD + BALL_R)       { b.x  = PAD + BALL_R;        b.vx = Math.abs(b.vx); }
        if (b.x > W - PAD - BALL_R)   { b.x  = W - PAD - BALL_R;    b.vx = -Math.abs(b.vx); }

        // Bottom
        if (b.y >= BOT_Y - BALL_R) {
          b.y  = BOT_Y - BALL_R;
          b.vy *= -0.25;
          b.vx  = 0;
          if (Math.abs(b.vy) < 40) {
            b.vy = 0;
            b.landed = true;
            b.x = b.targetX; // snap to slot center
          }
        }
      }

      if (balls.length >= N && balls.every(b => b.landed)) allDone = true;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#131620';
      ctx.fillRect(0, 0, W, H);

      const matchCount = Math.floor(N / 4);

      // Slot floors
      ctx.strokeStyle = '#2c3350';
      ctx.lineWidth = 1;
      for (let i = 0; i <= N; i++) {
        const x = PAD + i * slotW;
        ctx.beginPath();
        ctx.moveTo(x, BOT_Y);
        ctx.lineTo(x, H - PAD);
        ctx.stroke();
      }

      // Slot labels
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < N; i++) {
        const x  = PAD + (i + 0.5) * slotW;
        const lbl = i < matchCount * 4 ? `${Math.floor(i / 4) + 1}코트` : '대기';
        ctx.fillStyle = '#555';
        ctx.fillText(lbl, x, H - PAD - 10);

        // Player name if ball landed here
        if (balls[i] && balls[i].landed) {
          const name = shuffled[i].length > 3 ? shuffled[i].slice(0, 3) : shuffled[i];
          ctx.fillStyle = COLORS[i % COLORS.length];
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(name, x, BOT_Y - 12);
          ctx.font = 'bold 9px sans-serif';
        }
      }

      // Pegs
      for (const p of pegs) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, PEG_R, 0, Math.PI * 2);
        ctx.fillStyle = '#4a5070';
        ctx.fill();
      }

      // Balls
      for (const b of balls) {
        const color = COLORS[b.idx % COLORS.length];
        ctx.beginPath();
        ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // "upcoming players" bar at top
      if (launched < N) {
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#888';
        const upcoming = shuffled.slice(launched).join('  ');
        ctx.fillText(`대기: ${upcoming}`, PAD, PAD + 10);
      }
    }

    function loop(ts) {
      if (!lastTs) lastTs = ts;
      const dt = Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;

      if (!allDone) update(dt);
      draw();

      if (!allDone) {
        _animFrame = requestAnimationFrame(loop);
      } else {
        _animFrame = null;
        setTimeout(() => onDone(shuffled), 300);
      }
    }

    _animFrame = requestAnimationFrame(loop);
  }
})();
