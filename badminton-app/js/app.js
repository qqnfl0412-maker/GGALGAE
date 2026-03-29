window.players = [];
window.loss = {};
window.fixedTeams = [];

window.currentMatches = [];
window.currentWaitingPlayers = [];
window.currentRoundPenalties = [];
window.currentRoundHistoryLines = [];

window.round = 1;
window.resultCount = 0;
window.neededResults = 0;

window.currentScoreMatch = -1;
window.roundLocked = false;
window.editMode = false;
window.restoredCompletedRound = false;
window.restoredSnapshotIndex = -1;

window.participantCanSeeNextRound = false;

window.nextRoundRequestId = "";
window.nextRoundRequestedRound = 0;
window.lastHandledNextRoundRequestId = "";

window.teamPairCount = {};
window.opponentPairCount = {};
window.playCount = {};
window.restCount = {};
window.lastRoundPlayed = {};
window.lastRoundRest = {};
window.recentTeammates = [];
window.recentOpponents = [];

window.roundSnapshots = [];

window.supabaseClient = null;
window.currentRoomCode = "";
window.currentHostCode = "";
window.isHost = false;
window.roomChannel = null;
window.matchesChannel = null;
window.isApplyingRemoteState = false;

window.matchSaveTimers = {};
window.suppressRoomReloadUntil = 0;
window.suppressMatchesReloadUntil = 0;
window.localMatchDirtyUntil = {};
window.scoreButtonsLocked = false;
window.scoreInputBusy = false;
window.hostActionBusy = false;

window.currentPage = "home";
window.scoreRefereeMode = false;
window.scoreSidePanelOpen = false;

function pairKey(a, b) {
  return [a, b].sort().join("|");
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
}

function unique(arr) {
  return [...new Set(arr)];
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function combination(arr, k) {
  const result = [];

  function dfs(start, path) {
    if (path.length === k) {
      result.push([...path]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      path.push(arr[i]);
      dfs(i + 1, path);
      path.pop();
    }
  }

  dfs(0, []);
  return result;
}

function ensureHost(actionName = "이 기능") {
  if (!window.isHost) {
    alert(`${actionName}은(는) 방장만 사용할 수 있어.`);
    return false;
  }
  return true;
}

function beginHostAction() {
  if (window.hostActionBusy) return false;
  window.hostActionBusy = true;
  return true;
}

function endHostAction() {
  window.hostActionBusy = false;
}

function markMatchDirty(index, ms = 900) {
  window.localMatchDirtyUntil[index] = Date.now() + ms;
}

function markRoomReloadSuppressed(ms = 350) {
  window.suppressRoomReloadUntil = Date.now() + ms;
}

function markMatchesReloadSuppressed(ms = 700) {
  window.suppressMatchesReloadUntil = Date.now() + ms;
}

function brieflyLockScoreInput(ms = 70) {
  window.scoreInputBusy = true;
  setTimeout(() => {
    window.scoreInputBusy = false;
  }, ms);
}

function setSyncStatus(text) {
  const el = document.getElementById("syncStatus");
  if (el) el.innerText = text;
}

function isCurrentRoundCompleted() {
  if (!window.currentMatches.length) return false;
  return window.currentMatches.every(match => match.finished);
}

function setScoreButtonsDisabled(disabled) {
  window.scoreButtonsLocked = disabled;
  document.querySelectorAll("#page-score button").forEach(btn => {
    const text = (btn.textContent || "").trim();
    if (text === "+1" || text === "점수 되돌리기" || text === "경기 종료") {
      btn.disabled = disabled;
    }
  });
}

function refreshRoundActionButtons() {
  const makeBtn = document.getElementById("makeBtn");
  const nextRoundBtn = document.getElementById("nextRoundBtn");

  if (makeBtn) makeBtn.style.display = "none";
  if (nextRoundBtn) nextRoundBtn.style.display = "none";

  if (window.isHost) {
    if (isCurrentRoundCompleted()) {
      if (nextRoundBtn) nextRoundBtn.style.display = "inline-block";
      return;
    }

    if (window.roundLocked && window.currentMatches.length > 0) {
      return;
    }

    if (makeBtn) makeBtn.style.display = "inline-block";
    return;
  }

  if (window.participantCanSeeNextRound && isCurrentRoundCompleted()) {
    if (nextRoundBtn) nextRoundBtn.style.display = "inline-block";
  }
}

function addHistory(text) {
  if (window.currentRoundHistoryLines[window.currentRoundHistoryLines.length - 1] === text) return;
  window.currentRoundHistoryLines.push(text);
  renderHistory();
}

function renderHistory() {
  const historyEl = document.getElementById("history");
  if (!historyEl) return;

  if (!window.currentRoundHistoryLines.length) {
    historyEl.innerHTML = "";
    return;
  }
  historyEl.innerHTML = window.currentRoundHistoryLines.join("<br>") + "<br>";
}

function parseHistorySections(lines) {
  const sections = {};
  let currentRoundNo = null;

  for (const line of lines || []) {
    const headerMatch = line.match(/^===== Round (\d+) =====$/);
    if (headerMatch) {
      currentRoundNo = Number(headerMatch[1]);
      if (!sections[currentRoundNo]) sections[currentRoundNo] = [];
      sections[currentRoundNo].push(line);
      continue;
    }

    if (currentRoundNo !== null) {
      if (!sections[currentRoundNo]) sections[currentRoundNo] = [];
      sections[currentRoundNo].push(line);
    }
  }

  return sections;
}

function flattenHistorySections(sections) {
  return Object.keys(sections)
    .map(Number)
    .sort((a, b) => a - b)
    .flatMap(r => sections[r]);
}

function getHistoryLinesBeforeRound(lines, roundNo) {
  const sections = parseHistorySections(lines);
  const filtered = {};

  Object.keys(sections).forEach(key => {
    const r = Number(key);
    if (r < roundNo) filtered[r] = sections[r];
  });

  return flattenHistorySections(filtered);
}

function buildRoundSection(roundNo, waitingPlayers, penalties, matches) {
  const section = [];
  section.push(`===== Round ${roundNo} =====`);

  if (waitingPlayers && waitingPlayers.length) {
    section.push(`대기 : ${waitingPlayers.join(" / ")}`);
  }

  (penalties || []).forEach(p => {
    section.push(`[Round ${roundNo}] ${p} 핸디캡 패 +1`);
  });

  (matches || []).forEach(match => {
    if (!match.finished || match.winnerIndex === null) return;

    const teamA = match.teams[0].join("/");
    const teamB = match.teams[1].join("/");
    const winnerText = match.winnerIndex === 0 ? `${teamA} 승` : `${teamB} 승`;

    section.push(
      `[Round ${roundNo}] ${teamA} ${match.scoreA} : ${match.scoreB} ${teamB} (${winnerText})`
    );
  });

  return section;
}

function getCurrentHistoryLines() {
  return deepCopy(window.currentRoundHistoryLines);
}

function getBaseHistoryBeforeCurrentRound() {
  let base = [];

  if (window.restoredCompletedRound) {
    if (window.restoredSnapshotIndex > 0) {
      base = deepCopy(window.roundSnapshots[window.restoredSnapshotIndex - 1].afterCommitState.historyLines || []);
    }
  } else if (window.roundSnapshots.length > 0) {
    base = deepCopy(window.roundSnapshots[window.roundSnapshots.length - 1].afterCommitState.historyLines || []);
  }

  return getHistoryLinesBeforeRound(base, window.round);
}

function getHistorySeedForNewRound() {
  let seed = [];

  if (window.restoredCompletedRound && window.restoredSnapshotIndex >= 0) {
    const snap = window.roundSnapshots[window.restoredSnapshotIndex];
    seed = deepCopy(snap?.afterCommitState?.historyLines || []);
  } else if (window.roundSnapshots.length > 0) {
    seed = deepCopy(window.roundSnapshots[window.roundSnapshots.length - 1].afterCommitState?.historyLines || []);
  }

  return getHistoryLinesBeforeRound(seed, window.round);
}

function updatePenaltyList() {
  const select = document.getElementById("penaltyPlayer");
  if (!select) return;

  const activePlayers = Object.keys(window.loss).filter(name => window.loss[name] < window.APP_CONFIG.game.eliminationLosses);

  if (activePlayers.length === 0) {
    select.innerHTML = `<option value="">선수 없음</option>`;
    return;
  }

  select.innerHTML = activePlayers
    .map(name => `<option value="${name}">${name}</option>`)
    .join("");
}

function updatePlayersPreview() {
  const el = document.getElementById("playersPreview");
  if (!el) return;

  const list = [];
  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const input = document.getElementById("p" + i);
    const name = input ? input.value.trim() : "";
    if (name) list.push(name);
  }

  el.innerHTML = list.length ? list.join(" / ") : "입력된 참가자가 없어.";
}

function getLivePlayCount(name) {
  let count = window.playCount[name] || 0;

  if (window.roundLocked && window.currentMatches.length) {
    const isPlayingNow = window.currentMatches.some(match =>
      match.teams[0].includes(name) || match.teams[1].includes(name)
    );

    if (isPlayingNow) count += 1;
  }

  return count;
}

function getLiveRestCount(name) {
  let count = window.restCount[name] || 0;

  if (window.roundLocked && window.currentWaitingPlayers.includes(name)) {
    count += 1;
  }

  return count;
}

function updateScore() {
  let html = "";
  const names = Object.keys(window.loss);

  if (names.length === 0) {
    html = "기록 없음";
  } else {
    names.sort((a, b) => {
      if (window.loss[b] !== window.loss[a]) return window.loss[b] - window.loss[a];
      return a.localeCompare(b, "ko");
    });

    for (const name of names) {
      const livePlayCount = getLivePlayCount(name);
      const liveRestCount = getLiveRestCount(name);

      let text = `${name} : ${window.loss[name]}패`;
      if (window.loss[name] >= window.APP_CONFIG.game.eliminationLosses) text += " (탈락)";
      text += ` / 출전 ${livePlayCount} / 대기 ${liveRestCount}`;
      html += text + "<br>";
    }
  }

  const scoreEl = document.getElementById("score");
  if (scoreEl) scoreEl.innerHTML = html;
  updatePenaltyList();
  updatePlayersPreview();
}

function collectPlayers() {
  window.players = [];

  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const el = document.getElementById("p" + i);
    if (!el) continue;

    const name = el.value.trim();
    if (!name) continue;

    window.players.push(name);

    if (!(name in window.loss)) window.loss[name] = 0;
    if (!(name in window.playCount)) window.playCount[name] = 0;
    if (!(name in window.restCount)) window.restCount[name] = 0;
    if (!(name in window.lastRoundPlayed)) window.lastRoundPlayed[name] = 0;
    if (!(name in window.lastRoundRest)) window.lastRoundRest[name] = 0;
  }

  window.players = unique(window.players);
  window.players = window.players.filter(name => window.loss[name] < window.APP_CONFIG.game.eliminationLosses);
  updatePlayersPreview();
}

