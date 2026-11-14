const YOUTUBE_ID =
  /(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/;

/** Ambil video ID dari berbagai bentuk link YouTube. null jika bukan link YouTube yang valid. */
export function parseYouTubeId(input: string): string | null {
  const match = input.trim().match(YOUTUBE_ID);
  return match ? match[1] : null;
}

export type YouTubeInfo = { title: string; author: string };

/** Metadata ringan lewat oEmbed (tanpa API key). Melempar error jika video tidak ditemukan. */
export async function fetchYouTubeInfo(url: string): Promise<YouTubeInfo> {
  const res = await fetch(
    `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
  );
  if (!res.ok) throw new Error('not-found');
  const data = (await res.json()) as { title?: string; author_name?: string };
  if (!data.title) throw new Error('not-found');
  return {
    title: data.title,
    author: (data.author_name ?? '').replace(/\s*-\s*Topic$/i, ''),
  };
}
