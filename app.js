const timerForm = document.querySelector('#timerForm');
const timerList = document.querySelector('#timerList');
const timerTemplate = document.querySelector('#timerTemplate');
const emptyState = document.querySelector('#emptyState');
const timerCount = document.querySelector('#timerCount');
const summaryText = document.querySelector('#summaryText');
const statusPill = document.querySelector('.status-pill');
const formError = document.querySelector('#formError');
const inputs = {
  hours: document.querySelector('#hours'),
  minutes: document.querySelector('#minutes'),
  seconds: document.querySelector('#seconds'),
};

let timers = [];
let nextId = 1;
let ticker = null;
let audioContext = null;

function clamp(value, max) {
  return Math.min(max, Math.max(0, Number.parseInt(value, 10) || 0));
}

function formatTime(total) {
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map(value => String(value).padStart(2, '0')).join(':');
}

function durationLabel(total) {
  if (total % 3600 === 0 && total >= 3600) {
    const value = total / 3600;
    return `${value} ${value === 1 ? 'hour' : 'hours'}`;
  }
  if (total % 60 === 0 && total >= 60) {
    const value = total / 60;
    return `${value} ${value === 1 ? 'minute' : 'minutes'}`;
  }
  if (total < 60) return `${total} ${total === 1 ? 'second' : 'seconds'}`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ${seconds} seconds`;
}

function readDuration() {
  const hours = clamp(inputs.hours.value, 99);
  const minutes = clamp(inputs.minutes.value, 59);
  const seconds = clamp(inputs.seconds.value, 59);
  inputs.hours.value = hours;
  inputs.minutes.value = minutes;
  inputs.seconds.value = seconds;
  return hours * 3600 + minutes * 60 + seconds;
}

function addTimer(total, autoStart = false) {
  if (total <= 0) {
    formError.textContent = 'Enter a duration greater than zero.';
    return;
  }
  formError.textContent = '';
  const timer = { id: nextId++, initial: total, remaining: total, endAt: 0, nextAlarmAt: 0, state: autoStart ? 'running' : 'ready' };
  if (autoStart) timer.endAt = Date.now() + total * 1000;
  timers.push(timer);
  renderTimers();
  ensureTicker();
}

function startTimer(timer) {
  if (timer.state === 'finished') timer.remaining = timer.initial;
  timer.endAt = Date.now() + timer.remaining * 1000;
  timer.state = 'running';
  ensureAudio();
  ensureTicker();
  renderTimers();
}

function pauseTimer(timer) {
  updateRemaining(timer);
  timer.state = 'paused';
  renderTimers();
}

function resetTimer(timer) {
  timer.remaining = timer.initial;
  timer.nextAlarmAt = 0;
  timer.state = 'ready';
  renderTimers();
}

function ensureAudio() {
  const AudioEngine = window.AudioContext || window.webkitAudioContext;
  if (!AudioEngine) return;
  audioContext ||= new AudioEngine();
  if (audioContext.state === 'suspended') audioContext.resume();
}

function beep() {
  ensureAudio();
  if (!audioContext) return;
  const now = audioContext.currentTime;
  [0, .2, .4].forEach(offset => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.3, now + offset + .02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + .14);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + .16);
  });
}

function announce(timer) {
  const message = `${durationLabel(timer.initial)} up`;
  beep();
  if ('speechSynthesis' in window) {
    const speech = new SpeechSynthesisUtterance(message);
    speech.rate = 0.9;
    speech.volume = 1;
    window.speechSynthesis.speak(speech);
  }
}

function finishTimer(timer) {
  timer.remaining = 0;
  timer.state = 'finished';
  announce(timer);
  timer.nextAlarmAt = Date.now() + 5000;
}

function updateRemaining(timer) {
  timer.remaining = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
  if (timer.remaining === 0 && timer.state === 'running') finishTimer(timer);
}

function tick() {
  timers.filter(timer => timer.state === 'running').forEach(updateRemaining);
  const now = Date.now();
  timers.filter(timer => timer.state === 'finished' && now >= timer.nextAlarmAt).forEach(timer => {
    announce(timer);
    timer.nextAlarmAt = now + 5000;
  });
  renderTimers();
  if (!timers.some(timer => timer.state === 'running' || timer.state === 'finished')) {
    clearInterval(ticker);
    ticker = null;
  }
}

function ensureTicker() {
  if (!ticker && timers.some(timer => timer.state === 'running' || timer.state === 'finished')) ticker = window.setInterval(tick, 250);
}

function statusLabel(state) {
  return { ready: 'Ready', running: 'Running', paused: 'Paused', finished: 'Time is up' }[state];
}

function renderTimers() {
  timerList.replaceChildren();
  timers.forEach((timer, index) => {
    const card = timerTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = timer.id;
    card.classList.toggle('finished', timer.state === 'finished');
    card.querySelector('.timer-number').textContent = String(index + 1).padStart(2, '0');
    card.querySelector('.timer-name').textContent = `${durationLabel(timer.initial)} timer`;
    card.querySelector('.timer-status').textContent = statusLabel(timer.state);
    card.querySelector('.timer-time').textContent = formatTime(timer.remaining);
    card.querySelector('.progress-bar span').style.transform = `scaleX(${timer.initial ? timer.remaining / timer.initial : 0})`;

    const toggleButton = card.querySelector('.toggle-button');
    const toggleIcon = toggleButton.querySelector('span');
    const toggleLabel = toggleButton.querySelector('b');
    if (timer.state === 'running') {
      toggleIcon.textContent = 'II';
      toggleLabel.textContent = 'Pause';
    } else if (timer.state === 'finished') {
      toggleIcon.textContent = 'X';
      toggleLabel.textContent = 'Stop alarm';
    } else {
      toggleIcon.innerHTML = '&#9654;';
      toggleLabel.textContent = timer.state === 'paused' ? 'Resume' : 'Start';
    }
    toggleButton.addEventListener('click', () => {
      if (timer.state === 'running') pauseTimer(timer);
      else if (timer.state === 'finished') resetTimer(timer);
      else startTimer(timer);
    });
    card.querySelector('.reset-button').addEventListener('click', () => resetTimer(timer));
    card.querySelector('.remove-button').addEventListener('click', () => {
      timers = timers.filter(item => item.id !== timer.id);
      renderTimers();
    });
    timerList.append(card);
  });

  const running = timers.filter(timer => timer.state === 'running').length;
  const finished = timers.filter(timer => timer.state === 'finished').length;
  emptyState.hidden = timers.length > 0;
  timerCount.textContent = timers.length ? `${timers.length} ${timers.length === 1 ? 'timer' : 'timers'} total` : 'Add your first timer above.';
  summaryText.textContent = finished ? `${finished} finished` : running ? `${running} running` : timers.length ? 'Timers ready' : 'No timers running';
  statusPill.classList.toggle('active', running > 0);
  document.title = running ? `${running} running - Multi Timer` : 'Multi Timer';
}

timerForm.addEventListener('submit', event => {
  event.preventDefault();
  addTimer(readDuration());
});

document.querySelectorAll('[data-seconds]').forEach(button => {
  button.addEventListener('click', () => addTimer(Number(button.dataset.seconds)));
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) tick();
});

renderTimers();