function getPlayerInputs() {
  const arr = [];
  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const el = document.getElementById("p" + i);
    arr.push(el ? el.value.trim() : "");
  }
  return arr;
}

function applyPlayerInputs(arr) {
  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const el = document.getElementById("p" + i);
    if (el) el.value = arr[i - 1] || "";
  }
}

function updateCurrentRoundLabel() {
  const el = document.getElementById("currentRoundLabel");
  if (el) el.innerText = window.round;
}

function isPortraitViewport() {
  return window.innerHeight > window.innerWidth;
}

function updateFloatingRoomStatus() {
  const wrap = document.getElementById("floatingRoomStatus");
  const text = document.getElementById("floatingRoomText");
  const dot = document.getElementById("floatingStatusDot");

  if (!wrap || !text || !dot) return;

  if (window.currentPage === "home" || window.scoreRefereeMode) {
    wrap.classList.remove("show");
    return;
  }

  wrap.classList.add("show");

  if (window.currentRoomCode) {
    text.innerText = `방 ${window.currentRoomCode}`;
    dot.classList.remove("disconnected");
    dot.classList.add("connected");
  } else {
    text.innerText = "미연결";
    dot.classList.remove("connected");
    dot.classList.add("disconnected");
  }
}

function updateHostOnlyUI() {
  document.querySelectorAll(".hostOnly").forEach(el => {
    if (window.isHost) el.classList.remove("hidden-host");
    else el.classList.add("hidden-host");
  });
}

function goPage(name) {
  const prevPage = window.currentPage;
  window.currentPage = name;

  document.querySelectorAll(".page").forEach(el => {
    el.classList.remove("active");
  });

  const target = document.getElementById(`page-${name}`);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.remove("active");
    if (btn.dataset.page === name) btn.classList.add("active");
  });

  if (prevPage === "score" && name !== "score") {
    leaveScoreRefereeMode();
    window.scoreSidePanelOpen = false;
    updateScoreSidePanel();
  }

  if (name === "score") {
    enterScoreRefereeMode();
    window.scoreSidePanelOpen = false;
    updateScoreSidePanel();
  }

  updateFloatingRoomStatus();
  updateScoreOrientationGuide();
  renderScoreMatchList();
}

function resetLocalStateOnly() {
  window.players = [];
  window.loss = {};
  window.fixedTeams = [];

  window.currentMatches = [];
  window.currentWaitingPlayers = [];
  window.currentRoundPenalties = [];
  window.currentRoundHistoryLines = [];

  window.round = 1;
  window.resultCount = 0;
  window.neededResults = 0;

  window.currentScoreMatch = -1;
  window.roundLocked = false;
  window.editMode = false;
  window.restoredCompletedRound = false;
  window.restoredSnapshotIndex = -1;
  window.participantCanSeeNextRound = false;

  window.nextRoundRequestId = "";
  window.nextRoundRequestedRound = 0;
  window.lastHandledNextRoundRequestId = "";

  window.teamPairCount = {};
  window.opponentPairCount = {};
  window.playCount = {};
  window.restCount = {};
  window.lastRoundPlayed = {};
  window.lastRoundRest = {};
  window.recentTeammates = [];
  window.recentOpponents = [];

  window.roundSnapshots = [];

  window.matchSaveTimers = {};
  window.localMatchDirtyUntil = {};
  window.suppressRoomReloadUntil = 0;
  window.suppressMatchesReloadUntil = 0;
  window.scoreInputBusy = false;

  const matchEl = document.getElementById("match");
  const scoreEl = document.getElementById("score");
  const fixedListEl = document.getElementById("fixedList");
  const waitingEl = document.getElementById("waitingPlayers");

  if (matchEl) matchEl.innerHTML = "";
  if (scoreEl) scoreEl.innerHTML = "";
  if (fixedListEl) fixedListEl.innerHTML = "설정된 고정팀 없음";
  if (waitingEl) waitingEl.innerText = "없음";

  renderHistory();
  updatePenaltyList();
  refreshRoundActionButtons();
  updateCurrentRoundLabel();
  updatePlayersPreview();
  renderScoreMatchList();
  updateFloatingRoomStatus();
  clearSelectedMatch();
}

async function resetAll() {
  if (!ensureHost("전체 초기화")) return;
  if (!beginHostAction()) return;

  try {
    if (!window.currentRoomCode) {
      alert("먼저 방에 연결해줘.");
      return;
    }
    if (!confirm("현재 방 상태를 전체 초기화할까요?")) return;

    resetLocalStateOnly();

    const roomMeta = getRoomMetaState();
    const roomPayload = {
      round_no: 1,
      round_locked: false,
      waiting_players: [],
      loss_state: {},
      fixed_teams: [],
      meta_state: roomMeta
    };

    markRoomReloadSuppressed(1200);
    markMatchesReloadSuppressed(1800);

    const { error: roomError } = await window.supabaseClient
      .from("match_rooms")
      .update(roomPayload)
      .eq("room_code", window.currentRoomCode);

    if (roomError) {
      console.error(roomError);
      alert("방 초기화 저장 실패");
      return;
    }

    const { error: deleteError } = await window.supabaseClient
      .from("match_round_matches")
      .delete()
      .eq("room_code", window.currentRoomCode);

    if (deleteError) {
      console.error(deleteError);
      alert("경기 데이터 삭제 실패");
      return;
    }

    alert("전체 초기화했어.");
  } finally {
    endHostAction();
  }
}

