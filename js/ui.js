import { PLAYS } from './playbook.js';

export class UI {
  constructor() {
    this.scoreboard = document.getElementById('scoreboard');
    this.playcall = document.getElementById('playcall');
    this.playButtons = document.getElementById('play-buttons');
    this.snapButton = document.getElementById('snap');
    this.sprintButton = document.getElementById('sprint');
    this.throwButton = document.getElementById('throw');
    this.runButton = document.getElementById('run');
    this.passButtons = {
      WR1: document.getElementById('pass-wr1'),
      WR2: document.getElementById('pass-wr2'),
      WR3: document.getElementById('pass-wr3'),
      TE: document.getElementById('pass-te'),
      RB: document.getElementById('pass-rb'),
    };
    this.helper = document.getElementById('helper');
    this.game = null;

    this.snapButton.addEventListener('click', () => {
      if (this.game) this.game.requestSnap();
    });

    this.sprintButton.addEventListener('click', () => {
      if (this.game) this.game.requestSprint();
    });

    this.throwButton.addEventListener('click', () => {
      if (this.game) this.game.requestQuickThrow();
    });

    this.runButton.addEventListener('click', () => {
      if (this.game) this.game.requestRunToggle();
    });

    Object.entries(this.passButtons).forEach(([role, button]) => {
      button.addEventListener('click', () => {
        if (this.game) this.game.requestTargetThrow(role);
      });
    });

    this.renderPlayButtons();
  }

  bindGame(game) {
    this.game = game;
  }

  renderPlayButtons() {
    this.playButtons.innerHTML = '';
    PLAYS.forEach((play, index) => {
      const button = document.createElement('button');
      button.textContent = `${index + 1}. ${play.name}`;
      button.addEventListener('click', () => {
        if (this.game) this.game.selectPlay(index);
      });
      this.playButtons.appendChild(button);
    });
  }

  updateHUD(data) {
    this.scoreboard.innerHTML = `Q${data.quarter} ${data.clock}<br>Down ${data.down} & ${data.toGo}<br>Ball ${data.ballOn} | Score ${data.score}<br>${data.playName}<br>${data.controlLabel}`;
    this.helper.textContent = data.helper;

    if (data.showPlaycall) {
      this.playcall.classList.remove('hidden');
    } else {
      this.playcall.classList.add('hidden');
    }

    if (data.showSnap) {
      this.snapButton.classList.remove('hidden');
    } else {
      this.snapButton.classList.add('hidden');
    }

    if (data.showThrow) {
      this.throwButton.classList.remove('hidden');
      Object.values(this.passButtons).forEach((button) => button.classList.remove('hidden'));
    } else {
      this.throwButton.classList.add('hidden');
      Object.values(this.passButtons).forEach((button) => button.classList.add('hidden'));
    }

    if (data.showRun) {
      this.runButton.classList.remove('hidden');
      this.runButton.textContent = data.runSelected ? 'Run ✓' : 'Run';
    } else {
      this.runButton.classList.add('hidden');
    }

    if (data.sprintCooldown > 0) {
      this.sprintButton.textContent = `Sprint (${Math.ceil(data.sprintCooldown)}s)`;
      this.sprintButton.disabled = true;
    } else {
      this.sprintButton.textContent = 'Sprint';
      this.sprintButton.disabled = false;
    }
  }
}
