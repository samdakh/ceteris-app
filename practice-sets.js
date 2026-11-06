/* Ceteris problem sets: the content the problem-set coach walks students through.

   Each set has problems; each problem has a statement (markdown and given tables) and
   steps the student answers in order. Step kinds:
     number   answer { value, tol, unit }       a single number ($ unit shows a $ prefix)
     choice   options [{ id, label, msg }]      answer: an id, or a list of ids (select all that apply)
                                                msg: feedback when that option is picked wrongly;
                                                missMsg: when a correct option is left out
     table    columns, rows                     cells to fill; rows[].answers holds the key
     explain  key, mustHave                     a sentence or two, reviewed by Claude against the key
   Every step can have:
     hints    a ladder of nudges, shown one at a time; after the last one, "Show the solution"
     mistakes [{ value, msg }]                  number steps: feedback for a known wrong answer
     worked   the explanation shown once the step is solved or the solution is shown
     label    a short name for the instructor's progress grid

   Answers, hints, mistakes and worked solutions never leave the server until the student
   has earned them (see practice.js). */

const $ = v => ({ value: v, unit: '$' });

const CH15 = {
  id: 'ch15-competitive-firms',
  title: 'Firms in competitive markets',
  subtitle: 'Chapter 15 · shut down, exit, and long-run equilibrium',
  intro: 'Work through each problem one step at a time. Check each answer as you go; if you’re stuck, ask for a hint. After every step you’ll see why the answer works.',
  problems: [
    // ---------------------------------------------------------------------------
    {
      key: 'bob',
      title: 'Bob’s lawn-mowing service',
      body: [
        { md: 'Bob’s lawn-mowing service is a profit-maximizing, competitive firm. Bob mows lawns for $40 each. His variable cost each day is $350, and his fixed cost is $100. He mows 10 lawns a day.' }
      ],
      steps: [
        {
          key: 'read', kind: 'number', label: 'MC from wording',
          prompt: '**Read the problem first.** Bob is a competitive, profit-maximizing firm, and he mows 10 lawns a day. What is his marginal cost at that quantity?',
          answer: $(40),
          mistakes: [
            { value: 35, msg: 'That’s his average variable cost ($350 ÷ 10). The question asks about *marginal* cost: what does “profit-maximizing” tell you?' },
            { value: 45, msg: 'That’s his average total cost. Think about what “profit-maximizing” implies for a firm that takes the price as given.' }
          ],
          hints: [
            'What does “competitive” tell you about the $40 price? Can Bob set it himself?',
            'A profit-maximizing competitive firm produces where one equation holds. Which one?'
          ],
          worked: 'Since Bob’s firm is in a competitive market, he must be a price taker, so the $40 price is the market price. He is also profit-maximizing, so 10 lawns a day is where P = MC. His marginal cost is therefore **$40**.\n\nThis isn’t crucial for this particular problem, but you should always know how to translate the wording of a problem into equations like this.'
        },
        {
          key: 'avc', kind: 'number', label: 'AVC',
          prompt: 'What is Bob’s average variable cost?',
          answer: $(35),
          mistakes: [
            { value: 45, msg: 'That’s average *total* cost: it includes the $100 fixed cost. AVC uses variable cost only.' },
            { value: 10, msg: 'That’s average fixed cost ($100 ÷ 10).' },
            { value: 350, msg: 'That’s total variable cost. Divide by the number of lawns.' }
          ],
          hints: ['Average variable cost is variable cost per lawn.', 'AVC = VC ÷ q.'],
          worked: 'AVC = VC/q = 350/10 = **$35**.'
        },
        {
          key: 'shutdown', kind: 'choice', label: 'Shut down?',
          prompt: 'In the short run, should Bob shut down?',
          options: [
            { id: 'run', label: 'Keep operating' },
            { id: 'shut', label: 'Shut down', msg: 'Compare the price with AVC. In the short run, Bob owes his $100 fixed cost whether he mows or not.' }
          ],
          answer: 'run',
          hints: ['“Shut down” is a short-run decision. Which of Bob’s costs can he avoid by not mowing?', 'A firm shuts down only if P < AVC.'],
          worked: 'AVC = $35 and P = $40. P > AVC, so, for now, Bob should **keep operating**.'
        },
        {
          key: 'shutdown-why', kind: 'explain', label: 'Why not shut down',
          prompt: 'Explain your answer in a sentence or two.',
          model: 'Bob should keep operating because P = $40 exceeds AVC = $35 (revenue of $400 covers variable cost of $350). The extra $50 goes toward the $100 fixed cost, which he would owe even if he shut down.',
          mustHave: ['compares the price ($40) with average variable cost ($35), or revenue ($400) with variable cost ($350)', 'concludes that because P > AVC, Bob should keep operating in the short run'],
          hints: ['Name the two numbers you compared, and say which one is bigger.'],
          worked: 'P = $40 > AVC = $35: each lawn brings in more than its variable cost, and the difference helps pay the $100 fixed cost, which Bob owes even if he shuts down. So, for now, he keeps operating.'
        },
        {
          key: 'atc', kind: 'number', label: 'ATC',
          prompt: 'What is Bob’s average total cost?',
          answer: $(45),
          mistakes: [
            { value: 35, msg: 'That’s AVC. Average *total* cost includes the fixed cost too.' },
            { value: 10, msg: 'That’s average fixed cost only.' },
            { value: 450, msg: 'That’s total cost. Divide by the number of lawns.' }
          ],
          hints: ['Total cost = fixed cost + variable cost.', 'ATC = TC ÷ q = (VC + FC) ÷ q.'],
          worked: 'ATC = TC/q = (VC + FC)/q = 450/10 = **$45**.'
        },
        {
          key: 'exit', kind: 'choice', label: 'Exit?',
          prompt: 'In the long run, should Bob exit the business?',
          options: [
            { id: 'exit', label: 'Exit' },
            { id: 'stay', label: 'Stay in business', msg: 'In the long run, Bob can get out of his fixed cost too. Compare the price with ATC.' }
          ],
          answer: 'exit',
          hints: ['“Exit” is a long-run decision: in the long run, every cost can be avoided.', 'A firm exits if P < ATC.'],
          worked: 'ATC = $45 and P = $40. P < ATC, so Bob should eventually **exit** the business.'
        },
        {
          key: 'exit-why', kind: 'explain', label: 'Why exit',
          prompt: 'Explain your answer in a sentence or two.',
          model: 'P = $40 is below ATC = $45, so Bob loses $5 a lawn ($50 a day: revenue $400, total cost $450). In the long run he can avoid all of his costs, fixed cost included, by leaving, so he should exit if the price stays at $40.',
          mustHave: ['compares the price ($40) with average total cost ($45), or revenue ($400) with total cost ($450)', 'concludes that because P < ATC (a loss), Bob should exit in the long run'],
          hints: ['Which cost matters in the long run, and how does it compare with the price?'],
          worked: 'P = $40 < ATC = $45, so Bob loses money even after covering his variable cost. In the long run all costs are avoidable, so if the price stays at $40, he should exit.'
        }
      ]
    },
    // ---------------------------------------------------------------------------
    {
      key: 'lr-firm',
      title: 'A firm in long-run equilibrium',
      body: [
        { md: 'A profit-maximizing firm operates in a competitive market that is in long-run equilibrium. The firm is currently producing 100 units of output. It has average revenue of $10, average variable cost of $8, and fixed cost of $200.' }
      ],
      steps: [
        {
          key: 'read', kind: 'choice', label: 'Reading the wording',
          prompt: '**Read the problem first.** Which of these must be true for this firm? Select all that apply.',
          options: [
            { id: 'pmc', label: 'P = MC', missMsg: '“Profit-maximizing” is a clue too.' },
            { id: 'patc', label: 'P = ATC', missMsg: 'What does free entry and exit do to the price in the long run?' },
            { id: 'zero', label: 'Profit is zero', missMsg: 'If P = ATC, what is profit?' },
            { id: 'pavc', label: 'P = AVC', msg: 'Nothing in the problem pins P to AVC. Here P = $10 while AVC = $8.' },
            { id: 'pos', label: 'Profit is positive', msg: 'In long-run equilibrium, any profit would attract new firms until it was gone.' }
          ],
          answer: ['pmc', 'patc', 'zero'],
          hints: ['Translate each phrase in turn: “profit-maximizing,” “competitive market,” and “long-run equilibrium.”', 'Profit-maximizing: P = MC. Long-run equilibrium with entry and exit: P = ATC.'],
          worked: '- **“Profit-maximizing”** means P = MC (more generally MR = MC, but we’ll cross that bridge in the next chapter, on monopolies).\n- **“Competitive market”** means the firm is a price taker, and P is a given constant: it isn’t affected by this firm’s operations.\n- **“Long-run equilibrium”** usually (when all firms are identical) means that, thanks to entry and exit, P = ATC. And since P = MC, it follows that MC = ATC, which only holds at the minimum of ATC. This means profit should be zero.'
        },
        {
          key: 'rev', kind: 'number', label: 'Revenue',
          prompt: 'What is the firm’s total revenue?',
          answer: $(1000),
          mistakes: [{ value: 10, msg: 'That’s revenue per unit. Multiply by the quantity.' }],
          hints: ['For a competitive firm, average revenue is the price.', 'Revenue = P × q.'],
          worked: 'Rev = P q = $10 × 100 = **$1,000**.'
        },
        {
          key: 'tc', kind: 'number', label: 'TC',
          prompt: 'What is its total cost?',
          answer: $(1000),
          mistakes: [
            { value: 800, msg: 'That’s variable cost only. Add the $200 fixed cost.' },
            { value: 200, msg: 'That’s fixed cost only. Add variable cost (AVC × q).' }
          ],
          hints: ['TC = FC + VC.', 'VC = AVC × q.'],
          worked: 'TC = FC + VC = FC + AVC × q = 200 + 8 × 100 = **$1,000**.'
        },
        {
          key: 'profit', kind: 'number', label: 'Profit',
          prompt: 'What is its profit?',
          answer: $(0),
          mistakes: [{ value: 200, msg: 'That would be right if $8 were average *total* cost. Here $8 is average *variable* cost: use the total cost you just found.' }],
          hints: ['Profit = revenue − total cost.'],
          worked: 'Profit = Rev − TC = $1,000 − $1,000 = **$0**. Being at the long-run equilibrium, we should indeed expect profit = 0.'
        },
        {
          key: 'mc', kind: 'number', label: 'MC',
          prompt: 'Can we figure out its marginal cost? If so, what is it?',
          answer: $(10),
          mistakes: [{ value: 8, msg: 'That’s AVC. What does “profit-maximizing” tell you about MC?' }],
          hints: ['You don’t need a cost schedule. Look at the word “profit-maximizing.”', 'A profit-maximizing competitive firm produces where P = MC.'],
          worked: 'Yes: we’re told the firm is profit-maximizing, so P = MC. Therefore **MC = $10**.'
        },
        {
          key: 'atc', kind: 'number', label: 'ATC',
          prompt: 'What is its average total cost?',
          answer: $(10),
          mistakes: [
            { value: 8, msg: 'That’s AVC. ATC also includes fixed cost per unit.' },
            { value: 2, msg: 'That’s average fixed cost ($200 ÷ 100) only.' }
          ],
          hints: ['ATC = TC ÷ q.', 'Or: ATC = AVC + AFC.'],
          worked: 'ATC = TC/q = $1,000/100 = **$10** (or AVC + AFC = $8 + $2). ATC = P, as it must be in long-run equilibrium.'
        },
        {
          key: 'scale', kind: 'choice', label: 'Efficient scale',
          prompt: 'Is the efficient scale of the firm more than, less than, or exactly 100 units?',
          options: [
            { id: 'more', label: 'More than 100', msg: 'That would be true if MC were below ATC at 100 units. Compare MC and ATC from your last two answers.' },
            { id: 'less', label: 'Less than 100', msg: 'That would be true if MC were above ATC at 100 units. Compare MC and ATC from your last two answers.' },
            { id: 'exact', label: 'Exactly 100' }
          ],
          answer: 'exact',
          hints: ['The efficient scale is the quantity that minimizes ATC.', 'MC crosses ATC at the minimum of ATC. At 100 units, how do MC and ATC compare?'],
          worked: 'At q = 100, MC = $10 and ATC = $10. Draw the diagram that looks like the Greek letter psi: MC crosses ATC at the minimum of ATC, which is the efficient scale. So the firm produces **exactly** at its efficient scale, as every firm does in long-run equilibrium (P = MC = min ATC).'
        }
      ]
    },
    // ---------------------------------------------------------------------------
    {
      key: 'bearings',
      title: 'Ball Bearings, Inc.',
      body: [{ md: 'Ball Bearings, Inc., faces costs of production as follows:' }],
      steps: [
        {
          key: 'table', kind: 'table', label: 'Cost table',
          prompt: 'Fill out the table.',
          columns: [
            { key: 'Q', label: 'Quantity', given: true },
            { key: 'FC', label: 'FC', given: true, unit: '$' },
            { key: 'VC', label: 'VC', given: true, unit: '$' },
            { key: 'AFC', label: 'AFC', unit: '$' },
            { key: 'AVC', label: 'AVC', unit: '$' },
            { key: 'ATC', label: 'ATC', unit: '$' },
            { key: 'MC', label: 'MC', unit: '$' }
          ],
          rows: [
            { values: { Q: 0, FC: 120, VC: 0 }, answers: {} },
            { values: { Q: 1, FC: 120, VC: 20 }, answers: { AFC: 120, AVC: 20, ATC: 140, MC: 20 } },
            { values: { Q: 2, FC: 120, VC: 50 }, answers: { AFC: 60, AVC: 25, ATC: 85, MC: 30 } },
            { values: { Q: 3, FC: 120, VC: 90 }, answers: { AFC: 40, AVC: 30, ATC: 70, MC: 40 } },
            { values: { Q: 4, FC: 120, VC: 140 }, answers: { AFC: 30, AVC: 35, ATC: 65, MC: 50 } },
            { values: { Q: 5, FC: 120, VC: 200 }, answers: { AFC: 24, AVC: 40, ATC: 64, MC: 60 } },
            { values: { Q: 6, FC: 120, VC: 270 }, answers: { AFC: 20, AVC: 45, ATC: 65, MC: 70 } }
          ],
          tol: 0.01,
          wrongPatterns: [
            { col: 'AFC', values: [120, 120, 120, 120, 120, 120], msg: 'AFC is fixed cost *per unit*: divide FC by the quantity.' },
            { col: 'AVC', values: [20, 50, 90, 140, 200, 270], msg: 'AVC is variable cost *per unit*: divide VC by the quantity.' },
            { col: 'ATC', values: [20, 25, 30, 35, 40, 45], msg: 'Your ATC column matches AVC. ATC also includes fixed cost: ATC = AFC + AVC.' },
            { col: 'ATC', values: [140, 170, 210, 260, 320, 390], msg: 'Your ATC column is total cost. Divide by the quantity.' },
            { col: 'MC', values: [20, 25, 30, 35, 40, 45], msg: 'Your MC column matches AVC. MC is the *change* in cost from one more unit: VC in this row minus VC in the row above.' },
            { col: 'MC', values: [20, 50, 90, 140, 200, 270], msg: 'Your MC column is VC itself. MC is the *change* in VC from the row above.' }
          ],
          hints: ['AFC = FC ÷ Q, AVC = VC ÷ Q, and ATC = AFC + AVC.', 'MC is the extra cost of one more case: VC in this row minus VC in the row above.'],
          worked: 'AFC = FC/Q, AVC = VC/Q, ATC = AFC + AVC (or TC/Q), and MC = the change in VC from the row above.'
        },
        {
          key: 'q', kind: 'number', label: 'Output at $60',
          prompt: 'The price of a case of ball bearings is $60. How many cases should the firm produce?',
          answer: { value: 5, unit: 'cases' },
          mistakes: [
            { value: 4, msg: 'Close. The 5th case adds $60 to revenue and $60 to cost, so profit is the same at 4 or 5. The rule we use is P = MC: in which row does that hold?' },
            { value: 6, msg: 'At 6 cases, MC = $70 is above the $60 price: the 6th case costs more than it brings in.' }
          ],
          hints: ['A profit-maximizing competitive firm produces where P = MC.', 'Find $60 in your MC column.'],
          worked: 'P = MC = $60 in the row where **q = 5**.'
        },
        {
          key: 'profit', kind: 'number', label: 'Profit',
          prompt: 'What is the firm’s profit? (Enter a loss as a negative number.)',
          answer: $(-20),
          mistakes: [
            { value: 20, msg: 'Check the sign: total cost is higher than revenue, so this is a loss. Enter it as a negative number, like -20.' },
            { value: -4, msg: 'That’s the margin on each case. How many cases does the firm sell?' },
            { value: 100, msg: 'That’s revenue minus *variable* cost. Profit subtracts total cost.' }
          ],
          hints: ['Profit = (P − ATC) × q.', 'At q = 5, ATC = $64.'],
          worked: 'At q = 5, ATC = $64, so the per-unit margin is P − ATC = $60 − $64 = −$4. For all five units, this means a loss of **$20**.\n\nIf you prefer, you can also proceed as follows: Revenue = P q = $60 × 5 = $300. TC = ATC q = $64 × 5 = $320. Profit = Rev − TC = $300 − $320 = −$20.'
        },
        {
          key: 'shutdown', kind: 'choice', label: 'Shut down?',
          prompt: 'Should the firm shut down (suspend operations)?',
          options: [
            { id: 'run', label: 'Keep operating' },
            { id: 'shut', label: 'Shut down', msg: 'Shutting down wouldn’t save the $120 fixed cost. Compare revenue with variable cost.' }
          ],
          answer: 'run',
          hints: ['“Shut down” refers to the short run, when the fixed cost must be paid anyway.', 'Compare revenue (P × q) with variable cost, or P with AVC.'],
          worked: 'In the short run (which is what “shut down” refers to), the firm should **keep operating**. This is because its revenue ($300) exceeds its variable cost (VC = $200).'
        },
        {
          key: 'shutdown-why', kind: 'explain', label: 'Why not shut down',
          prompt: 'Explain your answer in a sentence or two.',
          model: 'Revenue of $300 exceeds variable cost of $200 (P = $60 > AVC = $40), so operating covers variable cost and pays $100 toward the $120 fixed cost. Shutting down would mean losing the whole $120 instead of $20.',
          mustHave: ['compares revenue ($300) with variable cost ($200), or the price ($60) with AVC ($40)', 'concludes that the firm should keep operating in the short run'],
          hints: ['What would the firm lose if it shut down? What does it lose by operating?'],
          worked: 'Revenue ($300) exceeds variable cost ($200), so operating covers all variable costs and pays $100 toward the $120 fixed cost. The loss is $20 if it operates, but $120 if it shuts down.'
        },
        {
          key: 'exit', kind: 'choice', label: 'Exit?',
          prompt: 'Should the firm exit (close permanently)?',
          options: [
            { id: 'exit', label: 'Exit, if the price is expected to stay at $60' },
            { id: 'stay', label: 'Stay in the market', msg: 'In the long run, the fixed cost can be avoided too. Compare revenue with total cost.' }
          ],
          answer: 'exit',
          hints: ['“Exit” refers to the long run, when every cost can be avoided.', 'Compare revenue with total cost, or P with ATC.'],
          worked: 'In the long run (which is what “exit” refers to), if the price is expected to remain low, the firm may not want to renew any lease contracts or replace failing or worn-out machines, and should therefore **exit** the market. This is because its revenue ($300) does not cover its total cost (TC = $320).'
        },
        {
          key: 'exit-why', kind: 'explain', label: 'Why exit',
          prompt: 'Explain your answer in a sentence or two.',
          model: 'Revenue ($300) does not cover total cost ($320): P = $60 < ATC = $64. In the long run the firm can avoid all its costs (for instance by not renewing leases or replacing worn-out machines), so it should exit if the price is expected to stay this low.',
          mustHave: ['compares revenue ($300) with total cost ($320), or the price ($60) with ATC ($64)', 'concludes that the firm should exit in the long run if the price stays low'],
          hints: ['In the long run, which costs count? Do they get covered?'],
          worked: 'Revenue ($300) does not cover total cost ($320), i.e. P < ATC. In the long run every cost is avoidable, so if the price stays at $60, the firm should leave.'
        }
      ]
    },
    // ---------------------------------------------------------------------------
    {
      key: 'haircuts',
      title: 'Haircuts in Chattanooga',
      body: [
        { md: 'The market for haircuts in Chattanooga is competitive and has the following daily demand schedule:' },
        { table: { columns: ['Price ($)', 'Quantity'], rows: [[40, 1200], [50, 1100], [60, 1000], [70, 900], [80, 800], [90, 700], [100, 600], [110, 500], [120, 400], [130, 300], [140, 200], [150, 100], [160, 0]].map(([p, q]) => [p, q.toLocaleString('en-US')]), transpose: true } },
        { md: 'The price of a haircut is currently $50. Each salon has fixed costs of $100 and the following marginal cost:' }
      ],
      steps: [
        {
          key: 'table', kind: 'table', label: 'Cost table',
          prompt: 'Complete the table. Round ATC to the nearest dollar.',
          columns: [
            { key: 'Q', label: 'Quantity', given: true },
            { key: 'MC', label: 'MC', given: true, unit: '$' },
            { key: 'VC', label: 'VC', unit: '$' },
            { key: 'TC', label: 'TC', unit: '$' },
            { key: 'ATC', label: 'ATC', unit: '$' }
          ],
          rows: [
            { values: { Q: 1, MC: 30 }, answers: { VC: 30, TC: 130, ATC: 130 } },
            { values: { Q: 2, MC: 40 }, answers: { VC: 70, TC: 170, ATC: 85 } },
            { values: { Q: 3, MC: 50 }, answers: { VC: 120, TC: 220, ATC: 73.33 } },
            { values: { Q: 4, MC: 60 }, answers: { VC: 180, TC: 280, ATC: 70 } },
            { values: { Q: 5, MC: 70 }, answers: { VC: 250, TC: 350, ATC: 70 } },
            { values: { Q: 6, MC: 80 }, answers: { VC: 330, TC: 430, ATC: 71.67 } }
          ],
          tol: 0.01,
          colTol: { ATC: 0.5 },
          show: { ATC: [130, 85, 73, 70, 70, 72] },
          wrongPatterns: [
            { col: 'VC', values: [30, 40, 50, 60, 70, 80], msg: 'Your VC column repeats MC. VC adds up the marginal cost of every haircut so far: for example, VC at 3 haircuts = $30 + $40 + $50.' },
            { col: 'TC', values: [30, 70, 120, 180, 250, 330], msg: 'Your TC column matches VC. Add the $100 fixed cost.' },
            { col: 'ATC', values: [30, 35, 40, 45, 50, 55], msg: 'Your ATC column is AVC. ATC divides *total* cost by the quantity.' }
          ],
          hints: ['VC is the running total of MC: VC at q = VC at (q − 1) + MC of the q-th haircut.', 'TC = VC + FC, and ATC = TC ÷ Q.'],
          worked: 'VC adds up the marginal costs (VC at 3 = 30 + 40 + 50 = $120), TC = VC + $100, and ATC = TC/Q.'
        },
        {
          key: 'Q', kind: 'number', label: 'Market Q at $50',
          prompt: 'How many haircuts will be performed each day in Chattanooga?',
          answer: { value: 1100, unit: 'haircuts' },
          hints: ['Read the demand schedule at the current price.'],
          worked: 'At P = $50, the demand schedule gives **1,100** haircuts a day.'
        },
        {
          key: 'q', kind: 'number', label: 'Haircuts per salon',
          prompt: 'How many haircuts will each salon do?',
          answer: { value: 3, unit: 'haircuts' },
          mistakes: [
            { value: 4, msg: 'At 4 haircuts, MC = $60 is above the $50 price: the 4th haircut costs more than it brings in.' },
            { value: 2, msg: 'At 2 haircuts, the next haircut costs only $50 and sells for $50. Where does P = MC?' }
          ],
          hints: ['Each salon is a price taker: it produces where P = MC.', 'Find $50 in the MC column.'],
          worked: 'P = MC = $50 at **q = 3**.'
        },
        {
          key: 'n', kind: 'number', label: 'Number of salons',
          prompt: 'How many salons are there? Round to the nearest whole salon.',
          answer: { value: 366.67, tol: 0.4, unit: 'salons', display: 'about 367 salons (1,100 ÷ 3 ≈ 366.7)' },
          mistakes: [{ value: 275, msg: 'That assumes 4 haircuts per salon. How many does each salon do at $50?' }],
          hints: ['Market quantity = number of salons × haircuts per salon.', 'Divide 1,100 by the number of haircuts each salon does.'],
          worked: 'Number of salons = 1,100 ÷ 3 ≈ 366.7, so about **367** salons.'
        },
        {
          key: 'profit', kind: 'number', label: 'Profit per salon',
          prompt: 'How much profit or loss does each salon make? (Enter a loss as a negative number.)',
          answer: $(-70),
          mistakes: [
            { value: 70, msg: 'Check the sign: total cost is higher than revenue, so this is a loss. Enter it as a negative number.' },
            { value: 30, msg: 'That’s revenue minus *variable* cost ($150 − $120). Profit subtracts total cost.' }
          ],
          hints: ['Revenue = $50 × 3.', 'Profit = revenue − TC, with TC from your table at q = 3.'],
          worked: 'Revenue = $50 × 3 = $150 and TC = $220, so profit = **−$70**, a loss of $70 a day. (In the short run the salons keep operating, since revenue covers VC = $120.)'
        },
        {
          key: 'lr', kind: 'choice', label: 'Long-run eq.?',
          prompt: 'Is the situation described above a long-run equilibrium?',
          options: [
            { id: 'yes', label: 'Yes', msg: 'With free entry and exit, profit is zero in the long run. What profit did you just find?' },
            { id: 'no', label: 'No' }
          ],
          answer: 'no',
          hints: ['What is each salon’s profit? What would salon owners do about it in the long run?'],
          worked: '**No.** Each salon loses $70 a day, so in the long run some salons will close. Market supply shifts left and the price rises until profit is zero.'
        },
        {
          key: 'lr-why', kind: 'explain', label: 'Why not long run',
          prompt: 'Explain your answer in a sentence or two.',
          model: 'No. At $50 the salons lose money (P is below ATC: a $70 loss a day), so with free exit some salons close. Market supply decreases and the price rises until the remaining salons break even, at P = min ATC.',
          mustHave: ['points to the losses (negative profit, or P below ATC)', 'says that salons will exit, so the market (price, number of salons) will change'],
          hints: ['What do owners of money-losing salons do in the long run?'],
          worked: 'Salons lose $70 a day at $50, so in the long run some exit. As supply falls, the price rises until the remaining salons break even. A situation in which firms want to leave can’t be a long-run equilibrium.'
        },
        {
          key: 'lr-p', kind: 'number', label: 'LR price',
          prompt: 'Suppose that in the long run there is free entry and exit. What is the market price in the long run?',
          answer: $(70),
          mistakes: [{ value: 50, msg: 'That’s today’s price, at which salons lose money. Where does entry and exit push the price?' }],
          hints: ['In long-run equilibrium, P = min ATC.', 'Find the lowest value in your ATC column.'],
          worked: 'Free entry and exit push the price to the minimum of ATC: **P = $70**.'
        },
        {
          key: 'lr-profit', kind: 'number', label: 'LR profit',
          prompt: 'How much profit does each salon make in the long-run equilibrium?',
          answer: $(0),
          hints: ['In long-run equilibrium, P = ATC.'],
          worked: 'P = ATC, so profit is **$0** (revenue $350, TC $350).'
        },
        {
          key: 'lr-q', kind: 'number', label: 'LR haircuts per salon',
          prompt: 'How many haircuts does each salon do each day?',
          answer: { value: 5, unit: 'haircuts' },
          mistakes: [{ value: 4, msg: 'ATC is $70 at both 4 and 5 haircuts, so profit is zero either way. A profit-maximizing salon produces where P = MC: in which row does that hold?' }],
          hints: ['Use P = MC at the new price.'],
          worked: 'P = MC = $70 at **q = 5**. ATC is also $70 there, so each salon breaks even.'
        },
        {
          key: 'lr-Q', kind: 'number', label: 'LR market Q',
          prompt: 'How many haircuts are done in Chattanooga each day?',
          answer: { value: 900, unit: 'haircuts' },
          mistakes: [{ value: 1100, msg: 'That’s the quantity demanded at the old price. Read the demand schedule at the long-run price.' }],
          hints: ['Read the demand schedule at the long-run price.'],
          worked: 'At P = $70, the quantity demanded is **900** haircuts a day.'
        },
        {
          key: 'lr-n', kind: 'number', label: 'LR salons',
          prompt: 'How many salons are operating?',
          answer: { value: 180, unit: 'salons' },
          mistakes: [{ value: 225, msg: 'That assumes 4 haircuts per salon. How many does each salon do in the long run?' }],
          hints: ['Market quantity ÷ haircuts per salon.'],
          worked: '900 ÷ 5 = **180** salons, down from about 367.'
        }
      ]
    },
    // ---------------------------------------------------------------------------
    {
      key: 'industry',
      title: 'An industry with 100 firms',
      body: [{ md: 'An industry currently has 100 firms, each of which has fixed cost of $24 and average variable cost as follows:' }],
      steps: [
        {
          key: 'table', kind: 'table', label: 'Cost table',
          prompt: 'Complete the table. Use one decimal place where needed.',
          columns: [
            { key: 'Q', label: 'Quantity', given: true },
            { key: 'AVC', label: 'AVC', given: true, unit: '$' },
            { key: 'VC', label: 'VC', unit: '$' },
            { key: 'MC', label: 'MC', unit: '$' },
            { key: 'AFC', label: 'AFC', unit: '$' },
            { key: 'ATC', label: 'ATC', unit: '$' }
          ],
          rows: [
            { values: { Q: 1, AVC: 2 }, answers: { VC: 2, MC: 2, AFC: 24, ATC: 26 } },
            { values: { Q: 2, AVC: 3 }, answers: { VC: 6, MC: 4, AFC: 12, ATC: 15 } },
            { values: { Q: 3, AVC: 4 }, answers: { VC: 12, MC: 6, AFC: 8, ATC: 12 } },
            { values: { Q: 4, AVC: 5 }, answers: { VC: 20, MC: 8, AFC: 6, ATC: 11 } },
            { values: { Q: 5, AVC: 6 }, answers: { VC: 30, MC: 10, AFC: 4.8, ATC: 10.8 } },
            { values: { Q: 6, AVC: 7 }, answers: { VC: 42, MC: 12, AFC: 4, ATC: 11 } }
          ],
          tol: 0.05,
          wrongPatterns: [
            { col: 'MC', values: [2, 3, 4, 5, 6, 7], msg: 'Your MC column repeats AVC. MC is the change in VC from one row to the next.' },
            { col: 'MC', values: [2, 6, 12, 20, 30, 42], msg: 'Your MC column is VC itself. MC is the change in VC from the row above.' },
            { col: 'AFC', values: [24, 24, 24, 24, 24, 24], msg: 'AFC is fixed cost *per unit*: divide $24 by the quantity.' },
            { col: 'ATC', values: [2, 3, 4, 5, 6, 7], msg: 'Your ATC column repeats AVC. Add AFC.' }
          ],
          hints: ['VC = AVC × Q, MC = the change in VC from the row above, AFC = $24 ÷ Q, and ATC = AFC + AVC.', 'A check: MC should cross ATC near ATC’s lowest point.'],
          worked: 'VC = AVC × Q, MC = the change in VC, AFC = 24/Q, and ATC = AFC + AVC. ATC is lowest ($10.80) at Q = 5, right where MC crosses it.'
        },
        {
          key: 'q', kind: 'number', label: 'Output per firm at $6',
          prompt: 'The equilibrium price is currently $6. How much does each firm produce?',
          answer: { value: 3, unit: 'units' },
          mistakes: [{ value: 5, msg: 'At 5 units, MC = $10 is well above the $6 price. Where does P = MC?' }],
          hints: ['Each firm produces where P = MC.', 'Find $6 in your MC column.'],
          worked: 'P = MC = $6 at **q = 3**.'
        },
        {
          key: 'Q', kind: 'number', label: 'Market supply',
          prompt: 'What is the total quantity supplied in the market?',
          answer: { value: 300, unit: 'units' },
          mistakes: [{ value: 3, msg: 'That’s one firm. There are 100 of them.' }],
          hints: ['Number of firms × output per firm.'],
          worked: '100 firms × 3 units = **300** units.'
        },
        {
          key: 'price', kind: 'choice', label: 'LR price direction',
          prompt: 'In the long run, firms can enter and exit the market, and all entrants have the same costs as above. As this market makes the transition to its long-run equilibrium, will the price rise or fall?',
          options: [
            { id: 'rise', label: 'Rise' },
            { id: 'fall', label: 'Fall', msg: 'Are firms making or losing money at $6? Compare P with ATC at q = 3.' }
          ],
          answer: 'rise',
          hints: ['At q = 3, ATC = $12. Is the price above or below that?', 'Losses lead to exit. What does exit do to market supply?'],
          worked: 'At $6, each firm’s ATC is $12, so each loses $18. Firms exit, market supply shifts left, and the price **rises** toward min ATC (about $10.80).'
        },
        {
          key: 'price-why', kind: 'explain', label: 'Why the price changes',
          prompt: 'Explain your answer in a sentence or two.',
          model: 'At $6 each firm loses money (ATC = $12 at q = 3, a loss of $18), so firms exit. Market supply shifts left and the price rises until it reaches min ATC, about $10.80, where profit is zero.',
          mustHave: ['firms lose money at $6 (P < ATC)', 'firms exit, so market supply decreases and the price rises'],
          hints: ['Start from each firm’s profit at $6, then follow what firms do about it.'],
          worked: 'Firms lose $18 each at $6, so some exit. Supply shifts left and the price rises until the remaining firms break even, at min ATC ≈ $10.80.'
        },
        {
          key: 'qd', kind: 'choice', label: 'Quantity demanded',
          prompt: 'Will the quantity demanded rise or fall?',
          options: [
            { id: 'rise', label: 'Rise', msg: 'Move along the demand curve: what happens to quantity demanded when the price goes up?' },
            { id: 'fall', label: 'Fall' }
          ],
          answer: 'fall',
          hints: ['Demand doesn’t shift here; the price changes. Move along the demand curve.'],
          worked: '**Fall**: the price rises, so buyers move up along the demand curve.'
        },
        {
          key: 'qi', kind: 'choice', label: 'Output per firm',
          prompt: 'Will the quantity supplied by each firm rise or fall?',
          options: [
            { id: 'rise', label: 'Rise' },
            { id: 'fall', label: 'Fall', msg: 'There are fewer firms, yes, but each remaining firm faces a higher price. Where does P = MC now?' }
          ],
          answer: 'rise',
          hints: ['Each firm produces where P = MC, and MC rises with output.'],
          worked: '**Rise**: with a higher price, each remaining firm moves up its MC curve, from 3 units toward its efficient scale (5 units, where ATC is lowest at $10.80). Market quantity still falls, because there are fewer firms.'
        }
      ]
    }
  ]
};

module.exports = [CH15];
