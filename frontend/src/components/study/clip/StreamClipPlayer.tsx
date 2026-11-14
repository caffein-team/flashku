import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { CLIP_TICK_MS, clipGain, clipWindow, type ClipPlayerProps } from './config';

// Penugasan properti pemain dipisah agar tidak dianggap memodifikasi nilai hook.
const seek = (p: VideoPlayer, t: number) => {
  p.currentTime = t;
};
const setRate = (p: VideoPlayer, r: number) => {
  p.playbackRate = r;
};
const setVolume = (p: VideoPlayer, v: number) => {
  p.volume = v;
};

type Props = Omit<ClipPlayerProps, 'videoId'> & { url: string; ua: string; onError: () => void };

/**
 * Pemutar klip dari URL stream langsung. `playing` dari layar adalah satu-satunya sumber kebenaran:
 * status internal pemain (buffering, dll.) tidak dilaporkan balik, supaya tidak memicu jeda palsu.
 */
export default function StreamClipPlayer({ url, ua, startSec, endSec, playing, rate, onPlayingChange, onError }: Props) {
  const { begin, finish } = clipWindow(startSec, endSec);
  const player = useVideoPlayer({ uri: url, headers: { 'User-Agent': ua } }, (p) => {
    p.loop = false;
  });

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const ready = status === 'readyToPlay';
  const positioned = useRef(false);

  useEffect(() => {
    if (status === 'error') onError();
  }, [status, onError]);

  // Pindah ke awal klip satu kali, saat media pertama siap.
  useEffect(() => {
    if (!ready || positioned.current) return;
    positioned.current = true;
    seek(player, begin);
  }, [ready, player, begin]);

  useEffect(() => {
    if (!ready) return;
    if (playing) {
      if (player.currentTime >= finish - 0.05) seek(player, begin);
      player.play();
    } else {
      player.pause();
    }
  }, [playing, ready, player, begin, finish]);

  useEffect(() => {
    setRate(player, rate);
  }, [rate, player]);

  // Berhenti tepat di akhir baris lalu kembali ke awal agar siap diputar ulang.
  useEffect(() => {
    const t = setInterval(() => {
      if (!player.playing) return;
      if (player.currentTime >= finish) {
        player.pause();
        seek(player, begin);
        onPlayingChange(false);
        return;
      }
      setVolume(player, clipGain(player.currentTime, begin, finish));
    }, CLIP_TICK_MS);
    return () => clearInterval(t);
  }, [player, begin, finish, onPlayingChange]);

  return (
    <>
      <VideoView player={player} nativeControls={false} contentFit="cover" style={StyleSheet.absoluteFill} />
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onPlayingChange(!playing)} />
    </>
  );
}