async function addFixedTeam() {
  if (!ensureHost("고정팀 추가")) return;
  if (!beginHostAction()) return;

  try {
    const p1 = document.getElementById("fixed1").value.trim();
    const p2 = document.getElementById("fixed2").value.trim();
    const r = parseInt(document.getElementById("fixedRound").value, 10);

    if (!p1 || !p2 || !r) {
      alert("선수 2명과 라운드를 입력해줘.");
      return;
    }

    if (p1 === p2) {
      alert("같은 선수끼리는 고정팀 불가");
      return;
    }

    window.fixedTeams.push({ p1, p2, round: r });
    updateFixedList();
    await saveRoomStateOnly();

    document.getElementById("fixed1").value = "";
    document.getElementById("fixed2").value = "";
    document.getElementById("fixedRound").value = "";
  } finally {
    endHostAction();
  }
}

async function removeFixedTeam(index) {
  if (!ensureHost("고정팀 삭제")) return;
  if (!beginHostAction()) return;

  try {
    window.fixedTeams.splice(index, 1);
    updateFixedList();
    await saveRoomStateOnly();
  } finally {
    endHostAction();
  }
}

function updateFixedList() {
  const el = document.getElementById("fixedList");
  if (!el) return;

  let html = "";

  if (window.fixedTeams.length === 0) {
    html = "설정된 고정팀 없음";
  } else {
    window.fixedTeams.forEach((f, idx) => {
      html += `${f.round}R : ${f.p1} / ${f.p2}`;
      if (window.isHost) {
        html += ` <button onclick="removeFixedTeam(${idx})" style="min-height:auto;padding:4px 8px;font-size:12px;">삭제</button>`;
      }
      html += "<br>";
    });
  }

  el.innerHTML = html;
}

function getRoundFixedTeam(activePlayers) {
  const fixed = window.fixedTeams.find(f => f.round === window.round);
  if (!fixed) return null;
  if (!activePlayers.includes(fixed.p1) || !activePlayers.includes(fixed.p2)) return null;
  return [fixed.p1, fixed.p2];
}

function chooseWaitingPlayers(activePlayers, waitingCount, fixedTeam) {
  if (waitingCount <= 0) return [];

  const candidates = combination(activePlayers, waitingCount);
  let best = null;
  let bestScore = Infinity;

  for (const group of candidates) {
    if (fixedTeam) {
      if (group.includes(fixedTeam[0]) || group.includes(fixedTeam[1])) continue;
    }

    let score = 0;
    for (const p of group) {
      score += (window.restCount[p] || 0) * -30;
      if ((window.lastRoundRest[p] || 0) === window.round - 1) score += 200;
      if ((window.lastRoundPlayed[p] || 0) === window.round - 1) score += -10;
      score += (window.playCount[p] || 0) * -3;
    }

    if (score < bestScore) {
      bestScore = score;
      best = group;
    }
  }

  if (!best) {
    const filtered = activePlayers.filter(p => !fixedTeam || !fixedTeam.includes(p));
    shuffle(filtered);
    best = filtered.slice(0, waitingCount);
  }

  return best;
}

function generatePairings(playersToPair, fixedTeam = null) {
  const results = [];

  function helper(remaining, currentTeams) {
    if (remaining.length === 0) {
      results.push(currentTeams.map(team => [...team]));
      return;
    }

    const first = remaining[0];
    for (let i = 1; i < remaining.length; i++) {
      const second = remaining[i];
      const team = [first, second];
      const rest = remaining.filter((_, idx) => idx !== 0 && idx !== i);
      helper(rest, [...currentTeams, team]);
    }
  }

  if (fixedTeam) {
    const remaining = playersToPair.filter(p => !fixedTeam.includes(p));
    helper(remaining, [fixedTeam]);
  } else {
    helper(playersToPair, []);
  }

  return results;
}

function pairTeamsIntoMatches(teams) {
  if (teams.length === 2) return [[[teams[0], teams[1]]]];

  if (teams.length === 4) {
    return [
      [[teams[0], teams[1]], [teams[2], teams[3]]],
      [[teams[0], teams[2]], [teams[1], teams[3]]],
      [[teams[0], teams[3]], [teams[1], teams[2]]]
    ];
  }

  return [];
}

function getTeamPenalty(team) {
  const [a, b] = team;
  const key = pairKey(a, b);
  let penalty = 0;

  penalty += (window.teamPairCount[key] || 0) * 100;
  for (const recent of window.recentTeammates) {
    if (recent === key) penalty += 50;
  }

  return penalty;
}

function getOpponentPenalty(teamA, teamB) {
  let penalty = 0;

  for (const a of teamA) {
    for (const b of teamB) {
      const key = pairKey(a, b);
      penalty += (window.opponentPairCount[key] || 0) * 20;
      for (const recent of window.recentOpponents) {
        if (recent === key) penalty += 10;
      }
    }
  }

  return penalty;
}

function getBalancePenalty(playingPlayers, waitingPlayers) {
  let penalty = 0;

  for (const p of playingPlayers) {
    penalty += (window.playCount[p] || 0) * 2;
    if ((window.lastRoundPlayed[p] || 0) === window.round - 1) penalty += 2;
  }

  for (const p of waitingPlayers) {
    penalty += (window.restCount[p] || 0) * -5;
  }

  return penalty;
}

function chooseBestSchedule(activePlayers) {
  let matchCount = Math.floor(activePlayers.length / 4);
  if (matchCount > window.APP_CONFIG.game.maxCourts) matchCount = window.APP_CONFIG.game.maxCourts;

  const neededPlayers = matchCount * 4;
  const waitingCount = activePlayers.length - neededPlayers;
  const fixedTeam = getRoundFixedTeam(activePlayers);

  const waitingPlayers = chooseWaitingPlayers(activePlayers, waitingCount, fixedTeam);
  const playingPlayers = activePlayers.filter(p => !waitingPlayers.includes(p));

  const allTeamCombos = generatePairings(playingPlayers, fixedTeam);
  let bestPlan = null;
  let bestScore = Infinity;

  for (const teams of allTeamCombos) {
    if (teams.length !== neededPlayers / 2) continue;

    const matchSets = pairTeamsIntoMatches(teams);

    for (const matchSet of matchSets) {
      let score = 0;

      for (const m of matchSet) {
        const t1 = m[0];
        const t2 = m[1];
        score += getTeamPenalty(t1);
        score += getTeamPenalty(t2);
        score += getOpponentPenalty(t1, t2);
      }

      score += getBalancePenalty(playingPlayers, waitingPlayers);

      if (score < bestScore) {
        bestScore = score;
        bestPlan = {
          waitingPlayers: [...waitingPlayers],
          matches: matchSet.map((m, idx) => ({
            dbId: null,
            matchIndex: idx,
            teams: [[...m[0]], [...m[1]]],
            finished: false,
            scoreA: 0,
            scoreB: 0,
            scoreHistory: [],
            winnerIndex: null
          }))
        };
      }
    }
  }

  return bestPlan;
}

