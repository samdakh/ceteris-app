/* Ceteris supply and demand: the interactive graph. Students drag the demand or supply curve
   up or down (snapped to the graph's step) to show a market shock, a tax or a subsidy, or move a
   horizontal price line for a ceiling or floor. The graph shades consumer and producer surplus,
   the tax wedge, the deadweight loss and any shortage or surplus, and lists the numbers.

   SDGraph.create(element, cfg, options) → { getState, setState, reset, destroy }
     cfg      { demand: {a, b}, supply: {c, d}, step, axes: {q, qUnit, p},
                tools: {shift, tax, subsidy, ceiling, floor},
                show: {values, surplus, wedge, dwl, shortage},
                hide: [question keys whose numbers students must work out: CS, PS, revenue, cost, DWL, gap] }
     options  { state, onChange(state, solved), interactive (default true), readouts (default true),
                caption, idPrefix }
   The math lives in sd-math.js (window.SDMath). */
(function () {
  'use strict';
  const M = window.SDMath;
  const NS = 'http://www.w3.org/2000/svg';
  const W = 600, H = 420, ml = 58, mr = 26, mt = 18, mb = 50, pw = W - ml - mr, ph = H - mt - mb;
  const MODES = [
    ['shift', 'Shift curves'], ['tax', 'Tax'], ['subsidy', 'Subsidy'], ['ceiling', 'Price ceiling'], ['floor', 'Price floor']
  ];
  const HINTS = {
    shift: 'Drag either curve up or down to show a change in demand or supply.',
    tax: 'Drag supply up (a tax on sellers) or demand down (a tax on buyers) by the size of the tax.',
    subsidy: 'Drag supply down (a subsidy to sellers) or demand up (a subsidy to buyers) by the size of the subsidy.',
    ceiling: 'Drag the price line. A ceiling matters only below the equilibrium price.',
    floor: 'Drag the price line. A floor matters only above the equilibrium price.'
  };
  let uid = 0;

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r2 = v => Math.round(v * 100) / 100;
  const money = v => (v == null ? '—' : (v < 0 ? '−$' : '$') + (Number.isInteger(r2(Math.abs(v))) ? Math.abs(r2(v)).toLocaleString('en-US') : Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })));
  const qty = v => (v == null ? '—' : r2(v).toLocaleString('en-US', { maximumFractionDigits: 2 }));
  function niceStep(max, target) {
    const raw = max / target, p = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw) || 10 * p;
  }
  const niceCeil = (v, step) => Math.ceil(v / step - 1e-9) * step;

  function create(el, cfgIn, opts) {
    opts = opts || {};
    const cfg = normalize(cfgIn);
    const id = (opts.idPrefix || 'sdg') + (++uid);
    const interactive = opts.interactive !== false, showReadouts = opts.readouts !== false;
    const tools = MODES.filter(([m]) => cfg.tools[m]);
    let state = Object.assign({ mode: tools.length ? tools[0][0] : 'shift', dShift: 0, sShift: 0, price: null }, opts.state || {});
    const lim = M.limits(cfg);

    // Axes, fixed from the original curves so the picture doesn't jump while dragging.
    const e0 = M.eq(cfg.demand.a, cfg.demand.b, cfg.supply.c, cfg.supply.d);
    const qStep = niceStep(cfg.demand.a / cfg.demand.b * 1.1, 6), qMax = niceCeil(cfg.demand.a / cfg.demand.b * 1.1, qStep);
    const pStep = niceStep(cfg.demand.a * 1.3, 6), pMax = niceCeil(cfg.demand.a * 1.3, pStep);
    const X = q => ml + (q / qMax) * pw, Y = p => mt + (1 - p / pMax) * ph;

    el.classList.add('sdg');
    el.innerHTML = `
      ${interactive && tools.length > 1 ? `<div class="sdg-modes" role="radiogroup" aria-label="What to show">${tools.map(([m, label]) => `<button type="button" role="radio" data-mode="${m}">${label}</button>`).join('')}</div>` : ''}
      ${interactive ? `<div class="sdg-bar"><span class="sdg-hint" id="${id}-hint"></span><button type="button" class="sdg-reset">Reset</button></div>` : ''}
      <div class="sdg-body${showReadouts ? '' : ' no-readouts'}">
        <figure class="sdg-fig">
          <svg class="sdg-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(opts.caption || 'Supply and demand graph')}" ${interactive ? `aria-describedby="${id}-hint"` : ''}></svg>
        </figure>
        ${showReadouts ? `<div class="sdg-read" aria-live="polite"></div>` : ''}
      </div>`;
    const svg = el.querySelector('svg'), readEl = el.querySelector('.sdg-read');

    function solved() { return M.solve(cfg, state); }

    // ---- Drawing ----
    function line(x1, y1, x2, y2, cls, extra) { return `<line class="${cls}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${extra || ''}/>`; }
    function poly(pts, cls) { return `<polygon class="${cls}" points="${pts.map(([q, p]) => `${X(q).toFixed(1)},${Y(p).toFixed(1)}`).join(' ')}"/>`; }
    function demandSeg(A) { const qEnd = Math.min(qMax, A / cfg.demand.b); return [[0, A], [qEnd, A - cfg.demand.b * qEnd]]; }
    function supplySeg(C) {
      const q0 = C < 0 ? -C / cfg.supply.d : 0, qTop = (pMax - C) / cfg.supply.d, qEnd = Math.min(qMax, qTop);
      return [[q0, C + cfg.supply.d * q0], [qEnd, C + cfg.supply.d * qEnd]];
    }
    function centroid(pts) { const n = pts.length; return [pts.reduce((t, p) => t + p[0], 0) / n, pts.reduce((t, p) => t + p[1], 0) / n]; }
    const hidden = k => (cfg.hide || []).includes(k);
    // Push labels apart along one axis (sorted by pos) so none overlap; keep them inside [lo, hi].
    function dodge(items, lo, hi) {
      for (let i = 1; i < items.length; i++) { const gap = (items[i - 1].size + items[i].size) / 2 + 2; if (items[i].pos < items[i - 1].pos + gap) items[i].pos = items[i - 1].pos + gap; }
      const last = items[items.length - 1];
      if (last && last.pos + last.size / 2 > hi) {
        last.pos = hi - last.size / 2;
        for (let i = items.length - 2; i >= 0; i--) { const gap = (items[i].size + items[i + 1].size) / 2 + 2; if (items[i].pos > items[i + 1].pos - gap) items[i].pos = items[i + 1].pos - gap; }
      }
      if (items[0] && items[0].pos - items[0].size / 2 < lo) {   // too crowded for both ends: start at lo and let it run over
        items[0].pos = lo + items[0].size / 2;
        for (let i = 1; i < items.length; i++) { const gap = (items[i - 1].size + items[i].size) / 2 + 2; if (items[i].pos < items[i - 1].pos + gap) items[i].pos = items[i - 1].pos + gap; }
      }
    }
    // The values of the points on the graph, marked on the axes like ticks; regular ticks that would clash give way.
    function axisMarks(marks, pTicks, qTicks) {
      const uniq = [];
      marks.forEach(m => { const o = uniq.find(u => u.ax === m.ax && Math.abs(u.v - m.v) < 1e-6); if (!o) uniq.push(Object.assign({}, m)); else if (m.cls === 'now') o.cls = 'now'; });
      const charW = 7;
      const ps = uniq.filter(m => m.ax === 'p').map(m => Object.assign(m, { text: money(m.v), pos: Y(m.v), size: 13 })).sort((a, b) => a.pos - b.pos);
      const qs = uniq.filter(m => m.ax === 'q').map(m => Object.assign(m, { text: qty(m.v), pos: X(m.v) })).map(m => Object.assign(m, { size: m.text.length * charW + 6 })).sort((a, b) => a.pos - b.pos);
      dodge(ps, mt - 6, mt + ph + 6); dodge(qs, ml - 20, W - 4);
      let out = '';
      pTicks.forEach(p => { if (!ps.some(m => Math.abs(m.pos - Y(p)) < 13)) out += `<text class="sdg-tick" x="${ml - 8}" y="${(Y(p) + 4).toFixed(1)}" text-anchor="end">${money(p)}</text>`; });
      qTicks.forEach(q => { const w = qty(q).length * charW; if (!qs.some(m => Math.abs(m.pos - X(q)) < (m.size + w) / 2 + 2)) out += `<text class="sdg-tick" x="${X(q).toFixed(1)}" y="${mt + ph + 18}" text-anchor="middle">${qty(q)}</text>`; });
      ps.forEach(m => { out += line(ml - 5, Y(m.v), ml, Y(m.v), 'sdg-mark-tick ' + m.cls) + `<text class="sdg-mark ${m.cls}" x="${ml - 8}" y="${(m.pos + 4).toFixed(1)}" text-anchor="end">${m.text}</text>`; });
      qs.forEach(m => { out += line(X(m.v), mt + ph, X(m.v), mt + ph + 5, 'sdg-mark-tick ' + m.cls) + `<text class="sdg-mark ${m.cls}" x="${m.pos.toFixed(1)}" y="${mt + ph + 18}" text-anchor="middle">${m.text}</text>`; });
      return out;
    }
    let avoid = [];   // handle positions (px) that area labels step aside from
    function areaLabel(pts, text, cls) {
      const c = centroid(pts).map((v, i) => i ? Y(v) : X(v));
      const px = pts.map(p => [X(p[0]), Y(p[1])]);
      const cands = [c];
      [0.3, 0.5].forEach(t => px.forEach(v => cands.push([c[0] + (v[0] - c[0]) * t, c[1] + (v[1] - c[1]) * t])));
      const clear = pt => avoid.every(h => Math.hypot(h[0] - pt[0], h[1] - pt[1]) > 30);
      const [x, y] = cands.find(clear) || c;
      return `<text class="sdg-area-label ${cls || ''}" x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle">${text}</text>`;
    }
    const big = pts => { const xs = pts.map(p => X(p[0])), ys = pts.map(p => Y(p[1])); return Math.max(...xs) - Math.min(...xs) > 38 && Math.max(...ys) - Math.min(...ys) > 16; };

    function render() {
      const s = solved(), c = cfg.show;
      const { D0, S0, D1, S1 } = s.curves;
      const shiftedD = Math.abs(state.dShift) > 1e-9, shiftedS = Math.abs(state.sShift) > 1e-9;
      const isWedge = state.mode === 'tax' || state.mode === 'subsidy';
      const ctl = s.control && s.control.binding ? s.control : null;
      let g = '';

      // Grid and axes
      const qTicks = [], pTicks = [];
      for (let q = 0; q <= qMax + 1e-9; q += qStep) { g += line(X(q), mt, X(q), mt + ph, 'sdg-grid'); qTicks.push(q); }
      for (let p = 0; p <= pMax + 1e-9; p += pStep) { g += line(ml, Y(p), ml + pw, Y(p), 'sdg-grid'); pTicks.push(p); }
      g += line(ml, mt, ml, mt + ph, 'sdg-axis') + line(ml, mt + ph, ml + pw, mt + ph, 'sdg-axis');
      g += `<text class="sdg-axis-title" x="${ml + pw / 2}" y="${H - 8}" text-anchor="middle">${esc(cfg.axes.q)}${cfg.axes.qUnit ? ` (${esc(cfg.axes.qUnit)})` : ''}</text>`;
      g += `<text class="sdg-axis-title" transform="translate(14 ${mt + ph / 2}) rotate(-90)" text-anchor="middle">${esc(cfg.axes.p)}</text>`;

      // Where the curve handles go (computed first so area labels can avoid them).
      const hD = (() => { const sg = demandSeg(D1.a), q = Math.min(qMax * 0.12, sg[1][0] * 0.5); return [q, D1.a - cfg.demand.b * q]; })();
      const hS = (() => { const sg = supplySeg(S1.c), q = Math.min(qMax * 0.88, sg[1][0] - 0.06 * qMax); return [q, S1.c + cfg.supply.d * q]; })();
      avoid = interactive ? [hD, hS].map(h => [X(h[0]), Y(h[1])]) : [];

      // Areas
      g += `<g clip-path="url(#${id}-clip)">`;
      if (s.Q > 0) {
        if (isWedge && (s.tax || s.subsidy)) {
          const cs = [[0, s.Pb], [0, D0.a], [s.Q, s.Pb]], ps = [[0, S0.c], [0, s.Ps], [s.Q, s.Ps]];
          if (c.surplus) { g += poly(cs, 'sdg-cs') + poly(ps, 'sdg-ps'); if (big(cs)) g += areaLabel(cs, 'CS'); if (big(ps)) g += areaLabel(ps, 'PS'); }
          if (c.wedge) {
            const rect = [[0, s.Ps], [0, s.Pb], [s.Q, s.Pb], [s.Q, s.Ps]];
            g += poly(rect, s.tax ? 'sdg-rev' : 'sdg-cost');
            if (big(rect)) g += areaLabel(rect, s.tax ? 'Tax revenue' : 'Subsidy cost', 'on-fill');
          }
          if (c.dwl) {
            const t = s.tax ? [[s.Q, s.Pb], [s.Q, s.Ps], [s.e0.Q, s.e0.P]] : [[s.e0.Q, s.e0.P], [s.Q, s.Ps], [s.Q, s.Pb]];
            g += poly(t, 'sdg-dwl');
          }
        } else if (ctl) {
          const Qt = s.Q, p = ctl.price, Dq = D1.a - cfg.demand.b * Qt, Sq = S1.c + cfg.supply.d * Qt;
          const cs = [[0, p], [0, D1.a], [Qt, Dq], [Qt, p]], ps = [[0, S1.c], [0, p], [Qt, p], [Qt, Sq]];
          if (c.surplus) { g += poly(cs, 'sdg-cs') + poly(ps, 'sdg-ps'); if (big(cs)) g += areaLabel(cs, 'CS'); if (big(ps)) g += areaLabel(ps, 'PS'); }
          if (c.dwl) g += poly([[Qt, Dq], [Qt, Sq], [s.e1.Q, s.e1.P]], 'sdg-dwl');
        } else if (c.surplus) {
          const P = s.e1.P, cs = [[0, P], [0, D1.a], [s.e1.Q, P]], ps = [[0, S1.c], [0, P], [s.e1.Q, P]];
          g += poly(cs, 'sdg-cs') + poly(ps, 'sdg-ps');
          if (big(cs)) g += areaLabel(cs, 'CS'); if (big(ps)) g += areaLabel(ps, 'PS');
        }
      }
      g += '</g>';

      // Curves: the originals stay, dashed, once a curve has moved.
      const seg = (pts, cls, extra) => line(X(pts[0][0]), Y(pts[0][1]), X(pts[1][0]), Y(pts[1][1]), cls, extra);
      g += `<g clip-path="url(#${id}-clip)">`;
      if (shiftedD) g += seg(demandSeg(D0.a), 'sdg-curve sdg-d sdg-old');
      if (shiftedS) g += seg(supplySeg(S0.c), 'sdg-curve sdg-s sdg-old');
      const dSeg = demandSeg(D1.a), sSeg = supplySeg(S1.c);
      g += seg(dSeg, 'sdg-curve sdg-d') + seg(sSeg, 'sdg-curve sdg-s');
      if (interactive) {
        g += seg(dSeg, 'sdg-hitline', 'data-drag="D"') + seg(sSeg, 'sdg-hitline', 'data-drag="S"');
      }
      g += '</g>';
      // Direct labels at the curves' right ends (identity never by colour alone).
      const labPos = (pts, cls) => { const [q, p] = pts[1]; return [Math.min(X(q) + 6, W - 4), Math.max(mt + 12, Math.min(Y(p) + (cls.startsWith('sdg-dl') ? -6 : 4), mt + ph - 4))]; };
      const lab = (pts, text, cls, nudge) => { const [x, y] = labPos(pts, cls); return `<text class="sdg-curve-label ${cls}" x="${x.toFixed(1)}" y="${(y + (nudge || 0)).toFixed(1)}">${text}</text>`; };
      // An old label that would sit on top of the new one moves aside (away from it).
      const apart = (oldPts, newPts, cls) => { const yo = labPos(oldPts, cls)[1], yn = labPos(newPts, cls)[1], d = yo - yn; return Math.abs(d) < 14 ? (d >= 0 ? 1 : -1) * (14 - Math.abs(d)) : 0; };
      if (shiftedD) g += lab(demandSeg(D0.a), 'D₀', 'sdg-dl sdg-old-label', apart(demandSeg(D0.a), dSeg, 'sdg-dl'));
      if (shiftedS) g += lab(supplySeg(S0.c), 'S₀', 'sdg-sl sdg-old-label', apart(supplySeg(S0.c), sSeg, 'sdg-sl'));
      g += lab(dSeg, shiftedD ? 'D₁' : 'D', 'sdg-dl') + lab(sSeg, shiftedS ? 'S₁' : 'S', 'sdg-sl');

      // Equilibrium points, dashed guides to the axes, and their values marked on the axes.
      const marks = [];
      const mark = (ax, v, cls) => { if (c.values && v != null && isFinite(v) && v >= 0) marks.push({ ax, v, cls: cls || 'now' }); };
      const guide = (q, p, cls) => line(ml, Y(p), X(q), Y(p), 'sdg-guide ' + (cls || '')) + line(X(q), Y(p), X(q), mt + ph, 'sdg-guide ' + (cls || ''));
      const before = () => { g += guide(s.e0.Q, s.e0.P, 'old'); mark('p', s.e0.P, 'old'); mark('q', s.e0.Q, 'old'); };
      if (s.Q > 0) {
        if (isWedge && (s.tax || s.subsidy)) {
          before();
          if (c.wedge) {
            g += guide(s.Q, s.Pb) + line(ml, Y(s.Ps), X(s.Q), Y(s.Ps), 'sdg-guide');
            mark('p', s.Pb); mark('p', s.Ps); mark('q', s.Q);
            if (c.values) {
              // Beside the two points, on the side away from the surplus areas.
              const up = s.tax ? [s.Pb, s.Ps] : [s.Ps, s.Pb], names = s.tax ? ['Buyers pay', 'Sellers keep'] : ['Sellers get', 'Buyers pay'];
              g += `<text class="sdg-guide-label" x="${(X(s.Q) + 9).toFixed(1)}" y="${(Y(up[0]) - 7).toFixed(1)}">${names[0]} ${money(up[0])}</text>`;
              g += `<text class="sdg-guide-label" x="${(X(s.Q) + 9).toFixed(1)}" y="${(Y(up[1]) + 15).toFixed(1)}">${names[1]} ${money(up[1])}</text>`;
            }
            g += `<circle class="sdg-pt" cx="${X(s.Q)}" cy="${Y(s.Pb)}" r="4.5"/><circle class="sdg-pt" cx="${X(s.Q)}" cy="${Y(s.Ps)}" r="4.5"/>`;
          } else { g += guide(s.e1.Q, s.e1.P) + `<circle class="sdg-pt" cx="${X(s.e1.Q)}" cy="${Y(s.e1.P)}" r="5"/>`; mark('p', s.e1.P); mark('q', s.Q); }
          g += `<circle class="sdg-pt0" cx="${X(s.e0.Q)}" cy="${Y(s.e0.P)}" r="4.5"/>`;
        } else if (ctl) {
          // The free-market equilibrium (for comparison), then the quantities at the controlled price.
          g += guide(s.e1.Q, s.e1.P, 'old') + `<circle class="sdg-pt0" cx="${X(s.e1.Q)}" cy="${Y(s.e1.P)}" r="4.5"/>`;
          mark('p', s.e1.P, 'old'); mark('q', s.e1.Q, 'old'); mark('p', ctl.price);
          const qs = c.shortage ? [ctl.Qd, ctl.Qs] : [s.Q];
          qs.forEach(q => { if (q <= qMax) { g += line(X(q), Y(ctl.price), X(q), mt + ph, 'sdg-guide'); mark('q', q); } });
        } else {
          if (shiftedD || shiftedS) { before(); g += `<circle class="sdg-pt0" cx="${X(s.e0.Q)}" cy="${Y(s.e0.P)}" r="4.5"/>`; }
          g += guide(s.e1.Q, s.e1.P) + `<circle class="sdg-pt" cx="${X(s.e1.Q)}" cy="${Y(s.e1.P)}" r="5"/>`;
          mark('p', s.e1.P); mark('q', s.e1.Q);
        }
      }

      // Price line for ceilings and floors.
      if ((state.mode === 'ceiling' || state.mode === 'floor') && state.price != null) {
        const yP = Y(state.price), name = state.mode === 'ceiling' ? 'Ceiling' : 'Floor';
        g += line(ml, yP, ml + pw, yP, 'sdg-price' + (s.control && s.control.binding ? ' binding' : ''));
        if (s.control && s.control.binding && c.shortage) {
          const q1 = Math.min(s.control.Qd, s.control.Qs), q2 = Math.min(qMax, Math.max(s.control.Qd, s.control.Qs)), yB = yP + (state.mode === 'ceiling' ? 14 : -14);
          g += line(X(q1), yB, X(q2), yB, 'sdg-gap') + line(X(q1), yP, X(q1), yB, 'sdg-gap') + line(X(q2), yP, X(q2), yB, 'sdg-gap');
          g += `<text class="sdg-gap-label" x="${((X(q1) + X(q2)) / 2).toFixed(1)}" y="${(yB + (state.mode === 'ceiling' ? 13 : -5)).toFixed(1)}" text-anchor="middle">${state.mode === 'ceiling' ? 'Shortage' : 'Surplus'}${c.values && !hidden('gap') ? ' ' + qty(q2 - q1) : ''}</text>`;
          g += `<circle class="sdg-pt" cx="${X(s.control.Qd)}" cy="${yP}" r="4"/><circle class="sdg-pt" cx="${X(s.control.Qs)}" cy="${yP}" r="4"/>`;
        }
        g += `<text class="sdg-price-label" x="${ml + pw - 30}" y="${(yP - 7).toFixed(1)}" text-anchor="end">${name}${c.values ? ' ' + money(state.price) : ''}${s.control && !s.control.binding ? ' (not binding)' : ''}</text>`;
        if (interactive) {
          g += line(ml, yP, ml + pw, yP, 'sdg-hitline', 'data-drag="P"');
          g += handle(ml + pw - 12, yP, 'P', `${name} price`, state.price, money(state.price));
        }
      }

      g += axisMarks(marks, pTicks, qTicks);

      // Handles for the curves (also the keyboard targets).
      if (interactive) {
        if (curveMovable('D')) { g += handle(X(hD[0]), Y(hD[1]), 'D', 'Demand curve', state.dShift, shiftText(state.dShift)); }
        if (curveMovable('S')) { g += handle(X(hS[0]), Y(hS[1]), 'S', 'Supply curve', state.sShift, shiftText(state.sShift)); }
      }

      const keepFocus = focusKey;
      svg.innerHTML = `<defs><clipPath id="${id}-clip"><rect x="${ml}" y="${mt}" width="${pw}" height="${ph}"/></clipPath>
        <pattern id="${id}-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" class="sdg-hatch-line"/></pattern></defs>${g.replace(/class="sdg-dwl"/g, `class="sdg-dwl" fill="url(#${id}-hatch)"`)}`;
      if (keepFocus) { const f = svg.querySelector(`.sdg-handle[data-drag="${keepFocus}"]`); if (f) f.focus({ preventScroll: true }); focusKey = keepFocus; }
      renderReadouts(s);
      if (interactive) {
        el.querySelectorAll('[data-mode]').forEach(b => { const on = b.dataset.mode === state.mode; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
        const hint = el.querySelector('.sdg-hint'); if (hint) hint.textContent = HINTS[state.mode] + (cfg.step ? ` Each step is ${money(cfg.step)}.` : '');
      }
    }
    const shiftText = v => (v ? `${v > 0 ? 'up' : 'down'} ${money(Math.abs(v))}` : 'not moved');
    function handle(x, y, key, label, value, text) {
      return `<g class="sdg-handle" data-drag="${key}" tabindex="0" role="slider" aria-label="${esc(label)}" aria-valuenow="${r2(value || 0)}" aria-valuetext="${esc(text)}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle r="11"/><path d="M0 -6 L-3.5 -2 H3.5 Z M0 6 L-3.5 2 H3.5 Z"/></g>`;
    }
    function curveMovable(k) {
      const m = state.mode;
      if (m === 'tax' || m === 'subsidy' || m === 'shift') return true;
      return !!cfg.tools.shift; // in ceiling/floor modes, curves move only if shocks are allowed too
    }

    function renderReadouts(s) {
      if (!readEl) return;
      const c = cfg.show, v = (x, k) => (c.values && !(k && hidden(k)) ? x : '…');
      const rows = [];
      const before = `P ${money(s.e0.P)}, Q ${qty(s.e0.Q)}`;
      rows.push(['Before', c.values ? before : '—']);
      if (state.mode === 'tax' || state.mode === 'subsidy') {
        const amt = s.tax || s.subsidy;
        rows.push([state.mode === 'tax' ? 'Tax per unit' : 'Subsidy per unit', amt ? v(money(amt)) + (s.wedge.on ? ` on ${s.wedge.on}` : '') : 'none yet']);
        rows.push(['Quantity traded', v(qty(s.Q))]);
        if (c.wedge) { rows.push(['Buyers pay', v(money(s.Pb))]); rows.push(['Sellers ' + (s.tax ? 'keep' : 'receive'), v(money(s.Ps))]); rows.push([s.tax ? 'Tax revenue' : 'Subsidy cost', v(money(s.tax ? s.revenue : s.cost), s.tax ? 'revenue' : 'cost')]); }
      } else if (s.control) {
        rows.push([`Price ${s.control.type}`, v(money(s.control.price)) + (s.control.binding ? '' : ' (not binding)')]);
        if (c.shortage && s.control.binding) {
          rows.push(['Quantity demanded', v(qty(s.control.Qd))]); rows.push(['Quantity supplied', v(qty(s.control.Qs))]);
          rows.push([s.control.type === 'ceiling' ? 'Shortage' : 'Surplus (unsold)', v(qty(s.control.shortage || s.control.surplus), 'gap')]);
        }
        rows.push(['Quantity traded', v(qty(s.Q))]);
      } else {
        rows.push(['Now', c.values ? `P ${money(s.e1.P)}, Q ${qty(s.e1.Q)}` : '—']);
      }
      if (c.surplus) { rows.push(['Consumer surplus', v(money(s.CS), 'CS')]); rows.push(['Producer surplus', v(money(s.PS), 'PS')]); }
      if (c.dwl && state.mode !== 'shift') rows.push(['Deadweight loss', v(money(s.DWL), 'DWL')]);
      readEl.innerHTML = `<dl>${rows.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${x}</dd></div>`).join('')}</dl>
        <div class="sdg-legend"><span><i class="sw d"></i>Demand</span><span><i class="sw s"></i>Supply</span>${c.surplus ? '<span><i class="sw cs"></i>CS</span><span><i class="sw ps"></i>PS</span>' : ''}${c.dwl ? '<span><i class="sw dwl"></i>Deadweight loss</span>' : ''}</div>`;
    }

    // ---- Interaction ----
    let drag = null, focusKey = null;
    const toSvgY = e => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()).y; };
    function tryState(next) {
      const n = Object.assign({}, state, next);
      if (n.mode === 'tax') { n.sShift = Math.max(0, n.sShift); n.dShift = Math.min(0, n.dShift); }
      if (n.mode === 'subsidy') { n.sShift = Math.min(0, n.sShift); n.dShift = Math.max(0, n.dShift); }
      n.dShift = Math.max(lim.dMin, Math.min(lim.dMax, n.dShift));
      n.sShift = Math.max(lim.sMin, Math.min(lim.sMax, n.sShift));
      if (n.price != null) n.price = Math.max(cfg.step, Math.min(pMax - cfg.step, n.price));
      if (!M.legal(cfg, n)) return false;
      if (n.dShift === state.dShift && n.sShift === state.sShift && n.price === state.price && n.mode === state.mode) return false;
      state = n; render(); changed(); return true;
    }
    function moveCurve(key, value) {
      const v = M.snap(value, cfg.step);
      if (key === 'D') tryState(state.mode === 'tax' || state.mode === 'subsidy' ? { dShift: v, sShift: 0 } : { dShift: v });
      else if (key === 'S') tryState(state.mode === 'tax' || state.mode === 'subsidy' ? { sShift: v, dShift: 0 } : { sShift: v });
      else tryState({ price: M.snap(value, cfg.step) });
    }
    function changed() { if (opts.onChange) opts.onChange(getState(), solved()); }
    function getState() { return { mode: state.mode, dShift: r2(state.dShift), sShift: r2(state.sShift), price: state.price == null ? null : r2(state.price) }; }

    if (interactive) {
      svg.addEventListener('pointerdown', e => {
        const t = e.target.closest('[data-drag]');
        if (!t) return;
        const key = t.dataset.drag;
        if ((key === 'D' || key === 'S') && !curveMovable(key)) return;
        e.preventDefault();
        svg.setPointerCapture(e.pointerId);
        drag = { key, y0: toSvgY(e), v0: key === 'D' ? state.dShift : key === 'S' ? state.sShift : state.price };
        el.classList.add('dragging');
      });
      svg.addEventListener('pointermove', e => {
        if (!drag) return;
        const dp = (drag.y0 - toSvgY(e)) / ph * pMax;
        moveCurve(drag.key, drag.v0 + dp);
      });
      const end = () => { drag = null; el.classList.remove('dragging'); };
      svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
      svg.addEventListener('focusin', e => { const h = e.target.closest('.sdg-handle'); if (h) focusKey = h.dataset.drag; });
      svg.addEventListener('focusout', e => { if (!svg.contains(e.relatedTarget)) focusKey = null; });
      svg.addEventListener('keydown', e => {
        const h = e.target.closest('.sdg-handle');
        if (!h) return;
        const key = h.dataset.drag, cur = key === 'D' ? state.dShift : key === 'S' ? state.sShift : state.price;
        const d = { ArrowUp: 1, ArrowRight: 1, PageUp: 2, ArrowDown: -1, ArrowLeft: -1, PageDown: -2 }[e.key];
        if (d) { e.preventDefault(); moveCurve(key, cur + d * cfg.step); }
        if (e.key === 'Home' && key !== 'P') { e.preventDefault(); moveCurve(key, 0); }
      });
      el.querySelectorAll('[data-mode]').forEach(b => { b.onclick = () => setMode(b.dataset.mode); });
      const rb = el.querySelector('.sdg-reset');
      if (rb) rb.onclick = () => { state = Object.assign({}, state, { dShift: 0, sShift: 0 }); if (state.price != null) state.price = defaultPrice(state.mode); render(); changed(); };
    }
    function defaultPrice(mode) {
      const e = M.eq(cfg.demand.a + state.dShift, cfg.demand.b, cfg.supply.c + state.sShift, cfg.supply.d);
      const p = M.snap((e.P || e0.P) + (mode === 'ceiling' ? -2 : 2) * cfg.step, cfg.step);
      return Math.max(cfg.step, Math.min(pMax - cfg.step, p));
    }
    function setMode(m) {
      if (m === state.mode) return;
      const wedgeNow = state.mode === 'tax' || state.mode === 'subsidy', wedgeNext = m === 'tax' || m === 'subsidy';
      const next = { mode: m };
      if (wedgeNow || wedgeNext) { next.dShift = 0; next.sShift = 0; }
      state = Object.assign({}, state, next);
      state.price = m === 'ceiling' || m === 'floor' ? defaultPrice(m) : null;
      render(); changed();
    }

    render();
    return {
      getState, solved,
      setState(st) { state = Object.assign({ mode: state.mode, dShift: 0, sShift: 0, price: null }, st); if ((state.mode === 'ceiling' || state.mode === 'floor') && state.price == null) state.price = defaultPrice(state.mode); render(); },
      reset() { state = Object.assign({}, state, { dShift: 0, sShift: 0, price: state.price == null ? null : defaultPrice(state.mode) }); render(); changed(); },
      destroy() { el.innerHTML = ''; el.classList.remove('sdg'); }
    };
  }

  function normalize(c) {
    const cfg = JSON.parse(JSON.stringify(c || {}));
    cfg.step = cfg.step > 0 ? cfg.step : 1;
    cfg.axes = Object.assign({ q: 'Quantity', qUnit: '', p: 'Price' }, cfg.axes || {});
    cfg.tools = Object.assign({ shift: true, tax: true, subsidy: true, ceiling: true, floor: true }, cfg.tools || {});
    cfg.show = Object.assign({ values: true, surplus: true, wedge: true, dwl: true, shortage: true }, cfg.show || {});
    return cfg;
  }

  window.SDGraph = { create, money, qty, MODES };
})();
