import { useEffect, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CLIP_TICK_MS, clipWindow, type ClipPlayerProps } from './config';
import { ClipFrame } from './ClipFallback';

/** Pemutar potongan lagu (web): YouTube IFrame API langsung di halaman; logikanya sama dengan versi Android. */

type YTPlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getPlayerState(): number;
  setPlaybackRate(rate: number): void;
  destroy(): void;
};
type YTNamespace = {
  Player: new (el: HTMLElement, opts: object) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiPromise ??= new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT as YTNamespace);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return apiPromise;
}

export default function ClipPlayer({
  videoId,
  startSec,
  endSec,
  playing,
  rate,
  onPlayingChange,
  onTime,
  handleRef,
}: ClipPlayerProps) {
  const hostRef = useRef<ComponentRef<typeof View>>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const actual = useRef(false);
  const latest = useRef({ playing, rate, onPlayingChange, onTime });
  const [failed, setFailed] = useState(false);

  // Callback/props terbaru untuk handler player (yang dibuat sekali per klip).
  useEffect(() => {
    latest.current = { playing, rate, onPlayingChange, onTime };
  });

  useImperativeHandle(handleRef, () => ({ seekTo: (sec: number) => playerRef.current?.seekTo(sec, true) }), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const { begin, finish } = clipWindow(startSec, endSec);
    readyRef.current = false;
    actual.current = false;

    const host = hostRef.current as unknown as HTMLElement | null;
    if (!host) return;
    const mount = document.createElement('div');
    mount.style.cssText = 'width:100%;height:100%';
    host.appendChild(mount);

    const report = (value: boolean) => {
      if (actual.current === value) return;
      actual.current = value;
      latest.current.onPlayingChange(value);
    };

    loadYouTubeApi().then((YT) => {
      if (cancelled) return;
      playerRef.current = new YT.Player(mount, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: {
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          cc_load_policy: 0,
          start: Math.floor(begin),
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            const p = playerRef.current;
            if (!p || cancelled) return;
            readyRef.current = true;
            p.seekTo(begin, true);
            p.setPlaybackRate(latest.current.rate);
            if (latest.current.playing) p.playVideo();
            // Autoplay bisa ditolak browser; jika belum jalan, tombol harus menampilkan "putar".
            setTimeout(() => {
              if (!cancelled && !actual.current) latest.current.onPlayingChange(false);
            }, 1500);
            // Berhenti tepat di akhir baris + jeda aman, lalu kembali ke awal agar siap diputar ulang.
            let ticks = 0;
            timer = setInterval(() => {
              if (latest.current.onTime && ++ticks % 3 === 0) latest.current.onTime(p.getCurrentTime());
              if (p.getPlayerState() === 1 && p.getCurrentTime() >= finish) {
                p.pauseVideo();
                p.seekTo(begin, true);
              }
            }, CLIP_TICK_MS);
          },
          onStateChange: (e: { data: number }) => report(e.data === 1),
          onError: () => {
            setFailed(true);
            latest.current.onPlayingChange(false);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      try {
        playerRef.current?.destroy();
      } catch {}
      playerRef.current = null;
      mount.remove();
    };
  }, [videoId, startSec, endSec]);

  useEffect(() => {
    const p = playerRef.current;
    if (!readyRef.current || !p || playing === actual.current) return;
    if (playing) {
      const { begin, finish } = clipWindow(startSec, endSec);
      if (p.getCurrentTime() >= finish - 0.05) p.seekTo(begin, true);
      p.playVideo();
    } else {
      p.pauseVideo();
    }
  }, [playing, startSec, endSec]);

  useEffect(() => {
    if (readyRef.current) playerRef.current?.setPlaybackRate(rate);
  }, [rate]);

  return (
    <ClipFrame failed={failed}>
      <View ref={hostRef} style={StyleSheet.absoluteFill} />
      {/* Penutup transparan: mencegah klik memicu UI bawaan YouTube; kontrol ada di bawah video. */}
      {!failed && <Pressable style={StyleSheet.absoluteFill} onPress={() => onPlayingChange(!actual.current)} />}
    </ClipFrame>
  );
}
