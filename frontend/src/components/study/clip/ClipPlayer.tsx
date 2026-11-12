import { useEffect, useImperativeHandle, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { WebView as RNWebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { CLIP_TICK_MS, clipWindow, type ClipPlayerProps } from './config';
import { ClipFrame } from './ClipFallback';

type WebViewHandle = { injectJavaScript: (script: string) => void };
// Typings react-native-webview tidak menyertakan `ref` untuk React 19; tipe disesuaikan di sini.
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

/**
 * Pemutar potongan lagu (Android). YouTube IFrame API dijalankan di dalam WebView;
 * versi web ada di ClipPlayer.web.tsx dengan logika yang sama.
 * `baseUrl` YouTube wajib agar embed tidak ditolak (error 153: tidak ada referer).
 */
function buildHtml(videoId: string, begin: number, finish: number, autoplay: boolean, reportTime: boolean) {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p{width:100%;height:100%}</style>
</head><body><div id="p"></div>
<script src="https://www.youtube.com/iframe_api"></script>
<script>
var BEGIN=${begin}, FINISH=${finish}, REPORT_TIME=${reportTime}, player, ready=false, last=null, ticks=0;
function post(m){ window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
function onYouTubeIframeAPIReady(){
  player = new YT.Player('p', {
    videoId: ${JSON.stringify(videoId)},
    playerVars: { controls:0, disablekb:1, fs:0, modestbranding:1, rel:0, playsinline:1, iv_load_policy:3, cc_load_policy:0, start:Math.floor(BEGIN) },
    events: {
      onReady: function(){
        ready = true;
        player.seekTo(BEGIN, true);
        post({type:'ready'});
        ${autoplay ? 'player.playVideo();' : ''}
        setInterval(tick, ${CLIP_TICK_MS});
      },
      onStateChange: function(e){ report(e.data === 1); },
      onError: function(e){ post({type:'error', code:e.data}); }
    }
  });
}
function report(p){ if(p!==last){ last=p; post({type:'playing', value:p}); } }
// Berhenti tepat di akhir baris + jeda aman, lalu kembali ke awal agar siap diputar ulang.
function tick(){
  if(REPORT_TIME && ++ticks % 3 === 0) post({type:'time', value: player.getCurrentTime()});
  if(player.getPlayerState()===1 && player.getCurrentTime()>=FINISH){
    player.pauseVideo(); player.seekTo(BEGIN, true);
  }
}
window.cmd = function(c){
  if(!ready) return;
  if(c.type==='play'){ if(player.getCurrentTime()>=FINISH-0.05) player.seekTo(BEGIN,true); player.playVideo(); }
  if(c.type==='pause'){ player.pauseVideo(); }
  if(c.type==='rate'){ player.setPlaybackRate(c.value); }
  if(c.type==='seek'){ player.seekTo(c.value, true); }
};
</script></body></html>`;
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
  const ref = useRef<WebViewHandle>(null);
  const readyRef = useRef(false);
  const actual = useRef(false);
  const [failed, setFailed] = useState(false);
  const [autoplay] = useState(playing); // hanya nilai awal; perubahan berikutnya lewat perintah
  const reportTime = !!onTime;

  // Dibuat sekali per klip; perubahan `playing` dikirim sebagai perintah, bukan lewat reload.
  const html = useMemo(() => {
    const { begin, finish } = clipWindow(startSec, endSec);
    return buildHtml(videoId, begin, finish, autoplay, reportTime);
  }, [videoId, startSec, endSec, autoplay, reportTime]);

  const send = (cmd: object) => ref.current?.injectJavaScript(`window.cmd(${JSON.stringify(cmd)}); true;`);

  useImperativeHandle(handleRef, () => ({ seekTo: (sec: number) => send({ type: 'seek', value: sec }) }), []);

  useEffect(() => {
    if (!readyRef.current || playing === actual.current) return;
    send({ type: playing ? 'play' : 'pause' });
  }, [playing]);

  useEffect(() => {
    if (readyRef.current) send({ type: 'rate', value: rate });
  }, [rate]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: { type: string; value?: boolean | number };
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'ready') {
      readyRef.current = true;
      send({ type: 'rate', value: rate });
      // Autoplay bisa ditolak sistem; jika belum jalan, tombol harus menampilkan "putar", bukan "jeda".
      setTimeout(() => {
        if (!actual.current) onPlayingChange(false);
      }, 1500);
    } else if (msg.type === 'playing') {
      actual.current = !!msg.value;
      onPlayingChange(!!msg.value);
    } else if (msg.type === 'time') {
      onTime?.(Number(msg.value));
    } else if (msg.type === 'error') {
      setFailed(true);
      onPlayingChange(false);
    }
  };

  return (
    <ClipFrame failed={failed}>
      {!failed && (
        <WebView
          ref={ref}
          style={styles.web}
          source={{ html, baseUrl: 'https://www.youtube.com' }}
          originWhitelist={['*']}
          javaScriptEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onMessage={onMessage}
          onError={() => setFailed(true)}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
        />
      )}
      {/* Penutup transparan: mencegah sentuhan memicu UI bawaan YouTube; kontrol ada di bawah video. */}
      {!failed && <Pressable style={StyleSheet.absoluteFill} onPress={() => onPlayingChange(!actual.current)} />}
    </ClipFrame>
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: 'transparent' },
});
