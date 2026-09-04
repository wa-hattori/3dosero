/** 画面ごとのBGMファイル。ファイル名の半角スペースはURLとして扱えるようencodeURIする。 */
const TRACKS = {
  start: encodeURI('data/tie no wa.mp3'),
  battle: encodeURI('data/hukamaru nazo.mp3'),
};

const FADE_IN_DURATION_MS = 600;
const FADE_STEP_MS = 30;

/**
 * BGMを`<audio>`要素で再生・切り替え・ミュートするプレイヤーを生成する。
 * ループ再生し、切り替え・ミュート解除のたびに軽くフェードインする。
 * @returns {{
 *   play: (trackName: 'start' | 'battle') => void,
 *   setMuted: (muted: boolean) => void,
 *   stop: () => void,
 * }}
 */
export const createBgmPlayer = () => {
  const audio = new Audio();
  audio.loop = true;

  let currentTrack = null;
  let muted = false;
  let fadeIntervalId = null;

  const clearFade = () => {
    if (fadeIntervalId !== null) {
      clearInterval(fadeIntervalId);
      fadeIntervalId = null;
    }
  };

  const fadeInToFull = () => {
    clearFade();
    const steps = Math.max(1, Math.round(FADE_IN_DURATION_MS / FADE_STEP_MS));
    let step = 0;

    fadeIntervalId = setInterval(() => {
      step += 1;
      audio.volume = Math.min(1, step / steps);
      if (step >= steps) clearFade();
    }, FADE_STEP_MS);
  };

  /**
   * 指定したトラックを再生する。既に同じトラックを再生中なら何もしない。
   * @param {'start' | 'battle'} trackName
   */
  const play = (trackName) => {
    if (currentTrack === trackName) return;
    currentTrack = trackName;

    clearFade();
    audio.src = TRACKS[trackName];
    audio.currentTime = 0;
    audio.volume = 0;
    audio.play().catch(() => {});
    if (!muted) fadeInToFull();
  };

  /**
   * ミュート状態を設定する。
   * @param {boolean} nextMuted
   */
  const setMuted = (nextMuted) => {
    muted = nextMuted;
    clearFade();
    if (muted) {
      audio.volume = 0;
    } else if (currentTrack !== null) {
      fadeInToFull();
    }
  };

  const stop = () => {
    clearFade();
    audio.pause();
    currentTrack = null;
  };

  // アプリがバックグラウンドに回った際（iOSアプリでホームに戻る／他アプリに切り替える等）に
  // BGMが鳴り続けないよう一時停止し、フォアグラウンドに戻ったら再開する。Capacitorの
  // WKWebViewでも`visibilitychange`はアプリのバックグラウンド/フォアグラウンド遷移で
  // 発火するため、追加の依存（`@capacitor/app`等）なしにこの標準APIだけで対応できる。
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      audio.pause();
      return;
    }
    if (currentTrack !== null) audio.play().catch(() => {});
  });

  return { play, setMuted, stop };
};
