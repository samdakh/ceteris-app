/* Ceteris practice: supply-and-demand graphs made in the instructor's editor.

   A graph without tasks is a lab: students explore it freely, nothing is scored. A graph with
   tasks is an exercise in the Practice catalog, under the chapter the instructor picks: each task
   is a graph step (put the graph in the recorded state) followed by the numeric questions the
   instructor ticked, whose answers are computed here from the same math the browser uses
   (public/sd-math.js). With "new curves on every attempt", each attempt draws clean random curves;
   tasks keep their shifts, and price ceilings and floors keep their distance from equilibrium. */

const SD = require('./public/sd-math.js');

const SD_VOCAB = `- Demand slopes down, supply slopes up; the market settles where they cross (the equilibrium price and quantity).
- A change in demand or supply shifts the whole curve; a change in the price moves along a curve. An increase in demand shifts it up (right); an increase in supply shifts it down (right).
- A per-unit tax drives a wedge between the price buyers pay and the price sellers keep. It doesn't matter who legally pays it: a tax on sellers shifts supply up by the tax, a tax on buyers shifts demand down by the tax, and the outcome is the same. The burden falls more on the less elastic side.
- A subsidy works the other way: supply shifts down (or demand up) by the subsidy; buyers pay less, sellers receive more, and the government pays subsidy × quantity.
- A price ceiling binds only below the equilibrium price and causes a shortage (quantity demanded > quantity supplied); a price floor binds only above it and causes a surplus.
- Consumer surplus is the area under demand above the price paid; producer surplus is the area above supply below the price received. Taxes, subsidies and binding price controls create a deadweight loss: the value of trades that no longer happen (or, for a subsidy, that cost more than they are worth).`;

