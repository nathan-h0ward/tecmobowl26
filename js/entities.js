export const POSITION_STYLES = {
  QB: { primary: '#ffb703', secondary: '#b76e00', number: '1' },
  RB: { primary: '#f28482', secondary: '#b4554f', number: '2' },
  WR1: { primary: '#ffd166', secondary: '#b5831c', number: '10' },
  WR2: { primary: '#f4d35e', secondary: '#b28c1d', number: '11' },
  WR3: { primary: '#ffe29a', secondary: '#bca25a', number: '12' },
  TE: { primary: '#90be6d', secondary: '#4f7a39', number: '80' },
  OL1: { primary: '#577590', secondary: '#364c60', number: '60' },
  OL2: { primary: '#577590', secondary: '#364c60', number: '61' },
  OL3: { primary: '#577590', secondary: '#364c60', number: '62' },
  OL4: { primary: '#577590', secondary: '#364c60', number: '63' },
  OL5: { primary: '#577590', secondary: '#364c60', number: '64' },
  DL: { primary: '#8d99ae', secondary: '#5d6878', number: '90' },
  LB: { primary: '#6c757d', secondary: '#495057', number: '52' },
  CB: { primary: '#48cae4', secondary: '#1b9db7', number: '21' },
  S: { primary: '#4ea8de', secondary: '#277da1', number: '31' },
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
  constructor({ x, y, team, speed, role, number, colors }) {
    this.x = x;
    this.y = y;
    this.team = team;
    this.speed = speed;
    this.role = role;
    this.radius = 6;
    this.route = [];
    this.routeIndex = 0;
    this.hasBall = false;
    this.blockTarget = null;
    this.zoneAnchor = null;
    this.assignment = null;
    this.number = number || '';
    this.colors = colors || { primary: '#fff', secondary: '#888' };
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
    if (dist < 2) {
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
    this.vy += 8 * dt;
  }
}
