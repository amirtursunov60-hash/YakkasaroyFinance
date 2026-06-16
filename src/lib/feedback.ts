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

type Note = { freq: number; start?: number; dur?: number; gain?: number; type?: OscillatorType };

// Мягкие «округлые» тоны в стиле Apple: плавная атака/экспоненциальное затухание,
// общий low-pass для тёплого тембра без резкости. Ноты могут перекрываться.
const play = (notes: Note[]): void => {
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const t0 = ac.currentTime + 0.01;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3400;
  filter.Q.value = 0.6;
  filter.connect(ac.destination);

  for (const n of notes) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type || "sine";
    osc.frequency.value = n.freq;
    const s = t0 + (n.start || 0);
    const dur = n.dur || 0.18;
    const peak = n.gain ?? 0.05;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(peak, s + 0.014);          // мягкая атака
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);          // плавное затухание
    osc.connect(g);
    g.connect(filter);
    osc.start(s);
    osc.stop(s + dur + 0.03);
  }
};

// Успех — лёгкий восходящий перезвон (мажор), как подтверждение в iOS.
export const feedbackSuccess = (): void => {
  if (!isSoundOn()) return;
  play([
    { freq: 880.0,  start: 0,    dur: 0.16, gain: 0.05 },   // A5
    { freq: 1108.7, start: 0.05, dur: 0.16, gain: 0.045 },  // C#6
    { freq: 1318.5, start: 0.10, dur: 0.22, gain: 0.04 },   // E6
  ]);
};

// Ошибка — мягкий нисходящий двойной тон (деликатный) + короткая вибрация.
export const feedbackError = (): void => {
  if (!isSoundOn()) return;
  play([
    { freq: 440.0, start: 0,    dur: 0.16, gain: 0.05 },   // A4
    { freq: 329.6, start: 0.10, dur: 0.24, gain: 0.05 },   // E4
  ]);
  try { navigator.vibrate?.(28); } catch { /* вибрация не поддерживается */ }
};

