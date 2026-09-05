/**
 * ランダムマッチング（レート戦）の対局結果をスコアに反映する。Firestoreへの
 * 実際の読み書きを行う非同期I/O層（[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)参照）。
 * 自動テスト対象外（[testing](../../.claude/rules/common/testing.md)の方針）。
 *
 * Elo計算そのものは`src/net/rating.js`の純粋関数を使い、ここでは再実装しない。
 */

import { doc, getDoc, increment, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { BLACK, WHITE, colorKey } from '../logic/board.js';
import { calculateEloDelta, MATCH_RESULT } from './rating.js';
import { getFallbackCpuNotionalRating } from './matchmaking-cpu-fallback.js';
import { getMyPlayerProfile } from './player-profile.js';
import { serializeBoard } from './board-serialization.js';
import { generateRoomCode } from './room-code.js';
import { ensureSignedIn, getFirestoreInstance } from './firebase-init.js';

const ROOMS_COLLECTION = 'rooms';
const PLAYERS_COLLECTION = 'players';

/**
 * 対局終了を検知したクライアントが、自分の分のスコア変動だけを精算する。
 * ルームコード制の対局（`ranked`でない部屋）・既に精算済みの場合は何もしない。
 * 相手のドキュメントには一切書き込まない（[ranked-matchmaking](../../.claude/skills/ranked-matchmaking/SKILL.md)の
 * 「不正防止の方針」参照）。
 * @param {object} params
 * @param {string} params.roomId - ルームコード
 * @param {number} params.myColor - 自分の色（`BLACK`/`WHITE`）
 * @param {number} params.myResult - `rating.js`の`MATCH_RESULT`のいずれか
 * @returns {Promise<{ beforeScore: number, afterScore: number, delta: number } | null>}
 *   実際に精算した場合のみスコア変動を返す（ルームコード制の対局・既に精算済みの
 *   場合は`null`。スコア変動画面〈score-change-screen.js〉の表示要否の判定に使う）
 */
export const settleRankedResult = async ({ roomId, myColor, myResult }) => {
  const db = getFirestoreInstance();
  const uid = await ensureSignedIn();
  const roomRef = doc(db, ROOMS_COLLECTION, roomId);

  const roomSnapshot = await getDoc(roomRef);
  if (!roomSnapshot.exists()) return null;
  const room = roomSnapshot.data();
  if (!room.ranked) return null;

  const myKey = colorKey(myColor);
  if (room.settled?.[myKey]) return null;

  const opponentKey = myKey === 'black' ? 'white' : 'black';
  const beforeScore = room.ratingSnapshot[myKey];
  const delta = calculateEloDelta(beforeScore, room.ratingSnapshot[opponentKey], myResult);

  const batch = writeBatch(db);
  batch.update(doc(db, PLAYERS_COLLECTION, uid), {
    score: increment(delta),
    gamesPlayed: increment(1),
    // セキュリティルールが「どの部屋の結果を根拠にした更新か」を検証するための
    // 参照(firestore.rulesの`isScoreSettlement`参照)。
    lastSettledRoomId: roomId,
  });
  batch.update(roomRef, { [`settled.${myKey}`]: true });
  await batch.commit();

  return { beforeScore, afterScore: beforeScore + delta, delta };
};

/**
 * ランダムマッチングが一定時間成立せずCPU代替対戦になった場合（[online-multiplayer](../../.claude/skills/online-multiplayer/SKILL.md)の
 * フォールバック）の結果を記録・精算する。実際の対局はローカルの`battleMode: 'cpu'`と
 * 同じ経路で完結する（Firestoreとの同期は不要）ため、対局が終わった時点で
 * 「既に終了した状態のレート戦の部屋」をFirestore上に直接作り、そのまま
 * `settleRankedResult`を呼んで精算する（対人戦のレート戦と同じ精算コード・
 * 同じFirestoreルールをそのまま再利用するため。自分は常に黒番として扱う。
 * どちらの色でCPUと対局したかは無関係で、この部屋はあくまで精算用の記録）。
 * @param {object} params
 * @param {number} params.boardSize
 * @param {Int8Array} params.board - 対局終了時点の盤面（記録用）
 * @param {number} params.cpuLevel - 対戦したCPUレベル
 * @param {number} params.myResult - `MATCH_RESULT`のいずれか
 * @returns {Promise<{ beforeScore: number, afterScore: number, delta: number } | null>}
 */
export const settleRankedCpuMatch = async ({ boardSize, board, cpuLevel, myResult }) => {
  const uid = await ensureSignedIn();
  const db = getFirestoreInstance();
  const profile = await getMyPlayerProfile();
  const roomId = generateRoomCode();
  const cpuNotionalRating = getFallbackCpuNotionalRating(cpuLevel);
  const winner = myResult === MATCH_RESULT.WIN ? BLACK : myResult === MATCH_RESULT.LOSS ? WHITE : null;

  await setDoc(doc(db, ROOMS_COLLECTION, roomId), {
    boardSize,
    board: serializeBoard(board),
    players: { black: uid, white: null },
    currentTurn: BLACK,
    status: 'finished',
    winner,
    lastMove: null,
    ranked: true,
    vsCpu: true,
    cpuLevel,
    ratingSnapshot: { black: profile.score, white: cpuNotionalRating },
    settled: { black: false, white: true },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return settleRankedResult({ roomId, myColor: BLACK, myResult });
};
