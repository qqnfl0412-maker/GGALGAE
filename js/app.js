window.players = [];
window.loss = {};
window.fixedTeams = [];

window.currentMatches = [];
window.currentWaitingPlayers = [];
window.currentRoundPenalties = [];
window.currentRoundHistoryLines = [];

window.round = 0;
window.resultCount = 0;
window.neededResults = 0;

window.currentScoreMatch = -1;
window.scoreOpenedDbId = null;
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
window.savedRecords = [];

window.eliminationLosses = window.APP_CONFIG?.game?.eliminationLosses ?? 3;
window.galgeCount = 3;
window.loginMode = null;
window.isAdmin = false;
window.currentRoundEliminationOrder = [];
window.roundEndCommitted = false;

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
window.playerInputSaveTimer = null;
window.isTypingPlayer = false;
window.lastPlayerEditTime = 0;
window.lastPlayerInputs = [];

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


function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceNameInHistoryLine(line, oldName, newName) {
  if (!line || !oldName || oldName === newName) return line;
  return line.replace(new RegExp(escapeRegExp(oldName), "g"), newName);
}

function renamePairKeyString(key, oldName, newName) {
  if (!key || !oldName || oldName === newName) return key;
  const parts = String(key).split("|");
  if (parts.length !== 2) return key;
  const next = parts.map(v => v === oldName ? newName : v);
  return pairKey(next[0], next[1]);
}

function mergeNumericMapKey(obj, oldName, newName) {
  if (!obj || !oldName || !newName || oldName === newName) return obj;
  if (!(oldName in obj)) return obj;
  obj[newName] = (obj[newName] || 0) + (obj[oldName] || 0);
  delete obj[oldName];
  return obj;
}

function renameNameArray(arr, oldName, newName) {
  if (!Array.isArray(arr) || !oldName || !newName || oldName === newName) return arr;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === oldName) arr[i] = newName;
  }
  return arr;
}

function renamePairKeyArray(arr, oldName, newName) {
  if (!Array.isArray(arr) || !oldName || !newName || oldName === newName) return arr;
  for (let i = 0; i < arr.length; i++) {
    arr[i] = renamePairKeyString(arr[i], oldName, newName);
  }
  return arr;
}

function renamePairKeyMap(obj, oldName, newName) {
  if (!obj || !oldName || !newName || oldName === newName) return obj;
  const next = {};
  Object.entries(obj).forEach(([key, value]) => {
    const renamedKey = renamePairKeyString(key, oldName, newName);
    next[renamedKey] = (next[renamedKey] || 0) + (value || 0);
  });
  return next;
}

function renamePlayerEverywhere(oldName, newName) {
  oldName = (oldName || "").trim();
  newName = (newName || "").trim();
  if (!oldName || !newName || oldName === newName) return;

  window.loss = mergeNumericMapKey(window.loss, oldName, newName);
  window.playCount = mergeNumericMapKey(window.playCount, oldName, newName);
  window.restCount = mergeNumericMapKey(window.restCount, oldName, newName);
  window.lastRoundPlayed = mergeNumericMapKey(window.lastRoundPlayed, oldName, newName);
  window.lastRoundRest = mergeNumericMapKey(window.lastRoundRest, oldName, newName);

  window.players = renameNameArray(window.players, oldName, newName);
  window.currentWaitingPlayers = renameNameArray(window.currentWaitingPlayers, oldName, newName);
  window.currentRoundPenalties = renameNameArray(window.currentRoundPenalties, oldName, newName);

  window.fixedTeams = (window.fixedTeams || []).map(team => ({
    ...team,
    p1: team.p1 === oldName ? newName : team.p1,
    p2: team.p2 === oldName ? newName : team.p2
  }));

  window.currentMatches = (window.currentMatches || []).map(match => ({
    ...match,
    teams: [
      (match.teams?.[0] || []).map(name => name === oldName ? newName : name),
      (match.teams?.[1] || []).map(name => name === oldName ? newName : name)
    ],
    scoreHistory: (match.scoreHistory || []).map(line => replaceNameInHistoryLine(line, oldName, newName))
  }));

  window.currentRoundHistoryLines = (window.currentRoundHistoryLines || []).map(line => replaceNameInHistoryLine(line, oldName, newName));
  window.recentTeammates = renamePairKeyArray(window.recentTeammates, oldName, newName);
  window.recentOpponents = renamePairKeyArray(window.recentOpponents, oldName, newName);
  window.teamPairCount = renamePairKeyMap(window.teamPairCount, oldName, newName);
  window.opponentPairCount = renamePairKeyMap(window.opponentPairCount, oldName, newName);

  window.roundSnapshots = (window.roundSnapshots || []).map(snapshot => {
    const next = deepCopy(snapshot);
    const states = [next.completedRoundState, next.afterCommitState];
    states.forEach(state => {
      if (!state) return;
      state.loss = mergeNumericMapKey(state.loss || {}, oldName, newName);
      state.playCount = mergeNumericMapKey(state.playCount || {}, oldName, newName);
      state.restCount = mergeNumericMapKey(state.restCount || {}, oldName, newName);
      state.lastRoundPlayed = mergeNumericMapKey(state.lastRoundPlayed || {}, oldName, newName);
      state.lastRoundRest = mergeNumericMapKey(state.lastRoundRest || {}, oldName, newName);
      state.currentWaitingPlayers = renameNameArray(state.currentWaitingPlayers || [], oldName, newName);
      state.currentRoundPenalties = renameNameArray(state.currentRoundPenalties || [], oldName, newName);
      state.historyLines = (state.historyLines || []).map(line => replaceNameInHistoryLine(line, oldName, newName));
      state.recentTeammates = renamePairKeyArray(state.recentTeammates || [], oldName, newName);
      state.recentOpponents = renamePairKeyArray(state.recentOpponents || [], oldName, newName);
      state.teamPairCount = renamePairKeyMap(state.teamPairCount || {}, oldName, newName);
      state.opponentPairCount = renamePairKeyMap(state.opponentPairCount || {}, oldName, newName);
      if (Array.isArray(state.currentMatches)) {
        state.currentMatches = state.currentMatches.map(match => ({
          ...match,
          teams: [
            (match.teams?.[0] || []).map(name => name === oldName ? newName : name),
            (match.teams?.[1] || []).map(name => name === oldName ? newName : name)
          ],
          scoreHistory: (match.scoreHistory || []).map(line => replaceNameInHistoryLine(line, oldName, newName))
        }));
      }
    });
    return next;
  });
}

function syncPlayerNameChangesFromInputs() {
  if (window.isApplyingRemoteState) return;

  const currentInputs = getPlayerInputs();

  if (!Array.isArray(window.lastPlayerInputs) || window.lastPlayerInputs.length === 0) {
    window.lastPlayerInputs = [...currentInputs];
    return;
  }

  for (let i = 0; i < currentInputs.length; i++) {
    const prev = (window.lastPlayerInputs[i] || "").trim();
    const next = (currentInputs[i] || "").trim();
    if (prev && next && prev !== next) {
      renamePlayerEverywhere(prev, next);
    }
  }

  window.lastPlayerInputs = [...currentInputs];
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
    if (
      btn.id === "scoreTapA" ||
      btn.id === "scoreTapB" ||
      btn.id === "scoreUndoBtn" ||
      btn.id === "finishMatchBtn" ||
      btn.id === "courtSwapBtn"
    ) {
      btn.disabled = disabled;
    }
  });
}