function matchHTML(i, t1, t2) {
  const courtLabel = `${i + 1}코트`;
  const match = window.currentMatches[i];
  const scoreText = match ? `${match.scoreA} : ${match.scoreB}` : "0 : 0";

  return `
    <div class="match" id="matchBox${i}" onclick="openScoreFromScorePage(${i})">
      <div class="courtBadge">${courtLabel}</div>
      <b>${t1.join(" / ")} VS ${t2.join(" / ")}</b>
      <div class="small">현재 점수: ${scoreText}</div>
      <div class="small">클릭해서 점수 입력 / 종료 후 다시 클릭하면 수정 가능</div>
    </div>
  `;
}

function renderMatches() {
  const matchEl = document.getElementById("match");
  if (!matchEl) return;

  let html = `<h3 style="margin-top:0;">Round ${window.round}</h3>`;

  window.currentMatches.forEach((m, i) => {
    html += matchHTML(i, m.teams[0], m.teams[1]);
  });

  if (!window.currentMatches.length) {
    html += `<div class="small">진행 중인 경기 없음</div>`;
  }

  matchEl.innerHTML = html;

  const waitingEl = document.getElementById("waitingPlayers");
  if (waitingEl) {
    waitingEl.innerText = window.currentWaitingPlayers.length ? window.currentWaitingPlayers.join(" / ") : "없음";
  }

  window.currentMatches.forEach((m, i) => {
    if (m.finished) updateMatchBox(i);
  });

  refreshRoundActionButtons();
  updateCurrentRoundLabel();
  renderScoreMatchList();
}

function updateMatchBox(index) {
  const box = document.getElementById("matchBox" + index);
  if (!box) return;

  const match = window.currentMatches[index];
  const teamA = match.teams[0].join(" / ");
  const teamB = match.teams[1].join(" / ");
  const courtLabel = `${index + 1}코트`;

  if (match.finished && match.winnerIndex !== null) {
    const winnerText = match.winnerIndex === 0 ? `${teamA} 승` : `${teamB} 승`;

    box.classList.add("done");
    box.innerHTML = `
      <div class="courtBadge">${courtLabel}</div>
      <b>${teamA} VS ${teamB}</b>
      <div class="winnerText">경기 종료 - ${winnerText}</div>
      <div class="small">현재 점수: ${match.scoreA} : ${match.scoreB}</div>
      <div class="small">클릭하면 결과 수정 가능</div>
    `;
  } else {
    box.classList.remove("done");
    box.innerHTML = `
      <div class="courtBadge">${courtLabel}</div>
      <b>${teamA} VS ${teamB}</b>
      <div class="small">현재 점수: ${match.scoreA} : ${match.scoreB}</div>
      <div class="small">클릭해서 점수 입력 / 종료 후 다시 클릭하면 수정 가능</div>
    `;
  }
}

function getRoomMetaState() {
  return {
    playerInputs: getPlayerInputs(),
    teamPairCount: deepCopy(window.teamPairCount),
    opponentPairCount: deepCopy(window.opponentPairCount),
    playCount: deepCopy(window.playCount),
    restCount: deepCopy(window.restCount),
    lastRoundPlayed: deepCopy(window.lastRoundPlayed),
    lastRoundRest: deepCopy(window.lastRoundRest),
    recentTeammates: deepCopy(window.recentTeammates),
    recentOpponents: deepCopy(window.recentOpponents),
    roundSnapshots: deepCopy(window.roundSnapshots),
    currentRoundPenalties: deepCopy(window.currentRoundPenalties),
    resultCount: window.resultCount,
    neededResults: window.neededResults,
    restoredCompletedRound: window.restoredCompletedRound,
    restoredSnapshotIndex: window.restoredSnapshotIndex,
    nextRoundRequestId: window.nextRoundRequestId,
    nextRoundRequestedRound: window.nextRoundRequestedRound
  };
}

async function saveRoomStateOnly() {
  if (!window.supabaseClient || !window.currentRoomCode || window.isApplyingRemoteState) return;

  markRoomReloadSuppressed(400);

  const roomPayload = {
    round_no: window.round,
    round_locked: window.roundLocked,
    waiting_players: deepCopy(window.currentWaitingPlayers),
    loss_state: deepCopy(window.loss),
    fixed_teams: deepCopy(window.fixedTeams),
    meta_state: getRoomMetaState()
  };

  const { error } = await window.supabaseClient
    .from("match_rooms")
    .update(roomPayload)
    .eq("room_code", window.currentRoomCode);

  if (error) {
    console.error(error);
    setSyncStatus("방 상태 저장 실패");
  } else {
    setSyncStatus("실시간 반영 중");
  }
}

async function saveSingleMatchToServer(index) {
  if (!window.supabaseClient || !window.currentRoomCode || !window.currentMatches[index]) return;

  const match = window.currentMatches[index];
  const payload = {
    room_code: window.currentRoomCode,
    round_no: window.round,
    match_index: index,
    team_a: deepCopy(match.teams[0]),
    team_b: deepCopy(match.teams[1]),
    score_a: match.scoreA,
    score_b: match.scoreB,
    finished: !!match.finished,
    winner_index: match.winnerIndex,
    score_history: deepCopy(match.scoreHistory || [])
  };

  markMatchesReloadSuppressed(700);

  const { data, error } = await window.supabaseClient
    .from("match_round_matches")
    .upsert(payload, { onConflict: "room_code,round_no,match_index" })
    .select();

  if (error) {
    console.error(error);
    setSyncStatus("경기 저장 실패");
    return;
  }

  if (data && data[0] && window.currentMatches[index]) {
    window.currentMatches[index].dbId = data[0].id;
  }

  setSyncStatus("실시간 반영 중");
}

function scheduleMatchSave(index, delay = 220) {
  if (!window.currentMatches[index]) return;

  if (window.matchSaveTimers[index]) {
    clearTimeout(window.matchSaveTimers[index]);
  }

  window.matchSaveTimers[index] = setTimeout(async () => {
    window.matchSaveTimers[index] = null;
    await saveSingleMatchToServer(index);
  }, delay);
}

async function flushMatchSave(index) {
  if (window.matchSaveTimers[index]) {
    clearTimeout(window.matchSaveTimers[index]);
    window.matchSaveTimers[index] = null;
  }
  await saveSingleMatchToServer(index);
}

async function replaceAllMatchesOnServer() {
  if (!window.supabaseClient || !window.currentRoomCode) return false;

  markMatchesReloadSuppressed(1600);

  const { error: deleteError } = await window.supabaseClient
    .from("match_round_matches")
    .delete()
    .eq("room_code", window.currentRoomCode)
    .eq("round_no", window.round);

  if (deleteError) {
    console.error(deleteError);
    alert("기존 경기 삭제 실패");
    return false;
  }

  if (!window.currentMatches.length) return true;

  const payload = window.currentMatches.map((m, idx) => ({
    room_code: window.currentRoomCode,
    round_no: window.round,
    match_index: idx,
    team_a: deepCopy(m.teams[0]),
    team_b: deepCopy(m.teams[1]),
    score_a: m.scoreA,
    score_b: m.scoreB,
    finished: !!m.finished,
    winner_index: m.winnerIndex,
    score_history: deepCopy(m.scoreHistory || [])
  }));

  const { data, error } = await window.supabaseClient
    .from("match_round_matches")
    .insert(payload)
    .select();

  if (error) {
    console.error(error);
    alert("새 경기 저장 실패");
    return false;
  }

  data.forEach((row, idx) => {
    if (window.currentMatches[idx]) window.currentMatches[idx].dbId = row.id;
  });

  return true;
}

function getPreCommitStateFromCurrentRound() {
  return {
    round: window.round,
    loss: deepCopy(window.loss),
    teamPairCount: deepCopy(window.teamPairCount),
    opponentPairCount: deepCopy(window.opponentPairCount),
    playCount: deepCopy(window.playCount),
    restCount: deepCopy(window.restCount),
    lastRoundPlayed: deepCopy(window.lastRoundPlayed),
    lastRoundRest: deepCopy(window.lastRoundRest),
    recentTeammates: deepCopy(window.recentTeammates),
    recentOpponents: deepCopy(window.recentOpponents),
    currentMatches: deepCopy(window.currentMatches),
    currentWaitingPlayers: deepCopy(window.currentWaitingPlayers),
    currentRoundPenalties: deepCopy(window.currentRoundPenalties),
    resultCount: window.resultCount,
    neededResults: window.neededResults,
    historyLines: getCurrentHistoryLines()
  };
}

