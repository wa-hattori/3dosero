const COUNTDOWN_BEEP_SRC = encodeURI('data/決定ボタンを押す52.mp3');

let beepAudio = null;
let muted = false;

/**
 * 一手タイマーの残り5秒でのカウントダウン音を再生する。1つの`<audio>`要素を
 * 使い回し、連続する秒ごとの呼び出しでも毎回頭から鳴るよう`currentTime`を
 * 巻き戻す（`click-sound.js`と同じ方針）。ミュート中は何もしない。
 */
export const playCountdownBeep = () => {
  if (muted) return;

  if (beepAudio === null) {
    beepAudio = new Audio(COUNTDOWN_BEEP_SRC);
  }
  beepAudio.currentTime = 0;
  beepAudio.play().catch(() => {});
};

/**
 * カウントダウン音のミュート状態を設定する（BGM・クリック音のミュートと連動させる想定）。
 * @param {boolean} nextMuted
 */
export const setCountdownBeepMuted = (nextMuted) => {
  muted = nextMuted;
};