function refreshRoundActionButtons() {
  const makeBtn = document.getElementById("makeBtn");
  const nextRoundBtn = document.getElementById("nextRoundBtn");

  if (makeBtn) makeBtn.style.display = "none";
  if (nextRoundBtn) nextRoundBtn.style.display = "none";

  if (isCurrentRoundCompleted()) {
    if (nextRoundBtn) nextRoundBtn.style.display = "inline-block";
    return;
  }

  if (window.isHost && window.round === 0 && !window.roundLocked) {
    if (makeBtn) makeBtn.style.display = "inline-block";
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
    section.push(`${p} 핸디캡 패 +1`);
  });

  (matches || []).forEach(match => {
    if (!match.finished || match.winnerIndex === null) return;

    const teamA = match.teams[0].join("/");
    const teamB = match.teams[1].join("/");
    const winnerText = match.winnerIndex === 0 ? `${teamA} 승` : `${teamB} 승`;

    section.push(
      `${teamA} ${match.scoreA} : ${match.scoreB} ${teamB} (${winnerText})`
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
    seed = deepCopy(
      window.roundSnapshots[window.roundSnapshots.length - 1]?.afterCommitState?.historyLines || []
    );
  }

  return deepCopy(getHistoryLinesBeforeRound(seed, window.round));
}

function updatePenaltyList() {
  const select = document.getElementById("penaltyPlayer");
  if (!select) return;

  const activePlayers = Object.keys(window.loss).filter(name => window.loss[name] < window.eliminationLosses);

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
  const roundStillInProgress =
    window.roundLocked &&
    window.currentMatches.length > 0 &&
    (window.resultCount || 0) < (window.neededResults || 0);

  const roundRestoredAndDone =
    window.restoredCompletedRound &&
    window.roundLocked &&
    window.currentMatches.length > 0;

  if (roundStillInProgress || roundRestoredAndDone) {
    const finishedNow = window.currentMatches.some(match =>
      match.finished &&
      (match.teams[0].includes(name) || match.teams[1].includes(name))
    );

    if (finishedNow) count += 1;
  }

  return count;
}

function getLiveRestCount(name) {
  let count = window.restCount[name] || 0;
  const roundStillInProgress =
    window.roundLocked &&
    window.currentMatches.length > 0 &&
    (window.resultCount || 0) < (window.neededResults || 0);

  const roundRestoredAndDone =
    window.restoredCompletedRound &&
    window.roundLocked &&
    window.currentMatches.length > 0;

  if ((roundStillInProgress || roundRestoredAndDone) && window.currentWaitingPlayers.includes(name)) {
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

      const playA = getLivePlayCount(a);
      const playB = getLivePlayCount(b);
      if (playB !== playA) return playB - playA;

      const restA = getLiveRestCount(a);
      const restB = getLiveRestCount(b);
      if (restA !== restB) return restA - restB;

      return a.localeCompare(b, "ko");
    });

    for (const name of names) {
      const livePlayCount = getLivePlayCount(name);
      const liveRestCount = getLiveRestCount(name);

      let text = `${name} : ${window.loss[name]}패`;
      if (window.loss[name] >= window.eliminationLosses) text += " (탈락)";
      text += ` / 출전 ${livePlayCount} / 대기 ${liveRestCount}`;
      html += text + "<br>";
    }
  }

  const scoreEl = document.getElementById("score");
  if (scoreEl) scoreEl.innerHTML = html;
  updatePenaltyList();
  updatePlayersPreview();
  updateGalgeList();
}

function collectPlayers() {
  syncPlayerNameChangesFromInputs();
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
  window.players = window.players.filter(name => window.loss[name] < window.eliminationLosses);
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
  const now = Date.now();

  if (window.isTypingPlayer && now - window.lastPlayerEditTime < 1000) {
    return;
  }

  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const el = document.getElementById("p" + i);
    if (!el) continue;

    const nextValue = arr[i - 1] || "";
    if (el.value !== nextValue) {
      el.value = nextValue;
    }
  }

  updatePlayersPreview();
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
  updateGalgeCountUI();
}

function updateAdminOnlyUI() {
  document.querySelectorAll(".adminOnly").forEach(el => {
    if (window.isAdmin) el.classList.remove("hidden-admin");
    else el.classList.add("hidden-admin");
  });
}

async function saveLogoToServer(base64OrNull) {
  if (!window.supabaseClient || !window.currentRoomCode) return;
  const { error } = await window.supabaseClient
    .from("match_rooms")
    .update({ logo_base64: base64OrNull })
    .eq("room_code", window.currentRoomCode);
  if (error) console.error("로고 저장 실패:", error);
}

function resizeImageToBase64(file, maxPx, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width  * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width  = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadCustomLogo() {
  const customLogo = localStorage.getItem("customLogoBase64");
  const splashEl = document.getElementById("splashLogoFull");
  if (splashEl) {
    splashEl.innerHTML = customLogo
      ? `<img src="${customLogo}" style="width:100%;height:100%;object-fit:cover;">`
      : "";
  }
  const previewBox = document.getElementById("logoPreviewBox");
  const previewImg = document.getElementById("logoPreviewImg");
  const previewEl  = document.getElementById("logoPreview");
  if (customLogo) {
    if (previewImg) previewImg.src = customLogo;
    if (previewBox) previewBox.style.display = "";
    if (previewEl)  previewEl.innerText = "현재 커스텀 로고 적용 중 (앱 시작 화면에 표시됩니다)";
  } else {
    if (previewBox) previewBox.style.display = "none";
    if (previewImg) previewImg.src = "";
    if (previewEl)  previewEl.innerText = "설정된 로고 없음";
  }
}

async function changeLogoImage(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    alert("이미지가 너무 커. 10MB 이하 파일을 사용해줘.");
    return;
  }
  const previewEl = document.getElementById("logoPreview");
  if (previewEl) previewEl.innerText = "처리 중...";
  try {
    // 최대 1000px로 리사이즈, JPEG 0.85 품질 → ~200KB 이하
    const b64 = await resizeImageToBase64(file, 1000, 0.85);
    localStorage.setItem("customLogoBase64", b64);
    loadCustomLogo();
    await saveLogoToServer(b64);
    if (previewEl) previewEl.innerText = "저장됐어. 방에 접속한 모든 기기에 반영돼.";
  } catch (err) {
    alert("이미지 처리 실패: " + err);
    if (previewEl) previewEl.innerText = "";
  }
}

async function resetLogoImage() {
  localStorage.removeItem("customLogoBase64");
  loadCustomLogo();
  await saveLogoToServer(null);
  const previewEl = document.getElementById("logoPreview");
  if (previewEl) previewEl.innerText = "기본 로고로 초기화됐어.";
}

async function goPage(name) {
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

  if (name === "home") {
    updateHomePageMode();
    const installBtn = document.getElementById("pwaInstallBtn");
    if (installBtn) installBtn.style.display = window.pwaInstallEvent ? "" : "none";
  } else {
    const installBtn = document.getElementById("pwaInstallBtn");
    if (installBtn) installBtn.style.display = "none";
  }

  if (prevPage === "score" && name !== "score") {
    await leaveScoreRefereeMode();
    window.scoreSidePanelOpen = false;
    updateScoreSidePanel();
  }

  if (name === "score") {
    await enterScoreRefereeMode();
    window.scoreSidePanelOpen = false;
    updateScoreSidePanel();
  }

  updateFloatingRoomStatus();
  updateScoreOrientationGuide();
  renderScoreMatchList();

  if (name === "settings") {
    updateFixedTeamDropdowns();
  }
}

function resetLocalStateOnly() {
  window.players = [];
  window.loss = {};
  window.fixedTeams = [];

  window.currentMatches = [];
  window.currentWaitingPlayers = [];
  window.currentRoundPenalties = [];
  window.currentRoundHistoryLines = [];

  window.eliminationLosses = window.eliminationLosses;
  window.round = 0;
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

  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const el = document.getElementById("p" + i);
    if (el) el.value = "";
  }
  window.visiblePlayerSlots = 4;

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
  updateGalgeList();
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
      round_no: 0,
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

