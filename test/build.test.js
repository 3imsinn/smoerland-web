import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildSite } from '../scripts/build.js';

const projectRoot = path.resolve(import.meta.dirname, '..');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'smoerland-web-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const entry of ['assets', 'content', 'public', 'templates']) {
    await fs.cp(path.join(projectRoot, entry), path.join(root, entry), { recursive: true });
  }
  await fs.copyFile(path.join(projectRoot, 'site.config.json'), path.join(root, 'site.config.json'));
  return root;
}

async function read(root, relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

test('maps home and regular content files to clean URLs', async (t) => {
  const root = await fixture(t);
  await buildSite({ rootDir: root });

  await fs.access(path.join(root, 'dist/index.html'));
  await fs.access(path.join(root, 'dist/impressum/index.html'));
});

test('maps nested content to a nested output directory', async (t) => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'content/section'), { recursive: true });
  await fs.writeFile(path.join(root, 'content/section/nested-page.md'), `---
title: Nested page
template: page
navigation: false
---

# Nested page
`);

  await buildSite({ rootDir: root });
  await fs.access(path.join(root, 'dist/section/nested-page/index.html'));
});

test('excludes navigation=false pages from the main navigation', async (t) => {
  const root = await fixture(t);
  await buildSite({ rootDir: root });

  const html = await read(root, 'dist/index.html');
  const mainNavigation = html.match(/<nav aria-label="Hauptnavigation">([\s\S]*?)<\/nav>/)?.[1] || '';
  assert.doesNotMatch(mainNavigation, /Impressum/);
  assert.doesNotMatch(mainNavigation, /Datenschutz/);
});

test('adds every book content file to the home page automatically', async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'content/books/new-book.md'), `---
title: Automatisch entdecktes Buch
author: Beispiel Autor
template: book
navigation: false
---

# Automatisch entdecktes Buch
`);

  await buildSite({ rootDir: root });
  const html = await read(root, 'dist/index.html');
  assert.match(html, /Automatisch entdecktes Buch/);
  assert.match(html, /href="\/books\/new-book\/"/);
});

test('removes output for deleted Markdown on the next clean build', async (t) => {
  const root = await fixture(t);
  const source = path.join(root, 'content/temporary.md');
  const output = path.join(root, 'dist/temporary/index.html');
  await fs.writeFile(source, `---
title: Temporary
template: page
navigation: false
---

# Temporary
`);

  await buildSite({ rootDir: root });
  await fs.access(output);
  await fs.rm(source);
  await buildSite({ rootDir: root });
  await assert.rejects(fs.access(output));
});

test('escapes raw HTML embedded in Markdown', async (t) => {
  const root = await fixture(t);
  await fs.writeFile(path.join(root, 'content/unsafe.md'), `---
title: Unsafe HTML
template: page
navigation: false
---

<script>alert('unsafe')</script>
`);

  await buildSite({ rootDir: root });
  const html = await read(root, 'dist/unsafe/index.html');
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});
