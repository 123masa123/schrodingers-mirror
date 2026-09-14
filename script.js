// script.js
const video = document.getElementById('webcam');
navigator.mediaDevices.getUserMedia({ video: true, audio: false })
  .then(stream => { video.srcObject = stream; })
  .catch(err => console.error('Camera error:', err));

const drawCanvas = document.getElementById('interactionCanvas');
const drawCtx = drawCanvas.getContext('2d');
const fogCanvas = document.getElementById('condensation');
const fogCtx = fogCanvas.getContext('2d');

// 結露の動的アルファ値（初期は0、開始時に滑らかに0.9へ）
let isIntroActive = true;
let currentFogAlpha = 0.0;
let targetFogAlpha = 0.0;

function resizeAll() {
  const w = window.innerWidth, h = window.innerHeight;
  drawCanvas.width = fogCanvas.width = w;
  drawCanvas.height = fogCanvas.height = h;
  drawFog(currentFogAlpha);
}
window.addEventListener('resize', resizeAll);
resizeAll();

function drawFog(alpha = 0.9) {
  fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  fogCtx.filter = 'blur(8px)';
  // 温かみのあるグレーベージュ（結露の質感）
  fogCtx.fillStyle = 'rgba(210, 200, 190, ' + alpha + ')';
  fogCtx.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
  fogCtx.filter = 'none';
}

// 画面の基準寸法（短辺）を取得
function getBaseDim() {
  return Math.min(window.innerWidth, window.innerHeight);
}

// ----------------------------------------------------
// 0. ファーストビュー：時間帯別メッセージ設定と開始処理
// ----------------------------------------------------
const TIME_MESSAGES = {
  // ① 0:00 〜 4:59 ──【静寂の時間】
  night: {
    tag: '静寂の時間',
    heading: 'だれも、あなたを観測していない。',
    body: `泣いているのか、うずくまっているのか。
この鏡の曇りの中なら、だれにも、あなた自身にさえも、
心のかたちを確定させなくていい。

暗闇に言葉を預けてください。すべて蒸発して、消え去ります。`,
    button: '［ 画面に触れ、曇りの中へ ］'
  },
  // ② 5:00 〜 8:59 ──【心の鎧をまとう前】
  dawn: {
    tag: '心の鎧をまとう前',
    heading: '「ちゃんとした誰か」になる前の、ひとときに。',
    body: `やがて朝の光と社会の視線が、あなたを一つの表情に縛りつける。
その前に、まだ輪郭のあいまいで未確定なあなたを、
この曇ったガラスにぶつけていってください。`,
    button: '［ 鏡の前に立つ ］'
  },
  // ③ 9:00 〜 17:59 ──【視線・喧騒の中】
  day: {
    tag: '視線・喧騒の中',
    heading: '見られ続ける日々に、息が詰まりそうなあなたへ。',
    body: `画面や視線に晒され、演じ続ける日常からほんの数分だけ。
観測を拒絶し、輪郭をほどく隠れ家へ。
ここに書いた本音は、だれの記録にも残りません。`,
    button: '［ 観測を拒絶する ］'
  },
  // ④ 18:00 〜 23:59 ──【静寂へ向かう時間】
  evening: {
    tag: '静寂へ向かう時間',
    heading: '今日も一日、お疲れ様でした。',
    body: `演じきった役目を脱ぎ捨て、静寂へと還る時間。
張り詰めていた感情を、指先でガラスに吐き出してください。
あなたの弱音は水蒸気となって空気に溶け、無かったことになります。`,
    button: '［ 曇りを立ち込める ］'
  }
};

function setupTimeBasedIntro() {
  const hour = new Date().getHours();
  let slot = 'day';
  if (hour >= 0 && hour < 5) {
    slot = 'night';
  } else if (hour >= 5 && hour < 9) {
    slot = 'dawn';
  } else if (hour >= 9 && hour < 18) {
    slot = 'day';
  } else {
    slot = 'evening';
  }

  const msg = TIME_MESSAGES[slot];
  const tagEl = document.getElementById('intro-time-tag');
  const headingEl = document.getElementById('intro-heading');
  const bodyEl = document.getElementById('intro-body');
  const btnEl = document.getElementById('intro-start-btn');

  if (tagEl) tagEl.textContent = `― ${msg.tag} ―`;
  if (headingEl) headingEl.textContent = msg.heading;
  if (bodyEl) bodyEl.textContent = msg.body;
  if (btnEl) btnEl.textContent = msg.button;
}

