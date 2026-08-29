import * as THREE from 'three';

const DEFAULT_STAR_COUNT = 2500;
/** 星をランダムに配置・再配置する球の半径。 */
const FIELD_RADIUS = 60;
/** ambientモードでの自転速度（ラジアン/秒、係数）。 */
const AMBIENT_ROTATION_SPEED = 0.03;
/** warpモードで星が中心から遠ざかる速度（ワールド単位/秒）。 */
const WARP_EXPANSION_SPEED = 22;

/**
 * 汎用スターフィールドを生成する。
 * `mode: 'ambient'` は星をゆっくり自転させるだけの落ち着いた見た目、
 * `mode: 'warp'` は各星が中心から外側へ移動し続け、外周に達したら中心に
 * 再配置される「宇宙空間を高速移動している」ような視覚効果になる。
 * @param {import('three').Scene} scene - 追加先のシーン
 * @param {{
 *   count?: number,
 *   color?: number,
 *   mode?: 'ambient' | 'warp',
 *   speed?: number,
 * }} [options]
 * @returns {{
 *   update: (deltaSeconds: number) => void,
 *   setTint: (color: number) => void,
 *   dispose: () => void,
 * }}
 */
export const createStarfield = (scene, options = {}) => {
  const { count = DEFAULT_STAR_COUNT, color = 0xffffff, mode = 'ambient', speed = 1 } = options;

  const positions = new Float32Array(count * 3);
  /** 各星の中心からの単位方向ベクトル（warpモードで使う。一度決めたら固定）。 */
  const directions = new Float32Array(count * 3);
  /** 各星の中心からの現在の距離。 */
  const radii = new Float32Array(count);

  const placeStar = (index, radius) => {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const dirX = Math.sin(phi) * Math.cos(theta);
    const dirY = Math.sin(phi) * Math.sin(theta);
    const dirZ = Math.cos(phi);

    const i3 = index * 3;
    directions[i3] = dirX;
    directions[i3 + 1] = dirY;
    directions[i3 + 2] = dirZ;
    radii[index] = radius;
    positions[i3] = dirX * radius;
    positions[i3 + 1] = dirY * radius;
    positions[i3 + 2] = dirZ * radius;
  };

  for (let i = 0; i < count; i++) {
    const initialRadius = mode === 'warp'
      ? Math.random() * FIELD_RADIUS
      : FIELD_RADIUS * (0.3 + Math.random() * 0.7);
    placeStar(i, initialRadius);
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  geometry.setAttribute('position', positionAttribute);

  const material = new THREE.PointsMaterial({
    color,
    size: mode === 'warp' ? 0.6 : 0.3,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
  });

  const points = new THREE.Points(geometry, material);
  scene.add(points);

  /**
   * 1フレーム分、星の位置を更新する。
   * @param {number} deltaSeconds - 前フレームからの経過秒数
   */
  const update = (deltaSeconds) => {
    if (mode === 'ambient') {
      points.rotation.y += deltaSeconds * AMBIENT_ROTATION_SPEED * speed;
      points.rotation.x += deltaSeconds * AMBIENT_ROTATION_SPEED * 0.4 * speed;
      return;
    }

    for (let i = 0; i < count; i++) {
      radii[i] += deltaSeconds * WARP_EXPANSION_SPEED * speed;
      if (radii[i] > FIELD_RADIUS) radii[i] = 0;

      const i3 = i * 3;
      positions[i3] = directions[i3] * radii[i];
      positions[i3 + 1] = directions[i3 + 1] * radii[i];
      positions[i3 + 2] = directions[i3 + 2] * radii[i];
    }
    positionAttribute.needsUpdate = true;
  };

  /**
   * 星の色調を変更する（対戦モードごとの色分けに使う）。
   * @param {number} nextColor - 新しい色
   */
  const setTint = (nextColor) => {
    material.color.set(nextColor);
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
    scene.remove(points);
  };

  return { update, setTint, dispose };
};
