let players = [];
let loss = {};
let fixedTeams = [];

let currentMatches = [];
let currentWaitingPlayers = [];
let currentRoundPenalties = [];
let currentRoundHistoryLines = [];

let round = 1;
let resultCount = 0;
let neededResults = 0;

let currentScoreMatch = -1;
let roundLocked = false;
let editMode = false;
let restoredCompletedRound = false;
let restoredSnapshotIndex = -1;

// 통계
let teamPairCount = {};
let opponentPairCount = {};
let playCount = {};
let restCount = {};
let lastRoundPlayed = {};
let lastRoundRest = {};
let recentTeammates = [];
let recentOpponents = [];

// 완료 라운드 스냅샷
let roundSnapshots = [];

// 서버 관련
let supabaseClient = null;
let currentRoomCode = "";
let currentHostCode = "";
let isHost = false;
let roomChannel = null;
let matchesChannel = null;
let isApplyingRemoteState = false;

// 저장/반영 안정화
let matchSaveTimers = {};
let suppressRoomReloadUntil = 0;
let suppressMatchesReloadUntil = 0;
let localMatchDirtyUntil = {};
let scoreButtonsLocked = false;
let scoreInputBusy = false;
let hostActionBusy = false;

// Supabase 정보
const SUPABASE_URL = "https://crzulknhwcvhepajsxnl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyenVsa25od2N2aGVwYWpzeG5sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MTY5MjQsImV4cCI6MjA4OTA5MjkyNH0.EwbPzEZ4LQMrHxDLEz0MElsAdPj2k9DPXFl_2Kczbyw";

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
  if (!isHost) {
    alert(`${actionName}은(는) 방장만 사용할 수 있어.`);
    return false;
  }
  return true;
}

function beginHostAction() {
  if (hostActionBusy) return false;
  hostActionBusy = true;
  return true;
}

function endHostAction() {
  hostActionBusy = false;
}

function markMatchDirty(index, ms = 900) {
  localMatchDirtyUntil[index] = Date.now() + ms;
}

function markRoomReloadSuppressed(ms = 350) {
  suppressRoomReloadUntil = Date.now() + ms;
}

function markMatchesReloadSuppressed(ms = 700) {
  suppressMatchesReloadUntil = Date.now() + ms;
}

function brieflyLockScoreInput(ms = 70) {
  scoreInputBusy = true;
  setTimeout(() => {
    scoreInputBusy = false;
  }, ms);
}

function setSyncStatus(text) {
  const el = document.getElementById("syncStatus");
  if (el) el.innerText = text;
}

function showMakeButton() {
  const makeBtn = document.getElementById("makeBtn");
  const nextRoundBtn = document.getElementById("nextRoundBtn");
  if (makeBtn) makeBtn.style.display = "inline-block";
  if (nextRoundBtn) nextRoundBtn.style.display = "none";
}

function showNextRoundButton() {
  const makeBtn = document.getElementById("makeBtn");
  const nextRoundBtn = document.getElementById("nextRoundBtn");
  if (makeBtn) makeBtn.style.display = "none";
  if (nextRoundBtn) nextRoundBtn.style.display = "inline-block";
}

function hideRoundActionButtons() {
  const makeBtn = document.getElementById("makeBtn");
  const nextRoundBtn = document.getElementById("nextRoundBtn");
  if (makeBtn) makeBtn.style.display = "none";
  if (nextRoundBtn) nextRoundBtn.style.display = "none";
}

function isCurrentRoundCompleted() {
  if (!currentMatches.length) return false;
  return currentMatches.every(match => match.finished);
}

function refreshRoundActionButtons() {
  if (!isHost) {
    hideRoundActionButtons();
    return;
  }

  if (restoredCompletedRound && isCurrentRoundCompleted()) {
    showNextRoundButton();
    return;
  }

  if (isCurrentRoundCompleted()) {
    showNextRoundButton();
    return;
  }

  if (roundLocked && currentMatches.length > 0) {
    hideRoundActionButtons();
    return;
  }

  showMakeButton();
}

function setScoreButtonsDisabled(disabled) {
  scoreButtonsLocked = disabled;
  const scoreboard = document.getElementById("scoreboard");
  if (!scoreboard) return;
  const buttons = scoreboard.querySelectorAll("button");
  buttons.forEach(btn => {
    const text = (btn.textContent || "").trim();
    if (text === "+1" || text === "점수 되돌리기" || text === "경기 종료") {
      btn.disabled = disabled;
    }
  });
}

function addHistory(text) {
  if (currentRoundHistoryLines[currentRoundHistoryLines.length - 1] === text) return;
  currentRoundHistoryLines.push(text);
  renderHistory();
}

function renderHistory() {
  const historyEl = document.getElementById("history");
  if (!currentRoundHistoryLines.length) {
    historyEl.innerHTML = "";
    return;
  }
  historyEl.innerHTML = currentRoundHistoryLines.join("<br>") + "<br>";
}

function getCurrentHistoryLines() {
  return deepCopy(currentRoundHistoryLines);
}

function getBaseHistoryBeforeCurrentRound() {
  if (restoredCompletedRound) {
    if (restoredSnapshotIndex <= 0) return [];
    return deepCopy(roundSnapshots[restoredSnapshotIndex - 1].afterCommitState.historyLines || []);
  }

  if (roundSnapshots.length === 0) return [];
  return deepCopy(roundSnapshots[roundSnapshots.length - 1].afterCommitState.historyLines || []);
}

function getHistorySeedForNewRound() {
  if (restoredCompletedRound && restoredSnapshotIndex >= 0) {
    const snap = roundSnapshots[restoredSnapshotIndex];
    return deepCopy(snap?.afterCommitState?.historyLines || []);
  }

  if (roundSnapshots.length > 0) {
    return deepCopy(roundSnapshots[roundSnapshots.length - 1].afterCommitState?.historyLines || []);
  }

  return [];
}

