/**
 * 盤面（`Int8Array`）とFirestoreに保存可能な表現（プレーンな数値配列）を
 * 相互変換する純粋関数。Firestoreの配列フィールドは型付き配列を保存できないため
 * （[online-multiplayer](../../.claude/skills/online-multiplayer/SKILL.md)参照）。
 */

/**
 * 盤面をFirestoreに保存できるプレーンな数値配列に変換する。
 * @param {Int8Array} board - 現在の盤面状態
 * @returns {number[]} `index_of`順のプレーンな数値配列
 */
export const serializeBoard = (board) => Array.from(board);

/**
 * Firestoreから読み取ったプレーンな数値配列を、盤面ロジックが期待する
 * `Int8Array` に変換する。
 * @param {number[]} array - Firestoreから読み取った数値配列
 * @returns {Int8Array} 盤面状態
 */
export const deserializeBoard = (array) => Int8Array.from(array);
