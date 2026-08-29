import { createSceneManager } from './render/scene-manager.js';
import { createCameraControls } from './render/camera-controls.js';
import { createBoardView } from './render/board-view.js';

const canvas = document.getElementById('board-canvas');
const sceneManager = createSceneManager(canvas);
const cameraControls = createCameraControls(sceneManager.camera, canvas);
createBoardView(sceneManager.scene);

sceneManager.start(() => cameraControls.update());
