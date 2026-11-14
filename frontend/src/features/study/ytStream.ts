/** Cadangan untuk video yang melarang embed (kode 101/150/152/153): ambil URL stream langsung lewat API internal YouTube. */
export type Stream = { url: string; ua: string };

type Format = { itag: number; url?: string; mimeType?: string };
type PlayerResponse = {
  playabilityStatus?: { status?: string; reason?: string };
  streamingData?: { formats?: Format[] };
  error?: { code?: number; message?: string };
};

type Client = { name: string; id: string; version: string; ua: string; extra: Record<string, unknown> };

// Klien tanpa token tambahan lebih dulu; versi klien yang terlalu lama ditolak dengan HTTP 400.
const CLIENTS: Client[] = [
  {
    name: 'ANDROID_VR',
    id: '28',
    version: '1.62.27',
    ua: 'com.google.android.apps.youtube.vr.oculus/1.62.27 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    extra: { deviceMake: 'Oculus', deviceModel: 'Quest 3', androidSdkVersion: 32, osName: 'Android', osVersion: '12L' },
  },
  {
    name: 'ANDROID',
    id: '3',
    version: '20.10.38',
    ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
    extra: { androidSdkVersion: 30, osName: 'Android', osVersion: '11' },
  },
];

const cache = new Map<string, Stream>();

async function tryClient(videoId: string, c: Client): Promise<Stream> {
  const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'user-agent': c.ua,
      'x-youtube-client-name': c.id,
      'x-youtube-client-version': c.version,
    },
    body: JSON.stringify({
      videoId,
      contentCheckOk: true,
      racyCheckOk: true,
      context: { client: { clientName: c.name, clientVersion: c.version, hl: 'id', gl: 'ID', ...c.extra } },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as PlayerResponse;
  if (!res.ok) throw new Error(`${c.name} HTTP ${res.status}${data.error?.message ? ` ${data.error.message}` : ''}`);

  // Format gabungan (video + audio) satu berkas; itag 18 (360p mp4) paling umum.
  const formats = (data.streamingData?.formats ?? []).filter((f) => f.url && f.mimeType?.startsWith('video/mp4'));
  const best = formats.find((f) => f.itag === 18) ?? formats[0];
  if (!best?.url) {
    const why = data.playabilityStatus?.reason ?? data.playabilityStatus?.status ?? 'tanpa format gabungan';
    throw new Error(`${c.name} ${why}`);
  }
  return { url: best.url, ua: c.ua };
}

export async function resolveStream(videoId: string): Promise<Stream> {
  const hit = cache.get(videoId);
  if (hit) return hit;

  const errors: string[] = [];
  for (const c of CLIENTS) {
    try {
      const stream = await tryClient(videoId, c);
      cache.set(videoId, stream);
      return stream;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  throw new Error(errors.join(' | '));
}
