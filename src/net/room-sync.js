/**
 * ルームの作成・参加・着手の送信・購読。Firestoreへの実際の読み書きを行う
 * 非同期I/O層（[online-multiplayer](../../.claude/skills/online-multiplayer/SKILL.md)参照）。
 *
 * 盤面の適用・手番判定・終局判定は必ず`src/logic/`のものをそのまま使い、
 * ここでは再実装しない。自動テスト対象外（[testing](../../.claude/rules/common/testing.md)の方針）。
 * 純粋な部分（ルームコード・盤面のシリアライズ）は`room-code.js`/`board-serialization.js`で
 * 個別にテストする。
 *
 * `currentTurn`/`winner`/`lastMove.color`は、`src/logic/board.js`の`BLACK`/`WHITE`
 * 数値定数をそのままFirestoreに保存する（`'black'`/`'white'`文字列への変換は行わない。
 * アプリ内の他のどのモジュールとも同じ表現に統一するため）。`players.black`/
 * `players.white`はuidを保持するための固定のフィールド名であり、色の値とは別物。
 */

import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { BLACK, WHITE, createInitialBoard, oppositeColor, colorKey } from '../logic/board.js';
import { getNextTurn, getWinner } from '../logic/game-state.js';
import { isValidMove, applyMove } from '../logic/flip-rule.js';
import { deserializeBoard, serializeBoard } from './board-serialization.js';
import { ensureSignedIn, getFirestoreInstance } from './firebase-init.js';
import { generateRoomCode, normalizeRoomCode } from './room-code.js';
import { createInitialTimeBank, computeNextTimeBank } from './game-timer.js';

const ROOMS_COLLECTION = 'rooms';

/** 指定した部屋が見つからなかった場合に送出するエラー。 */
export class RoomNotFoundError extends Error {
  constructor(roomId) {
    super(`room not found: ${roomId}`);
    this.name = 'RoomNotFoundError';
  }
}

/** 満室・対局中などの理由で参加できない部屋に参加しようとした場合に送出するエラー。 */
export class RoomNotJoinableError extends Error {
  constructor(roomId) {
    super(`room is not joinable: ${roomId}`);
    this.name = 'RoomNotJoinableError';
  }
}

const roomRef = (roomId) => doc(getFirestoreInstance(), ROOMS_COLLECTION, roomId);

/**
 * Firestoreのドキュメントデータを、アプリ内部で扱いやすい形に変換する
 * （盤面をInt8Arrayに戻す）。
 * @param {string} roomId - ルームコード
 * @param {import('firebase/firestore').DocumentData} data - Firestoreのドキュメントデータ
 * @returns {object} 内部表現のルーム状態
 */
const toRoomState = (roomId, data) => ({
  roomId,
  boardSize: data.boardSize,
  board: deserializeBoard(data.board),
  players: data.players,
  currentTurn: data.currentTurn,
  status: data.status,
  winner: data.winner,
  lastMove: data.lastMove,
  // ランダムマッチング（レート戦）由来の部屋のみtrue。ルームコード制の部屋には
  // フィールド自体が無いため、ここで`?? false`にして呼び出し側の分岐を単純にする。
  ranked: data.ranked ?? false,
  // 一手タイマー・持ち時間（[online-match-timer](../../.claude/skills/online-match-timer/SKILL.md)参照）。
  // 対局開始前（ルームコード制で相手がまだいない）はどちらも無い状態がありうる。
  timeBank: data.timeBank ?? null,
  // Firestoreの`Timestamp`をそのままアプリ状態に持ち回さず、ここでミリ秒に変換する
  // （`Date.now()`との差分計算がそのまま使えるようにするため）。
  turnStartedAtMs: data.turnStartedAt ? data.turnStartedAt.toMillis() : null,
});

/**
 * 新しい部屋を作成し、自分を黒番として登録する。
 * @param {number} boardSize - 盤面サイズ
 * @returns {Promise<{ roomId: string, color: number }>} 作成した部屋のコードと自分の色（常に黒番）
 */
