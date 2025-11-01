// Copyright (c) 2025 naruya
// Licensed under the MIT License. See LICENSE file in the project root for full license information.

export class BLEMidiHandler {
  constructor(targetDeviceName = "KANTAN-Play") {
    this.targetDeviceName = targetDeviceName;
    this.midiAccess = null;
    this.connectedInput = null;
    this.isConnected = false;
    this.onNoteCallback = null;

    // Status callback for UI updates
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

      // Listen for device connections/disconnections
      this.midiAccess.onstatechange = (e) => this.onMIDIStateChange(e);

      // Check for existing connections
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
      if (input.name.includes(this.targetDeviceName)) {
        this.connectToDevice(input);
        return;
      }
    }

    this.updateStatus(`Waiting for ${this.targetDeviceName}...`, false);
  }

  connectToDevice(input) {
    if (this.connectedInput) {
      this.connectedInput.onmidimessage = null;
    }

    this.connectedInput = input;
    this.connectedInput.onmidimessage = (message) =>
      this.onMIDIMessage(message);
    this.isConnected = true;

    console.log(`Connected to ${input.name}`);
    this.updateStatus(`Connected to ${input.name}`, true);
  }

  onMIDIStateChange(event) {
    const port = event.port;
    console.log(`MIDI device ${port.name} ${port.state}`);

    if (port.type === "input" && port.name.includes(this.targetDeviceName)) {
      if (port.state === "connected") {
        this.connectToDevice(port);
      } else if (port.state === "disconnected") {
        this.isConnected = false;
        this.connectedInput = null;
        this.updateStatus(`${this.targetDeviceName} disconnected`, false);
      }
    }
  }

  onMIDIMessage(message) {
    const [status, note, velocity] = message.data;

    // Extract message type and channel
    const messageType = status & 0xf0; // Upper 4 bits
    const channel = status & 0x0f; // Lower 4 bits (0-15)

    // Note On: 0x90, Channel 10 (index 9), Note 36
    if (messageType === 0x90 && channel === 9 && note === 36 && velocity > 0) {
      console.log(
        `MIDI Note On received: Ch${
          channel + 1
        }, Note ${note}, Velocity ${velocity}`
      );

      if (this.onNoteCallback) {
        this.onNoteCallback(channel, note, velocity);
      }
    }
  }

  // Set callback for Note 36 on Channel 10
  setNoteCallback(callback) {
    this.onNoteCallback = callback;
  }

  // Set callback for status updates
  setStatusCallback(callback) {
    this.onStatusChange = callback;
  }

  updateStatus(message, connected) {
    if (this.onStatusChange) {
      this.onStatusChange(message, connected);
    }
  }

  disconnect() {
    if (this.connectedInput) {
      this.connectedInput.onmidimessage = null;
      this.connectedInput = null;
    }
    this.isConnected = false;
  }
}

// Silly Dancing sync effect handler
export class SillyDancingSyncEffect {
  constructor(gvrm) {
    this.gvrm = gvrm;
    this.targetFrames = [11, 40, 70, 100]; // Target frames in Silly Dancing animation
    this.currentTargetIndex = 0;
    this.lastTapTime = null; // Last tap timestamp
    this.fps = 30; // Mixamo FPS
  }

  // Get frame count to next target
  getFramesToNextTarget() {
    const currentFrame = this.targetFrames[this.currentTargetIndex];
    const nextIndex = (this.currentTargetIndex + 1) % this.targetFrames.length;
    const nextFrame = this.targetFrames[nextIndex];

    // Handle wrap-around (100 -> 11)
    if (nextFrame < currentFrame) {
      // Assume animation loops at frame 115 (total frames in Silly Dancing)
      return 115 - currentFrame + nextFrame;
    }
    return nextFrame - currentFrame;
  }