function startExperience() {
  if (!isIntroActive) return;
  isIntroActive = false;

  // 目標結露濃度を0.9に設定（animate内で滑らかに補間）
  targetFogAlpha = 0.9;

  // オーディオとカメラを起動
  initAudio();
  setTimeout(() => { playWaterDrop(); }, 400);

  // オーバーレイを非表示に
  const overlay = document.getElementById('intro-overlay');
  if (overlay) {
    overlay.classList.add('hidden');
  }

  // 入力フォーカス
  setTimeout(() => {
    const hiddenInput = document.getElementById('hidden-input');
    if (hiddenInput) hiddenInput.focus();
  }, 800);
}
window.startExperience = startExperience;

// 初期設定の実行
setupTimeBasedIntro();

const startBtn = document.getElementById('intro-start-btn');
if (startBtn) {
  startBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    startExperience();
  });
}

// ----------------------------------------------------
// 0. 音響システム (Web Audio Files)
// ----------------------------------------------------
let audioCtx = null;

// 水滴音源ファイルのパスリスト（英数字パスでWebサーバー対応）
const WATER_DROP_SRCS = [
  'sound/water1.mp3',
  'sound/water2.mp3',
  'sound/water3.mp3'
];

// プリロードしたAudioBufferのキャッシュ
const waterDropBuffers = [];
let buffersLoaded = false;

function initAudio() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  // 音源のプリロード（初回のみ）
  if (audioCtx && !buffersLoaded) {
    buffersLoaded = true;
    WATER_DROP_SRCS.forEach((src, i) => {
      fetch(src)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.arrayBuffer();
        })
        .then(arrayBuf => audioCtx.decodeAudioData(arrayBuf))
        .then(audioBuf => { waterDropBuffers[i] = audioBuf; })
        .catch(err => console.warn('水滴音源の読み込みスキップ:', src, err));
    });
  }
}

// --- A. 水滴の音（ランダムな音源ファイルを再生） ---
function playWaterDrop() {
  if (!audioCtx || audioCtx.state !== 'running') return;

  const available = waterDropBuffers.filter(b => !!b);
  if (available.length === 0) return;

  const buf = available[Math.floor(Math.random() * available.length)];
  const source = audioCtx.createBufferSource();
  source.buffer = buf;

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = 0.15 + Math.random() * 0.15;

  source.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  source.start(audioCtx.currentTime);
}

// 水滴のアンビエントループ（3.5〜8秒おきにランダムでポタッと鳴る）
function scheduleNextDrop() {
  const nextInterval = 3500 + Math.random() * 4500;
  setTimeout(() => {
    playWaterDrop();
    scheduleNextDrop();
  }, nextInterval);
}
scheduleNextDrop();

// --- B. ガラスを拭う摩擦音（squeak1.mp3） ---
let squeakBuffer = null;
let squeakNode = null;
let squeakGainNode = null;
let squeakStopTimer = null;
let squeakStopNodeTimer = null;

function loadSqueakBuffer() {
  if (squeakBuffer || !audioCtx) return;
  fetch('sound/squeak1.mp3')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return res.arrayBuffer();
    })
    .then(arrayBuf => audioCtx.decodeAudioData(arrayBuf))
    .then(audioBuf => { squeakBuffer = audioBuf; })
    .catch(err => console.warn('摩擦音源の読み込みスキップ:', err));
}

function stopGlassSqueak(immediate = false) {
  clearTimeout(squeakStopTimer);
  clearTimeout(squeakStopNodeTimer);

  if (!squeakGainNode || !audioCtx) return;

  const now = audioCtx.currentTime;
  if (immediate) {
    squeakGainNode.gain.cancelScheduledValues(now);
    squeakGainNode.gain.setValueAtTime(0.0001, now);
    if (squeakNode) {
      try { squeakNode.stop(); } catch (e) { }
      squeakNode = null;
    }
  } else {
    // 短く自然にフェードアウト (50ms)
    squeakGainNode.gain.cancelScheduledValues(now);
    squeakGainNode.gain.setTargetAtTime(0.0001, now, 0.03);
    squeakStopNodeTimer = setTimeout(() => {
      if (squeakNode) {
        try { squeakNode.stop(); } catch (e) { }
        squeakNode = null;
      }
    }, 80);
  }
}

