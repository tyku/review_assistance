const assert = require('node:assert/strict');
const test = require('node:test');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Logger } = require('@nestjs/common');
const { LoadRepositoryLanguages } = require('../dist/review/application/load-repository-languages');
const { DiskRepositoryLanguageCache } = require('../dist/review/infrastructure/disk-repository-language.cache');
const { GitLabRepositoryLanguagesSource } = require('../dist/gitlab/infrastructure/gitlab-repository-languages.source');
const { GitLabMergeRequestSource } = require('../dist/gitlab/infrastructure/gitlab-merge-request.source');
const { OpenMergeRequest } = require('../dist/gitlab/application/open-merge-request');
const { EvaluateReviewFilters } = require('../dist/review/application/evaluate-review-filters');
const { FormattingAndCommentsFilter } = require('../dist/review/infrastructure/formatting-and-comments.filter');
const { RepositoryLanguageFilter } = require('../dist/review/domain/repository-language.filter');

Logger.overrideLogger(false);

const address = 'https://gitlab.example.invalid/instance';
const project = 'team/backend';
const key = { address, project };

test('GitLab fetches all languages once across related MRs and reuses the disk cache on restart', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'review-languages-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = [];
  const fetch = async (url, options) => {
    calls.push(url);
    assert.equal(options.headers['PRIVATE-TOKEN'], 'mock-token');
    assert.equal(options.redirect, 'manual');
    const path = new URL(url).pathname;
    assert.ok(path.startsWith('/instance/api/v4/projects/team%2Fbackend/'));
    if (path.endsWith('/languages')) return Response.json({ Go: 99.99, TypeScript: 0.01, Shell: 0 });
    if (path.endsWith('/diffs')) {
      return Response.json([
        { new_path: 'service.go', diff: '@@ -1 +1 @@\n-return 1\n+return 2' },
        { new_path: 'service_test.go', diff: '@@ -0,0 +1 @@\n+func TestService() {}' },
        { new_path: 'settings.ts', diff: '@@ -1 +1 @@\n-const mode=1;\n+const mode = 1;' },
        { new_path: 'config.yaml', diff: '@@ -1 +1 @@\n-budget: 5\n+budget: 6' },
        { new_path: 'button.tsx', diff: '@@ -1 +1 @@\n-<button>A</button>\n+<button>B</button>' },
        { new_path: 'files.unknown', diff: '@@ -1 +1 @@\n-a\n+b' },
      ]);
    }
    return Response.json({ title: 'Mixed MR', changes_count: '6', source_branch: 'change', target_branch: 'main' });
  };

  const loadReview = () => new OpenMergeRequest(
    { withCredentials: (action) => action({ address, token: 'mock-token' }) },
    new GitLabMergeRequestSource(fetch),
    new EvaluateReviewFilters([new RepositoryLanguageFilter(), new FormattingAndCommentsFilter()]),
    new LoadRepositoryLanguages(new DiskRepositoryLanguageCache(directory)),
    new GitLabRepositoryLanguagesSource(fetch),
  );
  const link = (number) => `${address}/${project}/-/merge_requests/${number}`;
  const first = await loadReview().execute(link(1));
  assert.equal(first.ok, true);
  assert.equal(first.languageSorting, 'available');
  const files = new Map(first.review.files.map((file) => [file.path, file.filterResults]));
  assert.equal(files.get('service.go')[0].outcome, 'match');
  assert.equal(files.get('button.tsx')[0].outcome, 'match');
  assert.equal(files.get('settings.ts')[1].outcome, 'match');
  assert.equal(files.get('config.yaml')[0].reason, 'YAML отсутствует в списке языков репозитория');
  assert.equal(files.get('files.unknown')[0].reason, 'Язык файла не распознан');

  assert.equal((await loadReview().execute(link(2))).languageSorting, 'available');
  assert.equal(calls.filter((url) => url.endsWith('/languages')).length, 1);
  assert.deepEqual(await new DiskRepositoryLanguageCache(directory).read(key), ['Go', 'TypeScript', 'Shell']);
});

test('language cache is isolated by project and GitLab installation', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'review-languages-keys-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cache = new DiskRepositoryLanguageCache(directory);
  const loader = new LoadRepositoryLanguages(cache);
  const anotherProject = { address, project: 'team/frontend' };
  const anotherHost = { address: 'https://gitlab.other.invalid/instance', project };
  await loader.execute(key, async () => ({ ok: true, languages: ['Go'] }));
  await loader.execute(anotherProject, async () => ({ ok: true, languages: ['TypeScript'] }));
  await loader.execute(anotherHost, async () => ({ ok: true, languages: ['Python'] }));
  assert.deepEqual(await cache.read(key), ['Go']);
  assert.deepEqual(await cache.read(anotherProject), ['TypeScript']);
  assert.deepEqual(await cache.read(anotherHost), ['Python']);
});

test('denied and failed requests can retry, while a successful empty list is cached', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'review-languages-fallback-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cache = new DiskRepositoryLanguageCache(directory);
  const loader = new LoadRepositoryLanguages(cache);
  let requestCount = 0;
  const languages = new GitLabRepositoryLanguagesSource(async () => {
    requestCount++;
    if (requestCount === 1) return new Response('', { status: 403 });
    if (requestCount === 2) throw new Error('mock network error');
    return Response.json({});
  });
  const request = () => languages.read(address, project, 'mock-token');
  assert.deepEqual(await loader.execute(key, request), { ok: false, reason: 'forbidden' });
  assert.equal(await cache.read(key), undefined);
  assert.deepEqual(await loader.execute(key, request), { ok: false, reason: 'unavailable' });
  assert.equal(await cache.read(key), undefined);
  assert.deepEqual(await loader.execute(key, request), { ok: true, languages: [] });
  assert.deepEqual(await new LoadRepositoryLanguages(cache).execute(key, request), { ok: true, languages: [] });
  assert.equal(requestCount, 3);
});
