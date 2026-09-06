/**
 * プレイヤープロフィール（`players/{uid}`）の読み書き。Firestoreへの実際の
 * 読み書きを行う非同期I/O層（[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
 * 自動テスト対象外（[testing](../../.claude/rules/common/testing.md)の方針）。
 *
 * スコア・対局数は盤面サイズ（4×4×4／6×6×6／8×8×8）ごとに独立管理する
 * （`ratings`マップの盤面サイズをキーとしたエントリ）。名前はプレイヤーの
 * 識別情報のため盤面サイズ間で共有する。
 */

import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { DEFAULT_SCORE, createInitialRatingsByBoardSize } from './rating.js';
import { ensureSignedIn, getFirestoreInstance } from './firebase-init.js';

const PLAYERS_COLLECTION = 'players';

const playerRef = (uid) => doc(getFirestoreInstance(), PLAYERS_COLLECTION, uid);

/**
 * 指定したuid・盤面サイズのプレイヤープロフィールを取得する。プロフィール自体が
 * 未作成の場合は`null`を返す。プロフィールは存在するが、その盤面サイズでまだ
 * 対局したことがない（`ratings`に該当エントリがない）場合は初期値扱いにする。
 * 認証は不要（`players`コレクションは誰でも読める設計のため）。対戦相手の
 * プロフィール表示（マッチング成立時の対戦カード等）に使う。
 * @param {string} uid - 取得したいプレイヤーのuid
 * @param {number} boardSize - スコア・対局数を取得したい盤面サイズ
 * @returns {Promise<{ uid: string, name: string, score: number, gamesPlayed: number } | null>}
 */
export const getPlayerProfile = async (uid, boardSize) => {
  const snapshot = await getDoc(playerRef(uid));
  if (!snapshot.exists()) return null;

  const data = snapshot.data();
  const rating = data.ratings?.[boardSize] ?? { score: DEFAULT_SCORE, gamesPlayed: 0 };
  return { uid, name: data.name, score: rating.score, gamesPlayed: rating.gamesPlayed };
};

/**
 * 自分のプレイヤープロフィールを取得する。まだ作成していなければ`null`を返す。
 * @param {number} boardSize - スコア・対局数を取得したい盤面サイズ
 * @returns {Promise<{ uid: string, name: string, score: number, gamesPlayed: number } | null>}
 */
export const getMyPlayerProfile = async (boardSize) => {
  const uid = await ensureSignedIn();
  return getPlayerProfile(uid, boardSize);
};

/**
 * プレイヤープロフィールを新規作成する（初回のみ）。対応する全盤面サイズ分の
 * スコア・対局数を初期値で用意する（名前は盤面サイズ間で共有するため1つのみ）。
 * @param {string} name - プレイヤーネーム（1〜20文字、重複・フィルタリングなし）
 * @returns {Promise<void>}
 */
export const createPlayerProfile = async (name) => {
  const uid = await ensureSignedIn();
  await setDoc(playerRef(uid), {
    name,
    ratings: createInitialRatingsByBoardSize(),
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