function playGlassSqueak(speed = 1.0) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  loadSqueakBuffer();
  if (!squeakBuffer) return;

  const now = audioCtx.currentTime;
  const clampedSpeed = Math.max(0.2, Math.min(speed, 3.5));

  // 指/マウスの動きに応じたピッチ（0.8〜1.5倍程度）と音量
  const targetRate = 0.8 + clampedSpeed * 0.2;
  const targetVol = Math.min(0.02 + clampedSpeed * 0.1, 0.35);

  // 新しい動きが来たら停止タイマーをキャンセル
  clearTimeout(squeakStopTimer);
  clearTimeout(squeakStopNodeTimer);

  if (!squeakNode) {
    squeakGainNode = audioCtx.createGain();
    squeakGainNode.gain.setValueAtTime(0.001, now);
    squeakGainNode.connect(audioCtx.destination);

    squeakNode = audioCtx.createBufferSource();
    squeakNode.buffer = squeakBuffer;
    squeakNode.loop = true;
    squeakNode.playbackRate.value = targetRate;
    squeakNode.connect(squeakGainNode);
    squeakNode.start(now);

    squeakNode.onended = () => { squeakNode = null; };
  } else {
    squeakNode.playbackRate.setTargetAtTime(targetRate, now, 0.03);
  }

  // 音量をスムーズに目標値へ
  squeakGainNode.gain.cancelScheduledValues(now);
  squeakGainNode.gain.setTargetAtTime(targetVol, now, 0.02);

  // 動きが止まったら速やかにフェードアウト（70ms無移動で停止）
  squeakStopTimer = setTimeout(() => {
    stopGlassSqueak(false);
  }, 70);
}

// 文字タイピング時の微細なキュッという擦れ音
function playTypeSqueak() {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';

  const freq = 1800 + Math.random() * 800;
  osc.frequency.setValueAtTime(freq, now);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.7, now + 0.06);

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.025, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.07);
}

// ----------------------------------------------------
// 1. マウス・タッチによる手書き描画（画面比率で線幅を決定）
// ----------------------------------------------------
let lastPos = null;
let lastTime = 0;
const cleared = []; // [{ points: [{x,y}], widths: [number], start: timestamp }]

function calcLineWidth(dist, dt) {
  const base = getBaseDim();
  const speed = dt ? dist / dt : 0;
  // 画面短辺に対する比率（最小: 0.6%、最大: 3.2%）
  const minW = base * 0.006;
  const maxW = base * 0.032;
  return Math.max(minW, maxW - speed * (base * 0.00015));
}

fogCanvas.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (e.target && e.target.setPointerCapture) {
    try { e.target.setPointerCapture(e.pointerId); } catch (err) { }
  }

  const pos = { x: e.offsetX, y: e.offsetY };
  lastPos = pos;
  lastTime = performance.now();
  cleared.push({ points: [pos], widths: [], start: performance.now() });

  // タップ位置を起点に新しいフレーズを開始
  const tappedScreenX = window.innerWidth - pos.x;
  startNewPhrase(tappedScreenX, pos.y);
});

fogCanvas.addEventListener('pointermove', e => {
  e.preventDefault();
  if (!lastPos) return;
  const now = performance.now();
  const cur = { x: e.offsetX, y: e.offsetY };
  const dx = cur.x - lastPos.x, dy = cur.y - lastPos.y;
  const dist = Math.hypot(dx, dy);
  const dt = now - lastTime;
  const w = calcLineWidth(dist, dt);

  // マウス/指の速度（px/ms）を計算してガラス摩擦音を鳴らす
  const moveSpeed = dt > 0 ? (dist / dt) * 1.5 : 1.0;
  playGlassSqueak(moveSpeed);

  const curStroke = cleared[cleared.length - 1];
  curStroke.points.push(cur);
  curStroke.widths.push(w);

  fogCtx.save();
  fogCtx.globalCompositeOperation = 'destination-out';
  fogCtx.filter = 'blur(6px)';
  fogCtx.lineCap = 'round';
  fogCtx.lineJoin = 'round';
  fogCtx.lineWidth = w + 6;
  fogCtx.beginPath();
  fogCtx.moveTo(lastPos.x, lastPos.y);
  fogCtx.lineTo(cur.x, cur.y);
  fogCtx.stroke();
  fogCtx.restore();

  lastPos = cur;
  lastTime = now;
});

