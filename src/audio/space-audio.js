/**
 * 宇宙的なアンビエントサウンドの音色プロファイル。作曲された「音楽」ではなく、
 * 複数のオシレーターとフィルターLFOによる持続音（ドローン）。
 * スタート画面用（穏やか）と対局画面用（やや緊張感のある変調）の2種類。
 */
const PROFILES = {
  start: { baseFrequency: 98, detuneCents: [-6, 0, 7], filterFrequency: 500, lfoRate: 0.05, gain: 0.14 },
  battle: { baseFrequency: 73, detuneCents: [-9, 0, 9, 14], filterFrequency: 700, lfoRate: 0.12, gain: 0.16 },
};

const FADE_IN_SECONDS = 2.5;
const FADE_OUT_SECONDS = 1.2;

/**
 * 1つの音色プロファイルからオシレーター群・フィルター・LFOを組み立てて再生する。
 * @param {AudioContext} audioContext
 * @param {{
 *   baseFrequency: number,
 *   detuneCents: number[],
 *   filterFrequency: number,
 *   lfoRate: number,
 *   gain: number,
 * }} profile
 * @returns {{ gainNode: GainNode, fadeIn: () => void, fadeOutAndStop: () => void }}
 */
const createDrone = (audioContext, profile) => {
  const { baseFrequency, detuneCents, filterFrequency, lfoRate, gain } = profile;

  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0;
  masterGain.connect(audioContext.destination);

  const filter = audioContext.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFrequency;
  filter.Q.value = 0.7;
  filter.connect(masterGain);

  const oscillators = detuneCents.map((cents) => {
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = baseFrequency;
    oscillator.detune.value = cents;
    oscillator.connect(filter);
    oscillator.start();
    return oscillator;
  });

  const lfo = audioContext.createOscillator();
  lfo.frequency.value = lfoRate;
  const lfoGain = audioContext.createGain();
  lfoGain.gain.value = filterFrequency * 0.4;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  lfo.start();

  const fadeIn = () => {
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(gain, now + FADE_IN_SECONDS);
  };

  const fadeOutAndStop = () => {
    const now = audioContext.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + FADE_OUT_SECONDS);
    setTimeout(() => {
      for (const oscillator of oscillators) oscillator.stop();
      lfo.stop();
    }, FADE_OUT_SECONDS * 1000 + 50);
  };

  return { gainNode: masterGain, fadeIn, fadeOutAndStop };
};

/**
 * Web Audio APIによる簡易的な宇宙アンビエントサウンドを管理する。
 * `AudioContext` はブラウザの自動再生ポリシー上、ユーザー操作（クリック等）に
 * 応答する形で `play()` が最初に呼ばれた時にのみ生成する。
 * @returns {{
 *   play: (profileName: 'start' | 'battle') => void,
 *   setMuted: (muted: boolean) => void,
 *   stop: () => void,
 * }}
 */
export const createSpaceAudio = () => {
  let audioContext = null;
  let currentDrone = null;
  let currentProfileName = null;
  let muted = false;

  const ensureContext = () => {
    if (audioContext === null) {
      const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === 'suspended') {
      // ユーザー操作に応答する形（呼び出し元の同期的な呼び出しスタック内）で
      // resume()を開始することが自動再生ポリシーの許可条件。完了を待つ必要はない。
      audioContext.resume().catch(() => {});
    }
    return audioContext;
  };

  /**
   * 指定したプロファイルの音を再生する。既に同じプロファイルを再生中なら何もしない。
   * @param {'start' | 'battle'} profileName
   */
  const play = (profileName) => {
    if (currentProfileName === profileName) return;

    const context = ensureContext();
    if (currentDrone !== null) currentDrone.fadeOutAndStop();

    currentDrone = createDrone(context, PROFILES[profileName]);
    currentProfileName = profileName;
    if (!muted) currentDrone.fadeIn();
  };

  /**
   * ミュート状態を設定する。
   * @param {boolean} nextMuted
   */
  const setMuted = (nextMuted) => {
    muted = nextMuted;
    if (currentDrone === null) return;

    if (muted) {
      // fadeIn()による将来へのlinearRampToValueAtTimeが予約済みの場合、
      // 単に.gain.valueへ代入するだけ（暗黙のsetValueAtTime）では
      // その予約を消せず、フェードインが完了する頃に音量が勝手に戻ってしまう。
      // cancelScheduledValuesで予約を破棄してから0を明示的に設定する。
      const now = audioContext.currentTime;
      currentDrone.gainNode.gain.cancelScheduledValues(now);
      currentDrone.gainNode.gain.setValueAtTime(0, now);
    } else {
      currentDrone.fadeIn();
    }
  };

  const stop = () => {
    if (currentDrone !== null) currentDrone.fadeOutAndStop();
    currentDrone = null;
    currentProfileName = null;
  };

  return { play, setMuted, stop };
};