async function deleteRoom() {
  if (!window.isAdmin) { alert("관리자만 방을 삭제할 수 있어."); return; }
  if (!window.currentRoomCode) { alert("연결된 방이 없어."); return; }
  if (!confirm(`방 "${window.currentRoomCode}"을 DB에서 완전히 삭제할까요?\n이 작업은 되돌릴 수 없어.`)) return;
  if (!beginHostAction()) return;

  try {
    await window.supabaseClient.from("match_round_matches").delete().eq("room_code", window.currentRoomCode);
    const { error } = await window.supabaseClient.from("match_rooms").delete().eq("room_code", window.currentRoomCode);

    if (error) {
      alert("방 삭제 실패: " + (error.message || "알 수 없는 오류"));
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    url.searchParams.delete("host");
    window.history.replaceState({}, "", url.toString());

    resetLocalStateOnly();
    window.currentRoomCode = "";
    window.currentHostCode = "";
    window.isHost = false;

    updateRoomInfo();
    updateBottomNav();
    updateHomePageMode();
    renderHistory();
    renderMatches();
    updateScore();

    alert("방을 삭제했어.");
  } finally {
    endHostAction();
  }
}

let _pendingDeleteRoomCode = null;

function deleteRoomByCode(code) {
  if (!window.isAdmin) { alert("관리자만 방을 삭제할 수 있어."); return; }
  _pendingDeleteRoomCode = code;
  const text = document.getElementById("deleteRoomModalText");
  if (text) text.textContent = `방 "${code}"을 삭제하시겠습니까?`;
  const modal = document.getElementById("deleteRoomModal");
  if (modal) modal.classList.remove("hidden");
}

function cancelDeleteRoomByCode() {
  _pendingDeleteRoomCode = null;
  const modal = document.getElementById("deleteRoomModal");
  if (modal) modal.classList.add("hidden");
}

async function confirmDeleteRoomByCode() {
  const code = _pendingDeleteRoomCode;
  cancelDeleteRoomByCode();
  if (!code) return;
  if (!beginHostAction()) return;
  try {
    await window.supabaseClient.from("match_round_matches").delete().eq("room_code", code);
    const { error } = await window.supabaseClient.from("match_rooms").delete().eq("room_code", code);
    if (error) { alert("방 삭제 실패: " + (error.message || "알 수 없는 오류")); return; }

    if (window.currentRoomCode === code) {
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      url.searchParams.delete("host");
      window.history.replaceState({}, "", url.toString());
      resetLocalStateOnly();
      window.currentRoomCode = "";
      window.currentHostCode = "";
      window.isHost = false;
      updateRoomInfo();
      updateBottomNav();
      updateHomePageMode();
      renderHistory();
      renderMatches();
      updateScore();
    }

    loadRoomList();
    alert("방을 삭제했어.");
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

function updateFixedTeamDropdowns() {
  const sel1 = document.getElementById("fixed1");
  const sel2 = document.getElementById("fixed2");
  const selR = document.getElementById("fixedRound");
  if (!sel1 || !sel2 || !selR) return;

  const players = [];
  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const el = document.getElementById("p" + i);
    if (el && el.value.trim()) players.push(el.value.trim());
  }

  const val1 = sel1.value;
  const val2 = sel2.value;

  sel1.innerHTML = '<option value="">선수 1 선택</option>' +
    players.filter(p => p !== val2).map(p => `<option value="${p}"${p === val1 ? " selected" : ""}>${p}</option>`).join("");

  sel2.innerHTML = '<option value="">선수 2 선택</option>' +
    players.filter(p => p !== sel1.value).map(p => `<option value="${p}"${p === val2 ? " selected" : ""}>${p}</option>`).join("");

  const currentRound = window.round || 0;
  const start = currentRound + 1;
  const curSelR = selR.value;
  selR.innerHTML = '<option value="">라운드 선택</option>';
  for (let r = start; r < start + 5; r++) {
    selR.innerHTML += `<option value="${r}"${String(r) === curSelR ? " selected" : ""}>${r}라운드</option>`;
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
    score += (Math.random() - 0.5) * 20;

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

      score += (Math.random() - 0.5) * 40;

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

  let html = `<h3 style="margin-top:0;">${window.round > 0 ? `Round ${window.round}` : "대기 상태"}</h3>`;

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
    nextRoundRequestedRound: window.nextRoundRequestedRound,
    eliminationLosses: window.eliminationLosses,
    galgeCount: window.galgeCount,
    savedRecords: deepCopy(window.savedRecords || [])
  };
}

async function saveRoomStateOnly() {
  if (!window.supabaseClient || !window.currentRoomCode || window.isApplyingRemoteState) return;

  syncPlayerNameChangesFromInputs();

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

async function makeMatch(skipHostBusyCheck = false, skipHostCheck = false) {
  if (!skipHostCheck && !ensureHost("대진 생성")) return;

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

    if (window.round <= 0) {
      window.round = 1;
    }

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
    window.roundEndCommitted = false;
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
  if (!isCurrentRoundCompleted()) {
    alert("현재 라운드가 아직 끝나지 않았어.");
    return;
  }

  if (!beginHostAction()) return;

  window.participantCanSeeNextRound = false;

  try {
    const { history: galgeHistory } = computeGalgeFromSnapshots();
    const galgeLimit = window.galgeCount || 3;
    if (galgeHistory.length > galgeLimit) {
      if (confirm(`깔개 수(${galgeLimit}명)를 초과했습니다.\n게임을 종료하시겠습니까?\n\n(취소하면 계속 진행됩니다)`)) {
        alert("게임이 종료됩니다. 수고하셨습니다!");
        return;
      }
    }

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
    await makeMatch(true, true);
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
  if (window.roundEndCommitted) return;
  window.roundEndCommitted = true;

  markRoomReloadSuppressed(4000);

  const completedRoundState = {
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
    historyLines: deepCopy(getCurrentHistoryLines()),
    resultCount: window.resultCount,
    neededResults: window.neededResults,
    eliminationOrder: deepCopy(window.currentRoundEliminationOrder || [])
  };

  commitRoundStats();
  updateScore();

  const nextHistorySeed = deepCopy(getCurrentHistoryLines());

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
    historyLines: deepCopy(nextHistorySeed)
  };

  window.roundSnapshots.push({
    completedRoundState: deepCopy(completedRoundState),
    afterCommitState: deepCopy(afterCommitState)
  });

  window.restoredCompletedRound = false;
  window.restoredSnapshotIndex = -1;
  window.currentRoundPenalties = [];
  window.currentRoundEliminationOrder = [];
  window.roundLocked = false;

  renderHistory();
  renderMatches();
  updateScore();
  refreshRoundActionButtons();

  collectPlayers();
  await saveRoomStateOnly();
  setTimeout(() => loadRoomStateFromServer(), 150);

  if (window.players.filter(p => window.loss[p] < window.eliminationLosses).length < 4) {
    const matchEl = document.getElementById("match");
    if (matchEl) matchEl.innerHTML += `<div><b>경기 종료</b></div>`;
  }
}

async function undoRound() {
  if (!ensureHost("이전 완료 라운드 복구")) return;
  if (!beginHostAction()) return;

  try {
    let targetIndex;

    if (window.restoredCompletedRound) {
      targetIndex = window.restoredSnapshotIndex - 1;
    } else {
      targetIndex = window.roundSnapshots.length - 1;
    }

    let message = "이전 완료 라운드로 복구할까요?";
    if (window.roundLocked && !window.restoredCompletedRound) {
      message = `현재 Round ${window.round} 진행 내용은 버리고, 이전 완료 라운드로 복구할까요?`;
    }

    if (!confirm(message)) return;

    markRoomReloadSuppressed(4000);

    if (targetIndex < 0) {
      window.restoredSnapshotIndex = -1;
      window.restoredCompletedRound = false;

      window.round = 0;
      window.currentMatches = [];
      window.currentWaitingPlayers = [];
      window.currentRoundPenalties = [];
      window.currentRoundHistoryLines = [];
      window.resultCount = 0;
      window.neededResults = 0;
      window.roundLocked = false;
      window.participantCanSeeNextRound = false;
      window.nextRoundRequestId = "";
      window.nextRoundRequestedRound = 0;
      window.currentScoreMatch = -1;
      window.editMode = false;

      // 모든 통계/기록을 완전 초기화 (패배, 대진 기록 포함)
      window.roundSnapshots = [];
      window.loss = {};
      window.teamPairCount = {};
      window.opponentPairCount = {};
      window.playCount = {};
      window.restCount = {};
      window.lastRoundPlayed = {};
      window.lastRoundRest = {};
      window.recentTeammates = [];
      window.recentOpponents = [];

      renderHistory();
      renderMatches();
      updateScore();
      clearSelectedMatch();

      markMatchesReloadSuppressed(1600);

      const ok = await replaceAllMatchesOnServer();
      if (!ok) return;

      await saveRoomStateOnly();
      setTimeout(() => loadRoomStateFromServer(), 150);

      alert("0라운드 대기 상태로 복구했어.");
      return;
    }

    window.restoredSnapshotIndex = targetIndex;
    const snapshot = window.roundSnapshots[window.restoredSnapshotIndex];
    const state = snapshot.completedRoundState;
    const committed = snapshot.afterCommitState || {};

    window.round = state.round;
    window.loss = deepCopy(state.loss || {});
    window.teamPairCount = deepCopy(state.teamPairCount || {});
    window.opponentPairCount = deepCopy(state.opponentPairCount || {});
    window.playCount = deepCopy(state.playCount || {});
    window.restCount = deepCopy(state.restCount || {});
    window.lastRoundPlayed = deepCopy(state.lastRoundPlayed || {});
    window.lastRoundRest = deepCopy(state.lastRoundRest || {});
    window.recentTeammates = deepCopy(state.recentTeammates || []);
    window.recentOpponents = deepCopy(state.recentOpponents || []);

    window.currentMatches = deepCopy(state.currentMatches || []);
    window.currentWaitingPlayers = deepCopy(state.currentWaitingPlayers || []);
    window.currentRoundPenalties = deepCopy(state.currentRoundPenalties || []);
    window.currentRoundHistoryLines = deepCopy(state.historyLines || []);
    window.currentRoundEliminationOrder = deepCopy(state.eliminationOrder || []);

    window.resultCount = state.resultCount || 0;
    window.neededResults = state.neededResults || 0;

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
    } else if (meta.restoredCompletedRound && meta.restoredSnapshotIndex === 0) {
      seed = [];
    } else if (snaps.length > 0) {
      seed = deepCopy(snaps[snaps.length - 1]?.afterCommitState?.historyLines || []);
    }

    seed = deepCopy(getHistoryLinesBeforeRound(seed, room.round_no));

    const currentRoundMatches = (matches || []).map((m, idx) => ({
      matchIndex: idx,
      teams: [deepCopy(m.team_a || []), deepCopy(m.team_b || [])],
      finished: !!m.finished,
      scoreA: m.score_a || 0,
      scoreB: m.score_b || 0,
      winnerIndex: typeof m.winner_index === "number" ? m.winner_index : null
    }));

    return deepCopy([
      ...seed,
      ...buildRoundSection(
        room.round_no,
        room.waiting_players || [],
        meta.currentRoundPenalties || [],
        currentRoundMatches
      )
    ]);
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
  syncVisiblePlayerSlots();
  renderPlayerGrid();
  window.lastPlayerInputs = getPlayerInputs();
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
  window.eliminationLosses = typeof meta.eliminationLosses === "number" ? meta.eliminationLosses : window.eliminationLosses;
  window.galgeCount = typeof meta.galgeCount === "number" ? meta.galgeCount : (window.galgeCount || 3);
  window.savedRecords = deepCopy(meta.savedRecords || window.savedRecords || []);
  updateEliminationLossesUI();
  updateGalgeCountUI();


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

  let scorePageStale = false;

  if (window.currentScoreMatch >= 0 && window.currentMatches[window.currentScoreMatch]) {
    const newMatch = window.currentMatches[window.currentScoreMatch];
    if (window.currentPage === "score" && window.scoreOpenedDbId && newMatch.dbId !== window.scoreOpenedDbId) {
      scorePageStale = true;
    } else {
      document.getElementById("scoreRoundLabel").innerText = `Round ${window.round} / 경기 ${window.currentScoreMatch + 1}`;
      document.getElementById("editModeLabel").innerText = newMatch.finished ? "수정 모드" : "";
      updateScoreBoard();
    }
  } else if (window.currentPage === "score" && window.currentScoreMatch >= 0) {
    scorePageStale = true;
  } else {
    clearSelectedMatch();
  }

  setSyncStatus("실시간 연결 중");
  window.isApplyingRemoteState = false;

  maybeHandleParticipantNextRoundRequest();

  if (scorePageStale) {
    alert("종료된 경기입니다.");
    exitScorePage();
  }
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
    .subscribe(status => {
      window.realtimeRoomConnected = (status === "SUBSCRIBED");
      startPollingFallbackIfNeeded();
    });

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
    .subscribe(status => {
      window.realtimeMatchesConnected = (status === "SUBSCRIBED");
      startPollingFallbackIfNeeded();
    });
}

function startPollingFallbackIfNeeded() {
  if (window.pollingInterval) return;
  window.pollingInterval = setInterval(async () => {
    if (!window.currentRoomCode) return;
    if (window.realtimeRoomConnected && window.realtimeMatchesConnected) return;
    if (Date.now() < window.suppressRoomReloadUntil) return;
    await loadRoomStateFromServer();
  }, 5000);
}

function stopPollingFallback() {
  if (window.pollingInterval) {
    clearInterval(window.pollingInterval);
    window.pollingInterval = null;
  }
}

function randomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function updateBottomNav() {
  const nav = document.getElementById("bottomNav");
  if (!nav) return;
  const hasRole = window.loginMode !== null && window.loginMode !== undefined;
  nav.style.display = hasRole ? "grid" : "none";

  const isParticipant = window.loginMode === "participant";
  const settingsBtn = nav.querySelector('[data-page="settings"]');
  if (settingsBtn) {
    settingsBtn.style.display = isParticipant ? "none" : "";
  }
  nav.style.gridTemplateColumns = isParticipant ? "repeat(4, 1fr)" : "repeat(5, 1fr)";
}

function updateHomePageMode() {
  const isPrivileged = window.loginMode === "admin" || window.loginMode === "host";
  const entryBtns = document.getElementById("homeEntryButtons");
  const fullBtns = document.getElementById("homeFullButtons");
  const statusCard = document.getElementById("homeStatusCard");
  const cardTitle = document.getElementById("homeCardTitle");
  const input = document.getElementById("roomCodeInput");

  if (entryBtns) entryBtns.style.display = isPrivileged ? "none" : "grid";
  if (fullBtns) fullBtns.style.display = isPrivileged ? "block" : "none";
  if (statusCard) statusCard.style.display = isPrivileged ? "block" : "none";
  if (cardTitle) cardTitle.innerText = isPrivileged ? "방 연결" : "시작";
  if (input) input.placeholder = isPrivileged ? "방코드 입력" : "코드 입력";
}

async function handleStart() {
  const input = document.getElementById("roomCodeInput");
  const val = input ? input.value.trim() : "";

  if (!val) {
    alert("코드를 입력해줘.");
    return;
  }

  if (val.toLowerCase() === "ggalgae") {
    window.isAdmin = true;
    window.loginMode = "admin";
    localStorage.setItem("isAdmin", "1");
    localStorage.setItem("loginMode", "admin");
    if (input) input.value = "";
    updateAdminOnlyUI();
    updateHomePageMode();
    updateBottomNav();
    updateRoomInfo();
    return;
  }

  if (val === "j1037") {
    window.isAdmin = false;
    localStorage.removeItem("isAdmin");
    window.loginMode = "host";
    localStorage.setItem("loginMode", "host");
    if (input) input.value = "";
    updateHomePageMode();
    updateBottomNav();
    updateRoomInfo();
    return;
  }

  if (!window.supabaseClient) initSupabase();
  if (!window.supabaseClient) { alert("서버 연결 실패"); return; }

  const roomCode = val.toUpperCase();
  const { data, error } = await window.supabaseClient
    .from("match_rooms")
    .select("*")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (error || !data) {
    alert("방을 찾지 못했어.");
    return;
  }

  window.currentRoomCode = roomCode;
  window.isHost = false;
  window.currentHostCode = "";
  window.loginMode = "participant";
  localStorage.setItem("loginMode", "participant");

  const url = new URL(window.location.href);
  url.searchParams.set("room", roomCode);
  url.searchParams.delete("host");
  window.history.replaceState({}, "", url.toString());

  updateBottomNav();
  updateRoomInfo();
  await subscribeRoomRealtime();
  await loadRoomStateFromServer();
  await goPage("players");
}

async function createRoom() {
  if (!window.supabaseClient) initSupabase();
  if (!window.supabaseClient) return;

  const rawInput = document.getElementById("roomCodeInput").value.trim();

  // 관리자 코드 입력 시 관리자 권한 부여
  if (rawInput.toLowerCase() === "ggalgae") {
    window.isAdmin = true;
    window.loginMode = "admin";
    localStorage.setItem("isAdmin", "1");
    localStorage.setItem("loginMode", "admin");
    document.getElementById("roomCodeInput").value = "";
    updateAdminOnlyUI();
    updateHomePageMode();
    updateBottomNav();
    updateRoomInfo();
    alert("관리자 권한이 부여됐어.");
    return;
  }

  if (!beginHostAction()) return;

  try {
    const inputVal = rawInput.toUpperCase();
    const roomCode = inputVal || randomCode(6);

    if (!/^[A-Z0-9]{4,10}$/.test(roomCode)) {
      alert("방코드는 영문/숫자 4~10자리로 입력해줘.");
      return;
    }

    const { data: existing } = await window.supabaseClient
      .from("match_rooms")
      .select("room_code")
      .eq("room_code", roomCode)
      .maybeSingle();

    if (existing) {
      alert(`방코드 "${roomCode}"는 이미 사용 중이야. 다른 코드를 입력해줘.`);
      return;
    }

    const hostCode = randomCode(10);

    resetLocalStateOnly();

    const roomPayload = {
      room_code: roomCode,
      host_code: hostCode,
      round_no: 0,
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

  const rawJoin = document.getElementById("roomCodeInput").value.trim();

  // 관리자 코드 입력 시 관리자 권한 부여
  if (rawJoin.toLowerCase() === "ggalgae") {
    window.isAdmin = true;
    window.loginMode = "admin";
    localStorage.setItem("isAdmin", "1");
    localStorage.setItem("loginMode", "admin");
    document.getElementById("roomCodeInput").value = "";
    updateAdminOnlyUI();
    updateHomePageMode();
    updateBottomNav();
    updateRoomInfo();
    alert("관리자 권한이 부여됐어.");
    return;
  }

  const roomCode = rawJoin.toUpperCase();
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

  window.currentHostCode = hostParam || data.host_code;
  window.isHost = (!!hostParam && hostParam === data.host_code) || window.loginMode === "host" || window.loginMode === "admin";

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
  const roomInfoEl = document.getElementById("roomInfo");
  if (roomInfoEl) {
    let roleLabel = "";
    if (window.loginMode === "admin") roleLabel = "관리자";
    else if (window.loginMode === "host") roleLabel = "방장";
    // participant → 빈 문자열

    roomInfoEl.innerText = roleLabel;
  }
  updateFloatingRoomStatus();
  updateHostOnlyUI();
  updateAdminOnlyUI();
}

function getShareBaseURL() {
  const configured = window.APP_CONFIG?.app?.publicBaseUrl?.trim();
  if (configured) return configured;

  return window.location.origin + window.location.pathname;
}

function getPlayerRoomURL() {
  if (!window.currentRoomCode) return "";
  const url = new URL(getShareBaseURL());
  url.searchParams.set("room", window.currentRoomCode);
  return url.toString();
}

function getHostRoomURL() {
  if (!window.currentRoomCode || !window.currentHostCode) return "";
  const url = new URL(getShareBaseURL());
  url.searchParams.set("room", window.currentRoomCode);
  url.searchParams.set("host", window.currentHostCode);
  return url.toString();
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {}
  }
  // HTTP 환경 폴백
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0;";
  document.body.appendChild(el);
  el.focus();
  el.select();
  try {
    document.execCommand("copy");
    document.body.removeChild(el);
    return true;
  } catch (e) {
    document.body.removeChild(el);
    prompt("링크를 직접 복사해줘:", text);
    return false;
  }
}

async function copyPlayerLink() {
  const link = getPlayerRoomURL();
  if (!link) { alert("먼저 방에 연결해줘."); return; }
  const ok = await copyToClipboard(link);
  if (ok) alert("참가자 링크를 복사했어.");
}

async function copyHostLink() {
  if (!window.isHost) { alert("방장 링크는 방장만 복사할 수 있어."); return; }
  const link = getHostRoomURL();
  if (!link) { alert("방장 정보가 없어."); return; }
  const ok = await copyToClipboard(link);
  if (ok) alert("방장 링크를 복사했어.");
}


window.visiblePlayerSlots = Math.max(window.visiblePlayerSlots || 4, 4);
window.playerModalState = window.playerModalState || { slot: 0, mode: "create" };

function escapeHTML(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureHiddenPlayerInputs() {
  const wrap = document.getElementById("hiddenPlayerInputs");
  if (!wrap) return;

  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    let input = document.getElementById("p" + i);
    if (input) continue;

    input = document.createElement("input");
    input.type = "text";
    input.id = "p" + i;
    input.maxLength = 20;
    input.dataset.playerIndex = String(i);
    wrap.appendChild(input);
  }
}

function getHighestFilledPlayerSlot() {
  let highest = 0;
  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const input = document.getElementById("p" + i);
    if (input && input.value.trim()) highest = i;
  }
  return highest;
}

function syncVisiblePlayerSlots() {
  const highestFilled = getHighestFilledPlayerSlot();
  window.visiblePlayerSlots = Math.max(4, window.visiblePlayerSlots || 4, highestFilled);
  window.visiblePlayerSlots = Math.min(window.visiblePlayerSlots, window.APP_CONFIG.game.maxPlayers);

  const addBtn = document.getElementById("addPlayerBtn");
  if (addBtn) {
    const isParticipant = window.loginMode === "participant";
    addBtn.disabled = isParticipant || window.visiblePlayerSlots >= window.APP_CONFIG.game.maxPlayers;
    addBtn.style.display = isParticipant ? "none" : "";
  }
}

function renderPlayerGrid() {
  const grid = document.getElementById("playerGrid");
  if (!grid) return;

  syncVisiblePlayerSlots();
  grid.innerHTML = "";

  for (let i = 1; i <= window.visiblePlayerSlots; i++) {
    const input = document.getElementById("p" + i);
    const name = input ? input.value.trim() : "";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "player-slot-card" + (name ? " filled" : "");
    btn.onclick = () => openPlayerModal(i);

    if (name) {
      btn.innerHTML = `<span class="player-slot-name">${escapeHTML(name)}</span>`;
    } else {
      btn.innerHTML = `<span class="player-slot-label">${i}번 선수</span>`;
    }

    grid.appendChild(btn);
  }
}

function updatePlayerUI() {
  syncVisiblePlayerSlots();
  renderPlayerGrid();
  updatePlayersPreview();
}

async function persistPlayerInputs() {
  if (!window.isHost) return;
  try {
    markRoomReloadSuppressed(3000);
    await saveRoomStateOnly();
  } catch (e) {
    console.error("saveRoomStateOnly failed:", e);
  }
}

function addPlayerSlot() {
  if (window.loginMode === "participant") return;
  ensureHiddenPlayerInputs();
  if ((window.visiblePlayerSlots || 4) >= window.APP_CONFIG.game.maxPlayers) return;
  window.visiblePlayerSlots += 1;
  renderPlayerGrid();
  openPlayerModal(window.visiblePlayerSlots);
}

function closePlayerModal() {
  const modal = document.getElementById("playerModal");
  if (!modal) return;
  modal.classList.add("hidden");
}

function openPlayerModal(slot) {
  ensureHiddenPlayerInputs();

  const input = document.getElementById("p" + slot);
  const name = input ? input.value.trim() : "";
  const modal = document.getElementById("playerModal");
  const title = document.getElementById("playerModalTitle");
  const textInput = document.getElementById("playerModalInput");
  const nameBox = document.getElementById("playerModalName");
  const hint = document.getElementById("playerModalHint");
  const actions = document.getElementById("playerModalActions");
  if (!modal || !title || !textInput || !nameBox || !hint || !actions) return;

  window.playerModalState = { slot, mode: name ? "view" : "create" };

  modal.classList.remove("hidden");
  actions.className = "player-modal-actions";
  hint.innerText = "";

  const isParticipant = window.loginMode === "participant";

  if (!name) {
    if (isParticipant) {
      closePlayerModal();
      return;
    }
    title.innerText = `${slot}번 선수 입력`;
    textInput.style.display = "block";
    textInput.value = "";
    textInput.placeholder = "이름 입력";
    nameBox.style.display = "none";
    actions.classList.add("single");
    actions.innerHTML = `
      <button type="button" onclick="confirmPlayerCreate()">확인</button>
      <button type="button" class="secondary" onclick="closePlayerModal()">취소</button>
    `;
    setTimeout(() => textInput.focus(), 40);
    return;
  }

  title.innerText = `${slot}번 선수`;
  textInput.style.display = "none";
  nameBox.style.display = "block";
  nameBox.innerText = name;
  if (isParticipant) {
    actions.classList.add("single");
    actions.innerHTML = `
      <button type="button" onclick="startPlayerEdit()">수정</button>
      <button type="button" class="secondary" onclick="closePlayerModal()">확인</button>
    `;
  } else {
    actions.innerHTML = `
      <button type="button" onclick="startPlayerEdit()">수정</button>
      <button type="button" class="danger" onclick="deletePlayerSlot()">삭제</button>
      <button type="button" class="secondary" onclick="closePlayerModal()">확인</button>
    `;
  }
}

function startPlayerEdit() {
  const slot = window.playerModalState?.slot || 0;
  const input = document.getElementById("p" + slot);
  const currentName = input ? input.value.trim() : "";
  const title = document.getElementById("playerModalTitle");
  const textInput = document.getElementById("playerModalInput");
  const nameBox = document.getElementById("playerModalName");
  const actions = document.getElementById("playerModalActions");
  if (!slot || !textInput || !nameBox || !actions) return;

  window.playerModalState.mode = "edit";
  if (title) title.innerText = `${slot}번 선수 수정`;
  textInput.style.display = "block";
  textInput.value = currentName;
  textInput.placeholder = "이름 입력";
  nameBox.style.display = "none";
  actions.className = "player-modal-actions single";
  actions.innerHTML = `
    <button type="button" onclick="confirmPlayerEdit()">저장</button>
    <button type="button" class="secondary" onclick="closePlayerModal()">취소</button>
  `;
  setTimeout(() => {
    textInput.focus();
    textInput.select();
  }, 40);
}

async function confirmPlayerCreate() {
  const slot = window.playerModalState?.slot || 0;
  const textInput = document.getElementById("playerModalInput");
  if (!slot || !textInput) return;

  const nextName = textInput.value.trim();
  if (!nextName) {
    alert("이름을 입력해줘.");
    textInput.focus();
    return;
  }

  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    if (i === slot) continue;
    const other = document.getElementById("p" + i);
    if (other && other.value.trim() === nextName) {
      alert("같은 이름이 이미 있어.");
      textInput.focus();
      return;
    }
  }

  const input = document.getElementById("p" + slot);
  if (input) input.value = nextName;

  window.isTypingPlayer = true;
  window.lastPlayerEditTime = Date.now();
  updatePlayerUI();
  closePlayerModal();
  await persistPlayerInputs();
}

async function confirmPlayerEdit() {
  const slot = window.playerModalState?.slot || 0;
  const textInput = document.getElementById("playerModalInput");
  const input = document.getElementById("p" + slot);
  if (!slot || !textInput || !input) return;

  const oldName = input.value.trim();
  const newName = textInput.value.trim();

  if (!newName) {
    alert("이름을 입력해줘.");
    textInput.focus();
    return;
  }

  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    if (i === slot) continue;
    const other = document.getElementById("p" + i);
    if (other && other.value.trim() === newName) {
      alert("같은 이름이 이미 있어.");
      textInput.focus();
      return;
    }
  }

  if (oldName && newName && oldName !== newName) {
    renamePlayerEverywhere(oldName, newName);
  }

  input.value = newName;
  window.isTypingPlayer = true;
  window.lastPlayerEditTime = Date.now();
  updatePlayerUI();
  closePlayerModal();
  await persistPlayerInputs();
}

async function deletePlayerSlot() {
  const slot = window.playerModalState?.slot || 0;
  const input = document.getElementById("p" + slot);
  if (!slot || !input) return;

  const oldName = input.value.trim();
  input.value = "";

  updatePlayerUI();
  closePlayerModal();
  await persistPlayerInputs();
}

function initPlayerManagementUI() {
  ensureHiddenPlayerInputs();
  syncVisiblePlayerSlots();
  renderPlayerGrid();
}

function setupModalKeyHandler() {
  const modalInput = document.getElementById("playerModalInput");
  if (!modalInput) return;
  modalInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const mode = window.playerModalState?.mode;
    if (mode === "create") confirmPlayerCreate();
    else if (mode === "edit") confirmPlayerEdit();
  });

  const roomInput = document.getElementById("roomCodeInput");
  if (roomInput) {
    roomInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const isPrivileged = window.loginMode === "admin" || window.loginMode === "host";
      if (!isPrivileged) handleStart();
    });
  }
}

