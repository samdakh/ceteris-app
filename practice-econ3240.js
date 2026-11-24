/* Ceteris practice, Intermediate Microeconomics (ECON 3240).
   Built from the FA25 final (problems 1–7). Each exercise is a generator (see practice-catalog.js
   for the format): `worksheet` holds the numbers from the original exam.

   Money answers can be entered in dollars or, where the problem works in thousands, in thousands
   (answer.alt). */

const { num, $, money, count, check, round1 } = require('./practice-helpers');

// An amount given in thousands of dollars: accepted as 50,000 or as 50.
const K = v => Math.round(v * 1000 * 100) / 100;
const kd = v => ({ value: K(v), unit: '$', alt: [Math.round(v * 100) / 100] });
const kq = (v, unit) => ({ value: K(v), unit, alt: [Math.round(v * 1000) / 1000] });
const km = (v, msg) => [{ value: K(v), msg }, { value: v, msg }];
const $k = v => $(K(v));
const pct = v => `${num(v)}%`;

// ======================================================================================
// Chapter 1, exercise 1: rent control for student housing (FA25 final, problem 4)
// ======================================================================================
const housing = {
  id: 'im-housing',
  title: 'Rent control for student housing',
  summary: 'Free-market rent, a binding ceiling on the graph, the shortage and a homelessness rate.',
  worksheet: { A: 12, s: 0.5, Pc: 4 },
  generate(r) {
    for (;;) {
      const s = r.pick([0.5, 0.5, 2]);
      const A = r.pick(s === 0.5 ? [9, 12, 15, 18] : [9, 12, 15]);
      const Pstar = A / (1 + s);
      const Pc = r.int(Math.max(1, Math.ceil(Pstar / 3)), Pstar - 1);
      if (Number.isInteger(Pstar) && Pc < Pstar) return { A, s, Pc };
    }
  },
  build({ A, s, Pc }) {
    const Pstar = A / (1 + s), Qstar = s * Pstar, Qs = s * Pc, Qd = A - Pc, short = Qd - Qs, rate = (short / Qd) * 100;
    check(Pc < Pstar && Qs > 0, 'binding ceiling');
    const graph = {
      demand: { a: A, b: 1 }, supply: { c: 0, d: 1 / s }, step: 0.5,
      axes: { q: 'Apartments', qUnit: 'thousands', p: 'Annual rent ($ thousands)' },
      tools: { shift: false, tax: false, subsidy: false, ceiling: true, floor: false },
      show: { values: true, surplus: false, wedge: false, dwl: false, shortage: true },
      hide: ['gap']
    };
    return {
      body: [{ md: `Suppose that the market for student housing is competitive. The supply curve is **Qs = ${num(s)}P** and the demand curve is **Qd = ${num(K(A))} − P**, where P is the annual rent. (You may work in thousands: an answer of 8 means 8,000.)` }],
      steps: [
        {
          key: 'p', kind: 'number', label: 'Free-market rent',
          prompt: 'What will the free-market rent be?',
          answer: kd(Pstar),
          hints: ['In the free market, quantity supplied equals quantity demanded.', `Set ${num(s)}P = ${num(K(A))} − P and solve for P.`],
          worked: `Qs = Qd means ${num(s)}P = ${num(K(A))} − P, so ${num(1 + s)}P = ${num(K(A))} and **P = ${$k(Pstar)}**.`
        },
        {
          key: 'q', kind: 'number', label: 'Free-market quantity',
          prompt: 'How many units will be rented out?',
          answer: kq(Qstar, 'units'),
          mistakes: km(Pstar, 'That’s the rent. Plug it into either curve to get the quantity.'),
          hints: [`Plug the rent (${$k(Pstar)}) into the supply curve or the demand curve: you should get the same quantity.`],
          worked: `Qs = ${num(s)} × ${num(K(Pstar))} = **${num(K(Qstar))}** (and Qd = ${num(K(A))} − ${num(K(Pstar))} = ${num(K(Qstar))}, as it should).`
        },
        {
          key: 'binding', kind: 'choice', label: 'Binding?',
          prompt: `To help students, the city caps rent at ${$k(Pc)} a year. Is this price ceiling binding?`,
          options: [
            { id: 'no', label: 'No: a ceiling binds only if it’s above the free-market rent', msg: 'A ceiling is a maximum. If it were above the market rent, landlords would charge the market rent anyway. Which side of the market rent is this one on?' },
            { id: 'yes', label: 'Yes: it’s below the free-market rent' },
            { id: 'any', label: 'Yes: any price ceiling is binding', msg: 'Not quite: a ceiling above the market rent changes nothing, since nobody wants to charge more than the market rent anyway.' }
          ],
          answer: 'yes',
          hints: ['A ceiling is a legal maximum. When does a maximum actually stop landlords from doing what they’d do anyway?'],
          worked: `**Yes.** The ceiling (${$k(Pc)}) is below the free-market rent (${$k(Pstar)}), so it binds: landlords can’t charge the rent that would clear the market, and supply becomes the limiting factor.`
        },
        {
          key: 'graph', kind: 'graph', label: 'Ceiling on the graph',
          prompt: `Show the ${$k(Pc)} rent ceiling on the graph. (The graph is in thousands: ${$k(Pc)} is ${num(Pc)} on the rent axis.)`,
          graph, target: { mode: 'ceiling', dShift: 0, sShift: 0, price: Pc }, either: false,
          hints: ['A rent ceiling is a horizontal line at the capped rent.', `Drag the price line to ${num(Pc)} on the rent axis.`],
          worked: `A ceiling is a horizontal line at the capped rent: here at ${$k(Pc)}, below the free-market rent of ${$k(Pstar)}.`
        },
        {
          key: 'qs', kind: 'number', label: 'Students housed',
          prompt: `With rent control at ${$k(Pc)} a year, how many students will find housing? Confirm with algebra what the graph shows.`,
          answer: kq(Qs, 'students'),
          mistakes: [...km(Qd, `That’s how many students *want* an apartment at ${$k(Pc)}. How many apartments will landlords offer at that rent?`), ...km(Qstar, 'That’s the free-market quantity. The rent is lower now: how many apartments do landlords offer?')],
          hints: ['At a capped rent, the side of the market that wants less decides how much is traded.', `Plug ${num(K(Pc))} into the supply curve.`],
          worked: `At ${$k(Pc)}, landlords offer Qs = ${num(s)} × ${num(K(Pc))} = **${num(K(Qs))}** apartments, so only ${num(K(Qs))} students find housing.`
        },
        {
          key: 'short', kind: 'number', label: 'Shortage',
          prompt: 'At the controlled rent, how big is the shortage?',
          answer: kq(short, 'units'),
          mistakes: [...km(Qd, 'That’s the quantity demanded. The shortage is how many *more* apartments students want than landlords offer.'), ...km(Qstar - Qs, 'That compares with the free-market quantity. The shortage compares quantity demanded with quantity supplied, both at the capped rent.')],
          hints: [`First find the quantity demanded at ${$k(Pc)}.`, 'Shortage = quantity demanded − quantity supplied.'],
          worked: `Qd = ${num(K(A))} − ${num(K(Pc))} = ${num(K(Qd))} and Qs = ${num(K(Qs))}, so the shortage is ${num(K(Qd))} − ${num(K(Qs))} = **${num(K(short))}** units.`
        },
        {
          key: 'def', kind: 'choice', label: 'Rate definition',
          prompt: 'Call a student homeless if they can’t find student housing. Which is the most sensible **rate** of homelessness?',
          options: [
            { id: 'qs', label: 'The shortage ÷ the students who find housing (quantity supplied)', msg: 'That rate compares the homeless with the housed, so it can top 100%. A rate should be a share of a group the homeless belong to.' },
            { id: 'qstar', label: 'The shortage ÷ the free-market quantity', msg: 'The free-market quantity is no longer anybody in particular. Which group are the homeless part of?' },
            { id: 'qd', label: 'The shortage ÷ all the students who want an apartment at the capped rent (quantity demanded)' }
          ],
          answer: 'qd',
          hints: ['A rate is a share: the homeless as a fraction of a group they belong to.'],
          worked: 'The homeless are the students who want an apartment at the capped rent but can’t get one, so the natural rate is **the shortage divided by quantity demanded**.'
        },
        {
          key: 'rate', kind: 'number', label: 'Homelessness rate',
          prompt: 'Calculate that rate, in percent (to one decimal place).',
          answer: { value: round1(rate), unit: '%', tol: 0.051, display: pct(round1(rate)) },
          mistakes: [
            { value: Math.round(rate * 10) / 1000, msg: 'Right idea! Now write it as a percentage.' },
            { value: round1((short / Qs) * 100), msg: 'That divides by the students who found housing. Divide by all who want an apartment.' }
          ],
          hints: ['Rate = shortage ÷ quantity demanded, times 100.'],
          worked: `${num(K(short))} ÷ ${num(K(Qd))} = **${pct(round1(rate))}** of the students who want an apartment can’t find one.`
        },
        {
          key: 'who', kind: 'explain', label: 'Who gains, who loses',
          prompt: 'The rent cap was meant to help students. In a few sentences, explain which students it helps and which it hurts.',
          model: `Students who still find an apartment gain: they pay ${$k(Pc)} instead of ${$k(Pstar)}. But at the lower rent, landlords offer fewer apartments (${num(K(Qs))} instead of ${num(K(Qstar))}), so some students who would have rented an apartment in the free market can no longer find one, even though they’d gladly pay the market rent. They are worse off, and so are landlords. The lost rentals are a deadweight loss.`,
          mustHave: ['says the students who find housing gain from the lower rent', 'says fewer apartments are rented than in the free market, so some students who would have found housing no longer do (or that landlords lose)'],
          hints: ['Compare how many apartments are rented with and without the cap.']
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 2, exercise 1: a monopolist with constant costs (problem 1)
// ======================================================================================
const monopoly = {
  id: 'im-monopoly',
  title: 'A monopolist with constant costs',
  summary: 'MR = MC, profit and consumer surplus, then competition and the deadweight loss.',
  worksheet: { A: 90, c: 10 },
  generate(r) {
    for (;;) {
      const A = r.pick([60, 70, 80, 90, 100, 110, 120]), c = 2 * r.int(2, 15);
      if ((A - c) % 2 === 0 && A - c >= 40) return { A, c };
    }
  },
  build({ A, c }) {
    const QM = (A - c) / 2, PM = A - QM, profit = (PM - c) * QM, CS = (QM * (A - PM)) / 2;
    const Qc = A - c, CSc = (Qc * (A - c)) / 2, DWL = CSc - CS - profit;
    return {
      body: [{ md: `A monopolist can produce at constant average and marginal costs of ATC = MC = ${$(c)}. The firm faces a market demand curve given by **Q = ${A} − P**.` }],
      steps: [
        {
          key: 'qm', kind: 'number', label: 'Monopoly quantity',
          prompt: 'What quantity maximizes the monopolist’s profit?',
          answer: count(QM, 'units'),
          mistakes: [
            { value: Qc, msg: 'That’s where P = MC: the competitive quantity. A monopolist compares MC with *marginal revenue*.' },
            { value: A / 2, msg: 'That’s where MR = 0, which maximizes revenue. With a cost of each unit, set MR = MC instead.' }
          ],
          hints: [`Write the demand curve as P = ${A} − Q, then find total revenue P × Q.`, `TR = (${A} − Q)Q, so MR = ${A} − 2Q. Set MR = MC.`],
          worked: `Inverse demand is P = ${A} − Q, so TR = (${A} − Q)Q and MR = ${A} − 2Q. Setting MR = MC: ${A} − 2Q = ${c}, so **Q = ${QM}**.`
        },
        {
          key: 'pm', kind: 'number', label: 'Monopoly price',
          prompt: 'What price does it charge?',
          answer: money(PM),
          mistakes: [{ value: c, msg: 'That’s marginal cost (and marginal revenue at the optimum). Read the price off the *demand* curve.' }],
          hints: ['The monopolist charges the most buyers will pay for that quantity: read it off the demand curve.'],
          worked: `P = ${A} − ${QM} = **${$(PM)}**.`
        },
        {
          key: 'profit', kind: 'number', label: 'Monopoly profit',
          prompt: 'What are the monopolist’s profits?',
          answer: money(profit),
          mistakes: [{ value: PM * QM, msg: 'That’s revenue. Profit subtracts the cost of each unit.' }],
          hints: ['Profit = (P − ATC) × Q.'],
          worked: `Profit = (${$(PM)} − ${$(c)}) × ${QM} = **${$(profit)}**.`
        },
        {
          key: 'cs', kind: 'number', label: 'Consumer surplus (monopoly)',
          prompt: 'How much consumer surplus do buyers get?',
          answer: money(CS),
          mistakes: [{ value: 2 * CS, msg: 'Almost: consumer surplus is a triangle, so don’t forget the ½.' }],
          hints: [`Consumer surplus is the triangle between the demand curve and the price, from 0 to ${QM} units.`, `Its height is ${$(A)} − ${$(PM)}.`],
          worked: `CS = ½ × ${QM} × (${$(A)} − ${$(PM)}) = **${$(CS)}**.`
        },
        {
          key: 'qc', kind: 'number', label: 'Competitive quantity',
          prompt: 'What output level would this industry produce under perfect competition (where price = marginal cost)?',
          answer: count(Qc, 'units'),
          mistakes: [{ value: QM, msg: 'That’s the monopoly output. Under competition, the price falls to marginal cost.' }],
          hints: [`Set P = MC: ${A} − Q = ${c}.`],
          worked: `P = MC: ${A} − Q = ${c}, so **Q = ${Qc}**.`
        },
        {
          key: 'csc', kind: 'number', label: 'Consumer surplus (competition)',
          prompt: 'How much consumer surplus do buyers get under perfect competition?',
          answer: money(CSc),
          mistakes: [{ value: 2 * CSc, msg: 'Almost: don’t forget the ½ for the triangle.' }],
          hints: [`The price is now ${$(c)}, and ${Qc} units are sold.`],
          worked: `CS = ½ × ${Qc} × (${$(A)} − ${$(c)}) = **${$(CSc)}**.`
        },
        {
          key: 'dwl', kind: 'number', label: 'Deadweight loss',
          prompt: 'Consumer surplus under competition exceeds the sum of the monopolist’s profit and consumer surplus under monopoly. By how much? (That’s the deadweight loss from monopolization.)',
          answer: money(DWL),
          mistakes: [{ value: CSc - CS, msg: 'That’s all the consumer surplus lost to monopoly. Part of it isn’t lost to society: it goes to the monopolist as profit.' }],
          hints: ['Deadweight loss = CS under competition − (CS + profit under monopoly).'],
          worked: `${$(CSc)} − (${$(CS)} + ${$(profit)}) = **${$(DWL)}**. It’s the triangle between demand and MC from ${QM} to ${Qc} units: ½ × ${Qc - QM} × (${$(PM)} − ${$(c)}).`
        },
        {
          key: 'why-dwl', kind: 'explain', label: 'Transfer vs. deadweight loss',
          prompt: 'Not all the consumer surplus that buyers lose to the monopoly is lost to society. In a few sentences, explain which part isn’t, and where the deadweight loss comes from.',
          model: `The monopoly’s profit (the rectangle between the monopoly price and marginal cost, over the ${QM} units sold) is a transfer from buyers to the firm: buyers lose it, but the firm gains it, so society as a whole doesn’t. The deadweight loss comes from the units between ${QM} and ${Qc} that are no longer produced: buyers value them more than they cost to make, but the monopolist restricts output to keep its price high, so those gains from trade are lost to everyone.`,
          mustHave: ['says the monopoly profit is a transfer from consumers to the firm, not a loss to society', 'says the deadweight loss comes from units that are not produced although buyers value them above marginal cost (the monopolist restricts output)'],
          hints: ['Who gets the money buyers pay above marginal cost? And what about the units that are never sold?']
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 2, exercise 2: regulating a natural monopoly (problem 2)
// ======================================================================================
const gas = {
  id: 'im-gas',
  title: 'Regulating a natural gas utility',
  summary: 'An unregulated natural monopoly, marginal-cost pricing, and the break-even price.',
  worksheet: { a: 480, c: 60, F: 12000 },
  generate(r) {
    for (;;) {
      const a = r.pick([360, 400, 440, 480, 520, 560, 600]), c = 2 * r.int(10, 50);
      const Qu = a / 2 - c;
      if (Qu < 60) continue;
      const gross = (Qu * Qu) / 2, F = Math.round((gross * r.int(50, 85)) / 100 / 1000) * 1000;
      if (F >= 2000 && F < gross - 500) return { a, c, F };
    }
  },
  build({ a, c, F }) {
    const Qu = a / 2 - c, Pu = (a - Qu) / 2, gross = (Pu - c) * Qu, profit = gross - F;
    const Qr = a - 2 * c;
    const B = a + 2 * c, disc = B * B - 8 * (a * c + F);
    check(disc > 0, 'break-even price exists');
    const Pbe = (B - Math.sqrt(disc)) / 4;
    return {
      body: [{ md: `Because of the large fixed cost of running pipes to everyone’s home, natural gas is locally provided by a natural monopoly. Suppose demand is **Q = ${a} − 2P** and marginal revenue is **MR = ${a / 2} − Q**. Marginal cost is ${$(c)}, and the fixed cost of setting up the pipelines is ${$(F)}.` }],
      steps: [
        {
          key: 'qu', kind: 'number', label: 'Unregulated quantity',
          prompt: 'If the monopolist is unregulated, what quantity will it sell?',
          answer: count(Qu, 'units'),
          mistakes: [
            { value: Qr, msg: 'That’s where price equals marginal cost. An unregulated monopolist sets *marginal revenue* equal to marginal cost.' },
            { value: a / 2, msg: 'That’s where MR = 0. Set MR equal to marginal cost instead.' }
          ],
          hints: ['Set MR = MC.', `${a / 2} − Q = ${c}.`],
          worked: `MR = MC: ${a / 2} − Q = ${c}, so **Q = ${Qu}**.`
        },
        {
          key: 'pu', kind: 'number', label: 'Unregulated price',
          prompt: 'What price will it charge?',
          answer: money(Pu),
          mistakes: [
            { value: c, msg: 'That’s marginal cost. Read the price off the demand curve.' },
            { value: a - Qu, msg: `Careful with the demand curve: Q = ${a} − 2P means P = (${a} − Q)/2.` }
          ],
          hints: [`Solve the demand curve for P: P = (${a} − Q)/2.`],
          worked: `P = (${a} − ${Qu})/2 = **${$(Pu)}**.`
        },
        {
          key: 'profit-u', kind: 'number', label: 'Unregulated profit',
          prompt: 'How much profit will it make?',
          answer: money(profit),
          mistakes: [{ value: gross, msg: `That’s before the ${$(F)} fixed cost.` }],
          hints: ['Profit = (P − MC) × Q − fixed cost.'],
          worked: `Profit = (${$(Pu)} − ${$(c)}) × ${Qu} − ${$(F)} = ${$(gross)} − ${$(F)} = **${$(profit)}**.`
        },
        {
          key: 'pr', kind: 'number', label: 'Efficient price',
          prompt: 'What regulated price maximizes social welfare (the sum of consumer and producer surplus)?',
          answer: money(c),
          mistakes: [{ value: Pu, msg: 'That’s the monopoly price. Total surplus is largest when every unit buyers value above its marginal cost gets produced.' }],
          hints: ['Total surplus is maximized where the demand curve meets marginal cost.'],
          worked: `Set the price at marginal cost: **P = ${$(c)}**. Every unit that buyers value above its cost of ${$(c)} is then produced (Q = ${a} − 2 × ${c} = ${Qr}).`
        },
        {
          key: 'profit-r', kind: 'number', label: 'Profit at P = MC',
          prompt: 'What is the monopolist’s profit at that price? (Don’t forget the fixed cost. Enter a loss as a negative number.)',
          answer: money(-F),
          mistakes: [{ value: 0, msg: 'Revenue does cover the cost of each unit at P = MC. What about the fixed cost?' }],
          hints: ['At P = MC, each unit sells for exactly what it costs to produce.'],
          worked: `Each unit sells for its marginal cost, so revenue just covers variable costs: profit = (${$(c)} − ${$(c)}) × ${Qr} − ${$(F)} = **${$(-F)}**, a loss equal to the fixed cost.`
        },
        {
          key: 'equation', kind: 'choice', label: 'Break-even equation',
          prompt: 'To ensure sustainable operations, the regulator wants to set the price where the utility exactly breaks even. To find the price at which profit is zero, which equation does it need to solve?',
          options: [
            { id: 'a', label: `${a / 2} − 4P = ${num(F)}`, msg: 'This mixes up the MR and demand curves. Write profit as (price − marginal cost) × quantity demanded, and set it equal to the fixed cost.' },
            { id: 'b', label: `(P − ${c})(${a} − 2P) = ${num(F)}` },
            { id: 'c', label: `P(${a / 2} − 4Q) = ${num(F)}`, msg: 'Profit depends on the price and the quantity buyers want at that price. Write both in terms of P.' },
            { id: 'd', label: `P(${a} − 2P) = ${num(F)}`, msg: 'That’s revenue equal to the fixed cost. What about the variable cost of each unit?' }
          ],
          answer: 'b',
          hints: ['Profit = (P − MC) × Q − fixed cost, with Q from the demand curve. Set it to zero.'],
          worked: `Profit = (P − ${c})(${a} − 2P) − ${num(F)}. Setting it to zero gives **(P − ${c})(${a} − 2P) = ${num(F)}**.`
        },
        {
          key: 'pbe', kind: 'number', label: 'Break-even price',
          prompt: 'Now solve it: what is the lowest price at which the utility breaks even? (Round to the nearest cent.)',
          answer: { value: Math.round(Pbe * 100) / 100, unit: '$', tol: 0.02 },
          mistakes: [{ value: Math.round(((B + Math.sqrt(disc)) / 4) * 100) / 100, msg: 'That price breaks even too, but it’s the higher of the two. The regulator wants the lower one, which serves more customers.' }],
          hints: [`Expand: −2P² + ${B}P − ${num(a * c)} = ${num(F)}, i.e. 2P² − ${B}P + ${num(a * c + F)} = 0.`, 'Use the quadratic formula and take the smaller root.'],
          worked: `2P² − ${B}P + ${num(a * c + F)} = 0, so P = (${B} ± √${num(disc)}) / 4. The lower root is **${$(Pbe)}**.`
        },
        {
          key: 'why-not-mc', kind: 'explain', label: 'Why not price at MC',
          prompt: 'Setting the price at marginal cost maximizes total surplus. In a few sentences, explain why a regulator usually doesn’t do that with a natural monopoly.',
          model: `At P = MC, the utility’s revenue only covers its variable costs; it can’t recover its ${$(F)} fixed cost, so it loses money. A firm making losses won’t keep operating or invest in pipelines without a subsidy. So, unless the government pays the subsidy, the regulator sets a higher, break-even price (average-cost pricing), accepting a small deadweight loss to keep the utility in business.`,
          mustHave: ['says that at P = MC the firm loses money because it cannot cover its fixed cost', 'says a firm making losses will not keep operating or invest without a subsidy, so the regulator sets a higher (break-even, average-cost) price'],
          hints: ['What happens to the utility’s profit at P = MC, and what would the utility do about it?']
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 2, exercise 3: price discrimination and arbitrage (problem 3)
// ======================================================================================
const iphone = {
  id: 'im-iphone',
  title: 'iPhones in Canada and the U.S.',
  summary: 'Third-degree price discrimination, and what arbitrage does to it.',
  worksheet: { aC: 2000000, aU: 6000000, c: 500, s: 50 },
  generate(r) {
    for (;;) {
      const c = r.pick([400, 500, 600]), aC = r.pick([1600000, 2000000, 2400000]), aU = r.pick([5200000, 6000000, 6800000, 7200000]);
      const s = r.pick([30, 40, 50, 75, 100]);
      const PC = (aC + 1000 * c) / 2000, PU = (aU + 2000 * c) / 4000;
      if (PU - PC > 2 * s) return { aC, aU, c, s };
    }
  },
  build({ aC, aU, c, s }) {
    const bC = 1000, bU = 2000;
    const PC = (aC + bC * c) / (2 * bC), PU = (aU + bU * c) / (2 * bU);
    const QU = (aU - bU * c) / 2;
    check(PU - PC > s, 'arbitrage binds');
    const x = (aC + aU + (bC + bU) * c - 2 * bU * s) / (2 * (bC + bU));
    const r10 = v => Math.round(v / 10) * 10;
    return {
      body: [
        { md: `Apple sells the same iPhones in Canada and in the U.S. at a constant marginal (and average variable) cost of ${$(c)}. (Assume a U.S. dollar is worth the same as a Canadian loonie.) Demand is **Qc = ${num(aC)} − ${num(bC)}Pc** in Canada and **Qu = ${num(aU)} − ${num(bU)}Pu** in the U.S.` },
        { md: 'For your information, when a monopolist faces a linear demand Q = a − bP and produces at a constant marginal cost c, it maximizes profit by charging **P = (a + bc) / 2b**. At that price, it sells **Q = (a − bc) / 2**.' }
      ],
      steps: [
        {
          key: 'pc', kind: 'number', label: 'Canadian price',
          prompt: 'If Apple can keep the two markets separate, what price will it charge in Canada?',
          answer: money(PC),
          mistakes: [{ value: aC / (2 * bC), msg: 'That leaves out marginal cost: it’s the revenue-maximizing price. Plug c into the formula too.' }],
          hints: [`For Canada, a = ${num(aC)}, b = ${num(bC)} and c = ${c}.`],
          worked: `Pc = (${num(aC)} + ${num(bC)} × ${c}) / (2 × ${num(bC)}) = **${$(PC)}**.`
        },
        {
          key: 'pu', kind: 'number', label: 'U.S. price',
          prompt: 'And what price will it charge in the U.S.?',
          answer: money(PU),
          mistakes: [{ value: aU / (2 * bU), msg: 'That leaves out marginal cost. Plug c into the formula too.' }],
          hints: [`For the U.S., a = ${num(aU)}, b = ${num(bU)} and c = ${c}.`],
          worked: `Pu = (${num(aU)} + ${num(bU)} × ${c}) / (2 × ${num(bU)}) = **${$(PU)}**. Americans pay more: their demand is less price-sensitive at these prices.`
        },
        {
          key: 'arbitrage', kind: 'number', label: 'U.S. price with arbitrage',
          prompt: `Now suppose Americans can buy iPhones from online Canadian retailers, who ship to the U.S. for ${$(s)}. If Apple keeps its Canadian price at ${$(PC)}, what is the most it can charge in the U.S.?`,
          answer: money(PC + s),
          mistakes: [
            { value: PU, msg: `At ${$(PU)}, an American could buy in Canada and pay only ${$(PC)} + ${$(s)} shipping. Would anyone buy from Apple in the U.S.?` },
            { value: PC, msg: 'Americans would pay up to the Canadian price *plus* shipping before turning to Canadian retailers.' },
            { value: PC - s, msg: 'Shipping makes the Canadian phone more expensive for Americans, not cheaper.' }
          ],
          hints: ['What does it cost an American to get an iPhone from Canada instead?'],
          worked: `An American can get an iPhone from Canada for ${$(PC)} + ${$(s)} shipping = ${$(PC + s)}. Any higher U.S. price and nobody buys from Apple in the U.S., so the most Apple can charge is **${$(PC + s)}**.`
        },
        {
          key: 'raise', kind: 'choice', label: 'Canadian price',
          prompt: `Should Apple keep its Canadian price at ${$(PC)}?`,
          options: [
            { id: 'keep', label: `Yes: ${$(PC)} still maximizes profit in Canada`, msg: 'It maximizes profit from Canada alone. But now the Canadian price also caps the U.S. price. What would a slightly higher Canadian price do in the U.S.?' },
            { id: 'lower', label: 'No: it should lower the Canadian price to sell more in Canada', msg: 'A lower Canadian price would also force a lower U.S. price, in the bigger market. Which way helps more?' },
            { id: 'raise', label: 'No: it should raise the Canadian price, which lets it charge more in the bigger U.S. market' }
          ],
          answer: 'raise',
          hints: [`At ${$(PC)}, Canadian profit is at its peak. What does a small change in price do to profit at the top of a hill?`],
          worked: `**Raise it.** At ${$(PC)}, Canadian profit is at its peak, so raising the Canadian price a little costs almost nothing in Canada. But each extra dollar in Canada lets Apple charge a dollar more on the ${num(QU)} or so iPhones it sells in the U.S. Maximizing total profit with Pu = Pc + ${$(s)} gives a Canadian price of about ${$(r10(x))} and a U.S. price of about ${$(r10(x + s))}.`
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 3, exercise 1: used trucks when owners know more (problem 5)
// ======================================================================================
const truckValues = r => {
  const Gs = r.int(10, 14), Gb = Gs + r.pick([1, 2, 3]), Bs = r.int(4, 7), Bb = Bs + r.pick([1, 2]);
  return { Gs, Gb, Bs, Bb };
};
const truckBody = ({ Gs, Gb, Bs, Bb }, who) => [{ md: `Among ten-year-old GMC Sierras, it’s well known that one in two trucks is good and one in two is a lemon. All parties know that a good truck is worth ${$k(Gs)} to current owners and ${$k(Gb)} to potential buyers. A bad truck is only worth ${$k(Bs)} to current owners and ${$k(Bb)} to potential buyers. Throughout, assume that ${who} are risk-neutral. (You may work in thousands of dollars.)` }];

const lemons = {
  id: 'im-lemons',
  title: 'Used trucks: when sellers know more',
  summary: 'Expected values, and why good trucks vanish when only owners know quality.',
  worksheet: { Gs: 12, Gb: 14, Bs: 6, Bb: 8 },
  generate(r) {
    for (;;) {
      const v = truckValues(r);
      if (v.Gb + v.Bb < 2 * v.Gs) return v;
    }
  },
  build(v) {
    const { Gs, Gb, Bs, Bb } = v, Es = (Gs + Bs) / 2, Eb = (Gb + Bb) / 2, X = Eb - 0.1;
    check(Eb < Gs, 'good trucks cannot sell');
    return {
      body: truckBody(v, 'buyers'),
      steps: [
        {
          key: 'none-sell', kind: 'choice', label: 'Nobody knows: good truck sells?',
          prompt: 'Suppose quality is known to **neither** current owners **nor** potential buyers. Will a good truck sell?',
          options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No', msg: 'Nobody knows which trucks are good. How much is a truck of unknown quality worth to an owner, and to a buyer?' }],
          answer: 'yes',
          hints: ['If nobody knows a truck’s quality, both sides value it at its expected value.'],
          worked: `**Yes.** Nobody can tell good trucks from lemons, so both sides use expected values: to an owner, any truck is worth ½ × ${$k(Gs)} + ½ × ${$k(Bs)} = ${$k(Es)}; to a buyer, ½ × ${$k(Gb)} + ½ × ${$k(Bb)} = ${$k(Eb)}. Buyers value it more, so it sells.`
        },
        {
          key: 'none-min', kind: 'number', label: 'Nobody knows: lowest price',
          prompt: 'For how much, at least?',
          answer: kd(Es),
          mistakes: [...km(Gs, 'The owner doesn’t know her truck is good. What is a truck of unknown quality worth to her?'), ...km(Bs, 'The owner doesn’t know her truck is bad either. Use the expected value.')],
          hints: ['The owner won’t sell for less than what the truck is worth to her, on average.'],
          worked: `The owner wants at least her expected value: ½ × ${$k(Gs)} + ½ × ${$k(Bs)} = **${$k(Es)}**.`
        },
        {
          key: 'none-max', kind: 'number', label: 'Nobody knows: highest price',
          prompt: 'And at most?',
          answer: kd(Eb),
          mistakes: km(Gb, 'The buyer doesn’t know the truck is good. What is a truck of unknown quality worth to him?'),
          hints: ['A risk-neutral buyer pays at most his expected value of the truck.'],
          worked: `A buyer pays at most ½ × ${$k(Gb)} + ½ × ${$k(Bb)} = **${$k(Eb)}**.`
        },
        {
          key: 'none-bad', kind: 'choice', label: 'Nobody knows: bad truck',
          prompt: 'Still with nobody knowing quality: will a bad truck sell, and in what price range?',
          options: [
            { id: 'own', label: `Yes, for ${$k(Bs)} to ${$k(Bb)}`, msg: 'Nobody knows this truck is bad, so nobody can price it as a lemon.' },
            { id: 'same', label: `Yes, in the same range as a good truck: ${$k(Es)} to ${$k(Eb)}` },
            { id: 'no', label: 'No', msg: 'Nobody can tell it apart from a good truck. Is it any different, to either side, from the truck in the previous question?' }
          ],
          answer: 'same',
          hints: ['Can anyone tell this truck apart from a good one?'],
          worked: `**Yes, in the same range (${$k(Es)} to ${$k(Eb)}).** Since nobody knows, a bad truck looks exactly like any other truck to both sides.`
        },
        {
          key: 'both-min', kind: 'number', label: 'Everyone knows: good, lowest',
          prompt: 'Now suppose quality is known to **both** owners and buyers. A good truck will sell. For how much, at least?',
          answer: kd(Gs),
          mistakes: km(Es, 'Everyone knows this truck is good now: no need for expected values.'),
          hints: ['What is a good truck worth to its owner?'],
          worked: `A good truck’s owner wants at least **${$k(Gs)}**.`
        },
        {
          key: 'both-max', kind: 'number', label: 'Everyone knows: good, highest',
          prompt: 'And at most?',
          answer: kd(Gb),
          mistakes: km(Eb, 'Everyone knows this truck is good now: no need for expected values.'),
          hints: ['What is a good truck worth to a buyer?'],
          worked: `A buyer pays at most **${$k(Gb)}** for a truck he knows is good.`
        },
        {
          key: 'both-bad', kind: 'choice', label: 'Everyone knows: bad truck',
          prompt: 'Still with everyone knowing quality: will a bad truck sell, and in what range?',
          options: [
            { id: 'avg', label: `Yes, for ${$k(Es)} to ${$k(Eb)}`, msg: 'Everyone knows the truck is bad: no need for expected values.' },
            { id: 'no', label: 'No: nobody wants a lemon', msg: `A lemon is still worth ${$k(Bb)} to a buyer, more than the ${$k(Bs)} it’s worth to its owner.` },
            { id: 'bad', label: `Yes, for ${$k(Bs)} to ${$k(Bb)}` }
          ],
          answer: 'bad',
          hints: ['Is a lemon worth more to a buyer than to its owner?'],
          worked: `**Yes, for ${$k(Bs)} to ${$k(Bb)}.** A lemon is worth more to buyers than to owners, so it trades, at a lemon’s price.`
        },
        {
          key: 'random', kind: 'number', label: 'Buyer’s value of a random truck',
          prompt: 'Now suppose quality is known to current owners, but **buyers can’t tell**. How much is a buyer willing to pay, at most, for a *randomly selected* truck (not necessarily one that’s for sale)?',
          answer: kd(Eb),
          mistakes: [...km(Gb, 'The buyer can’t tell whether this truck is good.'), ...km(Bb, 'A *randomly selected* truck is good half the time.'), ...km(Es, 'That’s an owner’s expected value. What’s a random truck worth to a buyer?')],
          hints: ['A random truck is good half the time.'],
          worked: `½ × ${$k(Gb)} + ½ × ${$k(Bb)} = **${$k(Eb)}**.`
        },
        {
          key: 'asym-good', kind: 'choice', label: 'Owners know: good truck sells?',
          prompt: 'Still assuming owners know quality but buyers don’t, and in light of your previous answer: will a good truck sell?',
          options: [
            { id: 'yes', label: `Yes, for ${$k(Gs)} to ${$k(Gb)}`, msg: `Buyers can’t tell this truck is good. Would any of them pay ${$k(Gs)}?` },
            { id: 'no', label: `No: buyers pay at most ${$k(Eb)} for a truck they can’t check, less than the ${$k(Gs)} its owner wants` }
          ],
          answer: 'no',
          hints: [`Compare what a buyer will pay for a truck he can’t check with what the owner of a good truck wants.`],
          worked: `**No.** Buyers will pay at most ${$k(Eb)} for a truck they can’t check, but the owner of a good truck knows it’s good and wants at least ${$k(Gs)}. So she keeps it.`
        },
        {
          key: 'asym-bad', kind: 'choice', label: 'Owners know: lemon sells?',
          prompt: 'Will a lemon sell? If so, in what range?',
          options: [
            { id: 'avg', label: `Yes, for ${$k(Es)} to ${$k(Eb)}`, msg: 'Think about which trucks are actually offered for sale, and what buyers will conclude.' },
            { id: 'bad', label: `Yes, for ${$k(Bs)} to ${$k(Bb)}` },
            { id: 'no', label: 'No: the market collapses entirely', msg: `A lemon is worth ${$k(Bb)} to a buyer and ${$k(Bs)} to its owner. Can they still strike a deal, once everyone knows only lemons are for sale?` }
          ],
          answer: 'bad',
          hints: ['If good trucks can’t sell, which trucks are left on the market? What will buyers conclude?'],
          worked: `**Yes, for ${$k(Bs)} to ${$k(Bb)}.** Buyers (and sellers) realize good trucks can’t sell, so any truck offered must be a lemon. Lemons then sell at a lemon’s price.`
        },
        {
          key: 'haggle', kind: 'choice', label: 'What a low price reveals',
          prompt: `After much haggling, an owner agrees to let her truck go for ${$k(X)}. What’s the most likely implication?`,
          options: [
            { id: 'good', label: 'It’s a good truck.', msg: `The owner of a good truck wants at least ${$k(Gs)}.` },
            { id: 'lemon', label: 'The truck is a lemon.' },
            { id: 'gamble', label: 'It’s a gamble.', msg: 'The owner knows what she has. What does her willingness to sell at this price tell you?' }
          ],
          answer: 'lemon',
          hints: [`What does a good truck’s owner want, at least?`],
          worked: `**It’s a lemon.** If it were a good truck, its owner would want at least ${$k(Gs)}.`
        },
        {
          key: 'why-collapse', kind: 'explain', label: 'Why good trucks disappear',
          prompt: 'Every buyer values a good truck more than its owner does, yet good trucks don’t sell when only owners know quality. In a few sentences, explain why.',
          model: `Buyers can’t tell good trucks from lemons, so they won’t pay more than a truck’s average value (${$k(Eb)} for a random truck). The owners of good trucks know theirs are worth ${$k(Gs)} to them, more than buyers will pay, so they keep them. That leaves only lemons on the market, and buyers, anticipating this, pay at most a lemon’s value. This is adverse selection: hidden information keeps mutually beneficial trades of good trucks from happening.`,
          mustHave: ['says buyers cannot tell good trucks from lemons, so they pay at most an average (expected) value', 'says owners of good trucks want more than that and withdraw, so only lemons are offered (adverse selection)'],
          hints: ['What can buyers pay for a truck they can’t check? Who accepts that price, and who doesn’t?']
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 3, exercise 2: used trucks when buyers know more (problem 6)
// ======================================================================================
const reverse = {
  id: 'im-reverse-lemons',
  title: 'Used trucks: when buyers know more',
  summary: 'What an uninformed seller wants, and what a buyer’s offer gives away.',
  worksheet: { Gs: 12, Gb: 14, Bs: 6, Bb: 8, O1: 7, O2: 10 },
  generate(r) {
    for (;;) {
      const v = truckValues(r), Es = (v.Gs + v.Bs) / 2;
      const lo = Math.floor(Math.max(v.Bb, Es)) + 1;
      if (!(v.Bb < Es) || lo > v.Gs - 1) continue;
      return Object.assign(v, { O1: v.Bb - r.pick([1, 2]), O2: r.int(lo, v.Gs - 1) });
    }
  },
  build(v) {
    const { Gs, Gb, Bs, Bb, O1, O2 } = v, Es = (Gs + Bs) / 2, Eb = (Gb + Bb) / 2;
    check(Bb < Es && O1 < Bb && O2 > Math.max(Bb, Es) && O2 < Gs, 'reverse lemons');
    return {
      body: truckBody(v, 'sellers').concat([{ md: 'Now let’s turn the tables: the **buyer** has more information than the seller.' }]),
      steps: [
        {
          key: 'min', kind: 'number', label: 'Uninformed seller’s minimum',
          prompt: 'Suppose quality is known to buyers, but sellers can’t tell. How much will a seller want, at least, for her truck?',
          answer: kd(Es),
          mistakes: [...km(Gs, 'The seller doesn’t know her truck is good.'), ...km(Bs, 'The seller doesn’t know her truck is bad.'), ...km(Eb, 'That’s a buyer’s expected value. What’s the truck worth to the seller, on average?')],
          hints: ['A seller who doesn’t know her truck’s quality values it at its expected value to her.'],
          worked: `She wants at least her expected value: ½ × ${$k(Gs)} + ½ × ${$k(Bs)} = **${$k(Es)}**.`
        },
        {
          key: 'bad', kind: 'choice', label: 'Bad truck sells?',
          prompt: 'In light of your previous answer, will a bad truck sell? If so, in what range?',
          options: [
            { id: 'own', label: `Yes, for ${$k(Bs)} to ${$k(Bb)}`, msg: `The seller doesn’t know her truck is bad, so she still wants ${$k(Es)}.` },
            { id: 'no', label: `No: a bad truck is worth at most ${$k(Bb)} to a buyer, less than the ${$k(Es)} the seller wants` },
            { id: 'avg', label: `Yes, for ${$k(Es)} to ${$k(Eb)}`, msg: 'The buyer knows the truck is bad. How much is it worth to him?' }
          ],
          answer: 'no',
          hints: [`What’s a bad truck worth to a buyer who knows it’s bad?`],
          worked: `**No.** A buyer who knows the truck is bad pays at most ${$k(Bb)}, less than the ${$k(Es)} the seller wants.`
        },
        {
          key: 'good', kind: 'choice', label: 'Good truck sells?',
          prompt: 'Will a good truck sell? If so, in what range?',
          options: [
            { id: 'low', label: `Yes, for ${$k(Es)} to ${$k(Gb)}`, msg: `Think about what the seller learns when a buyer is willing to pay ${$k(Es)} or more.` },
            { id: 'yes', label: `Yes, for ${$k(Gs)} to ${$k(Gb)}` },
            { id: 'no', label: 'No', msg: `A good truck is worth ${$k(Gb)} to a buyer, more than the seller wants. What happens when a buyer makes an offer?` }
          ],
          answer: 'yes',
          hints: [`Only one kind of buyer would ever offer ${$k(Es)} or more. Which one, and what does that tell the seller?`],
          worked: `**Yes, for ${$k(Gs)} to ${$k(Gb)}.** A buyer who offers ${$k(Es)} or more (enough to tempt the uninformed seller) must know the truck is good: a bad one is worth at most ${$k(Bb)} to him. Understanding this, the seller now knows what she has and wants at least ${$k(Gs)}.`
        },
        {
          key: 'o1', kind: 'choice', label: `Offer of ${$k(O1)}`,
          prompt: `After much haggling, a buyer offers ${$k(O1)}. What does the seller learn?`,
          options: [
            { id: 'good', label: 'It’s a good truck.', msg: 'Would a buyer offer so little only for a good truck?' },
            { id: 'lemon', label: 'The truck is a lemon.', msg: `A lemon is worth ${$k(Bb)} to a buyer. But couldn’t a buyer of a good truck offer ${$k(O1)} too?` },
            { id: 'nothing', label: 'Nothing.' }
          ],
          answer: 'nothing',
          hints: ['Could a buyer of either kind of truck make this offer?'],
          worked: `**Nothing.** A low offer is something any buyer can make: he may be trying to convince the seller the truck is bad, but he might be bluffing.`
        },
        {
          key: 'o2', kind: 'choice', label: `Offer of ${$k(O2)}`,
          prompt: `Suppose instead that, after much haggling, the buyer offers ${$k(O2)}. What does the seller learn?`,
          options: [
            { id: 'good', label: 'It’s a good truck.' },
            { id: 'lemon', label: 'The truck is a lemon.', msg: `Would anyone offer ${$k(O2)} for a truck worth ${$k(Bb)} to him?` },
            { id: 'nothing', label: 'Nothing.', msg: `What’s the most a buyer would pay for a lemon?` }
          ],
          answer: 'good',
          hints: [`What’s the most a buyer would ever pay for a lemon?`],
          worked: `**It’s a good truck.** If it were bad, the buyer wouldn’t offer more than ${$k(Bb)}.`
        },
        {
          key: 'accept', kind: 'choice', label: 'Accept the offer?',
          prompt: `Will the seller accept that ${$k(O2)} offer?`,
          options: [
            { id: 'yes', label: `Yes: it’s more than the ${$k(Es)} she wanted`, msg: `She wanted ${$k(Es)} when she didn’t know what she had. What does she know now?` },
            { id: 'no', label: `No: the offer gave the game away. Now that she knows the truck is good, she wants at least ${$k(Gs)}` }
          ],
          answer: 'no',
          hints: ['What did the offer just tell her about her truck?'],
          worked: `**No.** The cat is out of the bag: she now knows the truck is good, so she wants at least ${$k(Gs)}.`
        }
      ]
    };
  }
};

// ======================================================================================
// Chapter 3, exercise 3: an incentive contract for a realtor (problem 7)
// ======================================================================================
const PAIRS = [[4, 20], [4, 10], [5, 20], [5, 15], [3, 15], [3, 12], [4, 16], [5, 10]]; // (Δp in tenths, effort cost in $k)
const realtor = {
  id: 'im-realtor',
  title: 'Paying a realtor: fee plus bonus',
  summary: 'Participation and incentive constraints, the optimal contract, and commissions.',
  worksheet: { H: 1000, L: 900, R: 30, e: 20, pl: 4, ph: 8, k: 4 },
  generate(r) {
    for (;;) {
      const [dp, e] = r.pick(PAIRS), pl = r.pick([2, 3, 4, 5]), ph = pl + dp;
      const R = r.pick([20, 25, 30, 40]), D = r.pick([50, 100, 150, 200]), H = 50 * r.int(10, 24), k = r.pick([3, 4, 5, 6]);
      const B = (e * 10) / dp, F = R + e - (ph * B) / 10;
      if (ph > 9 || !Number.isInteger(B) || F < 0 || H - D < 100) continue;
      if ((k / 100) * (dp / 10) * D >= e) continue;   // the commission falls short
      if (Math.abs((dp / 10) * D - e) < 1) continue;  // great effort clearly worth it or not
      return { H, L: H - D, R, e, pl, ph, k };
    }
  },
  build({ H, L, R, e, pl, ph, k }) {
    const p0 = pl / 10, p1 = ph / 10, dp = (ph - pl) / 10, D = H - L;
    const B = e / dp, F = R + e - p1 * B;
    const gross0 = p0 * H + (1 - p0) * L, gross1 = p1 * H + (1 - p1) * L;
    const NR0 = gross0 - R, NR1 = gross1 - F - p1 * B;
    const gain = (k / 100) * dp * D, need = (B / D) * 100;
    check(Math.abs(NR1 - NR0) > 0.5, 'contracts differ');
    const P = x => num(x);
    return {
      body: [
        { md: `You are hiring a realtor to sell your house. If she is successful, the house sells for ${$k(H)}; if not, for ${$k(L)}. Her reservation compensation (what she could earn elsewhere) is ${$k(R)}. With standard effort, her chance of success is ${pl * 10}%; with great effort, it rises to ${ph * 10}%, at a cost to her estimated at ${$k(e)}.` },
        { md: 'You pay the realtor a fee **F** to represent you, plus a bonus **B** if she is successful. **Work in thousands of dollars**: in the constraints below, 30 means $30,000.' }
      ],
      steps: [
        {
          key: 'pc0', kind: 'choice', label: 'Participation (standard)',
          prompt: 'What is the participation constraint for standard effort?',
          options: [
            { id: 'a', label: `F + ${P(p0)}B − ${e} ≥ ${R}`, msg: 'Standard effort costs her nothing extra.' },
            { id: 'b', label: `F + ${P(p0)}B ≥ ${R}` },
            { id: 'c', label: `F + B ≥ ${R}`, msg: `She only gets the bonus if she succeeds, which happens ${pl * 10}% of the time with standard effort.` },
            { id: 'd', label: `F ≥ ${R}`, msg: 'That’s enough, but it isn’t the constraint: her expected bonus counts too.' }
          ],
          answer: 'b',
          hints: ['She takes the job if her expected pay is at least what she could earn elsewhere.'],
          worked: `Her expected pay with standard effort, F + ${P(p0)}B, must be at least her reservation compensation: **F + ${P(p0)}B ≥ ${R}**.`
        },
        {
          key: 'pc1', kind: 'choice', label: 'Participation (great)',
          prompt: 'What is the participation constraint for great effort?',
          options: [
            { id: 'a', label: `F + ${P(p1)}B ≥ ${R}`, msg: `Great effort costs her ${$k(e)}.` },
            { id: 'b', label: `F + ${P(p1)}B − ${e} ≥ F + ${P(p0)}B`, msg: 'That compares great effort with standard effort: it’s the incentive-compatibility constraint.' },
            { id: 'c', label: `F + ${P(p1)}B − ${e} ≥ ${R}` },
            { id: 'd', label: `F + ${P(p1)}B + ${e} ≥ ${R}`, msg: 'The effort cost is a cost to her: subtract it.' }
          ],
          answer: 'c',
          hints: [`With great effort, she succeeds ${ph * 10}% of the time, and she bears the cost of her effort.`],
          worked: `Her expected pay with great effort, minus its cost: **F + ${P(p1)}B − ${e} ≥ ${R}**.`
        },
        {
          key: 'ic', kind: 'choice', label: 'Incentive compatibility',
          prompt: 'What is the incentive-compatibility constraint?',
          options: [
            { id: 'a', label: `F + ${P(p1)}B − ${e} ≥ F + ${P(p0)}B` },
            { id: 'b', label: `F + ${P(p1)}B − ${e} ≥ ${R}`, msg: 'That’s the participation constraint for great effort. Incentive compatibility compares her two effort choices.' },
            { id: 'c', label: `${P(p1)}B ≥ ${e}`, msg: 'That leaves out what she’d expect to earn with standard effort.' },
            { id: 'd', label: `F + ${P(p0)}B ≥ F + ${P(p1)}B − ${e}`, msg: 'That’s the condition for her to *prefer standard* effort.' }
          ],
          answer: 'a',
          hints: ['She must prefer great effort to standard effort.'],
          worked: `She must be at least as well off with great effort as with standard effort: **F + ${P(p1)}B − ${e} ≥ F + ${P(p0)}B**, i.e. ${P(dp)}B ≥ ${e}.`
        },
        {
          key: 'bmin', kind: 'number', label: 'Minimum bonus',
          prompt: 'What is the smallest bonus that satisfies the incentive-compatibility constraint?',
          answer: kd(B),
          mistakes: [...km(e / p1, `The fee appears on both sides and cancels, but so does part of the bonus: it’s the *extra* ${Math.round(dp * 100)}-point chance of success that pays for her effort.`), ...km(e, 'The bonus is paid only if she succeeds, and great effort raises that chance by only part of the way.')],
          hints: [`Simplify: the F’s cancel, leaving ${P(dp)}B ≥ ${e}.`],
          worked: `${P(dp)}B ≥ ${e}, so **B ≥ ${$k(B)}**.`
        },
        {
          key: 'f0', kind: 'number', label: 'Standard-effort contract',
          prompt: 'Find a simple contract that elicits standard effort: with no bonus (B = 0), what fee F do you pay?',
          answer: kd(R),
          mistakes: km(R + e, 'You don’t need to pay for great effort here.'),
          hints: ['With B = 0, the participation constraint for standard effort is F ≥ …'],
          worked: `With B = 0, the participation constraint is F ≥ ${R}. The cheapest such contract: **F = ${$k(R)}, B = 0**.`
        },
        {
          key: 'f1', kind: 'number', label: 'Great-effort fee',
          prompt: `Now the cheapest contract that elicits great effort. With the bonus at its minimum (${$k(B)}), what is the smallest fee F that still gets her to take the job?`,
          answer: kd(F),
          mistakes: [...km(R, 'Her expected bonus counts toward her pay, and her effort costs her something too.'), ...km(R + e, `Her expected bonus (${P(p1)} × ${num(B)}) counts toward her pay too.`)],
          hints: [`Plug B = ${num(B)} into the participation constraint for great effort.`],
          worked: `F + ${P(p1)} × ${num(B)} − ${e} ≥ ${R}, so F ≥ ${num(F)}: **F = ${$k(F)}**, with B = ${$k(B)}.`
        },
        {
          key: 'nr0', kind: 'number', label: 'Net revenue (standard)',
          prompt: 'What is your expected net revenue (the expected sale price minus what you pay the realtor) with the standard-effort contract?',
          answer: kd(NR0),
          mistakes: km(gross0, 'That’s the expected sale price. Subtract what you pay the realtor.'),
          hints: [`Expected sale price: ${P(p0)} × ${num(H)} + ${P(1 - p0)} × ${num(L)}.`],
          worked: `${P(p0)} × ${num(H)} + ${P(1 - p0)} × ${num(L)} − ${R} = **${$k(NR0)}**.`
        },
        {
          key: 'nr1', kind: 'number', label: 'Net revenue (great)',
          prompt: 'And with the great-effort contract?',
          answer: kd(NR1),
          mistakes: [...km(gross1 - F, `Don’t forget the bonus: you pay it ${ph * 10}% of the time.`), ...km(gross1 - F - B, `You pay the bonus only when she succeeds (${ph * 10}% of the time).`)],
          hints: [`Expected sale price: ${P(p1)} × ${num(H)} + ${P(1 - p1)} × ${num(L)}. Subtract the fee and the expected bonus.`],
          worked: `${P(p1)} × ${num(H)} + ${P(1 - p1)} × ${num(L)} − ${num(F)} − ${P(p1)} × ${num(B)} = **${$k(NR1)}**.`
        },
        {
          key: 'worth', kind: 'choice', label: 'Encourage great effort?',
          prompt: 'Does it make sense to encourage great effort?',
          options: [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
          answer: NR1 > NR0 ? 'yes' : 'no',
          hints: ['Compare your two expected net revenues.'],
          worked: NR1 > NR0
            ? `**Yes:** ${$k(NR1)} > ${$k(NR0)}. Great effort raises the expected sale price by ${P(dp)} × ${num(D)} = ${num(dp * D)}, more than the ${num(e)} it costs to compensate her for it.`
            : `**No:** ${$k(NR1)} < ${$k(NR0)}. Great effort raises the expected sale price by only ${P(dp)} × ${num(D)} = ${num(dp * D)}, less than the ${num(e)} it costs to compensate her for it.`
        },
        {
          key: 'commission', kind: 'number', label: 'Gain from effort, commission',
          prompt: `Suppose fee-plus-bonus contracts are illegal, and realtors can only be paid a percentage of the sale price. With a ${k}% commission, how much more does the realtor **expect** to earn by putting in great effort?`,
          answer: kd(gain),
          mistakes: km((k / 100) * D, `That’s what she gains *if* the sale succeeds. Great effort raises the chance of success by only ${Math.round(dp * 100)} points.`),
          hints: [`If the sale succeeds, her commission is ${k}% × ${num(H)}; if not, ${k}% × ${num(L)}. Great effort raises the chance of success from ${pl * 10}% to ${ph * 10}%.`],
          worked: `Great effort raises her chance of earning the higher commission by ${Math.round(dp * 100)} points, and the higher commission is ${k}% × ${num(D)} = ${num((k / 100) * D)} more. So she expects ${P(dp)} × ${num((k / 100) * D)} = **${$k(gain)}** more, far less than the ${$k(e)} that great effort costs her. A ${k}% commission won’t get great effort.`
        },
        {
          key: 'need', kind: 'number', label: 'Commission needed',
          prompt: 'How high would the commission have to be to get great effort? (In percent.)',
          answer: { value: round1(need), unit: '%', tol: 0.051, display: pct(round1(need)) },
          mistakes: [
            { value: round1((e / D) * 100), msg: `That would be enough if great effort guaranteed success. It only raises the chance by ${Math.round(dp * 100)} points.` },
            { value: round1(need) / 100, msg: 'Right idea! Now write it as a percentage.' }
          ],
          hints: [`A commission of c pays her c × ${num(D)} more when the sale succeeds: it works like a bonus. How big does that bonus need to be?`],
          worked: `A commission c pays her c × ${num(D)} more when the sale succeeds, so it acts like a bonus of c × ${num(D)}. Incentive compatibility needs a bonus of at least ${num(B)}, so c × ${num(D)} ≥ ${num(B)}: c ≥ **${pct(round1(need))}**. (This simple model leaves out things like building a reputation for great service.)`
        },
        {
          key: 'why-bonus', kind: 'explain', label: 'Why a bonus',
          prompt: 'In a few sentences, explain why the great-effort contract needs a bonus, rather than just a higher fee.',
          model: 'You can’t observe the realtor’s effort, only whether the house sells for the higher price. A fee is paid whatever happens, so raising it doesn’t change what she gains from extra effort: she would take the higher fee and still put in standard effort, which costs her less. Only pay that depends on the outcome rewards effort: the bonus must be big enough that the extra chance of success it brings, times the bonus, covers her cost of great effort.',
          mustHave: ['says effort cannot be observed (only the outcome can), so pay must depend on the outcome', 'says a fee is paid whatever happens, so it does not reward effort: she would take it and put in standard effort'],
          hints: ['What can you actually observe: her effort, or the sale price? What does a fee pay for?']
        }
      ]
    };
  }
};

// ======================================================================================

module.exports = {
  id: 'econ3240',
  title: 'Intermediate Microeconomics (ECON 3240)',
  chapters: [
    {
      id: 'im1', number: 1,
      title: 'Competitive markets and price controls',
      subtitle: 'Equilibrium, price ceilings, and shortages',
      vocab: `- In a competitive market, the equilibrium price sets quantity supplied equal to quantity demanded.
- A price ceiling is a legal maximum price. It binds only if it is below the equilibrium price; then the quantity traded is the quantity supplied (the short side of the market), and the shortage is quantity demanded − quantity supplied.
- A price floor is a legal minimum price; it binds only if it is above the equilibrium price, creating a surplus.
- A binding price control reduces the quantity traded and causes a deadweight loss; some buyers gain (those who still buy at the lower price) while others lose.`,
      exercises: [housing]
    },
    {
      id: 'im2', number: 2,
      title: 'Market power',
      subtitle: 'Monopoly, natural monopoly regulation, and price discrimination',
      vocab: `- A monopolist maximizes profit where MR = MC and reads the price off the demand curve. With linear inverse demand P = a − bQ, MR = a − 2bQ.
- Under perfect competition, P = MC. The deadweight loss of monopoly is the triangle between demand and MC from the monopoly quantity to the competitive quantity. Monopoly profit is a transfer from consumers, not a loss to society.
- A natural monopoly has large fixed costs and low marginal cost. Pricing at MC maximizes total surplus but leaves the firm with a loss equal to its fixed cost; average-cost (break-even) pricing keeps it in business.
- Third-degree price discrimination: charge each separate market the price that maximizes profit there, P = (a + bc)/2b for demand Q = a − bP. Arbitrage (resale between markets) limits the price gap to the cost of moving the good between markets.`,
      exercises: [monopoly, gas, iphone]
    },
    {
      id: 'im3', number: 3,
      title: 'Asymmetric information',
      subtitle: 'Lemons, adverse selection, and incentive contracts',
      vocab: `- When a party doesn't know quality, a risk-neutral party values a good at its expected value.
- Adverse selection (lemons): if only sellers know quality, buyers pay at most the average value; owners of good items may withdraw, leaving only lemons, so the market for good items can collapse.
- When buyers know more, an offer can reveal information: an offer only a buyer of a good item would make tells the seller the item is good.
- Principal–agent (moral hazard): effort is unobservable, so pay must depend on outcomes. Participation constraint: expected pay − effort cost ≥ reservation pay. Incentive-compatibility constraint: expected pay with high effort − its cost ≥ expected pay with low effort. With a fee F and bonus B, IC reduces to (Δ probability) × B ≥ extra effort cost.
- A sales commission works like a bonus of commission × (price difference between success and failure).`,
      exercises: [lemons, reverse, realtor]
    }
  ]
};
