'use strict';

const TRACKS = [
  { title: 'Blue Train', src: 'assets/blueTrain.mp3' },
  { title: 'Moment`s Notice', src: 'assets/momentsNotice.mp3' },
  { title: 'Locomotion', src: 'assets/locomotion.mp3' },
  { title: 'I`m Old Fashioned', src: 'assets/imOldFashioned.mp3' },
  { title: 'Lazy Bird', src: 'assets/lazyBird.mp3' },
];

const $ = (s) => document.querySelector(s);
const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
const setFill = (input) => input.style.setProperty('--p', `${(input.value / input.max) * 100}%`);
 
let ctx, bus, analyser;
function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    bus = ctx.createGain();
    bus.gain.value = 0.9;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    bus.connect(analyser);
    analyser.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const piano = $('#piano');
const BLACK = [1, 3, 6, 8, 10];
const NOTES = ['До', 'Ре', 'Ми', 'Фа', 'Соль', 'Ля', 'Си'];
const KEYMAP = {
  KeyZ: 0, KeyS: 1, KeyX: 2, KeyD: 3, KeyC: 4, KeyV: 5, KeyG: 6, KeyB: 7, KeyH: 8, KeyN: 9, KeyJ: 10, KeyM: 11,
  KeyQ: 12, Digit2: 13, KeyW: 14, Digit3: 15, KeyE: 16, KeyR: 17, Digit5: 18, KeyT: 19, Digit6: 20, KeyY: 21, Digit7: 22, KeyU: 23,
};
const KEY_LABEL = {};
for (const [code, off] of Object.entries(KEYMAP)) KEY_LABEL[off] = code.replace(/^Key|^Digit/, '');

const OCTAVES = window.innerWidth < 700 ? 1 : 2;
const BASE = (OCTAVES === 1 ? 5 : 4) * 12;      // MIDI-номер первой «до»
const keys = new Map();                          // midi -> элемент клавиши
const playing = new Map();                       // источник нажатия -> { midi, stop }

for (let off = 0; off <= 12 * OCTAVES; off++) {
  const black = BLACK.includes(off % 12);
  const k = document.createElement('div');
  k.className = `key ${black ? 'black' : 'white'}`;
  k.dataset.midi = BASE + off;
  k.innerHTML = `<span class="l-key">${KEY_LABEL[off] || ''}</span>` +
    (black ? '' : `<span class="l-note">${NOTES[[0, 2, 4, 5, 7, 9, 11].indexOf(off % 12)]}</span>`);
  piano.appendChild(k);
  keys.set(BASE + off, k);
}

const whiteCount = 7 * OCTAVES + 1;
let w = 0;
keys.forEach((k) => {
  if (k.classList.contains('white')) { w++; return; }
  const bw = (100 / whiteCount) * 0.62;
  k.style.width = `${bw}%`;
  k.style.left = `${(w / whiteCount) * 100 - bw / 2}%`;
});

function startNote(midi, vel) {
  const c = ensureAudio();
  const f = 440 * 2 ** ((midi - 69) / 12);
  const now = c.currentTime;
  const env = c.createGain();
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(0.35 * vel, now + 0.01);
  env.gain.setTargetAtTime(0, now + 0.01, 0.9);   // плавное затухание
  env.connect(bus);
  const oscs = [[1, 1], [2, 0.45], [3, 0.2], [4, 0.1]].map(([mult, gain]) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.value = f * mult;
    g.gain.value = gain / 1.75;
    o.connect(g); g.connect(env);
    o.start(now);
    o.stop(now + 6);
    return o;
  });
  return () => {                                  // отпускание клавиши
    const t = c.currentTime;
    env.gain.cancelScheduledValues(t);
    env.gain.setTargetAtTime(0, t, 0.08);
    oscs.forEach((o) => o.stop(t + 0.5));
  };
}

function press(source, midi, vel = 0.8) {
  release(source);
  if (!keys.has(midi)) return;
  playing.set(source, { midi, stop: startNote(midi, vel) });
  keys.get(midi).classList.add('active');
}
function release(source) {
  const n = playing.get(source);
  if (!n) return;
  n.stop();
  playing.delete(source);
  if (![...playing.values()].some((v) => v.midi === n.midi)) keys.get(n.midi).classList.remove('active');
}
function releaseAll() { [...playing.keys()].forEach(release); }

const keyAt = (x, y) => {
  const k = document.elementFromPoint(x, y)?.closest('.key');
  return k && piano.contains(k) ? Number(k.dataset.midi) : null;
};
const pointers = new Map();                        // pointerId -> midi

