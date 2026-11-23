/* Ceteris supply and demand: the math behind the interactive graph, shared by the browser
   (window.SDMath) and the server (require('./public/sd-math.js')), so what students see and
   what gets graded always agree.

   Curves are straight lines: demand P = a − bQ, supply P = c + dQ.
   A graph's state:
     mode    'shift' (market shocks), 'tax', 'subsidy', 'ceiling' or 'floor'
     dShift  how far demand has moved up (+) or down (−), in price units
     sShift  how far supply has moved up (+) or down (−)
     price   the controlled price (ceiling and floor modes)
   In tax mode one curve carries the tax: supply up by t (a tax on sellers) or demand down by t
   (a tax on buyers). In subsidy mode: supply down by s (to sellers) or demand up by s (to buyers).
   In ceiling and floor modes, any shifts are market shocks and the price line applies on top. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SDMath = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;
  const r6 = v => Math.round(v * 1e6) / 1e6;

  function eq(A, b, C, d) {
    const Q = (A - C) / (b + d);
    if (Q <= EPS) return { Q: 0, P: null, trade: false };
    return { Q: r6(Q), P: r6(A - b * Q), trade: true };
  }

  // Which curve carries the tax or subsidy, and how big it is.
  function wedge(state) {
    const d = state.dShift || 0, s = state.sShift || 0;
    if (state.mode === 'tax') {
      if (s > EPS && Math.abs(d) < EPS) return { on: 'sellers', amount: s };
      if (d < -EPS && Math.abs(s) < EPS) return { on: 'buyers', amount: -d };
      return { on: null, amount: 0 };
    }
    if (state.mode === 'subsidy') {
      if (s < -EPS && Math.abs(d) < EPS) return { on: 'sellers', amount: -s };
      if (d > EPS && Math.abs(s) < EPS) return { on: 'buyers', amount: d };
      return { on: null, amount: 0 };
    }
    return { on: null, amount: 0 };
  }

  // Everything the graph shows and the grader checks, for one state of the graph.
  function solve(cfg, state) {
    const { a, b } = cfg.demand, { c, d } = cfg.supply;
    const st = Object.assign({ mode: 'shift', dShift: 0, sShift: 0, price: null }, state || {});
    const e0 = eq(a, b, c, d);
    const A = a + st.dShift, C = c + st.sShift;
    const e1 = eq(A, b, C, d);
    const out = {
      mode: st.mode, curves: { D0: { a, b }, S0: { c, d }, D1: { a: A, b }, S1: { c: C, d } },
      e0, e1, tax: 0, subsidy: 0, revenue: 0, cost: 0, DWL: 0, control: null, wedge: null
    };
    const triangleCS = (top, P, Q) => r6(0.5 * (top - P) * Q);

    if (st.mode === 'tax' || st.mode === 'subsidy') {
      const w = wedge(st);
      out.wedge = w;
      const Q = e1.Q;
      let Pb, Ps;
      if (st.mode === 'tax') {
        out.tax = w.amount;
        if (w.on === 'buyers') { Ps = e1.P; Pb = Ps + w.amount; } else { Pb = e1.P; Ps = Pb - w.amount; }
      } else {
        out.subsidy = w.amount;
        if (w.on === 'buyers') { Ps = e1.P; Pb = Ps - w.amount; } else { Pb = e1.P; Ps = Pb + w.amount; }
      }
      Object.assign(out, {
        Q, Pb: r6(Pb), Ps: r6(Ps),
        CS: triangleCS(a, Pb, Q), PS: r6(0.5 * (Ps - c) * Q),
        revenue: r6(out.tax * Q), cost: r6(out.subsidy * Q),
        DWL: r6(0.5 * w.amount * Math.abs(e0.Q - Q))
      });
    } else if ((st.mode === 'ceiling' || st.mode === 'floor') && st.price != null && e1.trade) {
      const p = st.price;
      const Qd = Math.max(0, (A - p) / b), Qs = Math.max(0, (p - C) / d);
      const binding = st.mode === 'ceiling' ? p < e1.P - EPS : p > e1.P + EPS;
      out.control = { type: st.mode, price: p, binding, Qd: r6(Qd), Qs: r6(Qs), shortage: 0, surplus: 0 };
      if (binding) {
        const Q = Math.min(Qd, Qs);
        out.control.shortage = st.mode === 'ceiling' ? r6(Qd - Qs) : 0;
        out.control.surplus = st.mode === 'floor' ? r6(Qs - Qd) : 0;
        Object.assign(out, {
          Q: r6(Q), Pb: p, Ps: p,
          CS: r6((A - p) * Q - 0.5 * b * Q * Q), PS: r6((p - C) * Q - 0.5 * d * Q * Q),
          DWL: r6(0.5 * (b + d) * (e1.Q - Q) * (e1.Q - Q))
        });
      } else {
        Object.assign(out, { Q: e1.Q, Pb: e1.P, Ps: e1.P, CS: triangleCS(A, e1.P, e1.Q), PS: r6(0.5 * (e1.P - C) * e1.Q) });
      }
    } else {
      Object.assign(out, { Q: e1.Q, Pb: e1.P, Ps: e1.P, CS: e1.trade ? triangleCS(A, e1.P, e1.Q) : 0, PS: e1.trade ? r6(0.5 * (e1.P - C) * e1.Q) : 0 });
    }
    out.TS = r6(out.CS + out.PS + out.revenue - out.cost);
    return out;
  }

  // How far each curve may move, so the market keeps trading and the curves stay on the graph.
  function limits(cfg) {
    const { a } = cfg.demand, { c } = cfg.supply, step = cfg.step || 1;
    const room = Math.max(step, Math.floor((0.6 * a) / step) * step);
    return { dMin: -room, dMax: room, sMin: -room, sMax: room };
  }

  // Snap to the graph's step, clamp to the limits, and refuse states with no trade.
  function snap(v, step) { return Math.round(v / step) * step; }
  function legal(cfg, state) {
    const e = eq(cfg.demand.a + (state.dShift || 0), cfg.demand.b, cfg.supply.c + (state.sShift || 0), cfg.supply.d);
    if (!e.trade || e.P <= EPS) return false;
    const w = wedge(state);
    if ((state.mode === 'tax' || state.mode === 'subsidy') && (state.dShift || state.sShift) && !w.on) return false;
    if (state.mode === 'tax' && w.on) { const s = solve(cfg, state); if (s.Ps <= EPS) return false; }
    return true;
  }

  // Same outcome? Used to grade a graph task (shifts and price compared after snapping).
  function sameState(cfg, got, want, opts) {
    const step = cfg.step || 1, close = (x, y) => Math.abs((x || 0) - (y || 0)) < step / 2;
    if (!got || got.mode !== want.mode) return false;
    if (want.mode === 'ceiling' || want.mode === 'floor') {
      if (!close(got.price, want.price)) return false;
    }
    if ((want.mode === 'tax' || want.mode === 'subsidy') && opts && opts.eitherCurve) {
      const g = wedge(got), w = wedge(want);
      return !!g.on && close(g.amount, w.amount);
    }
    return close(got.dShift, want.dShift) && close(got.sShift, want.sShift);
  }

  // Clean random curves: a whole-number equilibrium, prices and quantities of a sensible size,
  // and slopes whose sum makes a $1 shift move the quantity by a round amount.
  const PAIRS = [[0.1, 0.1], [0.1, 0.3], [0.3, 0.1], [0.2, 0.2], [0.1, 0.4], [0.4, 0.1], [0.2, 0.3], [0.3, 0.2], [0.5, 0.5]];
  function randomCurves(rand) {
    const pick = arr => arr[Math.floor(rand() * arr.length)];
    for (let k = 0; k < 500; k++) {
      const Q0 = pick([20, 30, 40, 50, 60, 70, 80]), P0 = 4 + Math.floor(rand() * 17), [b, d] = pick(PAIRS);
      const a = r6(P0 + b * Q0), c = r6(P0 - d * Q0);
      if (c < 1 || a > 60 || a - P0 < 4) continue;
      return { demand: { a, b }, supply: { c, d } };
    }
    return { demand: { a: 20, b: 0.2 }, supply: { c: 2, d: 0.1 } };
  }

  // The follow-up questions a graph task can ask, with how to read each answer off solve().
  const QUESTIONS = {
    P: { label: 'New equilibrium price', prompt: 'What is the new equilibrium price?', money: true, get: s => s.Pb, when: m => m === 'shift' },
    Q: { label: 'Quantity traded', prompt: 'How many units are bought and sold now?', money: false, get: s => s.Q },
    Pb: { label: 'Price buyers pay', prompt: m => (m === 'subsidy' ? 'What price do buyers pay, after the subsidy?' : m === 'tax' ? 'What price do buyers pay, including the tax?' : 'What price do buyers pay?'), money: true, get: s => s.Pb, when: m => m !== 'shift' },
    Ps: { label: 'Price sellers receive', prompt: m => (m === 'subsidy' ? 'What price do sellers receive, including the subsidy?' : m === 'tax' ? 'What price do sellers keep, after the tax?' : 'What price do sellers receive?'), money: true, get: s => s.Ps, when: m => m === 'tax' || m === 'subsidy' },
    revenue: { label: 'Tax revenue', prompt: 'How much tax revenue does the government collect?', money: true, get: s => s.revenue, when: m => m === 'tax' },
    cost: { label: 'Cost of the subsidy', prompt: 'How much does the subsidy cost the government?', money: true, get: s => s.cost, when: m => m === 'subsidy' },
    CS: { label: 'Consumer surplus', prompt: 'What is consumer surplus now?', money: true, get: s => s.CS },
    PS: { label: 'Producer surplus', prompt: 'What is producer surplus now?', money: true, get: s => s.PS },
    DWL: { label: 'Deadweight loss', prompt: 'How large is the deadweight loss?', money: true, get: s => s.DWL, when: m => m !== 'shift' },
    gap: { label: 'Shortage or surplus', prompt: m => (m === 'ceiling' ? 'How large is the shortage?' : 'How large is the surplus (unsold units)?'), money: false, get: s => (s.control ? s.control.shortage || s.control.surplus : 0), when: m => m === 'ceiling' || m === 'floor' }
  };
  const questionPrompt = (key, mode) => { const q = QUESTIONS[key]; return typeof q.prompt === 'function' ? q.prompt(mode) : q.prompt; };
  const questionsFor = mode => Object.keys(QUESTIONS).filter(k => !QUESTIONS[k].when || QUESTIONS[k].when(mode));

  // A sentence describing a state, for worked solutions and the instructor's task list.
  function describe(cfg, state, fmtMoney) {
    const m = fmtMoney || (v => '$' + (Math.round(v * 100) / 100));
    const st = state || {};
    const shift = (v, name) => (v ? `${name} ${v > 0 ? 'up' : 'down'} by ${m(Math.abs(v))}` : '');
    if (st.mode === 'tax' || st.mode === 'subsidy') {
      const w = wedge(st);
      if (!w.on) return `No ${st.mode}`;
      return `A ${m(w.amount)} ${st.mode} ${st.mode === 'tax' ? 'on' : 'to'} ${w.on} (${w.on === 'sellers' ? 'supply' : 'demand'} ${st.mode === 'tax' ? (w.on === 'sellers' ? 'up' : 'down') : (w.on === 'sellers' ? 'down' : 'up')} by ${m(w.amount)})`;
    }
    const shifts = [shift(st.dShift, 'demand'), shift(st.sShift, 'supply')].filter(Boolean).join(' and ');
    if (st.mode === 'ceiling' || st.mode === 'floor') return `A price ${st.mode} at ${m(st.price)}${shifts ? ', with ' + shifts : ''}`;
    return shifts ? shifts.charAt(0).toUpperCase() + shifts.slice(1) : 'No change';
  }

  // Check a graph configuration (from the editor); returns an error message or null.
  function validate(cfg) {
    const n = v => typeof v === 'number' && isFinite(v);
    if (!cfg || !cfg.demand || !cfg.supply) return 'Set both curves.';
    const { a, b } = cfg.demand, { c, d } = cfg.supply;
    if (![a, b, c, d].every(n)) return 'Every curve parameter must be a number.';
    if (b <= 0 || d <= 0) return 'Demand must slope down and supply must slope up (both slopes above zero).';
    if (a <= 0) return 'Demand’s price intercept must be above zero.';
    if (c < 0) return 'Supply’s price intercept can’t be negative.';
    if (a <= c) return 'Demand’s intercept must be above supply’s, or the curves never cross.';
    if (!(cfg.step > 0)) return 'The step must be above zero.';
    return null;
  }

  return { solve, eq, wedge, limits, snap, legal, sameState, randomCurves, QUESTIONS, questionPrompt, questionsFor, describe, validate };
});
