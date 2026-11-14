/* Ceteris practice, Principles of Microeconomics, Chapter 16: Monopoly.
   Built from the FA25 monopoly questions. Each exercise is a generator (see practice-catalog.js
   for the format): `worksheet` holds the numbers from the original questions. */

const { num, $, money, count, check, range, argmaxUnique, shuffleOrder } = require('./practice-helpers');

// Applies a stored permutation to a list of options.
const ordered = (opts, order) => (order ? order.map(i => opts[i]) : opts);

// ======================================================================================
// Exercise 1: monopoly concepts (multiple choice; variants drawn and options shuffled)
// ======================================================================================
const POWER = {
  least: {
    prompt: 'Which of the following would be **least** likely to have monopoly power?',
    options: [
      { id: 'drug', label: 'a pharmaceutical company with a new drug', msg: 'A patent gives it the sole right to sell the drug for years: that’s monopoly power.' },
      { id: 'passports', label: 'the U.S. Department of State when issuing passports', msg: 'Nobody else can issue a U.S. passport: that’s a monopoly created by law.' },
      { id: 'lumber', label: 'a lumber yard selling two-by-fours' },
      { id: 'water', label: 'a local water and sewer company', msg: 'One network of pipes serves the whole town: a classic natural monopoly.' },
      { id: 'textbook', label: 'the publisher of an assigned textbook', msg: 'If the book is assigned, students can’t switch to a substitute. That’s market power.' }
    ],
    answer: 'lumber',
    hints: ['What makes a seller hard to replace? Think of patents, laws, and products without close substitutes.', 'Which seller faces the most competitors selling exactly the same thing?'],
    worked: '**A lumber yard selling two-by-fours.** Two-by-fours are a standardized product sold by many yards and stores, so buyers can easily go elsewhere. The others are protected by a patent (the drug), by law (passports), by the cost of building a second network (water and sewer), or by a lack of substitutes (the assigned textbook).'
  },
  most: {
    prompt: 'Which of the following would be **most** likely to have monopoly power?',
    options: [
      { id: 'parcel', label: 'a national package delivery service', msg: 'Several national carriers (and the Postal Service) compete for packages.' },
      { id: 'toys', label: 'an online toy store', msg: 'Online toy stores face many competitors, each a click away.' },
      { id: 'fastfood', label: 'a small chain of fast-food restaurants', msg: 'Fast food has plenty of close substitutes on every corner.' },
      { id: 'water', label: 'a local water and sewer company' }
    ],
    answer: 'water',
    hints: ['Which of these sellers would be hardest to compete with?', 'Would it make sense for a second company to lay its own network of pipes?'],
    worked: '**A local water and sewer company.** A second network of pipes would make no sense: one firm can serve the whole town at a lower average cost than two could. That makes it a natural monopoly. The others face many competitors.'
  }
};
const EFF_OPTS = {
  price: { id: 'price', label: 'by the price it charges', msg: 'A high price on its own doesn’t tell you how much value is lost.' },
  qty: { id: 'qty', label: 'by its output quantity', msg: 'Output matters, but a quantity on its own doesn’t measure the loss.' },
  dwl: { id: 'dwl', label: 'by deadweight loss' },
  profit: { id: 'profit', label: 'by its profit', msg: 'Profit goes to the monopolist instead of to buyers: it isn’t lost to society. Think about the value of the trades that don’t happen.' },
  area: { id: 'area', label: 'by the area above marginal cost but beneath demand, from the monopoly output to the socially efficient output' },
  unreal: { id: 'unreal', label: 'by the value of the unrealized trades that could be made if the monopolist produced the socially efficient output' },
  all: { id: 'all', label: 'all of the above' }
};
const EFF = {
  dwl: {
    prompt: 'How can the economic efficiency of a monopolist be measured?',
    options: ['price', 'qty', 'dwl', 'profit'], answer: 'dwl', shuffle: 4,
    worked: '**By deadweight loss**: the value of the trades that would benefit both buyers and the seller but don’t happen, because the monopolist produces less than the efficient quantity. On a graph, it’s the area between demand and marginal cost, from the monopoly quantity to the efficient quantity.'
  },
  all: {
    prompt: 'How can the economic efficiency of a monopolist be measured?',
    options: ['area', 'unreal', 'dwl', 'all'], answer: 'all', shuffle: 3,
    worked: '**All of the above.** They are three descriptions of the same thing: the deadweight loss is the value of the unrealized trades, which on a graph is the area above MC and beneath demand, between the monopoly quantity and the efficient quantity.'
  },
  not: {
    prompt: 'How can the economic efficiency of a monopolist **not** be measured?',
    options: ['profit', 'area', 'unreal', 'dwl'], answer: 'profit', shuffle: 4,
    worked: '**By the monopolist’s profit.** The other three all describe the deadweight loss: the value of the trades that don’t happen, which on a graph is the area between demand and MC from the monopoly quantity to the efficient one.'
  }
};
const REG_OPTS = [
  { id: 'ext', label: 'They create positive externalities.', msg: 'Externalities call for taxes or subsidies; they don’t explain why one firm should serve the whole market.' },
  { id: 'notmax', label: 'They are not maximizing profit.', msg: 'A monopolist does maximize profit. That’s precisely what regulators worry about.' },
  { id: 'inputs', label: 'They provide productive resources for competitive firms.', msg: 'Lots of firms supply inputs to others. Why would electricity need a single supplier?' },
  { id: 'natural', label: 'They are usually natural monopolies.' }
];