function setupPlayerSync() {
  for (let i = 1; i <= window.APP_CONFIG.game.maxPlayers; i++) {
    const el = document.getElementById("p" + i);
    if (!el) continue;

    el.addEventListener("input", () => {
      window.isTypingPlayer = true;
      window.lastPlayerEditTime = Date.now();

      updatePlayersPreview();

      if (!window.isHost) return;

      clearTimeout(window.playerInputSaveTimer);
      window.playerInputSaveTimer = setTimeout(async () => {
        await saveRoomStateOnly();
        window.isTypingPlayer = false;
      }, 500);
    });

    el.addEventListener("blur", async () => {
      window.isTypingPlayer = false;

      if (!window.isHost) return;

      clearTimeout(window.playerInputSaveTimer);
      await saveRoomStateOnly();
    });
  }
}

function updateEliminationLossesUI() {
  const input = document.getElementById("eliminationLossesInput");
  const status = document.getElementById("eliminationLossesStatus");
  if (input) input.value = window.eliminationLosses;
  if (status) status.textContent = `현재 설정: ${window.eliminationLosses}패 탈락`;
}

function updateGalgeCountUI() {
  const input = document.getElementById("galgeCountInput");
  const status = document.getElementById("galgeCountStatus");
  if (input) input.value = window.galgeCount || 3;
  if (status) status.textContent = `현재 설정: ${window.galgeCount || 3}명`;
}

