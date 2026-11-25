/* ============================================================
   controls.js -- DualSense-style virtual controller + input bus
   ------------------------------------------------------------
   * Touch overlay: 2 sticks, d-pad, 4 face buttons, L1/R1,
     analog L2/R2, touchpad, Share, Create, Options, PS, Mute.
   * Hardware input from MainActivity.smali:
       ARENA.key(keyCode, action)   Android KeyEvent buttons
       ARENA.axis(lx,ly,rx,ry,l2,r2,hx,hy)  MotionEvent axes
   * DOM keyboard + navigator.getGamepads() as extra fallbacks.
   * Everything is published on window.Input; press/release events
     are dispatched as `ps5press` / `ps5release` CustomEvents.
   ============================================================ */
(function () {
  'use strict';

  var Input = {
    sticks: { left: { x: 0, y: 0 }, right: { x: 0, y: 0 } },
    buttons: {},
    triggers: { l2: 0, r2: 0 },
    touch: { x: 0, y: 0, dx: 0, dy: 0, down: false },
    hardware: false,
    sensitivity: 1
  };

  var el = function (id) { return document.getElementById(id); };
  var fire = function (type, detail) {
    try { window.dispatchEvent(new CustomEvent(type, { detail: detail })); } catch (e) {}
  };

  Input.settings = function () {
    return (window.PS5 && window.PS5.settings) ? window.PS5.settings : {
      haptics: true, sound: true, sensitivity: 1, scale: 1, alpha: .9, lefty: false, debug: false
    };
  };

  Input.haptic = function (ms) {
    if (!Input.settings().haptics) return;
    try { if (navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {}
  };

  Input.beep = function (freq, dur, type, gain) {
    if (!Input.settings().sound) return;
    try { if (window.PS5 && window.PS5.beep) window.PS5.beep(freq, dur, type, gain); } catch (e) {}
  };

  Input.get = function (name) { return Input.buttons[name] ? 1 : 0; };
  Input.trigger = function (name) { return Input.triggers[name] || 0; };
  Input.axis = function (side) { return Input.sticks[side] || { x: 0, y: 0 }; };

  Input.setButton = function (name, value) {
    var v = value ? 1 : 0;
    var prev = Input.buttons[name] ? 1 : 0;
    if (prev === v) return;
    Input.buttons[name] = v;
    if (v) {
      Input.haptic(12);
      Input.beep(520, .045, 'sine', .035);
      fire('ps5press', { name: name });
    } else {
      fire('ps5release', { name: name });
    }
    var nodes = document.querySelectorAll('[data-btn="' + name + '"]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].classList.toggle('pressed', !!v);
    }
  };

  Input.setTrigger = function (name, value) {
    var v = Math.max(0, Math.min(1, value || 0));
    var prev = Input.triggers[name] || 0;
    Input.triggers[name] = v;
    var node = document.querySelector('[data-trigger="' + name + '"] i');
    if (node) node.style.height = (v * 100) + '%';
    if (prev < .04 && v >= .04) fire('ps5press', { name: name, value: v });
    if (prev >= .04 && v < .04) fire('ps5release', { name: name });
  };

  Input.setStick = function (side, x, y) {
    var s = Input.settings().sensitivity || 1;
    var dz = function (v) {
      v = Math.max(-1, Math.min(1, v * s));
      return Math.abs(v) < .12 ? 0 : v;
    };
    Input.sticks[side].x = dz(x);
    Input.sticks[side].y = dz(y);
    var stick = document.querySelector('[data-stick="' + side + '"]');
    if (stick && stick._knob) {
      stick._knob.style.transform =
        'translate(calc(-50% + ' + (x * 26) + '%), calc(-50% + ' + (y * 26) + '%))';
    }
  };

  Input.snapshot = function () {
    var pressed = [];
    for (var k in Input.buttons) if (Input.buttons[k]) pressed.push(k);
    return {
      sticks: { lx: Input.sticks.left.x, ly: Input.sticks.left.y,
                rx: Input.sticks.right.x, ry: Input.sticks.right.y },
      triggers: { l2: Input.triggers.l2, r2: Input.triggers.r2 },
      pressed: pressed, hardware: Input.hardware
    };
  };

  window.Input = Input;

  /* --------------------------------------------------------
     Native bridge (called by MainActivity.smali via evaluateJavascript)
     -------------------------------------------------------- */
  var KEYMAP = {
    19: 'up', 20: 'down', 21: 'left', 22: 'right', 23: 'cross',
    96: 'cross', 97: 'circle', 98: 'options', 99: 'square', 100: 'triangle',
    101: 'l1', 102: 'l1', 103: 'r1', 104: 'l2', 105: 'r2',
    106: 'l3', 107: 'r3', 108: 'options', 109: 'share', 110: 'ps',
    111: 'create', 188: 'cross', 189: 'circle', 190: 'square', 191: 'triangle',
    192: 'l1', 193: 'r1', 4: 'back', 82: 'share'
  };

  window.ARENA = {
    key: function (code, action) {
      var name = KEYMAP[code];
      if (!name) return;
      Input.hardware = true;
      if (name === 'l2' || name === 'r2') Input.setTrigger(name, action === 0 ? 1 : 0);
      else Input.setButton(name, action === 0 ? 1 : 0);
    },
    /* Axis order from MainActivity.smali (Android MotionEvent constants):
       X, Y, Z, RZ, RX, RY, LTRIGGER, RTRIGGER, GAS, BRAKE, HAT_X, HAT_Y
       DualSense / DualShock 4 usually expose the right stick on Z/RZ and the
       triggers on LTRIGGER/RTRIGGER (the same mapping chiaki-ng uses), while
       generic controllers use RX/RY and GAS/BRAKE.  Accept both. */
    axis: function (x, y, z, rz, rx, ry, lt, rt, gas, brake, hx, hy) {
      Input.hardware = true;
      Input.setStick('left', x || 0, y || 0);
      var zz = z || 0, zrz = rz || 0, rxx = rx || 0, ryy = ry || 0;
      var legacy = Math.abs(zz) + Math.abs(zrz);
      var modern = Math.abs(rxx) + Math.abs(ryy);
      if (legacy >= modern) Input.setStick('right', zz, zrz);
      else Input.setStick('right', rxx, ryy);
      var pos = function (v) { return v > 0 ? Math.min(1, v) : 0; };
      Input.setTrigger('l2', Math.max(pos(lt), pos(brake)));
      Input.setTrigger('r2', Math.max(pos(rt), pos(gas)));
      Input.setButton('left', (hx || 0) < -.5);
      Input.setButton('right', (hx || 0) > .5);
      Input.setButton('up', (hy || 0) < -.5);
      Input.setButton('down', (hy || 0) > .5);
    },
    back: function () {
      if (window.PS5 && window.PS5.back) window.PS5.back();
      else if (history.length > 1) history.back();
    }
  };

  /* --------------------------------------------------------
     Touch overlay wiring
     -------------------------------------------------------- */
  function bind() {
    var controller = el('controller');
    if (!controller) return;

    // simple buttons
    var btns = controller.querySelectorAll('[data-btn]');
    var pointers = {};
    for (var i = 0; i < btns.length; i++) {
      (function (node) {
        var name = node.getAttribute('data-btn');
        node.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          try { node.setPointerCapture(ev.pointerId); } catch (e) {}
          pointers[ev.pointerId] = { node: node, name: name };
          Input.setButton(name, 1);
        });
        var up = function (ev) {
          if (!pointers[ev.pointerId]) return;
          Input.setButton(name, 0);
          delete pointers[ev.pointerId];
        };
        node.addEventListener('pointerup', up);
        node.addEventListener('pointercancel', up);
        node.addEventListener('lostpointercapture', up);
      })(btns[i]);
    }

    // analog sticks
    var sticks = controller.querySelectorAll('[data-stick]');
    for (var j = 0; j < sticks.length; j++) {
      (function (stick) {
        var side = stick.getAttribute('data-stick');
        stick._knob = stick.querySelector('.knob');
        var active = null;
        var move = function (ev) {
          var r = stick.getBoundingClientRect();
          var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          var x = (ev.clientX - cx) / (r.width / 2);
          var y = (ev.clientY - cy) / (r.height / 2);
          var len = Math.sqrt(x * x + y * y);
          if (len > 1) { x /= len; y /= len; }
          Input.setStick(side, x, y);
        };
        stick.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          active = ev.pointerId;
          try { stick.setPointerCapture(ev.pointerId); } catch (e) {}
          stick.classList.add('active');
          move(ev);
        });
        stick.addEventListener('pointermove', function (ev) {
          if (active === ev.pointerId) { ev.preventDefault(); move(ev); }
        });
        var end = function (ev) {
          if (active !== ev.pointerId) return;
          active = null;
          stick.classList.remove('active');
          Input.setStick(side, 0, 0);
        };
        stick.addEventListener('pointerup', end);
        stick.addEventListener('pointercancel', end);
        stick.addEventListener('lostpointercapture', end);
      })(sticks[j]);
    }

    // analog triggers (drag from top to bottom = pressure)
    var triggers = controller.querySelectorAll('[data-trigger]');
    for (var k = 0; k < triggers.length; k++) {
      (function (node) {
        var name = node.getAttribute('data-trigger');
        var active = null;
        var move = function (ev) {
          var r = node.getBoundingClientRect();
          var v = (ev.clientY - r.top) / r.height;
          Input.setTrigger(name, v);
        };
        node.addEventListener('pointerdown', function (ev) {
          ev.preventDefault();
          active = ev.pointerId;
          try { node.setPointerCapture(ev.pointerId); } catch (e) {}
          move(ev);
        });
        node.addEventListener('pointermove', function (ev) {
          if (active === ev.pointerId) { ev.preventDefault(); move(ev); }
        });
        var end = function (ev) {
          if (active !== ev.pointerId) return;
          active = null;
          Input.setTrigger(name, 0);
        };
        node.addEventListener('pointerup', end);
        node.addEventListener('pointercancel', end);
        node.addEventListener('lostpointercapture', end);
      })(triggers[k]);
    }

    // touchpad: swipe position + tap emits a synthetic button
    var tp = el('touchpad');
    if (tp) {
      var dot = tp.querySelector('.tp-dot');
      var tpActive = null, startX = 0, startY = 0, moved = 0;
      tp.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        tpActive = ev.pointerId; startX = ev.clientX; startY = ev.clientY; moved = 0;
        try { tp.setPointerCapture(ev.pointerId); } catch (e) {}
        tp.classList.add('active');
        Input.touch.down = true;
      });
      tp.addEventListener('pointermove', function (ev) {
        if (tpActive !== ev.pointerId) return;
        ev.preventDefault();
        var r = tp.getBoundingClientRect();
        var x = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
        var y = Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height));
        Input.touch.x = x; Input.touch.y = y;
        Input.touch.dx = (ev.clientX - startX) / r.width;
        Input.touch.dy = (ev.clientY - startY) / r.height;
        moved = Math.max(moved, Math.abs(Input.touch.dx) + Math.abs(Input.touch.dy));
        if (dot) { dot.style.left = (x * 100) + '%'; dot.style.top = (y * 100) + '%'; }
      });
      var tpEnd = function (ev) {
        if (tpActive !== ev.pointerId) return;
        tpActive = null; tp.classList.remove('active'); Input.touch.down = false;
        if (moved < .08) { Input.setButton('touchpad', 1); setTimeout(function () { Input.setButton('touchpad', 0); }, 90); }
      };
      tp.addEventListener('pointerup', tpEnd);
      tp.addEventListener('pointercancel', tpEnd);
      tp.addEventListener('lostpointercapture', tpEnd);
    }
  }

  /* --------------------------------------------------------
     Keyboard fallback (desktop preview + Bluetooth keyboards)
     -------------------------------------------------------- */
  var DOMKEYS = {
    37: 'left', 38: 'up', 39: 'right', 40: 'down',
    13: 'cross', 32: 'cross', 66: 'cross', 27: 'circle', 8: 'circle',
    87: 'up', 83: 'down', 65: 'left', 68: 'right',
    73: 'triangle', 74: 'square', 75: 'cross', 76: 'circle',
    81: 'l1', 69: 'r1', 90: 'l2', 67: 'r2',
    88: 'share', 79: 'options', 80: 'ps', 16: 'l3', 17: 'r3'
  };
  // Numpad / gamepad keyCodes reported by WebView keydown
  for (var kk in KEYMAP) DOMKEYS[kk] = KEYMAP[kk];

  window.addEventListener('keydown', function (ev) {
    var name = DOMKEYS[ev.keyCode];
    if (!name) return;
    if (ev.preventDefault) ev.preventDefault();
    if (ev.repeat) return;
    if (name === 'l2' || name === 'r2') Input.setTrigger(name, 1);
    else Input.setButton(name, 1);
  });
  window.addEventListener('keyup', function (ev) {
    var name = DOMKEYS[ev.keyCode];
    if (!name) return;
    if (name === 'l2' || name === 'r2') Input.setTrigger(name, 0);
    else Input.setButton(name, 0);
  });

  /* --------------------------------------------------------
     Standard Gamepad API (works in some Chromium WebViews)
     -------------------------------------------------------- */
  var GPBTN = ['cross', 'circle', 'square', 'triangle', 'l1', 'r1', 'l2', 'r2',
    'share', 'options', 'l3', 'r3', 'up', 'down', 'left', 'right', 'ps'];
  function pollGamepads() {
    try {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (var i = 0; i < pads.length; i++) {
        var p = pads[i];
        if (!p) continue;
        Input.hardware = true;
        Input.setStick('left', p.axes[0] || 0, p.axes[1] || 0);
        Input.setStick('right', p.axes[2] || 0, p.axes[3] || 0);
        for (var b = 0; b < GPBTN.length && b < p.buttons.length; b++) {
          var val = p.buttons[b].value !== undefined ? p.buttons[b].value : (p.buttons[b].pressed ? 1 : 0);
          var nm = GPBTN[b];
          if (nm === 'l2' || nm === 'r2') Input.setTrigger(nm, val);
          else Input.setButton(nm, val > .4);
        }
      }
    } catch (e) { /* Gamepad API not available */ }
    requestAnimationFrame(pollGamepads);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () {
    bind(); requestAnimationFrame(pollGamepads);
  });
  else { bind(); requestAnimationFrame(pollGamepads); }
})();