const concepts = {
  id: 'ch16-concepts',
  title: 'Monopoly power and efficiency',
  summary: 'Where monopoly power comes from, how to measure the harm, and why some monopolies are regulated.',
  worksheet: { power: 'least', eff: 'dwl', orders: {} },
  generate(r) {
    const power = r.pick(['least', 'most']), eff = r.pick(['dwl', 'all', 'not']);
    const e = EFF[eff];
    const effOrder = shuffleOrder(r, e.shuffle);
    while (effOrder.length < e.options.length) effOrder.push(effOrder.length); // "all of the above" stays last
    return { power, eff, orders: { power: shuffleOrder(r, POWER[power].options.length), eff: effOrder, reg: shuffleOrder(r, 4) } };
  },
  build({ power, eff, orders }) {
    const P = POWER[power], E = EFF[eff];
    const effOpts = E.options.map(k => EFF_OPTS[k]).map(o => (o.id === E.answer ? { id: o.id, label: o.label }
      : { ...o, msg: eff === 'all' ? 'That’s true, as far as it goes. Look at the other options too.' : eff === 'not' && o.id !== 'profit' ? 'That one does measure it: it’s a description of the deadweight loss.' : o.msg }));
    return {
      body: [{ md: 'A few questions about where monopoly power comes from and what it costs society.' }],
      steps: [
        {
          key: 'power', kind: 'choice', label: 'Monopoly power',
          prompt: P.prompt, options: ordered(P.options, orders.power), answer: P.answer, hints: P.hints, worked: P.worked
        },
        {
          key: 'efficiency', kind: 'choice', label: 'Measuring inefficiency',
          prompt: E.prompt, options: ordered(effOpts, orders.eff), answer: E.answer,
          hints: ['Efficiency is about value created for society as a whole, not about who gets it.', 'Which trades would happen in a competitive market but don’t happen under a monopoly?'],
          worked: E.worked
        },
        {
          key: 'regulate', kind: 'choice', label: 'Why regulate',
          prompt: 'What is one reason to regulate electric companies instead of using antitrust laws to break up these monopolies?',
          options: ordered(REG_OPTS, orders.reg), answer: 'natural',
          hints: ['Would two companies stringing parallel power lines down every street be cheaper or more expensive than one?'],
          worked: '**They are usually natural monopolies.** One grid can serve a whole region at a lower average cost than several competing grids could. Breaking the company up would raise costs, so regulators keep a single firm and limit what it can charge instead.'
        },
        {
          key: 'profit-vs-dwl', kind: 'explain', label: 'Profit vs. deadweight loss',
          prompt: 'A monopolist can earn large profits. In a few sentences, explain why its profit is not a measure of the inefficiency it causes.',
          model: 'Profit is mostly a transfer: the extra that buyers pay above cost goes to the monopolist instead. Buyers lose it, the seller gains it, so it doesn’t shrink the total value society gets from the market. The inefficiency is the deadweight loss: the value of the trades that don’t happen at all, because the monopolist produces less than the quantity where demand meets marginal cost. Nobody gets that value.',
          mustHave: ['says profit (the markup on units sold) is a transfer from buyers to the monopolist, not a loss to society as a whole',
            'says the inefficiency is the deadweight loss: trades that would benefit both sides but don’t happen, because output is below the efficient level'],
          hints: ['When a buyer pays a monopolist $10 more than it would pay a competitive firm, where does that $10 go? Is it lost?']
        }
      ]
    };
  }
};

// ======================================================================================
// Linear demand P = a − bQ (MR = a − 2bQ), cost TC = F + cQ + Q² (MC = c + 2Q).
// Monopoly at MR = MC: Q = (a − c)/(2b + 2). We choose Qm and set a = c + 2(b + 1)Qm.
// ======================================================================================
function monopoly({ a, b, c, F }) {
  const Qm = (a - c) / (2 * b + 2), Pm = a - b * Qm, MCm = c + 2 * Qm;
  const TC = Q => F + c * Q + Q * Q;
  return { Qm, Pm, MCm, TC, Rev: Pm * Qm, profit: Pm * Qm - TC(Qm), VCm: c * Qm + Qm * Qm };
}
// A fixed cost that leaves the monopoly a modest profit.
function pickFixed(r, beforeFixed) {
  const target = r.int(1, 25) * 100;
  return Math.max(500, Math.round((beforeFixed - target) / 500) * 500);
}
const eq = (a, b) => `${num(a)} − ${num(b)}Q`;

const monopolySteps = (m, { a, b, c, F }, thing) => [
  {
    key: 'q', kind: 'number', label: 'Monopoly quantity',
    prompt: 'How many units does Fly-Rite produce?',
    answer: count(m.Qm, 'units'),
    mistakes: [
      { value: (a - c) / (b + 2), tol: 0.5, msg: 'That’s where price equals MC: what a competitive industry would produce. A monopolist sets MR = MC.' },
      { value: a / (2 * b), tol: 0.5, msg: 'That’s where MR = 0, which maximizes revenue. Production isn’t free here: set MR equal to MC.' },
      { value: (a - c) / (2 * b), tol: 0.5, msg: `Check your MC: it rises with output, MC = ${c} + 2Q.` }
    ],
    hints: ['A monopolist produces where MR = MC.', `Set ${eq(a, 2 * b)} = ${c} + 2Q and solve for Q.`],
    worked: `MR = MC: ${eq(a, 2 * b)} = ${c} + 2Q, so ${2 * b + 2}Q = ${num(a - c)} and **Q = ${num(m.Qm)}**.`
  },
  {
    key: 'p', kind: 'number', label: 'Monopoly price',
    prompt: 'At what price are they sold?',
    answer: money(m.Pm),
    mistakes: [{ value: m.MCm, msg: 'That’s MR (and MC) at that quantity. The price comes from the demand curve: what buyers are willing to pay for that many units.' }],
    hints: ['Plug the quantity into the demand curve, not into MR.'],
    worked: `P = ${num(a)} − ${b} × ${num(m.Qm)} = **${$(m.Pm)}**.`
  },
  {
    key: 'profit', kind: 'number', label: 'Monopoly profit',
    prompt: 'What is Fly-Rite’s profit? (Enter a loss as a negative number.)',
    answer: money(m.profit),
    mistakes: [
      { value: m.Rev - m.VCm, msg: `Don’t forget the ${$(F)} fixed cost.` },
      { value: m.TC(m.Qm), msg: 'That’s total cost. Profit = revenue − total cost.' },
      { value: m.Rev, msg: 'That’s revenue. Profit = revenue − total cost.' }
    ],
    hints: ['Profit = P × Q − TC.', `TC = ${num(F)} + ${c}Q + Q², at Q = ${num(m.Qm)}.`],
    worked: `Revenue = ${$(m.Pm)} × ${num(m.Qm)} = ${$(m.Rev)}. TC = ${num(F)} + ${c} × ${num(m.Qm)} + ${num(m.Qm)}² = ${$(m.TC(m.Qm))}. Profit = **${$(m.profit)}**.`
  }
];
const priceTakerQ = (Pc, c, Qm, intro) => ({
  key: 'qc', kind: 'number', label: 'Price-taker quantity',
  prompt: `${intro} How many units does Fly-Rite produce now?`,
  answer: count((Pc - c) / 2, 'units'),
  mistakes: [
    { value: Qm, msg: 'That’s the monopoly quantity. Now Fly-Rite is a price taker: P = MC.' },
    { value: Pc - c, msg: `MC = ${c} + 2Q: don’t forget to divide by 2.` }
  ],
  hints: ['A price taker produces where P = MC.', `Solve ${num(Pc)} = ${c} + 2Q.`],
  worked: `P = MC: ${num(Pc)} = ${c} + 2Q, so **Q = ${num((Pc - c) / 2)}**.`
});
const priceTakerProfit = (Pc, Qc, TC, F) => ({
  key: 'profit-now', kind: 'number', label: 'Price-taker profit',
  prompt: 'What is Fly-Rite’s profit now? (Enter a loss as a negative number.)',
  answer: money(Pc * Qc - TC(Qc)),
  mistakes: [
    { value: Pc * Qc - TC(Qc) + F, msg: `Don’t forget the ${$(F)} fixed cost.` },
    { value: Pc * Qc, msg: 'That’s revenue. Subtract total cost.' }
  ],
  hints: ['Profit = P × Q − TC, with the new price and quantity.'],
  worked: `Revenue = ${$(Pc)} × ${num(Qc)} = ${$(Pc * Qc)}. TC = ${$(TC(Qc))}. Profit = **${$(Pc * Qc - TC(Qc))}**.`
});

