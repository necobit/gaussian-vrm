// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GVRM } from '../../gvrm-format/gvrm.js';
import { FPSCounter } from '../fps.js';

// Available avatars
const availableAvatars = [
  { name: 'sample1', path: '../../assets/sample1.gvrm', video: '../../assets/sample1.mp4' },
  { name: 'sample2', path: '../../assets/sample2.gvrm', video: '../../assets/sample2.mp4' },
  { name: 'sample3', path: '../../assets/sample3.gvrm', video: '../../assets/sample3.mp4' },
  { name: 'sample4', path: '../../assets/sample4.gvrm', video: '../../assets/sample4.mp4' },
  { name: 'sample5', path: '../../assets/sample5.gvrm', video: '../../assets/sample5.mp4' },
  { name: 'sample6', path: '../../assets/sample6.gvrm', video: '../../assets/sample6.mp4' },
  { name: 'sample7', path: '../../assets/sample7.gvrm', video: '../../assets/sample7.mp4' },
  { name: 'sample8', path: '../../assets/sample8.gvrm', video: '../../assets/sample8.mp4' },
  { name: 'sample9', path: '../../assets/sample9.gvrm', video: '../../assets/sample9.mp4' },
  { name: 'necobut', path: '../../samples/necobut.gvrm', video: '../../assets/sample1.mp4' },
  { name: 'goroman', path: '../../samples/goroman.gvrm', video: '../../assets/sample1.mp4' },
];

// Animation paths
const animations = {
  idle: '../../assets/Idle.fbx',
  singing: '../../assets/Singing.fbx',
  guitar: '../../assets/Guitar Playing.fbx',
  bass: '../../assets/Guitar Playing.fbx', // Using same as guitar for now
  drum: '../../assets/Playing Drums.fbx'
};

// Selected avatars for each part
const selectedAvatars = {
  vocal: null,
  guitar: null,
  bass: null,
  drum: null
};

// GVRM instances
const avatarInstances = {
  vocal: null,
  guitar: null,
  bass: null,
  drum: null
};

// Avatar positions on stage
const avatarPositions = {
  vocal: { x: 0, y: 0, z: 0 },
  guitar: { x: -2, y: 0, z: -1 },
  bass: { x: 2, y: 0, z: -1 },
  drum: { x: 0, y: 0, z: -2.5 }
};

// Visibility state
const avatarVisibility = {
  vocal: true,
  guitar: false,
  bass: false,
  drum: false
};

// Last MIDI input time for each avatar (for timeout)
const lastMidiTime = {
  guitar: null,
  bass: null,
  drum: null
};

// Timeout duration (1 second)
const MIDI_TIMEOUT = 1000;

// Vocal animation state
let vocalIsSinging = false;

// MIDI sync effects for each instrument
const syncEffects = {
  guitar: null,
  bass: null,
  drum: null
};

// BLE MIDI Handler
class BandStageMidiHandler {
  constructor() {
    this.midiAccess = null;
    this.connectedInput = null;
    this.isConnected = false;
    this.onChannelCallback = null;
    this.onStatusChange = null;
  }

  async initialize() {
    if (!navigator.requestMIDIAccess) {
      const error = "Web MIDI API is not supported in this browser";
      console.error(error);
      this.updateStatus(error, false);
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      console.log("MIDI Access obtained");

      this.midiAccess.onstatechange = (e) => this.onMIDIStateChange(e);
      this.scanForDevice();
      return true;
    } catch (error) {
      console.error("Failed to get MIDI access:", error);
      this.updateStatus(`MIDI Error: ${error.message}`, false);
      return false;
    }
  }

  scanForDevice() {
    if (!this.midiAccess) return;

    for (let input of this.midiAccess.inputs.values()) {
      console.log(`Found MIDI device: ${input.name}`);
      if (input.name.includes("KANTAN-Play")) {
        this.connectToDevice(input);
        return;
      }
    }

    this.updateStatus(`Waiting for KANTAN-Play...`, false);
  }

  connectToDevice(input) {
    if (this.connectedInput) {
      this.connectedInput.onmidimessage = null;
    }

    this.connectedInput = input;
    this.connectedInput.onmidimessage = (message) => this.onMIDIMessage(message);
    this.isConnected = true;

    console.log(`Connected to ${input.name}`);
    this.updateStatus(`Connected to ${input.name}`, true);
  }

