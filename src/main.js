import { createSceneManager } from './render/scene-manager.js';

const canvas = document.getElementById('board-canvas');
const sceneManager = createSceneManager(canvas);

sceneManager.start();