// ======================================================================================
// Exercise 2: Fly-Rite's pogo sticks (monopoly, deadweight loss, then the patent expires)
// ======================================================================================
const pogo = {
  id: 'ch16-pogo',
  title: 'Fly-Rite’s pogo sticks',
  summary: 'MR = MC, the deadweight loss of a monopoly, and what changes when the patent expires.',
  worksheet: { a: 180, b: 4, c: 30, F: 1000, Qc: 35 },
  generate(r) {
    for (;;) {
      const b = r.int(2, 6), c = r.int(5, 40), Qm = r.int(8, 30);
      const a = c + 2 * (b + 1) * Qm;
      if ((a - c) % (b + 2)) continue;                 // a whole-number efficient quantity
      const hi = Math.ceil((b + 2) * Qm / 2) - 1;      // keep the new price below the monopoly price
      if (hi <= Qm + 1) continue;
      const Qc = r.int(Qm + 2, hi);
      const m = monopoly({ a, b, c, F: 0 });
      const params = { a, b, c, F: pickFixed(r, m.profit), Qc };
      try { this.build(params); } catch (e) { continue; } // redraw anything the build rejects
      return params;
    }
  },
  build(p) {
    const { a, b, c, F, Qc } = p;
    const m = monopoly(p), Pc = c + 2 * Qc;
    const Qe = (a - c) / (b + 2), Pe = a - b * Qe, DWL = (Qe - m.Qm) * (m.Pm - m.MCm) / 2;
    check(Number.isInteger(m.Qm) && Number.isInteger(Qe) && Pc < m.Pm && Qc > m.Qm && m.profit > 0, 'pogo numbers');
    return {
      body: [{ md: `**Thanks to a patent,** Fly-Rite has a monopoly for pogo sticks in the U.S., where demand is given by P = ${eq(a, b)} and marginal revenue by MR = ${eq(a, 2 * b)}. Fly-Rite’s total cost is TC = ${num(F)} + ${c}Q + Q² and its marginal cost is MC = ${c} + 2Q, where Q is quantity and P is the price.` }],
      steps: [
        ...monopolySteps(m, p),
        {
          key: 'qe', kind: 'number', label: 'Efficient quantity',
          prompt: 'What quantity of pogo sticks would be socially efficient?',
          answer: count(Qe, 'units'),
          mistakes: [{ value: m.Qm, msg: 'That’s the monopoly quantity. The efficient quantity is where buyers’ willingness to pay (demand) equals marginal cost.' }],
          hints: ['Efficiency means producing every unit that buyers value at least at its marginal cost.', `Set demand equal to MC: ${eq(a, b)} = ${c} + 2Q.`],
          worked: `Demand = MC: ${eq(a, b)} = ${c} + 2Q, so ${b + 2}Q = ${num(a - c)} and **Q = ${num(Qe)}**. At that quantity, buyers value the last unit (${$(Pe)}) at exactly what it costs to make.`
        },
        {
          key: 'dwl', kind: 'number', label: 'Deadweight loss',
          prompt: 'How large is the deadweight loss caused by the monopoly?',
          answer: money(DWL),
          mistakes: [
            { value: 2 * DWL, msg: 'Remember the ½: the deadweight loss is a triangle.' },
            { value: (Qe - m.Qm) * (m.Pm - Pe) / 2, msg: 'The triangle’s height is the gap between price and MC at the monopoly quantity, not the drop in price.' },
            { value: m.profit, msg: 'That’s the monopolist’s profit. The deadweight loss is the value of the trades that don’t happen.' }
          ],
          hints: ['The deadweight loss is the triangle between demand and MC, from the monopoly quantity to the efficient one.', `Its base is ${num(Qe)} − ${num(m.Qm)} units; its height is the gap between price (${$(m.Pm)}) and MC (${$(m.MCm)}) at Q = ${num(m.Qm)}.`],
          worked: `DWL = ½ × (${num(Qe)} − ${num(m.Qm)}) × (${$(m.Pm)} − ${$(m.MCm)}) = **${$(DWL)}**: the value of the trades that don’t happen because Fly-Rite sells ${num(m.Qm)} pogo sticks instead of ${num(Qe)}.`
        },
        priceTakerQ(Pc, c, m.Qm, `**The patent expires** and the market price for pogo sticks drops to ${$(Pc)}.`),
        priceTakerProfit(Pc, Qc, m.TC, F),
        {
          key: 'rule', kind: 'explain', label: 'MR = MC vs. P = MC',
          prompt: 'As a monopolist, Fly-Rite produced where MR = MC; once the patent expired, it produced where P = MC. In a few sentences, explain why the rule changed.',
          model: `With the patent, Fly-Rite was the only seller and faced the whole downward-sloping demand curve: to sell one more pogo stick, it had to lower the price on every unit it sold, so its marginal revenue was below the price. Once the patent expired, it became a price taker: it can sell as many as it wants at ${$(Pc)} without lowering the price, so each extra unit brings in exactly the price (MR = P), and MR = MC becomes P = MC.`,
          mustHave: ['says that as a monopolist, selling more meant lowering the price on all units, so MR was below the price',
            'says that as a price taker, every unit sells at the market price without lowering it, so MR = P (and MR = MC becomes P = MC)'],
          hints: ['What happened to the price whenever the monopolist sold one more unit? What happens now?']
        }
      ]
    };
  }
};

