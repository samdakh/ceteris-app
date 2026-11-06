/* Ceteris practice catalog: courses → chapters → exercises.

   Every exercise is a generator. generate(rng) draws a fresh set of numbers (params);
   build(params) turns them into the statement and the steps, with answers, feedback for
   common mistakes, hints and worked explanations computed from those numbers. Each attempt
   stores only its seed, so the server can rebuild the same version whenever it needs to.
   `worksheet` holds the numbers from the original worksheet (used for the answer key and tests).

   Step kinds (see practice.js for how each is checked):
     number   answer { value, tol, unit, display }   mistakes [{ value, msg }]
     choice   options [{ id, label, msg, missMsg }], answer: id or [ids] (select all that apply)
     table    columns [{ key, label, given }], rows [{ values, answers }], tol, colTol, show, wrongPatterns
     explain  model (the model answer), mustHave (what an acceptable answer must contain)
   Every step: prompt, label (short name for the instructor), hints [..], worked, weight (default 1). */

// ---- helpers ------------------------------------------------------------------------

function num(v) {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? r.toLocaleString('en-US') : r.toLocaleString('en-US', { minimumFractionDigits: r * 10 % 1 === 0 ? 1 : 2, maximumFractionDigits: 2 });
}
const $ = v => {
  const a = Math.round(Math.abs(v) * 100) / 100;
  return (v < 0 ? '−$' : '$') + (Number.isInteger(a) ? a.toLocaleString('en-US') : a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
};
const money = v => ({ value: v, unit: '$' });
const count = (v, unit) => ({ value: v, unit });
const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];
const range = n => Array.from({ length: n }, (_, i) => i);
const round1 = v => Math.round(v * 10) / 10;
function check(cond, what) { if (!cond) throw new Error('generator invariant failed: ' + what); }

