/**
 * スコア上位者のランキング取得。Firestoreへの実際の読み書きを行う非同期I/O層
 * （[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
 * 自動テスト対象外（[testing](../../.claude/rules/common/testing.md)の方針）。
 */

import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { getFirestoreInstance } from './firebase-init.js';

const PLAYERS_COLLECTION = 'players';

/** ランキングに表示する人数の上限。 */
export const LEADERBOARD_SIZE = 100;

/**
 * スコア上位者を取得する。単一フィールドの並べ替えのみのため、複合インデックスは
 * 不要（Firestoreが単一フィールドインデックスを自動的に用意する）。表示は名前と
 * スコアのみのため、取得結果もその2つに絞る。
 * @returns {Promise<Array<{ name: string, score: number }>>}
 *   スコア降順。認証は不要（`players`コレクションは誰でも読める設計のため）。
 */
export const fetchLeaderboard = async () => {
  const db = getFirestoreInstance();
  const leaderboardQuery = query(
    collection(db, PLAYERS_COLLECTION),
    orderBy('score', 'desc'),
    limit(LEADERBOARD_SIZE),
  );
  const snapshot = await getDocs(leaderboardQuery);
  return snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();
    return { name: data.name, score: data.score };
  });
};