function endStroke(e) {
  if (e && e.target && e.target.releasePointerCapture && e.pointerId !== undefined) {
    try { e.target.releasePointerCapture(e.pointerId); } catch (err) { }
  }
  lastPos = null;
  stopGlassSqueak(true);
}

fogCanvas.addEventListener('pointerup', endStroke);
fogCanvas.addEventListener('pointerleave', endStroke);
fogCanvas.addEventListener('pointercancel', endStroke);

window.addEventListener('pointerup', endStroke);
window.addEventListener('pointercancel', endStroke);
window.addEventListener('touchend', endStroke);
window.addEventListener('touchcancel', endStroke);

// ----------------------------------------------------
// 2. ひらがな自動変換 ＆ 画面比率に応じた縦横タイピング
// ----------------------------------------------------
const clearedTexts = []; // [{ char, canvasX, canvasY, fontSize, start }]

let isPhraseActive = false;
let phraseTimer = null;
let currentDirection = 'vertical';
let phraseFontSize = 44;
let screenCursorX = 0;
let screenCursorY = 0;
let phraseOriginX = 0;
let phraseOriginY = 0;

// 新しいフレーズを開始（画面比率に応じた文字サイズと位置決定）
function startNewPhrase(customX = null, customY = null) {
  currentDirection = Math.random() > 0.5 ? 'vertical' : 'horizontal';
  const base = getBaseDim();

  // 画面短辺（base）に対する比率で文字サイズを算出
  const sizeRoll = Math.random();
  if (sizeRoll < 0.3) {
    // 【小さめ】：画面短辺の 3.0% 〜 3.8%
    phraseFontSize = base * (0.050 + Math.random() * 0.008);
  } else if (sizeRoll < 0.75) {
    // 【標準】  ：画面短辺の 4.2% 〜 5.4%
    phraseFontSize = base * (0.08 + Math.random() * 0.012);
  } else {
    // 【大きめ】：画面短辺の 6.0% 〜 7.5%
    phraseFontSize = base * (0.10 + Math.random() * 0.015);
  }

  if (customX !== null && customY !== null) {
    phraseOriginX = screenCursorX = customX;
    phraseOriginY = screenCursorY = customY;
  } else {
    const minX = window.innerWidth * 0.15;
    const maxX = window.innerWidth * 0.85;
    const minY = window.innerHeight * 0.15;
    const maxY = window.innerHeight * 0.65;

    phraseOriginX = screenCursorX = minX + Math.random() * (maxX - minX);
    phraseOriginY = screenCursorY = minY + Math.random() * (maxY - minY);
  }

  isPhraseActive = true;
}

// 1文字を追加
function addTypedChar(char) {
  if (!isPhraseActive) {
    startNewPhrase();
  }

  clearTimeout(phraseTimer);
  phraseTimer = setTimeout(() => {
    isPhraseActive = false;
  }, 1000);

  if (char === '\n' || char === '\r') {
    newLine();
    return;
  }
  if (char === ' ' || char === '　') {
    if (currentDirection === 'vertical') {
      screenCursorY += phraseFontSize * 0.7;
    } else {
      screenCursorX += phraseFontSize * 0.7;
    }
    return;
  }

  const charFontSize = phraseFontSize + (Math.random() * (phraseFontSize * 0.08) - (phraseFontSize * 0.04));
  const charSpacing = charFontSize * 1.15;

  if (currentDirection === 'vertical') {
    if (screenCursorY > window.innerHeight - (phraseFontSize * 1.5)) {
      newLine();
    }
  } else {
    if (screenCursorX > window.innerWidth - (phraseFontSize * 1.5)) {
      newLine();
    }
  }

  const canvasX = window.innerWidth - screenCursorX;
  const canvasY = screenCursorY;

  clearedTexts.push({
    char: char,
    canvasX: canvasX,
    canvasY: canvasY,
    fontSize: charFontSize,
    start: performance.now()
  });

  // 文字タイピング音（指でガラスを刻む微細なキュッ音）
  playTypeSqueak();

  if (currentDirection === 'vertical') {
    screenCursorY += charSpacing;
  } else {
    screenCursorX += charSpacing;
  }
}

