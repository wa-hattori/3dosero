/**
 * Firebaseプロジェクトの設定値。
 *
 * Firebase Web SDKの`apiKey`等はいわゆる「シークレット」ではなく、クライアント側の
 * コードに埋め込まれる前提の識別子であり、アクセス制御は`firestore.rules`が担う
 * （Firebase公式ドキュメント: "It's generally not necessary to restrict API keys
 * for Firebase"）。そのためこのファイルは`.gitignore`せず、実際の値をそのまま
 * コミットしてよい。
 *
 * 現時点ではFirebaseプロジェクトが未作成のためプレースホルダー値になっている。
 * Firebaseコンソール（https://console.firebase.google.com/）でプロジェクトを作成し、
 * Web用アプリを登録すると表示される設定値でこのオブジェクトを置き換える
 * （[online-multiplayer](../../.claude/skills/online-multiplayer/SKILL.md)参照）。
 */
export const FIREBASE_CONFIG = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.firebasestorage.app',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

/**
 * `FIREBASE_CONFIG`が実際の値に置き換えられているかどうかを判定する。
 * プレースホルダーのままオンライン対戦機能を使おうとした場合に、UI側が
 * わかりやすいメッセージを出すために使う。
 * @returns {boolean} 設定済みなら`true`
 */
export const isFirebaseConfigured = () => FIREBASE_CONFIG.apiKey !== 'REPLACE_ME';
