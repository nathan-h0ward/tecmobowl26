# TecmoBowl26

A mobile-friendly pixel football game inspired by classic arcade football. Built with HTML canvas and designed for GitHub Pages.

## How to Play
- Pick a play from the playcall panel (varied formations and coverages).
- Tap **Snap** to start the play (QB cannot move pre-snap).
- Pass plays: drag on the right side to aim and throw, tap **Throw** for a quick pass, or use number keys to target receivers.
- Run option plays: tap **Run** or press **R** before snap to hand off on the snap.
- Use the left joystick to move the QB or ball carrier.
- Tap **Sprint** for a short burst (cooldown applies).

## Controls
**Touch**
- Left side drag = joystick movement
- Right side drag = aim + power throw
- Buttons: **Snap**, **Throw**, **Run**, **Sprint**

**Desktop**
- WASD / Arrow keys = move
- Mouse drag on right side = throw
- Space = snap
- F = quick throw
- 1 = WR1, 2 = WR2, 3 = WR3, 4 = TE, 5 = RB (instant throws)
- R = toggle run option (if available)
- D = debug overlay (labels/assignments)

## Game Rules
- Offense-only drives with downs, distance, and a running clock.
- Score touchdowns by reaching the top endzone.
- Turnover on downs or interceptions.

## Playbook Structure
Each play in `js/playbook.js` defines formations and behavior:
- `offenseFormation`: positions for QB/RB/TE/WRs/OL relative to the LOS.
- `defenseFormation`: 11 defenders with roles and positions.
- `defenseStyle`: `man`, `zone`, or `blitz`.
- `routes`: waypoints for eligible receivers.
- `runOption`: whether a run is available plus its lane.

Add new plays by appending to `PLAYS` with formation/route data.

## Development
Open `index.html` locally or deploy to GitHub Pages.
