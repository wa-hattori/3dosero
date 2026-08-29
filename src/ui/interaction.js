import * as THREE from 'three';

/** タップとみなす最大移動量（px）。これを超えたら視点回転のドラッグとみなす。 */
const DRAG_THRESHOLD_PX = 8;
/** 2回のタップをダブルタップとみなす最大間隔（ms）。 */
const DOUBLE_TAP_MAX_INTERVAL_MS = 350;
/** 2回のタップをダブルタップとみなす最大距離（px）。 */
const DOUBLE_TAP_MAX_DISTANCE_PX = 24;

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * ハイライトされたマスへのダブルタップ/ダブルクリックを検知し、対応する
 * インスタンス番号を通知する。マウスの`dblclick`ではなく`pointerdown`/`pointerup`を
 * 自前で解釈することで、マウス・タッチ・ペンいずれでも同じロジックで動作する。
 * 視点操作（`OrbitControls`によるドラッグ回転）の際に誤って石が置かれてしまわないよう、
 * 移動量が `DRAG_THRESHOLD_PX` を超えたポインタ操作はタップとして扱わない。
 * ゲーム状態の更新（`src/logic/`）や再描画（`src/render/`）はここでは行わず、
 * コールバック経由で呼び出し側に委ねる（UIイベント→ロジック→再描画の一方向フロー）。
 * @param {{
 *   domElement: HTMLElement,
 *   camera: import('three').Camera,
 *   highlightMesh: import('three').InstancedMesh,
 *   onSelect: (instanceIndex: number) => void,
 *   onPendingChange?: (instanceIndex: number | null) => void,
 * }} params
 * @returns {{ dispose: () => void }}
 */
export const createInteraction = ({ domElement, camera, highlightMesh, onSelect, onPendingChange }) => {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  let pointerDownPosition = null;
  let lastTapTime = 0;
  let lastTapPosition = null;
  let pendingClearTimeoutId = null;

  const raycastInstanceAt = (clientX, clientY) => {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObject(highlightMesh);
    return hit?.instanceId;
  };

  const clearPendingTap = () => {
    if (pendingClearTimeoutId !== null) {
      clearTimeout(pendingClearTimeoutId);
      pendingClearTimeoutId = null;
    }
    lastTapTime = 0;
    lastTapPosition = null;
    onPendingChange?.(null);
  };

  const startPendingTap = (position, instanceIndex) => {
    lastTapTime = performance.now();
    lastTapPosition = position;
    onPendingChange?.(instanceIndex);

    if (pendingClearTimeoutId !== null) clearTimeout(pendingClearTimeoutId);
    pendingClearTimeoutId = setTimeout(clearPendingTap, DOUBLE_TAP_MAX_INTERVAL_MS);
  };

  const handlePointerDown = (event) => {
    pointerDownPosition = { x: event.clientX, y: event.clientY };
  };

  const handlePointerUp = (event) => {
    const upPosition = { x: event.clientX, y: event.clientY };
    const isTap =
      pointerDownPosition !== null && distance(pointerDownPosition, upPosition) <= DRAG_THRESHOLD_PX;
    pointerDownPosition = null;
    if (!isTap) return;

    const now = performance.now();
    const isDoubleTap =
      lastTapPosition !== null &&
      now - lastTapTime <= DOUBLE_TAP_MAX_INTERVAL_MS &&
      distance(lastTapPosition, upPosition) <= DOUBLE_TAP_MAX_DISTANCE_PX;

    if (isDoubleTap) {
      clearPendingTap();
      const instanceIndex = raycastInstanceAt(upPosition.x, upPosition.y);
      if (instanceIndex !== undefined) onSelect(instanceIndex);
      return;
    }

    const instanceIndex = raycastInstanceAt(upPosition.x, upPosition.y);
    if (instanceIndex === undefined) {
      clearPendingTap();
      return;
    }
    startPendingTap(upPosition, instanceIndex);
  };

  domElement.addEventListener('pointerdown', handlePointerDown);
  domElement.addEventListener('pointerup', handlePointerUp);

  const dispose = () => {
    domElement.removeEventListener('pointerdown', handlePointerDown);
    domElement.removeEventListener('pointerup', handlePointerUp);
    if (pendingClearTimeoutId !== null) clearTimeout(pendingClearTimeoutId);
  };

  return { dispose };
};