  onMIDIStateChange(event) {
    const port = event.port;
    console.log(`MIDI device ${port.name} ${port.state}`);

    if (port.type === "input" && port.name.includes("KANTAN-Play")) {
      if (port.state === "connected") {
        this.connectToDevice(port);
      } else if (port.state === "disconnected") {
        this.isConnected = false;
        this.connectedInput = null;
        this.updateStatus(`KANTAN-Play disconnected`, false);
      }
    }
  }

  onMIDIMessage(message) {
    const [status, note, velocity] = message.data;
    const messageType = status & 0xf0;
    const channel = status & 0x0f;

    // Note On
    if (messageType === 0x90 && velocity > 0) {
      console.log(`MIDI Note On: Ch${channel + 1}, Note ${note}, Vel ${velocity}`);

      if (this.onChannelCallback) {
        this.onChannelCallback(channel + 1, note, velocity);
      }
    }
  }

  setChannelCallback(callback) {
    this.onChannelCallback = callback;
  }

  setStatusCallback(callback) {
    this.onStatusChange = callback;
  }

  updateStatus(message, connected) {
    if (this.onStatusChange) {
      this.onStatusChange(message, connected);
    }
  }
}

// Instrument animation sync effect
class InstrumentSyncEffect {
  constructor(gvrm, totalFrames, steps, fps = 30, debounceMs = 50) {
    this.gvrm = gvrm;
    this.totalFrames = totalFrames;
    this.steps = steps;
    this.fps = fps;
    this.debounceMs = debounceMs; // Debounce time for chord input

    // Calculate target frames (0-indexed)
    this.targetFrames = [];
    for (let i = 0; i < steps; i++) {
      const frame = Math.round((totalFrames / steps) * i);
      this.targetFrames.push(frame);
    }

    this.currentTargetIndex = 0;
    this.lastTapTime = null;
    this.lastTriggerTime = null; // Last time onMidiTrigger was called
  }

  // Get frame count to next target
  getFramesToNextTarget() {
    const currentFrame = this.targetFrames[this.currentTargetIndex];
    const nextIndex = (this.currentTargetIndex + 1) % this.targetFrames.length;
    const nextFrame = this.targetFrames[nextIndex];

    // Handle wrap-around
    if (nextFrame < currentFrame) {
      return this.totalFrames - currentFrame + nextFrame;
    }
    return nextFrame - currentFrame;
  }

  // Called when MIDI note is received
  onMidiTrigger() {
    if (!this.gvrm || !this.gvrm.character || !this.gvrm.character.action) {
      console.warn('GVRM not ready for sync');
      return;
    }

    const now = performance.now();

    // Debounce: Ignore triggers within debounceMs (for chord input)
    if (this.lastTriggerTime !== null) {
      const timeSinceLastTrigger = now - this.lastTriggerTime;
      if (timeSinceLastTrigger < this.debounceMs) {
        console.log(`[Sync] Debounced: ${timeSinceLastTrigger.toFixed(1)}ms < ${this.debounceMs}ms`);
        return;
      }
    }

    // Update last trigger time
    this.lastTriggerTime = now;

    const action = this.gvrm.character.action;

    // Jump to current target frame
    const targetFrame = this.targetFrames[this.currentTargetIndex];
    const targetTime = targetFrame / this.fps;
    action.time = targetTime;

    console.log(
      `[Sync] Jumped to frame ${targetFrame} (${targetTime.toFixed(3)}s), step ${this.currentTargetIndex + 1}/${this.steps}`
    );

    // Adjust playback speed based on tap interval
    if (this.lastTapTime !== null) {
      const tapInterval = now - this.lastTapTime; // milliseconds
      const framesToNext = this.getFramesToNextTarget();
      const idealTime = (framesToNext / this.fps) * 1000; // milliseconds

      // Calculate timeScale to reach next target in one tap interval
      const timeScale = idealTime / tapInterval;
      const clampedTimeScale = Math.max(0.5, Math.min(2.0, timeScale));

      action.timeScale = clampedTimeScale;

      console.log(
        `[Sync] Tap interval: ${tapInterval.toFixed(0)}ms, ` +
        `frames to next: ${framesToNext}, ` +
        `ideal time: ${idealTime.toFixed(0)}ms, ` +
        `timeScale: ${clampedTimeScale.toFixed(3)}`
      );
    }

    // Update last tap time
    this.lastTapTime = now;

    // Move to next target
    this.currentTargetIndex = (this.currentTargetIndex + 1) % this.targetFrames.length;
  }

