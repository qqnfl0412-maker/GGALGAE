function updateScoreOrientationGuide() {
  const guide = document.getElementById("scoreOrientationGuide");
  if (!guide) return;

  if (window.scoreRefereeMode && isPortraitViewport()) {
    guide.style.display = "block";
  } else {
    guide.style.display = "";
  }
}

function updateScoreSidePanel() {
  const panel = document.getElementById("scoreSidePanel");
  const backdrop = document.getElementById("scoreSideBackdrop");
  if (!panel) return;

  panel.classList.remove("score-side-panel-open", "score-side-panel-hidden");
  panel.classList.add(window.scoreSidePanelOpen ? "score-side-panel-open" : "score-side-panel-hidden");

  if (backdrop) {
    backdrop.classList.toggle("show", window.scoreSidePanelOpen);
  }
}

function closeScoreSidePanel() {
  window.scoreSidePanelOpen = false;
  updateScoreSidePanel();
}

function handleScoreMainPanelClick(event) {
  if (!window.scoreSidePanelOpen) return;
  if (event.target.closest("button")) return;
  closeScoreSidePanel();
}

function toggleScoreSidePanel(event) {
  if (event) event.stopPropagation();
  window.scoreSidePanelOpen = !window.scoreSidePanelOpen;
  updateScoreSidePanel();
}

function openScoreMatchSelector() {
  window.scoreSidePanelOpen = true;
  updateScoreSidePanel();
}

function renderScoreMatchList() {
  const el = document.getElementById("scoreMatchList");
  if (!el) return;

  if (!window.currentMatches.length) {
    el.innerHTML = `<div class="score-empty-text">진행 중인 경기가 없어.</div>`;
    return;
  }

  let html = "";
  window.currentMatches.forEach((m, i) => {
    const teamA = m.teams[0].join(" / ");
    const teamB = m.teams[1].join(" / ");
    const finishedText = m.finished ? " / 경기 종료" : "";
    html += `
      <div class="match ${m.finished ? "done" : ""}" onclick="selectScoreMatch(${i})">
        <div class="courtBadge">${i + 1}코트</div>
        <b>${teamA} VS ${teamB}</b>
        <div class="small">현재 점수: ${m.scoreA} : ${m.scoreB}${finishedText}</div>
      </div>
    `;
  });

  el.innerHTML = html;
}

async function enterFullscreenIfPossible() {
  return;
}

async function enterScoreRefereeMode() {
  window.scoreRefereeMode = true;
  document.body.classList.add("score-referee-mode");
  updateFloatingRoomStatus();
  updateScoreOrientationGuide();

  try {
    if (screen.orientation && screen.orientation.lock) {
      await screen.orientation.lock("landscape");
    }
  } catch (e) {
    console.log("브라우저 가로 잠금 미지원", e);
  }
}

async function leaveScoreRefereeMode() {
  window.scoreRefereeMode = false;
  document.body.classList.remove("score-referee-mode");
  window.scoreSidePanelOpen = false;
  updateScoreSidePanel();
  updateFloatingRoomStatus();
  updateScoreOrientationGuide();

  try {
    if (screen.orientation && screen.orientation.unlock) {
      screen.orientation.unlock();
    }
  } catch (e) {}
}

async function exitScorePage() {
  window.scoreSidePanelOpen = false;
  updateScoreSidePanel();
  clearSelectedMatch();

  await leaveScoreRefereeMode();

  document.querySelectorAll(".page").forEach(el => el.classList.remove("active"));
  const roundPage = document.getElementById("page-round");
  if (roundPage) roundPage.classList.add("active");

  window.currentPage = "round";

  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.classList.remove("active");
    if (btn.dataset.page === "round") btn.classList.add("active");
  });

  updateFloatingRoomStatus();
  renderMatches();
}

function clearSelectedMatch() {
  window.currentScoreMatch = -1;
  window.editMode = false;
  document.getElementById("scoreRoundLabel").innerText = "경기를 선택해줘";
  document.getElementById("editModeLabel").innerText = "";
  document.getElementById("teamA").innerText = "팀 A";
  document.getElementById("teamB").innerText = "팀 B";
  document.getElementById("scoreA").innerText = "0";
  document.getElementById("scoreB").innerText = "0";
  document.getElementById("courtNotice").innerText = "";
  renderScoreMatchList();
}

function selectScoreMatch(i) {
  openScore(i);
  window.scoreSidePanelOpen = false;
  updateScoreSidePanel();
}

function openScoreFromScorePage(i) {
  goPage("score");
  openScore(i);
  window.scoreSidePanelOpen = false;
  updateScoreSidePanel();
}

function updateScoreBoard() {
  if (window.currentScoreMatch < 0 || !window.currentMatches[window.currentScoreMatch]) return;

  const match = window.currentMatches[window.currentScoreMatch];
  document.getElementById("teamA").innerText = match.teams[0].join(" / ");
  document.getElementById("teamB").innerText = match.teams[1].join(" / ");
  document.getElementById("scoreA").innerText = match.scoreA;
  document.getElementById("scoreB").innerText = match.scoreB;
  document.getElementById("courtNotice").innerText =
    (match.scoreA === window.APP_CONFIG.game.courtChangeScore || match.scoreB === window.APP_CONFIG.game.courtChangeScore)
      ? "코트 체인지"
      : "";
}