function buildCommittedStateFromRoundState(preState) {
  const s = deepCopy(preState);

  let playedPlayers = [];
  s.currentMatches.forEach(match => {
    match.teams[0].forEach(p => playedPlayers.push(p));
    match.teams[1].forEach(p => playedPlayers.push(p));
  });
  playedPlayers = unique(playedPlayers);

  for (const p of playedPlayers) {
    s.playCount[p] = (s.playCount[p] || 0) + 1;
    s.lastRoundPlayed[p] = s.round;
  }

  for (const p of s.currentWaitingPlayers) {
    s.restCount[p] = (s.restCount[p] || 0) + 1;
    s.lastRoundRest[p] = s.round;
  }

  for (const match of s.currentMatches) {
    const t1 = match.teams[0];
    const t2 = match.teams[1];

    const teamKey1 = pairKey(t1[0], t1[1]);
    const teamKey2 = pairKey(t2[0], t2[1]);

    s.teamPairCount[teamKey1] = (s.teamPairCount[teamKey1] || 0) + 1;
    s.teamPairCount[teamKey2] = (s.teamPairCount[teamKey2] || 0) + 1;

    s.recentTeammates.push(teamKey1, teamKey2);

    for (const a of t1) {
      for (const b of t2) {
        const key = pairKey(a, b);
        s.opponentPairCount[key] = (s.opponentPairCount[key] || 0) + 1;
        s.recentOpponents.push(key);
      }
    }
  }

  if (s.recentTeammates.length > 20) s.recentTeammates = s.recentTeammates.slice(-20);
  if (s.recentOpponents.length > 40) s.recentOpponents = s.recentOpponents.slice(-40);

  return {
    round: s.round,
    loss: deepCopy(s.loss),
    teamPairCount: deepCopy(s.teamPairCount),
    opponentPairCount: deepCopy(s.opponentPairCount),
    playCount: deepCopy(s.playCount),
    restCount: deepCopy(s.restCount),
    lastRoundPlayed: deepCopy(s.lastRoundPlayed),
    lastRoundRest: deepCopy(s.lastRoundRest),
    recentTeammates: deepCopy(s.recentTeammates),
    recentOpponents: deepCopy(s.recentOpponents),
    historyLines: deepCopy(s.historyLines)
  };
}

function applyAfterCommitState(afterState) {
  window.loss = deepCopy(afterState.loss);
  window.teamPairCount = deepCopy(afterState.teamPairCount);
  window.opponentPairCount = deepCopy(afterState.opponentPairCount);
  window.playCount = deepCopy(afterState.playCount);
  window.restCount = deepCopy(afterState.restCount);
  window.lastRoundPlayed = deepCopy(afterState.lastRoundPlayed);
  window.lastRoundRest = deepCopy(afterState.lastRoundRest);
  window.recentTeammates = deepCopy(afterState.recentTeammates);
  window.recentOpponents = deepCopy(afterState.recentOpponents);
}

function saveRestoredCompletedRoundSnapshot() {
  if (window.restoredSnapshotIndex < 0) return;

  const completedRoundState = getPreCommitStateFromCurrentRound();
  const afterCommitState = buildCommittedStateFromRoundState(completedRoundState);

  window.roundSnapshots[window.restoredSnapshotIndex] = {
    completedRoundState,
    afterCommitState
  };
}

function syncRestoredSnapshotIfNeeded() {
  if (!window.restoredCompletedRound) return;
  saveRestoredCompletedRoundSnapshot();
}

function rebuildRoundState() {
  collectPlayers();

  let baseLoss = {};
  Object.keys(window.loss).forEach(name => {
    baseLoss[name] = 0;
  });

  if (window.restoredCompletedRound) {
    if (window.restoredSnapshotIndex > 0) {
      const prevSnapshot = window.roundSnapshots[window.restoredSnapshotIndex - 1];
      baseLoss = deepCopy(prevSnapshot.afterCommitState.loss);

      Object.keys(window.loss).forEach(name => {
        if (!(name in baseLoss)) baseLoss[name] = 0;
      });
    }
  } else if (window.roundSnapshots.length > 0) {
    const lastCommitted = window.roundSnapshots[window.roundSnapshots.length - 1];
    baseLoss = deepCopy(lastCommitted.afterCommitState.loss);

    Object.keys(window.loss).forEach(name => {
      if (!(name in baseLoss)) baseLoss[name] = 0;
    });
  }

  window.currentRoundPenalties.forEach(p => {
    if (!(p in baseLoss)) baseLoss[p] = 0;
    baseLoss[p]++;
  });

  window.currentMatches.forEach(match => {
    if (match.finished && match.winnerIndex !== null) {
      const loserTeam = match.teams[match.winnerIndex === 0 ? 1 : 0];
      loserTeam.forEach(p => {
        if (!(p in baseLoss)) baseLoss[p] = 0;
        baseLoss[p]++;
      });
    }
  });

  let historySeed = getBaseHistoryBeforeCurrentRound();
  historySeed = getHistoryLinesBeforeRound(historySeed, window.round);

  const currentRoundSection = buildRoundSection(
    window.round,
    window.currentWaitingPlayers,
    window.currentRoundPenalties,
    window.currentMatches
  );

  const historyLines = [...historySeed, ...currentRoundSection];

  window.loss = baseLoss;
  window.currentRoundHistoryLines = historyLines;
  renderHistory();
}

async function addPenalty() {
  if (!ensureHost("핸디캡 패 추가")) return;
  if (!beginHostAction()) return;

  try {
    if (!window.roundLocked) {
      alert("진행 중인 라운드가 없어서 핸디캡 패를 추가할 수 없어.");
      return;
    }

    const finishedCount = window.currentMatches.filter(m => m.finished).length;
    if (!window.restoredCompletedRound && window.neededResults > 0 && finishedCount >= window.neededResults) {
      alert("이미 완료된 라운드야. 다음 라운드를 시작하거나 이전 완료 라운드로 복구 후 수정해줘.");
      return;
    }

    const p = document.getElementById("penaltyPlayer").value;
    if (!p) return;

    window.currentRoundPenalties.push(p);
    rebuildRoundState();
    updateScore();
    await saveRoomStateOnly();
  } finally {
    endHostAction();
  }
}

async function makeMatch(skipHostBusyCheck = false) {
  if (!ensureHost("대진 생성")) return;

  if (!skipHostBusyCheck) {
    if (!beginHostAction()) return;
  }

  try {
    if (!window.currentRoomCode) {
      alert("먼저 방에 연결해줘.");
      return;
    }

    const pendingIndexes = Object.keys(window.matchSaveTimers)
      .filter(key => !!window.matchSaveTimers[key])
      .map(Number);

    for (const idx of pendingIndexes) {
      await flushMatchSave(idx);
    }

    if (window.roundLocked) {
      const finishedCount = window.currentMatches.filter(m => m.finished).length;

      if (window.neededResults > 0 && finishedCount >= window.neededResults) {
        window.roundLocked = false;
      } else {
        alert("현재 라운드가 아직 끝나지 않았어.");
        return;
      }
    }

    collectPlayers();

    if (window.players.length < 4) {
      const matchEl = document.getElementById("match");
      if (matchEl) matchEl.innerHTML = "<b>경기 종료</b>";
      alert("경기할 인원이 부족해.");
      return;
    }

    const plan = chooseBestSchedule(window.players);
    if (!plan || !plan.matches.length) {
      alert("대진 생성 실패");
      return;
    }

    window.resultCount = 0;
    window.neededResults = plan.matches.length;
    window.currentMatches = plan.matches;
    window.currentWaitingPlayers = plan.waitingPlayers;
    window.currentRoundPenalties = [];
    window.roundLocked = true;
    window.participantCanSeeNextRound = false;
    window.nextRoundRequestId = "";
    window.nextRoundRequestedRound = 0;
    refreshRoundActionButtons();

    window.currentRoundHistoryLines = getHistorySeedForNewRound();
    addHistory(`===== Round ${window.round} =====`);
    if (window.currentWaitingPlayers.length) {
      addHistory(`대기 : ${window.currentWaitingPlayers.join(" / ")}`);
    }

    renderMatches();
    updateScore();

    const ok = await replaceAllMatchesOnServer();
    if (!ok) return;
    await saveRoomStateOnly();
    setTimeout(() => loadRoomStateFromServer(), 150);
  } finally {
    if (!skipHostBusyCheck) {
      endHostAction();
    }
  }
}

