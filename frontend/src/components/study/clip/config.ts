/** Jeda aman di sekitar baris lirik; tanpa itu konsonan awal atau napas akhir ikut terpotong. */
export const CLIP_PAD_BEFORE = 0.25;
export const CLIP_PAD_AFTER = 0.35;

/** Interval pengecekan posisi (ms); menentukan presisi berhentinya klip. */
export const CLIP_TICK_MS = 50;

/** Fade in di awal dan fade out di akhir klip (detik), supaya potongan tidak berbunyi "klik". */
export const CLIP_FADE_SEC = 0.25;

/** Volume 0..1 pada posisi `t`: naik linear di awal jendela klip, turun linear di akhir. */
export function clipGain(t: number, begin: number, finish: number) {
  return Math.max(0, Math.min(1, (t - begin) / CLIP_FADE_SEC, (finish - t) / CLIP_FADE_SEC));
}

export type ClipPlayerProps = {
  videoId: string;
  /** Awal dan akhir baris lirik (detik) pada video. Jeda aman ditambahkan oleh pemutar. */
  startSec: number;
  endSec: number;
  /** Keinginan pemutaran; kondisi sebenarnya dilaporkan lewat `onPlayingChange`. */
  playing: boolean;
  /** Kecepatan putar: 0.5, 0.75, 1, atau 1.25. */
  rate: number;
  onPlayingChange: (playing: boolean) => void;
};

export function clipWindow(startSec: number, endSec: number) {
  return {
    begin: Math.max(0, startSec - CLIP_PAD_BEFORE),
    finish: endSec + CLIP_PAD_AFTER,
  };
}
