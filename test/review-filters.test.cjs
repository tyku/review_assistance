const assert = require('node:assert/strict');
const test = require('node:test');
const { NestFactory } = require('@nestjs/core');
const { resolve } = require('node:path');
const { EvaluateReviewFilters } = require('../dist/review/application/evaluate-review-filters');
const { FORMATTING_AND_COMMENTS_FILTER, OTHER_EXTENSION_FILTER, TEST_PATH_FILTER } = require('../dist/review/domain/file-filter');
const { ReviewFiltersModule } = require('../dist/review/review-filters.module');
const { createReview } = require('../dist/review/domain/review');
const { FormattingAndCommentsFilter } = require('../dist/review/infrastructure/formatting-and-comments.filter');
const { JsonExampleReviewSource } = require('../dist/review/infrastructure/json-example-review.source');
const { parseUnifiedDiff } = require('../dist/review/infrastructure/unified-diff');

const filter = new FormattingAndCommentsFilter();

function file(path, before, after, start = 1) {
  const oldLines = before.split('\n');
  const newLines = after.split('\n');
  const patch = [
    `@@ -${start},${oldLines.length} +${start},${newLines.length} @@`,
    ...oldLines.map((line) => '-' + line),
    ...newLines.map((line) => '+' + line),
  ].join('\n');
  return { path, hunks: parseUnifiedDiff(patch) };
}

function classify(change, diffComplete = true) {
  return filter.evaluate({ file: change, diffComplete }).outcome;
}

test('the demo collapses only JSON indentation and ordinary comments', async () => {
  const source = new JsonExampleReviewSource(resolve('fixtures/example.json'));
  const review = await new EvaluateReviewFilters([filter]).execute(await source.load());
  const grouped = review.files.filter((change) => change.filterResults[0].outcome === 'match');
  assert.deepEqual(grouped.map((change) => [change.path, change.filterResults[0].reason]), [
    ['src/orders/states.ts', 'Правки обычных комментариев'],
    ['config/labels.json', 'Только форматирование JSON'],
  ]);
  assert.equal(new Set(review.files.map((change) => change.path)).size, review.files.length);
});

test('one changed number among a hundred indentation edits stays visible', () => {
  const before = '{\n' + Array.from({ length: 100 }, (_, index) => ` "${index}": 1`).join(',\n') + '\n}';
  const after = before.replace(/\n /g, '\n   ').replace('"50": 1', '"50": 2');
  assert.equal(classify(file('settings.json', before, after)), 'no-match');
  assert.equal(classify(file('settings.json', '{"value":"a b"}', '{ "value": "ab" }')), 'no-match');
  assert.equal(classify(file('settings.json', '{"value":"//a"}', '{ "value": "//a" }')), 'match');
});

test('syntax changes and literal contents are preserved during comparison', () => {
  assert.equal(classify(file('change.ts', 'const states=[1,2];', 'const states = [\n  1,\n  2,\n];')), 'match');
  assert.equal(classify(file('change.ts', 'const check=x=>x>1;', 'const check = x =>\n  x >= 1;')), 'no-match');
  assert.equal(classify(file('change.ts', 'const samples=[1];', 'const samples = [1,,];')), 'no-match');
  assert.equal(classify(file('change.ts', 'const phrase=`a b`;', 'const phrase = `ab`;')), 'no-match');
  assert.equal(classify(file('change.ts', 'const re=/a b/;', 'const re = /ab/;')), 'no-match');
  assert.equal(classify(file('change.ts', 'const url="https://a";', 'const url = "https://a";')), 'match');
  assert.equal(classify(file('change.ts', 'const token="/* a */";', 'const token = "/* b */";')), 'no-match');
  assert.equal(classify(file('change.ts', 'function get(){return\n1;}\nconst end=2;',
    'function get() { return 1; }\nconst end = 2;')), 'no-match');
});