function openScore(i) {
  if (!window.currentMatches[i]) return;

  window.currentScoreMatch = i;
  const match = window.currentMatches[i];
  window.editMode = match.finished;

  document.getElementById("scoreRoundLabel").innerText = `Round ${window.round} / 경기 ${i + 1}`;
  document.getElementById("editModeLabel").innerText = window.editMode ? "수정 모드" : "";
  document.getElementById("teamA").innerText = match.teams[0].join(" / ");
  document.getElementById("teamB").innerText = match.teams[1].join(" / ");

  updateScoreBoard();
  setScoreButtonsDisabled(false);
}

async function addScore(team) {
  if (window.currentScoreMatch < 0 || !window.currentMatches[window.currentScoreMatch]) {
    alert("먼저 경기를 선택해줘.");
    return;
  }
  if (window.scoreButtonsLocked || window.scoreInputBusy) return;

  brieflyLockScoreInput();

  const match = window.currentMatches[window.currentScoreMatch];
  match.scoreHistory.push([match.scoreA, match.scoreB]);

  if (team === 0) match.scoreA++;
  else match.scoreB++;

  markMatchDirty(window.currentScoreMatch, 1200);

  updateScoreBoard();
  updateMatchBox(window.currentScoreMatch);
  renderScoreMatchList();
  syncRestoredSnapshotIfNeeded();

  scheduleMatchSave(window.currentScoreMatch);

  const diff = Math.abs(match.scoreA - match.scoreB);
  const targetScore = window.APP_CONFIG.game.targetScore;
  const winBy = window.APP_CONFIG.game.winBy;

  if ((match.scoreA >= targetScore || match.scoreB >= targetScore) && diff >= winBy) {
    setTimeout(async () => {
      if (
        window.currentScoreMatch >= 0 &&
        window.currentMatches[window.currentScoreMatch] &&
        !window.currentMatches[window.currentScoreMatch].finished
      ) {
        await finishGame(false);
      }
    }, 90);
  }
}

async function undoScore() {
  if (window.currentScoreMatch < 0 || !window.currentMatches[window.currentScoreMatch]) return;
  if (window.scoreButtonsLocked || window.scoreInputBusy) return;

  brieflyLockScoreInput();

  const match = window.currentMatches[window.currentScoreMatch];
  if (!match.scoreHistory.length) return;

  const last = match.scoreHistory.pop();
  match.scoreA = last[0];
  match.scoreB = last[1];

  markMatchDirty(window.currentScoreMatch, 1200);

  updateScoreBoard();
  updateMatchBox(window.currentScoreMatch);
  renderScoreMatchList();
  syncRestoredSnapshotIfNeeded();

  scheduleMatchSave(window.currentScoreMatch);
}

async function finishGame(shouldExitAfterFinish = true) {
  if (window.currentScoreMatch < 0 || !window.currentMatches[window.currentScoreMatch]) return;
  if (window.scoreButtonsLocked) return;

  const match = window.currentMatches[window.currentScoreMatch];
  if (match.scoreA === match.scoreB) {
    alert("동점은 종료할 수 없어.");
    return;
  }

  setScoreButtonsDisabled(true);
  try {
    await finishWinner();

    if (shouldExitAfterFinish) {
      await exitScorePage();
    }
  } finally {
    setScoreButtonsDisabled(false);
  }
}

async function finishWinner() {
  if (window.currentScoreMatch < 0 || !window.currentMatches[window.currentScoreMatch]) return;

  const match = window.currentMatches[window.currentScoreMatch];
  const wasFinished = match.finished;

  let actualWinnerIndex;
  if (match.scoreA > match.scoreB) actualWinnerIndex = 0;
  else if (match.scoreB > match.scoreA) actualWinnerIndex = 1;
  else {
    alert("동점은 종료할 수 없어.");
    return;
  }

  markMatchDirty(window.currentScoreMatch, 1600);

  match.finished = true;
  match.winnerIndex = actualWinnerIndex;

  if (!wasFinished) {
    window.resultCount++;
  }

  updateMatchBox(window.currentScoreMatch);
  rebuildRoundState();
  updateScore();
  renderScoreMatchList();

  await flushMatchSave(window.currentScoreMatch);
  await saveRoomStateOnly();
  setTimeout(() => loadRoomStateFromServer(), 120);

  if (!window.editMode && !wasFinished) {
    alert("🏸 승리 팀\n" + match.teams[actualWinnerIndex].join(" / "));
  }

  window.editMode = false;

  if (window.restoredCompletedRound) {
    saveRestoredCompletedRoundSnapshot();
    await saveRoomStateOnly();
  }

  if (!wasFinished) {
    const willCompleteRound = (window.resultCount >= window.neededResults);

    if (!window.isHost && willCompleteRound) {
      window.participantCanSeeNextRound = true;
      refreshRoundActionButtons();
    }

    await checkRoundEnd();
  }
}