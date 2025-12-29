import { Ball, Player, POSITION_STYLES, clamp, length, normalize } from './entities.js';
import { PLAYS } from './playbook.js';

const STATE = {
  PLAYCALL: 'PLAYCALL',
  PRE_SNAP: 'PRE_SNAP',
  PLAY_RUNNING: 'PLAY_RUNNING',
  PLAY_OVER: 'PLAY_OVER',
  DRIVE_OVER: 'DRIVE_OVER',
};

const FIELD_WIDTH = 1000;
const FIELD_HEIGHT = 3600;
const FIELD_TOP = 200;
const FIELD_BOTTOM = FIELD_TOP + FIELD_HEIGHT;
const FIELD_LEFT = 60;
const FIELD_RIGHT = FIELD_LEFT + FIELD_WIDTH;
const WORLD_WIDTH = FIELD_WIDTH;
const WORLD_HEIGHT = FIELD_HEIGHT;
const CAMERA_LERP = 0.12;
const CAMERA_ZOOM = 1.15;
const CAMERA_LOOKAHEAD = 60;

const DIGITS = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
};

const DEF_NUMBERS = {
  DL: ['90', '91', '92', '93', '94'],
  LB: ['50', '51', '52', '53', '54'],
  CB: ['21', '23', '25'],
  S: ['31', '33', '35'],
};

const RATINGS = {
  QB: { awareness: 78, speed: 70, throwPower: 82 },
  RB: { speed: 85, catch: 75, passBlock: 55 },
  WR: { speed: 88, catch: 80 },
  TE: { speed: 76, catch: 78, passBlock: 65 },
  OL: { passBlock: 75 },
  DL: { passRush: 78 },
  LB: { pursuit: 76, coverage: 72, passRush: 70 },
  CB: { pursuit: 80, coverage: 82 },
  S: { pursuit: 78, coverage: 80 },
};

export class Game {
  constructor(canvas, context, input, ui) {
    this.canvas = canvas;
    this.context = context;
    this.input = input;
    this.ui = ui;

    this.state = STATE.PLAYCALL;
    this.clock = 120;
    this.quarter = 1;
    this.score = 0;

    this.ballOn = 25;
    this.losYard = 25;
    this.down = 1;
    this.toGo = 10;

    this.offense = [];
    this.defense = [];
    this.receivers = [];
    this.blockers = [];
    this.rushers = [];

    this.qb = null;
    this.rb = null;
    this.controlled = null;
    this.ball = new Ball();
    this.playStartBallOn = this.ballOn;

    this.sprintTimer = 0;
    this.sprintCooldown = 0;

    this.messageTimer = 0;
    this.helperMessage = 'Pick a play to start the drive.';

    this.playTimer = 0;
    this.playTimers = { pressureDeadline: 0, sackDeadline: 0 };
    this.routePreviewTimer = 0;
    this.runSelected = false;
    this.intendedReceiver = null;

    this.camera = { x: FIELD_LEFT + FIELD_WIDTH / 2, y: FIELD_TOP + 100 };
    this.cameraLook = { x: 0, y: 1 };
    this.lastControlPos = { x: 0, y: 0 };

    this.debug = false;

    this.selectPlay(0);
    this.handleResize();
  }

  handleResize() {
    this.context.imageSmoothingEnabled = false;
  }

  resetDrive(message) {
    this.ballOn = 25;
    this.losYard = 25;
    this.down = 1;
    this.toGo = 10;
    this.state = STATE.PLAYCALL;
    this.helperMessage = message || 'New drive at the 25. Pick a play.';
  }

  requestSnap() {
    this.input.snapRequested = true;
  }

  requestSprint() {
    this.input.sprintRequested = true;
  }

  requestQuickThrow() {
    this.input.quickThrowRequested = true;
  }

  requestRunToggle() {
    this.input.runToggleRequested = true;
  }

  requestTargetThrow(role) {
    this.input.targetThrowRequested = role;
  }

  selectPlay(index) {
    this.currentPlay = PLAYS[index];
    if (this.state === STATE.PLAYCALL) {
      this.setupPlay();
      this.state = STATE.PRE_SNAP;
      this.helperMessage = 'Pick play then Snap. QB cannot move pre-snap.';
      this.routePreviewTimer = 1.6;
    }
  }