// ======================================================================================
// Chapter 15, exercise 1: Bob's lawn-mowing service
// ======================================================================================
const bob = {
  id: 'ch15-bob',
  title: 'Bob’s lawn-mowing service',
  summary: 'Shut down or exit? Reading a problem into P = MC, P vs. AVC, P vs. ATC.',
  worksheet: { q: 10, P: 40, VC: 350, FC: 100 },
  generate(r) {
    const q = r.pick([8, 10, 12, 15, 16, 20]);
    const AFC = r.pick([5, 6, 8, 10, 12, 15]);
    const AVC = r.int(18, 45);
    const ATC = AVC + AFC;
    const scene = r.pick(['between', 'between', 'below', 'above']);
    const P = scene === 'between' ? AVC + r.int(1, AFC - 1) : scene === 'below' ? AVC - r.int(3, 10) : ATC + r.int(3, 10);
    return { q, P, VC: AVC * q, FC: AFC * q };
  },
  build({ q, P, VC, FC }) {
    const AVC = VC / q, AFC = FC / q, ATC = AVC + AFC, TC = VC + FC, Rev = P * q, profit = Rev - TC;
    check(P !== AVC && P !== ATC, 'P differs from AVC and ATC');
    const shut = P < AVC, exit = P < ATC;
    return {
      body: [{ md: `Bob’s lawn-mowing service is a profit-maximizing, competitive firm. Bob mows lawns for ${$(P)} each. His variable cost each day is ${$(VC)}, and his fixed cost is ${$(FC)}. He mows ${q} lawns a day.` }],
      steps: [
        {
          key: 'read', kind: 'number', label: 'MC from wording',
          prompt: `**Read the problem first.** Bob is a competitive, profit-maximizing firm, and he mows ${q} lawns a day. What is his marginal cost at that quantity?`,
          answer: money(P),
          mistakes: [
            { value: AVC, msg: `That’s his average variable cost (${$(VC)} ÷ ${q}). The question asks about *marginal* cost: what does “profit-maximizing” tell you?` },
            { value: ATC, msg: 'That’s his average total cost. Think about what “profit-maximizing” implies for a firm that takes the price as given.' }
          ],
          hints: [`What does “competitive” tell you about the ${$(P)} price? Can Bob set it himself?`, 'A profit-maximizing competitive firm produces where one equation holds. Which one?'],
          worked: `Since Bob’s firm is in a competitive market, he must be a price taker, so the ${$(P)} price is the market price. He is also profit-maximizing, so ${q} lawns a day is where P = MC. His marginal cost is therefore **${$(P)}**.\n\nThis isn’t crucial for this particular problem, but you should always know how to translate the wording of a problem into equations like this.`
        },
        {
          key: 'avc', kind: 'number', label: 'AVC',
          prompt: 'What is Bob’s average variable cost?',
          answer: money(AVC),
          mistakes: [
            { value: ATC, msg: `That’s average *total* cost: it includes the ${$(FC)} fixed cost. AVC uses variable cost only.` },
            { value: AFC, msg: `That’s average fixed cost (${$(FC)} ÷ ${q}).` },
            { value: VC, msg: 'That’s total variable cost. Divide by the number of lawns.' }
          ],
          hints: ['Average variable cost is variable cost per lawn.', 'AVC = VC ÷ q.'],
          worked: `AVC = VC/q = ${num(VC)}/${q} = **${$(AVC)}**.`
        },
        {
          key: 'shutdown', kind: 'choice', label: 'Shut down?',
          prompt: 'In the short run, should Bob shut down?',
          options: [
            { id: 'run', label: 'Keep operating', msg: 'Compare the price with AVC: does each lawn bring in enough to cover what it costs to mow?' },
            { id: 'shut', label: 'Shut down', msg: `Compare the price with AVC. In the short run, Bob owes his ${$(FC)} fixed cost whether he mows or not.` }
          ],
          answer: shut ? 'shut' : 'run',
          hints: ['“Shut down” is a short-run decision. Which of Bob’s costs can he avoid by not mowing?', 'A firm shuts down only if P < AVC.'],
          worked: `AVC = ${$(AVC)} and P = ${$(P)}. P ${shut ? '<' : '>'} AVC, so, for now, Bob should **${shut ? 'shut down' : 'keep operating'}**.`
        },
        {
          key: 'shutdown-why', kind: 'explain', label: 'Why (short run)',
          prompt: 'Explain your answer in a sentence or two.',
          model: shut
            ? `Bob should shut down because P = ${$(P)} is below AVC = ${$(AVC)}: each lawn brings in less than it costs to mow (revenue ${$(Rev)}, variable cost ${$(VC)}). Mowing would add ${$(VC - Rev)} to his losses, on top of the ${$(FC)} fixed cost he owes anyway.`
            : `Bob should keep operating because P = ${$(P)} exceeds AVC = ${$(AVC)} (revenue of ${$(Rev)} covers variable cost of ${$(VC)}). The extra ${$(Rev - VC)} goes toward the ${$(FC)} fixed cost, which he would owe even if he shut down.`,
          mustHave: [`compares the price (${$(P)}) with average variable cost (${$(AVC)}), or revenue (${$(Rev)}) with variable cost (${$(VC)})`,
            shut ? 'concludes that because P < AVC, Bob should shut down in the short run' : 'concludes that because P > AVC, Bob should keep operating in the short run'],
          hints: ['Name the two numbers you compared, and say which one is bigger.']
        },
        {
          key: 'atc', kind: 'number', label: 'ATC',
          prompt: 'What is Bob’s average total cost?',
          answer: money(ATC),
          mistakes: [
            { value: AVC, msg: 'That’s AVC. Average *total* cost includes the fixed cost too.' },
            { value: AFC, msg: 'That’s average fixed cost only.' },
            { value: TC, msg: 'That’s total cost. Divide by the number of lawns.' }
          ],
          hints: ['Total cost = fixed cost + variable cost.', 'ATC = TC ÷ q = (VC + FC) ÷ q.'],
          worked: `ATC = TC/q = (VC + FC)/q = ${num(TC)}/${q} = **${$(ATC)}**.`
        },
        {
          key: 'exit', kind: 'choice', label: 'Exit?',
          prompt: 'In the long run, should Bob exit the business?',
          options: [
            { id: 'exit', label: 'Exit', msg: 'Compare the price with ATC: once every cost is counted, is Bob losing money?' },
            { id: 'stay', label: 'Stay in business', msg: 'In the long run, Bob can get out of his fixed cost too. Compare the price with ATC.' }
          ],
          answer: exit ? 'exit' : 'stay',
          hints: ['“Exit” is a long-run decision: in the long run, every cost can be avoided.', 'A firm exits if P < ATC.'],
          worked: exit
            ? `ATC = ${$(ATC)} and P = ${$(P)}. P < ATC, so Bob should eventually **exit** the business.`
            : `ATC = ${$(ATC)} and P = ${$(P)}. P > ATC, so Bob makes a profit (${$(profit)} a day) and should **stay in business**.`
        },
        {
          key: 'exit-why', kind: 'explain', label: 'Why (long run)',
          prompt: 'Explain your answer in a sentence or two.',
          model: exit
            ? `P = ${$(P)} is below ATC = ${$(ATC)}, so Bob loses ${$(ATC - P)} a lawn (${$(-profit)} a day: revenue ${$(Rev)}, total cost ${$(TC)}). In the long run he can avoid all of his costs, fixed cost included, by leaving, so he should exit if the price stays at ${$(P)}.`
            : `P = ${$(P)} is above ATC = ${$(ATC)}, so Bob makes a profit of ${$(P - ATC)} a lawn (${$(profit)} a day: revenue ${$(Rev)}, total cost ${$(TC)}). Even with every cost counted, the business pays, so he should stay.`,
          mustHave: [`compares the price (${$(P)}) with average total cost (${$(ATC)}), or revenue (${$(Rev)}) with total cost (${$(TC)})`,
            exit ? 'concludes that because P < ATC (a loss), Bob should exit in the long run' : 'concludes that because P > ATC (a profit), Bob should stay in business'],
          hints: ['Which cost matters in the long run, and how does it compare with the price?']
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 15, exercise 2: a firm in long-run equilibrium
// ======================================================================================
const lrFirm = {
  id: 'ch15-lr-firm',
  title: 'A firm in long-run equilibrium',
  summary: 'What “long-run equilibrium” tells you before you compute anything.',
  worksheet: { q: 100, P: 10, AVC: 8, FC: 200 },
  generate(r) {
    const q = r.pick([40, 50, 80, 100, 120, 150, 200]);
    const AFC = r.int(1, 5), AVC = r.int(5, 20);
    return { q, P: AVC + AFC, AVC, FC: AFC * q };
  },
  build({ q, P, AVC, FC }) {
    const AFC = FC / q, VC = AVC * q, TC = VC + FC, Rev = P * q;
    check(P === AVC + AFC, 'P = ATC');
    return {
      body: [{ md: `A profit-maximizing firm operates in a competitive market that is in long-run equilibrium. The firm is currently producing ${num(q)} units of output. It has average revenue of ${$(P)}, average variable cost of ${$(AVC)}, and fixed cost of ${$(FC)}.` }],
      steps: [
        {
          key: 'read', kind: 'choice', label: 'Reading the wording',
          prompt: '**Read the problem first.** Which of these must be true for this firm? Select all that apply.',
          options: [
            { id: 'pmc', label: 'P = MC', missMsg: '“Profit-maximizing” is a clue too.' },
            { id: 'patc', label: 'P = ATC', missMsg: 'What does free entry and exit do to the price in the long run?' },
            { id: 'zero', label: 'Profit is zero', missMsg: 'If P = ATC, what is profit?' },
            { id: 'pavc', label: 'P = AVC', msg: `Nothing in the problem pins P to AVC. Here P = ${$(P)} while AVC = ${$(AVC)}.` },
            { id: 'pos', label: 'Profit is positive', msg: 'In long-run equilibrium, any profit would attract new firms until it was gone.' }
          ],
          answer: ['pmc', 'patc', 'zero'],
          hints: ['Translate each phrase in turn: “profit-maximizing,” “competitive market,” and “long-run equilibrium.”', 'Profit-maximizing: P = MC. Long-run equilibrium with entry and exit: P = ATC.'],
          worked: '- **“Profit-maximizing”** means P = MC (more generally MR = MC, but we’ll cross that bridge in the next chapter, on monopolies).\n- **“Competitive market”** means the firm is a price taker, and P is a given constant: it isn’t affected by this firm’s operations.\n- **“Long-run equilibrium”** usually (when all firms are identical) means that, thanks to entry and exit, P = ATC. And since P = MC, it follows that MC = ATC, which only holds at the minimum of ATC. This means profit should be zero.'
        },
        {
          key: 'rev', kind: 'number', label: 'Revenue',
          prompt: 'What is the firm’s total revenue?',
          answer: money(Rev),
          mistakes: [{ value: P, msg: 'That’s revenue per unit. Multiply by the quantity.' }],
          hints: ['For a competitive firm, average revenue is the price.', 'Revenue = P × q.'],
          worked: `Rev = P q = ${$(P)} × ${num(q)} = **${$(Rev)}**.`
        },
        {
          key: 'tc', kind: 'number', label: 'TC',
          prompt: 'What is its total cost?',
          answer: money(TC),
          mistakes: [
            { value: VC, msg: `That’s variable cost only. Add the ${$(FC)} fixed cost.` },
            { value: FC, msg: 'That’s fixed cost only. Add variable cost (AVC × q).' }
          ],
          hints: ['TC = FC + VC.', 'VC = AVC × q.'],
          worked: `TC = FC + VC = FC + AVC × q = ${num(FC)} + ${num(AVC)} × ${num(q)} = **${$(TC)}**.`
        },
        {
          key: 'profit', kind: 'number', label: 'Profit',
          prompt: 'What is its profit?',
          answer: money(0),
          mistakes: [{ value: FC, msg: `That would be right if ${$(AVC)} were average *total* cost. Here ${$(AVC)} is average *variable* cost: use the total cost you just found.` }],
          hints: ['Profit = revenue − total cost.'],
          worked: `Profit = Rev − TC = ${$(Rev)} − ${$(TC)} = **$0**. Being at the long-run equilibrium, we should indeed expect profit = 0.`
        },
        {
          key: 'mc', kind: 'number', label: 'MC',
          prompt: 'Can we figure out its marginal cost? If so, what is it?',
          answer: money(P),
          mistakes: [{ value: AVC, msg: 'That’s AVC. What does “profit-maximizing” tell you about MC?' }],
          hints: ['You don’t need a cost schedule. Look at the word “profit-maximizing.”', 'A profit-maximizing competitive firm produces where P = MC.'],
          worked: `Yes: we’re told the firm is profit-maximizing, so P = MC. Therefore **MC = ${$(P)}**.`
        },
        {
          key: 'atc', kind: 'number', label: 'ATC',
          prompt: 'What is its average total cost?',
          answer: money(P),
          mistakes: [
            { value: AVC, msg: 'That’s AVC. ATC also includes fixed cost per unit.' },
            { value: AFC, msg: `That’s average fixed cost (${$(FC)} ÷ ${num(q)}) only.` }
          ],
          hints: ['ATC = TC ÷ q.', 'Or: ATC = AVC + AFC.'],
          worked: `ATC = TC/q = ${$(TC)}/${num(q)} = **${$(P)}** (or AVC + AFC = ${$(AVC)} + ${$(AFC)}). ATC = P, as it must be in long-run equilibrium.`
        },
        {
          key: 'scale', kind: 'choice', label: 'Efficient scale',
          prompt: `Is the efficient scale of the firm more than, less than, or exactly ${num(q)} units?`,
          options: [
            { id: 'more', label: `More than ${num(q)}`, msg: `That would be true if MC were below ATC at ${num(q)} units. Compare MC and ATC from your last two answers.` },
            { id: 'less', label: `Less than ${num(q)}`, msg: `That would be true if MC were above ATC at ${num(q)} units. Compare MC and ATC from your last two answers.` },
            { id: 'exact', label: `Exactly ${num(q)}` }
          ],
          answer: 'exact',
          hints: ['The efficient scale is the quantity that minimizes ATC.', `MC crosses ATC at the minimum of ATC. At ${num(q)} units, how do MC and ATC compare?`],
          worked: `At q = ${num(q)}, MC = ${$(P)} and ATC = ${$(P)}. Draw the diagram that looks like the Greek letter psi: MC crosses ATC at the minimum of ATC, which is the efficient scale. So the firm produces **exactly** at its efficient scale, as every firm does in long-run equilibrium (P = MC = min ATC).`
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 15, exercise 3: Ball Bearings, Inc. (cost table, profit, shut down, exit)
// ======================================================================================
const bearings = {
  id: 'ch15-bearings',
  title: 'Ball Bearings, Inc.',
  summary: 'Build the cost table, then decide: how much to produce, shut down, exit?',
  worksheet: { FC: 120, a: 20, d: 10, qs: 5 },
  generate(r) {
    for (;;) {
      const p = { FC: r.pick([60, 120, 180, 240]), a: r.pick([10, 15, 20, 25, 30]), d: r.pick([6, 8, 10, 12, 14, 16, 20]), qs: r.pick([3, 4, 5]) };
      const P = p.a + p.d * (p.qs - 1), VC = p.a * p.qs + p.d * p.qs * (p.qs - 1) / 2;
      if (P * p.qs !== p.FC + VC) return p; // no break-even versions: the exit question needs an answer
    }
  },
  build({ FC, a, d, qs }) {
    const qs6 = range(7);
    const VC = qs6.map(q => a * q + d * q * (q - 1) / 2);
    const MC = q => VC[q] - VC[q - 1];
    const P = MC(qs);
    const row = q => ({ AFC: FC / q, AVC: VC[q] / q, ATC: (FC + VC[q]) / q, MC: MC(q) });
    const at = row(qs), Rev = P * qs, TC = FC + VC[qs], profit = Rev - TC, exit = profit < 0;
    check(at.AVC < P, 'P > AVC at the chosen row');
    const col = k => [1, 2, 3, 4, 5, 6].map(q => row(q)[k]);
    const same = (x, y) => x.every((v, i) => Math.abs(v - y[i]) < 1e-9);
    const patterns = [
      { col: 'AFC', values: [1, 2, 3, 4, 5, 6].map(() => FC), msg: 'AFC is fixed cost *per unit*: divide FC by the quantity.' },
      { col: 'AVC', values: VC.slice(1), msg: 'AVC is variable cost *per unit*: divide VC by the quantity.' },
      { col: 'ATC', values: col('AVC'), msg: 'Your ATC column matches AVC. ATC also includes fixed cost: ATC = AFC + AVC.' },
      { col: 'ATC', values: VC.slice(1).map(v => v + FC), msg: 'Your ATC column is total cost. Divide by the quantity.' },
      { col: 'MC', values: col('AVC'), msg: 'Your MC column matches AVC. MC is the *change* in cost from one more unit: VC in this row minus VC in the row above.' },
      { col: 'MC', values: VC.slice(1), msg: 'Your MC column is VC itself. MC is the *change* in VC from the row above.' }
    ].filter(w => !same(w.values, col(w.col)));
    const lossOrProfit = profit < 0 ? `a loss of **${$(-profit)}**` : `a profit of **${$(profit)}**`;
    return {
      body: [{ md: 'Ball Bearings, Inc., faces costs of production as follows:' }],
      steps: [
        {
          key: 'table', kind: 'table', label: 'Cost table', weight: 2,
          prompt: 'Fill out the table.',
          columns: [
            { key: 'Q', label: 'Quantity', given: true }, { key: 'FC', label: 'FC', given: true }, { key: 'VC', label: 'VC', given: true },
            { key: 'AFC', label: 'AFC' }, { key: 'AVC', label: 'AVC' }, { key: 'ATC', label: 'ATC' }, { key: 'MC', label: 'MC' }
          ],
          rows: qs6.map(q => ({ values: { Q: q, FC, VC: VC[q] }, answers: q ? row(q) : {} })),
          tol: 0.01,
          wrongPatterns: patterns,
          hints: ['AFC = FC ÷ Q, AVC = VC ÷ Q, and ATC = AFC + AVC.', 'MC is the extra cost of one more case: VC in this row minus VC in the row above.'],
          worked: 'AFC = FC/Q, AVC = VC/Q, ATC = AFC + AVC (or TC/Q), and MC = the change in VC from the row above.'
        },
        {
          key: 'q', kind: 'number', label: 'Output at P',
          prompt: `The price of a case of ball bearings is ${$(P)}. How many cases should the firm produce?`,
          answer: count(qs, 'cases'),
          mistakes: [
            { value: qs - 1, msg: `Close! The ${ORD[qs]} case adds ${$(P)} to revenue and ${$(P)} to cost, so profit is the same at ${qs - 1} or ${qs}. The rule we use is P = MC: in which row does that hold?` },
            ...(qs < 6 ? [{ value: qs + 1, msg: `At ${qs + 1} cases, MC = ${$(MC(qs + 1))} is above the ${$(P)} price: the ${ORD[qs + 1]} case costs more than it brings in.` }] : [])
          ],
          hints: ['A profit-maximizing competitive firm produces where P = MC.', `Find ${$(P)} in your MC column.`],
          worked: `P = MC = ${$(P)} in the row where **q = ${qs}**.`
        },
        {
          key: 'profit', kind: 'number', label: 'Profit',
          prompt: 'What is the firm’s profit? (Enter a loss as a negative number.)',
          answer: money(profit),
          mistakes: [
            { value: P - at.ATC, msg: 'That’s the margin on each case. How many cases does the firm sell?' },
            { value: Rev - VC[qs], msg: 'That’s revenue minus *variable* cost. Profit subtracts total cost.' }
          ],
          hints: ['Profit = (P − ATC) × q.', `At q = ${qs}, ATC = ${$(at.ATC)}.`],
          worked: `At q = ${qs}, ATC = ${$(at.ATC)}, so the per-unit margin is P − ATC = ${$(P)} − ${$(at.ATC)} = ${$(P - at.ATC)}. For all ${qs} units, this means ${lossOrProfit}.\n\nIf you prefer, you can also proceed as follows: Revenue = P q = ${$(P)} × ${qs} = ${$(Rev)}. TC = ATC q = ${$(at.ATC)} × ${qs} = ${$(TC)}. Profit = Rev − TC = ${$(Rev)} − ${$(TC)} = ${$(profit)}.`
        },
        {
          key: 'shutdown', kind: 'choice', label: 'Shut down?',
          prompt: 'Should the firm shut down (suspend operations)?',
          options: [
            { id: 'run', label: 'Keep operating' },
            { id: 'shut', label: 'Shut down', msg: `Shutting down wouldn’t save the ${$(FC)} fixed cost. Compare revenue with variable cost.` }
          ],
          answer: 'run',
          hints: ['“Shut down” refers to the short run, when the fixed cost must be paid anyway.', 'Compare revenue (P × q) with variable cost, or P with AVC.'],
          worked: `In the short run (which is what “shut down” refers to), the firm should **keep operating**. This is because its revenue (${$(Rev)}) exceeds its variable cost (VC = ${$(VC[qs])}).`
        },
        {
          key: 'shutdown-why', kind: 'explain', label: 'Why (short run)',
          prompt: 'Explain your answer in a sentence or two.',
          model: `Revenue of ${$(Rev)} exceeds variable cost of ${$(VC[qs])} (P = ${$(P)} > AVC = ${$(at.AVC)}), so operating covers variable cost and ${profit < 0 ? `pays ${$(Rev - VC[qs])} toward the ${$(FC)} fixed cost. Shutting down would mean losing the whole ${$(FC)} instead of ${$(-profit)}.` : `covers the ${$(FC)} fixed cost as well, leaving a profit.`}`,
          mustHave: [`compares revenue (${$(Rev)}) with variable cost (${$(VC[qs])}), or the price (${$(P)}) with AVC (${$(at.AVC)})`, 'concludes that the firm should keep operating in the short run'],
          hints: ['What would the firm lose if it shut down? What does it lose (or gain) by operating?']
        },
        {
          key: 'exit', kind: 'choice', label: 'Exit?',
          prompt: 'Should the firm exit (close permanently)?',
          options: [
            { id: 'exit', label: `Exit, if the price is expected to stay at ${$(P)}`, msg: 'Compare revenue with total cost: once every cost is counted, is the firm losing money?' },
            { id: 'stay', label: 'Stay in the market', msg: 'In the long run, the fixed cost can be avoided too. Compare revenue with total cost.' }
          ],
          answer: exit ? 'exit' : 'stay',
          hints: ['“Exit” refers to the long run, when every cost can be avoided.', 'Compare revenue with total cost, or P with ATC.'],
          worked: exit
            ? `In the long run (which is what “exit” refers to), if the price is expected to remain low, the firm may not want to renew any lease contracts or replace failing or worn-out machines, and should therefore **exit** the market. This is because its revenue (${$(Rev)}) does not cover its total cost (TC = ${$(TC)}).`
            : `The firm should **stay**: its revenue (${$(Rev)}) covers its total cost (TC = ${$(TC)}), so it earns a profit of ${$(profit)} even in the long run, when every cost counts.`
        },
        {
          key: 'exit-why', kind: 'explain', label: 'Why (long run)',
          prompt: 'Explain your answer in a sentence or two.',
          model: exit
            ? `Revenue (${$(Rev)}) does not cover total cost (${$(TC)}): P = ${$(P)} < ATC = ${$(at.ATC)}. In the long run the firm can avoid all its costs (for instance by not renewing leases or replacing worn-out machines), so it should exit if the price is expected to stay this low.`
            : `Revenue (${$(Rev)}) covers total cost (${$(TC)}): P = ${$(P)} > ATC = ${$(at.ATC)}. Even when every cost is avoidable, staying pays, so the firm should stay.`,
          mustHave: [`compares revenue (${$(Rev)}) with total cost (${$(TC)}), or the price (${$(P)}) with ATC (${$(at.ATC)})`,
            exit ? 'concludes that the firm should exit in the long run if the price stays low' : 'concludes that the firm should stay, because it makes a profit'],
          hints: ['In the long run, which costs count? Do they get covered?']
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 15, exercise 4: haircuts in Chattanooga (market, entry and exit, long run)
// ======================================================================================
// MC(q) = m0 + s(q − 1). With FC = s·L(L − 1)/2, ATC = MC at q = L (and at L − 1), so the
// long-run price min ATC = MC(L) is a whole number on the price grid.
const haircuts = {
  id: 'ch15-haircuts',
  title: 'Haircuts in Chattanooga',
  summary: 'From one salon’s costs to the whole market, in the short run and the long run.',
  worksheet: { s: 10, m0: 30, L: 5, q0: 3, QL: 900, start: 40 },
  generate(r) {
    const s = r.pick([5, 10, 15, 20]), m0 = r.pick([20, 25, 30, 35, 40]), L = r.pick([4, 5]);
    const q0 = r.pick([L - 2, L - 2, L - 1, L + 1]);
    const QL = L === 5 ? 100 * r.int(5, 10) : 100 * r.int(6, 10);
    return { s, m0, L, q0, QL, start: null };
  },
  build({ s, m0, L, q0, QL, start }) {
    const FC = s * L * (L - 1) / 2;
    const qs = [1, 2, 3, 4, 5, 6];
    const MC = q => m0 + s * (q - 1);
    const VC = q => qs.slice(0, q).reduce((t, k) => t + MC(k), 0);
    const TC = q => VC(q) + FC, ATC = q => TC(q) / q;
    const PL = MC(L), P0 = MC(q0);
    check(Math.abs(ATC(L) - PL) < 1e-9 && qs.every(q => ATC(q) >= PL - 1e-9), 'min ATC = MC(L)');
    check(QL % L === 0 && QL % 100 === 0, 'whole salons in the long run');
    const Q = P => QL + (PL - P) / s * 100;
    const firstP = start || (((L - 1) + QL / 100 + 1 <= 13) ? m0 : m0 + s);
    const grid = [];
    for (let P = firstP; Q(P) >= 0; P += s) grid.push([P, Q(P)]);
    const Q0 = Q(P0), n0 = Q0 / q0, profit0 = P0 * q0 - TC(q0), entry = profit0 > 0;
    check(Q0 > 0 && profit0 !== 0, 'current market');
    const nShow = Number.isInteger(n0) ? `**${num(n0)}** salons` : `about **${Math.round(n0)}** salons`;
    return {
      body: [
        { md: 'The market for haircuts in Chattanooga is competitive and has the following daily demand schedule:' },
        { table: { columns: ['Price ($)', 'Quantity'], rows: grid.map(([p, q]) => [p, q.toLocaleString('en-US')]), transpose: true } },
        { md: `The price of a haircut is currently ${$(P0)}. Each salon has fixed costs of ${$(FC)} and the following marginal cost:` }
      ],
      steps: [
        {
          key: 'table', kind: 'table', label: 'Cost table', weight: 2,
          prompt: 'Complete the table. Round ATC to the nearest dollar.',
          columns: [{ key: 'Q', label: 'Quantity', given: true }, { key: 'MC', label: 'MC', given: true }, { key: 'VC', label: 'VC' }, { key: 'TC', label: 'TC' }, { key: 'ATC', label: 'ATC' }],
          rows: qs.map(q => ({ values: { Q: q, MC: MC(q) }, answers: { VC: VC(q), TC: TC(q), ATC: Math.round(ATC(q) * 100) / 100 } })),
          tol: 0.01, colTol: { ATC: 0.51 },
          show: { ATC: qs.map(q => Math.round(ATC(q))) },
          wrongPatterns: [
            { col: 'VC', values: qs.map(MC), msg: `Your VC column repeats MC. VC adds up the marginal cost of every haircut so far: for example, VC at 3 haircuts = ${$(MC(1))} + ${$(MC(2))} + ${$(MC(3))}.` },
            { col: 'TC', values: qs.map(VC), msg: `Your TC column matches VC. Add the ${$(FC)} fixed cost.` },
            { col: 'ATC', values: qs.map(q => VC(q) / q), msg: 'Your ATC column is AVC. ATC divides *total* cost by the quantity.' }
          ],
          hints: ['VC is the running total of MC: VC at q = VC at (q − 1) + MC of the q-th haircut.', 'TC = VC + FC, and ATC = TC ÷ Q.'],
          worked: `VC adds up the marginal costs (VC at 3 = ${num(MC(1))} + ${num(MC(2))} + ${num(MC(3))} = ${$(VC(3))}), TC = VC + ${$(FC)}, and ATC = TC/Q.`
        },
        {
          key: 'Q', kind: 'number', label: 'Market Q now',
          prompt: 'How many haircuts will be performed each day in Chattanooga?',
          answer: count(Q0, 'haircuts'),
          hints: ['Read the demand schedule at the current price.'],
          worked: `At P = ${$(P0)}, the demand schedule gives **${num(Q0)}** haircuts a day.`
        },
        {
          key: 'q', kind: 'number', label: 'Haircuts per salon',
          prompt: 'How many haircuts will each salon do?',
          answer: count(q0, 'haircuts'),
          mistakes: [
            ...(q0 < 6 ? [{ value: q0 + 1, msg: `At ${q0 + 1} haircuts, MC = ${$(MC(q0 + 1))} is above the ${$(P0)} price: that haircut costs more than it brings in.` }] : []),
            ...(q0 > 1 ? [{ value: q0 - 1, msg: `At ${q0 - 1} haircuts, the next haircut costs only ${$(MC(q0))} and sells for ${$(P0)}. Where does P = MC?` }] : [])
          ],
          hints: ['Each salon is a price taker: it produces where P = MC.', `Find ${$(P0)} in the MC column.`],
          worked: `P = MC = ${$(P0)} at **q = ${q0}**.`
        },
        {
          key: 'n', kind: 'number', label: 'Salons now',
          prompt: 'How many salons are there? Round to the nearest whole salon.',
          answer: { value: n0, tol: 0.5, unit: 'salons', display: Number.isInteger(n0) ? `${num(n0)} salons` : `about ${Math.round(n0)} salons (${num(Q0)} ÷ ${q0} ≈ ${round1(n0)})` },
          mistakes: [{ value: Q0 / (q0 + 1), tol: 0.5, msg: `That assumes ${q0 + 1} haircuts per salon. How many does each salon do at ${$(P0)}?` }],
          hints: ['Market quantity = number of salons × haircuts per salon.', `Divide ${num(Q0)} by the number of haircuts each salon does.`],
          worked: `Number of salons = ${num(Q0)} ÷ ${q0}${Number.isInteger(n0) ? '' : ` ≈ ${round1(n0)}`}, so ${nShow}.`
        },
        {
          key: 'profit', kind: 'number', label: 'Profit per salon',
          prompt: 'How much profit or loss does each salon make? (Enter a loss as a negative number.)',
          answer: money(profit0),
          mistakes: [{ value: P0 * q0 - VC(q0), msg: `That’s revenue minus *variable* cost (${$(P0 * q0)} − ${$(VC(q0))}). Profit subtracts total cost.` }],
          hints: [`Revenue = ${$(P0)} × ${q0}.`, `Profit = revenue − TC, with TC from your table at q = ${q0}.`],
          worked: `Revenue = ${$(P0)} × ${q0} = ${$(P0 * q0)} and TC = ${$(TC(q0))}, so profit = **${$(profit0)}**${entry ? ', a profit' : ', a loss'} of ${$(Math.abs(profit0))} a day.${entry ? '' : ` (In the short run the salons keep operating, since revenue covers VC = ${$(VC(q0))}.)`}`
        },
        {
          key: 'lr', kind: 'choice', label: 'Long-run eq.?',
          prompt: 'Is the situation described above a long-run equilibrium?',
          options: [
            { id: 'yes', label: 'Yes', msg: 'With free entry and exit, profit is zero in the long run. What profit did you just find?' },
            { id: 'no', label: 'No' }
          ],
          answer: 'no',
          hints: ['What is each salon’s profit? What would salon owners (or would-be owners) do about it in the long run?'],
          worked: entry
            ? `**No.** Each salon makes ${$(profit0)} a day, so in the long run new salons open. Market supply shifts right and the price falls until profit is zero.`
            : `**No.** Each salon loses ${$(-profit0)} a day, so in the long run some salons will close. Market supply shifts left and the price rises until profit is zero.`
        },
        {
          key: 'lr-why', kind: 'explain', label: 'Why not long run',
          prompt: 'Explain your answer in a sentence or two.',
          model: entry
            ? `No. At ${$(P0)} the salons make a profit (P is above ATC: ${$(profit0)} a day), so with free entry new salons open. Market supply increases and the price falls until salons just break even, at P = min ATC.`
            : `No. At ${$(P0)} the salons lose money (P is below ATC: a ${$(-profit0)} loss a day), so with free exit some salons close. Market supply decreases and the price rises until the remaining salons break even, at P = min ATC.`,
          mustHave: entry
            ? ['points to the profits (positive profit, or P above ATC)', 'says that new salons will enter, so the market (price, number of salons) will change']
            : ['points to the losses (negative profit, or P below ATC)', 'says that salons will exit, so the market (price, number of salons) will change'],
          hints: [entry ? 'What do would-be salon owners do when existing salons make money?' : 'What do owners of money-losing salons do in the long run?']
        },
        {
          key: 'lr-p', kind: 'number', label: 'LR price',
          prompt: 'Suppose that in the long run there is free entry and exit. What is the market price in the long run?',
          answer: money(PL),
          mistakes: [{ value: P0, msg: `That’s today’s price, at which salons ${entry ? 'make a profit' : 'lose money'}. Where does entry and exit push the price?` }],
          hints: ['In long-run equilibrium, P = min ATC.', 'Find the lowest value in your ATC column.'],
          worked: `Free entry and exit push the price to the minimum of ATC: **P = ${$(PL)}**.`
        },
        {
          key: 'lr-profit', kind: 'number', label: 'LR profit',
          prompt: 'How much profit does each salon make in the long-run equilibrium?',
          answer: money(0),
          hints: ['In long-run equilibrium, P = ATC.'],
          worked: `P = ATC, so profit is **$0** (revenue ${$(PL * L)}, TC ${$(TC(L))}).`
        },
        {
          key: 'lr-q', kind: 'number', label: 'LR haircuts per salon',
          prompt: 'How many haircuts does each salon do each day?',
          answer: count(L, 'haircuts'),
          mistakes: [{ value: L - 1, msg: `ATC is ${$(PL)} at both ${L - 1} and ${L} haircuts, so profit is zero either way. A profit-maximizing salon produces where P = MC: in which row does that hold?` }],
          hints: ['Use P = MC at the new price.'],
          worked: `P = MC = ${$(PL)} at **q = ${L}**. ATC is also ${$(PL)} there, so each salon breaks even.`
        },
        {
          key: 'lr-Q', kind: 'number', label: 'LR market Q',
          prompt: 'How many haircuts are done in Chattanooga each day?',
          answer: count(QL, 'haircuts'),
          mistakes: [{ value: Q0, msg: 'That’s the quantity demanded at the old price. Read the demand schedule at the long-run price.' }],
          hints: ['Read the demand schedule at the long-run price.'],
          worked: `At P = ${$(PL)}, the quantity demanded is **${num(QL)}** haircuts a day.`
        },
        {
          key: 'lr-n', kind: 'number', label: 'LR salons',
          prompt: 'How many salons are operating?',
          answer: count(QL / L, 'salons'),
          mistakes: [{ value: QL / (L - 1), tol: 0.5, msg: `That assumes ${L - 1} haircuts per salon. How many does each salon do in the long run?` }],
          hints: ['Market quantity ÷ haircuts per salon.'],
          worked: `${num(QL)} ÷ ${L} = **${num(QL / L)}** salons, ${entry ? 'up' : 'down'} from ${Number.isInteger(n0) ? num(n0) : `about ${Math.round(n0)}`}.`
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 15, exercise 5: an industry of identical firms on its way to the long run
// ======================================================================================
// AVC(q) = a + b·q, so VC = a·q + b·q², MC(q) = a + b(2q − 1). FC is a multiple of 6, which
// keeps AFC and ATC to one decimal place.
const industry = {
  id: 'ch15-industry',
  title: 'An industry on its way to the long run',
  summary: 'Price, quantity demanded and each firm’s output as firms enter or exit.',
  worksheet: { n: 100, FC: 24, a: 1, b: 1, q0: 3 },
  generate(r) {
    for (;;) {
      const b = r.pick([1, 2, 3]), FC = b * r.pick([18, 24]), a = r.int(1, 5);
      const ATC = q => FC / q + a + b * q;
      const qs = [1, 2, 3, 4, 5, 6], best = Math.min(...qs.map(ATC));
      const at = qs.filter(q => Math.abs(ATC(q) - best) < 1e-9);
      if (at.length !== 1) continue;
      const qe = at[0];
      const loss = r.int(1, 3) <= 2;
      const q0 = loss ? r.pick(qs.filter(q => q < qe && q >= 2)) : r.pick(qs.filter(q => q > qe));
      if (!q0) continue;
      return { n: r.pick([50, 80, 100, 120, 150, 200]), FC, a, b, q0 };
    }
  },
  build({ n, FC, a, b, q0 }) {
    const qs = [1, 2, 3, 4, 5, 6];
    const AVC = q => a + b * q, VC = q => q * AVC(q), MC = q => a + b * (2 * q - 1), AFC = q => FC / q, ATC = q => AFC(q) + AVC(q);
    const best = Math.min(...qs.map(ATC)), qe = qs.find(q => Math.abs(ATC(q) - best) < 1e-9);
    const P = MC(q0), profit = (P - ATC(q0)) * q0, entry = profit > 0;
    check(profit !== 0 && (entry ? q0 > qe : q0 < qe), 'scenario');
    return {
      body: [{ md: `An industry currently has ${n} firms, each of which has fixed cost of ${$(FC)} and average variable cost as follows:` }],
      steps: [
        {
          key: 'table', kind: 'table', label: 'Cost table', weight: 2,
          prompt: 'Complete the table. Use one decimal place where needed.',
          columns: [{ key: 'Q', label: 'Quantity', given: true }, { key: 'AVC', label: 'AVC', given: true }, { key: 'VC', label: 'VC' }, { key: 'MC', label: 'MC' }, { key: 'AFC', label: 'AFC' }, { key: 'ATC', label: 'ATC' }],
          rows: qs.map(q => ({ values: { Q: q, AVC: AVC(q) }, answers: { VC: VC(q), MC: MC(q), AFC: round1(AFC(q)), ATC: round1(ATC(q)) } })),
          tol: 0.051,
          wrongPatterns: [
            { col: 'MC', values: qs.map(AVC), msg: 'Your MC column repeats AVC. MC is the change in VC from one row to the next.' },
            { col: 'MC', values: qs.map(VC), msg: 'Your MC column is VC itself. MC is the change in VC from the row above.' },
            { col: 'AFC', values: qs.map(() => FC), msg: `AFC is fixed cost *per unit*: divide ${$(FC)} by the quantity.` },
            { col: 'ATC', values: qs.map(AVC), msg: 'Your ATC column repeats AVC. Add AFC.' }
          ],
          hints: [`VC = AVC × Q, MC = the change in VC from the row above, AFC = ${$(FC)} ÷ Q, and ATC = AFC + AVC.`, 'A check: MC should cross ATC near ATC’s lowest point.'],
          worked: `VC = AVC × Q, MC = the change in VC, AFC = ${num(FC)}/Q, and ATC = AFC + AVC. ATC is lowest (${$(best)}) at Q = ${qe}, right where MC crosses it.`
        },
        {
          key: 'q', kind: 'number', label: 'Output per firm',
          prompt: `The equilibrium price is currently ${$(P)}. How much does each firm produce?`,
          answer: count(q0, 'units'),
          mistakes: [{ value: qe, msg: `At ${qe} units, MC = ${$(MC(qe))}, not ${$(P)}. Where does P = MC?` }],
          hints: ['Each firm produces where P = MC.', `Find ${$(P)} in your MC column.`],
          worked: `P = MC = ${$(P)} at **q = ${q0}**.`
        },
        {
          key: 'Q', kind: 'number', label: 'Market supply',
          prompt: 'What is the total quantity supplied in the market?',
          answer: count(n * q0, 'units'),
          mistakes: [{ value: q0, msg: `That’s one firm. There are ${n} of them.` }],
          hints: ['Number of firms × output per firm.'],
          worked: `${n} firms × ${q0} units = **${num(n * q0)}** units.`
        },
        {
          key: 'price', kind: 'choice', label: 'LR price direction',
          prompt: 'In the long run, firms can enter and exit the market, and all entrants have the same costs as above. As this market makes the transition to its long-run equilibrium, will the price rise or fall?',
          options: [
            { id: 'rise', label: 'Rise', msg: `Are firms making or losing money at ${$(P)}? Compare P with ATC at q = ${q0}.` },
            { id: 'fall', label: 'Fall', msg: `Are firms making or losing money at ${$(P)}? Compare P with ATC at q = ${q0}.` }
          ],
          answer: entry ? 'fall' : 'rise',
          hints: [`At q = ${q0}, ATC = ${$(ATC(q0))}. Is the price above or below that?`, entry ? 'Profits attract entry. What does entry do to market supply?' : 'Losses lead to exit. What does exit do to market supply?'],
          worked: entry
            ? `At ${$(P)}, each firm’s ATC is ${$(ATC(q0))}, so each makes a profit of ${$(profit)}. New firms enter, market supply shifts right, and the price **falls** toward min ATC (${$(best)}).`
            : `At ${$(P)}, each firm’s ATC is ${$(ATC(q0))}, so each loses ${$(-profit)}. Firms exit, market supply shifts left, and the price **rises** toward min ATC (${$(best)}).`
        },
        {
          key: 'price-why', kind: 'explain', label: 'Why the price changes',
          prompt: 'Explain your answer in a sentence or two.',
          model: entry
            ? `At ${$(P)} each firm makes a profit (ATC = ${$(ATC(q0))} at q = ${q0}, a profit of ${$(profit)}), so new firms enter. Market supply shifts right and the price falls until it reaches min ATC, ${$(best)}, where profit is zero.`
            : `At ${$(P)} each firm loses money (ATC = ${$(ATC(q0))} at q = ${q0}, a loss of ${$(-profit)}), so firms exit. Market supply shifts left and the price rises until it reaches min ATC, ${$(best)}, where profit is zero.`,
          mustHave: entry
            ? [`firms make a profit at ${$(P)} (P > ATC)`, 'firms enter, so market supply increases and the price falls']
            : [`firms lose money at ${$(P)} (P < ATC)`, 'firms exit, so market supply decreases and the price rises'],
          hints: [`Start from each firm’s profit at ${$(P)}, then follow what firms do about it.`]
        },
        {
          key: 'qd', kind: 'choice', label: 'Quantity demanded',
          prompt: 'Will the quantity demanded rise or fall?',
          options: [
            { id: 'rise', label: 'Rise', msg: 'Move along the demand curve: what happens to quantity demanded when the price goes up?' },
            { id: 'fall', label: 'Fall', msg: 'Move along the demand curve: what happens to quantity demanded when the price goes down?' }
          ],
          answer: entry ? 'rise' : 'fall',
          hints: ['Demand doesn’t shift here; the price changes. Move along the demand curve.'],
          worked: entry ? '**Rise**: the price falls, so buyers move down along the demand curve.' : '**Fall**: the price rises, so buyers move up along the demand curve.'
        },
        {
          key: 'qi', kind: 'choice', label: 'Output per firm',
          prompt: 'Will the quantity supplied by each firm rise or fall?',
          options: [
            { id: 'rise', label: 'Rise', msg: 'Each firm faces a lower price. Where does P = MC now?' },
            { id: 'fall', label: 'Fall', msg: 'There are fewer firms, yes, but each remaining firm faces a higher price. Where does P = MC now?' }
          ],
          answer: entry ? 'fall' : 'rise',
          hints: ['Each firm produces where P = MC, and MC rises with output.'],
          worked: entry
            ? `**Fall**: with a lower price, each firm moves down its MC curve, from ${q0} units toward its efficient scale (${qe} units, where ATC is lowest at ${$(best)}). Market quantity still rises, because there are more firms.`
            : `**Rise**: with a higher price, each remaining firm moves up its MC curve, from ${q0} units toward its efficient scale (${qe} units, where ATC is lowest at ${$(best)}). Market quantity still falls, because there are fewer firms.`
        }
      ]
    };
  }
};

// ======================================================================================

const COURSES = [
  {
    id: 'micro',
    title: 'Principles of Microeconomics',
    chapters: [
      {
        id: 'ch15', number: 15,
        title: 'Firms in competitive markets',
        subtitle: 'Shut down, exit, and long-run equilibrium',
        exercises: [bob, lrFirm, bearings, haircuts, industry]
      }
    ]
  }
];

module.exports = { COURSES, helpers: { num, $ } };
