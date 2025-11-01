// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.


import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { preprocess } from './apps/preprocess/preprocess.js';
import { GVRM, GVRMUtils } from './gvrm-format/gvrm.js';
import { FPSCounter } from './apps/fps.js';
import { BLEMidiHandler, AvatarShakeEffect, SillyDancingSyncEffect } from './apps/ble-midi.js';
// import { setupVR } from './apps/vr.js';


// UI
const container = document.getElementById('threejs-container');
let width = window.innerWidth;
let height = window.innerHeight;


// params
const params = new URL(window.location.href).searchParams;
let gsPath = params.get('gs') ?? undefined;
let gvrmPath = params.get('gvrm') ?? undefined;
const vrmPath = "./assets/sotai.vrm";
const stage = params.get('stage');
const useVR = params.has('vr');
const useGPU = !params.has('cpu');
const noBG = params.has('nobg');
const noCheck = params.has('nocheck');
const savePly = params.has('saveply');
const size = params.get('size');
if (size) {
  const match = size.match(/([\d]+),([\d]+)/);
  width = parseInt(match[1]);
  height = parseInt(match[2]);
  document.body.style.backgroundColor = 'gray';
}
let gsFileName, fileName;


async function setupPathsFromUrlOrSelect() {
  const params = new URL(window.location.href).searchParams;
  gsPath = params.get('gs') ?? undefined;
  gvrmPath = params.get('gvrm') ?? undefined;

  if (!gsPath && !gvrmPath) {
    const selectContainer = document.getElementById('select-container');
    const selectBackground = document.getElementById('select-background');
    const selectButton = document.getElementById('select-button');
    const fileInput = document.getElementById('file-input');
    const title = document.getElementById('title');
    const selectSampleButton = document.getElementById('select-sample-button');
    const viewSampleAvatarsButton = document.getElementById('view-sample-avatars-button');
    const sampleItems = document.querySelectorAll('.sample-item');
    const gvrmItems = document.querySelectorAll('.gvrm-item');
    const twitterLink = document.getElementById('twitter-link');

    selectContainer.style.display = 'block';
    selectBackground.style.display = 'block';
    title.style.display = 'block';
    twitterLink.classList.add('visible');

    let selectedSample = null;
    let selectedGvrm = null;

    // サンプルアイテムのクリックハンドラ
    sampleItems.forEach(item => {
      item.addEventListener('click', () => {
        // GVRMの選択を解除
        gvrmItems.forEach(i => i.classList.remove('selected'));
        selectedGvrm = null;

        // 既存のサンプル選択を解除
        sampleItems.forEach(i => i.classList.remove('selected'));

        // 新しい選択を適用
        item.classList.add('selected');
        selectedSample = item.dataset.sample;
      });
    });

    // GVRMアイテムのクリックハンドラ
    gvrmItems.forEach(item => {
      item.addEventListener('click', () => {
        // サンプルの選択を解除
        sampleItems.forEach(i => i.classList.remove('selected'));
        selectedSample = null;

        // 既存のGVRM選択を解除
        gvrmItems.forEach(i => i.classList.remove('selected'));

        // 新しい選択を適用
        item.classList.add('selected');
        selectedGvrm = item.dataset.gvrm;
      });
    });

    const fileLoadPromise = new Promise((resolve) => {
      // View Sample Avatarsボタンのクリックハンドラ
      viewSampleAvatarsButton.addEventListener('click', () => {
        if (selectedGvrm) {
          // Check if it's necobut or goroman (from samples folder)
          if (selectedGvrm === 'necobut' || selectedGvrm === 'goroman') {
            gvrmPath = `./samples/${selectedGvrm}.gvrm`;
          } else {
            gvrmPath = `./assets/${selectedGvrm}.gvrm`;
          }

          selectContainer.style.display = 'none';
          selectBackground.style.display = 'none';
          title.style.display = 'none';

          resolve({ gsPath, gvrmPath });
        }
      });

      // 既存のファイル選択ハンドラ
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const extension = file.name.split('.').pop().toLowerCase();

          const reader = new FileReader();
          reader.onload = function (event) {
            const arrayBuffer = event.target.result;
            const blob = new Blob([arrayBuffer]);
            const objectUrl = URL.createObjectURL(blob);

            if (extension === 'ply') {
              gsPath = objectUrl;
              gsFileName = file.name;
            } else if (extension === 'gvrm') {
              gvrmPath = objectUrl;
            }

            selectContainer.style.display = 'none';
            selectBackground.style.display = 'none';
            title.style.display = 'none';
            resolve({ gsPath, gvrmPath });
          };
          reader.readAsArrayBuffer(file);
        }
      });

      // サンプル選択ボタンのクリックハンドラ
      selectSampleButton.addEventListener('click', () => {
        if (selectedSample) {
          console.log('Selected sample:', selectedSample);

          // All PLY samples are in assets folder
          gsPath = `./assets/${selectedSample}.ply`;
          gsFileName = `${selectedSample}.ply`;

          selectContainer.style.display = 'none';
          selectBackground.style.display = 'none';
          title.style.display = 'none';
          resolve({ gsPath, gvrmPath });
        }
      });

      // Visit Avatar Worldボタンのクリックハンドラ
      const sceneButton = document.getElementById('scene-button');
      if (sceneButton) {
        sceneButton.addEventListener('click', () => {
          window.location.href = './apps/avatarworld/index.html';
        });
      }
    });

    selectButton.addEventListener('click', () => fileInput.click());

    const result = await fileLoadPromise;
    return result;
  }
}