  setupPlay() {
    this.offense = [];
    this.defense = [];
    this.receivers = [];
    this.blockers = [];
    this.rushers = [];
    this.intendedReceiver = null;

    const losY = this.yardToWorldY(this.losYard);
    const centerX = FIELD_LEFT + FIELD_WIDTH / 2;

    this.spawnOffense(losY, centerX);
    this.spawnDefense(losY, centerX);
    this.assignRoutes();
    this.assignDefense();

    this.ball.inAir = false;
    this.ball.carrier = this.qb;
    this.qb.hasBall = true;
    this.playStartBallOn = this.ballOn;

    this.runSelected = this.currentPlay.type === 'run';
    this.controlled = this.qb;
    this.lastControlPos = { x: this.controlled.x, y: this.controlled.y };
    this.updateCamera(0);
  }

  spawnOffense(losY, centerX) {
    const formation = this.currentPlay.offenseFormation;
    const roles = ['QB', 'RB', 'TE', 'WR1', 'WR2', 'WR3', 'OL1', 'OL2', 'OL3', 'OL4', 'OL5'];

    roles.forEach((role) => {
      const offset = formation[role];
      if (!offset) return;
      const jitter = role === 'QB' ? { x: 0, y: 0 } : this.randomJitter();
      const player = this.createPlayer({
        role,
        team: 'offense',
        x: centerX + offset.x + jitter.x,
        y: losY + offset.y + jitter.y,
      });

      this.offense.push(player);
      if (role === 'QB') this.qb = player;
      if (role === 'RB') this.rb = player;
      if (role.startsWith('WR') || role === 'TE' || role === 'RB') this.receivers.push(player);
      if (role.startsWith('OL') || role === 'TE' || role === 'RB') this.blockers.push(player);
    });
  }

  spawnDefense(losY, centerX) {
    const formation = this.currentPlay.defenseFormation;
    const counts = { DL: 0, LB: 0, CB: 0, S: 0 };
    formation.forEach((spot) => {
      const jitter = this.randomJitter();
      const role = spot.role;
      const index = counts[role] || 0;
      counts[role] = index + 1;
      const player = this.createPlayer({
        role,
        team: 'defense',
        x: centerX + spot.x + jitter.x,
        y: losY + spot.y + jitter.y,
        number: DEF_NUMBERS[role] ? DEF_NUMBERS[role][index % DEF_NUMBERS[role].length] : '99',
      });
      player.zoneAnchor = { x: player.x, y: player.y };
      this.defense.push(player);
    });
  }

  assignRoutes() {
    const play = this.currentPlay;
    const routeMap = play.routes || {};

    this.offense.forEach((player) => {
      if (routeMap[player.role]) {
        const route = routeMap[player.role].map((waypoint) => ({
          x: player.x + waypoint.x,
          y: player.y + waypoint.y,
        }));
        player.setRoute(route);
      } else {
        player.setRoute([]);
      }
    });
  }

  assignDefense() {
    const style = this.currentPlay.defenseStyle;
    const eligible = this.receivers;

    this.defense.forEach((defender) => {
      defender.assignment = null;
      if (defender.role === 'DL') {
        defender.assignment = { type: 'rush' };
        this.rushers.push(defender);
        return;
      }

      if (style === 'man') {
        const target = this.pickManTarget(defender, eligible);
        defender.assignment = { type: 'man', target };
      } else if (style === 'zone') {
        defender.assignment = { type: 'zone', anchor: defender.zoneAnchor };
      } else if (style === 'blitz') {
        if (defender.role === 'LB' && Math.random() > 0.4) {
          defender.assignment = { type: 'rush' };
          this.rushers.push(defender);
        } else {
          defender.assignment = { type: 'zone', anchor: defender.zoneAnchor };
        }
      }
    });
  }

  pickManTarget(defender, eligible) {
    if (!eligible.length) return null;
    if (defender.role === 'CB') {
      return eligible.find((player) => player.role.startsWith('WR')) || eligible[0];
    }
    if (defender.role === 'S') {
      return eligible.find((player) => player.role === 'WR3') || eligible[0];
    }
    return eligible.find((player) => player.role === 'RB' || player.role === 'TE') || eligible[0];
  }

