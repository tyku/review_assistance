const assert = require('node:assert/strict');
const test = require('node:test');
const { buildReadingOrder } = require('../dist/review/domain/reading-order');
const { JsonExampleReviewSource } = require('../dist/review/infrastructure/json-example-review.source');

test('the example reads controller, logic, persistence, and test before unrelated files', async () => {
  const review = await new JsonExampleReviewSource('fixtures/example.json').load();
  assert.deepEqual(review.readingOrder.slice(0, 4), [
    'src/orders/delivery.controller.ts',
    'src/orders/delivery.ts',
    'src/orders/delivery.repository.ts',
    'tests/orders/delivery.test.ts',
  ]);
  assert.deepEqual(
    [...review.readingOrder].sort(),
    review.files.map(({ path }) => path).sort(),
  );
});

test('files with no recognized relationship keep their source order', () => {
  const paths = ['config/app.yaml', 'src/billing/delivery.ts', 'src/orders/delivery.controller.ts'];
  assert.deepEqual(buildReadingOrder(paths.map((path) => ({ path }))), paths);
});

function file(path, ...lines) {
  return { path, hunks: [{ lines: lines.map(([marker, text]) => ({ marker, text })) }] };
}

test('relative imports connect files with different names and put the linked test after implementation', () => {
  const files = [
    file('tests/unrelated.test.ts', ['-', "import '../src/save'"]),
    file('tests/places-order.spec.ts', ['+', "import { place } from '../src/place.js'"]),
    file('src/save.ts'),
    file('src/place.ts', [' ', "import { save } from './save'"]),
    file('src/http.ts', ['+', "import { place } from './place'"]),
    file('src/metrics.ts'),
  ];
  assert.deepEqual(buildReadingOrder(files), [
    'src/http.ts', 'src/place.ts', 'src/save.ts', 'tests/places-order.spec.ts',
    'src/metrics.ts', 'tests/unrelated.test.ts',
  ]);
});

test('cyclic imports preserve every file once', () => {
  const files = [
    file('src/one.ts', ['+', "import './two'"]),
    file('src/two.ts', ['+', "import './one'"]),
  ];
  assert.deepEqual(buildReadingOrder(files), ['src/one.ts', 'src/two.ts']);
});