await setupPathsFromUrlOrSelect();


// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
container.appendChild(renderer.domElement);
renderer.setSize(width, height);
// renderer.setPixelRatio(window.devicePixelRatio);
// renderer.outputEncoding = THREE.sRGBEncoding || THREE.LinearSRGBColorSpace;


// camera
const camera = new THREE.PerspectiveCamera(65.0, width / height, 0.01, 2000.0);
camera.position.set(0.0, 0.8, 2.4);
camera.aspect = width / height;
camera.updateProjectionMatrix();


// custom camera controls (Orbit for rotate, Track for zoom)
const controls = new OrbitControls(camera, renderer.domElement);
controls.screenSpacePanning = true;
controls.target.set(0.0, 0.0, 0.0);
controls.minDistance = 0.1;
controls.maxDistance = 1000;
controls.enableDamping = true;
// controls.rotateSpeed = 0.5;
// controls.dampingFactor = 0.1;
controls.enableZoom = false;
controls.enablePan = false;
controls.update();

const controls2 = new TrackballControls(camera, renderer.domElement);
controls2.noRotate = true;
controls2.target.set(0.0, 0.0, 0.0);
controls2.noPan = false;
controls2.noZoom = false;
controls2.zoomSpeed = 0.25;
// controls2.dynamicDampingFactor = 0.1;
// controls2.dummyDampingFactor = 0.15;
// controls2.smoothFactor = 0.25;
controls2.useDummyMouseWheel = true;
controls2.update();


// scene
const scene = new THREE.Scene();

// Load live stage background image
const textureLoader = new THREE.TextureLoader();

// Stage background options (change the URL to switch backgrounds):
// Option 1: Purple/pink concert stage with dramatic lighting
const stageBackgroundUrl = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1920&q=80';
// Option 2: Blue stage lights and audience
// const stageBackgroundUrl = 'https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1920&q=80';
// Option 3: Red/orange concert atmosphere
// const stageBackgroundUrl = 'https://images.unsplash.com/photo-1506157786151-b8491531f063?w=1920&q=80';
// Option 4: Colorful light show
// const stageBackgroundUrl = 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1920&q=80';
// Option 5: Stage with crowd silhouettes
// const stageBackgroundUrl = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1920&q=80';
textureLoader.load(
  stageBackgroundUrl,
  (texture) => {
    scene.background = texture;
    console.log('Stage background loaded successfully');
  },
  undefined,
  (error) => {
    console.error('Failed to load stage background, using black:', error);
    scene.background = new THREE.Color(0x000000);
  }
);

// Fallback: black background until image loads
scene.background = new THREE.Color(0x000000);

const light = new THREE.DirectionalLight(0xffffff, Math.PI);
light.position.set(10.0, 10.0, 10.0);
scene.add(light);
// const axesHelper = new THREE.AxesHelper(1);
// scene.add(axesHelper);
// const gridHelper = new THREE.GridHelper(1000, 200, 0xdfdfdf, 0xdfefdf);
// scene.add(gridHelper);