  createPlayer({ role, team, x, y, number }) {
    const style = POSITION_STYLES[role] || POSITION_STYLES.QB;
    const baseSpeed = team === 'offense' ? 180 : 170;
    const speed = role.startsWith('OL') ? 130 : baseSpeed;
    return new Player({
      x,
      y,
      team,
      speed,
      role,
      number: number || style.number,
      colors: { primary: style.primary, secondary: style.secondary },
      ratings: this.getRatingsForRole(role),
    });
  }

  getRatingsForRole(role) {
    if (role.startsWith('WR')) return RATINGS.WR;
    if (role.startsWith('OL')) return RATINGS.OL;
    if (role === 'DL') return RATINGS.DL;
    if (role === 'LB') return RATINGS.LB;
    if (role === 'CB') return RATINGS.CB;
    if (role === 'S') return RATINGS.S;
    if (role === 'RB') return RATINGS.RB;
    if (role === 'TE') return RATINGS.TE;
    return RATINGS.QB;
  }

  randomJitter() {
    const jitter = () => Math.floor(Math.random() * 5) - 2;
    return { x: jitter(), y: jitter() };
  }

  updateClock(dt) {
    if (this.state !== STATE.PLAY_RUNNING) return;
    this.clock = Math.max(0, this.clock - dt);
    if (this.clock === 0) {
      this.state = STATE.PLAY_OVER;
      this.helperMessage = 'Quarter ends. New play!';
      this.messageTimer = 2;
      this.advanceQuarter();
    }
  }

  advanceQuarter() {
    this.quarter = Math.min(4, this.quarter + 1);
    this.clock = 120;
  }

  update(dt) {
    if (this.messageTimer > 0) {
      this.messageTimer = Math.max(0, this.messageTimer - dt);
      if (this.messageTimer === 0 && this.state === STATE.PLAY_OVER) {
        this.state = STATE.PLAYCALL;
        this.helperMessage = 'Pick your next play.';
      }
    }

    if (this.input.consumeDebugToggle()) {
      this.debug = !this.debug;
    }

    this.updateClock(dt);
    this.updateSprintTimers(dt);

    if (this.routePreviewTimer > 0) {
      this.routePreviewTimer = Math.max(0, this.routePreviewTimer - dt);
    }

    switch (this.state) {
      case STATE.PLAYCALL:
        break;
      case STATE.PRE_SNAP:
        this.updatePreSnap();
        break;
      case STATE.PLAY_RUNNING:
        this.updatePlay(dt);
        break;
      case STATE.PLAY_OVER:
        break;
      case STATE.DRIVE_OVER:
        break;
      default:
        break;
    }

    this.updateCamera(dt);

    const controlLabel = this.controlled ? this.controlled.role : 'None';
    const passingLabel = this.ball.inAir ? 'PASSING…' : '';
    const debugLabel = this.debug
      ? `PRESS:${this.playTimers.pressureDeadline.toFixed(2)} SACK:${this.playTimers.sackDeadline.toFixed(2)} NOW:${this.playTimer.toFixed(2)} CTRL:${controlLabel} INT:${this.intendedReceiver || 'none'}`
      : '';

    this.ui.updateHUD({
      quarter: this.quarter,
      clock: this.formatClock(),
      down: this.down,
      toGo: this.toGo,
      ballOn: this.ballOn,
      score: this.score,
      playName: `${this.currentPlay.name} (${this.currentPlay.offenseName} vs ${this.currentPlay.defenseName})`,
      showPlaycall: this.state === STATE.PLAYCALL,
      showSnap: this.state === STATE.PRE_SNAP,
      showThrow: this.state === STATE.PLAY_RUNNING && !this.runSelected && this.ball.carrier === this.qb && !this.ball.inAir,
      showRun: this.state === STATE.PRE_SNAP && this.currentPlay.runOption?.available,
      runSelected: this.runSelected,
      sprintCooldown: this.sprintCooldown,
      helper: `${this.helperMessage} ${passingLabel} ${debugLabel}`.trim(),
      controlLabel: `CONTROL: ${controlLabel}`,
    });
  }

  updatePreSnap() {
    if (this.currentPlay.runOption?.available && this.input.consumeRunToggle()) {
      this.runSelected = !this.runSelected;
      this.helperMessage = this.runSelected ? 'Run selected. Snap for handoff.' : 'Pass selected. Snap when ready.';
    }

    if (this.input.consumeSnap()) {
      this.state = STATE.PLAY_RUNNING;
      this.helperMessage = this.runSelected
        ? 'Handoff! Follow blocks.'
        : 'Play live! Drag to throw or use Throw/1-5.';
      this.playTimer = 0;
      this.setupProtectionTimers();
      if (this.runSelected) {
        this.handoffToRB();
      }
    }
  }

