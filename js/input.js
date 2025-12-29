import { clamp, normalize } from './entities.js';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.joystick = { active: false, id: null, startX: 0, startY: 0, x: 0, y: 0 };
    this.thrower = { active: false, id: null, startX: 0, startY: 0, x: 0, y: 0 };
    this.throwReleased = null;
    this.quickThrowRequested = false;
    this.targetThrowRequested = null;
    this.runToggleRequested = false;
    this.debugToggleRequested = false;
    this.cameraDebugRequested = false;
    this.snapRequested = false;
    this.sprintRequested = false;
    this.keys = new Set();

    canvas.addEventListener('pointerdown', (event) => this.onPointerDown(event));
    canvas.addEventListener('pointermove', (event) => this.onPointerMove(event));
    canvas.addEventListener('pointerup', (event) => this.onPointerUp(event));
    canvas.addEventListener('pointercancel', (event) => this.onPointerUp(event));

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
    window.addEventListener('keyup', (event) => this.onKeyUp(event));
  }

  onPointerDown(event) {
    this.canvas.setPointerCapture(event.pointerId);
    const rect = this.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const isLeft = x < rect.width * 0.5;

    if (isLeft && !this.joystick.active) {
      this.joystick = { active: true, id: event.pointerId, startX: x, startY: y, x, y };
    } else if (!this.thrower.active) {
      this.thrower = { active: true, id: event.pointerId, startX: x, startY: y, x, y };
    }
  }

  onPointerMove(event) {
    if (this.joystick.active && event.pointerId === this.joystick.id) {
      const rect = this.canvas.getBoundingClientRect();
      this.joystick.x = event.clientX - rect.left;
      this.joystick.y = event.clientY - rect.top;
    }

    if (this.thrower.active && event.pointerId === this.thrower.id) {
      const rect = this.canvas.getBoundingClientRect();
      this.thrower.x = event.clientX - rect.left;
      this.thrower.y = event.clientY - rect.top;
    }
  }

  onPointerUp(event) {
    if (this.joystick.active && event.pointerId === this.joystick.id) {
      this.joystick.active = false;
    }

    if (this.thrower.active && event.pointerId === this.thrower.id) {
      const rect = this.canvas.getBoundingClientRect();
      const endX = event.clientX - rect.left;
      const endY = event.clientY - rect.top;
      this.throwReleased = {
        startX: this.thrower.startX,
        startY: this.thrower.startY,
        endX,
        endY,
      };
      this.thrower.active = false;
    }
  }

  onKeyDown(event) {
    this.keys.add(event.code);
    if (event.code === 'Space') {
      this.snapRequested = true;
    }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight' || event.code === 'KeyE') {
      this.sprintRequested = true;
    }
    if (event.code === 'KeyF') {
      this.quickThrowRequested = true;
    }
    if (event.code === 'Digit1') this.targetThrowRequested = 'WR1';
    if (event.code === 'Digit2') this.targetThrowRequested = 'WR2';
    if (event.code === 'Digit3') this.targetThrowRequested = 'WR3';
    if (event.code === 'Digit4') this.targetThrowRequested = 'TE';
    if (event.code === 'Digit5') this.targetThrowRequested = 'RB';
    if (event.code === 'KeyR') this.runToggleRequested = true;
    if (event.code === 'KeyD') this.debugToggleRequested = true;
    if (event.code === 'KeyC') this.cameraDebugRequested = true;
  }

  onKeyUp(event) {
    this.keys.delete(event.code);
  }

  getMovement() {
    let x = 0;
    let y = 0;

    if (this.joystick.active) {
      const dx = this.joystick.x - this.joystick.startX;
      const dy = this.joystick.y - this.joystick.startY;
      const clamped = clamp(Math.sqrt(dx * dx + dy * dy), 0, 40);
      const dir = normalize(dx, dy);
      x = dir.x * (clamped / 40);
      y = dir.y * (clamped / 40);
      return { x, y };
    }

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;

    const norm = normalize(x, y);
    return { x: norm.x, y: norm.y };
  }

  consumeThrow() {
    const data = this.throwReleased;
    this.throwReleased = null;
    if (!data) return null;
    const dx = data.endX - data.startX;
    const dy = data.endY - data.startY;
    const distance = clamp(Math.sqrt(dx * dx + dy * dy), 0, 120);
    const dir = normalize(dx, dy);
    return {
      dir,
      power: distance / 120,
    };
  }

  consumeQuickThrow() {
    const wasRequested = this.quickThrowRequested;
    this.quickThrowRequested = false;
    return wasRequested;
  }

  consumeTargetThrow() {
    const target = this.targetThrowRequested;
    this.targetThrowRequested = null;
    return target;
  }

  consumeRunToggle() {
    const wasRequested = this.runToggleRequested;
    this.runToggleRequested = false;
    return wasRequested;
  }

  consumeDebugToggle() {
    const wasRequested = this.debugToggleRequested;
    this.debugToggleRequested = false;
    return wasRequested;
  }

  consumeCameraDebugToggle() {
    const wasRequested = this.cameraDebugRequested;
    this.cameraDebugRequested = false;
    return wasRequested;
  }

  consumeSnap() {
    const wasRequested = this.snapRequested;
    this.snapRequested = false;
    return wasRequested;
  }

  consumeSprint() {
    const wasRequested = this.sprintRequested;
    this.sprintRequested = false;
    return wasRequested;
  }
}