  reset() {
    this.currentTargetIndex = 0;
    this.lastTapTime = null;
    this.lastTriggerTime = null;
    if (this.gvrm && this.gvrm.character && this.gvrm.character.action) {
      this.gvrm.character.action.timeScale = 1.0;
    }
  }
}

// Scene setup
const container = document.getElementById('threejs-container');
const scene = new THREE.Scene();

// Camera
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.5, 5);

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
container.appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.update();

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(1, 2, 3);
scene.add(directionalLight);

// Stage background
const textureLoader = new THREE.TextureLoader();
const stageBackgroundUrl = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1920&q=80';
textureLoader.load(stageBackgroundUrl, (texture) => {
  scene.background = texture;
});

// FPS Counter
const fpsCounter = new FPSCounter();

// UI Elements
const vocalGrid = document.getElementById('vocal-grid');
const guitarGrid = document.getElementById('guitar-grid');
const bassGrid = document.getElementById('bass-grid');
const drumGrid = document.getElementById('drum-grid');
const startButton = document.getElementById('start-button');
const selectionModal = document.getElementById('selection-modal');

// Populate avatar grids
function populateGrid(gridElement, partName) {
  availableAvatars.forEach((avatar) => {
    const option = document.createElement('div');
    option.className = 'avatar-option';
    option.dataset.part = partName;
    option.dataset.avatar = avatar.name;

    const video = document.createElement('video');
    video.src = avatar.video;
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;

    const name = document.createElement('div');
    name.className = 'avatar-name';
    name.textContent = avatar.name;

    option.appendChild(video);
    option.appendChild(name);

    option.addEventListener('click', () => {
      // Deselect all options in this grid
      gridElement.querySelectorAll('.avatar-option').forEach(opt => {
        opt.classList.remove('selected');
      });

      // Select this option
      option.classList.add('selected');
      selectedAvatars[partName] = avatar;

      // Update start button
      updateStartButton();
    });

    gridElement.appendChild(option);
  });
}

function updateStartButton() {
  const allSelected = selectedAvatars.vocal && selectedAvatars.guitar &&
                      selectedAvatars.bass && selectedAvatars.drum;
  startButton.disabled = !allSelected;
}

populateGrid(vocalGrid, 'vocal');
populateGrid(guitarGrid, 'guitar');
populateGrid(bassGrid, 'bass');
populateGrid(drumGrid, 'drum');

// Animation state
let isAnimating = false;

// Start performance
startButton.addEventListener('click', async () => {
  selectionModal.classList.add('hidden');
  await loadAvatars();
  await initializeMIDI();

  if (!isAnimating) {
    isAnimating = true;
    animate();
  }
});