  setupProtectionTimers() {
    const olRatings = this.blockers
      .filter((player) => player.role.startsWith('OL'))
      .map((player) => player.ratings.passBlock || 70);
    const dlRatings = this.defense
      .filter((player) => player.role === 'DL')
      .map((player) => player.ratings.passRush || 70);

    const avgOL = olRatings.reduce((sum, val) => sum + val, 0) / olRatings.length;
    const avgDL = dlRatings.reduce((sum, val) => sum + val, 0) / dlRatings.length;
    const basePressure = 2.6;
    const pressureTime = clamp(basePressure + (avgOL - avgDL) * 0.01 + this.randRange(-0.3, 0.3), 1.8, 3.6);
    const qbAwareness = this.qb?.ratings.awareness || 70;
    const sackTime = clamp(pressureTime + 0.35 + this.randRange(0, 0.65) - qbAwareness * 0.003, 2.1, 4.2);

    this.playTimers = {
      pressureDeadline: pressureTime,
      sackDeadline: sackTime,
    };
  }

  randRange(min, max) {
    return min + Math.random() * (max - min);
  }

  updatePlay(dt) {
    this.playTimer += dt;
    const prePressure = this.playTimer < this.playTimers.pressureDeadline;
    const defenseSpeedFactor = prePressure ? 0.4 : 1;

    if (!this.ball.inAir) {
      if (!this.runSelected) {
        const targetThrow = this.input.consumeTargetThrow();
        const throwData = this.input.consumeThrow();
        if (targetThrow) {
          this.throwToTarget(targetThrow);
        } else if (throwData && throwData.power > 0.05) {
          this.throwBall(throwData.dir, throwData.power, this.pickIntendedReceiver(throwData.dir));
        } else if (this.input.consumeQuickThrow()) {
          this.quickThrow();
        } else if (this.ball.carrier === this.qb) {
          this.applyMovement(this.qb, dt, 1);
        } else if (this.ball.carrier && this.ball.carrier !== this.qb) {
          this.applyMovement(this.ball.carrier, dt, 1);
        }
      } else if (this.ball.carrier) {
        this.applyMovement(this.ball.carrier, dt, 1);
      }
    }

    this.offense.forEach((player) => {
      if (player === this.qb || player === this.rb) return;
      if (player.route.length) {
        player.updateRoute(dt);
      }
    });

    if (this.ball.inAir) {
      this.ball.update(dt);
      this.checkBallContacts();
      if (this.ball.y < FIELD_TOP || this.ball.y > FIELD_BOTTOM) {
        this.endPlay('Incomplete pass.', { resetBall: true });
      }
    } else if (this.ball.carrier) {
      this.checkTackle();
      this.checkTouchdown();
      this.checkOutOfBounds();
    }

    if (!this.ball.inAir && this.ball.carrier === this.qb && this.playTimer > this.playTimers.sackDeadline) {
      this.endPlay('Sacked.');
    }

    this.updateOffenseBlocking(dt, defenseSpeedFactor, prePressure);
    this.updateDefense(dt, defenseSpeedFactor, prePressure);
  }

  updateOffenseBlocking(dt, defenseSpeedFactor, prePressure) {
    this.blockers.forEach((blocker) => {
      const target = this.findNearestDefender(blocker, 50);
      if (!target) return;
      const toTarget = normalize(target.x - blocker.x, target.y - blocker.y);
      const qbDir = normalize(this.qb.x - blocker.x, this.qb.y - blocker.y);
      const facing = toTarget.x * qbDir.x + toTarget.y * qbDir.y;
      if (facing < 0.2) return;

      if (!target.engagedBy || target.engagedBy === blocker) {
        target.engagedBy = blocker;
        if (!target.engagedUntil || target.engagedUntil < this.playTimer) {
          const blockRating = blocker.ratings.passBlock || 70;
          const rushRating = target.ratings.passRush || 70;
          const blockDuration = clamp(1.2 + (blockRating - rushRating) * 0.02 + this.randRange(-0.2, 0.3), 0.8, 2.6);
          target.engagedUntil = this.playTimer + blockDuration;
        }
      }

      const speedBoost = this.runSelected ? 1.1 : 0.85;
      blocker.x += toTarget.x * blocker.speed * dt * defenseSpeedFactor * speedBoost;
      blocker.y += toTarget.y * blocker.speed * dt * defenseSpeedFactor * speedBoost;

      if (prePressure) {
        target.x -= toTarget.x * 18 * dt;
        target.y -= toTarget.y * 18 * dt;
      }
    });
  }

