/* ============================================================
   app.js -- shell UI: boot, navigation, Control Center, settings,
   history-based Back, focus navigation, sound and game glue.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  var DEFAULTS = {
    haptics: true, sound: true, sensitivity: 1, scale: 1, alpha: .9,
    lefty: false, debug: false, boot: true, accent: '#4a9cff', brightness: 1
  };
  var settings = Object.assign({}, DEFAULTS);
  try {
    var saved = JSON.parse(localStorage.getItem('ps5shell.settings') || '{}');
    for (var k in DEFAULTS) if (saved[k] !== undefined) settings[k] = saved[k];
  } catch (e) {}

  var audioCtx = null;
  function beep(freq, dur, type, gain) {
    if (!settings.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq || 440;
      g.gain.setValueAtTime(0, audioCtx.currentTime);
      g.gain.linearRampToValueAtTime(gain || .03, audioCtx.currentTime + .008);
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime + (dur || .06));
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + (dur || .06) + .02);
    } catch (e) {}
  }

  var PS5 = {
    settings: settings,
    beep: beep,
    current: 'home',
    back: function () { goBack(); },
    toast: toast,
    navigate: navigate
  };
  window.PS5 = PS5;

  /* ---------------- persistence + apply ---------------- */
  function save() {
    try { localStorage.setItem('ps5shell.settings', JSON.stringify(settings)); } catch (e) {}
  }
  function applySettings() {
    var r = document.documentElement.style;
    r.setProperty('--accent', settings.accent);
    r.setProperty('--accent-soft', hexAlpha(settings.accent, .18));
    r.setProperty('--ctl-scale', String(settings.scale));
    r.setProperty('--ctl-alpha', String(settings.alpha));
    r.setProperty('--brightness', String(settings.brightness));
    var ctl = $('controller');
    if (ctl) ctl.classList.toggle('lefty', !!settings.lefty);
    if (window.Input) Input.sensitivity = settings.sensitivity;
    $$('.sw').forEach(function (b) {
      b.classList.toggle('sel', b.getAttribute('data-accent') === settings.accent);
    });
    var set = function (id, val) { var n = $(id); if (n) n.checked = !!val; };
    set('setHaptics', settings.haptics);
    set('setSound', settings.sound);
    set('setBoot', settings.boot);
    set('setLeft', settings.lefty);
    set('setDebug', settings.debug);
    var rng = function (id, val) { var n = $(id); if (n) n.value = val; };
    rng('setScale', settings.scale); rng('setAlpha', settings.alpha); rng('setSens', settings.sensitivity);
    var out = function (id, text) { var n = $(id); if (n) n.textContent = text; };
    out('outScale', Number(settings.scale).toFixed(2) + '×');
    out('outAlpha', Math.round(settings.alpha * 100) + '%');
    out('outSens', Number(settings.sensitivity).toFixed(1) + '×');
    rng('ccBrightness', settings.brightness);
    out('ccBrightOut', Math.round(settings.brightness * 100) + '%');
  }
  function hexAlpha(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ---------------- toast ---------------- */
  var toastTimer = 0;
  function toast(msg) {
    var t = $('toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1900);
  }

  /* ---------------- navigation ---------------- */
  var overlayForced = false;
  var historyOK = true;
  var localStack = ['home'];   // fallback when pushState is unavailable

  function syncOverlay() {
    var ctl = $('controller'); if (!ctl) return;
    var want = overlayForced || PS5.current === 'game' || PS5.current === 'controls';
    ctl.classList.toggle('hidden', !want);
  }

  function show(name, push) {
    var screens = $$('.screen');
    var target = null;
    screens.forEach(function (s) { if (s.getAttribute('data-screen') === name) target = s; });
    if (!target) name = 'home';
    if (PS5.current === 'game' && name !== 'game' && window.PS5Game) PS5Game.stop();

    PS5.current = name;
    screens.forEach(function (s) { s.classList.toggle('active', s.getAttribute('data-screen') === name); });
    var tag = document.querySelector('.tb-tag');
    if (tag) tag.textContent = name.toUpperCase();
    syncOverlay();
    setFocus(0);
    closeCC(); closePower();
    $('gameOverlay') && $('gameOverlay').classList.add('hidden');
    if (name === 'game') {
      $('gameOverlay').classList.remove('hidden');
      var t = $('goTitle'); if (t) t.textContent = 'NEON DRIFT';
      if (window.PS5Game) PS5Game.stop();
    }
    if (push !== false) {
      if (historyOK) {
        try { history.pushState({ screen: name }, '', '#' + name); }
        catch (e) {
          historyOK = false;
          if (localStack[localStack.length - 1] !== name) localStack.push(name);
        }
      } else if (localStack[localStack.length - 1] !== name) {
        localStack.push(name);
      }
    }
  }

  function navigate(name) { show(name, true); }
  function goBack() {
    if (historyOK && history.length > 1) {
      history.back();
    } else if (localStack.length > 1) {
      localStack.pop();
      show(localStack[localStack.length - 1], false);
    } else {
      show('home', false);
    }
  }

  window.addEventListener('popstate', function (ev) {
    var name = (ev.state && ev.state.screen) || 'home';
    show(name, false);
  });

  /* ---------------- focus ---------------- */
  var focusIndex = 0;
  function focusNodes() {
    return $$('.screen.active .focusable').filter(function (n) {
      return n.offsetParent !== null && !n.disabled;
    });
  }
  function setFocus(i) {
    var nodes = focusNodes();
    if (!nodes.length) return;
    focusIndex = (i + nodes.length) % nodes.length;
    nodes.forEach(function (n) { n.classList.remove('focused'); });
    var n = nodes[focusIndex];
    n.classList.add('focused');
    try { n.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch (e) {}
  }
  function activateFocused() {
    var nodes = focusNodes();
    if (nodes[focusIndex]) nodes[focusIndex].click();
  }

  /* ---------------- control center / power ---------------- */
  function toggleCC(force) {
    var cc = $('controlCenter'); if (!cc) return;
    var open = force === undefined ? !cc.classList.contains('open') : force;
    cc.classList.toggle('open', open);
    cc.setAttribute('aria-hidden', String(!open));
    if (open) beep(660, .06, 'sine', .03);
    updateCC();
  }
  function closeCC() { toggleCC(false); }
  function updateCC() {
    var map = { haptics: settings.haptics, sound: settings.sound, overlay: overlayForced };
    $$('.cc-tile').forEach(function (t) { t.classList.toggle('on', !!map[t.getAttribute('data-cc')]); });
    var net = $('ccNet'); if (net) net.textContent = navigator.onLine ? 'Wi-Fi · connected' : 'Offline';
    var res = $('ccRes'); if (res) res.textContent = screen.width + ' × ' + screen.height;
  }
  function togglePower(force) {
    var m = $('powerMenu'); if (!m) return;
    var open = force === undefined ? !m.classList.contains('open') : force;
    m.classList.toggle('open', open);
    m.setAttribute('aria-hidden', String(!open));
  }
  function closePower() { togglePower(false); }

  /* ---------------- boot ---------------- */
  function boot() {
    applySettings();
    var duration = settings.boot ? 1850 : 200;
    setTimeout(function () {
      $('boot').classList.add('hidden');
      $('topbar').classList.remove('hidden');
      $('screens').classList.remove('hidden');
      $('hints').classList.remove('hidden');
      try { history.replaceState({ screen: 'home' }, '', '#home'); } catch (e) { historyOK = false; }
      show('home', false);
      beep(392, .12, 'sine', .035);
      setTimeout(function () { beep(587, .16, 'sine', .035); }, 130);
      setTimeout(function () { beep(784, .22, 'sine', .03); }, 280);
    }, duration);
  }

  /* ---------------- clock / misc ---------------- */
  function tickClock() {
    var d = new Date();
    var s = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    var n = $('clock'); if (n) n.textContent = s;
  }
  function fillDeviceInfo() {
    var n = $('deviceInfo'); if (!n) return;
    var ua = navigator.userAgent;
    var short = ua.length > 110 ? ua.slice(0, 110) + '…' : ua;
    n.innerHTML = '<b>Viewport</b> ' + window.innerWidth + ' × ' + window.innerHeight +
      ' @ ' + (window.devicePixelRatio || 1) + '×<br><b>Online</b> ' + (navigator.onLine ? 'yes' : 'no') +
      '<br><b>UA</b> ' + short.replace(/</g, '&lt;');
  }

  /* ---------------- diagnostics ---------------- */
  function setBar(id, v, tid, label) {
    var b = $(id); if (b) {
      b.style.width = '100%';
      b.style.transform = 'scaleX(' + Math.min(1, Math.abs(v)) + ')';
      b.style.transformOrigin = v >= 0 ? 'left' : 'right';
    }
    var t = $(tid); if (t) t.textContent = label + ' ' + (v >= 0 ? '+' : '') + v.toFixed(2);
  }
  function diagTick() {
    if (PS5.current !== 'controls') return;
    var s = window.Input ? Input.snapshot() : null;
    if (!s) return;
    setBar('d-lx', s.sticks.lx, 't-lx', 'x');
    setBar('d-ly', s.sticks.ly, 't-ly', 'y');
    setBar('d-rx', s.sticks.rx, 't-rx', 'x');
    setBar('d-ry', s.sticks.ry, 't-ry', 'y');
    setBar('d-l2', s.triggers.l2, 't-l2', 'L2');
    setBar('d-r2', s.triggers.r2, 't-r2', 'R2');
    var chips = $('diagChips');
    if (chips) {
      chips.innerHTML = s.pressed.length
        ? s.pressed.map(function (p) { return '<span class="chip">' + p + '</span>'; }).join('')
        : '<span class="empty">none pressed</span>';
    }
  }

  /* ---------------- input events ---------------- */
  window.addEventListener('ps5press', function (ev) {
    var n = ev.detail && ev.detail.name;
    if (!n) return;
    var nodes = focusNodes();
    if (n === 'left' || n === 'up') { if (nodes.length) setFocus(focusIndex - 1); }
    else if (n === 'right' || n === 'down') { if (nodes.length) setFocus(focusIndex + 1); }
    else if (n === 'cross') { activateFocused(); }
    else if (n === 'circle' || n === 'back') {
      if ($('powerMenu').classList.contains('open')) closePower();
      else if ($('controlCenter').classList.contains('open')) closeCC();
      else goBack();
    }
    else if (n === 'ps') { togglePower(); }
    else if (n === 'share' || n === 'options') { if (PS5.current !== 'game') toggleCC(); }
    else if (n === 'create') { toast('Create · capture shortcut'); }
    else if (n === 'mute') { settings.sound = !settings.sound; save(); applySettings(); toast('UI sounds ' + (settings.sound ? 'on' : 'off')); }
    else if (n === 'touchpad') { overlayForced = !overlayForced; syncOverlay(); toast(overlayForced ? 'Overlay pinned' : 'Overlay follows screen'); }
    else if (n === 'l3' || n === 'r3') { toast(n.toUpperCase() + ' pressed'); }
  });

  /* ---------------- click actions ---------------- */
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest ? ev.target.closest('[data-action]') : null;
    if (!a) return;
    var action = a.getAttribute('data-action');
    if (action === 'back') { goBack(); return; }
    if (action === 'game-start') {
      if (window.PS5Game) PS5Game.start();
      $('gameOverlay').classList.add('hidden');
      beep(880, .09, 'triangle', .04);
      return;
    }
    if (action === 'play') { navigate('game'); return; }
    if (['library', 'remote', 'settings', 'about', 'controls'].indexOf(action) >= 0) { navigate(action); return; }
  });

  /* ---------------- control center clicks ---------------- */
  $$('.cc-tile').forEach(function (t) {
    t.addEventListener('click', function () {
      var a = t.getAttribute('data-cc');
      if (a === 'haptics') { settings.haptics = !settings.haptics; toast('Haptics ' + (settings.haptics ? 'on' : 'off')); }
      if (a === 'sound') { settings.sound = !settings.sound; toast('Sound ' + (settings.sound ? 'on' : 'off')); }
      if (a === 'overlay') { overlayForced = !overlayForced; syncOverlay(); toast('Overlay ' + (overlayForced ? 'pinned' : 'auto')); }
      if (a === 'home') { navigate('home'); return; }
      if (a === 'settings') { navigate('settings'); return; }
      if (a === 'power') { togglePower(); return; }
      save(); applySettings(); updateCC();
    });
  });
  var ccClose = $('ccClose'); if (ccClose) ccClose.addEventListener('click', function () { closeCC(); });
  var avatar = $('avatarBtn'); if (avatar) avatar.addEventListener('click', function () { togglePower(); });

  $$('.mm').forEach(function (m) {
    m.addEventListener('click', function () {
      var a = m.getAttribute('data-power');
      if (a === 'home') navigate('home');
      if (a === 'overlay') { overlayForced = !overlayForced; syncOverlay(); toast('Overlay ' + (overlayForced ? 'pinned' : 'auto')); }
      if (a === 'about') navigate('about');
      if (a === 'close') toast('Press the system Back key / gesture to exit');
      closePower();
    });
  });

  /* ---------------- settings bindings ---------------- */
  var bindRange = function (id, key, out, fmt) {
    var n = $(id); if (!n) return;
    n.addEventListener('input', function () {
      settings[key] = parseFloat(n.value);
      var o = $(out); if (o) o.textContent = fmt(settings[key]);
      save(); applySettings();
    });
  };
  bindRange('setScale', 'scale', 'outScale', function (v) { return v.toFixed(2) + '×'; });
  bindRange('setAlpha', 'alpha', 'outAlpha', function (v) { return Math.round(v * 100) + '%'; });
  bindRange('setSens', 'sensitivity', 'outSens', function (v) { return v.toFixed(1) + '×'; });

  var bindToggle = function (id, key) {
    var n = $(id); if (!n) return;
    n.addEventListener('change', function () { settings[key] = n.checked; save(); applySettings(); });
  };
  bindToggle('setHaptics', 'haptics'); bindToggle('setSound', 'sound');
  bindToggle('setBoot', 'boot'); bindToggle('setLeft', 'lefty'); bindToggle('setDebug', 'debug');

  $$('.sw').forEach(function (b) {
    b.addEventListener('click', function () {
      settings.accent = b.getAttribute('data-accent'); save(); applySettings();
      beep(700, .05, 'sine', .03);
    });
  });
  var ccB = $('ccBrightness');
  if (ccB) ccB.addEventListener('input', function () {
    settings.brightness = parseFloat(ccB.value); applySettings(); save();
  });

  /* ---------------- game glue ---------------- */
  window.addEventListener('ps5gameover', function (ev) {
    var score = (ev.detail && ev.detail.score) || 0;
    var ov = $('gameOverlay'); if (ov) ov.classList.remove('hidden');
    var t = $('goTitle'); if (t) t.textContent = 'SCORE ' + score;
    var p = $('goText');
    if (p) p.textContent = 'Run complete. Press Triangle or START to play again, or head back to Home.';
    var b = $('goStart'); if (b) b.textContent = 'PLAY AGAIN';
  });
  window.addEventListener('ps5gamepause', function (ev) {
    toast(ev.detail && ev.detail.paused ? 'Paused · Options to resume' : 'Resumed');
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && window.PS5Game && PS5Game.running) PS5Game.togglePause();
  });

  /* ---------------- start ---------------- */
  if (window.PS5Game) PS5Game.init($('gameCanvas'));
  tickClock(); setInterval(tickClock, 15000);
  setInterval(diagTick, 80);
  fillDeviceInfo();
  applySettings();
  updateCC();
  window.addEventListener('pointerdown', function () { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }, { passive: true });
  boot();
})();