// Avatar files list - all GVRM files
const avatarFiles = [
  { path: './assets/sample1.gvrm', type: 'gvrm', name: 'sample1' },
  { path: './assets/sample2.gvrm', type: 'gvrm', name: 'sample2' },
  { path: './assets/sample3.gvrm', type: 'gvrm', name: 'sample3' },
  { path: './assets/sample4.gvrm', type: 'gvrm', name: 'sample4' },
  { path: './assets/sample5.gvrm', type: 'gvrm', name: 'sample5' },
  { path: './assets/sample6.gvrm', type: 'gvrm', name: 'sample6' },
  { path: './assets/sample7.gvrm', type: 'gvrm', name: 'sample7' },
  { path: './assets/sample8.gvrm', type: 'gvrm', name: 'sample8' },
  { path: './assets/sample9.gvrm', type: 'gvrm', name: 'sample9' },
  { path: './samples/necobut.gvrm', type: 'gvrm', name: 'necobut' },
  { path: './samples/goroman.gvrm', type: 'gvrm', name: 'goroman' }
];

// Legacy gvrmFiles array for backward compatibility
const gvrmFiles = avatarFiles.map(f => f.path);

const fbxFiles = [
  './assets/Idle.fbx',
  './assets/Acknowledging.fbx',
  './assets/Around.fbx',
  './assets/Breathing.fbx',
  './assets/Chicken Dance.fbx',
  './assets/Dizzy Idle.fbx',
  './assets/Gangnam Style.fbx',
  './assets/Happy Idle.fbx',
  './assets/Jab Cross.fbx',
  './assets/Listening.fbx',
  './assets/Pointing.fbx',
  './assets/Shrugging.fbx',
  './assets/Silly Dancing.fbx',
  './assets/Warrior.fbx'
];

let currentGvrmIndex = 0;
let currentFbxIndex = 0;
let vrControllers = null;

let gvrm;
let stateAnim = "play";

// BLE MIDI
let bleMidiHandler = null;
let avatarShakeEffect = null;
let sillyDancingSyncEffect = null;

// Initialize BLE MIDI for all avatars
async function initializeBLEMidi() {
  if (!gvrm) {
    console.warn("GVRM not ready for BLE MIDI initialization");
    return;
  }

  console.log("Initializing BLE MIDI for avatar...");

  // Create BLE MIDI handler
  bleMidiHandler = new BLEMidiHandler("KANTAN-Play");
  avatarShakeEffect = new AvatarShakeEffect(gvrm);
  sillyDancingSyncEffect = new SillyDancingSyncEffect(gvrm);

  // Set up status callback
  bleMidiHandler.setStatusCallback((message, connected) => {
    console.log(`MIDI Status: ${message}`);
    const statusEl = document.getElementById('midi-status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.color = connected ? '#4CAF50' : '#888';
    }
  });

  // Set up note callback
  bleMidiHandler.setNoteCallback((channel, note, velocity) => {
    console.log(`MIDI trigger (Ch${channel + 1}, Note ${note}, Vel ${velocity})`);

    // Check if current animation is Silly Dancing
    const currentAnimationName = fbxFiles[currentFbxIndex];
    const isSillyDancing = currentAnimationName && currentAnimationName.includes('Silly Dancing');

    if (isSillyDancing) {
      console.log("Using Silly Dancing sync effect with head scale");
      sillyDancingSyncEffect.onMidiTrigger(avatarShakeEffect);
    } else {
      console.log("Using head scale effect");
      avatarShakeEffect.shake();
    }
  });

  // Initialize MIDI connection
  const success = await bleMidiHandler.initialize();
  if (success) {
    console.log("BLE MIDI initialized successfully");
  } else {
    console.error("Failed to initialize BLE MIDI");
  }
}

// Function to update status list
function updateStatusList() {
  const avatarListEl = document.getElementById('avatar-list');
  const animationListEl = document.getElementById('animation-list');

  // Update avatar list
  avatarListEl.innerHTML = '';
  avatarFiles.forEach((avatar, index) => {
    const item = document.createElement('div');
    item.className = 'status-item';
    if (index === currentGvrmIndex) {
      item.classList.add('active');
    }
    item.textContent = `${index + 1}. ${avatar.name}`;
    avatarListEl.appendChild(item);
  });

  // Update animation list
  animationListEl.innerHTML = '';
  fbxFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'status-item';
    if (index === currentFbxIndex) {
      item.classList.add('active');
    }
    const name = file.split('/').pop().replace('.fbx', '');
    item.textContent = `${index + 1}. ${name}`;
    animationListEl.appendChild(item);
  });
}