// ======================================================================================
// Exercise 3: Fly-Rite's flight simulators and free trade
// ======================================================================================
const simulators = {
  id: 'ch16-simulators',
  title: 'Fly-Rite and free trade',
  summary: 'A monopoly opened to world trade: output, price, exports or imports, and profit.',
  worksheet: { a: 410, b: 5, c: 2, F: 5000, Qc: 99 },
  generate(r) {
    for (;;) {
      const b = r.int(2, 6), c = r.int(2, 30), Qm = r.int(10, 40);
      const a = c + 2 * (b + 1) * Qm;
      const hi = Math.ceil((b + 2) * Qm / 2) - 1;
      const cands = range(hi + 1).filter(Q => Q >= Qm + 3 && (a - (c + 2 * Q)) % b === 0 && (a - (c + 2 * Q)) / b !== Q);
      if (!cands.length) continue;
      const Qc = r.pick(cands);
      const m = monopoly({ a, b, c, F: 0 });
      const params = { a, b, c, F: pickFixed(r, m.profit), Qc };
      try { this.build(params); } catch (e) { continue; } // redraw anything the build rejects
      return params;
    }
  },
  build(p) {
    const { a, b, c, F, Qc } = p;
    const m = monopoly(p), Pw = c + 2 * Qc, Qd = (a - Pw) / b, exports = Qc > Qd;
    check(Number.isInteger(m.Qm) && Number.isInteger(Qd) && Qd > 0 && Qd !== Qc && Pw < m.Pm && Qc > m.Qm && m.profit > 0, 'simulator numbers');
    return {
      body: [{ md: `**A single firm,** Fly-Rite, produces and sells flight simulators in the U.S., where international trade in simulators is prohibited: U.S. buyers cannot import and Fly-Rite cannot export. Domestic demand is given by P = ${eq(a, b)} and marginal revenue by MR = ${eq(a, 2 * b)}. Fly-Rite’s total cost is TC = ${num(F)} + ${c}Q + Q² and its marginal cost is MC = ${c} + 2Q, where Q is quantity and P is the price.` }],
      steps: [
        ...monopolySteps(m, p),
        priceTakerQ(Pw, c, m.Qm, `**The U.S. then opens its market** to free international trade, where simulators sell for ${$(Pw)}, making Fly-Rite a price taker in a competitive market.`),
        {
          key: 'qd', kind: 'number', label: 'U.S. purchases',
          prompt: 'How many units are bought in the U.S.?',
          answer: count(Qd, 'units'),
          mistakes: [
            { value: Qc, msg: `That’s how many Fly-Rite makes. How many do U.S. buyers want at ${$(Pw)}?` },
            { value: m.Qm, msg: 'That’s what U.S. buyers bought from the monopoly. The price has changed.' }
          ],
          hints: ['U.S. buyers now pay the world price. Read their quantity off U.S. demand.', `Solve ${num(Pw)} = ${eq(a, b)}.`],
          worked: `Plug the world price into U.S. demand: ${num(Pw)} = ${eq(a, b)}, so **Q = ${num(Qd)}**.`
        },
        {
          key: 'trade', kind: 'choice', label: 'Export or import?',
          prompt: 'Does the U.S. export or import simulators?',
          options: [
            { id: 'export', label: 'Export', msg: `Compare what Fly-Rite produces with what U.S. buyers want at ${$(Pw)}. Who supplies the difference?` },
            { id: 'import', label: 'Import', msg: `Compare what Fly-Rite produces with what U.S. buyers want at ${$(Pw)}. Where does the extra go?` },
            { id: 'neither', label: 'Neither', msg: `Fly-Rite’s output and U.S. purchases aren’t equal at ${$(Pw)}. What happens to the difference?` }
          ],
          answer: exports ? 'export' : 'import',
          hints: ['Compare the quantity Fly-Rite supplies with the quantity U.S. buyers demand at the world price.'],
          worked: exports
            ? `Fly-Rite produces ${num(Qc)} but U.S. buyers want only ${num(Qd)}, so the U.S. **exports** the other ${num(Qc - Qd)}.`
            : `U.S. buyers want ${num(Qd)} but Fly-Rite produces only ${num(Qc)}, so the U.S. **imports** the other ${num(Qd - Qc)}.`
        },
        priceTakerProfit(Pw, Qc, m.TC, F),
        {
          key: 'more', kind: 'explain', label: 'Lower price, more output',
          prompt: `Opening the market to trade lowered the price U.S. buyers pay (from ${$(m.Pm)} to ${$(Pw)}), yet Fly-Rite now produces more than before (${num(Qc)} units instead of ${num(m.Qm)}). In a few sentences, explain how both can happen.`,
          model: `As a monopolist, Fly-Rite faced the U.S. demand curve alone: selling one more simulator meant lowering the price on every unit, so its marginal revenue was below the price, and it stopped at ${num(m.Qm)} units, where MR = MC, keeping output scarce to keep the price high. As a price taker, it can sell as many as it wants at ${$(Pw)} without lowering the price, so every extra unit brings in the full ${$(Pw)}. It keeps producing until MC reaches ${$(Pw)}, at ${num(Qc)} units.`,
          mustHave: ['says that as a monopolist, selling more required lowering the price (MR below P), so it restricted output where MR = MC',
            'says that as a price taker, every unit sells at the world price (MR = P), so it produces until P = MC, which is a larger quantity'],
          hints: ['As a monopolist, what did Fly-Rite give up on its other units each time it sold one more? Does that still happen at the world price?']
        }
      ]
    };
  }
};