async function requestNextRoundFromParticipant() {
  if (!window.supabaseClient || !window.currentRoomCode) {
    alert("방 연결이 필요해.");
    return;
  }

  if (!window.participantCanSeeNextRound || !isCurrentRoundCompleted()) {
    alert("지금은 다음 라운드를 요청할 수 없어.");
    return;
  }

  window.nextRoundRequestId = `REQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  window.nextRoundRequestedRound = window.round;
  window.participantCanSeeNextRound = false;
  refreshRoundActionButtons();

  await saveRoomStateOnly();
  setTimeout(() => loadRoomStateFromServer(), 150);
  alert("다음 라운드 요청을 보냈어.");
}

async function goNextRound() {
  if (!window.isHost) {
    await requestNextRoundFromParticipant();
    return;
  }

  if (!isCurrentRoundCompleted()) {
    alert("현재 라운드가 아직 끝나지 않았어.");
    return;
  }

  if (!beginHostAction()) return;

  window.participantCanSeeNextRound = false;

  try {
    const pendingIndexes = Object.keys(window.matchSaveTimers)
      .filter(key => !!window.matchSaveTimers[key])
      .map(Number);

    for (const idx of pendingIndexes) {
      await flushMatchSave(idx);
    }

    window.nextRoundRequestId = "";
    window.nextRoundRequestedRound = 0;

    if (window.restoredCompletedRound) {
      saveRestoredCompletedRoundSnapshot();
      window.roundSnapshots = window.roundSnapshots.slice(0, window.restoredSnapshotIndex + 1);

      const savedSnapshot = window.roundSnapshots[window.restoredSnapshotIndex];
      applyAfterCommitState(savedSnapshot.afterCommitState);

      window.restoredCompletedRound = false;
      window.restoredSnapshotIndex = -1;
      window.round = savedSnapshot.afterCommitState.round + 1;
    } else {
      window.round++;
    }

    window.currentMatches = [];
    window.currentWaitingPlayers = [];
    window.currentRoundPenalties = [];
    window.resultCount = 0;
    window.neededResults = 0;
    window.roundLocked = false;

    markMatchesReloadSuppressed(1600);
    markRoomReloadSuppressed(900);

    renderMatches();
    updateScore();
    refreshRoundActionButtons();
    clearSelectedMatch();

    await saveRoomStateOnly();
    await makeMatch(true);
    setTimeout(() => loadRoomStateFromServer(), 150);
  } finally {
    endHostAction();
  }
}

function commitRoundStats() {
  let playedPlayers = [];

  window.currentMatches.forEach(match => {
    match.teams[0].forEach(p => playedPlayers.push(p));
    match.teams[1].forEach(p => playedPlayers.push(p));
  });

  playedPlayers = unique(playedPlayers);

  for (const p of playedPlayers) {
    window.playCount[p] = (window.playCount[p] || 0) + 1;
    window.lastRoundPlayed[p] = window.round;
  }

  for (const p of window.currentWaitingPlayers) {
    window.restCount[p] = (window.restCount[p] || 0) + 1;
    window.lastRoundRest[p] = window.round;
  }

  for (const match of window.currentMatches) {
    const t1 = match.teams[0];
    const t2 = match.teams[1];

    const teamKey1 = pairKey(t1[0], t1[1]);
    const teamKey2 = pairKey(t2[0], t2[1]);

    window.teamPairCount[teamKey1] = (window.teamPairCount[teamKey1] || 0) + 1;
    window.teamPairCount[teamKey2] = (window.teamPairCount[teamKey2] || 0) + 1;

    window.recentTeammates.push(teamKey1, teamKey2);

    for (const a of t1) {
      for (const b of t2) {
        const key = pairKey(a, b);
        window.opponentPairCount[key] = (window.opponentPairCount[key] || 0) + 1;
        window.recentOpponents.push(key);
      }
    }
  }

  if (window.recentTeammates.length > 20) window.recentTeammates = window.recentTeammates.slice(-20);
  if (window.recentOpponents.length > 40) window.recentOpponents = window.recentOpponents.slice(-40);
}

async function checkRoundEnd() {
  if (window.resultCount < window.neededResults) return;

  const completedRoundState = getPreCommitStateFromCurrentRound();

  commitRoundStats();
  updateScore();

  const afterCommitState = {
    round: window.round,
    loss: deepCopy(window.loss),
    teamPairCount: deepCopy(window.teamPairCount),
    opponentPairCount: deepCopy(window.opponentPairCount),
    playCount: deepCopy(window.playCount),
    restCount: deepCopy(window.restCount),
    lastRoundPlayed: deepCopy(window.lastRoundPlayed),
    lastRoundRest: deepCopy(window.lastRoundRest),
    recentTeammates: deepCopy(window.recentTeammates),
    recentOpponents: deepCopy(window.recentOpponents),
    historyLines: getCurrentHistoryLines()
  };

  window.roundSnapshots.push({
    completedRoundState,
    afterCommitState
  });

  window.restoredCompletedRound = false;
  window.restoredSnapshotIndex = -1;
  window.currentRoundPenalties = [];
  window.roundLocked = false;

  renderMatches();
  updateScore();
  refreshRoundActionButtons();

  collectPlayers();
  await saveRoomStateOnly();
  setTimeout(() => loadRoomStateFromServer(), 150);

  if (window.players.filter(p => window.loss[p] < window.APP_CONFIG.game.eliminationLosses).length < 4) {
    const matchEl = document.getElementById("match");
    if (matchEl) matchEl.innerHTML += `<div><b>경기 종료</b></div>`;
  }
}

async function undoRound() {
  if (!ensureHost("이전 완료 라운드 복구")) return;
  if (!beginHostAction()) return;

  try {
    if (window.roundSnapshots.length === 0) {
      alert("되돌릴 이전 완료 라운드가 없어.");
      return;
    }

    let targetIndex;

    if (window.restoredCompletedRound) {
      targetIndex = window.restoredSnapshotIndex - 1;
    } else {
      targetIndex = window.roundSnapshots.length - 1;
    }

    if (targetIndex < 0) {
      alert("더 이전 완료 라운드는 없어.");
      return;
    }

    let message = "이전 완료 라운드로 복구할까요?";
    if (window.roundLocked && !window.restoredCompletedRound) {
      message = `현재 Round ${window.round} 진행 내용은 버리고, 이전 완료 라운드로 복구할까요?`;
    }

    if (!confirm(message)) return;

    window.restoredSnapshotIndex = targetIndex;
    const snapshot = window.roundSnapshots[window.restoredSnapshotIndex];
    const state = snapshot.completedRoundState;

    window.round = state.round;
    window.loss = deepCopy(state.loss);
    window.teamPairCount = deepCopy(state.teamPairCount);
    window.opponentPairCount = deepCopy(state.opponentPairCount);
    window.playCount = deepCopy(state.playCount);
    window.restCount = deepCopy(state.restCount);
    window.lastRoundPlayed = deepCopy(state.lastRoundPlayed);
    window.lastRoundRest = deepCopy(state.lastRoundRest);
    window.recentTeammates = deepCopy(state.recentTeammates);
    window.recentOpponents = deepCopy(state.recentOpponents);

    window.currentMatches = deepCopy(state.currentMatches);
    window.currentWaitingPlayers = deepCopy(state.currentWaitingPlayers);
    window.currentRoundPenalties = deepCopy(state.currentRoundPenalties);
    window.currentRoundHistoryLines = deepCopy(state.historyLines);

    window.resultCount = state.resultCount;
    window.neededResults = state.neededResults;

    window.currentScoreMatch = -1;
    window.editMode = false;
    window.roundLocked = true;
    window.restoredCompletedRound = true;
    window.participantCanSeeNextRound = false;
    window.nextRoundRequestId = "";
    window.nextRoundRequestedRound = 0;

    renderHistory();
    renderMatches();
    updateScore();
    clearSelectedMatch();

    markMatchesReloadSuppressed(1600);

    const ok = await replaceAllMatchesOnServer();
    if (!ok) return;
    await saveRoomStateOnly();
    setTimeout(() => loadRoomStateFromServer(), 150);

    alert(`Round ${window.round} 상태로 복구했어.`);
  } finally {
    endHostAction();
  }
}

function buildHistoryFromServerState(room, matches) {
  const meta = room.meta_state || {};
  const snaps = deepCopy(meta.roundSnapshots || []);

  let seed = [];

  if (room.round_locked) {
    if (meta.restoredCompletedRound && meta.restoredSnapshotIndex > 0) {
      seed = deepCopy(
        snaps[meta.restoredSnapshotIndex - 1]?.afterCommitState?.historyLines || []
      );
    } else if (snaps.length > 0) {
      seed = deepCopy(snaps[snaps.length - 1]?.afterCommitState?.historyLines || []);
    }

    seed = getHistoryLinesBeforeRound(seed, room.round_no);

    const currentRoundMatches = (matches || []).map((m, idx) => ({
      matchIndex: idx,
      teams: [deepCopy(m.team_a || []), deepCopy(m.team_b || [])],
      finished: !!m.finished,
      scoreA: m.score_a || 0,
      scoreB: m.score_b || 0,
      winnerIndex: typeof m.winner_index === "number" ? m.winner_index : null
    }));

    return [
      ...seed,
      ...buildRoundSection(
        room.round_no,
        room.waiting_players || [],
        meta.currentRoundPenalties || [],
        currentRoundMatches
      )
    ];
  }

  if (snaps.length > 0) {
    return deepCopy(snaps[snaps.length - 1]?.afterCommitState?.historyLines || []);
  }

  return [];
}

function shouldKeepLocalMatch(local, serverRow, idx) {
  if (!local || !serverRow) return false;

  const pendingSave = !!window.matchSaveTimers[idx];
  const dirty = Date.now() < (window.localMatchDirtyUntil[idx] || 0);

  if (!pendingSave && !dirty) return false;

  const localScoreSame =
    local.scoreA === (serverRow.score_a || 0) &&
    local.scoreB === (serverRow.score_b || 0) &&
    !!local.finished === !!serverRow.finished &&
    (local.winnerIndex ?? null) ===
      (typeof serverRow.winner_index === "number" ? serverRow.winner_index : null);

  if (localScoreSame) return false;

  return true;
}

function maybeHandleParticipantNextRoundRequest() {
  if (!window.isHost) return;
  if (!window.nextRoundRequestId) return;
  if (window.nextRoundRequestedRound !== window.round) return;
  if (!isCurrentRoundCompleted()) return;
  if (window.lastHandledNextRoundRequestId === window.nextRoundRequestId) return;
  if (window.hostActionBusy) return;

  window.lastHandledNextRoundRequestId = window.nextRoundRequestId;

  setTimeout(async () => {
    if (!window.isHost) return;
    if (!window.nextRoundRequestId) return;
    if (window.nextRoundRequestedRound !== window.round) return;
    if (!isCurrentRoundCompleted()) return;
    await goNextRound();
  }, 80);
}

async function loadRoomStateFromServer() {
  if (!window.currentRoomCode || !window.supabaseClient) return;

  window.isApplyingRemoteState = true;
  setSyncStatus("서버에서 불러오는 중...");

  const { data: room, error: roomError } = await window.supabaseClient
    .from("match_rooms")
    .select("*")
    .eq("room_code", window.currentRoomCode)
    .maybeSingle();

  if (roomError || !room) {
    console.error(roomError);
    setSyncStatus("방 상태 불러오기 실패");
    window.isApplyingRemoteState = false;
    return;
  }

  const { data: matches, error: matchesError } = await window.supabaseClient
    .from("match_round_matches")
    .select("*")
    .eq("room_code", window.currentRoomCode)
    .eq("round_no", room.round_no)
    .order("match_index", { ascending: true });

  if (matchesError) {
    console.error(matchesError);
    setSyncStatus("경기 상태 불러오기 실패");
    window.isApplyingRemoteState = false;
    return;
  }

  const previousLocalMatches = deepCopy(window.currentMatches);

  window.round = room.round_no;
  window.roundLocked = room.round_locked;
  window.currentWaitingPlayers = deepCopy(room.waiting_players || []);
  window.loss = deepCopy(room.loss_state || {});
  window.fixedTeams = deepCopy(room.fixed_teams || []);

  const meta = room.meta_state || {};
  applyPlayerInputs(meta.playerInputs || []);
  window.teamPairCount = deepCopy(meta.teamPairCount || {});
  window.opponentPairCount = deepCopy(meta.opponentPairCount || {});
  window.playCount = deepCopy(meta.playCount || {});
  window.restCount = deepCopy(meta.restCount || {});
  window.lastRoundPlayed = deepCopy(meta.lastRoundPlayed || {});
  window.lastRoundRest = deepCopy(meta.lastRoundRest || {});
  window.recentTeammates = deepCopy(meta.recentTeammates || []);
  window.recentOpponents = deepCopy(meta.recentOpponents || []);
  window.roundSnapshots = deepCopy(meta.roundSnapshots || []);
  window.currentRoundPenalties = deepCopy(meta.currentRoundPenalties || []);
  window.resultCount = meta.resultCount || 0;
  window.neededResults = meta.neededResults || 0;
  window.restoredCompletedRound = !!meta.restoredCompletedRound;
  window.restoredSnapshotIndex = typeof meta.restoredSnapshotIndex === "number" ? meta.restoredSnapshotIndex : -1;
  window.nextRoundRequestId = meta.nextRoundRequestId || "";
  window.nextRoundRequestedRound = meta.nextRoundRequestedRound || 0;

  window.currentMatches = (matches || []).map((m, idx) => {
    const local = previousLocalMatches[idx];

    if (shouldKeepLocalMatch(local, m, idx) && local && local.matchIndex === idx) {
      return {
        dbId: m.id,
        matchIndex: idx,
        teams: [deepCopy(m.team_a || []), deepCopy(m.team_b || [])],
        finished: local.finished,
        scoreA: local.scoreA,
        scoreB: local.scoreB,
        scoreHistory: deepCopy(local.scoreHistory || []),
        winnerIndex: local.winnerIndex
      };
    }

    return {
      dbId: m.id,
      matchIndex: idx,
      teams: [deepCopy(m.team_a || []), deepCopy(m.team_b || [])],
      finished: !!m.finished,
      scoreA: m.score_a || 0,
      scoreB: m.score_b || 0,
      scoreHistory: deepCopy(m.score_history || []),
      winnerIndex: typeof m.winner_index === "number" ? m.winner_index : null
    };
  });

  window.currentRoundHistoryLines = buildHistoryFromServerState(room, matches || []);

  collectPlayers();
  updateFixedList();
  renderHistory();
  renderMatches();
  updateScore();
  updateRoomInfo();
  updateCurrentRoundLabel();
  updatePlayersPreview();
  renderScoreMatchList();
  updateFloatingRoomStatus();
  updateHostOnlyUI();
  updateScoreOrientationGuide();

  if (!isCurrentRoundCompleted()) {
    window.participantCanSeeNextRound = false;
  }

  refreshRoundActionButtons();

  if (window.currentScoreMatch >= 0 && window.currentMatches[window.currentScoreMatch]) {
    document.getElementById("scoreRoundLabel").innerText = `Round ${window.round} / 경기 ${window.currentScoreMatch + 1}`;
    document.getElementById("editModeLabel").innerText = window.currentMatches[window.currentScoreMatch].finished ? "수정 모드" : "";
    updateScoreBoard();
  } else {
    clearSelectedMatch();
  }

  setSyncStatus("실시간 연결 중");
  window.isApplyingRemoteState = false;

  maybeHandleParticipantNextRoundRequest();
}

async function subscribeRoomRealtime() {
  if (!window.supabaseClient || !window.currentRoomCode) return;

  if (window.roomChannel) {
    await window.supabaseClient.removeChannel(window.roomChannel);
    window.roomChannel = null;
  }

  if (window.matchesChannel) {
    await window.supabaseClient.removeChannel(window.matchesChannel);
    window.matchesChannel = null;
  }

  window.roomChannel = window.supabaseClient
    .channel(`room-${window.currentRoomCode}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "match_rooms",
        filter: `room_code=eq.${window.currentRoomCode}`
      },
      async () => {
        if (Date.now() < window.suppressRoomReloadUntil) return;
        await loadRoomStateFromServer();
      }
    )
    .subscribe();

  window.matchesChannel = window.supabaseClient
    .channel(`matches-${window.currentRoomCode}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "match_round_matches",
        filter: `room_code=eq.${window.currentRoomCode}`
      },
      async () => {
        if (Date.now() < window.suppressMatchesReloadUntil) return;
        await loadRoomStateFromServer();
      }
    )
    .subscribe();
}

function randomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

async function createRoom() {
  if (!window.supabaseClient) initSupabase();
  if (!window.supabaseClient) return;
  if (!beginHostAction()) return;

  try {
    const roomCode = randomCode(6);
    const hostCode = randomCode(10);

    resetLocalStateOnly();

    const roomPayload = {
      room_code: roomCode,
      host_code: hostCode,
      round_no: 1,
      round_locked: false,
      waiting_players: [],
      loss_state: {},
      fixed_teams: [],
      meta_state: getRoomMetaState()
    };

    const { error } = await window.supabaseClient.from("match_rooms").insert(roomPayload);

    if (error) {
      console.error("방 생성 실패 상세:", error);
      alert("방 생성 실패: " + (error.message || "알 수 없는 오류"));
      return;
    }

    window.currentRoomCode = roomCode;
    window.currentHostCode = hostCode;
    window.isHost = true;

    document.getElementById("roomCodeInput").value = roomCode;

    const url = new URL(window.location.href);
    url.searchParams.set("room", roomCode);
    url.searchParams.set("host", hostCode);
    window.history.replaceState({}, "", url.toString());

    updateRoomInfo();
    await subscribeRoomRealtime();
    await loadRoomStateFromServer();

    alert(
      `방 생성 완료: ${roomCode}\n\n` +
      `참가자에게는 "참가자 링크 복사"를 공유해줘.\n` +
      `방장 링크는 방장만 보관해줘.`
    );
  } finally {
    endHostAction();
  }
}

async function joinRoom() {
  if (!window.supabaseClient) initSupabase();
  if (!window.supabaseClient) return;

  const roomCode = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  if (!roomCode) {
    alert("방코드를 입력해줘.");
    return;
  }

  const { data, error } = await window.supabaseClient
    .from("match_rooms")
    .select("*")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (error || !data) {
    console.error("방 조회 실패:", error, data);
    alert("방을 찾지 못했어.");
    return;
  }

  window.currentRoomCode = roomCode;

  const url = new URL(window.location.href);
  const hostParam = url.searchParams.get("host") || "";

  window.currentHostCode = hostParam;
  window.isHost = !!hostParam && hostParam === data.host_code;

  url.searchParams.set("room", roomCode);
  if (window.isHost) url.searchParams.set("host", window.currentHostCode);
  else url.searchParams.delete("host");
  window.history.replaceState({}, "", url.toString());

  updateRoomInfo();
  await subscribeRoomRealtime();
  await loadRoomStateFromServer();

  alert(window.isHost ? "방장으로 입장했어." : "방에 입장했어.");
}

function updateRoomInfo() {
  const text = window.currentRoomCode
    ? `방코드: ${window.currentRoomCode} / 권한: ${window.isHost ? "방장" : "일반"}`
    : "연결된 방 없음";

  const roomInfoEl = document.getElementById("roomInfo");
  if (roomInfoEl) roomInfoEl.innerText = text;
  updateFloatingRoomStatus();
  updateHostOnlyUI();
}

function getPlayerRoomURL() {
  if (!window.currentRoomCode) return "";
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("room", window.currentRoomCode);
  return url.toString();
}

function getHostRoomURL() {
  if (!window.currentRoomCode || !window.currentHostCode) return "";
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("room", window.currentRoomCode);
  url.searchParams.set("host", window.currentHostCode);
  return url.toString();
}

async function copyPlayerLink() {
  const link = getPlayerRoomURL();
  if (!link) {
    alert("먼저 방에 연결해줘.");
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    alert("참가자 링크를 복사했어.");
  } catch (e) {
    console.error(e);
    alert("링크 복사 실패");
  }
}

async function copyHostLink() {
  if (!window.isHost) {
    alert("방장 링크는 방장만 복사할 수 있어.");
    return;
  }

  const link = getHostRoomURL();
  if (!link) {
    alert("방장 정보가 없어.");
    return;
  }

  try {
    await navigator.clipboard.writeText(link);
    alert("방장 링크를 복사했어.");
  } catch (e) {
    console.error(e);
    alert("링크 복사 실패");
  }
}

function setupPlayerSync() {
  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const el = document.getElementById("p" + i);
    if (!el) continue;

    el.addEventListener("input", async () => {
      updatePlayersPreview();
    });

    el.addEventListener("change", async () => {
      if (!window.isHost) return;
      await saveRoomStateOnly();
      setTimeout(() => loadRoomStateFromServer(), 120);
    });
  }
}

function applyAppConfigToUI() {
  const mainTitle = document.getElementById("mainTitleText");
  const splashTitle = document.getElementById("appTitleText");
  const splashSub = document.getElementById("appSubText");

  if (mainTitle) mainTitle.innerText = window.APP_CONFIG.app.title;
  if (splashTitle) splashTitle.innerText = window.APP_CONFIG.app.splashTitle;
  if (splashSub) splashSub.innerText = window.APP_CONFIG.app.splashSub;
}

window.addEventListener("resize", updateScoreOrientationGuide);
window.addEventListener("orientationchange", updateScoreOrientationGuide);

window.addEventListener("load", async () => {
  applyAppConfigToUI();
  initSupabase();
  setupPlayerSync();

  const splash = document.getElementById("splashScreen");
  if (splash) {
    setTimeout(() => {
      splash.classList.add("hide");
      setTimeout(() => {
        splash.style.display = "none";
      }, window.APP_CONFIG.ui.splashHideTransitionMs);
    }, window.APP_CONFIG.ui.splashDelayMs);
  }

  goPage("home");
  updatePlayersPreview();
  updateCurrentRoundLabel();
  renderScoreMatchList();
  updateFloatingRoomStatus();
  updateHostOnlyUI();
  updateScoreOrientationGuide();
  clearSelectedMatch();

  const url = new URL(window.location.href);
  const roomParam = (url.searchParams.get("room") || "").toUpperCase();
  const hostParam = url.searchParams.get("host") || "";

  if (roomParam) {
    document.getElementById("roomCodeInput").value = roomParam;
    window.currentHostCode = hostParam;
    await joinRoom();
  }
});