function setGalgeCountUI() {
  if (!window.isHost) { alert("방장만 변경할 수 있어."); return; }
  const input = document.getElementById("galgeCountInput");
  const val = input ? input.value.trim() : "";
  const n = val === "" ? 3 : parseInt(val, 10);
  if (!n || n < 1 || n > 20) { alert("1~20 사이의 숫자를 입력해줘."); return; }
  window.galgeCount = n;
  updateGalgeCountUI();
  saveRoomStateOnly();
}

function computeGalgeFromSnapshots() {
  const history = [];
  const roundOf = {};
  const orderOf = {};
  const snaps = window.roundSnapshots || [];
  const elim = window.eliminationLosses || 3;

  // 완료된 라운드 스냅샷에서 탈락 감지 (eliminationOrder 활용)
  for (let i = 0; i < snaps.length; i++) {
    const afterLoss = snaps[i].afterCommitState?.loss || {};
    const beforeLoss = i > 0 ? (snaps[i - 1].afterCommitState?.loss || {}) : {};
    const elimOrder = snaps[i].completedRoundState?.eliminationOrder || [];
    const roundNo = snaps[i].afterCommitState.round;

    // eliminationOrder에 있는 순서대로 먼저 추가
    for (const p of elimOrder) {
      if ((afterLoss[p] || 0) >= elim && !history.includes(p)) {
        history.push(p);
        roundOf[p] = roundNo;
        orderOf[p] = history.length;
      }
    }

    // eliminationOrder에 없지만 탈락된 선수 (이전 버전 호환)
    Object.keys(afterLoss).forEach(p => {
      if ((afterLoss[p] || 0) >= elim && (beforeLoss[p] || 0) < elim && !history.includes(p)) {
        history.push(p);
        roundOf[p] = roundNo;
        orderOf[p] = history.length;
      }
    });
  }

  // 현재 진행 중인 라운드(또는 복구된 라운드)에서 추가 탈락 감지
  if (window.roundLocked && window.round > 0) {
    const lastCommittedLoss = snaps.length > 0
      ? (snaps[snaps.length - 1].afterCommitState?.loss || {})
      : {};
    const currentOrder = window.currentRoundEliminationOrder || [];

    for (const p of currentOrder) {
      if ((window.loss[p] || 0) >= elim && !history.includes(p)) {
        history.push(p);
        roundOf[p] = window.round;
        orderOf[p] = history.length;
      }
    }

    Object.keys(window.loss).forEach(p => {
      if ((window.loss[p] || 0) >= elim && (lastCommittedLoss[p] || 0) < elim && !history.includes(p)) {
        history.push(p);
        roundOf[p] = window.round;
        orderOf[p] = history.length;
      }
    });
  }

  return { history, roundOf, orderOf };
}

