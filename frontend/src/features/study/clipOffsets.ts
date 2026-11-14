/** Awal dan akhir klip (detik) pada video. */
export type Clip = { startSec: number; endSec: number };

export const STEP = 0.25;
export const MAX_SHIFT = 30;

/** Tambah geseran; ditolak (nilai lama) bila melewati batas. */
export function shiftOffset(offset: number, delta: number): number {
  const next = Math.round((offset + delta) * 100) / 100;
  return Math.abs(next) <= MAX_SHIFT ? next : offset;
}
