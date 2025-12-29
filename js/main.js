const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = 320;
canvas.height = 180;

function loop() {
  ctx.fillStyle = "#1e7f3f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.fillText("TecmoBowl26 loading…", 80, 90);

  requestAnimationFrame(loop);
}

loop();
