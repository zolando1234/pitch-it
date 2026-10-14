/*
  Delenie reči na úseky pre priebežný prepis: zvuk 16 kHz mono sa reže približne každých
  30 sekúnd, vždy v najtichšom mieste (pauza medzi slovami), aby sa slovo nerozseklo.
  Čisté funkcie bez prehliadačových API, testované.
*/

export const SAMPLE_RATE = 16_000;
/** úsek sa začne hľadať po 25 s a najneskôr sa strihne po 38 s */
export const SEGMENT_MIN_S = 25;
export const SEGMENT_MAX_S = 38;
/** okno na meranie hlasitosti pri hľadaní strihu */
const WINDOW = Math.round(SAMPLE_RATE * 0.1);
/** pod touto hlasitosťou (RMS) je ticho a dá sa strihnúť hneď */
const SILENCE_RMS = 0.012;

function rms(samples: Float32Array, from: number, length: number): number {
  let sum = 0;
  const end = Math.min(samples.length, from + length);
  for (let i = from; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, end - from));
}

/**
 * Kde strihnúť: index vzorky v najtichšom okne medzi SEGMENT_MIN_S a koncom bufferu.
 * Vráti null, kým nie je čas strihať (buffer kratší ako minimum, alebo ešte nie je ticho
 * a nedosiahli sme maximum).
 */
export function findCut(samples: Float32Array, final = false): number | null {
  const min = SEGMENT_MIN_S * SAMPLE_RATE;
  const max = SEGMENT_MAX_S * SAMPLE_RATE;
  if (samples.length < min) return null;
  let best = -1;
  let bestRms = Infinity;
  const end = Math.min(samples.length, max) - WINDOW;
  for (let i = min; i <= end; i += WINDOW / 2) {
    const level = rms(samples, i, WINDOW);
    if (level < bestRms) {
      bestRms = level;
      best = i + WINDOW / 2;
    }
  }
  if (best < 0) return final ? samples.length : null;
  if (bestRms <= SILENCE_RMS || samples.length >= max || final) return Math.round(best);
  return null;
}

/** Priebežné prevzorkovanie na 16 kHz (lineárne, pamätá si polohu medzi blokmi). */
export class Resampler {
  private position = 0;
  private last = 0;
  private readonly fromRate: number;
  constructor(fromRate: number) {
    this.fromRate = fromRate;
  }

  push(input: Float32Array): Float32Array {
    if (this.fromRate === SAMPLE_RATE) return input;
    const step = this.fromRate / SAMPLE_RATE;
    const out: number[] = [];
    // position je index v bloku (môže byť záporný: odkazuje na poslednú vzorku minulého bloku)
    while (this.position < input.length - 1) {
      const i = Math.floor(this.position);
      const frac = this.position - i;
      const a = i < 0 ? this.last : input[i];
      const b = input[i + 1];
      out.push(a + (b - a) * frac);
      this.position += step;
    }
    this.position -= input.length;
    this.last = input[input.length - 1] ?? this.last;
    return Float32Array.from(out);
  }
}

/** Prevzorkovanie na 16 kHz (priemer okna; na reč stačí). */
export function downsample(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === SAMPLE_RATE) return input;
  const ratio = fromRate / SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    out[i] = sum / Math.max(1, end - start);
  }
  return out;
}

/** WAV (PCM 16 bit mono). */
export function encodeWav(samples: Float32Array, rate = SAMPLE_RATE): Uint8Array {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

export type AudioSegment = { index: number; offsetMs: number; durationMs: number; wav: Uint8Array };

/**
 * Skladá prichádzajúci zvuk (16 kHz) a vydáva hotové úseky. `push` vráti úseky, ktoré sa
 * práve uzavreli; `finish` vráti zvyšok.
 */
export class Segmenter {
  private buffer = new Float32Array(SEGMENT_MAX_S * SAMPLE_RATE + SAMPLE_RATE);
  private length = 0;
  private offset = 0;
  private index = 0;
  /** dĺžka celého zvuku v ms */
  totalMs = 0;

  push(chunk: Float32Array): AudioSegment[] {
    const out: AudioSegment[] = [];
    let rest = chunk;
    while (rest.length) {
      const room = this.buffer.length - this.length;
      const take = Math.min(room, rest.length);
      this.buffer.set(rest.subarray(0, take), this.length);
      this.length += take;
      this.totalMs += (take / SAMPLE_RATE) * 1000;
      rest = rest.subarray(take);
      const cut = findCut(this.buffer.subarray(0, this.length));
      if (cut !== null) out.push(this.emit(cut));
    }
    return out;
  }

  finish(): AudioSegment | null {
    // zvyšok kratší ako 0,3 s je len ticho na konci
    if (this.length < SAMPLE_RATE * 0.3) return null;
    return this.emit(this.length);
  }

  private emit(cut: number): AudioSegment {
    const samples = this.buffer.slice(0, cut);
    const segment = { index: this.index++, offsetMs: Math.round((this.offset / SAMPLE_RATE) * 1000), durationMs: Math.round((cut / SAMPLE_RATE) * 1000), wav: encodeWav(samples) };
    this.buffer.copyWithin(0, cut, this.length);
    this.length -= cut;
    this.offset += cut;
    return segment;
  }
}

/** Celý zvuk naraz (napr. z nahratého videa) rozdelený na úseky. */
export function segmentAll(samples: Float32Array): AudioSegment[] {
  const segmenter = new Segmenter();
  const out: AudioSegment[] = [];
  const step = SAMPLE_RATE;
  for (let i = 0; i < samples.length; i += step) out.push(...segmenter.push(samples.subarray(i, i + step)));
  const last = segmenter.finish();
  if (last) out.push(last);
  return out;
}