// Load avatars
async function loadAvatars() {
  console.log('Loading avatars...');

  // Update status display
  document.getElementById('vocal-name').textContent = selectedAvatars.vocal.name;
  document.getElementById('guitar-name').textContent = selectedAvatars.guitar.name;
  document.getElementById('bass-name').textContent = selectedAvatars.bass.name;
  document.getElementById('drum-name').textContent = selectedAvatars.drum.name;

  // Load Vocal (always visible)
  avatarInstances.vocal = new GVRM();
  await avatarInstances.vocal.load(selectedAvatars.vocal.path, scene, camera, renderer, 'vocal');
  await avatarInstances.vocal.changeFBX(animations.idle);
  avatarInstances.vocal.character.currentVrm.scene.position.set(
    avatarPositions.vocal.x,
    avatarPositions.vocal.y,
    avatarPositions.vocal.z
  );

  // Load Guitar
  avatarInstances.guitar = new GVRM();
  await avatarInstances.guitar.load(selectedAvatars.guitar.path, scene, camera, renderer, 'guitar');
  await avatarInstances.guitar.changeFBX(animations.guitar);
  avatarInstances.guitar.character.currentVrm.scene.position.set(
    avatarPositions.guitar.x,
    avatarPositions.guitar.y,
    avatarPositions.guitar.z
  );
  // Hide VRM and Gaussian Splat viewer
  avatarInstances.guitar.character.currentVrm.scene.visible = false;
  if (avatarInstances.guitar.gs && avatarInstances.guitar.gs.viewer) {
    avatarInstances.guitar.gs.viewer.visible = false;
  }

  // Load Bass
  avatarInstances.bass = new GVRM();
  await avatarInstances.bass.load(selectedAvatars.bass.path, scene, camera, renderer, 'bass');
  await avatarInstances.bass.changeFBX(animations.bass);
  avatarInstances.bass.character.currentVrm.scene.position.set(
    avatarPositions.bass.x,
    avatarPositions.bass.y,
    avatarPositions.bass.z
  );
  // Hide VRM and Gaussian Splat viewer
  avatarInstances.bass.character.currentVrm.scene.visible = false;
  if (avatarInstances.bass.gs && avatarInstances.bass.gs.viewer) {
    avatarInstances.bass.gs.viewer.visible = false;
  }

  // Load Drum
  avatarInstances.drum = new GVRM();
  await avatarInstances.drum.load(selectedAvatars.drum.path, scene, camera, renderer, 'drum');
  await avatarInstances.drum.changeFBX(animations.drum);
  avatarInstances.drum.character.currentVrm.scene.position.set(
    avatarPositions.drum.x,
    avatarPositions.drum.y,
    avatarPositions.drum.z
  );
  // Hide VRM and Gaussian Splat viewer
  avatarInstances.drum.character.currentVrm.scene.visible = false;
  if (avatarInstances.drum.gs && avatarInstances.drum.gs.viewer) {
    avatarInstances.drum.gs.viewer.visible = false;
  }

  // Create MIDI sync effects
  // Guitar: 143 frames, 16 steps
  syncEffects.guitar = new InstrumentSyncEffect(avatarInstances.guitar, 143, 16);
  // Bass: 143 frames, 16 steps
  syncEffects.bass = new InstrumentSyncEffect(avatarInstances.bass, 143, 16);
  // Drum: 141 frames, 16 steps
  syncEffects.drum = new InstrumentSyncEffect(avatarInstances.drum, 141, 16);

  console.log('All avatars loaded');
  console.log('MIDI sync effects initialized');
}

// Initialize MIDI
let midiHandler = null;

