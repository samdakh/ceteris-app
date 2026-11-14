/* Small helpers shared by the practice chapters (practice-catalog.js, practice-ch16.js, …). */

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
// Index of the largest value, or -1 if the largest is tied (generators redraw on ties).
function argmaxUnique(xs) {
  const m = Math.max(...xs);
  const at = xs.map((x, i) => (Math.abs(x - m) < 1e-9 ? i : -1)).filter(i => i >= 0);
  return at.length === 1 ? at[0] : -1;
}
// A permutation of 0..n-1 drawn with the generator's rng (for shuffling multiple-choice options).
function shuffleOrder(r, n) {
  const a = range(n);
  for (let i = n - 1; i > 0; i--) { const j = r.int(0, i); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

module.exports = { num, $, money, count, ORD, range, round1, check, argmaxUnique, shuffleOrder };
