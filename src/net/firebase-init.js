/**
 * Firebase App/Firestore/Authの初期化。CDN経由のESモジュール（`index.html`の
 * importmap参照）を使い、ビルドツールなし方針を崩さない
 * （[online-multiplayer](../../.claude/skills/online-multiplayer/SKILL.md)参照）。
 *
 * 非同期I/O・Firebase SDKへの依存を持つため自動テスト対象外（[testing](../../.claude/rules/common/testing.md)の方針）。
 * `src/net/room-code.js`のような純粋関数側でロジックを検証する。
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
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

/** @returns {import('firebase/firestore').Firestore} Firestoreインスタンス（1度だけ初期化し使い回す） */
export const getFirestoreInstance = () => {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(getApp());
  }
  return firestoreInstance;
};

/** @returns {import('firebase/auth').Auth} Authインスタンス（1度だけ初期化し使い回す） */
export const getAuthInstance = () => {
  if (!authInstance) {
    authInstance = getAuth(getApp());
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