async function initializeMIDI() {
  midiHandler = new BandStageMidiHandler();

  midiHandler.setStatusCallback((message, connected) => {
    const statusEl = document.getElementById('midi-status');
    if (statusEl) {
      statusEl.textContent = message;
      statusEl.style.color = connected ? '#4CAF50' : '#888';
    }
  });

  midiHandler.setChannelCallback(async (channel, note, velocity) => {
    const now = performance.now();
    console.log(`[MIDI] Ch${channel} Note ${note} Vel ${velocity} at ${now.toFixed(0)}ms`);

    // Channel 1: Guitar
    if (channel === 1) {
      avatarVisibility.guitar = true;
      lastMidiTime.guitar = now;
      if (avatarInstances.guitar) {
        // Show VRM scene
        if (avatarInstances.guitar.character && avatarInstances.guitar.character.currentVrm) {
          avatarInstances.guitar.character.currentVrm.scene.visible = true;
        }
        // Show Gaussian Splat viewer
        if (avatarInstances.guitar.gs && avatarInstances.guitar.gs.viewer) {
          avatarInstances.guitar.gs.viewer.visible = true;
        }
        document.getElementById('guitar-indicator').classList.add('active');
      }
      // Trigger MIDI sync
      if (syncEffects.guitar) {
        syncEffects.guitar.onMidiTrigger();
      }
      console.log(`Guitar timer updated: ${now.toFixed(0)}ms`);
    }

    // Channel 4: Bass
    if (channel === 4) {
      avatarVisibility.bass = true;
      lastMidiTime.bass = now;
      if (avatarInstances.bass) {
        // Show VRM scene
        if (avatarInstances.bass.character && avatarInstances.bass.character.currentVrm) {
          avatarInstances.bass.character.currentVrm.scene.visible = true;
        }
        // Show Gaussian Splat viewer
        if (avatarInstances.bass.gs && avatarInstances.bass.gs.viewer) {
          avatarInstances.bass.gs.viewer.visible = true;
        }
        document.getElementById('bass-indicator').classList.add('active');
      }
      // Trigger MIDI sync
      if (syncEffects.bass) {
        syncEffects.bass.onMidiTrigger();
      }
      console.log(`Bass timer updated: ${now.toFixed(0)}ms`);
    }

    // Channel 10: Drum
    if (channel === 10) {
      avatarVisibility.drum = true;
      lastMidiTime.drum = now;
      if (avatarInstances.drum) {
        // Show VRM scene
        if (avatarInstances.drum.character && avatarInstances.drum.character.currentVrm) {
          avatarInstances.drum.character.currentVrm.scene.visible = true;
        }
        // Show Gaussian Splat viewer
        if (avatarInstances.drum.gs && avatarInstances.drum.gs.viewer) {
          avatarInstances.drum.gs.viewer.visible = true;
        }
        document.getElementById('drum-indicator').classList.add('active');
      }
      // Trigger MIDI sync
      if (syncEffects.drum) {
        syncEffects.drum.onMidiTrigger();
      }
      console.log(`Drum timer updated: ${now.toFixed(0)}ms`);
    }

    // If any instrument is playing, switch Vocal to Singing
    if ((channel === 1 || channel === 4 || channel === 10) && !vocalIsSinging) {
      vocalIsSinging = true;
      if (avatarInstances.vocal) {
        await avatarInstances.vocal.changeFBX(animations.singing);
        console.log('Vocal switched to Singing');
      }
    }
  });

  await midiHandler.initialize();
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Check MIDI timeout for non-vocal avatars
  const now = performance.now();

  // Guitar timeout check
  if (avatarVisibility.guitar && lastMidiTime.guitar !== null) {
    const elapsed = now - lastMidiTime.guitar;
    if (elapsed > MIDI_TIMEOUT) {
      avatarVisibility.guitar = false;
      if (avatarInstances.guitar) {
        // Hide VRM scene
        if (avatarInstances.guitar.character && avatarInstances.guitar.character.currentVrm) {
          avatarInstances.guitar.character.currentVrm.scene.visible = false;
        }
        // Hide Gaussian Splat viewer
        if (avatarInstances.guitar.gs && avatarInstances.guitar.gs.viewer) {
          avatarInstances.guitar.gs.viewer.visible = false;
        }
        document.getElementById('guitar-indicator').classList.remove('active');
        console.log(`Guitar hidden (timeout after ${elapsed.toFixed(0)}ms)`);
      }
      lastMidiTime.guitar = null; // Reset timer
    }
  }

  // Bass timeout check
  if (avatarVisibility.bass && lastMidiTime.bass !== null) {
    const elapsed = now - lastMidiTime.bass;
    if (elapsed > MIDI_TIMEOUT) {
      avatarVisibility.bass = false;
      if (avatarInstances.bass) {
        // Hide VRM scene
        if (avatarInstances.bass.character && avatarInstances.bass.character.currentVrm) {
          avatarInstances.bass.character.currentVrm.scene.visible = false;
        }
        // Hide Gaussian Splat viewer
        if (avatarInstances.bass.gs && avatarInstances.bass.gs.viewer) {
          avatarInstances.bass.gs.viewer.visible = false;
        }
        document.getElementById('bass-indicator').classList.remove('active');
        console.log(`Bass hidden (timeout after ${elapsed.toFixed(0)}ms)`);
      }
      lastMidiTime.bass = null; // Reset timer
    }
  }

  // Drum timeout check
  if (avatarVisibility.drum && lastMidiTime.drum !== null) {
    const elapsed = now - lastMidiTime.drum;
    if (elapsed > MIDI_TIMEOUT) {
      avatarVisibility.drum = false;
      if (avatarInstances.drum) {
        // Hide VRM scene
        if (avatarInstances.drum.character && avatarInstances.drum.character.currentVrm) {
          avatarInstances.drum.character.currentVrm.scene.visible = false;
        }
        // Hide Gaussian Splat viewer
        if (avatarInstances.drum.gs && avatarInstances.drum.gs.viewer) {
          avatarInstances.drum.gs.viewer.visible = false;
        }
        document.getElementById('drum-indicator').classList.remove('active');
        console.log(`Drum hidden (timeout after ${elapsed.toFixed(0)}ms)`);
      }
      lastMidiTime.drum = null; // Reset timer
    }
  }

  // If all instruments are hidden, switch Vocal back to Idle
  if (vocalIsSinging && !avatarVisibility.guitar && !avatarVisibility.bass && !avatarVisibility.drum) {
    vocalIsSinging = false;
    if (avatarInstances.vocal) {
      avatarInstances.vocal.changeFBX(animations.idle);
      console.log('Vocal switched back to Idle');
    }
  }

  // Update avatars
  if (avatarInstances.vocal) avatarInstances.vocal.update();
  if (avatarInstances.guitar && avatarVisibility.guitar) avatarInstances.guitar.update();
  if (avatarInstances.bass && avatarVisibility.bass) avatarInstances.bass.update();
  if (avatarInstances.drum && avatarVisibility.drum) avatarInstances.drum.update();

  // Update FPS
  const fpsdisplay = document.getElementById('fpsdisplay');
  if (fpsdisplay && fpsCounter) {
    const fps = fpsCounter.update();
    if (fps !== undefined && fps !== null) {
      fpsdisplay.textContent = fps.toFixed(0);
    }
  }

  controls.update();
  renderer.render(scene, camera);
}