// ======================================================================================
// Exercise 4: Drive-By Truckers' album (MR from a schedule, zero marginal cost, the fee)
// ======================================================================================
const album = {
  id: 'ch16-album',
  title: 'Drive-By Truckers’ new album',
  summary: 'MR from a demand schedule, pricing with zero marginal cost, and what the band can ask for.',
  worksheet: { P0: 10, qs: [34, 40, 48, 58, 70, 80], cost: 270000 },
  generate(r) {
    for (;;) {
      const P0 = r.int(9, 14), q0 = r.int(20, 40), k = r.int(3, 7), g = 0.3 + r.next() * 0.6;
      const qs = [q0];
      for (let i = 0; i < 5; i++) qs.push(qs[i] + Math.max(1, Math.round(k * (1 + i * g))));
      const rev = qs.map((q, i) => (P0 - i) * q * 1000);
      const best = argmaxUnique(rev);
      if (best < 2 || best > 4) continue;
      if (!rev.every((v, i) => i === 0 || (i <= best ? v > rev[i - 1] : v < rev[i - 1]))) continue; // up, then down
      const fee = r.int(5, 25) * 10000, cost = rev[best] - fee;
      if (cost < 50000 || cost % 10000) continue;
      return { P0, qs, cost };
    }
  },
  build({ P0, qs, cost }) {
    const rows = qs.map((q, i) => ({ P: P0 - i, Q: q * 1000 }));
    rows.forEach((x, i) => { x.Rev = x.P * x.Q; if (i) x.MR = (x.Rev - rows[i - 1].Rev) / (x.Q - rows[i - 1].Q); });
    const best = argmaxUnique(rows.map(x => x.Rev)), B = rows[best], fee = B.Rev - cost;
    check(best > 0 && best < 5 && fee > 0, 'album numbers');
    const r2 = v => Math.round(v * 100) / 100;
    return {
      body: [{ md: `**Drive-By Truckers** finished recording their latest album. ATO Records’ marketing department determines that the demand for the album is as shown below. ATO can produce and market the album for ${$(cost)} and sell copies (online) at $0 marginal cost.` }],
      steps: [
        {
          key: 'table', kind: 'table', label: 'Revenue and MR', weight: 2,
          prompt: 'Fill in revenue and marginal revenue. MR is the change in revenue per extra copy, between each price and the one above it; round it to the cent.',
          columns: [{ key: 'P', label: 'Price', given: true }, { key: 'Q', label: 'Copies', given: true }, { key: 'Rev', label: 'Revenue' }, { key: 'MR', label: 'MR' }],
          rows: rows.map((x, i) => ({ values: { P: x.P, Q: x.Q }, answers: i ? { Rev: x.Rev, MR: r2(x.MR) } : { Rev: x.Rev } })),
          tol: 0.01, colTol: { MR: 0.011 },
          wrongPatterns: [
            { col: 'MR', values: rows.slice(1).map((x, i) => x.Rev - rows[i].Rev), msg: 'Your MR column is the change in revenue. Divide it by the change in quantity, to get MR per extra copy.' },
            { col: 'MR', values: rows.slice(1).map(x => x.P), msg: 'Your MR column is the price. MR is the change in revenue ÷ the change in quantity.' }
          ],
          hints: ['Revenue = price × copies.', 'MR = (change in revenue) ÷ (change in copies), from the row above to this one.'],
          worked: `Revenue = P × Q. MR = ΔRev ÷ ΔQ between consecutive prices: for example, from ${$(rows[0].P)} to ${$(rows[1].P)}, (${num(rows[1].Rev)} − ${num(rows[0].Rev)}) ÷ (${num(rows[1].Q)} − ${num(rows[0].Q)}) = ${$(r2(rows[1].MR))} per copy.`
        },
        {
          key: 'price', kind: 'number', label: 'Best price',
          prompt: 'What price would maximize ATO’s profits?',
          answer: money(B.P),
          mistakes: [
            ...(best < 5 ? [{ value: rows[5].P, msg: 'That price sells the most copies, but revenue (and profit) is lower. Where does MR turn negative?' }] : []),
            { value: rows[0].P, msg: 'That’s the highest price, but you’d sell too few copies. Follow MR down the table.' }
          ],
          hints: ['With zero marginal cost, profit is highest where revenue is highest.', 'Look for where MR goes from positive to negative.'],
          worked: `Marginal cost is zero, so ATO makes the most profit where revenue is highest: at **${$(B.P)}**, with ${$(B.Rev)}. MR is still positive down to ${$(B.P)} and turns negative after that.`
        },
        {
          key: 'copies', kind: 'number', label: 'Copies sold',
          prompt: 'How many copies will ATO sell at that price?',
          answer: count(B.Q, 'copies'),
          hints: ['Read the demand schedule at the best price.'],
          worked: `At ${$(B.P)}, ATO sells **${num(B.Q)}** copies.`
        },
        {
          key: 'fee', kind: 'number', label: 'Recording fee',
          prompt: 'As Drive-By Truckers’ agent, what recording fee would you demand from ATO Records?',
          answer: money(fee),
          mistakes: [
            { value: B.Rev, msg: `That’s ATO’s revenue. It still has to cover the ${$(cost)} cost of producing and marketing the album.` },
            { value: cost, msg: 'That’s what the album costs ATO. How much would ATO have left over?' }
          ],
          hints: ['What is the most ATO could pay you and still not lose money on the album?', `ATO’s best profit before your fee: revenue at the best price minus ${$(cost)}.`],
          worked: `At ${$(B.P)}, ATO earns ${$(B.Rev)} − ${$(cost)} = ${$(fee)} before paying the band. That’s the most it could pay and still break even, so a (tough) agent asks for **${$(fee)}**.`
        },
        {
          key: 'fixed', kind: 'explain', label: 'Why the cost doesn’t set the price',
          prompt: `ATO’s ${$(cost)} production and marketing cost played no part in choosing the price. In a few sentences, explain why.`,
          model: 'That cost is the same whatever price ATO charges and however many copies it sells: it’s a fixed cost. It lowers profit by the same amount at every price, so it can’t change which price makes profit highest; that depends only on revenue and marginal cost (here, zero). The cost matters only for whether the album is worth making at all, and for how big a fee the band can demand.',
          mustHave: ['says the cost does not change with the price or the number of copies sold (it is a fixed cost)',
            'says it therefore lowers profit by the same amount at every price, so it does not change which price maximizes profit (only revenue and marginal cost matter)'],
          hints: ['Compute profit at two different prices. What does the cost do to each?']
        }
      ]
    };
  }
};

