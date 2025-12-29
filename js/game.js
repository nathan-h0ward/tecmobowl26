import { Ball, Player, TEAMS, clamp, length, normalize } from './entities.js';
import { PLAYS } from './playbook.js';

const STATE = {
  PLAYCALL: 'PLAYCALL',
  PRE_SNAP: 'PRE_SNAP',
  PLAY_RUNNING: 'PLAY_RUNNING',
  PLAY_OVER: 'PLAY_OVER',
  DRIVE_OVER: 'DRIVE_OVER',
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
    this.zoneDefenders = [];

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
    this.defenseDelay = 0.45;
    this.routePreviewTimer = 0;

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
    this.zoneDefenders = [];

    const lineY = this.yardToY(this.ballOn);
    const qbX = this.yardToX(0);
    const qbY = lineY + 12;

    this.qb = new Player({ x: qbX, y: qbY, team: 'offense', speed: 40, role: 'QB' });
    this.offense.push(this.qb);
    this.controlled = this.qb;

    const rb = new Player({ x: qbX - 10, y: qbY + 10, team: 'offense', speed: 42, role: 'RB' });
    this.rb = rb;
    this.offense.push(rb);

    const olOffsets = [-20, -10, 0, 10, 20];
    olOffsets.forEach((offset, index) => {
      const ol = new Player({
        x: qbX + offset,
        y: lineY + 2,
        team: 'offense',
        speed: 28,
        role: `OL${index + 1}`,
      });
      this.offense.push(ol);
      this.blockers.push(ol);
    });

    const te = new Player({ x: qbX + 30, y: lineY + 2, team: 'offense', speed: 34, role: 'TE' });
    this.offense.push(te);
    this.receivers.push(te);
    this.blockers.push(te);

    const wr1 = new Player({ x: qbX - 45, y: lineY - 6, team: 'offense', speed: 40, role: 'WR1' });
    const wr2 = new Player({ x: qbX + 45, y: lineY - 6, team: 'offense', speed: 40, role: 'WR2' });
    const wr3 = new Player({ x: qbX + 12, y: lineY - 10, team: 'offense', speed: 39, role: 'WR3' });

    this.offense.push(wr1, wr2, wr3);
    this.receivers.push(wr1, wr2, wr3);

    this.assignRoutes();

    this.spawnDefense(lineY, qbX);

    this.ball.inAir = false;
    this.ball.carrier = this.qb;
    this.qb.hasBall = true;
    this.playStartBallOn = this.ballOn;
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

  spawnDefense(lineY, qbX) {
    const dlOffsets = [-20, -8, 8, 20];
    dlOffsets.forEach((offset) => {
      const dl = new Player({ x: qbX + offset, y: lineY - 8, team: 'defense', speed: 34, role: 'DL' });
      this.defense.push(dl);
      this.rushers.push(dl);
    });

    const lbOffsets = [-22, 0, 22];
    lbOffsets.forEach((offset, index) => {
      const lb = new Player({ x: qbX + offset, y: lineY - 24, team: 'defense', speed: 33, role: `LB${index + 1}` });
      this.defense.push(lb);
      this.rushers.push(lb);
    });

    const dbOffsets = [-38, -12, 12, 38];
    dbOffsets.forEach((offset, index) => {
      const db = new Player({ x: qbX + offset, y: lineY - 42, team: 'defense', speed: 36, role: `DB${index + 1}` });
      this.defense.push(db);
      this.zoneDefenders.push(db);
      db.zoneAnchor = { x: db.x, y: db.y };
    });
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
      showPlaycall: this.state === STATE.PLAYCALL,
      showSnap: this.state === STATE.PRE_SNAP,
      showThrow: this.state === STATE.PLAY_RUNNING && this.currentPlay.type === 'pass' && this.ball.carrier === this.qb && !this.ball.inAir,
      sprintCooldown: this.sprintCooldown,
      helper: this.helperMessage,
    });
  }

  updatePreSnap() {
    if (this.input.consumeSnap()) {
      this.state = STATE.PLAY_RUNNING;
      this.helperMessage = this.currentPlay.type === 'run' ? 'Handoff! Follow blocks.' : 'Play live! Throw or scramble.';
      this.playTimer = 0;
      if (this.currentPlay.type === 'run') {
        this.handoffToRB();
      }
    }
  }

  updatePlay(dt) {
    this.playTimer += dt;
    const defenseSpeedFactor = this.playTimer < this.defenseDelay ? 0.25 : 1;

    if (!this.ball.inAir) {
      if (this.currentPlay.type === 'pass') {
        const throwData = this.input.consumeThrow();
        if (throwData && throwData.power > 0.05) {
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
      if (this.ball.carrier !== this.qb && this.currentPlay.type === 'pass' && blocker.role.startsWith('OL')) {
        return;
      }
      const target = this.findNearestDefender(blocker, 26);
      if (!target) return;
      const dir = normalize(target.x - blocker.x, target.y - blocker.y);
      blocker.x += dir.x * blocker.speed * dt * defenseSpeedFactor;
      blocker.y += dir.y * blocker.speed * dt * defenseSpeedFactor;
    });
  }

  updateDefense(dt, speedFactor) {
    if (this.currentPlay.type === 'pass') {
      this.rushers.forEach((defender) => {
        const target = this.qb;
        const dir = normalize(target.x - defender.x, target.y - defender.y);
        defender.x += dir.x * defender.speed * dt * speedFactor;
        defender.y += dir.y * defender.speed * dt * speedFactor;
      });

      this.zoneDefenders.forEach((defender) => {
        const anchor = defender.zoneAnchor || { x: defender.x, y: defender.y };
        const target = this.ball.inAir ? this.ball : anchor;
        const dir = normalize(target.x - defender.x, target.y - defender.y);
        defender.x += dir.x * defender.speed * dt * speedFactor * 0.8;
        defender.y += dir.y * defender.speed * dt * speedFactor * 0.8;
      });
    } else {
      this.defense.forEach((defender) => {
        if (this.playTimer < this.defenseDelay) return;
        const target = this.ball.carrier || this.qb;
        const dir = normalize(target.x - defender.x, target.y - defender.y);
        defender.x += dir.x * defender.speed * dt;
        defender.y += dir.y * defender.speed * dt;
      });
    }
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
    player.x = clamp(player.x, 20, this.canvas.width - 20);
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
    const dir = normalize(target.x - this.qb.x, target.y - this.qb.y);
    const distance = clamp(length(target.x - this.qb.x, target.y - this.qb.y), 20, 120);
    this.throwBall(dir, distance / 120);
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

  checkBallContacts() {
    const candidates = [...this.receivers, ...this.defense, this.qb, this.rb];
    for (const player of candidates) {
      const dist = length(player.x - this.ball.x, player.y - this.ball.y);
      if (dist < player.radius + 2) {
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
    this.offense.forEach((player) => {
      ctx.fillStyle = TEAMS.offense.primary;
      ctx.fillRect(player.x - 4, player.y - 4, 8, 8);
      ctx.fillStyle = TEAMS.offense.secondary;
      ctx.fillRect(player.x - 2, player.y - 2, 4, 4);
    });

    this.defense.forEach((defender) => {
      ctx.fillStyle = TEAMS.defense.primary;
      ctx.fillRect(defender.x - 4, defender.y - 4, 8, 8);
      ctx.fillStyle = TEAMS.defense.secondary;
      ctx.fillRect(defender.x - 2, defender.y - 2, 4, 4);
    });
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
}
