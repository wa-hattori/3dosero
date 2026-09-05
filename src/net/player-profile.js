/**
 * プレイヤープロフィール（`players/{uid}`）の読み書き。Firestoreへの実際の
 * 読み書きを行う非同期I/O層（[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
 * 自動テスト対象外（[testing](../../.claude/rules/common/testing.md)の方針）。
 */

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { DEFAULT_SCORE } from './rating.js';
import { ensureSignedIn, getFirestoreInstance } from './firebase-init.js';

const PLAYERS_COLLECTION = 'players';

const playerRef = (uid) => doc(getFirestoreInstance(), PLAYERS_COLLECTION, uid);

/**
 * 指定したuidのプレイヤープロフィールを取得する。存在しなければ`null`を返す。
 * 認証は不要（`players`コレクションは誰でも読める設計のため）。対戦相手の
 * プロフィール表示（マッチング成立時の対戦カード等）に使う。
 * @param {string} uid - 取得したいプレイヤーのuid
 * @returns {Promise<{ uid: string, name: string, score: number, gamesPlayed: number } | null>}
 */
export const getPlayerProfile = async (uid) => {
  const snapshot = await getDoc(playerRef(uid));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  return { uid, name: data.name, score: data.score, gamesPlayed: data.gamesPlayed };
};

/**
 * 自分のプレイヤープロフィールを取得する。まだ作成していなければ`null`を返す。
 * @returns {Promise<{ uid: string, name: string, score: number, gamesPlayed: number } | null>}
 */
export const getMyPlayerProfile = async () => {
  const uid = await ensureSignedIn();
  return getPlayerProfile(uid);
};

/**
 * プレイヤープロフィールを新規作成する（初回のみ）。スコア・対局数は初期値固定。
 * @param {string} name - プレイヤーネーム（1〜20文字、重複・フィルタリングなし）
 * @returns {Promise<void>}
 */
export const createPlayerProfile = async (name) => {
  const uid = await ensureSignedIn();
  await setDoc(playerRef(uid), {
    name,
    score: DEFAULT_SCORE,
    gamesPlayed: 0,
  });
};

/**
 * プレイヤーネームを変更する（スコア・対局数は変えない）。
 * @param {string} name - 新しいプレイヤーネーム
 * @returns {Promise<void>}
 */
export const updatePlayerName = async (name) => {
  const uid = await ensureSignedIn();
  await updateDoc(playerRef(uid), { name });
};
