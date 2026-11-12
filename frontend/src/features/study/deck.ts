/** Potongan teks dalam satu baris lirik. `reading` = furigana di atasnya, `target` = kata yang sedang dipelajari. */
export type Segment = { text: string; reading?: string; target?: boolean };

export type Flashcard = {
  id: string;
  /** Kata target (kanji/kana) dan bacaannya. */
  word: string;
  reading: string;
  meaning: string;
  /** Baris lirik yang memuat kata tersebut. */
  line: Segment[];
  translation: string;
  /**
   * Potongan video untuk baris lirik ini (detik; awal dan akhir baris yang tersinkron).
   * Kosong = belum diketahui; kartu menampilkan "klip belum tersedia", bukan klip yang salah.
   */
  clip?: { startSec: number; endSec: number };
};

// TODO: ganti dengan data dari backend (kosakata hasil AI per lagu + timestamp baris lirik).
// Kunci = ID video YouTube. Lagu yang tidak ada di sini belum punya kartu.
// Kartu hanya boleh berisi baris yang benar-benar ada di lagunya, dengan `clip` yang sesuai.
const DECKS: Record<string, Flashcard[]> = {
  // ヨルシカ - 千鳥
  t75qlQPXJGw: [
    {
      id: 'chidori-sora',
      word: '空',
      reading: 'そら',
      meaning: 'langit',
      line: [
        { text: '遠', reading: 'とお' },
        { text: 'い' },
        { text: '空', reading: 'そら', target: true },
        { text: 'を' },
        { text: '見上', reading: 'みあ' },
        { text: 'げている' },
      ],
      translation: 'Menatap langit yang jauh',
      // clip: { startSec: 0, endSec: 0 }, // ← isi dengan detik mulai & selesai baris ini di video
    },
  ],
};

export function getDeck(videoId: string): Flashcard[] {
  return DECKS[videoId] ?? [];
}
