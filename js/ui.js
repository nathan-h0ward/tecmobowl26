import { PLAYS } from './playbook.js';

export class UI {
  constructor() {
    this.scoreboard = document.getElementById('scoreboard');
    this.playcall = document.getElementById('playcall');
    this.playButtons = document.getElementById('play-buttons');
    this.snapButton = document.getElementById('snap');
    this.sprintButton = document.getElementById('sprint');
    this.helper = document.getElementById('helper');
    this.game = null;

    this.snapButton.addEventListener('click', () => {
      if (this.game) this.game.requestSnap();
    });

    this.sprintButton.addEventListener('click', () => {
      if (this.game) this.game.requestSprint();
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
    this.scoreboard.innerHTML = `Q${data.quarter} ${data.clock}<br>Down ${data.down} & ${data.toGo}<br>Ball ${data.ballOn} | Score ${data.score}`;
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

    if (data.sprintCooldown > 0) {
      this.sprintButton.textContent = `Sprint (${Math.ceil(data.sprintCooldown)}s)`;
      this.sprintButton.disabled = true;
    } else {
      this.sprintButton.textContent = 'Sprint';
      this.sprintButton.disabled = false;
    }
  }
}
