import type { Ref } from 'react';

/**
 * Jeda aman di sekitar baris lirik. Timestamp baris biasanya tepat di onset/akhir vokal,
 * sehingga tanpa jeda ini konsonan awal atau napas akhir ikut terpotong.
 */
export const CLIP_PAD_BEFORE = 0.25;
export const CLIP_PAD_AFTER = 0.35;

/** Seberapa sering pemutar mengecek posisi waktu (ms). Menentukan seberapa presisi klip berhenti. */
export const CLIP_TICK_MS = 50;

/** Kendali imperatif pemutar, dipakai alat penentu timestamp (dev). */
export type ClipPlayerHandle = { seekTo: (sec: number) => void };

export type ClipPlayerProps = {
  /** ID video YouTube. */
  videoId: string;
  /** Awal dan akhir baris lirik (detik) pada video. Jeda aman ditambahkan oleh pemutar. */
  startSec: number;
  endSec: number;
  /** Keinginan pemutaran; kondisi sebenarnya dilaporkan lewat `onPlayingChange`. */
  playing: boolean;
  /** Kecepatan putar: 0.5, 0.75, 1, atau 1.25. */
  rate: number;
  onPlayingChange: (playing: boolean) => void;
  /** Opsional: laporan posisi video (detik) ~tiap 150 ms. Dipakai alat penentu timestamp. */
  onTime?: (sec: number) => void;
  handleRef?: Ref<ClipPlayerHandle>;
};

export function clipWindow(startSec: number, endSec: number) {
  return {
    begin: Math.max(0, startSec - CLIP_PAD_BEFORE),
    finish: endSec + CLIP_PAD_AFTER,
  };
}