function updateGalgeList() {
  const galgeEl = document.getElementById("galgeDisplay");
  if (!galgeEl) return;

  const { history, roundOf, orderOf } = computeGalgeFromSnapshots();

  if (history.length === 0) {
    galgeEl.innerHTML = `<span class="small">아직 깔개 없음</span>`;
    return;
  }

  // 가장 먼저 탈락한 1명이 슈퍼깔개 (orderOf 기준 = 탈락 발생 순서)
  const firstOrder = Math.min(...history.map(p => orderOf[p] || Infinity));
  const firstBatch = history.filter(p => (orderOf[p] || Infinity) === firstOrder);
  const superGalge = firstBatch.length === 1 ? firstBatch[0] : null;

  let html = "";
  if (superGalge) {
    html += `<div class="galge-super-card"><span class="galge-crown">👑</span><span class="galge-super-name">${escapeHTML(superGalge)}</span><span class="galge-super-label">슈퍼깔개</span></div>`;
  }
  const rest = history.filter(p => p !== superGalge);
  if (rest.length > 0) {
    html += `<div class="galge-badge-row">${rest.map(p => `<div class="galge-badge"><span class="galge-badge-name">${escapeHTML(p)}</span><span class="galge-badge-round">R${roundOf[p]}</span></div>`).join("")}</div>`;
  } else if (!superGalge) {
    html += `<span class="small">아직 깔개 없음</span>`;
  }

  galgeEl.innerHTML = html;
}