export const createRoom = async (boardSize) => {
  const uid = await ensureSignedIn();
  const roomId = generateRoomCode();

  await setDoc(roomRef(roomId), {
    boardSize,
    board: serializeBoard(createInitialBoard(boardSize)),
    players: { black: uid, white: null },
    currentTurn: BLACK,
    status: 'waiting',
    winner: null,
    lastMove: null,
    timeBank: createInitialTimeBank(),
    // 相手がまだいないため、対局が実際に始まる`joinRoom`の時点まで一手タイマーを
    // 動かし始めない（[online-match-timer](../../.claude/skills/online-match-timer/SKILL.md)参照）。
    turnStartedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { roomId, color: BLACK };
};

/**
 * ルームコードを指定して既存の部屋に白番として参加する。
 * @param {string} rawRoomId - ユーザーが入力したルームコード（大文字・小文字は問わない）
 * @returns {Promise<{ roomId: string, color: number }>} 参加した部屋のコードと自分の色（常に白番）
 * @throws {RoomNotFoundError} 該当する部屋が存在しない場合
 * @throws {RoomNotJoinableError} 既に満室・対局中の場合
 */
export const joinRoom = async (rawRoomId) => {
  const uid = await ensureSignedIn();
  const roomId = normalizeRoomCode(rawRoomId);

  const snapshot = await getDoc(roomRef(roomId));
  if (!snapshot.exists()) throw new RoomNotFoundError(roomId);
  if (snapshot.data().status !== 'waiting') throw new RoomNotJoinableError(roomId);

  await updateDoc(roomRef(roomId), {
    'players.white': uid,
    status: 'in_progress',
    // ここで対局が実際に始まるため、一手タイマーの起点をセットする。
    turnStartedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { roomId, color: WHITE };
};

/**
 * 自分の手番として着手し、盤面をFirestoreに反映する。反転判定・手番の
 * 決定・終局判定はすべて`src/logic/`のものをそのまま使う。
 * @param {object} params
 * @param {string} params.roomId - ルームコード
 * @param {Int8Array} params.board - 送信前の盤面状態（購読で得た最新状態を渡すこと）
 * @param {number} params.boardSize - 盤面サイズ
 * @param {number} params.color - 自分の色
 * @param {number} params.x
 * @param {number} params.y
 * @param {number} params.z
 * @param {{ black: number, white: number }} params.timeBank - 手番開始時点の持ち時間
 *   （購読で得た最新状態を渡すこと。[online-match-timer](../../.claude/skills/online-match-timer/SKILL.md)参照）
 * @param {number} params.elapsedMs - 手番が始まってから着手までにかかった時間（ミリ秒）
 * @returns {Promise<void>}
 * @throws {Error} 合法手でない場合（送信前にローカルで弾く。SKILL.mdの信頼境界の節を参照）
 */
export const submitMove = async ({ roomId, board, boardSize, color, x, y, z, timeBank, elapsedMs }) => {
  if (!isValidMove(board, x, y, z, color, boardSize)) {
    throw new Error(`illegal move: (${x}, ${y}, ${z})`);
  }

  const nextBoard = applyMove(board, x, y, z, color, boardSize);
  const nextTurnColor = getNextTurn(nextBoard, color, boardSize);
  const isOver = nextTurnColor === null;

  const myKey = colorKey(color);
  const nextTimeBank = { ...timeBank, [myKey]: computeNextTimeBank(timeBank[myKey], elapsedMs) };

  await updateDoc(roomRef(roomId), {
    board: serializeBoard(nextBoard),
    currentTurn: isOver ? color : nextTurnColor,
    status: isOver ? 'finished' : 'in_progress',
    winner: isOver ? getWinner(nextBoard) : null,
    lastMove: { x, y, z, color },
    timeBank: nextTimeBank,
    // 対局が続く場合は次の手番の一手タイマーの起点、終わった場合はもう不要なのでnull。
    turnStartedAt: isOver ? null : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/**
 * 部屋の対戦者（uid）だけを一度だけ取得する。ランダムマッチング成立直後に
 * 両者のプレイヤープロフィールを表示する対戦カード用の軽量な読み取りで、
 * 盤面全体を含む`subscribeToRoom`の購読は不要なため分けてある。
 * @param {string} roomId - ルームコード
 * @returns {Promise<{ players: { black: string, white: string | null } } | null>}
 */
export const getRoomSummary = async (roomId) => {
  const snapshot = await getDoc(roomRef(roomId));
  if (!snapshot.exists()) return null;
  return { players: snapshot.data().players };
};

/**
 * ランダムマッチングで成立した部屋の一手タイマーを実際に起動する。対戦カード画面
 * （vs-screen）を両者が見終えて対局画面に入る瞬間に呼ぶ想定
 * （[online-match-timer](../../.claude/skills/online-match-timer/SKILL.md)参照。
 * ルームコード制の部屋は`joinRoom`が対局開始と同時にセットするため、この関数は不要）。
 * まだセットされていない場合のみ一方向に遷移する。両クライアントがほぼ同時に
 * 呼んでも、先に届いた方だけが反映され、後続はルール上拒否される
 * （`submitTimeoutLoss`と同じ早い者勝ちのレース処理）。
 * @param {string} roomId - ルームコード
 * @returns {Promise<void>}
 */
export const startGameClock = async (roomId) => {
  try {
    await updateDoc(roomRef(roomId), { turnStartedAt: serverTimestamp() });
  } catch {
    // 相手クライアントが既に起動済みの場合、ルール上拒否される。無視してよい。
  }
};

/**
 * 部屋の状態変化をリアルタイムに購読する。
 * @param {string} roomId - ルームコード
 * @param {(roomState: object) => void} onChange - 部屋の状態が変わるたびに呼ばれるコールバック
 * @returns {() => void} 購読を止めるための関数
 */
export const subscribeToRoom = (roomId, onChange) =>
  onSnapshot(roomRef(roomId), (snapshot) => {
    if (!snapshot.exists()) return;
    onChange(toRoomState(roomId, snapshot.data()));
  });

/**
 * 対局を放棄する（「タイトルに戻る」等で進行中の対局から離脱する）。放棄した側を
 * 無条件で敗北、相手を無条件で勝利として即座に終局させる。手番に関わらずいつでも
 * 呼べる（`submitMove`とは異なり、相手の手番中の離脱にも対応する必要があるため）。
 * 盤面自体はそれ以上変更せず、離脱時点の状態のまま凍結する。
 * @param {object} params
 * @param {string} params.roomId - ルームコード
 * @param {number} params.myColor - 離脱する自分の色（この色が敗北になる）
 * @returns {Promise<void>}
 */
export const forfeitRoom = async ({ roomId, myColor }) => {
  await updateDoc(roomRef(roomId), {
    status: 'finished',
    winner: oppositeColor(myColor),
    updatedAt: serverTimestamp(),
  });
};

/**
 * 一手タイマー・持ち時間の時間切れによる無条件敗北を報告する
 * （[online-match-timer](../../.claude/skills/online-match-timer/SKILL.md)参照）。
 * 両クライアントがそれぞれローカルでタイムアウトを検知するため、参加者のどちらから
 * でも呼べる（自分自身のタイムアウトを自分で報告する場合も、相手のタイムアウトに
 * 気づいて報告する場合もある）。両者がほぼ同時に検知しても、先に届いた書き込みで
 * 部屋が`finished`になった時点で後続の書き込みはFirestoreルールにより自然に拒否
 * される。これは正常系（早い者勝ち）であり、エラーとして扱わない。
 * @param {object} params
 * @param {string} params.roomId - ルームコード
 * @param {number} params.timedOutColor - 時間切れになった側の色（この色が敗北になる）
 * @returns {Promise<void>}
 */
export const submitTimeoutLoss = async ({ roomId, timedOutColor }) => {
  try {
    await updateDoc(roomRef(roomId), {
      status: 'finished',
      winner: oppositeColor(timedOutColor),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // 相手クライアントが同じタイムアウトを先に検知して書き込み済みの場合、この更新は
    // ルール上拒否される（部屋が既にfinished）。早い者勝ちで結果は変わらないため
    // 無視してよい。
  }
};