piano.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const midi = keyAt(e.clientX, e.clientY);
  pointers.set(e.pointerId, midi);
  if (midi !== null) press(e.pointerId, midi);
});
window.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const midi = keyAt(e.clientX, e.clientY);
  if (midi === pointers.get(e.pointerId)) return;
  release(e.pointerId);
  pointers.set(e.pointerId, midi);
  if (midi !== null) press(e.pointerId, midi);
});
const pointerEnd = (e) => { release(e.pointerId); pointers.delete(e.pointerId); };
window.addEventListener('pointerup', pointerEnd);
window.addEventListener('pointercancel', pointerEnd);

/*клавиатура*/
window.addEventListener('keydown', (e) => {
  const off = KEYMAP[e.code];
  if (off === undefined || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  e.preventDefault();
  press(e.code, BASE + off);
});
window.addEventListener('keyup', (e) => release(e.code));
window.addEventListener('blur', releaseAll);

/*Плеер*/
const audio = $('#audio');
const list = $('#list');
const seek = $('#seek');
const volume = $('#volume');
const btnPlay = $('#btnPlay');
let cur = 0;
let tapped = false;

function renderList() {
  list.innerHTML = TRACKS.length ? '' : '<li class="empty">Плейлист пуст: добавьте треки в script.js</li>';
  TRACKS.forEach((t, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'track';
    b.textContent = `${i + 1}. ${t.title}`;
    b.onclick = () => (i === cur && !audio.paused ? audio.pause() : load(i, true));
    li.appendChild(b);
    list.appendChild(li);
  });
  markCurrent();
}
function markCurrent() {
  [...list.querySelectorAll('.track')].forEach((b, i) => {
    b.classList.toggle('current', i === cur);
    b.classList.toggle('playing', i === cur && !audio.paused);
  });
  btnPlay.textContent = audio.paused ? '▶' : '⏸';
}

function load(i, autoplay) {
  if (!TRACKS.length) return;
  cur = (i + TRACKS.length) % TRACKS.length;
  audio.src = TRACKS[cur].src;
  $('#nowTitle').textContent = TRACKS[cur].title;
  seek.value = 0; setFill(seek);
  $('#tCur').textContent = '0:00';
  if (autoplay) play();
  markCurrent();
}
function play() { 
  if (!tapped && /^https?:$/.test(location.protocol) && !/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try { ensureAudio().createMediaElementSource(audio).connect(analyser); tapped = true; } catch (e) { /* без визуализации */ }
  }
  audio.play().catch(() => {});
}

btnPlay.onclick = () => (!TRACKS.length ? 0 : audio.paused ? play() : audio.pause());
$('#btnNext').onclick = () => load(cur + 1, !audio.paused);
$('#btnPrev').onclick = () => load(cur - 1, !audio.paused);

audio.onplay = audio.onpause = markCurrent;
audio.onended = () => load(cur + 1, cur + 1 < TRACKS.length);   
audio.onloadedmetadata = () => { $('#tDur').textContent = fmt(audio.duration); };
audio.onerror = () => { $('#nowTitle').textContent = `Не найден файл: ${TRACKS[cur].src}`; };
audio.ontimeupdate = () => {
  if (!audio.duration) return;
  $('#tCur').textContent = fmt(audio.currentTime);
  seek.value = (audio.currentTime / audio.duration) * 1000;
  setFill(seek);
};
seek.oninput = () => { if (audio.duration) audio.currentTime = (seek.value / 1000) * audio.duration; setFill(seek); };
volume.oninput = () => { audio.volume = volume.value / 100; setFill(volume); };

const viz = $('#viz');
const g = viz.getContext('2d');
function draw() {
  requestAnimationFrame(draw);
  const dpr = window.devicePixelRatio || 1;
  viz.width = viz.clientWidth * dpr;
  viz.height = viz.clientHeight * dpr;
  g.scale(dpr, dpr);
  const W = viz.clientWidth, H = viz.clientHeight, N = 32;
  const data = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
  if (analyser) analyser.getByteFrequencyData(data);
  g.fillStyle = '#6ee7d4';
  for (let i = 0; i < N; i++) {
    const v = (data[Math.floor(i * data.length * 0.6 / N)] || 0) / 255;
    const bw = W / N;
    g.fillRect(i * bw + 1, H - Math.max(3, v * H), bw - 2, Math.max(3, v * H));
  }
}
draw();

audio.volume = volume.value / 100; setFill(volume); setFill(seek);
renderList();
load(0, false);