function setEliminationLossesUI() {
  if (!window.isHost) { alert("방장만 변경할 수 있어."); return; }
  const input = document.getElementById("eliminationLossesInput");
  const val = input ? input.value.trim() : "";
  const n = val === "" ? 3 : parseInt(val, 10);
  if (!n || n < 1 || n > 20) { alert("1~20 사이의 숫자를 입력해줘."); return; }
  window.eliminationLosses = n;
  updateEliminationLossesUI();
  saveRoomStateOnly();
}

function applyAppConfigToUI() {
  const mainTitle = document.getElementById("mainTitleText");
  if (mainTitle) mainTitle.innerText = window.APP_CONFIG.app.title;
}

window.addEventListener("resize", updateScoreOrientationGuide);
window.addEventListener("orientationchange", updateScoreOrientationGuide);

document.addEventListener("DOMContentLoaded", async () => {
  applyAppConfigToUI();

  localStorage.removeItem("loginMode");
  localStorage.removeItem("isAdmin");
  window.loginMode = null;
  window.isAdmin = false;

  loadCustomLogo();
  updateAdminOnlyUI();
  updateBottomNav();

  initPlayerManagementUI();
  try {
    initSupabase();
  } catch (e) {
    console.error("Supabase init error:", e);
  }
  setupPlayerSync();
  setupModalKeyHandler();

  const splash = document.getElementById("splashScreen");
  if (splash) {
    setTimeout(() => {
      splash.classList.add("hide");
      setTimeout(() => {
        splash.style.display = "none";
      }, window.APP_CONFIG.ui.splashHideTransitionMs);
    }, window.APP_CONFIG.ui.splashDelayMs);
  }

  updateEliminationLossesUI();
  updateGalgeCountUI();
  await goPage("home");
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
    window.loginMode = window.isHost ? "host" : "participant";
    if (window.isAdmin) window.loginMode = "admin";
    localStorage.setItem("loginMode", window.loginMode);
    updateBottomNav();
    updateHomePageMode();
    if (window.loginMode === "participant") {
      await goPage("players");
    }
  }
});

setTimeout(async () => {
  if (window.currentPage !== "score" && typeof lockAppOrientation === "function") {
    await lockAppOrientation("portrait");
  }
}, 500);

/* ════════════════════════════════
   PWA 설치 버튼
════════════════════════════════ */
window.pwaInstallEvent = null;

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  window.pwaInstallEvent = e;
  const btn = document.getElementById("pwaInstallBtn");
  if (btn) btn.style.display = "";
});

window.addEventListener("appinstalled", () => {
  window.pwaInstallEvent = null;
  const btn = document.getElementById("pwaInstallBtn");
  if (btn) btn.style.display = "none";
});

function triggerPWAInstall() {
  if (!window.pwaInstallEvent) return;
  window.pwaInstallEvent.prompt();
  window.pwaInstallEvent.userChoice.then(() => {
    window.pwaInstallEvent = null;
    const btn = document.getElementById("pwaInstallBtn");
    if (btn) btn.style.display = "none";
  });
}

/* ════════════════════════════════
   기록 저장 / 조회 / 삭제
════════════════════════════════ */
window._currentViewingRecord = null;

function generateRecordName() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const base = `${yy}.${mm}.${dd}`;
  const same = (window.savedRecords || []).filter(r => r.name === base || r.name.startsWith(base + "-"));
  if (same.length === 0) return base;
  return `${base}-${same.length}`;
}

function saveCurrentRecord() {
  if (!window.isHost && !window.isAdmin) {
    alert("방장 또는 관리자만 기록을 저장할 수 있어.");
    return;
  }
  const lines = window.currentRoundHistoryLines || [];
  if (!lines.length) {
    if (!confirm("기록이 없어. 그래도 저장할까?")) return;
  }
  const name = generateRecordName();
  const galgeEl = document.getElementById("galgeDisplay");
  const scoreEl  = document.getElementById("score");
  const record = {
    name,
    timestamp: Date.now(),
    roomCode: window.currentRoomCode || "-",
    galgeHtml: galgeEl ? galgeEl.innerHTML : "",
    scoreHtml: scoreEl  ? scoreEl.innerHTML  : "",
    historyLines: deepCopy(lines)
  };
  if (!window.savedRecords) window.savedRecords = [];
  window.savedRecords.push(record);
  saveRoomStateOnly();
  alert(`"${name}" 이름으로 저장됐어.`);
}

