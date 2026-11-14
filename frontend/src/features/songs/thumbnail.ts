/** Thumbnail 16:9 resmi YouTube (320x180) dari ID video; tanpa API key. */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