// 改行処理（文字サイズ比例）
function newLine() {
  const lineSpacing = phraseFontSize * 1.4;

  if (currentDirection === 'vertical') {
    screenCursorX -= lineSpacing;
    screenCursorY = phraseOriginY;
    if (screenCursorX < phraseFontSize * 1.5) {
      screenCursorX = window.innerWidth - (phraseFontSize * 2);
    }
  } else {
    screenCursorY += lineSpacing;
    screenCursorX = phraseOriginX;
    if (screenCursorY > window.innerHeight - (phraseFontSize * 1.5)) {
      screenCursorY = phraseFontSize * 2;
    }
  }
}

// 初期フレーズ設定
startNewPhrase();

// --- ローマ字 → ひらがな変換テーブル ---
const ROMAJI_TABLE = {
  'a': 'あ', 'i': 'い', 'u': 'う', 'e': 'え', 'o': 'お',
  'ka': 'か', 'ki': 'き', 'ku': 'く', 'ke': 'け', 'ko': 'こ',
  'sa': 'さ', 'si': 'し', 'shi': 'し', 'su': 'す', 'se': 'せ', 'so': 'そ',
  'ta': 'た', 'ti': 'ち', 'chi': 'ち', 'tu': 'つ', 'tsu': 'つ', 'te': 'て', 'to': 'と',
  'na': 'な', 'ni': 'に', 'nu': 'ぬ', 'ne': 'ね', 'no': 'の',
  'ha': 'は', 'hi': 'ひ', 'hu': 'ふ', 'fu': 'ふ', 'he': 'へ', 'ho': 'ほ',
  'ma': 'ま', 'mi': 'み', 'mu': 'む', 'me': 'め', 'mo': 'も',
  'ya': 'や', 'yu': 'ゆ', 'yo': 'よ',
  'ra': 'ら', 'ri': 'り', 'ru': 'る', 're': 'れ', 'ro': 'ろ',
  'wa': 'わ', 'wo': 'を', 'nn': 'ん', 'xn': 'ん',
  'ga': 'が', 'gi': 'ぎ', 'gu': 'ぐ', 'ge': 'げ', 'go': 'ご',
  'za': 'ざ', 'zi': 'じ', 'ji': 'じ', 'zu': 'ず', 'ze': 'ぜ', 'zo': 'ぞ',
  'da': 'だ', 'di': 'ぢ', 'du': 'づ', 'de': 'で', 'do': 'ど',
  'ba': 'ば', 'bi': 'び', 'bu': 'ぶ', 'be': 'べ', 'bo': 'ぼ',
  'pa': 'ぱ', 'pi': 'ぴ', 'pu': 'ぷ', 'pe': 'ぺ', 'po': 'ぽ',
  'kya': 'きゃ', 'kyu': 'きゅ', 'kyo': 'きょ',
  'sha': 'しゃ', 'shu': 'しゅ', 'sho': 'しょ', 'sya': 'しゃ', 'syu': 'しゅ', 'syo': 'しょ',
  'cha': 'ちゃ', 'chu': 'ちゅ', 'cho': 'ちょ', 'tya': 'ちゃ', 'tyu': 'ちゅ', 'tyo': 'ちょ',
  'nya': 'にゃ', 'nyu': 'にゅ', 'nyo': 'にょ',
  'hya': 'ひゃ', 'hyu': 'ひゅ', 'hyo': 'ひょ',
  'mya': 'みゃ', 'myu': 'みゅ', 'myo': 'みょ',
  'rya': 'りゃ', 'ryu': 'りゅ', 'ryo': 'りょ',
  'gya': 'ぎゃ', 'gyu': 'ぎゅ', 'gyo': 'ぎょ',
  'ja': 'じゃ', 'ju': 'じゅ', 'jo': 'じょ', 'zya': 'じゃ', 'zyu': 'じゅ', 'zyo': 'じょ',
  'bya': 'びゃ', 'byu': 'びゅ', 'byo': 'びょ',
  'pya': 'ぴゃ', 'pyu': 'ぴゅ', 'pyo': 'ぴょ',
  'xtu': 'っ', 'ltu': 'っ', 'tsu': 'つ',
  '-': 'ー', '- ': 'ー'
};

