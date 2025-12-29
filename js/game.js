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

    this.players = [];
    this.defenders = [];
    this.receivers = [];

    this.qb = null;
    this.ball = new Ball();
    this.playStartBallOn = this.ballOn;

    this.sprintTimer = 0;
    this.sprintCooldown = 0;

    this.messageTimer = 0;
    this.helperMessage = 'Pick a play to start the drive.';

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

  selectPlay(index) {
    this.currentPlay = PLAYS[index];
    if (this.state === STATE.PLAYCALL) {
      this.setupPlay();
      this.state = STATE.PRE_SNAP;
      this.helperMessage = 'Drag right side to throw. Snap when ready.';
    }
  }

  setupPlay() {
    this.players = [];
    this.defenders = [];
    this.receivers = [];

    const qbX = this.yardToX(0);
    const qbY = this.yardToY(this.ballOn);
    this.qb = new Player({ x: qbX, y: qbY, team: 'offense', speed: 35, role: 'QB' });
    this.players.push(this.qb);

    const receiverOffsets = [
      { x: -30, y: 0 },
      { x: 30, y: 0 },
    ];

    receiverOffsets.forEach((offset, index) => {
      const receiver = new Player({
        x: qbX + offset.x,
        y: qbY + offset.y,
        team: 'offense',
        speed: 38,
        role: 'WR',
      });
      const route = this.currentPlay.routes[index].map((waypoint) => ({
        x: receiver.x + waypoint.x,
        y: receiver.y + waypoint.y,
      }));
      receiver.setRoute(route);
      this.players.push(receiver);
      this.receivers.push(receiver);
    });

    const defensePositions = [
      { x: qbX - 20, y: qbY - 20 },
      { x: qbX + 20, y: qbY - 18 },
      { x: qbX, y: qbY - 35 },
    ];

    defensePositions.forEach((pos) => {
      const defender = new Player({
        x: pos.x,
        y: pos.y,
        team: 'defense',
        speed: 32,
        role: 'CB',
      });
      this.defenders.push(defender);
    });

    this.ball.inAir = false;
    this.ball.carrier = this.qb;
    this.qb.hasBall = true;
    this.playStartBallOn = this.ballOn;
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

    switch (this.state) {
      case STATE.PLAYCALL:
        break;
      case STATE.PRE_SNAP:
        this.updatePreSnap(dt);
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
      sprintCooldown: this.sprintCooldown,
      helper: this.helperMessage,
    });
  }

  updatePreSnap(dt) {
    this.applyMovement(this.qb, dt, 0.8);
    if (this.input.consumeSnap()) {
      this.state = STATE.PLAY_RUNNING;
      this.helperMessage = 'Play live! Avoid sacks and throw.';
    }
  }

  updatePlay(dt) {
    const throwData = this.input.consumeThrow();
    if (!this.ball.inAir) {
      if (throwData && throwData.power > 0.1) {
        const speed = 120 * throwData.power + 40;
        const velocity = {
          x: throwData.dir.x * speed,
          y: throwData.dir.y * speed,
        };
        this.ball.throwFrom(this.qb, velocity);
        this.qb.hasBall = false;
        this.helperMessage = 'Ball in the air!';
      } else {
        this.applyMovement(this.qb, dt, 1);
      }
    }

    this.receivers.forEach((receiver) => receiver.updateRoute(dt));

    if (this.ball.inAir) {
      this.ball.update(dt);
      this.checkBallContacts();
      if (this.ball.y < 0 || this.ball.y > this.canvas.height) {
        this.endPlay('Incomplete pass.');
      }
    } else if (this.ball.carrier) {
      if (this.ball.carrier.team === 'offense') {
        this.applyMovement(this.ball.carrier, dt, 1);
      }
      this.checkTackle();
      this.checkTouchdown();
    }

    this.updateDefense(dt);
  }

  updateDefense(dt) {
    const target = this.ball.inAir ? this.ball : this.ball.carrier || this.qb;
    this.defenders.forEach((defender) => {
      const dx = target.x - defender.x;
      const dy = target.y - defender.y;
      const dir = normalize(dx, dy);
      defender.x += dir.x * defender.speed * dt;
      defender.y += dir.y * defender.speed * dt;
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
    player.x = clamp(player.x, 20, this.canvas.width - 20);
    player.y = clamp(player.y, 10, this.canvas.height - 10);

    if (!this.ball.inAir && this.ball.carrier === player) {
      this.ball.x = player.x;
      this.ball.y = player.y;
      this.ballOn = this.yToYard(player.y);
    }
  }

  checkBallContacts() {
    const candidates = [...this.receivers, ...this.defenders, this.qb];
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
          this.helperMessage = 'Catch made! Run upfield.';
        }
        break;
      }
    }
  }

  checkTackle() {
    const carrier = this.ball.carrier;
    if (!carrier || carrier.team !== 'offense') return;
    for (const defender of this.defenders) {
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
    } else {
      this.state = STATE.PLAY_OVER;
      this.messageTimer = 2.5;
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

  drawPlayers(ctx) {
    this.players.forEach((player) => {
      ctx.fillStyle = TEAMS[player.team].primary;
      ctx.fillRect(player.x - 4, player.y - 4, 8, 8);
      ctx.fillStyle = TEAMS[player.team].secondary;
      ctx.fillRect(player.x - 2, player.y - 2, 4, 4);
    });

    this.defenders.forEach((defender) => {
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
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.8)';
    ctx.beginPath();
    ctx.moveTo(this.input.thrower.startX, this.input.thrower.startY);
    ctx.lineTo(this.input.thrower.x, this.input.thrower.y);
    ctx.stroke();
  }
}
