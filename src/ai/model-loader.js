import * as ort from 'onnxruntime-web';

/** `data/models/{boardSize}/level{level}.onnx` の配置規約に合わせたベースパス。 */
const MODEL_BASE_PATH = 'data/models';

/**
 * `training/export_onnx.py` が固定するONNXモデルの入出力名の契約。
 * ブラウザ推論仕様の正本: [gan-cpu-self-play](../../.claude/skills/gan-cpu-self-play/SKILL.md)
 */
const POLICY_OUTPUT_NAME = 'policy_logits';
const VALUE_OUTPUT_NAME = 'value';

// ビルド設定なしの静的ホスティングではCross-Origin-Opener-Policy/Cross-Origin-Embedder-Policy
// ヘッダを付与できず、マルチスレッドWASM実行に必要なSharedArrayBufferが使えない環境がある。
// 環境差でスレッド起動に失敗しないよう、常にシングルスレッド実行に固定する。
ort.env.wasm.numThreads = 1;

/** `(boardSize, level)` の組み合わせごとにロード済みセッションをメモ化するキャッシュ。 */
const sessionCache = new Map();

const buildModelUrl = (boardSize, level) => `${MODEL_BASE_PATH}/${boardSize}/level${level}.onnx`;

/**
 * ONNXモデルをロードし、`ort.InferenceSession` を直接扱わずに済む薄いラッパーを生成する。
 * このラッパーの `run` だけが `onnxruntime-web` に依存する非同期I/O層であり、
 * `src/ai/gan-cpu.js` はこれをダックタイピングでモック可能な形で呼び出すだけにすることで、
 * 純粋なロジック部分をNode標準テスト（`node --test`、ブラウザ・onnxruntime-web不要）で
 * ユニットテスト可能に保つ。
 * @param {number} boardSize - 盤面サイズ
 * @param {number} level - GAN CPUのレベル（2〜5。レベル1は`chooseRandomMove`を使うため対象外）
 * @returns {Promise<{
 *   run: (inputData: Float32Array) => Promise<{ policyLogits: Float32Array, value: number }>,
 * }>}
 */
const createSession = async (boardSize, level) => {
  const inferenceSession = await ort.InferenceSession.create(buildModelUrl(boardSize, level), {
    executionProviders: ['wasm'],
  });
  const inputName = inferenceSession.inputNames[0];

  return {
    run: async (inputData) => {
      const dims = [1, 2, boardSize, boardSize, boardSize];
      const inputTensor = new ort.Tensor('float32', inputData, dims);
      const results = await inferenceSession.run({ [inputName]: inputTensor });
      return {
        policyLogits: results[POLICY_OUTPUT_NAME].data,
        value: results[VALUE_OUTPUT_NAME].data[0],
      };
    },
  };
};

/**
 * `(boardSize, level)` に対応するGAN CPUモデルのセッションをロードし、メモ化する。
 * 同じ組み合わせで2回目以降に呼ばれた場合は再ロードせず、キャッシュ済みのセッション
 * （ロード中であれば同じPromise）を返す。ロードに失敗した場合はキャッシュから外し、
 * 次回呼び出しで再試行できるようにする。
 * @param {number} boardSize - 盤面サイズ
 * @param {number} level - GAN CPUのレベル（2〜5）
 * @returns {Promise<{ run: (inputData: Float32Array) => Promise<{ policyLogits: Float32Array, value: number }> }>}
 */
export const loadModelSession = (boardSize, level) => {
  const key = `${boardSize}:${level}`;
  if (!sessionCache.has(key)) {
    const sessionPromise = createSession(boardSize, level).catch((error) => {
      sessionCache.delete(key);
      throw error;
    });
    sessionCache.set(key, sessionPromise);
  }

  return sessionCache.get(key);
};