  updateDefense(dt, speedFactor, prePressure) {
    const ballThrown = this.ball.inAir;
    const react = this.playTimer > this.playTimers.pressureDeadline * 0.6;
    this.defense.forEach((defender) => {
      const assignment = defender.assignment || { type: 'zone', anchor: defender.zoneAnchor };
      if (assignment.type === 'rush') {
        if (ballThrown) {
          const target = this.ball;
          const dir = normalize(target.x - defender.x, target.y - defender.y);
          defender.x += dir.x * defender.speed * dt * 0.7;
          defender.y += dir.y * defender.speed * dt * 0.7;
          return;
        }
        if (!react) return;
        const blocker = this.findNearestBlocker(defender, 18);
        const dirToQB = normalize(this.qb.x - defender.x, this.qb.y - defender.y);
        let dir = dirToQB;
        let speed = defender.speed * speedFactor;
        if (blocker && defender.engagedUntil > this.playTimer && prePressure) {
          const blockDir = normalize(defender.x - blocker.x, defender.y - blocker.y);
          dir = normalize(dirToQB.x + blockDir.x * 0.8, dirToQB.y + blockDir.y * 0.8);
          speed *= 0.3;
        } else if (blocker && defender.engagedUntil > this.playTimer) {
          speed *= 0.55;
        }
        defender.x += dir.x * speed * dt;
        defender.y += dir.y * speed * dt;
      } else if (assignment.type === 'man') {
        let target = assignment.target || this.qb;
        if (ballThrown && length(this.ball.x - defender.x, this.ball.y - defender.y) < 140) {
          target = this.ball;
        }
        const offset = defender.role === 'CB' ? -12 : -8;
        const dir = normalize(target.x - defender.x, target.y - defender.y + offset);
        const speed = defender.speed * speedFactor * (react ? 1 : 0.4);
        defender.x += dir.x * speed * dt;
        defender.y += dir.y * speed * dt;
      } else if (assignment.type === 'zone') {
        const anchor = assignment.anchor || defender.zoneAnchor || { x: defender.x, y: defender.y };
        let target = anchor;
        if (ballThrown || this.ball.carrier) {
          target = ballThrown ? this.ball : this.ball.carrier;
        }
        const dir = normalize(target.x - defender.x, target.y - defender.y);
        const speed = defender.speed * speedFactor * (react ? 0.9 : 0.3);
        defender.x += dir.x * speed * dt;
        defender.y += dir.y * speed * dt;
      }
    });
  }

  updateSprintTimers(dt) {
    if (this.sprintCooldown > 0) {
      this.sprintCooldown = Math.max(0, this.sprintCooldown - dt);
    }
    if (this.sprintTimer > 0) {
      this.sprintTimer = Math.max(0, this.sprintTimer - dt);
    }
  }

  applyMovement(player, dt, baseMultiplier) {
    const move = this.input.getMovement();
    let speed = player.speed * baseMultiplier;
    if (this.input.consumeSprint() && this.sprintCooldown === 0) {
      this.sprintTimer = 2;
      this.sprintCooldown = 5;
    }
    if (this.sprintTimer > 0) {
      speed *= 1.45;
    }
    player.x += move.x * speed * dt;
    player.y += -move.y * speed * dt;
    player.x = clamp(player.x, FIELD_LEFT + 10, FIELD_RIGHT - 10);
    player.y = clamp(player.y, FIELD_TOP + 10, FIELD_BOTTOM - 10);

    if (!this.ball.inAir && this.ball.carrier === player) {
      this.ball.x = player.x + 6;
      this.ball.y = player.y - 2;
      this.ballOn = this.worldYToYard(player.y);
    }
  }

