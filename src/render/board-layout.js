import { BOARD_SIZE } from '../logic/board.js';

/** 1マスの一辺のワールド座標上のサイズ。 */
export const CELL_SIZE = 1;
/** 層(layer)間のワールド座標上の間隔。マス目より広く取り、層を視覚的に分離する。 */
export const LAYER_GAP = 1.6;
/**
 * 各層の板の厚み。遷移金属ダイカルコゲナイドのような層状結晶構造の標本箱的な
 * 美しさを狙い、層を紙のような厚み0ではなく実際に厚みのある板として描画する。
 * `LAYER_GAP` より十分小さくし、層間に明確な隙間（van der Waals gap相当）を残す。
 */
export const LAYER_THICKNESS = 0.4;

/**
 * ロジック側の3D座標（`x, y ∈ [0,boardSize)` は同一平面、`z ∈ [0,boardSize)` は層）を
 * Three.jsのワールド座標に変換する。ロジックの `z`（層）は描画上の縦方向 `y` に、
 * ロジックの `y` は描画上の奥行き方向 `z` に対応する。このモジュールが
 * 唯一の変換ロジックであり、`src/render/` 配下の他モジュールは必ずここを経由する
 * （座標変換を重複実装しない）。返る `y` は層の板の中心の高さ（石はここを基準に
 * 板の中に埋まるように配置され、結晶構造ビューアの原子のような見た目になる）。
 * @param {number} x - ロジック側のx座標
 * @param {number} y - ロジック側のy座標
 * @param {number} z - ロジック側のz座標（層）
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {{x: number, y: number, z: number}} ワールド座標
 */
export const logicToWorld = (x, y, z, boardSize = BOARD_SIZE) => {
  const centerOffset = (boardSize - 1) / 2;
  return {
    x: (x - centerOffset) * CELL_SIZE,
    y: (z - centerOffset) * LAYER_GAP,
    z: (y - centerOffset) * CELL_SIZE,
  };
};

/**
 * 層`z`の板の「上面」のワールド座標上の高さを返す。グリッド線やハイライトなど、
 * 板の表面に乗せて描画したい要素はこの値を基準にする。
 * @param {number} z - ロジック側のz座標（層）
 * @param {number} [boardSize] - 盤面サイズ（省略時は `BOARD_SIZE`）
 * @returns {number} 層の板の上面のワールドy座標
 */
export const getLayerSurfaceY = (z, boardSize = BOARD_SIZE) =>
  logicToWorld(0, 0, z, boardSize).y + LAYER_THICKNESS / 2;