function showRecordsList() {
  const modal = document.getElementById("recordsListModal");
  if (!modal) return;
  const container = document.getElementById("recordsListContainer");
  const records = (window.savedRecords || []).slice().sort((a, b) => a.timestamp - b.timestamp);
  if (records.length === 0) {
    container.innerHTML = `<div class="small" style="text-align:center;padding:20px 0;">저장된 기록이 없어.</div>`;
  } else {
    container.innerHTML = records.map(r =>
      `<div class="record-list-item" data-rname="${escapeHTML(r.name)}" onclick="showRecordDetail(this.dataset.rname)">${escapeHTML(r.name)}</div>`
    ).join("");
  }
  modal.classList.remove("hidden");
}

function closeRecordsListModal() {
  const modal = document.getElementById("recordsListModal");
  if (modal) modal.classList.add("hidden");
}

function showRecordDetail(name) {
  const record = (window.savedRecords || []).find(r => r.name === name);
  if (!record) return;
  window._currentViewingRecord = record;
  document.getElementById("recordDetailTitle").innerText = record.name;
  document.getElementById("recordDetailRoomBtn").innerText = `방 코드: ${record.roomCode || "-"}`;
  const body = document.getElementById("recordDetailBody");
  body.innerHTML = `
    <div class="card">
      <h3>깔개</h3>
      <div>${record.galgeHtml || "<span class='small'>깔개 없음</span>"}</div>
    </div>
    <div class="card">
      <h3>패배 / 출전 / 대기 기록</h3>
      <div style="font-size:13px;line-height:1.7;">${record.scoreHtml || "<span class='small'>기록 없음</span>"}</div>
    </div>
    <div class="card">
      <h3>라운드 기록</h3>
      <div class="history-box">${(record.historyLines || []).join("<br>")}</div>
    </div>
  `;
  closeRecordsListModal();
  const detailModal = document.getElementById("recordDetailModal");
  if (detailModal) detailModal.classList.remove("hidden");
}

function closeRecordDetail() {
  const modal = document.getElementById("recordDetailModal");
  if (modal) modal.classList.add("hidden");
  showRecordsList();
}

function openDeleteRecordModal() {
  const pw = document.getElementById("deleteRecordPwInput");
  if (pw) pw.value = "";
  const modal = document.getElementById("deleteRecordModal");
  if (modal) modal.classList.remove("hidden");
}

function closeDeleteRecordModal() {
  const modal = document.getElementById("deleteRecordModal");
  if (modal) modal.classList.add("hidden");
}

function confirmDeleteRecord() {
  const pw = (document.getElementById("deleteRecordPwInput")?.value || "").trim();
  if (pw !== "j1037") {
    alert("비밀번호가 틀렸어.");
    return;
  }
  const record = window._currentViewingRecord;
  if (!record) return;
  window.savedRecords = (window.savedRecords || []).filter(r => r.name !== record.name);
  window._currentViewingRecord = null;
  closeDeleteRecordModal();
  const detailModal = document.getElementById("recordDetailModal");
  if (detailModal) detailModal.classList.add("hidden");
  saveRoomStateOnly();
  showRecordsList();
}

/* ════════════════════════════════
   방 관리 (관리자 전용)
════════════════════════════════ */
async function loadRoomList() {
  if (!window.isAdmin) return;
  if (!window.supabaseClient) initSupabase();

  const container = document.getElementById("roomListContainer");
  if (!container) return;
  container.innerHTML = `<div class="small" style="text-align:center;padding:8px 0;">불러오는 중...</div>`;

  const { data, error } = await window.supabaseClient
    .from("match_rooms")
    .select("room_code, round_no, created_at")
    .order("created_at", { ascending: false });

  if (error || !data) {
    container.innerHTML = `<div class="small" style="color:#e53535;">불러오기 실패</div>`;
    return;
  }

  if (data.length === 0) {
    container.innerHTML = `<div class="small" style="text-align:center;padding:8px 0;">생성된 방이 없어.</div>`;
    return;
  }

  container.innerHTML = data.map(r => {
    const date = r.created_at ? new Date(r.created_at).toLocaleDateString("ko-KR", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }) : "";
    const isCurrent = r.room_code === window.currentRoomCode;
    return `
      <div class="room-list-item ${isCurrent ? "room-list-item-current" : ""}" onclick="joinRoomByCode('${r.room_code}')">
        <span class="room-list-code">${r.room_code}</span>
        <span class="room-list-meta">Round ${r.round_no || 0} · ${date}</span>
        ${isCurrent ? `<span class="room-list-badge">현재</span>` : ""}
        <button class="room-list-delete-btn" type="button" onclick="event.stopPropagation(); deleteRoomByCode('${r.room_code}')">✕</button>
      </div>`;
  }).join("");
}

async function joinRoomByCode(code) {
  if (!window.supabaseClient) initSupabase();
  const input = document.getElementById("roomCodeInput");
  if (input) input.value = code;

  const { data, error } = await window.supabaseClient
    .from("match_rooms")
    .select("*")
    .eq("room_code", code)
    .maybeSingle();

  if (error || !data) { alert("방을 찾지 못했어."); return; }

  window.currentRoomCode  = code;
  window.currentHostCode  = data.host_code || "";
  window.isHost = true; // 관리자는 항상 방장 권한으로 입장

  const url = new URL(window.location.href);
  url.searchParams.set("room", code);
  url.searchParams.set("host", window.currentHostCode);
  window.history.replaceState({}, "", url.toString());

  updateRoomInfo();
  updateHomePageMode();
  await subscribeRoomRealtime();
  await loadRoomStateFromServer();
  await goPage("round");

  // 목록 갱신 (현재 방 표시)
  loadRoomList();
}

/* ════════════════════════════════
   앱 아이콘 생성 (흰 배경 제거)
════════════════════════════════ */
window._iconSourceCanvas = null;

function processIconImage(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      // 원본 크기로 캔버스 생성
      const src = document.createElement("canvas");
      src.width  = img.width;
      src.height = img.height;
      const ctx = src.getContext("2d");
      ctx.drawImage(img, 0, 0);

      // 코너 플러드필로 흰 배경 제거
      removeWhiteBg(ctx, src.width, src.height, 230);

      window._iconSourceCanvas = src;

      // 미리보기 (최대 300px)
      const preview = document.getElementById("iconPreviewCanvas");
      const scale   = Math.min(1, 300 / Math.max(src.width, src.height));
      preview.width  = Math.round(src.width  * scale);
      preview.height = Math.round(src.height * scale);
      preview.getContext("2d").drawImage(src, 0, 0, preview.width, preview.height);

      document.getElementById("iconPreviewArea").style.display = "";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeWhiteBg(ctx, w, h, threshold) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data    = imgData.data;
  const visited = new Uint8Array(w * h);

  function isLight(idx) {
    return data[idx] > threshold && data[idx+1] > threshold && data[idx+2] > threshold;
  }

  const stack = [];
  // 네 코너에서 시작
  [[0,0],[w-1,0],[0,h-1],[w-1,h-1]].forEach(([x,y]) => {
    const i = y * w + x;
    if (isLight(i * 4)) { visited[i] = 1; stack.push(i); }
  });

  while (stack.length) {
    const i = stack.pop();
    data[i * 4 + 3] = 0; // 투명
    const x = i % w, y = (i / w) | 0;
    for (const [nx, ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const ni = ny * w + nx;
        if (!visited[ni] && isLight(ni * 4)) { visited[ni] = 1; stack.push(ni); }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function downloadIcon(size) {
  const src = window._iconSourceCanvas;
  if (!src) return;
  const out = document.createElement("canvas");
  out.width = out.height = size;
  out.getContext("2d").drawImage(src, 0, 0, size, size);
  const a = document.createElement("a");
  a.href     = out.toDataURL("image/png");
  a.download = `icon-${size}.png`;
  a.click();
}
