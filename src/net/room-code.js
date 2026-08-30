/**
 * ルームコードの生成・検証。Firebase等への依存を持たない純粋関数のみを置く
 * （[online-multiplayer](../../.claude/skills/online-multiplayer/SKILL.md)参照）。
 */

/** ルームコードの文字数。 */
export const ROOM_CODE_LENGTH = 6;

/** ルームコードに使う文字集合。読み間違えやすい文字（`0`/`O`、`1`/`I`/`L`）を除く。 */
export const ROOM_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * 部屋を一意に識別する、他人と共有しやすいランダムなルームコードを生成する。
 * @returns {string} `ROOM_CODE_LENGTH`文字のルームコード（大文字英数字のみ）
 */
export const generateRoomCode = () => {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
};

/**
 * ルームコードを正規化する（大文字化）。ユーザー入力をFirestoreのドキュメントIDとして
 * 使う前に必ずこれを通す。
 * @param {string} code - 正規化対象の文字列
 * @returns {string} 大文字化されたルームコード
 */
export const normalizeRoomCode = (code) => code.toUpperCase();

/**
 * 文字列がルームコードとして妥当な書式かどうかを判定する。
 * 小文字での入力も許容し、正規化してから文字集合・文字数をチェックする。
 * @param {unknown} code - 検証対象の値
 * @returns {boolean} 書式が妥当なら`true`
 */
export const isValidRoomCode = (code) => {
  if (typeof code !== 'string') return false;

  const normalized = normalizeRoomCode(code);
  if (normalized.length !== ROOM_CODE_LENGTH) return false;

  return [...normalized].every((char) => ROOM_CODE_ALPHABET.includes(char));
};