const fpsc = new FPSCounter();

// if (useVR) {
//   vrControllers = setupVR(renderer, container, scene, gvrm, gvrmFiles, fbxFiles, camera, fileName);
// }

// Mobile detection and UI setup
// Check User-Agent for mobile devices
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let panelsVisible = true;

function togglePanels() {
  panelsVisible = !panelsVisible;
  const modeButton = document.getElementById('mobile-mode-button');

  if (panelsVisible) {
    document.getElementById('command-list').style.display = 'block';
    document.getElementById('status-list').style.display = 'block';
    modeButton.textContent = 'Hide Panels';
  } else {
    document.getElementById('command-list').style.display = 'none';
    document.getElementById('status-list').style.display = 'none';
    modeButton.textContent = 'Show Panels';
  }
}

// Auto-hide panels on mobile devices
if (isMobile) {
  console.log('Mobile device detected');
  panelsVisible = false;
  document.getElementById('command-list').style.display = 'none';
  document.getElementById('status-list').style.display = 'none';
  document.getElementById('mobile-mode-button').textContent = 'Show Panels';
}

// Function to show control buttons after GVRM is loaded
function showControlButtons() {
  document.getElementById('bottom-left-buttons').style.display = 'flex';
  document.getElementById('mobile-controls').classList.add('visible');
}

// Toggle panels button handler
document.getElementById('mobile-mode-button').addEventListener('click', function() {
  togglePanels();
});

// Home button handler
document.getElementById('home-button').addEventListener('click', function() {
  location.reload();
});


if (gvrmPath) {
  if (!fileName) {
    fileName = gvrmPath;
  }

  // Set currentGvrmIndex based on loaded file
  const gvrmIndex = avatarFiles.findIndex(avatar => gvrmPath.includes(avatar.name));
  if (gvrmIndex !== -1) {
    currentGvrmIndex = gvrmIndex;
  }

  const promise2 = GVRM.load(gvrmPath, scene, camera, renderer, fileName);
  promise2.then((_gvrm) => {
    gvrm = _gvrm;
    window.gvrm = gvrm;
    gvrm.changeFBX('./assets/Idle.fbx');

    // Show command list and status list if panels are visible
    if (panelsVisible) {
      document.getElementById('command-list').style.display = 'block';
      document.getElementById('status-list').style.display = 'block';
    }
    updateStatusList();

    // Show control buttons
    showControlButtons();

    // Initialize BLE MIDI
    initializeBLEMidi();
  });
} else if (gsPath) {
  if (!gsFileName) {
    if (gsPath.endsWith('.ply')) {
      fileName = gsPath.split('/').pop().replace('.ply', '.gvrm');
    } else {
      fileName = gsPath.split('/').pop() + '.gvrm';
    }
  } else {
    fileName = gsFileName.split('/').pop().replace('.ply', '.gvrm');
  }

  // Set currentGvrmIndex based on loaded file
  const plyFileName = gsPath.split('/').pop().replace('.ply', '');
  const gvrmIndex = avatarFiles.findIndex(avatar => avatar.name === plyFileName);
  if (gvrmIndex !== -1) {
    currentGvrmIndex = gvrmIndex;
  }

  const promise1 = preprocess(vrmPath, gsPath, scene, camera, renderer, stage, useGPU, noBG, noCheck, fileName, savePly);
  // Non-interactive preprocessing completed
  promise1.then((result) => {
    gvrm = result.gvrm;
    window.gvrm = gvrm;
    const promise2 = result.promise2;

    // All preprocessing completed
    promise2.then(() => {
      gvrm.changeFBX('./assets/Idle.fbx');

      // Show command list and status list after preprocessing complete if panels are visible
      if (panelsVisible) {
        document.getElementById('command-list').style.display = 'block';
        document.getElementById('status-list').style.display = 'block';
      }
      updateStatusList();

      // Show control buttons
      showControlButtons();

      // Initialize BLE MIDI
      initializeBLEMidi();
    });
  });
}


window.addEventListener('resize', function (event) {
  if (size) return;
  width = window.innerWidth;
  height = window.innerHeight;
  // renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
});


window.addEventListener('dragover', function (event) {
  event.preventDefault();
});