// Camera presets
const cameraPresets = {
  stage: { position: { x: 0, y: 1.5, z: 5 }, target: { x: 0, y: 1, z: 0 } },
  vocal: { position: { x: 0, y: 1.6, z: 2 }, target: { x: 0, y: 1.4, z: 0 } },
  guitar: { position: { x: -2, y: 1.6, z: 1 }, target: { x: -2, y: 1.4, z: -1 } },
  bass: { position: { x: 2, y: 1.6, z: 1 }, target: { x: 2, y: 1.4, z: -1 } },
  drum: { position: { x: 0, y: 2, z: 0.5 }, target: { x: 0, y: 1.2, z: -2.5 } },
  side: { position: { x: -4, y: 1.5, z: 0 }, target: { x: 0, y: 1, z: -1 } },
  high: { position: { x: 0, y: 5, z: 3 }, target: { x: 0, y: 0, z: -1 } }
};

function setCameraPreset(presetName) {
  const preset = cameraPresets[presetName];
  if (!preset) return;

  camera.position.set(preset.position.x, preset.position.y, preset.position.z);
  controls.target.set(preset.target.x, preset.target.y, preset.target.z);
  controls.update();

  console.log(`Camera: ${presetName}`);
}

function setRandomCamera() {
  // Random position within visible range
  const x = (Math.random() - 0.5) * 10; // -5 to 5
  const y = 1 + Math.random() * 2.5; // 1 to 3.5
  const z = 2 + Math.random() * 4; // 2 to 6

  // Target center of stage with slight variation
  const targetX = (Math.random() - 0.5) * 2; // -1 to 1
  const targetY = 0.8 + Math.random() * 0.8; // 0.8 to 1.6
  const targetZ = -0.5 + (Math.random() - 0.5) * 1; // -1 to 0

  camera.position.set(x, y, z);
  controls.target.set(targetX, targetY, targetZ);
  controls.update();

  console.log(`Camera: Random (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`);
}

// Keyboard controls for camera
window.addEventListener('keydown', (event) => {
  switch(event.key) {
    case '1':
      setCameraPreset('stage');
      break;
    case '2':
      setCameraPreset('vocal');
      break;
    case '3':
      setCameraPreset('guitar');
      break;
    case '4':
      setCameraPreset('bass');
      break;
    case '5':
      setCameraPreset('drum');
      break;
    case '6':
      setCameraPreset('side');
      break;
    case '7':
      setCameraPreset('high');
      break;
    case 'r':
    case 'R':
      setRandomCamera();
      break;
  }
});

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