// ======================================================================================
// Exercise 5: Chattanooga FC tickets (price discrimination between two groups, MC = 0)
// ======================================================================================
const tickets = {
  id: 'ch16-tickets',
  title: 'Chattanooga FC tickets',
  summary: 'Price discrimination between students and the general public, and what a ban costs.',
  worksheet: { m: 1, qs: [0, 1000, 2000, 4000, 5000], qg: [2000, 3000, 3000, 3000, 3000] },
  generate(r) {
    for (;;) {
      const m = r.pick([1, 1, 2, 3]);
      const qs = [r.pick([0, 0, 500])], qg = [r.int(2, 6) * 500];
      for (let i = 1; i < 5; i++) { qs.push(qs[i - 1] + r.pick([500, 1000, 1000, 1500, 2000])); qg.push(qg[i - 1] + r.pick([0, 0, 0, 500, 1000])); }
      const P = [5, 4, 3, 2, 1].map(x => x * m);
      const iS = argmaxUnique(qs.map((q, i) => q * P[i])), iG = argmaxUnique(qg.map((q, i) => q * P[i])), iT = argmaxUnique(qs.map((q, i) => (q + qg[i]) * P[i]));
      if (iS < 0 || iG < 0 || iT < 0 || iS <= iG) continue;
      if (iT === iS && iT === iG) continue;
      return { m, qs, qg };
    }
  },
  build({ m, qs, qg }) {
    const P = [5, 4, 3, 2, 1].map(x => x * m);
    const rs = qs.map((q, i) => q * P[i]), rg = qg.map((q, i) => q * P[i]), rt = qs.map((q, i) => (q + qg[i]) * P[i]);
    const iS = argmaxUnique(rs), iG = argmaxUnique(rg), iT = argmaxUnique(rt);
    check(iS >= 0 && iG >= 0 && iT >= 0 && iS > iG, 'ticket numbers');
    const disc = rs[iS] + rg[iG];
    return {
      body: [{ md: '**Chattanooga FC** sells tickets to games in Finley Stadium. They distinguish between two market segments: students and the general public. There’s no extra cost of selling an extra ticket. The demand schedules are shown below.' }],
      steps: [
        {
          key: 'table', kind: 'table', label: 'Revenue table', weight: 2,
          prompt: 'Fill in the revenue from each group, and the revenue if everybody paid the same price.',
          columns: [{ key: 'P', label: 'Price', given: true }, { key: 'S', label: 'Students', given: true }, { key: 'G', label: 'General public', given: true },
            { key: 'RS', label: 'Rev. students' }, { key: 'RG', label: 'Rev. general' }, { key: 'RT', label: 'Rev. one price' }],
          rows: P.map((p, i) => ({ values: { P: p, S: qs[i], G: qg[i] }, answers: { RS: rs[i], RG: rg[i], RT: rt[i] } })),
          tol: 0.01,
          wrongPatterns: [{ col: 'RT', values: P.map((p, i) => qs[i] + qg[i]), msg: 'Your last column is the number of tickets. Multiply by the price.' }],
          hints: ['Revenue = price × tickets, for each group.', 'With one price for everybody, revenue = price × (students + general public).'],
          worked: 'Each revenue column is the price times the tickets sold at that price; the last column uses the total of both groups.'
        },
        {
          key: 'student', kind: 'number', label: 'Student price',
          prompt: 'To maximize profit, what price would you charge for student admission?',
          answer: money(P[iS]),
          mistakes: [{ value: P[iG], msg: 'That’s the best price for the general public. Look at the student revenue column.' }],
          hints: ['There’s no extra cost of selling an extra ticket, so profit is highest where revenue is highest.', 'Find the largest number in the student revenue column.'],
          worked: `Selling an extra ticket costs nothing, so profit is highest where revenue is: ${$(rs[iS])} at **${$(P[iS])}**.`
        },
        {
          key: 'general', kind: 'number', label: 'General price',
          prompt: 'To maximize profit, what price would you charge for general admission?',
          answer: money(P[iG]),
          mistakes: [{ value: P[iS], msg: 'That’s the best student price. Look at the general-public revenue column.' }],
          hints: ['Find the largest number in the general-public revenue column.'],
          worked: `General-admission revenue is highest at **${$(P[iG])}** (${$(rg[iG])}).`
        },
        {
          key: 'disc-rev', kind: 'number', label: 'Revenue, two prices',
          prompt: 'How much ticket revenue do you make with those two prices?',
          answer: money(disc),
          mistakes: [{ value: rt[iT], msg: 'That’s the best you can do with a single price. Add up the best revenue from each group.' }],
          hints: ['Add the best student revenue and the best general-public revenue.'],
          worked: `${$(rs[iS])} + ${$(rg[iG])} = **${$(disc)}**.`
        },
        {
          key: 'single', kind: 'number', label: 'Price after the ban',
          prompt: 'The Chattanooga city council passes a law prohibiting price discrimination. What price do you charge now?',
          answer: money(P[iT]),
          mistakes: [P[iS], P[iG]].filter(v => v !== P[iT]).map(v => ({ value: v, msg: 'With one price, both groups pay it. Use the one-price revenue column.' })),
          hints: ['Now everybody pays the same price: use the one-price revenue column.'],
          worked: `With one price for everybody, revenue is highest at **${$(P[iT])}** (${$(rt[iT])}).`
        },
        {
          key: 'loss', kind: 'number', label: 'Revenue lost to the ban',
          prompt: 'How much revenue does the ban cost the club?',
          answer: money(disc - rt[iT]),
          mistakes: [{ value: rt[iT], msg: 'That’s revenue with one price. How much less is it than with two prices?' }],
          hints: ['Compare the best revenue with two prices and with one.'],
          worked: `${$(disc)} − ${$(rt[iT])} = **${$(disc - rt[iT])}**.`
        },
        {
          key: 'why-lower', kind: 'explain', label: 'Why students pay less',
          prompt: `Your best student price (${$(P[iS])}) is lower than your best general-admission price (${$(P[iG])}). In a few sentences, explain why it pays to charge students less.`,
          model: 'Students are much more price-sensitive: when the price drops, many more of them buy (their demand is more elastic), while the general public keeps buying even at higher prices. To get the most revenue from each group, you charge a high price to the group that barely reacts to it and a low price to the group that does: the students. Each price is set where that group’s marginal revenue equals marginal cost (here, zero).',
          mustHave: ['says students are more price-sensitive (their demand is more elastic: their quantity responds more to the price)',
            'says the profit-maximizing price is lower for the more price-sensitive group and higher for the less sensitive one'],
          hints: ['Compare how the number of tickets each group buys changes as the price drops.']
        }
      ]
    };
  }
};

