/**
 * Firebaseプロジェクトの設定値。
 *
 * Firebase Web SDKの`apiKey`等はいわゆる「シークレット」ではなく、クライアント側の
 * コードに埋め込まれる前提の識別子であり、アクセス制御は`firestore.rules`が担う
 * （Firebase公式ドキュメント: "It's generally not necessary to restrict API keys
 * for Firebase"）。そのためこのファイルは`.gitignore`せず、実際の値をそのまま
 * コミットしてよい。
 *
 * Firebaseプロジェクト「3dosero」（プロジェクトID: dosero）のWebアプリ「3dosero-web」の
 * 設定値（[online-multiplayer](../../.claude/skills/online-multiplayer/SKILL.md)参照）。
 */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBS0YwhmQ0lLa0zh5tJlmzqzrR8zLUx6Yg',
  authDomain: 'dosero.firebaseapp.com',
  projectId: 'dosero',
  storageBucket: 'dosero.firebasestorage.app',
  messagingSenderId: '135203429895',
  appId: '1:135203429895:web:ab5b3a2aab007efc0e94a2',
};

/**
 * `FIREBASE_CONFIG`が実際の値に置き換えられているかどうかを判定する。
 * プレースホルダーのままオンライン対戦機能を使おうとした場合に、UI側が
 * わかりやすいメッセージを出すために使う。
 * @returns {boolean} 設定済みなら`true`
 */
export const isFirebaseConfigured = () => FIREBASE_CONFIG.apiKey !== 'REPLACE_ME';
