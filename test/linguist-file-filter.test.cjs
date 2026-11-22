const assert = require('node:assert/strict');
const test = require('node:test');
const { Logger } = require('@nestjs/common');
const { GitLabMergeRequestSource } = require('../dist/gitlab/infrastructure/gitlab-merge-request.source');
const { OpenMergeRequest } = require('../dist/gitlab/application/open-merge-request');
const { EvaluateReviewFilters } = require('../dist/review/application/evaluate-review-filters');
const { FormattingAndCommentsFilter } = require('../dist/review/infrastructure/formatting-and-comments.filter');
const { LinguistFileFilter } = require('../dist/review/infrastructure/linguist-file.filter');

Logger.overrideLogger(false);

test('Linguist keeps files with a programming language and classifies other formats separately', async () => {
  const filter = new LinguistFileFilter();
  for (const [path, outcome, language] of [
    ['server/main.go', 'no-match', 'Go'],
    ['ui/button.tsx', 'no-match', 'TypeScript'],
    ['ui/button.ts', 'no-match', 'TypeScript'],
    ['src/Dockerfile', 'no-match', 'Dockerfile'],
    ['code/header.h', 'no-match', undefined],
    ['ui/index.html', 'match', 'HTML'],
    ['ui/styles.css', 'match', 'CSS'],
    ['metadata.GEOJSON', 'match', 'JSON'],
    ['config/settings.json', 'match', 'JSON'],
    ['config/settings.yaml', 'match', 'YAML'],
    ['notes/changes.asciidoc', 'match', 'AsciiDoc'],
    ['code/unknown.review-extension', 'match', undefined],
  ]) {
    const result = await filter.evaluate({ file: { path }, diffComplete: true });
    assert.equal(result.outcome, outcome, path);
    assert.equal(result.detectedLanguage, language, path);
  }
});

test('a GitLab MR uses the local catalog without requesting project languages', async () => {
  const address = 'https://gitlab.example.invalid/instance';
  const api = '/instance/api/v4/projects/team%2Fbackend/merge_requests/42';
  const requests = [];
  const source = new GitLabMergeRequestSource(async (url, options) => {
    const path = new URL(url).pathname;
    requests.push(path);
    assert.equal(options.headers['PRIVATE-TOKEN'], 'mock-token');
    if (path === api) {
      return Response.json({ title: 'Review', changes_count: '2', source_branch: 'topic', target_branch: 'main' });
    }
    assert.equal(path, api + '/diffs');
    return Response.json([
      { new_path: 'main.go', diff: '@@ -1 +1 @@\n-return 1\n+return 2' },
      { new_path: 'config.yaml', diff: '@@ -1 +1 @@\n-budget: 5\n+budget: 6' },
    ]);
  });
  const open = new OpenMergeRequest(
    { withCredentials: (action) => action({ address, token: 'mock-token' }) },
    source,
    new EvaluateReviewFilters([new LinguistFileFilter(), new FormattingAndCommentsFilter()]),
  );
  const result = await open.execute(`${address}/team/backend/-/merge_requests/42`);
  assert.equal(result.ok, true);
  assert.deepEqual(requests, [api, api + '/diffs']);
  assert.deepEqual(result.review.files.map((file) => file.filterResults[0].outcome), ['no-match', 'match']);
});