function updatePenaltyList() {
  const select = document.getElementById("penaltyPlayer");
  if (!select) return;

  const activePlayers = Object.keys(loss).filter(name => loss[name] < 3);

  if (activePlayers.length === 0) {
    select.innerHTML = `<option value="">선수 없음</option>`;
    return;
  }

  select.innerHTML = activePlayers
    .map(name => `<option value="${name}">${name}</option>`)
    .join("");
}

function updateScore() {
  let html = "";
  const names = Object.keys(loss);

  if (names.length === 0) {
    html = "기록 없음";
  } else {
    names.sort((a, b) => {
      if (loss[b] !== loss[a]) return loss[b] - loss[a];
      return a.localeCompare(b, "ko");
    });

    for (const name of names) {
      let text = `${name} : ${loss[name]}패`;
      if (loss[name] >= 3) text += " (탈락)";
      text += ` / 출전 ${playCount[name] || 0} / 대기 ${restCount[name] || 0}`;
      html += text + "<br>";
    }
  }

  document.getElementById("score").innerHTML = html;
  updatePenaltyList();
}

function collectPlayers() {
  players = [];

  for (let i = 1; i <= 8; i++) {
    const el = document.getElementById("p" + i);
    if (!el) continue;

    const name = el.value.trim();
    if (!name) continue;

    players.push(name);

    if (!(name in loss)) loss[name] = 0;
    if (!(name in playCount)) playCount[name] = 0;
    if (!(name in restCount)) restCount[name] = 0;
    if (!(name in lastRoundPlayed)) lastRoundPlayed[name] = 0;
    if (!(name in lastRoundRest)) lastRoundRest[name] = 0;
  }

  players = unique(players);
  players = players.filter(name => loss[name] < 3);
}

function getPlayerInputs() {
  const arr = [];
  for (let i = 1; i <= 8; i++) {
    const el = document.getElementById("p" + i);
    arr.push(el ? el.value.trim() : "");
  }
  return arr;
}

function applyPlayerInputs(arr) {
  for (let i = 1; i <= 8; i++) {
    const el = document.getElementById("p" + i);
    if (el) el.value = arr[i - 1] || "";
  }
}

function resetLocalStateOnly() {
  players = [];
  loss = {};
  fixedTeams = [];

  currentMatches = [];
  currentWaitingPlayers = [];
  currentRoundPenalties = [];
  currentRoundHistoryLines = [];

  round = 1;
  resultCount = 0;
  neededResults = 0;

  currentScoreMatch = -1;
  roundLocked = false;
  editMode = false;
  restoredCompletedRound = false;
  restoredSnapshotIndex = -1;

  teamPairCount = {};
  opponentPairCount = {};
  playCount = {};
  restCount = {};
  lastRoundPlayed = {};
  lastRoundRest = {};
  recentTeammates = [];
  recentOpponents = [];

  roundSnapshots = [];

  matchSaveTimers = {};
  localMatchDirtyUntil = {};
  suppressRoomReloadUntil = 0;
  suppressMatchesReloadUntil = 0;
  scoreInputBusy = false;

  document.getElementById("match").innerHTML = "";
  document.getElementById("score").innerHTML = "";
  document.getElementById("fixedList").innerHTML = "설정된 고정팀 없음";
  document.getElementById("waitingPlayers").innerText = "없음";
  renderHistory();
  closeScore();
  updatePenaltyList();
  refreshRoundActionButtons();
}

