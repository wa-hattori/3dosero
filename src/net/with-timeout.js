/**
 * `Promise`に一定時間でタイムアウトする振る舞いを付け加える純粋関数。Firebase
 * Auth/Firestoreの呼び出しがiOS実機で応答なくハングする既知の問題
 * （[firebase-init.js](./firebase-init.js)参照）が万一再発した場合に、
 * 無限ローディング表示のままにせず、既存のエラー表示経路（try/catch）に
 * 乗せて検知できるようにする。Firebase依存を持たないためNode標準テストで検証する。
 */

/**
 * `promise`が`timeoutMs`以内に解決/拒否しなければ、代わりに`timeoutMessage`を
 * messageに持つ`Error`で拒否する。
 * @param {Promise<T>} promise
 * @param {number} timeoutMs - タイムアウトまでのミリ秒
 * @param {string} timeoutMessage - タイムアウト時に投げる`Error`のmessage
 * @returns {Promise<T>}
 * @template T
 */
export const withTimeout = (promise, timeoutMs, timeoutMessage) =>
  Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ]);
