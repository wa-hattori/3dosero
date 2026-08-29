const CLICK_SOUND_SRC = encodeURI('data/PC-Mouse06-1.mp3');

let clickAudio = null;
let muted = false;

/**
 * ボタンのクリック音を再生する。1つの`<audio>`要素を使い回し、連続クリックでも
 * 毎回頭から鳴るよう`currentTime`を巻き戻す。ミュート中は何もしない。
 */
export const playClickSound = () => {
  if (muted) return;

  if (clickAudio === null) {
    clickAudio = new Audio(CLICK_SOUND_SRC);
  }
  clickAudio.currentTime = 0;
  clickAudio.play().catch(() => {});
};

/**
 * クリック音のミュート状態を設定する（BGMのミュートと連動させる想定）。
 * @param {boolean} nextMuted
 */
export const setClickSoundMuted = (nextMuted) => {
  muted = nextMuted;
};
