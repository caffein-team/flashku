import { useEffect, useState } from 'react';

import { resolveStream, type Stream } from '@/features/study/ytStream';

import { ClipFrame } from './ClipFallback';
import type { ClipPlayerProps } from './config';
import StreamClipPlayer from './StreamClipPlayer';

/** Pemutar klip Android: URL stream langsung dari YouTube, tanpa embed (web: ClipPlayer.web.tsx). */
export default function ClipPlayer({ videoId, startSec, endSec, playing, rate, onPlayingChange }: ClipPlayerProps) {
  const [stream, setStream] = useState<Stream | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    resolveStream(videoId).then(
      (s) => alive && setStream(s),
      (e: Error) => {
        if (!alive) return;
        setError(e.message);
        onPlayingChange(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [videoId, onPlayingChange]);

  return (
    <ClipFrame failed={!!error} message={error ? `Video tidak dapat diputar (${error})` : undefined}>
      {!error && stream && (
        <StreamClipPlayer
          url={stream.url}
          ua={stream.ua}
          startSec={startSec}
          endSec={endSec}
          playing={playing}
          rate={rate}
          onPlayingChange={onPlayingChange}
          onError={() => {
            setError('stream tidak dapat diputar');
            onPlayingChange(false);
          }}
        />
      )}
    </ClipFrame>
  );
}
