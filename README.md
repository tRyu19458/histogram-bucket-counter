# histogram-bucket-counter

A small TypeScript-free ESM library that maintains a fixed set of boundary-defined buckets and increments the appropriate bucket for each recorded value, returning counts per bucket on demand.

## Usage

```js
import { HistogramBucketCounter } from 'histogram-bucket-counter';

const h = new HistogramBucketCounter([10, 20, 30]);
h.record(5);   // bucket 0 (<=10)
h.record(17);  // bucket 1 (10<..<=20)
h.record(45);  // bucket 3 (overflow, >30)
h.recordMany(12, 100); // count 12 one hundred times into bucket 1

console.log(h.counts()); // [1, 101, 0, 1]
console.log(h.total());  // 103
h.reset();
console.log(h.counts()); // [0, 0, 0, 0]
```

## Why this exists

When you want the *shape* of a stream of numbers — request latencies, response sizes,
resource usage — you do not need every value, you need counts in fixed bands. This
library keeps that state in one small object with O(log n) per record (binary search
over boundaries) and O(n) to snapshot the counts. The trade-off versus a streaming
quantile sketch is simplicity and exact bucket counts in exchange for no support for
arbitrary percentile queries after the fact.

## Interpretation chosen

Boundaries define **upper edges of left-inclusive spans**. Given boundaries
`[b0, b1, ..., bn-1]`, there are `n+1` buckets:

- bucket 0: `value <= b0`
- bucket i (1..n-1): `b[i-1] < value <= b[i]`
- bucket n (overflow): `value > b[n-1]`

A value exactly on a boundary counts in the bucket whose upper edge is that boundary.

## Awkward edges

- **NaN is rejected** by `record` and `recordMany` (they return `false`), because every
  comparison with NaN is false and it would silently land in overflow regardless of
  magnitude.
- **`Infinity` and `-Infinity` are accepted**: they route to overflow and the lowest
  bucket respectively, which is predictable and useful for pipelines that pass them
  through.
- **Boundaries must be strictly ascending** and finite; duplicates or decreases are
  rejected at construction because they make bucket assignment ambiguous.
- `counts()` and `boundaries` return defensive copies; mutating them does not affect
  internal state.

## Exported names

- `HistogramBucketCounter` (class) — the only export, re-exported from `src/index.js`.

  Methods and accessors:
  - `new HistogramBucketCounter(boundaries)` — `boundaries: number[]`, ascending, finite, non-empty.
  - `record(value)` → `boolean` (true if counted, false if NaN or non-number).
  - `recordMany(value, n)` → `boolean`; `n` must be a non-negative integer.
  - `counts()` → `number[]` (length `boundaries.length + 1`, lowest bucket first, overflow last).
  - `total()` → `number`.
  - `reset()` → `void`.
  - `boundaries` (getter) → `number[]` copy.
  - `bucketCount` (getter) → `number`.

## Running the tests

```
node --test
```

Tests use only `node:test` and `node:assert/strict` and are fully deterministic (a
seeded LCG, no wall-clock time, no sleeps).