  // Called when MIDI note is received
  onMidiTrigger(headScaleEffect = null) {
    if (!this.gvrm || !this.gvrm.character || !this.gvrm.character.action) {
      console.warn("GVRM not ready for Silly Dancing sync");
      return;
    }

    const action = this.gvrm.character.action;
    const now = performance.now();

    // Jump to current target frame
    const targetFrame = this.targetFrames[this.currentTargetIndex];
    const targetTime = targetFrame / this.fps;
    action.time = targetTime;

    console.log(
      `Jumped to frame ${targetFrame} (${targetTime.toFixed(3)}s), target ${
        this.currentTargetIndex + 1
      }/4`
    );

    // Trigger head scale effect if provided
    if (headScaleEffect) {
      headScaleEffect.shake();
    }

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
        `Tap interval: ${tapInterval.toFixed(0)}ms, ` +
          `frames to next: ${framesToNext}, ` +
          `ideal time: ${idealTime.toFixed(0)}ms, ` +
          `timeScale: ${clampedTimeScale.toFixed(3)}`
      );
    }

    // Update last tap time
    this.lastTapTime = now;

    // Move to next target (cycle back to start after frame 100)
    this.currentTargetIndex =
      (this.currentTargetIndex + 1) % this.targetFrames.length;
  }

  reset() {
    this.currentTargetIndex = 0;
    this.lastTapTime = null;
    if (this.gvrm && this.gvrm.character && this.gvrm.character.action) {
      this.gvrm.character.action.timeScale = 1.0;
    }
  }
}

// Avatar scale effect handler (head only)
export class AvatarShakeEffect {
  constructor(gvrm) {
    this.gvrm = gvrm;
    this.originalScale = null;
    this.isAnimating = false;
    this.animationFrameId = null;
  }

  // Scale the head: instantly to 200%, then shrink back to 100%
  shake() {
    if (!this.gvrm || !this.gvrm.character || !this.gvrm.character.currentVrm) {
      console.warn("GVRM not ready for head scale effect");
      return;
    }

    const humanoid = this.gvrm.character.currentVrm.humanoid;
    if (!humanoid) {
      console.warn("No humanoid found in VRM");
      return;
    }

    const headBone = humanoid.getRawBoneNode("head");
    if (!headBone) {
      console.warn("No head bone found in VRM");
      return;
    }

    if (this.isAnimating) {
      console.log("Already animating, ignoring new request");
      return;
    }

    // Store original scale
    this.originalScale = {
      x: headBone.scale.x,
      y: headBone.scale.y,
      z: headBone.scale.z,
    };

    // Target scale: 200%
    const targetScale = 2.0;

    // Apply scale instantly
    headBone.scale.set(targetScale, targetScale, targetScale);

    this.isAnimating = true;
    console.log(
      `Head scale effect: instantly scaled to ${targetScale * 100}%, holding for 30ms, then shrinking over 50ms`
    );

    // Hold the scaled state for 30ms, then animate back over 50ms
    const holdDuration = 30; // milliseconds to hold the scaled state
    const shrinkDuration = 50; // milliseconds to shrink back to original

    setTimeout(() => {
      if (!this.isAnimating) return;

      const startTime = performance.now();
      const startScale = targetScale;
      const endScale = 1.0;

      const animate = (currentTime) => {
        if (!this.isAnimating) return;

        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / shrinkDuration, 1.0); // 0.0 to 1.0

        // Linear interpolation from startScale to endScale
        const currentScale = startScale + (endScale - startScale) * progress;

        if (this.gvrm && this.gvrm.character && this.gvrm.character.currentVrm) {
          const humanoid = this.gvrm.character.currentVrm.humanoid;
          if (humanoid) {
            const headBone = humanoid.getRawBoneNode("head");
            if (headBone) {
              headBone.scale.set(currentScale, currentScale, currentScale);
            }
          }
        }

        if (progress < 1.0) {
          // Continue animation
          this.animationFrameId = requestAnimationFrame(animate);
        } else {
          // Animation complete
          this.returnToOriginal();
        }
      };

      this.animationFrameId = requestAnimationFrame(animate);
    }, holdDuration);
  }

  returnToOriginal() {
    if (
      !this.originalScale ||
      !this.gvrm ||
      !this.gvrm.character ||
      !this.gvrm.character.currentVrm
    ) {
      this.isAnimating = false;
      return;
    }

    const humanoid = this.gvrm.character.currentVrm.humanoid;
    if (humanoid) {
      const headBone = humanoid.getRawBoneNode("head");
      if (headBone) {
        // Restore original scale
        headBone.scale.set(
          this.originalScale.x,
          this.originalScale.y,
          this.originalScale.z
        );
      }
    }

    this.isAnimating = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    console.log("Head scale restored to original (100%)");
  }
}