  throwBall(direction, power, intended) {
    const speed = 220 * power + 120;
    const velocity = {
      x: direction.x * speed,
      y: direction.y * speed,
    };
    this.ball.throwFrom(this.qb, velocity);
    this.qb.hasBall = false;
    this.ball.carrier = null;
    this.intendedReceiver = intended || this.intendedReceiver;
    if (this.intendedReceiver) {
      const receiver = this.offense.find((player) => player.role === this.intendedReceiver);
      if (receiver) {
        this.controlled = receiver;
      }
    }
    this.helperMessage = 'Ball in the air!';
  }

  quickThrow() {
    const target = this.findNearestReceiver();
    if (!target) return;
    const lead = this.getLeadPosition(target);
    const dir = normalize(lead.x - this.qb.x, lead.y - this.qb.y);
    const distance = clamp(length(lead.x - this.qb.x, lead.y - this.qb.y), 40, 220);
    this.intendedReceiver = target.role;
    this.throwBall(dir, distance / 220, target.role);
  }

  throwToTarget(role) {
    const target = this.offense.find((player) => player.role === role);
    if (!target) return;
    const lead = this.getLeadPosition(target, true);
    const dir = normalize(lead.x - this.qb.x, lead.y - this.qb.y);
    const distance = clamp(length(lead.x - this.qb.x, lead.y - this.qb.y), 40, 240);
    this.intendedReceiver = target.role;
    this.throwBall(dir, distance / 240, target.role);
  }

  pickIntendedReceiver(direction) {
    let best = null;
    let bestScore = -Infinity;
    this.receivers.forEach((receiver) => {
      const toReceiver = normalize(receiver.x - this.qb.x, receiver.y - this.qb.y);
      const score = toReceiver.x * direction.x + toReceiver.y * direction.y;
      if (score > bestScore) {
        bestScore = score;
        best = receiver;
      }
    });
    return best ? best.role : null;
  }

  getLeadPosition(player, useVelocity = false) {
    let target = { x: player.x, y: player.y };
    if (player.route.length && player.routeIndex < player.route.length) {
      const next = player.route[player.routeIndex];
      const dir = normalize(next.x - player.x, next.y - player.y);
      target = { x: player.x + dir.x * 24, y: player.y + dir.y * 24 };
      if (useVelocity) {
        target = { x: target.x + dir.x * 12, y: target.y + dir.y * 12 };
      }
    }
    return target;
  }

  handoffToRB() {
    this.ball.inAir = false;
    this.ball.carrier = this.rb;
    this.qb.hasBall = false;
    this.rb.hasBall = true;
    this.ball.x = this.rb.x + 6;
    this.ball.y = this.rb.y - 2;
    this.controlled = this.rb;
  }

  findNearestReceiver() {
    let nearest = null;
    let best = Infinity;
    this.receivers.forEach((receiver) => {
      const dist = length(receiver.x - this.qb.x, receiver.y - this.qb.y);
      if (dist < best) {
        best = dist;
        nearest = receiver;
      }
    });
    return nearest;
  }

  findNearestDefender(player, range) {
    let nearest = null;
    let best = range;
    this.defense.forEach((defender) => {
      const dist = length(defender.x - player.x, defender.y - player.y);
      if (dist < best) {
        best = dist;
        nearest = defender;
      }
    });
    return nearest;
  }

  findNearestBlocker(player, range) {
    let nearest = null;
    let best = range;
    this.blockers.forEach((blocker) => {
      const dist = length(blocker.x - player.x, blocker.y - player.y);
      if (dist < best) {
        best = dist;
        nearest = blocker;
      }
    });
    return nearest;
  }

  checkBallContacts() {
    const candidates = [...this.receivers, ...this.defense, this.qb, this.rb];
    for (const player of candidates) {
      const dist = length(player.x - this.ball.x, player.y - this.ball.y);
      if (dist < player.radius + 4) {
        this.ball.inAir = false;
        this.ball.carrier = player;
        player.hasBall = true;
        this.ballOn = this.worldYToYard(player.y);
        if (player.team === 'defense') {
          this.controlled = player;
          this.endDrive('Intercepted! Defense takes over.');
        } else {
          this.controlled = player;
          this.helperMessage = 'Catch made! Run upfield.';
        }
        break;
      }
    }
  }

  checkTackle() {
    const carrier = this.ball.carrier;
    if (!carrier || carrier.team !== 'offense') return;
    for (const defender of this.defense) {
      const dist = length(defender.x - carrier.x, defender.y - carrier.y);
      if (dist < defender.radius + carrier.radius + 1) {
        this.endPlay('Tackled.');
        break;
      }
    }
  }