let romajiBuffer = '';

function processRomajiInput(char) {
  // すでに日本語（ひらがな・カタカナ・句読点）が入力された場合
  if (/^[\u3040-\u309F\u30A0-\u30FF\u3000-\u303Fー〜！？]$/.test(char)) {
    // バッファに 'n' が残っていれば 'ん' にする
    if (romajiBuffer === 'n') {
      addTypedChar('ん');
      romajiBuffer = '';
    }
    addTypedChar(char);
    return;
  }

  const lower = char.toLowerCase();

  // アルファベット以外（記号・数字・空白など）
  if (!/^[a-z\-]$/.test(lower)) {
    if (romajiBuffer === 'n') {
      addTypedChar('ん');
      romajiBuffer = '';
    }
    if (char === ' ' || char === '　') {
      addTypedChar(' ');
    } else if (char === '?' || char === '？') {
      addTypedChar('？');
    } else if (char === '!' || char === '！') {
      addTypedChar('！');
    } else if (char === '.' || char === '。') {
      addTypedChar('。');
    } else if (char === ',' || char === '、') {
      addTypedChar('、');
    } else {
      addTypedChar(char);
    }
    return;
  }

  romajiBuffer += lower;

  // 促音の判定 (例: kk -> っ + k, tt -> っ + t, ss -> っ + s)
  if (romajiBuffer.length === 2 && romajiBuffer[0] === romajiBuffer[1] && romajiBuffer[0] !== 'n') {
    addTypedChar('っ');
    romajiBuffer = romajiBuffer[1];
    return;
  }

  // 変換テーブルに完全一致
  if (ROMAJI_TABLE[romajiBuffer]) {
    const hira = ROMAJI_TABLE[romajiBuffer];
    for (const h of hira) {
      addTypedChar(h);
    }
    romajiBuffer = '';
    return;
  }

  // 「ん」の判定 (n + 子音 で 'na','ni','nu','ne','no','ny' 以外)
  if (romajiBuffer.length >= 2 && romajiBuffer[0] === 'n') {
    const next = romajiBuffer[1];
    if (!['a', 'i', 'u', 'e', 'o', 'y'].includes(next)) {
      addTypedChar('ん');
      romajiBuffer = romajiBuffer.slice(1);
      if (ROMAJI_TABLE[romajiBuffer]) {
        const hira = ROMAJI_TABLE[romajiBuffer];
        for (const h of hira) addTypedChar(h);
        romajiBuffer = '';
      }
      return;
    }
  }

  // 3文字以上で変換できない場合は切り離す
  if (romajiBuffer.length >= 4) {
    romajiBuffer = romajiBuffer.slice(-2);
  }
}

// キーボード特殊操作（Enter / Backspace）
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (romajiBuffer === 'n') {
      addTypedChar('ん');
      romajiBuffer = '';
    } else {
      romajiBuffer = '';
    }
    newLine();
    return;
  }

  if (e.key === 'Backspace') {
    if (romajiBuffer.length > 0) {
      romajiBuffer = romajiBuffer.slice(0, -1);
    } else if (clearedTexts.length > 0) {
      clearedTexts.pop();
      if (clearedTexts.length > 0) {
        const prev = clearedTexts[clearedTexts.length - 1];
        screenCursorX = window.innerWidth - prev.canvasX;
        screenCursorY = prev.canvasY + prev.fontSize * 1.15;
      } else {
        screenCursorX = window.innerWidth - 120;
        screenCursorY = lineOriginY;
      }
    }
    return;
  }
});