async function resetAll() {
  if (!ensureHost("전체 초기화")) return;
  if (!beginHostAction()) return;

  try {
    if (!currentRoomCode) {
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

    const { error: roomError } = await supabaseClient
      .from("match_rooms")
      .update(roomPayload)
      .eq("room_code", currentRoomCode);

    if (roomError) {
      console.error(roomError);
      alert("방 초기화 저장 실패");
      return;
    }

    const { error: deleteError } = await supabaseClient
      .from("match_round_matches")
      .delete()
      .eq("room_code", currentRoomCode);

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

    fixedTeams.push({ p1, p2, round: r });
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
    fixedTeams.splice(index, 1);
    updateFixedList();
    await saveRoomStateOnly();
  } finally {
    endHostAction();
  }
}

function updateFixedList() {
  let html = "";

  if (fixedTeams.length === 0) {
    html = "설정된 고정팀 없음";
  } else {
    fixedTeams.forEach((f, idx) => {
      html += `${f.round}R : ${f.p1} / ${f.p2}`;
      if (isHost) {
        html += ` <button onclick="removeFixedTeam(${idx})">삭제</button>`;
      }
      html += "<br>";
    });
  }

  document.getElementById("fixedList").innerHTML = html;
}

function getRoundFixedTeam(activePlayers) {
  const fixed = fixedTeams.find(f => f.round === round);
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
      score += (restCount[p] || 0) * -30;
      if ((lastRoundRest[p] || 0) === round - 1) score += 200;
      if ((lastRoundPlayed[p] || 0) === round - 1) score += -10;
      score += (playCount[p] || 0) * -3;
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

  penalty += (teamPairCount[key] || 0) * 100;
  for (const recent of recentTeammates) {
    if (recent === key) penalty += 50;
  }

  return penalty;
}

function getOpponentPenalty(teamA, teamB) {
  let penalty = 0;

  for (const a of teamA) {
    for (const b of teamB) {
      const key = pairKey(a, b);
      penalty += (opponentPairCount[key] || 0) * 20;
      for (const recent of recentOpponents) {
        if (recent === key) penalty += 10;
      }
    }
  }

  return penalty;
}

function getBalancePenalty(playingPlayers, waitingPlayers) {
  let penalty = 0;

  for (const p of playingPlayers) {
    penalty += (playCount[p] || 0) * 2;
    if ((lastRoundPlayed[p] || 0) === round - 1) penalty += 2;
  }

  for (const p of waitingPlayers) {
    penalty += (restCount[p] || 0) * -5;
  }

  return penalty;
}

function chooseBestSchedule(activePlayers) {
  let matchCount = Math.floor(activePlayers.length / 4);
  if (matchCount > 2) matchCount = 2;

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
  const match = currentMatches[i];
  const scoreText = match ? `${match.scoreA} : ${match.scoreB}` : "0 : 0";

  return `
    <div class="match" id="matchBox${i}" onclick="openScore(${i})">
      <div class="courtBadge">${courtLabel}</div>
      <b>${t1.join(" / ")} VS ${t2.join(" / ")}</b>
      <div class="small">현재 점수: ${scoreText}</div>
      <div class="small">클릭해서 점수 입력 / 종료 후 다시 클릭하면 수정 가능</div>
    </div>
  `;
}

function renderMatches() {
  let html = `<h3>Round ${round}</h3>`;

  currentMatches.forEach((m, i) => {
    html += matchHTML(i, m.teams[0], m.teams[1]);
  });

  if (!currentMatches.length) {
    html += `<div class="small">진행 중인 경기 없음</div>`;
  }

  document.getElementById("match").innerHTML = html;
  document.getElementById("waitingPlayers").innerText =
    currentWaitingPlayers.length ? currentWaitingPlayers.join(" / ") : "없음";

  currentMatches.forEach((m, i) => {
    if (m.finished) updateMatchBox(i);
  });

  refreshRoundActionButtons();
}

function updateMatchBox(index) {
  const box = document.getElementById("matchBox" + index);
  if (!box) return;

  const match = currentMatches[index];
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

function updateScoreBoard() {
  if (currentScoreMatch < 0 || !currentMatches[currentScoreMatch]) return;

  const match = currentMatches[currentScoreMatch];
  document.getElementById("teamA").innerText = match.teams[0].join(" / ");
  document.getElementById("teamB").innerText = match.teams[1].join(" / ");
  document.getElementById("scoreA").innerText = match.scoreA;
  document.getElementById("scoreB").innerText = match.scoreB;
  document.getElementById("courtNotice").innerText =
    (match.scoreA === 11 || match.scoreB === 11) ? "코트 체인지" : "";
}

function openScore(i) {
  if (!currentMatches[i]) return;

  currentScoreMatch = i;
  const match = currentMatches[i];
  editMode = match.finished;

  document.getElementById("scoreRoundLabel").innerText = `Round ${round} / 경기 ${i + 1}`;
  document.getElementById("editModeLabel").innerText = editMode ? "수정 모드" : "";
  document.getElementById("teamA").innerText = match.teams[0].join(" / ");
  document.getElementById("teamB").innerText = match.teams[1].join(" / ");

  updateScoreBoard();
  document.getElementById("scoreboard").style.display = "block";
  setScoreButtonsDisabled(false);
}

function closeScore() {
  document.getElementById("scoreboard").style.display = "none";
  document.getElementById("editModeLabel").innerText = "";
  setScoreButtonsDisabled(false);
}

function cancelMatch() {
  closeScore();
}

function getRoomMetaState() {
  return {
    playerInputs: getPlayerInputs(),
    teamPairCount: deepCopy(teamPairCount),
    opponentPairCount: deepCopy(opponentPairCount),
    playCount: deepCopy(playCount),
    restCount: deepCopy(restCount),
    lastRoundPlayed: deepCopy(lastRoundPlayed),
    lastRoundRest: deepCopy(lastRoundRest),
    recentTeammates: deepCopy(recentTeammates),
    recentOpponents: deepCopy(recentOpponents),
    roundSnapshots: deepCopy(roundSnapshots),
    currentRoundPenalties: deepCopy(currentRoundPenalties),
    resultCount,
    neededResults,
    restoredCompletedRound,
    restoredSnapshotIndex
  };
}

async function saveRoomStateOnly() {
  if (!supabaseClient || !currentRoomCode || isApplyingRemoteState) return;

  markRoomReloadSuppressed(400);

  const roomPayload = {
    round_no: round,
    round_locked: roundLocked,
    waiting_players: deepCopy(currentWaitingPlayers),
    loss_state: deepCopy(loss),
    fixed_teams: deepCopy(fixedTeams),
    meta_state: getRoomMetaState()
  };

  const { error } = await supabaseClient
    .from("match_rooms")
    .update(roomPayload)
    .eq("room_code", currentRoomCode);

  if (error) {
    console.error(error);
    setSyncStatus("방 상태 저장 실패");
  } else {
    setSyncStatus("실시간 반영 중");
  }
}

async function saveSingleMatchToServer(index) {
  if (!supabaseClient || !currentRoomCode || !currentMatches[index]) return;

  const match = currentMatches[index];
  const payload = {
    room_code: currentRoomCode,
    round_no: round,
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

  const { data, error } = await supabaseClient
    .from("match_round_matches")
    .upsert(payload, { onConflict: "room_code,round_no,match_index" })
    .select();

  if (error) {
    console.error(error);
    setSyncStatus("경기 저장 실패");
    return;
  }

  if (data && data[0] && currentMatches[index]) {
    currentMatches[index].dbId = data[0].id;
  }

  setSyncStatus("실시간 반영 중");
}

function scheduleMatchSave(index, delay = 220) {
  if (!currentMatches[index]) return;

  if (matchSaveTimers[index]) {
    clearTimeout(matchSaveTimers[index]);
  }

  matchSaveTimers[index] = setTimeout(async () => {
    matchSaveTimers[index] = null;
    await saveSingleMatchToServer(index);
  }, delay);
}

async function flushMatchSave(index) {
  if (matchSaveTimers[index]) {
    clearTimeout(matchSaveTimers[index]);
    matchSaveTimers[index] = null;
  }
  await saveSingleMatchToServer(index);
}

async function replaceAllMatchesOnServer() {
  if (!supabaseClient || !currentRoomCode) return false;

  markMatchesReloadSuppressed(1600);

  const { error: deleteError } = await supabaseClient
    .from("match_round_matches")
    .delete()
    .eq("room_code", currentRoomCode)
    .eq("round_no", round);

  if (deleteError) {
    console.error(deleteError);
    alert("기존 경기 삭제 실패");
    return false;
  }

  if (!currentMatches.length) return true;

  const payload = currentMatches.map((m, idx) => ({
    room_code: currentRoomCode,
    round_no: round,
    match_index: idx,
    team_a: deepCopy(m.teams[0]),
    team_b: deepCopy(m.teams[1]),
    score_a: m.scoreA,
    score_b: m.scoreB,
    finished: !!m.finished,
    winner_index: m.winnerIndex,
    score_history: deepCopy(m.scoreHistory || [])
  }));

  const { data, error } = await supabaseClient
    .from("match_round_matches")
    .insert(payload)
    .select();

  if (error) {
    console.error(error);
    alert("새 경기 저장 실패");
    return false;
  }

  data.forEach((row, idx) => {
    if (currentMatches[idx]) currentMatches[idx].dbId = row.id;
  });

  return true;
}

function getPreCommitStateFromCurrentRound() {
  return {
    round: round,
    loss: deepCopy(loss),
    teamPairCount: deepCopy(teamPairCount),
    opponentPairCount: deepCopy(opponentPairCount),
    playCount: deepCopy(playCount),
    restCount: deepCopy(restCount),
    lastRoundPlayed: deepCopy(lastRoundPlayed),
    lastRoundRest: deepCopy(lastRoundRest),
    recentTeammates: deepCopy(recentTeammates),
    recentOpponents: deepCopy(recentOpponents),
    currentMatches: deepCopy(currentMatches),
    currentWaitingPlayers: deepCopy(currentWaitingPlayers),
    currentRoundPenalties: deepCopy(currentRoundPenalties),
    resultCount: resultCount,
    neededResults: neededResults,
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
  loss = deepCopy(afterState.loss);
  teamPairCount = deepCopy(afterState.teamPairCount);
  opponentPairCount = deepCopy(afterState.opponentPairCount);
  playCount = deepCopy(afterState.playCount);
  restCount = deepCopy(afterState.restCount);
  lastRoundPlayed = deepCopy(afterState.lastRoundPlayed);
  lastRoundRest = deepCopy(afterState.lastRoundRest);
  recentTeammates = deepCopy(afterState.recentTeammates);
  recentOpponents = deepCopy(afterState.recentOpponents);
}

function saveRestoredCompletedRoundSnapshot() {
  if (restoredSnapshotIndex < 0) return;

  const completedRoundState = getPreCommitStateFromCurrentRound();
  const afterCommitState = buildCommittedStateFromRoundState(completedRoundState);

  roundSnapshots[restoredSnapshotIndex] = {
    completedRoundState,
    afterCommitState
  };
}

function syncRestoredSnapshotIfNeeded() {
  if (!restoredCompletedRound) return;
  saveRestoredCompletedRoundSnapshot();
}

function rebuildRoundState() {
  collectPlayers();

  let baseLoss = {};
  Object.keys(loss).forEach(name => {
    baseLoss[name] = 0;
  });

  if (restoredCompletedRound) {
    if (restoredSnapshotIndex > 0) {
      const prevSnapshot = roundSnapshots[restoredSnapshotIndex - 1];
      baseLoss = deepCopy(prevSnapshot.afterCommitState.loss);

      Object.keys(loss).forEach(name => {
        if (!(name in baseLoss)) baseLoss[name] = 0;
      });
    }
  } else if (roundSnapshots.length > 0) {
    const lastCommitted = roundSnapshots[roundSnapshots.length - 1];
    baseLoss = deepCopy(lastCommitted.afterCommitState.loss);

    Object.keys(loss).forEach(name => {
      if (!(name in baseLoss)) baseLoss[name] = 0;
    });
  }

  let historyLines = getBaseHistoryBeforeCurrentRound();

  const roundHeader = `===== Round ${round} =====`;
  if (!historyLines.includes(roundHeader)) {
    historyLines.push(roundHeader);
  }

  if (currentWaitingPlayers.length) {
    historyLines = historyLines.filter(line => !line.startsWith("대기 : "));
    historyLines.push(`대기 : ${currentWaitingPlayers.join(" / ")}`);
  }

  currentRoundPenalties.forEach(p => {
    if (!(p in baseLoss)) baseLoss[p] = 0;
    baseLoss[p]++;

    const penaltyText = `[Round ${round}] ${p} 핸디캡 패 +1`;
    if (!historyLines.includes(penaltyText)) {
      historyLines.push(penaltyText);
    }
  });

  currentMatches.forEach(match => {
    if (match.finished && match.winnerIndex !== null) {
      const loserTeam = match.teams[match.winnerIndex === 0 ? 1 : 0];

      loserTeam.forEach(p => {
        if (!(p in baseLoss)) baseLoss[p] = 0;
        baseLoss[p]++;
      });

      const teamA = match.teams[0].join("/");
      const teamB = match.teams[1].join("/");
      const winnerText = match.winnerIndex === 0 ? `${teamA} 승` : `${teamB} 승`;

      const matchText =
        `[Round ${round}] ${teamA} ${match.scoreA} : ${match.scoreB} ${teamB} (${winnerText})`;

      historyLines = historyLines.filter(line => {
        if (!line.startsWith(`[Round ${round}] `)) return true;
        if (line.includes("핸디캡 패 +1")) return true;
        if (line === roundHeader) return true;
        return !(line.includes(teamA) && line.includes(teamB));
      });

      historyLines.push(matchText);
    }
  });

  loss = baseLoss;
  currentRoundHistoryLines = historyLines;
  renderHistory();
}

async function addPenalty() {
  if (!ensureHost("핸디캡 패 추가")) return;
  if (!beginHostAction()) return;

  try {
    if (!roundLocked) {
      alert("진행 중인 라운드가 없어서 핸디캡 패를 추가할 수 없어.");
      return;
    }

    const finishedCount = currentMatches.filter(m => m.finished).length;
    if (!restoredCompletedRound && neededResults > 0 && finishedCount >= neededResults) {
      alert("이미 완료된 라운드야. 다음 라운드를 시작하거나 이전 완료 라운드로 복구 후 수정해줘.");
      return;
    }

    const p = document.getElementById("penaltyPlayer").value;
    if (!p) return;

    currentRoundPenalties.push(p);
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
    if (!currentRoomCode) {
      alert("먼저 방에 연결해줘.");
      return;
    }

    const pendingIndexes = Object.keys(matchSaveTimers)
      .filter(key => !!matchSaveTimers[key])
      .map(Number);

    for (const idx of pendingIndexes) {
      await flushMatchSave(idx);
    }

    if (roundLocked) {
      const finishedCount = currentMatches.filter(m => m.finished).length;

      if (restoredCompletedRound) {
        if (neededResults > 0 && finishedCount >= neededResults) {
          saveRestoredCompletedRoundSnapshot();
          roundSnapshots = roundSnapshots.slice(0, restoredSnapshotIndex + 1);

          const savedSnapshot = roundSnapshots[restoredSnapshotIndex];
          applyAfterCommitState(savedSnapshot.afterCommitState);

          restoredCompletedRound = false;
          restoredSnapshotIndex = -1;
          roundLocked = false;
          round++;
        } else {
          alert("현재 라운드가 아직 끝나지 않았어.");
          return;
        }
      } else if (neededResults > 0 && finishedCount >= neededResults) {
        roundLocked = false;
      } else {
        alert("현재 라운드가 아직 끝나지 않았어.");
        return;
      }
    }

    collectPlayers();

    if (players.length < 4) {
      document.getElementById("match").innerHTML = "<b>경기 종료</b>";
      alert("경기할 인원이 부족해.");
      return;
    }

    const plan = chooseBestSchedule(players);
    if (!plan || !plan.matches.length) {
      alert("대진 생성 실패");
      return;
    }

    resultCount = 0;
    neededResults = plan.matches.length;
    currentMatches = plan.matches;
    currentWaitingPlayers = plan.waitingPlayers;
    currentRoundPenalties = [];
    roundLocked = true;
    refreshRoundActionButtons();

    currentRoundHistoryLines = getHistorySeedForNewRound();
    addHistory(`===== Round ${round} =====`);
    if (currentWaitingPlayers.length) {
      addHistory(`대기 : ${currentWaitingPlayers.join(" / ")}`);
    }

    renderMatches();
    updateScore();

    const ok = await replaceAllMatchesOnServer();
    if (!ok) return;
    await saveRoomStateOnly();
  } finally {
    if (!skipHostBusyCheck) {
      endHostAction();
    }
  }
}

async function goNextRound() {
  if (!ensureHost("다음 라운드 진행")) return;
  if (!beginHostAction()) return;

  try {
    if (!isCurrentRoundCompleted()) {
      alert("현재 라운드가 아직 끝나지 않았어.");
      return;
    }

    const pendingIndexes = Object.keys(matchSaveTimers)
      .filter(key => !!matchSaveTimers[key])
      .map(Number);

    for (const idx of pendingIndexes) {
      await flushMatchSave(idx);
    }

    if (restoredCompletedRound) {
      saveRestoredCompletedRoundSnapshot();
      roundSnapshots = roundSnapshots.slice(0, restoredSnapshotIndex + 1);

      const savedSnapshot = roundSnapshots[restoredSnapshotIndex];
      applyAfterCommitState(savedSnapshot.afterCommitState);

      restoredCompletedRound = false;
      restoredSnapshotIndex = -1;
      round = savedSnapshot.afterCommitState.round + 1;
    }

    currentMatches = [];
    currentWaitingPlayers = [];
    currentRoundPenalties = [];
    resultCount = 0;
    neededResults = 0;
    roundLocked = false;

    markMatchesReloadSuppressed(1600);
    markRoomReloadSuppressed(900);

    closeScore();
    renderMatches();
    updateScore();
    refreshRoundActionButtons();

    await makeMatch(true);
  } finally {
    endHostAction();
  }
}

async function addScore(team) {
  if (currentScoreMatch < 0 || !currentMatches[currentScoreMatch]) return;
  if (scoreButtonsLocked || scoreInputBusy) return;

  brieflyLockScoreInput();

  const match = currentMatches[currentScoreMatch];
  match.scoreHistory.push([match.scoreA, match.scoreB]);

  if (team === 0) match.scoreA++;
  else match.scoreB++;

  markMatchDirty(currentScoreMatch, 1200);

  updateScoreBoard();
  updateMatchBox(currentScoreMatch);
  syncRestoredSnapshotIfNeeded();

  scheduleMatchSave(currentScoreMatch);

  const diff = Math.abs(match.scoreA - match.scoreB);
  if ((match.scoreA >= 25 || match.scoreB >= 25) && diff >= 2) {
    setTimeout(async () => {
      if (
        currentScoreMatch >= 0 &&
        currentMatches[currentScoreMatch] &&
        !currentMatches[currentScoreMatch].finished
      ) {
        await finishGame();
      }
    }, 90);
  }
}

async function undoScore() {
  if (currentScoreMatch < 0 || !currentMatches[currentScoreMatch]) return;
  if (scoreButtonsLocked || scoreInputBusy) return;

  brieflyLockScoreInput();

  const match = currentMatches[currentScoreMatch];
  if (!match.scoreHistory.length) return;

  const last = match.scoreHistory.pop();
  match.scoreA = last[0];
  match.scoreB = last[1];

  markMatchDirty(currentScoreMatch, 1200);

  updateScoreBoard();
  updateMatchBox(currentScoreMatch);
  syncRestoredSnapshotIfNeeded();

  scheduleMatchSave(currentScoreMatch);
}

async function finishGame() {
  if (currentScoreMatch < 0 || !currentMatches[currentScoreMatch]) return;
  if (scoreButtonsLocked) return;

  const match = currentMatches[currentScoreMatch];
  if (match.scoreA === match.scoreB) {
    alert("동점은 종료할 수 없어.");
    return;
  }

  setScoreButtonsDisabled(true);
  try {
    await finishWinner();
  } finally {
    setScoreButtonsDisabled(false);
  }
}

async function finishWinner() {
  if (currentScoreMatch < 0 || !currentMatches[currentScoreMatch]) return;

  const match = currentMatches[currentScoreMatch];
  const wasFinished = match.finished;

  let actualWinnerIndex;
  if (match.scoreA > match.scoreB) actualWinnerIndex = 0;
  else if (match.scoreB > match.scoreA) actualWinnerIndex = 1;
  else {
    alert("동점은 종료할 수 없어.");
    return;
  }

  markMatchDirty(currentScoreMatch, 1600);

  match.finished = true;
  match.winnerIndex = actualWinnerIndex;

  if (!wasFinished) {
    resultCount++;
  }

  updateMatchBox(currentScoreMatch);
  rebuildRoundState();
  updateScore();
  closeScore();

  await flushMatchSave(currentScoreMatch);
  await saveRoomStateOnly();

  if (!editMode && !wasFinished) {
    alert("🏸 승리 팀\n" + match.teams[actualWinnerIndex].join(" / "));
  }

  currentScoreMatch = -1;
  editMode = false;

  if (restoredCompletedRound) {
    saveRestoredCompletedRoundSnapshot();
    await saveRoomStateOnly();
  }

  if (!wasFinished) {
    await checkRoundEnd();
  }
}

function commitRoundStats() {
  let playedPlayers = [];

  currentMatches.forEach(match => {
    match.teams[0].forEach(p => playedPlayers.push(p));
    match.teams[1].forEach(p => playedPlayers.push(p));
  });

  playedPlayers = unique(playedPlayers);

  for (const p of playedPlayers) {
    playCount[p] = (playCount[p] || 0) + 1;
    lastRoundPlayed[p] = round;
  }

  for (const p of currentWaitingPlayers) {
    restCount[p] = (restCount[p] || 0) + 1;
    lastRoundRest[p] = round;
  }

  for (const match of currentMatches) {
    const t1 = match.teams[0];
    const t2 = match.teams[1];

    const teamKey1 = pairKey(t1[0], t1[1]);
    const teamKey2 = pairKey(t2[0], t2[1]);

    teamPairCount[teamKey1] = (teamPairCount[teamKey1] || 0) + 1;
    teamPairCount[teamKey2] = (teamPairCount[teamKey2] || 0) + 1;

    recentTeammates.push(teamKey1, teamKey2);

    for (const a of t1) {
      for (const b of t2) {
        const key = pairKey(a, b);
        opponentPairCount[key] = (opponentPairCount[key] || 0) + 1;
        recentOpponents.push(key);
      }
    }
  }

  if (recentTeammates.length > 20) recentTeammates = recentTeammates.slice(-20);
  if (recentOpponents.length > 40) recentOpponents = recentOpponents.slice(-40);
}

async function checkRoundEnd() {
  if (resultCount < neededResults) return;

  const completedRoundState = getPreCommitStateFromCurrentRound();

  commitRoundStats();
  updateScore();

  const afterCommitState = {
    round: round,
    loss: deepCopy(loss),
    teamPairCount: deepCopy(teamPairCount),
    opponentPairCount: deepCopy(opponentPairCount),
    playCount: deepCopy(playCount),
    restCount: deepCopy(restCount),
    lastRoundPlayed: deepCopy(lastRoundPlayed),
    lastRoundRest: deepCopy(lastRoundRest),
    recentTeammates: deepCopy(recentTeammates),
    recentOpponents: deepCopy(recentOpponents),
    historyLines: getCurrentHistoryLines()
  };

  roundSnapshots.push({
    completedRoundState,
    afterCommitState
  });

  restoredCompletedRound = false;
  restoredSnapshotIndex = -1;
  roundLocked = false;
  round++;
  currentRoundPenalties = [];

  renderMatches();
  updateScore();
  refreshRoundActionButtons();

  collectPlayers();
  await saveRoomStateOnly();

  if (players.filter(p => loss[p] < 3).length < 4) {
    document.getElementById("match").innerHTML += `<div><b>경기 종료</b></div>`;
  }
}

async function undoRound() {
  if (!ensureHost("이전 완료 라운드 복구")) return;
  if (!beginHostAction()) return;

  try {
    if (roundSnapshots.length === 0) {
      alert("되돌릴 이전 완료 라운드가 없어.");
      return;
    }

    let targetIndex;

    if (restoredCompletedRound) {
      targetIndex = restoredSnapshotIndex - 1;
    } else {
      targetIndex = roundSnapshots.length - 1;
    }

    if (targetIndex < 0) {
      alert("더 이전 완료 라운드는 없어.");
      return;
    }

    let message = "이전 완료 라운드로 복구할까요?";
    if (roundLocked && !restoredCompletedRound) {
      message = `현재 Round ${round} 진행 내용은 버리고, 이전 완료 라운드로 복구할까요?`;
    }

    if (!confirm(message)) return;

    restoredSnapshotIndex = targetIndex;
    const snapshot = roundSnapshots[restoredSnapshotIndex];
    const state = snapshot.completedRoundState;

    round = state.round;
    loss = deepCopy(state.loss);
    teamPairCount = deepCopy(state.teamPairCount);
    opponentPairCount = deepCopy(state.opponentPairCount);
    playCount = deepCopy(state.playCount);
    restCount = deepCopy(state.restCount);
    lastRoundPlayed = deepCopy(state.lastRoundPlayed);
    lastRoundRest = deepCopy(state.lastRoundRest);
    recentTeammates = deepCopy(state.recentTeammates);
    recentOpponents = deepCopy(state.recentOpponents);

    currentMatches = deepCopy(state.currentMatches);
    currentWaitingPlayers = deepCopy(state.currentWaitingPlayers);
    currentRoundPenalties = deepCopy(state.currentRoundPenalties);
    currentRoundHistoryLines = deepCopy(state.historyLines);

    resultCount = state.resultCount;
    neededResults = state.neededResults;

    currentScoreMatch = -1;
    editMode = false;
    roundLocked = true;
    restoredCompletedRound = true;
    refreshRoundActionButtons();

    renderHistory();
    renderMatches();
    updateScore();
    closeScore();

    markMatchesReloadSuppressed(1600);

    const ok = await replaceAllMatchesOnServer();
    if (!ok) return;
    await saveRoomStateOnly();

    alert(`Round ${round} 상태로 복구했어.`);
  } finally {
    endHostAction();
  }
}

function buildHistoryFromServerState(room, matches) {
  let lines = [];

  const meta = room.meta_state || {};
  const snaps = deepCopy(meta.roundSnapshots || []);
  if (snaps.length > 0) {
    lines = deepCopy(snaps[snaps.length - 1].afterCommitState?.historyLines || []);
  }

  if (matches.length) {
    const roundHeader = `===== Round ${room.round_no} =====`;
    if (!lines.includes(roundHeader)) {
      lines.push(roundHeader);
    }

    if ((room.waiting_players || []).length) {
      const waitText = `대기 : ${(room.waiting_players || []).join(" / ")}`;
      if (!lines.includes(waitText)) {
        lines.push(waitText);
      }
    }

    const penalties = meta.currentRoundPenalties || [];
    penalties.forEach(p => {
      const penaltyText = `[Round ${room.round_no}] ${p} 핸디캡 패 +1`;
      if (!lines.includes(penaltyText)) {
        lines.push(penaltyText);
      }
    });

    matches.forEach(m => {
      if (m.finished && typeof m.winner_index === "number") {
        const teamA = (m.team_a || []).join("/");
        const teamB = (m.team_b || []).join("/");
        const winnerText = m.winner_index === 0 ? `${teamA} 승` : `${teamB} 승`;
        const matchText =
          `[Round ${room.round_no}] ${teamA} ${m.score_a} : ${m.score_b} ${teamB} (${winnerText})`;

        if (!lines.includes(matchText)) {
          lines.push(matchText);
        }
      }
    });
  }

  return lines;
}

function shouldKeepLocalMatch(local, serverRow, idx) {
  if (!local || !serverRow) return false;

  const pendingSave = !!matchSaveTimers[idx];
  const dirty = Date.now() < (localMatchDirtyUntil[idx] || 0);

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

async function loadRoomStateFromServer() {
  if (!currentRoomCode || !supabaseClient) return;

  isApplyingRemoteState = true;
  setSyncStatus("서버에서 불러오는 중...");

  const { data: room, error: roomError } = await supabaseClient
    .from("match_rooms")
    .select("*")
    .eq("room_code", currentRoomCode)
    .maybeSingle();

  if (roomError || !room) {
    console.error(roomError);
    setSyncStatus("방 상태 불러오기 실패");
    isApplyingRemoteState = false;
    return;
  }

  const { data: matches, error: matchesError } = await supabaseClient
    .from("match_round_matches")
    .select("*")
    .eq("room_code", currentRoomCode)
    .eq("round_no", room.round_no)
    .order("match_index", { ascending: true });

  if (matchesError) {
    console.error(matchesError);
    setSyncStatus("경기 상태 불러오기 실패");
    isApplyingRemoteState = false;
    return;
  }

  const previousLocalMatches = deepCopy(currentMatches);

  round = room.round_no;
  roundLocked = room.round_locked;
  currentWaitingPlayers = deepCopy(room.waiting_players || []);
  loss = deepCopy(room.loss_state || {});
  fixedTeams = deepCopy(room.fixed_teams || []);

  const meta = room.meta_state || {};
  applyPlayerInputs(meta.playerInputs || []);
  teamPairCount = deepCopy(meta.teamPairCount || {});
  opponentPairCount = deepCopy(meta.opponentPairCount || {});
  playCount = deepCopy(meta.playCount || {});
  restCount = deepCopy(meta.restCount || {});
  lastRoundPlayed = deepCopy(meta.lastRoundPlayed || {});
  lastRoundRest = deepCopy(meta.lastRoundRest || {});
  recentTeammates = deepCopy(meta.recentTeammates || []);
  recentOpponents = deepCopy(meta.recentOpponents || []);
  roundSnapshots = deepCopy(meta.roundSnapshots || []);
  currentRoundPenalties = deepCopy(meta.currentRoundPenalties || []);
  resultCount = meta.resultCount || 0;
  neededResults = meta.neededResults || 0;
  restoredCompletedRound = !!meta.restoredCompletedRound;
  restoredSnapshotIndex = typeof meta.restoredSnapshotIndex === "number" ? meta.restoredSnapshotIndex : -1;

  currentMatches = (matches || []).map((m, idx) => {
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

  currentRoundHistoryLines = buildHistoryFromServerState(room, matches || []);

  collectPlayers();
  updateFixedList();
  renderHistory();
  renderMatches();
  updateScore();
  updateRoomInfo();
  refreshRoundActionButtons();

  const modal = document.getElementById("scoreboard");
  if (
    currentScoreMatch >= 0 &&
    currentMatches[currentScoreMatch] &&
    modal &&
    modal.style.display === "block"
  ) {
    document.getElementById("scoreRoundLabel").innerText = `Round ${round} / 경기 ${currentScoreMatch + 1}`;
    document.getElementById("editModeLabel").innerText = currentMatches[currentScoreMatch].finished ? "수정 모드" : "";
    updateScoreBoard();
  } else {
    closeScore();
  }

  setSyncStatus("실시간 연결 중");
  isApplyingRemoteState = false;
}

async function subscribeRoomRealtime() {
  if (!supabaseClient || !currentRoomCode) return;

  if (roomChannel) {
    await supabaseClient.removeChannel(roomChannel);
    roomChannel = null;
  }

  if (matchesChannel) {
    await supabaseClient.removeChannel(matchesChannel);
    matchesChannel = null;
  }

  roomChannel = supabaseClient
    .channel(`room-${currentRoomCode}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "match_rooms",
        filter: `room_code=eq.${currentRoomCode}`
      },
      async () => {
        if (Date.now() < suppressRoomReloadUntil) return;
        await loadRoomStateFromServer();
      }
    )
    .subscribe();

  matchesChannel = supabaseClient
    .channel(`matches-${currentRoomCode}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "match_round_matches",
        filter: `room_code=eq.${currentRoomCode}`
      },
      async () => {
        if (Date.now() < suppressMatchesReloadUntil) return;
        await loadRoomStateFromServer();
      }
    )
    .subscribe();
}

function initSupabase() {
  if (!window.supabase) {
    alert("Supabase 라이브러리를 불러오지 못했어.");
    return;
  }

  if (!SUPABASE_URL || SUPABASE_URL.includes("여기에_")) {
    setSyncStatus("Supabase URL 설정 필요");
    return;
  }

  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.includes("여기에_")) {
    setSyncStatus("Supabase Key 설정 필요");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  setSyncStatus("서버 연결 준비 완료");
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
  if (!supabaseClient) initSupabase();
  if (!supabaseClient) return;
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

    const { error } = await supabaseClient.from("match_rooms").insert(roomPayload);

    if (error) {
      console.error(error);
      alert("방 생성 실패");
      return;
    }

    currentRoomCode = roomCode;
    currentHostCode = hostCode;
    isHost = true;

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
  if (!supabaseClient) initSupabase();
  if (!supabaseClient) return;

  const roomCode = document.getElementById("roomCodeInput").value.trim().toUpperCase();
  if (!roomCode) {
    alert("방코드를 입력해줘.");
    return;
  }

  const { data, error } = await supabaseClient
    .from("match_rooms")
    .select("*")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (error || !data) {
  console.error("방 조회 실패:", error, data);
  alert("방을 찾지 못했어.");
  return;
}

  currentRoomCode = roomCode;

  const url = new URL(window.location.href);
  const hostParam = url.searchParams.get("host") || "";

  currentHostCode = hostParam;
  isHost = !!hostParam && hostParam === data.host_code;

  url.searchParams.set("room", roomCode);
  if (isHost) url.searchParams.set("host", currentHostCode);
  else url.searchParams.delete("host");
  window.history.replaceState({}, "", url.toString());

  updateRoomInfo();
  await subscribeRoomRealtime();
  await loadRoomStateFromServer();

  alert(isHost ? "방장으로 입장했어." : "방에 입장했어.");
}

function updateRoomInfo() {
  const text = currentRoomCode
    ? `방코드: ${currentRoomCode} / 권한: ${isHost ? "방장" : "일반"}`
    : "연결된 방 없음";

  document.getElementById("roomInfo").innerText = text;
}

function getPlayerRoomURL() {
  if (!currentRoomCode) return "";
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("room", currentRoomCode);
  return url.toString();
}

function getHostRoomURL() {
  if (!currentRoomCode || !currentHostCode) return "";
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set("room", currentRoomCode);
  url.searchParams.set("host", currentHostCode);
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
  if (!isHost) {
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
  for (let i = 1; i <= 8; i++) {
    const el = document.getElementById("p" + i);
    if (!el) continue;

    el.addEventListener("change", async () => {
      if (!isHost) return;
      await saveRoomStateOnly();
    });
  }
}

window.addEventListener("load", async () => {
  initSupabase();
  setupPlayerSync();

  const url = new URL(window.location.href);
  const roomParam = (url.searchParams.get("room") || "").toUpperCase();
  const hostParam = url.searchParams.get("host") || "";

  if (roomParam) {
    document.getElementById("roomCodeInput").value = roomParam;
    currentHostCode = hostParam;
    await joinRoom();
  }
});