/**
 * ランダムマッチング。Cloud Functions等のサーバー処理を使わず、クライアントの
 * `runTransaction`だけで「2人が同時に同じ相手を取り合う」競合を避ける
 * （[online-multiplayer](../../.claude/skills/online-multiplayer/SKILL.md)の
 * 「ランダムマッチングのフロー」節を正本とする。ここではそれをそのまま実装する）。
 *
 * 非同期I/O・Firebase SDKへの依存を持つため自動テスト対象外（[testing](../../.claude/rules/common/testing.md)の方針）。
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { BLACK, createInitialBoard } from '../logic/board.js';
import { serializeBoard } from './board-serialization.js';
import { ensureSignedIn, getFirestoreInstance } from './firebase-init.js';
import { generateRoomCode } from './room-code.js';
import { DEFAULT_SCORE } from './rating.js';
import { createInitialTimeBank } from './game-timer.js';

const QUEUE_COLLECTION = 'matchmakingQueue';
const ROOMS_COLLECTION = 'rooms';
const PLAYERS_COLLECTION = 'players';

/** 1回のマッチング試行で確認する待機中チケットの最大数。 */
const MAX_CANDIDATES = 5;

/**
 * 待機中の候補チケットを、トランザクション内で再確認してから奪い合いなく確保し、
 * 新しい部屋を作る。既に他クライアントに先を越されていた場合は`null`を返す
 * （呼び出し側は次の候補にフォールバックする）。
 * @param {object} params
 * @param {import('firebase/firestore').Firestore} params.db
 * @param {import('firebase/firestore').DocumentReference} params.candidateRef - 候補チケットの参照
 * @param {import('firebase/firestore').DocumentReference} params.myTicketRef - 自分のチケットの参照
 * @param {string} params.myUid - 自分のuid
 * @param {number} params.boardSize - 対戦する盤面サイズ
 * @returns {Promise<string | null>} マッチが成立した部屋のID。成立しなければ`null`
 */
const tryClaimCandidate = async ({ db, candidateRef, myTicketRef, myUid, boardSize }) =>
  runTransaction(db, async (transaction) => {
    const freshCandidate = await transaction.get(candidateRef);
    if (!freshCandidate.exists() || freshCandidate.data().status !== 'waiting') return null;
    const opponentUid = freshCandidate.data().uid;

    // レーティング戦（ランダムマッチングのみ対象）のため、マッチ成立時点の
    // 両者のスコアを部屋にスナップショットしておく（対局後のElo計算の基準値。
    // [ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
    // プロフィール未作成（万一の異常系）はDEFAULT_SCORE扱いにして、
    // マッチング自体は止めない。
    // Firestoreのトランザクション内では読み取りを順番に(並行にせず)行う必要がある。
    const myProfile = await transaction.get(doc(db, PLAYERS_COLLECTION, myUid));
    const opponentProfile = await transaction.get(doc(db, PLAYERS_COLLECTION, opponentUid));
    const myScore = myProfile.exists() ? myProfile.data().score : DEFAULT_SCORE;
    const opponentScore = opponentProfile.exists() ? opponentProfile.data().score : DEFAULT_SCORE;

    const roomId = generateRoomCode();
    transaction.set(doc(db, ROOMS_COLLECTION, roomId), {
      boardSize,
      board: serializeBoard(createInitialBoard(boardSize)),
      players: { black: opponentUid, white: myUid },
      currentTurn: BLACK,
      status: 'in_progress',
      winner: null,
      lastMove: null,
      ranked: true,
      ratingSnapshot: { black: opponentScore, white: myScore },
      settled: { black: false, white: false },
      timeBank: createInitialTimeBank(),
      // ここではまだセットしない。マッチ成立後、対戦カード画面（vs-screen）を
      // 両者が見終えて実際に対局画面に入るまでには数秒かかりうるため、ここで
      // serverTimestamp()を入れてしまうと黒番の最初の一手タイマーがその間に
      // 消費されてしまう。`startGameClock`が対戦カード画面の終了時点で改めて
      // セットする（[online-match-timer](../../.claude/skills/online-match-timer/SKILL.md)参照）。
      turnStartedAt: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    transaction.update(candidateRef, { status: 'matched', roomId });
    transaction.update(myTicketRef, { status: 'matched', roomId });
    return roomId;
  });

/**
 * ランダムマッチングを要求する。既に待機中の相手が見つかればその場でマッチし
 * 部屋を作る。見つからなければ自分のチケットを残して待機状態にする
 * （呼び出し側は`subscribeToTicket`でマッチ成立を待つ）。
 * @param {number} boardSize - 対戦したい盤面サイズ
 * @returns {Promise<{ ticketId: string, roomId: string | null }>}
 *   チケットID。`roomId`はその場でマッチできた場合のみ埋まる
 */
export const requestRandomMatch = async (boardSize) => {
  const uid = await ensureSignedIn();
  const db = getFirestoreInstance();

  const ticketRef = await addDoc(collection(db, QUEUE_COLLECTION), {
    boardSize,
    uid,
    status: 'waiting',
    roomId: null,
    createdAt: serverTimestamp(),
  });

  const candidatesQuery = query(
    collection(db, QUEUE_COLLECTION),
    where('boardSize', '==', boardSize),
    where('status', '==', 'waiting'),
    orderBy('createdAt', 'asc'),
    limit(MAX_CANDIDATES),
  );
  const candidatesSnapshot = await getDocs(candidatesQuery);
  const candidates = candidatesSnapshot.docs.filter((candidate) => candidate.id !== ticketRef.id);

  for (const candidate of candidates) {
    // 候補を1件ずつ、確保できるまで順番に試す(先頭から並行に試みる必要はない)。
    const roomId = await tryClaimCandidate({
      db,
      candidateRef: candidate.ref,
      myTicketRef: ticketRef,
      myUid: uid,
      boardSize,
    });
    if (roomId) return { ticketId: ticketRef.id, roomId };
  }

  return { ticketId: ticketRef.id, roomId: null };
};

/**
 * 自分のマッチングチケットの状態変化を購読する。他プレイヤーがマッチを
 * 成立させると`roomId`が埋まった状態でコールバックが呼ばれる。
 * @param {string} ticketId - `requestRandomMatch`が返したチケットID
 * @param {(ticket: { status: string, roomId: string | null }) => void} onChange
 * @returns {() => void} 購読を止めるための関数
 */
export const subscribeToTicket = (ticketId, onChange) => {
  const db = getFirestoreInstance();
  return onSnapshot(doc(db, QUEUE_COLLECTION, ticketId), (snapshot) => {
    if (!snapshot.exists()) return;
    const data = snapshot.data();
    onChange({ status: data.status, roomId: data.roomId });
  });
};

/**
 * ランダムマッチングを取り消す（マッチ成立前に、待機中の自分のチケットを削除する）。
 * @param {string} ticketId - 取り消すチケットのID
 * @returns {Promise<void>}
 */
export const cancelRandomMatch = async (ticketId) => {
  const db = getFirestoreInstance();
  await deleteDoc(doc(db, QUEUE_COLLECTION, ticketId));
};
