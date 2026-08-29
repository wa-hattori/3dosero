import * as THREE from 'three';

/**
 * ハイライトされたマスへのクリックを検知し、対応するインスタンス番号を通知する。
 * ゲーム状態の更新（`src/logic/`）や再描画（`src/render/`）はここでは行わず、
 * `onSelect` コールバック経由で呼び出し側に委ねる
 * （UIイベント→ロジック→再描画の一方向フロー）。
 * @param {{
 *   domElement: HTMLElement,
 *   camera: import('three').Camera,
 *   highlightMesh: import('three').InstancedMesh,
 *   onSelect: (instanceIndex: number) => void,
 * }} params
 * @returns {{ dispose: () => void }}
 */
export const createInteraction = ({ domElement, camera, highlightMesh, onSelect }) => {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const handleClick = (event) => {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(pointer, camera);
    const [hit] = raycaster.intersectObject(highlightMesh);
    if (hit === undefined || hit.instanceId === undefined) return;

    onSelect(hit.instanceId);
  };

  domElement.addEventListener('click', handleClick);

  const dispose = () => {
    domElement.removeEventListener('click', handleClick);
  };

  return { dispose };
};
