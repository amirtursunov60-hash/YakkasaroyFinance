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

// Короткая последовательность тихих тонов (sine), длительность каждого ~dur сек.
const tone = (freqs: number[], dur = 0.12, gain = 0.04): void => {
  const ac = audio();
  if (!ac) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  const t0 = ac.currentTime;
  freqs.forEach((f, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    const start = t0 + i * dur;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur);
  });
};

// Мягкий тон «вверх» — операция выполнена.
export const feedbackSuccess = (): void => {
  if (!isSoundOn()) return;
  tone([660, 880], 0.1, 0.04);
};

// Низкий тон «вниз» + короткая вибрация — ошибка/отказ.
export const feedbackError = (): void => {
  if (!isSoundOn()) return;
  tone([240, 170], 0.14, 0.05);
  try { navigator.vibrate?.(30); } catch { /* вибрация не поддерживается */ }
};