  checkOutOfBounds() {
    const carrier = this.ball.carrier;
    if (!carrier) return;
    if (carrier.x < FIELD_LEFT + 6 || carrier.x > FIELD_RIGHT - 6) {
      this.endPlay('Out of bounds.');
    }
  }

  checkTouchdown() {
    if (!this.ball.carrier || this.ball.carrier.team !== 'offense') return;
    if (this.ballOn >= 100) {
      this.score += 7;
      this.endDrive('Touchdown!');
    }
  }

  endPlay(message, options = {}) {
    this.state = STATE.PLAY_OVER;
    this.messageTimer = 2.2;
    this.helperMessage = message;

    if (options.resetBall) {
      this.ballOn = this.losYard;
    }

    const gained = Math.max(0, this.ballOn - this.playStartBallOn);
    if (gained >= this.toGo) {
      this.down = 1;
      this.toGo = 10;
    } else {
      this.down += 1;
      this.toGo -= gained;
    }

    this.losYard = this.ballOn;

    if (this.down > 4) {
      this.endDrive('Turnover on downs.');
    }
  }

  endDrive(message) {
    this.state = STATE.DRIVE_OVER;
    this.messageTimer = 2.5;
    this.helperMessage = message;
    this.sprintCooldown = 0;
    setTimeout(() => {
      this.resetDrive(message);
    }, 1200);
  }

  updateCamera() {
    const controlled = this.controlled || this.qb;
    if (!controlled) return;
    const viewWidth = this.canvas.width / CAMERA_ZOOM;
    const viewHeight = this.canvas.height / CAMERA_ZOOM;

    const dx = controlled.x - this.lastControlPos.x;
    const dy = controlled.y - this.lastControlPos.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) {
      const dir = normalize(dx, dy);
      this.cameraLook = dir;
    }
    this.lastControlPos = { x: controlled.x, y: controlled.y };

    const lookaheadX = this.cameraLook.x * CAMERA_LOOKAHEAD;
    const lookaheadY = this.cameraLook.y * CAMERA_LOOKAHEAD;

    let targetX = controlled.x + lookaheadX;
    let targetY = controlled.y + lookaheadY;
    if (this.ball.inAir) {
      targetX = controlled.x + (this.ball.x - controlled.x) * 0.35;
      targetY = controlled.y + (this.ball.y - controlled.y) * 0.35;
    }

    this.camera.x += (targetX - this.camera.x) * CAMERA_LERP;
    this.camera.y += (targetY - this.camera.y) * CAMERA_LERP;

