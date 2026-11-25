/* ============================================================
   game.js -- "Neon Drift": a small original HTML5 arcade demo
   ------------------------------------------------------------
   Written specifically so every control on the overlay does something:
     left stick / d-pad .......... move
     right stick ................. aim
     Cross ........................ dash
     R2 trigger ................... boost (analog)
     R1 ........................... fire
     L1 ........................... shield
     L2 ........................... brake / focus
     Options ...................... pause
     Triangle ..................... restart
   ============================================================ */
(function () {
  'use strict';

  var Game = {
    running: false, paused: false, over: false,
    canvas: null, ctx: null, w: 0, h: 0, dpr: 1,
    raf: 0, last: 0, acc: 0,
    score: 0, combo: 0, time: 90, shield: 100,
    player: null, orbs: [], drones: [], bullets: [], parts: [],
    spawnOrb: 0, spawnDrone: 0, fireCd: 0, dashFlash: 0, shake: 0
  };

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function hud(id, text) { var n = document.getElementById(id); if (n) n.textContent = text; }

  function beep(f, d, t, g) { if (window.Input) Input.beep(f || 440, d || .05, t || 'sine', g || .03); }

  function resize() {
    if (!Game.canvas) return;
    var r = Game.canvas.getBoundingClientRect();
    Game.dpr = Math.min(2, window.devicePixelRatio || 1);
    Game.w = Math.max(320, r.width);
    Game.h = Math.max(240, r.height);
    Game.canvas.width = Math.round(Game.w * Game.dpr);
    Game.canvas.height = Math.round(Game.h * Game.dpr);
    Game.ctx.setTransform(Game.dpr, 0, 0, Game.dpr, 0, 0);
  }

  function reset() {
    Game.score = 0; Game.combo = 0; Game.time = 90; Game.shield = 100;
    Game.player = {
      x: Game.w / 2, y: Game.h / 2, vx: 0, vy: 0,
      ax: 1, ay: 0, dashCd: 0, invuln: 0
    };
    Game.orbs = []; Game.drones = []; Game.bullets = []; Game.parts = [];
    Game.spawnOrb = 0; Game.spawnDrone = 2; Game.fireCd = 0; Game.over = false;
    for (var i = 0; i < 5; i++) addOrb();
    updateHud();
  }

  function addOrb() {
    Game.orbs.push({
      x: rand(60, Game.w - 60), y: rand(80, Game.h - 60),
      r: rand(7, 11), ph: rand(0, 6.28), hue: Math.random() < .18 ? 285 : 205
    });
  }

  function addDrone() {
    var edge = Math.floor(rand(0, 4)), x, y;
    if (edge === 0) { x = rand(0, Game.w); y = -20; }
    else if (edge === 1) { x = Game.w + 20; y = rand(0, Game.h); }
    else if (edge === 2) { x = rand(0, Game.w); y = Game.h + 20; }
    else { x = -20; y = rand(0, Game.h); }
    Game.drones.push({ x: x, y: y, vx: 0, vy: 0, r: rand(9, 14), hp: 2, ph: rand(0, 6.28) });
  }

  function burst(x, y, color, n, pow) {
    for (var i = 0; i < n; i++) {
      var a = rand(0, 6.283), s = rand(.4, 1) * (pow || 90);
      Game.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(.3, .75), max: .75, color: color, r: rand(1.5, 3.5) });
    }
  }

  function updateHud() {
    hud('hudScore', String(Game.score));
    hud('hudTime', String(Math.max(0, Math.ceil(Game.time))));
    hud('hudShield', Math.round(Game.shield) + '%');
    hud('hudCombo', Game.combo > 1 ? ('x' + Game.combo) : '');
  }

  function fire() {
    var p = Game.player;
    Game.bullets.push({ x: p.x + p.ax * 16, y: p.y + p.ay * 16,
      vx: p.ax * 460, vy: p.ay * 460, life: 1.1 });
    beep(720, .035, 'square', .014);
  }

  function dash() {
    var p = Game.player;
    if (p.dashCd > 0) return;
    p.vx += p.ax * 420; p.vy += p.ay * 420;
    p.dashCd = .45; p.invuln = .28; Game.dashFlash = 1;
    burst(p.x, p.y, '#8fd0ff', 16, 160);
    if (window.Input) Input.haptic(24);
    beep(260, .12, 'sawtooth', .04);
  }

  function update(dt) {
    var p = Game.player;
    var L = window.Input ? Input.axis('left') : { x: 0, y: 0 };
    var R = window.Input ? Input.axis('right') : { x: 0, y: 0 };

    var mx = L.x + (Input.get('right') - Input.get('left'));
    var my = L.y + (Input.get('down') - Input.get('up'));
    mx = clamp(mx, -1, 1); my = clamp(my, -1, 1);

    var boost = 1 + (Input.trigger('r2') * 1.15);
    var brake = Input.trigger('l2') * .45;
    var speed = 250 * boost * (1 - brake);

    p.vx += (mx * speed - p.vx) * Math.min(1, dt * 8);
    p.vy += (my * speed - p.vy) * Math.min(1, dt * 8);
    p.x = clamp(p.x + p.vx * dt, 18, Game.w - 18);
    p.y = clamp(p.y + p.vy * dt, 18, Game.h - 18);

    if (Math.abs(R.x) + Math.abs(R.y) > .18) { p.ax = R.x; p.ay = R.y; }
    else if (Math.abs(p.vx) + Math.abs(p.vy) > 30) {
      var m = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      p.ax = p.vx / m; p.ay = p.vy / m;
    }

    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (Game.dashFlash > 0) Game.dashFlash -= dt * 4;
    if (Game.shake > 0) Game.shake -= dt * 3;

    var shielding = Input.get('l1') > 0;
    if (shielding) Game.shield = Math.max(0, Game.shield - dt * 7);
    else Game.shield = Math.min(100, Game.shield + dt * 4);

    Game.fireCd -= dt;
    if (Input.get('r1') > 0 && Game.fireCd <= 0) { fire(); Game.fireCd = .13; }

    // orbs
    Game.spawnOrb -= dt;
    if (Game.spawnOrb <= 0 && Game.orbs.length < 8) { addOrb(); Game.spawnOrb = rand(1.1, 2.4); }
    for (var i = Game.orbs.length - 1; i >= 0; i--) {
      var o = Game.orbs[i]; o.ph += dt * 3;
      var d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < o.r + 17) {
        Game.combo = Math.min(9, Game.combo + 1);
        Game.score += 10 * Game.combo * (o.hue === 285 ? 3 : 1);
        burst(o.x, o.y, o.hue === 285 ? '#d59bff' : '#7fc4ff', 14, 120);
        Game.orbs.splice(i, 1); addOrb();
        beep(440 + Game.combo * 70, .07, 'sine', .035);
        if (window.Input) Input.haptic(8);
      }
    }

    // drones
    Game.spawnDrone -= dt;
    if (Game.spawnDrone <= 0) {
      addDrone(); addDrone();
      Game.spawnDrone = Math.max(.8, 3.2 - Game.time * 0 + (90 - Game.time) * .02);
    }
    for (var j = Game.drones.length - 1; j >= 0; j--) {
      var d2 = Game.drones[j];
      var dx = p.x - d2.x, dy = p.y - d2.y, dist = Math.hypot(dx, dy) || 1;
      var sp = 78 + (90 - Game.time) * .55;
      d2.vx += (dx / dist * sp - d2.vx) * Math.min(1, dt * 2.2);
      d2.vy += (dy / dist * sp - d2.vy) * Math.min(1, dt * 2.2);
      d2.x += d2.vx * dt; d2.y += d2.vy * dt; d2.ph += dt * 4;
      if (dist < d2.r + 15 && p.invuln <= 0) {
        if (!shielding) { Game.shield = Math.max(0, Game.shield - 18); Game.shake = 1; }
        Game.combo = 0; p.invuln = .8;
        p.vx -= dx / dist * 260; p.vy -= dy / dist * 260;
        burst(p.x, p.y, '#ff7b8f', 18, 150);
        d2.x = -100; d2.y = -100; d2.hp = 0;
        beep(120, .18, 'sawtooth', .05);
        if (window.Input) Input.haptic(45);
      }
      if (d2.hp <= 0) Game.drones.splice(j, 1);
    }

    // bullets
    for (var b = Game.bullets.length - 1; b >= 0; b--) {
      var bu = Game.bullets[b];
      bu.x += bu.vx * dt; bu.y += bu.vy * dt; bu.life -= dt;
      var hit = false;
      for (var q = 0; q < Game.drones.length; q++) {
        var dr = Game.drones[q];
        if (Math.hypot(dr.x - bu.x, dr.y - bu.y) < dr.r + 5) {
          dr.hp -= 1; hit = true;
          burst(bu.x, bu.y, '#ff9b9b', 8, 90);
          if (dr.hp <= 0) { Game.score += 25; burst(dr.x, dr.y, '#ffb0b0', 16, 140); }
          break;
        }
      }
      if (hit || bu.life <= 0 || bu.x < 0 || bu.x > Game.w || bu.y < 0 || bu.y > Game.h) {
        Game.bullets.splice(b, 1);
      }
    }

    // particles
    for (var k = Game.parts.length - 1; k >= 0; k--) {
      var pa = Game.parts[k];
      pa.x += pa.vx * dt; pa.y += pa.vy * dt;
      pa.vx *= .94; pa.vy *= .94; pa.life -= dt;
      if (pa.life <= 0) Game.parts.splice(k, 1);
    }

    Game.time -= dt;
    if (Game.shield <= 0 || Game.time <= 0) endGame();
    updateHud();
  }

  function render() {
    var c = Game.ctx, w = Game.w, h = Game.h;
    c.save();
    if (Game.shake > 0) c.translate(rand(-4, 4) * Game.shake, rand(-4, 4) * Game.shake);

    // background
    var bg = c.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#071231'); bg.addColorStop(1, '#020614');
    c.fillStyle = bg; c.fillRect(0, 0, w, h);

    c.strokeStyle = 'rgba(90,140,230,.09)'; c.lineWidth = 1;
    var step = 46, t = (performance.now() / 1000) % 1;
    c.beginPath();
    for (var x = (t * step) - step; x < w + step; x += step) { c.moveTo(x, 0); c.lineTo(x, h); }
    for (var y = (t * step) - step; y < h + step; y += step) { c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();

    // orbs
    for (var i = 0; i < Game.orbs.length; i++) {
      var o = Game.orbs[i], pulse = 1 + Math.sin(o.ph) * .12;
      var g = c.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r * 4 * pulse);
      g.addColorStop(0, o.hue === 285 ? 'rgba(213,155,255,.9)' : 'rgba(140,205,255,.9)');
      g.addColorStop(1, 'rgba(80,140,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(o.x, o.y, o.r * 4 * pulse, 0, 6.283); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(o.x, o.y, o.r * .45, 0, 6.283); c.fill();
    }

    // drones
    for (var j = 0; j < Game.drones.length; j++) {
      var d = Game.drones[j];
      var a = Math.atan2(d.vy, d.vx);
      c.save(); c.translate(d.x, d.y); c.rotate(a);
      c.shadowColor = '#ff4f6d'; c.shadowBlur = 14;
      c.fillStyle = '#ff6b83'; c.beginPath();
      c.moveTo(d.r * 1.3, 0); c.lineTo(-d.r, d.r * .8); c.lineTo(-d.r * .5, 0); c.lineTo(-d.r, -d.r * .8);
      c.closePath(); c.fill(); c.restore();
    }

    // bullets
    c.strokeStyle = '#bfe4ff'; c.lineWidth = 2; c.shadowColor = '#5aa8ff'; c.shadowBlur = 8;
    for (var b = 0; b < Game.bullets.length; b++) {
      var bu = Game.bullets[b]; c.beginPath(); c.moveTo(bu.x, bu.y);
      c.lineTo(bu.x - bu.vx * .018, bu.y - bu.vy * .018); c.stroke();
    }
    c.shadowBlur = 0;

    // player
    var p = Game.player;
    var shielding = Input.get('l1') > 0;
    if (p.invuln > 0 && Math.floor(p.invuln * 20) % 2 === 0) { /* blink */ }
    else {
      var glow = c.createRadialGradient(p.x, p.y, 2, p.x, p.y, 34);
      glow.addColorStop(0, 'rgba(150,205,255,.85)'); glow.addColorStop(1, 'rgba(60,130,255,0)');
      c.fillStyle = glow; c.beginPath(); c.arc(p.x, p.y, 34, 0, 6.283); c.fill();
      c.fillStyle = '#eef6ff'; c.beginPath(); c.arc(p.x, p.y, 11, 0, 6.283); c.fill();
      c.strokeStyle = '#4a9cff'; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y, 17, 0, 6.283); c.stroke();
      c.strokeStyle = shielding ? '#8bffcf' : '#ffffff'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(p.x + p.ax * 17, p.y + p.ay * 17);
      c.lineTo(p.x + p.ax * 30, p.y + p.ay * 30); c.stroke();
    }

    // particles
    for (var k = 0; k < Game.parts.length; k++) {
      var pa = Game.parts[k];
      c.globalAlpha = Math.max(0, pa.life / pa.max);
      c.fillStyle = pa.color; c.beginPath(); c.arc(pa.x, pa.y, pa.r, 0, 6.283); c.fill();
    }
    c.globalAlpha = 1;

    // dash flash + vignette
    if (Game.dashFlash > 0) { c.fillStyle = 'rgba(120,190,255,' + (Game.dashFlash * .12) + ')'; c.fillRect(0, 0, w, h); }
    var vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .32, w / 2, h / 2, Math.max(w, h) * .78);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.65)');
    c.fillStyle = vg; c.fillRect(0, 0, w, h);
    c.restore();
  }

  function loop(ts) {
    if (!Game.running) return;
    var dt = Game.last ? Math.min(.05, (ts - Game.last) / 1000) : 0;
    Game.last = ts;
    if (!Game.paused && !Game.over) update(dt);
    render();
    Game.raf = requestAnimationFrame(loop);
  }

  function endGame() {
    if (Game.over) return;
    Game.over = true; Game.paused = true;
    beep(180, .5, 'triangle', .05);
    try {
      window.dispatchEvent(new CustomEvent('ps5gameover', {
        detail: { score: Game.score, time: Math.max(0, Math.ceil(Game.time)) }
      }));
    } catch (e) {}
  }

  /* ---------------- public API ---------------- */
  Game.init = function (canvas) {
    Game.canvas = canvas;
    Game.ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', function () { if (Game.running) resize(); });
  };

  Game.start = function () {
    if (!Game.ctx) return;
    resize(); reset();
    Game.running = true; Game.paused = false; Game.over = false; Game.last = 0;
    cancelAnimationFrame(Game.raf);
    Game.raf = requestAnimationFrame(loop);
  };

  Game.stop = function () {
    Game.running = false; Game.paused = true;
    cancelAnimationFrame(Game.raf);
  };

  Game.togglePause = function () {
    if (!Game.running || Game.over) return;
    Game.paused = !Game.paused;
    return Game.paused;
  };

  Game.isPaused = function () { return Game.paused; };
  Game.restart = Game.start;

  /* input edges that are not polled */
  window.addEventListener('ps5press', function (ev) {
    if (!Game.running) return;
    var n = ev.detail && ev.detail.name;
    if (n === 'cross') dash();
    if (n === 'triangle' && Game.over) Game.start();
    if (n === 'options') {
      var paused = Game.togglePause();
      try { window.dispatchEvent(new CustomEvent('ps5gamepause', { detail: { paused: paused } })); } catch (e) {}
    }
  });

  window.PS5Game = Game;
})();