const TOOL_KEYS = ['shift', 'tax', 'subsidy', 'ceiling', 'floor'];
const SHOW_KEYS = ['values', 'surplus', 'wedge', 'dwl', 'shortage'];
const num = v => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const r2 = v => Math.round(v * 100) / 100;
const money = v => (v < 0 ? '−$' : '$') + (Number.isInteger(r2(Math.abs(v))) ? Math.abs(r2(v)).toLocaleString('en-US') : Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const qty = v => r2(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

// Clean what the editor sends; returns { graph } or { error }.
function cleanGraph(b) {
  b = b || {};
  const title = str(b.title, 120);
  if (!title) return { error: 'Give the graph a title.' };
  const chapterNumber = parseInt(b.chapterNumber, 10);
  if (!(chapterNumber >= 1 && chapterNumber <= 60)) return { error: 'Pick the chapter it belongs to (a number from 1 to 60).' };
  const c = b.config || {};
  const cfg = {
    demand: { a: num(c.demand && c.demand.a), b: num(c.demand && c.demand.b) },
    supply: { c: num(c.supply && c.supply.c), d: num(c.supply && c.supply.d) },
    step: num(c.step) || 1,
    axes: { q: str(c.axes && c.axes.q, 40) || 'Quantity', qUnit: str(c.axes && c.axes.qUnit, 40), p: str(c.axes && c.axes.p, 40) || 'Price ($)' },
    tools: {}, show: {},
    randomize: !!c.randomize,
    intro: str(c.intro, 2000),
    tasks: []
  };
  TOOL_KEYS.forEach(k => { cfg.tools[k] = !(c.tools && c.tools[k] === false); });
  SHOW_KEYS.forEach(k => { cfg.show[k] = !(c.show && c.show[k] === false); });
  if (!TOOL_KEYS.some(k => cfg.tools[k])) return { error: 'Allow at least one tool.' };
  const err = SD.validate(cfg);
  if (err) return { error: err };
  if (!(cfg.step >= 0.01 && cfg.step <= cfg.demand.a)) return { error: 'The step must be between $0.01 and the demand intercept.' };
  const e0 = SD.eq(cfg.demand.a, cfg.demand.b, cfg.supply.c, cfg.supply.d);
  for (const [i, t] of (Array.isArray(c.tasks) ? c.tasks.slice(0, 12) : []).entries()) {
    const prompt = str(t && t.prompt, 1000);
    if (!prompt) return { error: `Task ${i + 1} needs a question.` };
    const tg = t.target || {};
    const target = { mode: String(tg.mode || ''), dShift: num(tg.dShift) || 0, sShift: num(tg.sShift) || 0, price: tg.price == null ? null : num(tg.price) };
    if (!TOOL_KEYS.includes(target.mode)) return { error: `Task ${i + 1}: record an answer on the preview graph first.` };
    if (!cfg.tools[target.mode]) return { error: `Task ${i + 1} uses the ${target.mode} tool, which students aren’t allowed to use on this graph.` };
    if ((target.mode === 'ceiling' || target.mode === 'floor') && !(target.price > 0)) return { error: `Task ${i + 1}: set the price line on the preview graph.` };
    if (!SD.legal(cfg, target)) return { error: `Task ${i + 1}: that answer leaves no market (check the recorded graph).` };
    const s = SD.solve(cfg, target);
    if ((target.mode === 'tax' || target.mode === 'subsidy') && !(s.tax || s.subsidy)) return { error: `Task ${i + 1}: move a curve for the ${target.mode} before recording.` };
    const asks = (Array.isArray(t.ask) ? t.ask : []).map(String).filter((k, j, arr) => SD.QUESTIONS[k] && SD.questionsFor(target.mode).includes(k) && arr.indexOf(k) === j);
    cfg.tasks.push({
      prompt, target, ask: asks, either: !!t.either,
      // For new curves on every attempt, a controlled price is kept relative to the equilibrium.
      priceOffset: target.price != null ? r2(target.price - (target.dShift || target.sShift ? SD.solve(cfg, Object.assign({}, target, { mode: 'shift', price: null })).e1.P : e0.P)) : null
    });
  }
  return { graph: { title, summary: str(b.summary, 300), chapterNumber, chapterTitle: str(b.chapterTitle, 100), config: cfg } };
}

// Fill {tax}, {subsidy}, {price}, {shift} in a task's question with this version's numbers.
function fillPrompt(text, t) {
  const amount = Math.abs(t.target.mode === 'tax' || t.target.mode === 'subsidy' ? SD.wedge(t.target).amount : (t.target.dShift || t.target.sShift || 0));
  return text.replace(/\{(tax|subsidy|shift)\}/g, money(amount)).replace(/\{price\}/g, t.target.price != null ? money(t.target.price) : '');
}

// The version of a task for a given set of curves.
function taskFor(cfg, t) {
  const target = Object.assign({}, t.target);
  if (t.priceOffset != null && cfg.randomize) {
    const base = SD.solve(cfg, Object.assign({}, target, { mode: 'shift', price: null })).e1.P;
    target.price = r2(base + t.priceOffset);
  }
  return Object.assign({}, t, { target });
}

function hintsFor(t) {
  const m = t.target.mode;
  if (m === 'tax') return ['A tax drives a wedge between what buyers pay and what sellers keep. Which curve moves, and which way?', 'A tax on sellers shifts supply up by the tax; a tax on buyers shifts demand down by the tax. Use the Tax tool.'];
  if (m === 'subsidy') return ['A subsidy works the opposite way from a tax. Which curve moves, and which way?', 'A subsidy to sellers shifts supply down by the subsidy; a subsidy to buyers shifts demand up by it. Use the Subsidy tool.'];
  if (m === 'ceiling' || m === 'floor') return [`Use the price ${m} tool and drag the line to the level in the question.`, `A ${m} matters only if it is ${m === 'ceiling' ? 'below' : 'above'} the equilibrium price.`];
  return ['Does this change affect buyers (demand) or sellers (supply)? Does it increase or decrease it?', 'An increase in demand shifts it up (to the right); an increase in supply shifts it down (to the right).'];
}

function feedbackFor(cfg, got, want, either) {
  if (!got || got.mode !== want.mode) {
    const name = { shift: 'Shift curves', tax: 'Tax', subsidy: 'Subsidy', ceiling: 'Price ceiling', floor: 'Price floor' }[want.mode];
    return `Not quite. Try the “${name}” tool for this one.`;
  }
  if (want.mode === 'ceiling' || want.mode === 'floor') return 'Right tool. Check the level of the price line against the question.';
  if (want.mode === 'tax' || want.mode === 'subsidy') {
    const g = SD.wedge(got), w = SD.wedge(want);
    if (!g.on) return `Move a curve to show the ${want.mode}.`;
    if (!either && g.on !== w.on) return `Right idea, but the question puts the ${want.mode} on the other side of the market. Which curve does that move?`;
    return `Right curve and direction. Check the size of the ${want.mode}.`;
  }
  const dirs = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const okD = dirs(got.dShift) === dirs(want.dShift), okS = dirs(got.sShift) === dirs(want.sShift);
  if (okD && okS) return 'Right curve and direction. Check how far you moved it.';
  if ((want.dShift && !got.dShift && got.sShift) || (want.sShift && !got.sShift && got.dShift)) return 'Check which curve this change affects: buyers (demand) or sellers (supply)?';
  return 'Close, but check the direction: does this increase or decrease it?';
}

// The outcome of a task, in a sentence, for worked solutions and the coach.
function outcomeText(cfg, target) {
  const s = SD.solve(cfg, target), parts = [];
  if (target.mode === 'tax' || target.mode === 'subsidy') {
    parts.push(`Quantity falls from ${qty(s.e0.Q)} to ${qty(s.Q)}`.replace('falls', s.Q > s.e0.Q ? 'rises' : 'falls'));
    parts.push(`buyers pay ${money(s.Pb)} and sellers ${target.mode === 'tax' ? 'keep' : 'receive'} ${money(s.Ps)}`);
    parts.push(target.mode === 'tax' ? `tax revenue is ${money(s.revenue)}` : `the subsidy costs ${money(s.cost)}`);
    parts.push(`the deadweight loss is ${money(s.DWL)}`);
  } else if (s.control) {
    if (!s.control.binding) parts.push(`at ${money(s.control.price)} the ${s.control.type} doesn’t bind: the market stays at ${money(s.e1.P)} and ${qty(s.e1.Q)}`);
    else {
      parts.push(`at ${money(s.control.price)}, buyers want ${qty(s.control.Qd)} and sellers offer ${qty(s.control.Qs)}`);
      parts.push(s.control.type === 'ceiling' ? `a shortage of ${qty(s.control.shortage)}` : `a surplus of ${qty(s.control.surplus)}`);
      parts.push(`only ${qty(s.Q)} are traded, and the deadweight loss is ${money(s.DWL)}`);
    }
  } else {
    parts.push(`the equilibrium moves from ${money(s.e0.P)} and ${qty(s.e0.Q)} to ${money(s.e1.P)} and ${qty(s.e1.Q)}`);
  }
  const text = parts.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

// An exercise object, in the same shape as the catalog's (see practice-catalog.js).
function graphExercise(row) {
  const base = row.config;
  const id = 'g' + row.id;
  const qUnit = base.axes.qUnit || 'units';
  const ex = {
    id, custom: true, graphId: row.id, ownerId: row.owner_id,
    title: row.title, summary: row.summary || 'Supply and demand on an interactive graph.',
    vocab: SD_VOCAB,
    worksheet: { demand: base.demand, supply: base.supply },
    generate(r) {
      if (!base.randomize) return ex.worksheet;
      for (let k = 0; k < 200; k++) {
        const curves = SD.randomCurves(r.next);
        const cfg = Object.assign({}, base, curves);
        if (cfg.tasks.every(t => { const tt = taskFor(cfg, t); return SD.legal(cfg, tt.target) && (tt.target.price == null || tt.target.price > cfg.step); })) return curves;
      }
      return ex.worksheet;
    },
    build(params) {
      const cfg = Object.assign({}, base, params);
      const steps = [];
      cfg.tasks.forEach((t0, i) => {
        const t = taskFor(cfg, t0), n = i + 1, s = SD.solve(cfg, t.target);
        const hasQs = t.ask.length > 0;
        const graphCfg = { demand: cfg.demand, supply: cfg.supply, step: cfg.step, axes: cfg.axes, tools: cfg.tools,
          show: Object.assign({}, cfg.show, hasQs ? { values: false } : {}) };
        steps.push({
          key: `t${n}`, kind: 'graph', label: cfg.tasks.length > 1 ? `Task ${n}: graph` : 'Graph',
          prompt: fillPrompt(t.prompt, t), graph: graphCfg, target: t.target, either: t.either,
          hints: hintsFor(t),
          worked: `${SD.describe(cfg, t.target, money)}. ${outcomeText(cfg, t.target)}`
        });
        t.ask.forEach(k => {
          const q = SD.QUESTIONS[k], value = r2(q.get(s));
          steps.push({
            key: `t${n}-${k}`, kind: 'number', label: (cfg.tasks.length > 1 ? `Task ${n}: ` : '') + q.label,
            prompt: SD.questionPrompt(k, t.target.mode),
            answer: q.money ? { value, unit: '$', tol: 0.011 } : { value, unit: qUnit, tol: 0.011 },
            hints: hintsForQuestion(k, t.target.mode),
            worked: `${q.label}: **${q.money ? money(value) : qty(value) + ' ' + qUnit}**. ${outcomeText(cfg, t.target)}`
          });
        });
      });
      return { body: cfg.intro ? [{ md: cfg.intro }] : [], steps };
    }
  };
  return ex;
}

function hintsForQuestion(k, mode) {
  return {
    P: ['Find where the new curves cross.', 'Set the new demand equal to the new supply and solve for Q, then read P off either curve.'],
    Q: ['How much is bought and sold at the new market outcome?', mode === 'ceiling' || mode === 'floor' ? 'With a binding control, the smaller of quantity demanded and quantity supplied is what gets traded.' : 'Find where the relevant curves cross.'],
    Pb: ['What do buyers pay per unit, all in?', mode === 'tax' ? 'Buyers pay the price where the quantity traded meets the original demand curve.' : 'Read the price off the original demand curve at the new quantity.'],
    Ps: ['What do sellers end up with per unit?', mode === 'tax' ? 'Sellers keep what buyers pay minus the tax.' : 'Sellers receive what buyers pay plus the subsidy.'],
    revenue: ['Tax revenue = tax per unit × units sold.'],
    cost: ['Subsidy cost = subsidy per unit × units sold.'],
    CS: ['Consumer surplus is the area under demand and above the price buyers pay, up to the quantity traded.'],
    PS: ['Producer surplus is the area above supply and below the price sellers receive, up to the quantity traded.'],
    DWL: ['The deadweight loss is the triangle between demand and supply, from the quantity traded to the efficient quantity.', 'Its base is the change in quantity; its height is the gap between what buyers pay and what sellers receive.'],
    gap: ['Compare quantity demanded and quantity supplied at the controlled price.']
  }[k] || [];
}

module.exports = { SD_VOCAB, cleanGraph, graphExercise, feedbackFor, outcomeText, TOOL_KEYS, SHOW_KEYS };
