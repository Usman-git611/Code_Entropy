/* A mission is a short guided study session, not an instant-complete button. */
const missionEscape = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function missionGuidance(mission) {
  const subject = mission.subject || 'your selected subject';
  if (mission.kind === 'reflection') return `Pause after the question and write one specific idea you want to remember from ${subject}.`;
  if (mission.kind === 'challenge') return `This is a stretch task. Aim for clear reasoning, not speed, and explain why the method works.`;
  if (mission.kind === 'repair') return `This session targets a repair area. Use the hint, take one step at a time, and do not rush.`;
  if (mission.kind === 'thinking') return `Break the task into known information, an unknown, and a first action before you calculate.`;
  return `Work actively: attempt the question, then record the small idea that helped you move forward.`;
}

function missionClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function setMissionProgress() {
  const session = window.activeMissionSession;
  if (!session) return;
  const read = document.getElementById('missionRead')?.checked;
  const takeaway = (document.getElementById('missionTakeaway')?.value || '').trim().length >= 15;
  const complete = Boolean(read && session.questionAttempted && takeaway);
  const completeButton = document.getElementById('finishMission');
  const count = [read, session.questionAttempted, takeaway].filter(Boolean).length;
  if (completeButton) { completeButton.disabled = !complete; completeButton.textContent = complete ? `Finish mission +${session.mission.xp} XP` : `Complete ${count}/3 steps to finish`; }
  document.querySelectorAll('[data-mission-step]').forEach((element, index) => element.classList.toggle('done', [read, session.questionAttempted, takeaway][index]));
}

async function loadMissionQuestion() {
  const session = window.activeMissionSession;
  const target = document.getElementById('missionQuestion');
  if (!session || !target) return;
  target.innerHTML = '<p class="loading">Selecting a practice question...</p>';
  try {
    const subject = session.mission.subject ? '?subject=' + encodeURIComponent(session.mission.subject) : '';
    const result = await api('/api/quiz/questions' + subject);
    const index = [...session.mission.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % result.questions.length;
    const question = result.questions[index];
    session.question = question;
    target.innerHTML = `<small>${missionEscape(question.subject)} · ${missionEscape(question.topic)}</small><h3>${missionEscape(question.text)}</h3><p class="mission-hint">Hint: ${missionEscape(question.hint)}</p><form id="missionQuestionForm"><input name="answer" placeholder="Your answer" required><textarea name="reasoning" placeholder="Show the first step you used" required></textarea><button>Check my attempt</button></form><div id="missionAnswerFeedback"></div>`;
    document.getElementById('missionQuestionForm').onsubmit = submitMissionQuestion;
  } catch (error) { target.innerHTML = `<p class="mission-error">${missionEscape(error.message)}</p>`; }
}

async function submitMissionQuestion(event) {
  event.preventDefault();
  const session = window.activeMissionSession;
  if (!session?.question) return;
  const form = event.target; const button = form.querySelector('button'); const feedback = document.getElementById('missionAnswerFeedback');
  button.disabled = true; button.textContent = 'Iqra is checking...';
  try {
    const payload = Object.fromEntries(new FormData(form)); payload.question_id = session.question.id;
    const result = await api('/api/quiz/submit', {method:'POST', body:JSON.stringify(payload)});
    session.questionAttempted = true;
    feedback.innerHTML = `<strong>${result.correct ? 'Good reasoning.' : 'Useful repair signal.'}</strong><p>${missionEscape(result.replay.message)}</p><ol>${result.replay.better_path.map(step => `<li>${missionEscape(step)}</li>`).join('')}</ol>`;
    form.querySelectorAll('input,textarea,button').forEach(item => item.disabled = true);
    button.textContent = result.correct ? 'Checked - great work' : 'Checked - review the hint';
    setMissionProgress();
    if (typeof runOperatingSystem === 'function') runOperatingSystem();
  } catch (error) { feedback.textContent = error.message; button.disabled = false; button.textContent = 'Check my attempt'; }
}

function closeMissionSession() {
  if (window.activeMissionTimer) clearInterval(window.activeMissionTimer);
  window.activeMissionTimer = null; window.activeMissionSession = null;
  document.getElementById('missionSession')?.remove();
}

async function finishMissionSession() {
  const session = window.activeMissionSession;
  if (!session) return;
  const button = document.getElementById('finishMission'); button.disabled = true; button.textContent = 'Saving your progress...';
  try {
    await api(`/api/missions/${session.mission.id}/complete`, {method:'POST'});
    closeMissionSession();
    uiToast(`Mission completed. +${session.mission.xp} XP added to your profile.`);
    window.studentView();
  } catch (error) { button.disabled = false; button.textContent = 'Try finishing again'; document.getElementById('missionError').textContent = error.message; }
}

window.startMissionSession = function startMissionSession(id) {
  const mission = window.currentMissions?.find(item => item.id === id);
  if (!mission) { uiToast('This mission could not be loaded. Refresh the dashboard and try again.'); return; }
  closeMissionSession();
  window.activeMissionSession = {mission, questionAttempted:false, remaining:20 * 60};
  const modal = document.createElement('div'); modal.id = 'missionSession'; modal.className = 'mission-session';
  const codingAction = mission.subject === 'Programming' ? '<button type="button" class="mission-code-link" onclick="openMissionCodeLab()">Open Code Lab for this mission</button>' : '';
  modal.innerHTML = `<section class="mission-sheet"><button class="mission-close" onclick="closeMissionSession()" aria-label="Close mission">&times;</button><header><div><small>${missionEscape(mission.subject || 'PERSONALIZED')} MISSION</small><h2>${missionEscape(mission.title)}</h2><p>${missionEscape(mission.description)}</p></div><div class="mission-timer"><span>FOCUS TIMER</span><b id="missionTimer">20:00</b><small>pause anytime</small></div></header><p class="mission-guidance">${missionEscape(missionGuidance(mission))}</p>${codingAction}<ol class="mission-steps"><li data-mission-step><label><input id="missionRead" type="checkbox" onchange="setMissionProgress()"><span><b>1. Set your intention</b> Read the goal and decide what one small result you want.</span></label></li><li data-mission-step><span><b>2. Complete one focused question</b> Attempt the subject question below. Correctness is not required; an honest attempt is.</span></li><li data-mission-step><label><span><b>3. Capture your takeaway</b> Write at least one sentence about what clicked or what to revisit.</span><textarea id="missionTakeaway" oninput="setMissionProgress()" placeholder="Today I noticed that..."></textarea></label></li></ol><section id="missionQuestion" class="mission-question"></section><p id="missionError" class="mission-error"></p><footer><span>XP is awarded after all three steps are complete.</span><button id="finishMission" disabled onclick="finishMissionSession()">Complete 0/3 steps to finish</button></footer></section>`;
  document.body.append(modal); loadMissionQuestion();
  window.activeMissionTimer = setInterval(() => { const session = window.activeMissionSession; const timer = document.getElementById('missionTimer'); if (!session || !timer) return; session.remaining = Math.max(0, session.remaining - 1); timer.textContent = missionClock(session.remaining); }, 1000);
};

window.openMissionCodeLab = function openMissionCodeLab() {
  closeMissionSession(); const button = document.getElementById('adaptiveCodeNav'); if (button) { v3Tab('v3code', button); loadCodingLab(window.adaptiveCurrent?.user?.coding_language); }
};