    this.camera.x = clamp(
      this.camera.x,
      FIELD_LEFT + viewWidth / 2,
      FIELD_LEFT + WORLD_WIDTH - viewWidth / 2
    );
    this.camera.y = clamp(
      this.camera.y,
      FIELD_TOP + viewHeight / 2,
      FIELD_TOP + WORLD_HEIGHT - viewHeight / 2
    );
  }

  formatClock() {
    const minutes = Math.floor(this.clock / 60);
    const seconds = Math.floor(this.clock % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  yardToWorldY(yard) {
    return FIELD_TOP + (yard / 100) * FIELD_HEIGHT;
  }

  worldYToYard(y) {
    const ratio = (y - FIELD_TOP) / FIELD_HEIGHT;
    return clamp(Math.round(ratio * 100), 0, 100);
  }

  render() {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    ctx.scale(CAMERA_ZOOM, CAMERA_ZOOM);
    ctx.translate(-this.camera.x, -this.camera.y);

    this.drawField(ctx);
    this.drawMarkers(ctx);
    if (this.state === STATE.PRE_SNAP && this.routePreviewTimer > 0) {
      this.drawRoutes(ctx);
    }
    this.drawPlayers(ctx);
    this.drawBall(ctx);
    if (this.debug) {
      this.drawDebug(ctx);
    }

    ctx.restore();
    this.drawJoystick(ctx);
    this.drawThrowArrow(ctx);
  }

  drawField(ctx) {
    ctx.fillStyle = '#0d3b1e';
    ctx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_WIDTH, FIELD_HEIGHT);

    ctx.fillStyle = '#1c4f26';
    ctx.fillRect(FIELD_LEFT, FIELD_TOP, FIELD_WIDTH, 60);
    ctx.fillRect(FIELD_LEFT, FIELD_BOTTOM - 60, FIELD_WIDTH, 60);

    ctx.strokeStyle = '#2c6e3f';
    ctx.lineWidth = 2;
    for (let yard = 0; yard <= 100; yard += 5) {
      const y = this.yardToWorldY(yard);
      ctx.beginPath();
      ctx.moveTo(FIELD_LEFT + 20, y);
      ctx.lineTo(FIELD_RIGHT - 20, y);
      ctx.stroke();
    }
  }

  drawMarkers(ctx) {
    const losY = this.yardToWorldY(this.losYard);
    const firstDownY = this.yardToWorldY(clamp(this.losYard + this.toGo, 0, 100));

    ctx.fillStyle = '#f5f1d0';
    ctx.fillRect(FIELD_LEFT + 4, losY - 2, FIELD_WIDTH - 8, 4);
    ctx.fillStyle = '#f9c74f';
    ctx.fillRect(FIELD_LEFT + 4, firstDownY - 1, FIELD_WIDTH - 8, 2);
  }

  drawRoutes(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    this.offense.forEach((player) => {
      if (!player.route.length) return;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      player.route.forEach((point) => {
        ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    });
  }

  drawPlayers(ctx) {
    const drawPlayer = (player) => {
      ctx.fillStyle = player.colors.primary;
      ctx.fillRect(player.x - 5, player.y - 5, 10, 10);
      ctx.fillStyle = player.colors.secondary;
      ctx.fillRect(player.x - 3, player.y - 3, 6, 6);
      this.drawNumber(ctx, player.number, player.x - 4, player.y - 3);
    };

    this.offense.forEach(drawPlayer);
    this.defense.forEach(drawPlayer);
  }

  drawNumber(ctx, number, x, y) {
    ctx.fillStyle = '#0b0b0b';
    const digits = number.split('');
    digits.forEach((digit, index) => {
      const pattern = DIGITS[digit];
      if (!pattern) return;
      pattern.forEach((row, rowIndex) => {
        row.split('').forEach((cell, colIndex) => {
          if (cell === '1') {
            ctx.fillRect(x + index * 4 + colIndex, y + rowIndex, 1, 1);
          }
        });
      });
    });
  }

  drawBall(ctx) {
    ctx.fillStyle = '#8a4b2a';
    if (this.ball.carrier && !this.ball.inAir) {
      ctx.beginPath();
      ctx.ellipse(this.ball.carrier.x + 6, this.ball.carrier.y - 2, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1c27d';
      ctx.fillRect(this.ball.carrier.x + 6, this.ball.carrier.y - 3, 1, 1);
    } else if (this.ball.inAir) {
      ctx.beginPath();
      ctx.ellipse(this.ball.x, this.ball.y, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1c27d';
      ctx.fillRect(this.ball.x, this.ball.y - 1, 1, 1);
    }
  }

  drawJoystick(ctx) {
    if (!this.input.joystick.active) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(this.input.joystick.startX, this.input.joystick.startY, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.input.joystick.x, this.input.joystick.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawThrowArrow(ctx) {
    if (!this.input.thrower.active) return;
    const dx = this.input.thrower.x - this.input.thrower.startX;
    const dy = this.input.thrower.y - this.input.thrower.startY;
    const distance = clamp(Math.sqrt(dx * dx + dy * dy), 0, 120);
    const power = distance / 120;

    ctx.strokeStyle = 'rgba(255, 209, 102, 0.8)';
    ctx.beginPath();
    ctx.moveTo(this.input.thrower.startX, this.input.thrower.startY);
    ctx.lineTo(this.input.thrower.x, this.input.thrower.y);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 209, 102, 0.8)';
    ctx.fillRect(10, this.canvas.height - 14, 40 * power, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.strokeRect(10, this.canvas.height - 14, 40, 4);
  }

  drawDebug(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    this.defense.forEach((defender) => {
      if (defender.assignment?.type === 'man' && defender.assignment.target) {
        ctx.beginPath();
        ctx.moveTo(defender.x, defender.y);
        ctx.lineTo(defender.assignment.target.x, defender.assignment.target.y);
        ctx.stroke();
      } else if (defender.assignment?.type === 'zone' && defender.assignment.anchor) {
        ctx.strokeRect(defender.assignment.anchor.x - 12, defender.assignment.anchor.y - 12, 24, 24);
      }
    });
  }
}
