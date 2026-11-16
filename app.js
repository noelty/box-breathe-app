(() => {
  const $ = id => document.getElementById(id);
  const PHASES = [
    { key: 'in', label: 'Breathe in' },
    { key: 'hold1', label: 'Hold' },
    { key: 'out', label: 'Breathe out' },
    { key: 'hold2', label: 'Hold' },
  ];
  // Dot path corners: bottom-left -> top-left -> top-right -> bottom-right -> bottom-left
  const CORNERS = [[0, 100], [0, 0], [100, 0], [100, 100], [0, 100]];
  const DEFAULTS = { in: 4, hold1: 4, out: 4, hold2: 4, target: 0, sound: true, vibrate: false };
  const STORE = 'boxbreathe.settings';

  let cfg = load();
  let running = false, paused = false;
  let phase = 0, phaseMs = 0, lastTs = 0, rounds = 0, elapsedMs = 0, raf = 0;
  let audio;

  const inputs = ['in', 'hold1', 'out', 'hold2', 'target'];

  function load() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE)) }; }
    catch { return { ...DEFAULTS }; }
  }
  function save() { try { localStorage.setItem(STORE, JSON.stringify(cfg)); } catch {} }

  function durMs(i) { return cfg[PHASES[i].key] * 1000; }

  function readInputs() {
    for (const k of inputs) {
      const el = $(k);
      let v = Math.floor(Number(el.value));
      if (!Number.isFinite(v)) v = DEFAULTS[k];
      const min = Number(el.min), max = Number(el.max);
      cfg[k] = Math.min(max, Math.max(min, v));
    }
    cfg.sound = $('sound').checked;
    cfg.vibrate = $('vibrate').checked;
    save();
    renderIdle();
  }
  function writeInputs() {
    for (const k of inputs) $(k).value = cfg[k];
    $('sound').checked = cfg.sound;
    $('vibrate').checked = cfg.vibrate;
  }

  function renderSteps() {
    $('steps').innerHTML = PHASES.map((p, i) =>
      durMs(i) > 0 ? `<span class="step" data-i="${i}">${p.label} ${cfg[p.key]}s</span>` : '').join('');
  }

  function render() {
    const d = durMs(phase), p = d ? Math.min(phaseMs / d, 1) : 1;
    const [a, b] = [CORNERS[phase], CORNERS[phase + 1]];
    const dot = $('dot');
    dot.setAttribute('cx', a[0] + (b[0] - a[0]) * p);
    dot.setAttribute('cy', a[1] + (b[1] - a[1]) * p);
    $('count').textContent = Math.max(1, Math.ceil((d - phaseMs) / 1000));
    $('phase').textContent = PHASES[phase].label;
    document.querySelectorAll('.step').forEach(s => s.classList.toggle('active', Number(s.dataset.i) === phase));
    for (let i = 0; i < 4; i++) $('side' + i).classList.toggle('active', i === phase);
    renderStats();
  }

  function renderStats() {
    $('rounds').textContent = rounds;
    $('roundsTarget').textContent = cfg.target ? ` / ${cfg.target}` : '';
    const s = Math.floor(elapsedMs / 1000);
    $('elapsed').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function renderIdle() {
    renderSteps();
    phase = 0; phaseMs = 0; rounds = 0; elapsedMs = 0;
    render();
    $('count').textContent = cfg.in;
    $('phase').textContent = 'Ready';
    document.querySelectorAll('.step, #sides line').forEach(s => s.classList.remove('active'));
    $('dot').setAttribute('cx', 0); $('dot').setAttribute('cy', 100);
  }

  function cue() {
    if (cfg.sound) {
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = phase % 2 === 0 ? 660 : 440; // inhale/exhale higher, holds lower
        g.gain.setValueAtTime(0.15, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.25);
        o.connect(g).connect(audio.destination);
        o.start(); o.stop(audio.currentTime + 0.25);
      } catch {}
    }
    if (cfg.vibrate && navigator.vibrate) navigator.vibrate(40);
  }

  function tick(ts) {
    if (!running || paused) return;
    const dt = Math.min(ts - lastTs, 250); // clamp if tab was throttled
    lastTs = ts;
    phaseMs += dt; elapsedMs += dt;

    let changed = false;
    while (phaseMs >= durMs(phase) ) {
      phaseMs -= durMs(phase);
      phase = (phase + 1) % 4;
      changed = true;
      if (phase === 0) {
        rounds++;
        if (cfg.target && rounds >= cfg.target) { finish(); return; }
      }
      if (durMs(phase) === 0) continue; // skip zero-length holds
    }
    if (changed) cue();
    render();
    raf = requestAnimationFrame(tick);
  }

  function setUi() {
    $('start').textContent = !running ? 'Start' : paused ? 'Resume' : 'Pause';
    $('stop').disabled = !running;
    document.querySelectorAll('#settings input, #reset').forEach(el => el.disabled = running);
  }

  function start() {
    if (!running) {
      running = true; paused = false;
      phase = 0; phaseMs = 0; rounds = 0; elapsedMs = 0;
      cue();
    } else if (paused) {
      paused = false;
    } else {
      paused = true; cancelAnimationFrame(raf);
      $('phase').textContent = 'Paused';
      setUi();
      return;
    }
    setUi();
    lastTs = performance.now();
    render();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false; paused = false;
    cancelAnimationFrame(raf);
    setUi();
    renderIdle();
  }

  function finish() {
    const r = rounds, t = elapsedMs;
    running = false; paused = false;
    cancelAnimationFrame(raf);
    setUi();
    renderIdle();
    rounds = r; elapsedMs = t;
    renderStats();
    $('phase').textContent = 'Done';
    $('count').textContent = '✓';
  }

  $('start').addEventListener('click', start);
  $('stop').addEventListener('click', stop);
  $('settings').addEventListener('change', readInputs);
  $('reset').addEventListener('click', () => { cfg = { ...DEFAULTS }; save(); writeInputs(); renderIdle(); });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !/INPUT|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); start(); }
    if (e.code === 'Escape' && running) stop();
  });

  writeInputs();
  setUi();
  renderIdle();
})();
