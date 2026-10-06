/* Slide choreography. Each slide names its field stage, where the bot stands (an anchor element in
 * the slide's own layout, so portrait and landscape both work), and an enter(S) that writes its
 * timeline. S is the slide context from deck.js: S.tl, S.q/qa, S.rise/wipe/decode/type/row/frameIn,
 * S.at(t, fn) for timed bot direction, S.later(delay, fn), S.spawn(id, opts) for slide-owned bots,
 * S.anchor(name) in stage px, S.cursor(), S.ripple(x, y), S.cls(el, name), S.main.
 */
(function () {
  'use strict';

  const SLIDES = {};
  const CALM = { chaos: 0.42, order: 0.18, calm: 0.8, lens: 0.32, dim: 0.34 };

  // ── cover ────────────────────────────────────────────────────────────────────────────────────
  SLIDES.cover = {
    section: '',
    field: { chaos: 1, order: 0, calm: 0, lens: 1, dim: 0.6 },
    mask: '.cover-display',
    fill: 'Grok',
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.decode(S.q('.kicker'), 0.1);
      S.rise(S.q('.cover-lead'), 0.2);
      if (!S.fieldOk) tl.from(S.q('.cover-display'), { yPercent: 16, opacity: 0, duration: 1.1, ease: 'expo.out' }, 0.4);
      S.wipe(S.q('.cover-sub'), 0.95);
      tl.from(S.q('.cover-cta .gbtn'), { y: 26, opacity: 0, duration: 0.9, ease: 'expo.out' }, 1.25);
      tl.from(S.qa('.cover-cta .tk'), { scale: 0, duration: 0.6, ease: 'back.out(3)', stagger: 0.05 }, 1.5);
      tl.from(S.q('.hint'), { opacity: 0, duration: 0.8 }, 1.8);
      if (S.first) S.at(0.15, () => S.main.assemble({ duration: 1.5 }));
      else S.at(0.1, () => S.main.setMood('happy'));
      S.at(S.first ? 2.1 : 0.9, () => { S.main.look(S.q('.cover-display')); S.main.setMood('idle'); });
      S.at(S.first ? 3.3 : 2.1, () => { S.main.look(S.q('.cover-cta .gbtn')); });
      S.at(S.first ? 4.1 : 2.9, () => { S.main.look(null); S.main.setMood('happy'); S.main.nod(); });
      S.at(S.first ? 5.0 : 3.8, () => S.main.setMood('idle'));
    },
  };

  // ── you are the loop ─────────────────────────────────────────────────────────────────────────
  SLIDES.loop = {
    section: 'מה הוא יודע',
    field: { chaos: 0.62, order: 0.12, calm: 0.6, lens: 0.6, dim: 0.42 },
    main: { anchor: 'loop-center', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.head .body'), 0.4);
      S.frameIn(S.q('.loop-frame'), 0.45);
      S.frameIn(S.q('.fleet-frame'), 0.6);
      S.decode(S.q('.loop-frame .frame-label'), 0.7);
      S.decode(S.q('.fleet-frame .frame-label'), 0.85);
      tl.from(S.q('.loop-ring'), { rotation: -120, scale: 0.6, opacity: 0, duration: 1.3, ease: 'expo.out', transformOrigin: '50% 50%' }, 0.6);
      S.qa('.loop-word').forEach((w, i) => S.decode(w, 0.85 + i * 0.13));
      tl.from(S.q('.loop-runner'), { scale: 0, duration: 0.4, ease: 'back.out(3)' }, 1.3);
      S.at(1.3, () => S.keep(gsap.to(S.q('.loop-orbit'), { rotation: -360, duration: 3.4, ease: 'none', repeat: -1 })));
      S.at(1.1, () => S.main.look(S.q('.loop-runner')));
      S.at(1.9, () => S.main.setMood('sleepy'));
      S.decode(S.q('.loop-frame .frame-foot'), 1.5);

      // the shift: the bot leaves the loop and becomes a fleet
      S.at(3.1, () => { S.main.setMood('surprised'); S.main.look(S.anchor('f1')); });
      S.at(3.45, () => { const a = S.anchor('f1'); S.main.goTo(a.x, a.y, a.w, { hop: true, arc: 150, duration: 0.7 }); });
      S.at(4.35, () => {
        const from = S.anchor('f1');
        S.main.setMood('happy');
        S.main.work(true);
        S.ripple(from.x, from.y);
        const shapes = ['triangle', 'diamond', 'square', 'flower', 'star', 'heart', 'clover', 'sparkle', 'house', 'circle', 'diamond'];
        const tones = ['fill', 'hi', 'pale', 'deep', 'ink'];
        for (let k = 2; k <= 12; k++) {
          const a = S.anchor('f' + k);
          const b = S.spawn('f' + k, { x: from.x, y: from.y, size: a.w * 0.6, shape: shapes[k - 2], tone: tones[k % 5], mood: 'idle', hidden: true });
          const d = 0.035 * k;
          b.popIn({ delay: d });
          b.goTo(a.x, a.y, a.w, { hop: true, arc: 50 + (k % 4) * 22, delay: d, duration: 0.5 });
          S.later(d + 0.55 + (k % 5) * 0.09, () => { b.work(true); b.setMood(k % 3 ? 'focus' : 'idle'); b.look(null); });
        }
      });
      S.decode(S.q('.fleet-frame .frame-foot'), 4.9);
      S.rise(S.q('.statement'), 5.1);
      S.at(5.2, () => { S.main.setMood('focus'); S.main.look(null); });
    },
  };

  // ── not the @grok reply bot ──────────────────────────────────────────────────────────────────
  SLIDES.notgrok = {
    section: 'מה הוא יודע',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.qa('.decoder .drow').forEach((row, i) => S.row(row, 0.5 + i * 0.4));
      S.frameIn(S.q('.reply-card'), 0.5);
      tl.from(S.q('.reply-avatar'), { scale: 0, duration: 0.5, ease: 'back.out(3)' }, 0.75);
      S.type(S.q('.reply-q'), 0.9, { cps: 32, dir: 'rtl' });
      tl.from(S.qa('.reply-answer .sk'), { scaleX: 0, duration: 0.6, ease: 'power3.out', stagger: 0.14, transformOrigin: 'right center' }, 1.75);
      S.wipe(S.q('.reply-end'), 2.3);
      S.frameIn(S.q('.win--tasks'), 1.3);
      const tasks = S.qa('.task');
      tasks.forEach((t, i) => {
        tl.from(t, { opacity: 0, x: 26, duration: 0.5, ease: 'expo.out' }, 1.75 + i * 0.5);
        S.at(2.15 + i * 0.5, () => { S.cls(t.querySelector('.chk'), 'is-on'); S.sfx('check'); });
      });
      tl.from(S.q('.done-chip'), { scaleX: 0, duration: 0.6, ease: 'expo.out' }, 3.55);
      S.at(0.7, () => S.main.look(S.q('.reply-card')));
      S.at(1.6, () => { S.main.setMood('focus'); S.main.work(true); S.main.look(S.q('.win--tasks')); });
      S.at(3.6, () => { S.main.work(false); S.main.setMood('happy'); S.main.hopInPlace(40); });
      S.rise(S.q('.statement'), 3.9);
      S.at(4.9, () => { S.main.setMood('idle'); S.main.look(null); });
    },
  };

  // ── a computer of its own ────────────────────────────────────────────────────────────────────
  SLIDES.computer = {
    section: 'מה הוא יודע',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.intro'), 0.35);
      S.qa('.decoder .drow').forEach((row, i) => S.row(row, 0.65 + i * 0.22));
      S.frameIn(S.q('.win--cloud'), 0.5);
      S.typeText(S.q('.addr-text'), 'mail.google.com', 1.05, 22);
      tl.from(S.qa('.cloud-rows .sk'), { scaleX: 0, transformOrigin: 'right center', duration: 0.6, ease: 'power3.out', stagger: 0.1 }, 1.95);
      tl.from(S.q('.cloud-status'), { opacity: 0, duration: 0.4 }, 2.3);
      tl.from(S.q('.laptop'), { opacity: 0, y: 22, duration: 0.7, ease: 'expo.out' }, 0.9);
      tl.to(S.q('.laptop .lid'), { scaleY: 0.06, duration: 0.65, ease: 'power3.in', transformOrigin: '50% 100%' }, 3.0);
      S.at(3.55, () => S.sfx('lid'));
      tl.to(S.q('.cap-open'), { opacity: 0, duration: 0.2 }, 3.5);
      tl.to(S.q('.cap-closed'), { opacity: 1, duration: 0.25 }, 3.6);
      S.at(0.55, () => S.main.look(S.q('.win--cloud')));
      S.at(1.05, () => { S.main.work(true); S.main.setMood('focus'); });
      S.at(2.8, () => S.main.look(S.q('.laptop')));
      S.at(3.7, () => { S.main.setMood('happy'); S.main.nod(); });
      S.at(4.4, () => { S.main.setMood('focus'); S.main.look(S.q('.win--cloud')); });
    },
  };

  // ── you approve ──────────────────────────────────────────────────────────────────────────────
  SLIDES.control = {
    section: 'מה הוא יודע',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.intro'), 0.35);
      S.qa('.decoder .drow').forEach((row, i) => S.row(row, 0.65 + i * 0.22));
      S.frameIn(S.q('.approve'), 0.5);
      S.decode(S.q('.approve-head'), 0.75);
      S.wipe(S.q('.approve-text'), 0.95);
      tl.from(S.qa('.approve-actions .gbtn'), { y: 16, opacity: 0, duration: 0.6, ease: 'expo.out', stagger: 0.12 }, 1.15);
      S.at(0.7, () => { S.main.setPing(true); S.main.look(S.q('.approve')); });
      S.at(1.9, () => {
        const send = S.q('[data-role="send"]');
        const p = S.point(send);
        const start = S.point(S.q('.approve'));
        const c = S.cursor({ x: start.x - start.w * 0.55, y: start.y + start.h * 0.75 });
        S.main.look(c.el);
        c.moveTo(p.x + 14, p.y + 10, { duration: 1.0 });
        S.later(1.1, () => { c.click(); S.cls(send, 'is-pressed'); S.cls(send, 'is-hot'); S.ripple(p.x, p.y); });
        S.later(1.35, () => send.classList.remove('is-pressed'));
        S.later(1.55, () => {
          gsap.to(S.qa('.approve-actions, .approve-text'), { opacity: 0.25, duration: 0.35 });
          gsap.fromTo(S.q('.approve-sent'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' });
          S.main.setPing(false);
          S.sfx('sent');
          S.main.setMood('happy');
          S.main.hopInPlace(46);
          S.burst(p.x, p.y, { count: 18 });
        });
        S.later(2.2, () => { c.away(); S.main.look(null); });
        S.later(3.1, () => S.main.setMood('idle'));
      });
    },
  };

  // ── show it once ─────────────────────────────────────────────────────────────────────────────
  SLIDES.teach = {
    section: 'מה הוא יודע',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.col-text .body'), 0.35);
      S.wipe(S.q('.col-text .body--soft'), 0.6);
      const steps = S.qa('.tstep');
      tl.from(steps, { opacity: 0, x: 30, duration: 0.6, ease: 'expo.out', stagger: 0.1 }, 0.5);
      tl.set(S.q('.routine-chip'), { opacity: 0 }, 0);
      S.at(0.7, () => S.main.setMood('focus'));
      const per = 0.72;
      S.at(1.2, () => {
        const first = S.point(steps[0]);
        const c = S.cursor({ x: first.x + first.w * 0.7, y: first.y + 90 });
        S.main.look(c.el);
        steps.forEach((st, i) => {
          S.later(0.15 + i * per, () => { const p = S.point(st); c.moveTo(p.x - p.w * 0.28, p.y + 8, { duration: 0.5 }); });
          S.later(0.7 + i * per, () => { c.click(); S.cls(st, 'is-lit'); });
        });
        S.later(0.7 + 4 * per + 0.2, () => c.away());
      });
      const save = 1.2 + 0.9 + 4 * per;
      S.at(save, () => {
        S.sfx('save');
        S.main.setMood('happy');
        S.main.nod();
        const chip = S.q('.routine-chip');
        gsap.fromTo(chip, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'back.out(2)' });
        S.main.look(chip);
        steps.forEach((st) => st.classList.remove('is-lit'));
        gsap.to(steps, { opacity: 0.45, duration: 0.4 });
      });
      // the bot runs it alone, faster
      S.at(save + 1.1, () => {
        S.main.setMood('focus');
        S.main.work(true);
        gsap.to(steps, { opacity: 1, duration: 0.3 });
        const first = S.point(steps[0]);
        const c = S.cursor({ x: first.x + first.w * 0.7, y: first.y + 60, tone: 'ink' });
        S.main.look(c.el);
        steps.forEach((st, i) => {
          S.later(0.05 + i * 0.36, () => { const p = S.point(st); c.moveTo(p.x - p.w * 0.28, p.y + 8, { duration: 0.28, ease: 'power2.inOut' }); });
          S.later(0.33 + i * 0.36, () => { c.click(); S.cls(st, 'is-lit'); });
        });
        S.later(0.4 + 4 * 0.36, () => { c.away(); S.main.work(false); S.main.setMood('happy'); S.main.hopInPlace(36); S.main.look(null); });
      });
      S.hand(S.q('.hand--teach'), save + 3.0);
    },
  };

  // ── a small team ─────────────────────────────────────────────────────────────────────────────
  SLIDES.team = {
    section: 'מה הוא יודע',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.col-text > .body'), 0.35);
      tl.from(S.q('.news'), { opacity: 0, x: 30, duration: 0.7, ease: 'expo.out' }, 0.6);
      S.decode(S.q('.news-tag'), 0.7);
      S.wipe(S.q('.quote'), 0.9);
      const cells = [['t-mail', 'triangle', 'fill'], ['t-exp', 'square', 'hi'], ['t-res', 'diamond', 'pale'], ['t-con', 'flower', 'deep']];
      S.at(0.55, () => { S.main.setStar(true); S.main.setMood('happy'); });
      S.at(0.95, () => {
        const m = S.anchor('main');
        cells.forEach(([id, shape, tone], i) => {
          const a = S.anchor(id);
          const b = S.spawn(id, { x: m.x, y: m.y, size: a.w * 0.5, shape: shape, tone: tone, hidden: true });
          b.popIn({ delay: i * 0.12 });
          b.goTo(a.x, a.y, a.w, { hop: true, arc: 90, delay: i * 0.12, duration: 0.6 });
        });
        S.main.setMood('idle');
      });
      S.at(1.7, () => S.connect(S.q('.org-lines'), 'main', cells.map((c) => c[0])));
      tl.from(S.qa('.org-label'), { opacity: 0, y: 10, duration: 0.5, stagger: 0.08 }, 1.8);
      S.frameIn(S.q('.chat'), 1.5);
      S.decode(S.q('.chat .frame-label'), 1.7);
      S.qa('.msg').forEach((msg, i) => {
        const t = 2.3 + i * 0.9;
        tl.from(msg, { opacity: 0, y: 14, duration: 0.45, ease: 'expo.out' }, t);
        S.wipe(msg.querySelector('.what'), t + 0.08, { duration: 0.6 });
        S.at(t - 0.2, () => {
          const who = msg.dataset.from === 'main' ? S.main : S.bot(msg.dataset.from);
          if (!who) return;
          who.hopInPlace(26);
          const c = who.center();
          const p = S.point(msg);
          S.stream(c.x, c.y - c.r, p.x + p.w * 0.35, p.y);
          S.bots().forEach((b) => b.look(who === b ? msg : { x: c.x, y: c.y }));
        });
      });
      S.at(2.3 + 3 * 0.9 + 0.5, () => { S.main.setPing(true); S.bots().forEach((b) => b.look(null)); S.main.look(null); });
    },
  };

  // ── start today ──────────────────────────────────────────────────────────────────────────────
  SLIDES.start = {
    section: 'מתחילים',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      const rungs = S.qa('.rung');
      rungs.forEach((r, i) => {
        const t = 0.5 + i * 0.55;
        tl.from(r, { opacity: 0, x: 44, duration: 0.75, ease: 'expo.out' }, t);
        S.at(t + 0.1, () => { rungs.forEach((x) => x.classList.remove('is-here')); S.cls(r, 'is-on'); S.cls(r, 'is-here'); S.sfx('step', { i: i }); });
      });
      S.frameIn(S.q('.plans'), 0.8);
      S.decode(S.q('.plans .frame-label'), 1.0);
      S.qa('.plan-line').forEach((l, i) => S.decode(l, 1.15 + i * 0.3));
      S.wipe(S.q('.plans-note'), 1.8);
      S.decode(S.q('.plans-where'), 2.1);
      S.decode(S.q('.shape-cap'), 1.2);
      const seq = [['star', 'hi'], ['heart', 'pale'], ['house', 'fill'], ['sparkle', 'hi'], ['flower', 'deep'], ['circle', 'ink']];
      seq.forEach(([shape, tone], i) => S.at(1.5 + i * 0.7, () => { S.main.setShape(shape); S.main.setTone(tone); S.main.blink(); }));
      S.at(1.5 + seq.length * 0.7 + 0.1, () => { S.main.setMood('happy'); S.main.hopInPlace(30); });
    },
  };

  // ── three tests ──────────────────────────────────────────────────────────────────────────────
  SLIDES.tests = {
    section: 'איך עובדים איתו',
    field: { chaos: 0.3, order: 0.55, calm: 0.7, lens: 0.5, dim: 0.34 },
    main: { anchor: 'c1', shape: 'circle', tone: 'ink', mood: 'idle', size: 0.9 },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.col-text > .body'), 0.35);
      S.frameIn(S.q('.checks'), 0.5);
      const checks = S.qa('.check');
      tl.from(checks, { opacity: 0, x: 30, duration: 0.6, ease: 'expo.out', stagger: 0.14 }, 0.6);
      checks.forEach((c, i) => {
        const t = 1.4 + i * 0.95;
        if (i) S.at(t, () => { const a = S.anchor('c' + (i + 1)); S.main.goTo(a.x, a.y, a.w * 0.9, { hop: true, arc: 100, duration: 0.5 }); });
        else S.at(t, () => S.main.hopInPlace(30));
        S.at(t + 0.55, () => {
          S.cls(c, 'is-on');
          S.sfx('check');
          S.draw(c.querySelector('.tick'));
          const b = S.point(c.querySelector('.box'));
          S.ripple(b.x, b.y);
          S.burst(b.x, b.y, { count: 12, speed: 90 });
          S.main.look(c.querySelector('.check-text'));
        });
      });
      const after = 1.4 + 3 * 0.95;
      S.hand(S.q('.hand--tests'), after + 0.1);
      S.at(after + 0.3, () => { S.main.look(S.q('.hand--tests')); S.main.setMood('focus'); });
      S.rise(S.q('.statement'), after + 0.7);
      S.wipe(S.q('.col-text > .body-sm'), after + 1.3);
      S.at(after + 1.6, () => { S.main.look(null); S.main.setMood('happy'); S.main.nod(); });
    },
  };

  // ── the reviewer ─────────────────────────────────────────────────────────────────────────────
  SLIDES.review = {
    section: 'איך עובדים איתו',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'happy' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.col-text > .body'), 0.35);
      S.frameIn(S.q('.rules'), 0.55);
      S.decode(S.q('.rules .win-title'), 0.7);
      tl.from(S.qa('.rule-list li'), { opacity: 0, x: 24, duration: 0.55, ease: 'expo.out', stagger: 0.16 }, 0.8);
      S.wipe(S.q('.col-text > .body-sm'), 1.6);
      S.decode(S.q('.col-text > .tie'), 1.9);

      const doc = S.q('.doc');
      const fail = S.q('.stamp--fail');
      const pass = S.q('.stamp--pass');
      gsap.set([fail, pass], { xPercent: -50, yPercent: -50, rotation: -8, opacity: 0 });
      S.frameIn(doc, 0.5);
      const sks = S.qa('.doc .sk');
      tl.from(sks, { scaleX: 0, transformOrigin: 'right center', stagger: 0.08, duration: 0.5, ease: 'power3.out' }, 0.75);
      tl.from(doc, { x: 70, duration: 0.9, ease: 'expo.out' }, 0.5);
      tl.set(S.qa('.misses li'), { opacity: 0 }, 0);
      let rev = null;
      S.at(0.45, () => {
        const a = S.anchor('reviewer');
        rev = S.spawn('reviewer', { x: a.x, y: a.y, size: a.w, shape: 'diamond', tone: 'deep', mood: 'skeptic', hidden: true });
        rev.popIn({ delay: 0.1 });
        rev.look(doc);
        S.main.look(doc);
      });
      const scan = (t0) => {
        const line = S.q('.scanline');
        tl.fromTo(line, { top: 30, opacity: 1 }, { top: doc.offsetHeight - 30, duration: 1.3, ease: 'none' }, t0);
        tl.to(line, { opacity: 0, duration: 0.2 }, t0 + 1.3);
        S.at(t0, () => {
          S.sfx('scan', { dur: 1.3 });
          if (!rev) return;
          rev.setMood('focus');
          const d = S.point(doc);
          const sweep = { k: 0 };
          S.keep(gsap.to(sweep, {
            k: 1, duration: 1.3, ease: 'none',
            onUpdate: () => rev.look({ x: d.x + Math.sin(sweep.k * Math.PI * 6) * d.w * 0.4, y: d.y - d.h / 2 + 30 + sweep.k * (d.h - 60) }),
          }));
        });
      };
      scan(1.5);
      tl.fromTo(fail, { opacity: 0, scale: 2.3, rotation: -18 }, { opacity: 1, scale: 1, rotation: -8, duration: 0.42, ease: 'back.out(2.2)' }, 3.0);
      S.at(3.05, () => {
        const d = S.point(doc);
        S.sfx('stamp', { kind: 'fail' });
        S.ripple(d.x, d.y);
        S.shake();
        S.burst(d.x, d.y, { count: 20, speed: 180, color: '#E6ECDD' });
        if (rev) { rev.setMood('skeptic'); rev.look(S.main.center()); }
        S.main.setMood('sad');
        S.main.wince();
      });
      tl.to(S.qa('.misses li'), { opacity: 1, duration: 0.01, stagger: 0.3 }, 3.3);
      S.qa('.misses li').forEach((li, i) => S.type(li, 3.3 + i * 0.3, { cps: 40, dir: 'rtl' }));
      // the writer fixes it
      S.at(4.5, () => { S.main.setMood('focus'); S.main.work(true); S.main.look(doc); });
      tl.to(fail, { opacity: 0, scale: 0.85, duration: 0.3 }, 4.6);
      tl.to(S.qa('.misses li'), { opacity: 0.35, duration: 0.3 }, 4.6);
      tl.to(sks, { scaleX: 0.15, transformOrigin: 'right center', duration: 0.3, stagger: 0.05, ease: 'power2.in' }, 4.7);
      S.at(4.7, () => S.sfx('fix'));
      tl.to(sks, { scaleX: 1, duration: 0.45, stagger: 0.06, ease: 'expo.out' }, 5.2);
      S.at(5.8, () => { S.main.work(false); S.main.setMood('idle'); });
      scan(5.9);
      tl.fromTo(pass, { opacity: 0, scale: 2.3, rotation: -18 }, { opacity: 1, scale: 1, rotation: -8, duration: 0.42, ease: 'back.out(2.2)' }, 7.4);
      S.at(7.45, () => {
        const d = S.point(doc);
        S.sfx('stamp', { kind: 'pass' });
        S.ripple(d.x, d.y);
        S.burst(d.x, d.y, { count: 24, speed: 200 });
        if (rev) { rev.setMood('happy'); rev.hopInPlace(30); rev.look(null); }
        S.main.setMood('happy');
        S.main.hopInPlace(44);
        S.main.look(null);
      });
    },
  };

  // ── three tries ──────────────────────────────────────────────────────────────────────────────
  SLIDES.tries = {
    section: 'איך עובדים איתו',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.col-text > .body'), 0.35);
      tl.from(S.q('.lives'), { opacity: 0, duration: 0.5 }, 0.7);
      tl.from(S.qa('.life'), { scale: 0, duration: 0.45, ease: 'back.out(3)', stagger: 0.1 }, 0.8);
      S.decode(S.q('.col-text > .tie'), 1.1);
      S.frameIn(S.q('.term'), 0.5);
      const lives = S.qa('.life');
      const lines = S.qa('.term-body .tl');
      tl.set(lines, { opacity: 0 }, 0);
      let t = 0.95;
      S.at(0.9, () => { S.main.setMood('focus'); S.main.work(true); S.main.look(S.q('.term')); });
      lines.forEach((ln) => {
        const n = Math.max(1, ln.textContent.replace(/\s+$/, '').length);
        tl.set(ln, { opacity: 1 }, t);
        S.typeLine(ln, t, 74);
        S.at(t, () => S.main.look(ln));
        t += Math.max(0.14, n / 74) + 0.06;
        if (/attempt 2/.test(ln.textContent)) S.at(t - 0.1, () => { S.main.setMood('focus'); S.main.work(true); });
        if (ln.dataset.beat === 'fail') {
          S.at(t, () => {
            S.sfx('fail');
            S.main.work(false); S.main.setMood('sad'); S.main.wince();
            S.cls(lives[0], 'is-failed');
            const p = S.point(ln); S.ripple(p.x, p.y);
          });
          t += 0.45;
        }
        if (ln.dataset.beat === 'pass') {
          S.at(t, () => {
            S.sfx('pass');
            S.main.work(false); S.main.setMood('happy'); S.main.hopInPlace(44);
            S.cls(lives[1], 'is-passed');
            const p = S.point(ln.querySelector('.t-pass') || ln); S.ripple(p.x, p.y); S.burst(p.x, p.y, { count: 16 });
          });
          t += 0.4;
        }
      });
      S.at(t + 0.4, () => { S.main.look(null); S.main.setMood('idle'); });
    },
  };

  // ── which Grok for which job ─────────────────────────────────────────────────────────────────
  SLIDES.roster = {
    section: 'מתחת למכסה',
    field: { chaos: 0.35, order: 0.4, calm: 0.72, lens: 0.5, dim: 0.34 },
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'focus' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.head .body'), 0.35);
      const rows = S.qa('.decoder--roster .drow');
      rows.forEach((r, i) => S.row(r, 0.55 + i * 0.18));
      S.wipe(S.q('.roster-foot .body-sm'), 1.3);
      S.decode(S.q('.reality'), 1.6);
      const cards = S.qa('.router .card');
      gsap.set(cards, { xPercent: -50, yPercent: -50, x: 0, y: 0, opacity: 0 });
      cards.forEach((card, i) => {
        const t = 1.6 + i * 0.95;
        const row = rows[Number(card.dataset.lane)];
        S.at(t, () => {
          const router = S.point(S.q('.router'));
          const m = S.main.center();
          const term = S.point(row.querySelector('.term'));
          const ox = m.x - router.x, oy = m.y - router.y - m.r - 30;
          gsap.set(card, { x: ox, y: oy, scale: 0.6, opacity: 0 });
          S.main.look(card);
          S.main.sy.v -= 3;
          const tw = gsap.timeline();
          tw.to(card, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' });
          tw.call(() => S.main.look(row));
          tw.call(() => S.sfx('toss'), null, 0.45);
          tw.to(card, { x: term.x - router.x, y: term.y - router.y, duration: 0.75, ease: 'power3.inOut' }, 0.45);
          tw.to(card, { scale: 0.4, opacity: 0, duration: 0.25, ease: 'power2.in' }, 1.05);
          tw.call(() => { S.cls(row, 'is-on'); S.ripple(term.x, term.y); S.burst(term.x, term.y, { count: 10, speed: 80 }); }, null, 1.15);
          S.keep(tw);
        });
      });
      S.at(1.6 + 4 * 0.95 + 0.4, () => { S.main.look(null); S.main.setMood('happy'); S.main.nod(); });
    },
  };

  // ── the 200K cliff ───────────────────────────────────────────────────────────────────────────
  SLIDES.cliff = {
    section: 'מתחת למכסה',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle', size: 0.95 },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.col-text > .body'), 0.35);
      tl.from(S.qa('.bullets li'), { opacity: 0, x: 26, duration: 0.6, ease: 'expo.out', stagger: 0.18 }, 0.7);
      S.frameIn(S.q('.tokens'), 0.5);
      S.decode(S.q('.tok-head .machine'), 0.75);
      S.decode(S.q('.tok-price .machine'), 0.85);
      tl.from(S.q('.price'), { opacity: 0, scale: 0.6, duration: 0.5, ease: 'back.out(2)' }, 0.95);
      tl.from(S.q('.tok-line'), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.6, ease: 'expo.out' }, 1.0);

      const fill = S.q('.tok-fill');
      const count = S.q('.tok-count');
      const price = S.q('.price');
      const bar = S.q('.tok-bar');
      const MAX = 280000, LINE = 200000;
      const proxy = { v: 0 };
      const origPrice = price.textContent;
      S.dispose(() => { price.textContent = origPrice; price.classList.remove('is-hot'); fill.classList.remove('is-hot'); fill.style.width = ''; count.textContent = '0'; });
      const fmt = (v) => Math.round(v / 1000) * 1000;
      let crossed = false;
      const edge = () => {
        const b = S.point(bar);
        const f = Math.min(proxy.v, crossed ? LINE : proxy.v) / MAX;
        const size = S.main.size.t;
        return { x: b.x + b.w / 2 - f * b.w, y: b.y - b.h / 2 - size / 2 - 14 };
      };
      const paint = () => {
        fill.style.width = (proxy.v / MAX) * 100 + '%';
        count.textContent = fmt(proxy.v).toLocaleString('en-US');
      };
      S.at(1.2, () => { S.main.track(edge); S.main.walk(true); S.main.setMood('focus'); S.main.look(S.q('.tok-line')); });
      S.at(1.3, () => S.sfx('fill', { dur: 2.8 }));
      tl.to(proxy, {
        v: 214000, duration: 3.4, ease: 'power1.inOut',
        onUpdate: () => {
          paint();
          if (!crossed && proxy.v >= LINE) {
            crossed = true;
            S.sfx('alert');
            price.textContent = '×2';
            price.classList.add('is-hot');
            fill.classList.add('is-hot');
            gsap.fromTo(price, { scale: 1.6 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
            const p = S.point(price);
            S.ripple(p.x, p.y);
            S.main.walk(false);
            S.main.setMood('surprised');
            S.main.look({ x: S.main.center().x - 200, y: S.main.center().y + 260 });
            S.main.wobble(1.4);
            S.shake(5);
          }
        },
      }, 1.3);
      S.at(5.0, () => { S.main.setMood('sad'); S.main.wobble(-0.8); });
      // prune instead of paying
      tl.to(proxy, {
        v: 195000, duration: 0.95, ease: 'power3.inOut',
        onUpdate: () => {
          paint();
          if (crossed && proxy.v < LINE) {
            crossed = false;
            S.sfx('relief');
            price.textContent = '×1';
            price.classList.remove('is-hot');
            fill.classList.remove('is-hot');
            gsap.fromTo(price, { scale: 1.4 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
          }
        },
      }, 5.7);
      S.at(6.8, () => { S.main.setMood('happy'); S.main.look(null); S.main.hopInPlace(28); });
    },
  };

  // ── what really stops people ─────────────────────────────────────────────────────────────────
  SLIDES.stops = {
    section: 'בפועל',
    field: CALM,
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      S.wipe(S.q('.head .body'), 0.35);
      const blocks = S.qa('.block');
      blocks.forEach((b, i) => {
        S.frameIn(b, 0.55 + i * 0.15);
        S.wipe(b.querySelector('.block-title'), 0.7 + i * 0.15);
        S.wipe(b.querySelector('.body-sm'), 0.9 + i * 0.15);
      });
      tl.from(S.q('.tray'), { opacity: 0, y: 14, duration: 0.6, ease: 'expo.out' }, 1.1);
      S.rise(S.q('.statement'), 3.7);
      S.decode(S.q('.s-stops .tie'), 4.3);
      S.hand(S.q('.hand--stops'), 4.6);

      const sheets = S.q('.sheets');
      const rate = S.q('.tray-rate');
      const brief = S.q('.brief-bar');
      const orig = rate.textContent;
      S.dispose(() => { sheets.innerHTML = ''; rate.textContent = orig; });
      const add = (n, delay) => {
        for (let k = 0; k < n; k++) {
          const s = document.createElement('i');
          s.className = 'sheet';
          sheets.appendChild(s);
          const idx = sheets.children.length - 1;
          gsap.fromTo(s, { bottom: idx * 11 + 70, opacity: 0, rotation: (Math.random() - 0.5) * 16 }, { bottom: idx * 11, opacity: 1, rotation: (Math.random() - 0.5) * 6, duration: 0.5, delay: delay + k * 0.07, ease: 'bounce.out' });
          S.later(delay + k * 0.07 + 0.3, () => S.sfx('drop'));
        }
      };
      S.at(1.4, () => { add(2, 0); S.main.look(S.q('.tray')); });
      S.at(2.2, () => {
        rate.textContent = '30%';
        gsap.fromTo(rate, { scale: 1.5 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
        add(10, 0);
        S.main.setMood('surprised');
        S.main.wobble(1);
      });
      S.at(3.3, () => {
        S.sfx('shrink');
        gsap.to(brief, { scaleX: 0.5, duration: 0.8, ease: 'power3.inOut' });
        S.main.look(brief);
        S.main.setMood('focus');
      });
      S.at(3.9, () => {
        const all = Array.from(sheets.children).slice(2);
        S.sfx('whisk');
        gsap.to(all, { opacity: 0, y: -40, duration: 0.4, stagger: 0.03, ease: 'power2.in', onComplete: () => all.forEach((x) => x.remove()) });
        rate.textContent = '5%';
        gsap.fromTo(rate, { scale: 1.4 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
        S.main.setMood('happy');
        S.main.hopInPlace(30);
      });
      S.at(5.2, () => { S.main.look(null); S.main.setMood('idle'); });
    },
  };

  // ── one month ────────────────────────────────────────────────────────────────────────────────
  SLIDES.month = {
    section: 'בפועל',
    field: { chaos: 0.25, order: 0.7, calm: 0.62, lens: 0.5, dim: 0.34 },
    main: { anchor: 'm1', shape: 'circle', tone: 'ink', mood: 'idle' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.h2'), 0.05);
      const stairs = S.qa('.stair');
      stairs.forEach((st, i) => {
        const t = 0.45 + i * 0.85;
        const tread = st.querySelector('.stair-tread');
        if (tread && getComputedStyle(tread).display !== 'none') tl.from(tread, { scaleX: 0, duration: 0.7, ease: 'expo.out' }, t);
        tl.from(st, { opacity: 0, y: 24, duration: 0.6, ease: 'expo.out' }, t);
        S.decode(st.querySelector('.stair-title'), t + 0.1);
        S.wipe(st.querySelector('.stair-body'), t + 0.25);
        S.at(t + 0.2, () => {
          const a = S.anchor('m' + (i + 1));
          if (i) S.main.goTo(a.x, a.y, a.w, { hop: true, arc: 110, duration: 0.55 });
          else S.main.hopInPlace(26);
          S.cls(st, 'is-on');
          S.sfx('step', { i: i + 1 });
        });
      });
      S.rise(S.q('.statement'), 4.1);
      S.at(4.0, () => { S.main.setMood('happy'); S.main.look(null); });
    },
  };

  // ── close ────────────────────────────────────────────────────────────────────────────────────
  SLIDES.close = {
    section: '',
    field: { chaos: 0.5, order: 0.1, calm: 0.82, lens: 0.7, dim: 0.42 },
    mask: '.close-display',
    fill: 'משימה',
    main: { anchor: 'main', shape: 'circle', tone: 'ink', mood: 'happy' },
    enter(S) {
      const tl = S.tl;
      S.rise(S.q('.close-lead'), 0.1);
      if (!S.fieldOk) tl.from(S.q('.close-display'), { yPercent: 16, opacity: 0, duration: 1.1, ease: 'expo.out' }, 0.4);
      S.wipe(S.q('.close-sub'), 1.2);
      S.wipe(S.q('.close-small'), 1.5);
      tl.from(S.q('.sign'), { opacity: 0, y: 16, duration: 0.8, ease: 'expo.out' }, 1.8);
      const crew = [['k1', 'triangle', 'fill'], ['k2', 'square', 'hi'], ['k3', 'diamond', 'pale'], ['k4', 'flower', 'deep']];
      S.at(0.45, () => {
        crew.forEach(([id, shape, tone], i) => {
          const a = S.anchor(id);
          const b = S.spawn(id, { x: a.x, y: a.y, size: a.w, shape: shape, tone: tone, hidden: true, mood: 'happy' });
          b.popIn({ delay: i * 0.12 });
        });
      });
      S.at(1.3, () => S.main.wave());
      S.at(2.7, () => {
        S.bots().forEach((b, i) => S.later(i * 0.12, () => { b.work(true); b.setMood('focus'); b.hopInPlace(20); }));
      });
      S.at(4.3, () => { S.bots().forEach((b) => b.setMood('idle')); S.main.setMood('happy'); });
    },
  };

  window.SLIDES = SLIDES;
})();
