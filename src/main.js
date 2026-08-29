import { createSceneManager } from './render/scene-manager.js';
import { createCameraControls } from './render/camera-controls.js';

const canvas = document.getElementById('board-canvas');
const sceneManager = createSceneManager(canvas);
const cameraControls = createCameraControls(sceneManager.camera, canvas);

sceneManager.start(() => cameraControls.update());