// 日本語IME・モバイルフリック入力・直接入力の統合リスナー（一重入力で確実に処理）
const hiddenInput = document.getElementById('hidden-input');
if (hiddenInput) {
  hiddenInput.addEventListener('input', () => {
    const val = hiddenInput.value;
    if (val) {
      for (const char of val) {
        processRomajiInput(char);
      }
      hiddenInput.value = '';
    }
  });
}

// 画面クリック/タップで常に入力を受け付けられるようフォーカス維持
function maintainInputFocus() {
  if (hiddenInput && !isIntroActive) {
    hiddenInput.focus();
  }
}
window.addEventListener('click', maintainInputFocus);
window.addEventListener('touchstart', maintainInputFocus);

// ----------------------------------------------------
// 3. アニメーションループ（結露復元と文字の揮発）
// ----------------------------------------------------
function animate() {
  const now = performance.now();

  // 10秒超えたストローク・文字の削除
  for (let i = cleared.length - 1; i >= 0; i--) {
    if ((now - cleared[i].start) / 1000 > 10) cleared.splice(i, 1);
  }
  for (let i = clearedTexts.length - 1; i >= 0; i--) {
    if ((now - clearedTexts[i].start) / 1000 > 10) clearedTexts.splice(i, 1);
  }

  // 結露濃度のスムーズな補間（開始時に0.0から0.9へ滑らかに立ち込める）
  if (currentFogAlpha < targetFogAlpha) {
    currentFogAlpha += (targetFogAlpha - currentFogAlpha) * 0.035;
    if (Math.abs(targetFogAlpha - currentFogAlpha) < 0.005) {
      currentFogAlpha = targetFogAlpha;
    }
  }

  // 結露ベース描画（動的な透明度で描画）
  drawFog(currentFogAlpha);

  // A. 手書き線のくり抜き
  cleared.forEach(stroke => {
    const age = (now - stroke.start) / 1000;
    const points = stroke.points;
    const widths = stroke.widths;
    if (points.length < 2) return;
    let clearAlpha = age <= 7 ? 1 : 1 - (age - 7) / 3;

    const avgWidth = widths.length > 0
      ? widths.reduce((a, b) => a + b, 0) / widths.length
      : 15;

    fogCtx.save();
    fogCtx.globalCompositeOperation = 'destination-out';
    fogCtx.globalAlpha = clearAlpha;
    fogCtx.filter = 'blur(6px)';
    fogCtx.lineCap = 'round';
    fogCtx.lineJoin = 'round';
    fogCtx.lineWidth = avgWidth + 8;
    fogCtx.beginPath();
    fogCtx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      fogCtx.lineTo(points[i].x, points[i].y);
    }
    fogCtx.stroke();
    fogCtx.restore();
  });

  // B. タイプしたひらがな文字のくり抜き（縦書き/横書き）
  clearedTexts.forEach(item => {
    const age = (now - item.start) / 1000;
    let clearAlpha = age <= 7 ? 1 : 1 - (age - 7) / 3;
    let blurAmount = age <= 7 ? 2 : 2 + ((age - 7) / 3) * 10;

    fogCtx.save();
    fogCtx.globalCompositeOperation = 'destination-out';
    fogCtx.globalAlpha = clearAlpha;
    fogCtx.filter = 'blur(' + blurAmount + 'px)';
    fogCtx.font = item.fontSize + 'px "Zen Kurenaido", cursive, sans-serif';
    fogCtx.textAlign = 'center';
    fogCtx.textBaseline = 'middle';
    fogCtx.lineCap = 'round';
    fogCtx.lineJoin = 'round';

    // Canvasの左右反転をミラー補正して正しい向きで描画
    fogCtx.translate(item.canvasX, item.canvasY);
    fogCtx.scale(-1, 1);

    // 【文字の太さの調整】：フォントサイズに応じた輪郭ストロークを追加（0.06〜0.15等で調整可能）
    const textThickness = item.fontSize * 0.08; // ★太さパラメータ（数値を上げるとより太くなります）
    if (textThickness > 0) {
      fogCtx.lineWidth = textThickness;
      fogCtx.strokeText(item.char, 0, 0);
    }
    fogCtx.fillText(item.char, 0, 0);

    fogCtx.restore();
  });

  requestAnimationFrame(animate);
}
animate();
