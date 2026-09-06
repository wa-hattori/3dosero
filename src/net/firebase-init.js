/**
 * Firebase App/Firestore/Authの初期化。CDN経由のESモジュール（`index.html`の
 * importmap参照）を使い、ビルドツールなし方針を崩さない
 * （[online-multiplayer](../../.claude/skills/online-multiplayer/SKILL.md)参照）。
 *
 * 非同期I/O・Firebase SDKへの依存を持つため自動テスト対象外（[testing](../../.claude/rules/common/testing.md)の方針）。
 * `src/net/room-code.js`のような純粋関数側でロジックを検証する。
 *
 * **iOS（Capacitor）ネイティブシェル上では、デフォルト設定の`getAuth`/`getFirestore`が
 * 応答なくハングすることがある（TestFlight実機で実際に発生。ランダムマッチング・
 * プロフィール・ランキングのいずれも「読み込んでいます…」のまま進まなくなった）。**
 * 原因は、iOSのWKWebViewがローカルアセットを`capacitor://`という独自スキームで
 * 配信すること。Firebase Auth・Firestoreの内部実装は`http(s)://`相当の通常のWeb
 * オリジンを前提にした互換性チェック（Auth側はリダイレクトリゾルバ初期化時の
 * iframeベースのストレージ互換チェック、Firestore側はWebChannelのストリーミング
 * 接続）を行っており、独自スキーム上ではこれが正常に完了せず無期限にハングしうる
 * （Firebase JS SDK・Capacitorコミュニティ双方で広く報告されている既知の相性問題）。
 * Web版（`http(s)://`の通常オリジン）ではこの問題は再現しない。
 *
 * 対処として、iOSネイティブシェル上でのみ`initializeAuth`/`initializeFirestore`を
 * 明示的な設定で呼び、既定の初期化経路を回避する。
 * - Auth: `persistence`を明示指定することで、既定で付与される
 *   `browserPopupRedirectResolver`（上記iframe互換チェックの原因）の初期化を避ける。
 * - Firestore: `experimentalForceLongPolling`でWebChannelのストリーミング接続を
 *   使わせず、長時間ポーリングに固定する。
 */

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  signInAnonymously,
} from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG } from './firebase-config.js';

let appInstance = null;
let firestoreInstance = null;
let authInstance = null;

const getApp = () => {
  if (!appInstance) {
    appInstance = initializeApp(FIREBASE_CONFIG);
  }
  return appInstance;
};

/**
 * iOSのCapacitorネイティブシェル上で実行されているかどうかを判定する。
 * `window.Capacitor`はネイティブシェル内でのみ自動的に注入されるグローバルなので、
 * Web版では常に`false`を返す。`src/ads/interstitial-ads.js`の同名の判定と実装は
 * 重複するが、`src/net/`を`src/ads/`に依存させたくない（両者は独立モジュールとして
 * 扱う方針）ため、あえて共有せずそれぞれで定義する。
 * @returns {boolean} iOSネイティブシェル上での実行なら`true`
 */
const isNativeIOS = () =>
  typeof window !== 'undefined' &&
  window.Capacitor?.isNativePlatform?.() === true &&
  window.Capacitor?.getPlatform?.() === 'ios';

/** @returns {import('firebase/firestore').Firestore} Firestoreインスタンス（1度だけ初期化し使い回す） */
export const getFirestoreInstance = () => {
  if (!firestoreInstance) {
    firestoreInstance = isNativeIOS()
      ? initializeFirestore(getApp(), { experimentalForceLongPolling: true })
      : getFirestore(getApp());
  }
  return firestoreInstance;
};

/** @returns {import('firebase/auth').Auth} Authインスタンス（1度だけ初期化し使い回す） */
export const getAuthInstance = () => {
  if (!authInstance) {
    authInstance = isNativeIOS()
      ? initializeAuth(getApp(), {
          persistence: [indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence],
        })
      : getAuth(getApp());
  }
  return authInstance;
};

/**
 * 匿名認証でサインインする（アカウント登録・個人情報の入力は不要）。
 * 既にサインイン済みならFirebase SDKが内部でセッションを再利用するため、
 * 呼び出し側は対局開始のたびに気にせず呼んでよい。
 * @returns {Promise<string>} このブラウザセッションを識別する`uid`
 */
export const ensureSignedIn = async () => {
  const auth = getAuthInstance();
  if (auth.currentUser) return auth.currentUser.uid;

  const credential = await signInAnonymously(auth);
  return credential.user.uid;
};
