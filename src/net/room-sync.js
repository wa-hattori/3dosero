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
import { BLACK, WHITE, createInitialBoard, oppositeColor } from '../logic/board.js';
import { getNextTurn, getWinner } from '../logic/game-state.js';
import { isValidMove, applyMove } from '../logic/flip-rule.js';
import { deserializeBoard, serializeBoard } from './board-serialization.js';
import { ensureSignedIn, getFirestoreInstance } from './firebase-init.js';
import { generateRoomCode, normalizeRoomCode } from './room-code.js';

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
 * @returns {Promise<void>}
 * @throws {Error} 合法手でない場合（送信前にローカルで弾く。SKILL.mdの信頼境界の節を参照）
 */
export const submitMove = async ({ roomId, board, boardSize, color, x, y, z }) => {
  if (!isValidMove(board, x, y, z, color, boardSize)) {
    throw new Error(`illegal move: (${x}, ${y}, ${z})`);
  }

  const nextBoard = applyMove(board, x, y, z, color, boardSize);
  const nextTurnColor = getNextTurn(nextBoard, color, boardSize);
  const isOver = nextTurnColor === null;

  await updateDoc(roomRef(roomId), {
    board: serializeBoard(nextBoard),
    currentTurn: isOver ? color : nextTurnColor,
    status: isOver ? 'finished' : 'in_progress',
    winner: isOver ? getWinner(nextBoard) : null,
    lastMove: { x, y, z, color },
    updatedAt: serverTimestamp(),
  });
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