// ======================================================================================
// Exercise 6: a play in town (price discrimination, a fixed cost, and who loses from a ban)
// ======================================================================================
// Adults: Q(P) = min(NA, B·(top − P)); kids: Q(P) = min(NK, B·(ktop − P)), for P = top … 0.
const play = {
  id: 'ch16-play',
  title: 'A play in town',
  summary: 'Price discrimination with a fixed cost, and who wins and loses when it’s banned.',
  worksheet: { top: 10, NA: 300, ktop: 6, NK: 200, B: 100, FC: 2000 },
  generate(r) {
    for (;;) {
      const B = r.pick([50, 100, 100]), top = r.int(8, 12), NA = B * r.int(2, 4), ktop = top - r.int(3, 5), NK = B * r.int(1, 3);
      const t = this.table({ top, NA, ktop, NK, B });
      if (!t) continue;
      const disc = t.ra[t.iA] + t.rk[t.iK], single = t.rt[t.iT];
      const go = r.int(1, 3) <= 2;                   // usually the play still goes ahead under the ban
      const lo = go ? Math.ceil(disc * 0.4 / 250) : Math.ceil((single + 1) / 250), hi = go ? Math.floor((single - 1) / 250) : Math.floor((disc - 100) / 250);
      if (hi < lo) continue;
      return { top, NA, ktop, NK, B, FC: 250 * r.int(lo, hi) };
    }
  },
  // The schedules and revenues; null if the version isn't a clean "kids priced out" case.
  table({ top, NA, ktop, NK, B }) {
    const P = range(top + 1).map(i => top - i);
    const qa = P.map(p => Math.min(NA, B * Math.max(0, top - p))), qk = P.map(p => Math.min(NK, B * Math.max(0, ktop - p)));
    const ra = qa.map((q, i) => q * P[i]), rk = qk.map((q, i) => q * P[i]), rt = ra.map((v, i) => v + rk[i]);
    const iA = argmaxUnique(ra), iK = argmaxUnique(rk), iT = argmaxUnique(rt);
    if (iA < 0 || iK < 0 || iT !== iA || qk[iA] !== 0 || P[iK] >= P[iA] || qk[iK] === 0) return null;
    return { P, qa, qk, ra, rk, rt, iA, iK, iT };
  },
  build(p) {
    const { NA, NK, FC } = p;
    const t = play.table(p);
    check(!!t, 'play schedules');
    const { P, qa, qk, ra, rk, rt, iA, iK, iT } = t;
    const disc = ra[iA] + rk[iK], single = rt[iT], go = single > FC;
    check(disc > FC && single !== FC, 'play fixed cost');
    return {
      body: [{ md: `**You live in a town** with ${num(NA)} adults and ${num(NK)} children, and you are thinking about putting on a play to entertain your neighbors and make some money. A play has a fixed cost of ${$(FC)}, but selling an extra ticket has zero marginal cost. The demand schedules for your two types of customer are shown below.` }],
      steps: [
        {
          key: 'table', kind: 'table', label: 'Revenue table', weight: 2,
          prompt: 'Fill in the revenue from adults, from kids, and in total at each price.',
          columns: [{ key: 'P', label: 'Price', given: true }, { key: 'A', label: 'Adults', given: true }, { key: 'K', label: 'Kids', given: true },
            { key: 'RA', label: 'Rev. adults' }, { key: 'RK', label: 'Rev. kids' }, { key: 'RT', label: 'Rev. total' }],
          rows: P.map((x, i) => ({ values: { P: x, A: qa[i], K: qk[i] }, answers: { RA: ra[i], RK: rk[i], RT: rt[i] } })),
          tol: 0.01,
          hints: ['Revenue = price × tickets, for each group.', 'Total revenue (one price for all) = adult revenue + kids’ revenue at the same price.'],
          worked: 'Each revenue column is the price times the tickets sold at that price; the total adds up both groups at the same price.'
        },
        {
          key: 'adult', kind: 'number', label: 'Adult price',
          prompt: 'Suppose you can price-discriminate. What price would you charge for an adult ticket?',
          answer: money(P[iA]),
          mistakes: [{ value: P[iK], msg: 'That’s the best price for kids. Look at the adult revenue column.' }],
          hints: ['Selling an extra ticket costs nothing, so maximize revenue from adults.'],
          worked: `You can extract the most out of adults by charging **${$(P[iA])}** for an adult ticket (${$(ra[iA])}).`
        },
        {
          key: 'kid', kind: 'number', label: 'Kid price',
          prompt: 'What price would you charge for a child’s ticket?',
          answer: money(P[iK]),
          mistakes: [{ value: P[iA], msg: 'At the adult price, hardly any kids would come. Look at the kids’ revenue column.' }],
          hints: ['Find the largest number in the kids’ revenue column.'],
          worked: `You can squeeze the most out of kids by charging **${$(P[iK])}** for a child’s ticket (${$(rk[iK])}).`
        },
        {
          key: 'profit-disc', kind: 'number', label: 'Profit, two prices',
          prompt: 'How much profit do you make, after the fixed cost?',
          answer: money(disc - FC),
          mistakes: [{ value: disc, msg: `That’s your revenue. Subtract the ${$(FC)} fixed cost.` }],
          hints: ['Add the best revenue from each group, then subtract the fixed cost.'],
          worked: `Revenue is ${$(ra[iA])} + ${$(rk[iK])} = ${$(disc)}, so profit after the fixed cost is **${$(disc - FC)}**.`
        },
        {
          key: 'single', kind: 'number', label: 'Price after the ban',
          prompt: 'The city council passes a law prohibiting you from charging different prices to different customers. What price do you set for a ticket now?',
          answer: money(P[iT]),
          mistakes: [{ value: P[iK], msg: `At that price, the adults would pay far less than they’re willing to. Use the total revenue column.` }],
          hints: ['With one price for everybody, use the total revenue column.'],
          worked: `Total revenue is highest at **${$(P[iT])}** (${$(rt[iT])}): the adult price. At that price, no children buy.`
        },
        {
          key: 'profit-single', kind: 'number', label: 'Profit, one price',
          prompt: 'How much profit would you make with one price, after the fixed cost? (Enter a loss as a negative number.)',
          answer: money(single - FC),
          mistakes: [{ value: single, msg: `That’s your revenue. Subtract the ${$(FC)} fixed cost.` }],
          hints: ['Revenue at the single price, minus the fixed cost.'],
          worked: `${$(single)} − ${$(FC)} = **${$(single - FC)}**.`
        },
        {
          key: 'go', kind: 'choice', label: 'Still put on the play?',
          prompt: 'With the law in place, do you still put on the play?',
          options: [
            { id: 'yes', label: 'Yes', msg: `With one price, revenue (${$(single)}) doesn’t cover the ${$(FC)} fixed cost. Would you still go ahead?` },
            { id: 'no', label: 'No', msg: 'You still come out ahead after paying the fixed cost. Why cancel?' }
          ],
          answer: go ? 'yes' : 'no',
          hints: ['Compare your profit with one price with zero: what you’d make by not putting on the play.'],
          worked: go
            ? `**Yes**: ${$(single)} in revenue still covers the ${$(FC)} fixed cost, for a profit of ${$(single - FC)}.`
            : `**No**: ${$(single)} in revenue doesn’t cover the ${$(FC)} fixed cost. Better not to put on the play at all.`
        },
        {
          key: 'welfare', kind: 'explain', label: 'Who wins, who loses',
          prompt: 'Who is worse off because of the law prohibiting price discrimination? Who is better off? In a few sentences, explain.',
          model: go
            ? `Adults pay the same ${$(P[iA])} as before, so they’re no better or worse off. Children are priced out: at ${$(P[iA])} none of them buy, so the ${num(qk[iK])} children who would have paid ${$(P[iK])} miss a show they valued more than it cost to let them in (nothing). You lose the ${$(rk[iK])} they would have paid. Nobody gains (except perhaps the adults who don’t have to put up with screaming kids in the theater): the law reduces total surplus.`
            : `With one price, the play no longer covers its ${$(FC)} fixed cost, so it doesn’t happen at all. Everybody loses: adults and children miss a show they valued at more than their ticket price, and you lose the ${$(disc - FC)} profit you would have made with two prices. Nobody gains.`,
          mustHave: go
            ? ['says children are priced out (they no longer buy tickets) and lose out', 'says the producer loses the revenue (profit) from children while adults pay the same, so no one gains (total surplus falls)']
            : ['says the play no longer covers its fixed cost, so it doesn’t happen', 'says everyone loses (the producer’s profit and the audience’s surplus disappear) and no one gains'],
          hints: ['Go through each group in turn: adults, children, and you. Compare their situation with and without the law.']
        }
      ]
    };
  }
};

