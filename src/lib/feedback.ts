// Деликатная звуковая/тактильная отдача для значимых событий (успех/ошибка
// операции), НЕ на каждый клик. Звук — короткие синтезированные тоны через
// Web Audio (без аудиофайлов), на ошибке дополнительно лёгкая вибрация на
// телефоне. Всё управляется одним переключателем «Звук», по умолчанию выключен.

const KEY = "yfm_sound";

export const isSoundOn = (): boolean => {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
};

export const setSoundOn = (on: boolean): void => {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* недоступен localStorage */ }
};

let ctx: AudioContext | null = null;
const audio = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
};

type Note = { freq: number; start?: number; dur?: number; gain?: number; type?: OscillatorType; slideTo?: number };

// Мягкие «округлые» тоны в стиле Apple: плавная атака/экспоненциальное затухание,
// общий low-pass для тёплого тембра без резкости. Ноты могут перекрываться,
// поддерживается глайд частоты (slideTo) — для «капельного» тапа.
const play = (notes: Note[]): void => {
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const t0 = ac.currentTime + 0.005;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 4200;
  filter.Q.value = 0.5;
  const out = ac.createGain();
  out.gain.value = 0.9;
  filter.connect(out);
  out.connect(ac.destination);

  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type || "sine";
    const s = t0 + (n.start || 0);
    const dur = n.dur || 0.18;
    const peak = n.gain ?? 0.05;
    osc.frequency.setValueAtTime(n.freq, s);
    if (n.slideTo) osc.frequency.exponentialRampToValueAtTime(n.slideTo, s + dur);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(peak, s + 0.012);          // мягкая атака
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);          // плавное затухание
    osc.connect(g);
    g.connect(filter);
    osc.start(s);
    osc.stop(s + dur + 0.03);
  }
};

// Тап по кнопке — деликатный «капельный» клик (короткий глайд вниз), как в iOS.
export const feedbackTap = (): void => {
  if (!isSoundOn()) return;
  play([
    { freq: 1180, slideTo: 760, dur: 0.055, gain: 0.03, type: "sine" },
    { freq: 2360, slideTo: 1520, dur: 0.045, gain: 0.012, type: "sine" }, // лёгкий верхний призвук
  ]);
};

// Успех — тёплый восходящий перезвон с шиммером (мажор) + мягкая «подложка».
export const feedbackSuccess = (): void => {
  if (!isSoundOn()) return;
  play([
    { freq: 392.0,  start: 0,    dur: 0.30, gain: 0.022, type: "sine" },     // G4 — тёплая подложка
    { freq: 783.99, start: 0,    dur: 0.18, gain: 0.05,  type: "triangle" }, // G5
    { freq: 1046.5, start: 0.06, dur: 0.18, gain: 0.045, type: "triangle" }, // C6
    { freq: 1567.98, start: 0.12, dur: 0.28, gain: 0.032, type: "sine" },    // G6 — шиммер
  ]);
};

// Ошибка — мягкий нисходящий двойной тон (деликатный) + короткая вибрация.
export const feedbackError = (): void => {
  if (!isSoundOn()) return;
  play([
    { freq: 466.16, start: 0,    dur: 0.16, gain: 0.05, type: "triangle" }, // A#4
    { freq: 311.13, start: 0.11, dur: 0.28, gain: 0.05, type: "sine" },     // D#4
  ]);
  try { navigator.vibrate?.(28); } catch { /* вибрация не поддерживается */ }
};