window.addEventListener('drop', async function (event) {
  event.preventDefault();

  const files = event.dataTransfer.files;
  if (!files) return;

  const file = files[0];
  if (!file) return;

  const fileType = file.name.split('.').pop();
  const blob = new Blob([file], { type: 'application/octet-stream' });  // TODO: ?
  const url = URL.createObjectURL(blob);

  async function onDrop(fileType, url) {
    if (fileType === 'fbx') {
      await gvrm.changeFBX(url);
    }
  }

  await onDrop(fileType, url);
  stateAnim = "play";
});


window.addEventListener('keydown', function (event) {
  if (event.code === "Space") {
    if (stateAnim === "play") {
      gvrm.character.action.reset();
      gvrm.character.action.stop();
      stateAnim = "pause";
    } else {
      stateAnim = "play";
      if (gvrm.character.action) {
        gvrm.character.action.play();
      }
    }
  }
  if (event.code === "KeyV") {
    GVRMUtils.removePMC(scene, gvrm.pmc);
    gvrm.updatePMC();
    GVRMUtils.addPMC(scene, gvrm.pmc);
  }
  if (event.code === "KeyC") {
    GVRMUtils.visualizePMC(gvrm.pmc, null);
  }
  if (event.code === "KeyX") {
    GVRMUtils.visualizeVRM(gvrm.character, null);
  }
  if (event.code === "KeyZ") {
    GVRMUtils.visualizeBoneAxes(gvrm, null);
  }
});


window.addEventListener('keydown', async function (event) {
  if (event.code === "KeyG") {
    if (!gvrm || !gvrm.isReady || gvrm.character.isLoading()) return;
    currentGvrmIndex = (currentGvrmIndex + 1) % avatarFiles.length;
    updateStatusList();

    const currentAvatar = avatarFiles[currentGvrmIndex];
    await gvrm.remove(scene);

    // Disconnect current BLE MIDI before switching
    if (bleMidiHandler) {
      bleMidiHandler.disconnect();
    }

    // Load GVRM file
    console.log(`Loading GVRM file: ${currentAvatar.path}`);
    fileName = currentAvatar.path;

    await gvrm.load(currentAvatar.path, scene, camera, renderer, fileName);
    await gvrm.changeFBX(fbxFiles[currentFbxIndex]);

    // Reinitialize BLE MIDI
    await initializeBLEMidi();
  }
  if (event.code === "KeyA") {
    currentFbxIndex = (currentFbxIndex + 1) % fbxFiles.length;
    updateStatusList();
    await gvrm.changeFBX(fbxFiles[currentFbxIndex]);

    // Reset Silly Dancing sync when changing animation
    if (sillyDancingSyncEffect) {
      sillyDancingSyncEffect.reset();
    }
  }
});


window.addEventListener('keydown', async function (event) {
  if (event.code === "KeyP") {
    const enabled = !gvrm.gs.splatMesh.pointCloudModeEnabled;
    gvrm.gs.splatMesh.setPointCloudModeEnabled(enabled);
  }
});


// Mobile button handlers
document.getElementById('mobile-switch-avatar').addEventListener('click', async function () {
  if (!gvrm || !gvrm.isReady) return;
  currentGvrmIndex = (currentGvrmIndex + 1) % avatarFiles.length;
  updateStatusList();

  const currentAvatar = avatarFiles[currentGvrmIndex];
  await gvrm.remove(scene);

  // Disconnect current BLE MIDI before switching
  if (bleMidiHandler) {
    bleMidiHandler.disconnect();
  }

  // Load GVRM file
  console.log(`Loading GVRM file: ${currentAvatar.path}`);
  fileName = currentAvatar.path;

  await gvrm.load(currentAvatar.path, scene, camera, renderer, fileName);
  await gvrm.changeFBX(fbxFiles[currentFbxIndex]);

  // Reinitialize BLE MIDI
  await initializeBLEMidi();
});

document.getElementById('mobile-switch-animation').addEventListener('click', async function () {
  if (!gvrm) return;
  currentFbxIndex = (currentFbxIndex + 1) % fbxFiles.length;
  updateStatusList();
  await gvrm.changeFBX(fbxFiles[currentFbxIndex]);

  // Reset Silly Dancing sync when changing animation
  if (sillyDancingSyncEffect) {
    sillyDancingSyncEffect.reset();
  }
});


// main loop

function animate() {
  if (!gvrm) return;

  gvrm.update();

  controls.update();
  controls2.update();

  renderer.render(scene, camera);

  fpsc.update();
}


renderer.setAnimationLoop(animate);