test('ordinary comments match, while directives and uncertain diffs stay visible', () => {
  const ordinary = file('change.ts', 'const value=1; // Старый комментарий', 'const value = 1; // Новый комментарий');
  assert.equal(classify(ordinary), 'match');
  assert.equal(classify(file('change.ts', '/** Старое описание */\nconst v=1;', '/** Новое описание */\nconst v=1;')), 'match');
  assert.equal(classify(file('change.ts', 'const v=1;', '// Обычный комментарий\nconst v=1;')), 'match');
  assert.equal(classify(file('change.ts', 'function get() {\n  // Before\n  return 1;\n}', 'function get() {\n  // After\n  return 1;\n}')), 'match');
  assert.equal(classify(file('change.ts', 'const v=1;', '/* global v */\nconst v=1;')), 'unknown');
  assert.equal(classify(file('change.ts', 'const v=1;', '// eslint-disable-next-line\nconst v=1;')), 'unknown');
  assert.equal(classify(file('change.ts', 'const v=1;', '/** @type {number} */\nconst v=1;')), 'unknown');
  assert.equal(classify(file('change.ts', 'const v=1;', '/* comment\nconst v=1;')), 'unknown');
  assert.equal(classify(file('change.ts', 'const v=1;', 'const v = 1;', 40)), 'unknown');
  assert.equal(classify(file('change.ts', 'const v=1;', 'const v = ;')), 'unknown');
  assert.equal(classify(file('settings.rules', 'x=1', ' x=1')), 'unknown');
  assert.equal(classify({ ...ordinary, structuralChange: true }), 'no-match');
  assert.equal(classify(ordinary, false), 'unknown');
});

test('a second test-only filter can be registered without changing the built-in filter or list', async () => {
  const filenameFilter = {
    id: 'test-filename',
    async evaluate({ file: change }) {
      return { outcome: change.path.endsWith('.json') ? 'match' : 'no-match', reason: 'test only' };
    },
  };
  const review = createReview({
    project: 'test', reference: 'MR !1', title: 'Test filters', sourceBranch: 'change', targetBranch: 'main',
  }, [file('config.json', '{"value":1}', '{"value":2}')]);
  const result = await new EvaluateReviewFilters([filenameFilter, filter]).execute(review);
  assert.deepEqual(result.files[0].filterResults, [
    { filterId: 'test-filename', outcome: 'match', reason: 'test only' },
    { filterId: FORMATTING_AND_COMMENTS_FILTER, outcome: 'no-match', reason: 'Изменились данные JSON' },
  ]);
  assert.deepEqual(result.files[0].hunks, review.files[0].hunks);
});


test('production path filters cover the requested extensions, case, overlaps and incomplete files', async () => {
  const context = await NestFactory.createApplicationContext(ReviewFiltersModule, { logger: false });
  try {
    const paths = [
      'docs/a.md', 'docs/a.txt', 'image/a.PNG', 'image/a.jpg', 'image/a.jpeg',
      'image/a.tiff', 'build/a.log', 'tests/a.pdf', 'src/SpecHelpers/a.ts',
      'a.test.ts', 'src/main.ts', 'src/readme.md.ts',
    ];
    const linked = createReview({
      project: 'test', reference: 'MR !2', title: 'Path filters', sourceBranch: 'change', targetBranch: 'main',
    }, paths.map((path) => ({ path, hunks: [], unavailable: {} })));
    const review = await context.get(EvaluateReviewFilters).execute(linked, false);
    const matches = (filterId) => review.files
      .filter(({ filterResults }) => filterResults.some((item) => item.filterId === filterId && item.outcome === 'match'))
      .map(({ path }) => path);

    assert.deepEqual(matches(OTHER_EXTENSION_FILTER), paths.slice(0, 8));
    assert.deepEqual(matches(TEST_PATH_FILTER), ['tests/a.pdf', 'src/SpecHelpers/a.ts', 'a.test.ts']);
    assert.deepEqual(matches(FORMATTING_AND_COMMENTS_FILTER), []);
  } finally {
    await context.close();
  }
});
