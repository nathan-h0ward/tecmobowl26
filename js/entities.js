export const TEAMS = {
  offense: { primary: '#ffd166', secondary: '#b5831c' },
  defense: { primary: '#7bdff2', secondary: '#31708a' },
};

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function length(x, y) {
  return Math.sqrt(x * x + y * y);
}

export function normalize(x, y) {
  const len = length(x, y);
  if (len === 0) {
    return { x: 0, y: 0 };
  }
  return { x: x / len, y: y / len };
}

export class Player {
  constructor({ x, y, team, speed, role }) {
    this.x = x;
    this.y = y;
    this.team = team;
    this.speed = speed;
    this.role = role;
    this.radius = 4;
    this.route = [];
    this.routeIndex = 0;
    this.hasBall = false;
    this.blockTarget = null;
    this.zoneAnchor = null;
  }

  setRoute(route) {
    this.route = route;
    this.routeIndex = 0;
  }

  updateRoute(dt) {
    if (!this.route.length || this.routeIndex >= this.route.length) {
      return;
    }
    const target = this.route[this.routeIndex];
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = length(dx, dy);
    if (dist < 1) {
      this.routeIndex += 1;
      return;
    }
    const dir = normalize(dx, dy);
    this.x += dir.x * this.speed * dt;
    this.y += dir.y * this.speed * dt;
  }
}

export class Ball {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.inAir = false;
    this.carrier = null;
    this.radius = 2;
  }

  throwFrom(origin, velocity) {
    this.x = origin.x;
    this.y = origin.y;
    this.vx = velocity.x;
    this.vy = velocity.y;
    this.inAir = true;
    this.carrier = null;
  }

  update(dt) {
    if (!this.inAir) {
      return;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 6 * dt;
  }
}