module.exports = {
  id: 'ch16', number: 16,
  title: 'Monopoly',
  subtitle: 'Market power, MR = MC, deadweight loss, and price discrimination',
  vocab: `- A monopolist is the sole seller of a product without close substitutes. It faces the downward-sloping market demand curve, so to sell one more unit it must lower the price on all units: MR is below the price.
- A profit-maximizing monopolist produces where MR = MC, then charges the highest price buyers will pay for that quantity (read the price off the demand curve, not off MR).
- A price taker (a competitive firm) has MR = P and produces where P = MC.
- The socially efficient quantity is where demand (willingness to pay) meets MC. A monopoly produces less; the deadweight loss is the area between demand and MC from the monopoly quantity to the efficient quantity. Monopoly profit is a transfer from buyers to the seller, not a measure of inefficiency.
- With zero marginal cost, maximizing profit means maximizing revenue (MR = 0). From a schedule, MR = change in revenue ÷ change in quantity.
- Fixed costs don't change the profit-maximizing price or quantity, only the level of profit (and whether to produce at all).
- Price discrimination: charge each group the price that maximizes profit from that group; the more price-sensitive (more elastic) group gets the lower price. Banning price discrimination can price some buyers out and reduce total surplus.
- A natural monopoly is a market one firm can supply at lower average cost than several could (large fixed costs, economies of scale); such firms are usually regulated rather than broken up.`,
  exercises: [concepts, pogo, simulators, album, tickets, play]
};
