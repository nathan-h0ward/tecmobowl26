import { Ball, Player, POSITION_STYLES, clamp, length, normalize } from './entities.js';
import { PLAYS } from './playbook.js';

const STATE = {
  PLAYCALL: 'PLAYCALL',
  PRE_SNAP: 'PRE_SNAP',
  PLAY_RUNNING: 'PLAY_RUNNING',
  PLAY_OVER: 'PLAY_OVER',
  DRIVE_OVER: 'DRIVE_OVER',
};

const DEF_NUMBERS = {
  DL: ['90', '91', '92', '93', '94'],
  LB: ['50', '51', '52', '53', '54'],
  CB: ['21', '23', '25'],
  S: ['31', '33', '35'],
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
    this.defenseDelay = 0.5;
    this.routePreviewTimer = 0;
    this.runSelected = false;

    this.debug = false;

    this.selectPlay(0);
    this.handleResize();
  }

  handleResize() {
    this.context.imageSmoothingEnabled = false;
  }

  resetDrive(message) {
    this.ballOn = 25;
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

    const lineY = this.yardToY(this.ballOn);
    const centerX = this.yardToX(0);

    this.spawnOffense(lineY, centerX);
    this.spawnDefense(lineY, centerX);
    this.assignRoutes();
    this.assignDefense();

    this.ball.inAir = false;
    this.ball.carrier = this.qb;
    this.qb.hasBall = true;
    this.playStartBallOn = this.ballOn;

    this.runSelected = this.currentPlay.type === 'run';
  }

  spawnOffense(lineY, centerX) {
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
        y: lineY + offset.y + jitter.y,
      });

      this.offense.push(player);
      if (role === 'QB') this.qb = player;
      if (role === 'RB') this.rb = player;
      if (role.startsWith('WR') || role === 'TE' || role === 'RB') this.receivers.push(player);
      if (role.startsWith('OL') || role === 'TE') this.blockers.push(player);
    });

    this.controlled = this.qb;
  }

  spawnDefense(lineY, centerX) {
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
        y: lineY + spot.y + jitter.y,
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
        if (defender.role === 'LB' && Math.random() > 0.5) {
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
    return new Player({
      x,
      y,
      team,
      speed: team === 'offense' ? 40 : 36,
      role,
      number: number || style.number,
      colors: { primary: style.primary, secondary: style.secondary },
    });
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
      helper: this.helperMessage,
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
      if (this.runSelected) {
        this.handoffToRB();
      }
    }
  }

  updatePlay(dt) {
    this.playTimer += dt;
    const defenseSpeedFactor = this.playTimer < this.defenseDelay ? 0.25 : 1;

    if (!this.ball.inAir) {
      if (!this.runSelected) {
        const targetThrow = this.input.consumeTargetThrow();
        const throwData = this.input.consumeThrow();
        if (targetThrow) {
          this.throwToTarget(targetThrow);
        } else if (throwData && throwData.power > 0.05) {
          this.throwBall(throwData.dir, throwData.power);
        } else if (this.input.consumeQuickThrow()) {
          this.quickThrow();
        } else if (this.ball.carrier === this.qb) {
          this.applyMovement(this.qb, dt, 1);
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
      if (this.ball.y < 0 || this.ball.y > this.canvas.height) {
        this.endPlay('Incomplete pass.');
      }
    } else if (this.ball.carrier) {
      this.checkTackle();
      this.checkTouchdown();
    }

    this.updateOffenseBlocking(dt, defenseSpeedFactor);
    this.updateDefense(dt, defenseSpeedFactor);
  }

  updateOffenseBlocking(dt, defenseSpeedFactor) {
    this.blockers.forEach((blocker) => {
      const target = this.findNearestDefender(blocker, 28);
      if (!target) return;
      const dir = normalize(target.x - blocker.x, target.y - blocker.y);
      const speedBoost = this.runSelected ? 1.1 : 0.9;
      blocker.x += dir.x * blocker.speed * dt * defenseSpeedFactor * speedBoost;
      blocker.y += dir.y * blocker.speed * dt * defenseSpeedFactor * speedBoost;
    });
  }

  updateDefense(dt, speedFactor) {
    const react = this.playTimer > this.defenseDelay;
    this.defense.forEach((defender) => {
      const assignment = defender.assignment || { type: 'zone', anchor: defender.zoneAnchor };
      if (assignment.type === 'rush') {
        if (!react) return;
        const blocker = this.findNearestBlocker(defender, 12);
        const dirToQB = normalize(this.qb.x - defender.x, this.qb.y - defender.y);
        let dir = dirToQB;
        let speed = defender.speed * speedFactor;
        if (blocker) {
          const blockDir = normalize(defender.x - blocker.x, defender.y - blocker.y);
          dir = normalize(dirToQB.x + blockDir.x * 0.8, dirToQB.y + blockDir.y * 0.8);
          speed *= 0.3;
        }
        defender.x += dir.x * speed * dt;
        defender.y += dir.y * speed * dt;
      } else if (assignment.type === 'man') {
        let target = assignment.target || this.qb;
        if (react && this.ball.inAir && length(this.ball.x - defender.x, this.ball.y - defender.y) < 60) {
          target = this.ball;
        }
        const dir = normalize(target.x - defender.x, target.y - defender.y);
        const speed = defender.speed * speedFactor * (react ? 1 : 0.4);
        defender.x += dir.x * speed * dt;
        defender.y += dir.y * speed * dt;
      } else if (assignment.type === 'zone') {
        const anchor = assignment.anchor || defender.zoneAnchor || { x: defender.x, y: defender.y };
        let target = anchor;
        if (react && (this.ball.inAir || this.ball.carrier)) {
          target = this.ball.inAir ? this.ball : this.ball.carrier;
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
      speed *= 1.6;
    }
    player.x += move.x * speed * dt;
    player.y += move.y * speed * dt;
    player.x = clamp(player.x, 14, this.canvas.width - 14);
    player.y = clamp(player.y, 10, this.canvas.height - 10);

    if (!this.ball.inAir && this.ball.carrier === player) {
      this.ball.x = player.x;
      this.ball.y = player.y;
      this.ballOn = this.yToYard(player.y);
    }
  }

  throwBall(direction, power) {
    const speed = 130 * power + 40;
    const velocity = {
      x: direction.x * speed,
      y: direction.y * speed,
    };
    this.ball.throwFrom(this.qb, velocity);
    this.qb.hasBall = false;
    this.ball.carrier = null;
    this.helperMessage = 'Ball in the air!';
  }

  quickThrow() {
    const target = this.findNearestReceiver();
    if (!target) return;
    const lead = this.getLeadPosition(target);
    const dir = normalize(lead.x - this.qb.x, lead.y - this.qb.y);
    const distance = clamp(length(lead.x - this.qb.x, lead.y - this.qb.y), 20, 120);
    this.throwBall(dir, distance / 120);
  }

  throwToTarget(role) {
    const target = this.offense.find((player) => player.role === role);
    if (!target) return;
    const lead = this.getLeadPosition(target, true);
    const dir = normalize(lead.x - this.qb.x, lead.y - this.qb.y);
    const distance = clamp(length(lead.x - this.qb.x, lead.y - this.qb.y), 20, 120);
    this.throwBall(dir, distance / 120);
  }

  getLeadPosition(player, useVelocity = false) {
    let target = { x: player.x, y: player.y };
    if (player.route.length && player.routeIndex < player.route.length) {
      const next = player.route[player.routeIndex];
      const dir = normalize(next.x - player.x, next.y - player.y);
      target = { x: player.x + dir.x * 10, y: player.y + dir.y * 10 };
    }
    if (useVelocity && player.route.length && player.routeIndex < player.route.length) {
      const next = player.route[player.routeIndex];
      const dir = normalize(next.x - player.x, next.y - player.y);
      target = { x: target.x + dir.x * 6, y: target.y + dir.y * 6 };
    }
    return target;
  }

  handoffToRB() {
    this.ball.inAir = false;
    this.ball.carrier = this.rb;
    this.qb.hasBall = false;
    this.rb.hasBall = true;
    this.ball.x = this.rb.x;
    this.ball.y = this.rb.y;
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
      if (dist < player.radius + 3) {
        this.ball.inAir = false;
        this.ball.carrier = player;
        player.hasBall = true;
        this.ballOn = this.yToYard(player.y);
        if (player.team === 'defense') {
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
      if (dist < defender.radius + carrier.radius) {
        this.endPlay('Tackled.');
        break;
      }
    }
  }

  checkTouchdown() {
    if (!this.ball.carrier || this.ball.carrier.team !== 'offense') return;
    if (this.ballOn >= 100) {
      this.score += 7;
      this.endDrive('Touchdown!');
    }
  }

  endPlay(message) {
    this.state = STATE.PLAY_OVER;
    this.messageTimer = 2.5;
    this.helperMessage = message;

    const gained = Math.max(0, this.ballOn - this.playStartBallOn);
    if (gained >= this.toGo) {
      this.down = 1;
      this.toGo = 10;
    } else {
      this.down += 1;
      this.toGo -= gained;
    }

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

  formatClock() {
    const minutes = Math.floor(this.clock / 60);
    const seconds = Math.floor(this.clock % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  yardToY(yard) {
    const bottom = 170;
    const top = 10;
    const clamped = clamp(yard + 10, 0, 120);
    const ratio = clamped / 120;
    return bottom - ratio * (bottom - top);
  }

  yToYard(y) {
    const bottom = 170;
    const top = 10;
    const ratio = (bottom - y) / (bottom - top);
    return clamp(Math.round(ratio * 120) - 10, 0, 100);
  }

  yardToX(offset) {
    return this.canvas.width / 2 + offset;
  }

  render() {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawField(ctx);
    if (this.state === STATE.PRE_SNAP && this.routePreviewTimer > 0) {
      this.drawRoutes(ctx);
    }
    this.drawPlayers(ctx);
    this.drawBall(ctx);
    this.drawJoystick(ctx);
    this.drawThrowArrow(ctx);
    if (this.debug) {
      this.drawDebug(ctx);
    }
  }

  drawField(ctx) {
    ctx.fillStyle = '#0d3b1e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const top = 10;
    const bottom = 170;
    ctx.fillStyle = '#1c4f26';
    ctx.fillRect(0, 0, this.canvas.width, top + 8);
    ctx.fillRect(0, bottom - 8, this.canvas.width, 18);

    ctx.strokeStyle = '#2c6e3f';
    ctx.lineWidth = 1;
    for (let yard = 0; yard <= 100; yard += 10) {
      const y = this.yardToY(yard);
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(this.canvas.width - 20, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#f5f1d0';
    const lineY = this.yardToY(this.ballOn);
    ctx.fillRect(18, lineY - 1, this.canvas.width - 36, 2);
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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '6px "Press Start 2P", monospace';

    const drawPlayer = (player) => {
      ctx.fillStyle = player.colors.primary;
      ctx.fillRect(player.x - 5, player.y - 5, 10, 10);
      ctx.fillStyle = player.colors.secondary;
      ctx.fillRect(player.x - 3, player.y - 3, 6, 6);
      ctx.fillStyle = '#0b0b0b';
      ctx.fillText(player.number, player.x, player.y + 1);
    };

    this.offense.forEach(drawPlayer);
    this.defense.forEach(drawPlayer);
  }

  drawBall(ctx) {
    ctx.fillStyle = '#f4a261';
    if (this.ball.carrier && !this.ball.inAir) {
      ctx.fillRect(this.ball.carrier.x - 2, this.ball.carrier.y - 2, 4, 4);
    } else if (this.ball.inAir) {
      ctx.fillRect(this.ball.x - 2, this.ball.y - 2, 4, 4);
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
        ctx.strokeRect(defender.assignment.anchor.x - 8, defender.assignment.anchor.y - 8, 16, 16);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillText(defender.role, defender.x, defender.y - 8);
    });

    this.offense.forEach((player) => {
      ctx.fillStyle = '#ffffff';
      ctx.font = '6px "Press Start 2P", monospace';
      ctx.fillText(player.role, player.x, player.y - 8);
    });
  }
}
