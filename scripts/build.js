import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import matter from 'gray-matter';
import { marked } from 'marked';
import nunjucks from 'nunjucks';

const REQUIRED_DIRECTORIES = ['content', 'templates'];
const LEGAL_FOOTER_ROUTES = ['/impressum/', '/datenschutz/'];

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const markdownRenderer = new marked.Renderer();
markdownRenderer.html = ({ text }) => escapeHtml(text);

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findMarkdownFiles(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Cannot read content directory ${directory}: ${error.message}`);
  }

  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Invalid content path (symbolic links are not allowed): ${entryPath}`);
    }
    if (entry.isDirectory()) {
      files.push(...await findMarkdownFiles(entryPath));
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
      files.push(entryPath);
    }
  }
  return files;
}

export function contentPathToUrl(relativeFilePath) {
  const normalized = relativeFilePath.split(path.sep).join('/');
  if (normalized.startsWith('/') || normalized.includes('..') || !normalized.endsWith('.md')) {
    throw new Error(`Invalid content path: ${relativeFilePath}`);
  }

  const withoutExtension = normalized.slice(0, -3);
  const segments = withoutExtension.split('/');
  if (segments.some((segment) => !/^[a-z0-9][a-z0-9-]*$/.test(segment))) {
    throw new Error(`Invalid content path: ${relativeFilePath}. Use lowercase letters, numbers, and hyphens.`);
  }

  if (withoutExtension === 'home') return '/';
  return `/${withoutExtension}/`;
}

function urlToOutputPath(distDirectory, url) {
  if (url === '/') return path.join(distDirectory, 'index.html');
  return path.join(distDirectory, ...url.split('/').filter(Boolean), 'index.html');
}

function canonicalUrl(siteUrl, pageUrl) {
  if (!siteUrl) return null;
  return `${siteUrl.replace(/\/+$/, '')}${pageUrl}`;
}

function sortNavigation(a, b) {
  const orderA = Number.isFinite(a.order) ? a.order : Number.MAX_SAFE_INTEGER;
  const orderB = Number.isFinite(b.order) ? b.order : Number.MAX_SAFE_INTEGER;
  return orderA - orderB || a.title.localeCompare(b.title, 'de');
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read site configuration ${filePath}: ${error.message}`);
  }
}

async function loadPage(filePath, contentDirectory) {
  let source;
  try {
    source = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read content file ${filePath}: ${error.message}`);
  }

  let parsed;
  try {
    parsed = matter(source);
  } catch (error) {
    throw new Error(`Invalid YAML frontmatter in ${filePath}: ${error.message}`);
  }

  const relativePath = path.relative(contentDirectory, filePath);
  const url = contentPathToUrl(relativePath);
  const template = parsed.data.template || 'page';
  if (typeof template !== 'string' || !/^[a-z0-9-]+$/.test(template)) {
    throw new Error(`Invalid template name in ${filePath}: ${String(template)}`);
  }

  const title = parsed.data.title || path.basename(filePath, '.md');
  return {
    ...parsed.data,
    title,
    template,
    navigation: parsed.data.navigation === true,
    order: typeof parsed.data.order === 'number' ? parsed.data.order : undefined,
    sourcePath: filePath,
    relativePath,
    url,
    markdown: parsed.content,
    html: marked.parse(parsed.content, { renderer: markdownRenderer })
  };
}

async function copyDirectoryIfPresent(source, destination) {
  if (await pathExists(source)) {
    await fs.cp(source, destination, { recursive: true });
  }
}

export async function buildSite({ rootDir = process.cwd() } = {}) {
  const root = path.resolve(rootDir);
  const contentDirectory = path.join(root, 'content');
  const templatesDirectory = path.join(root, 'templates');
  const assetsDirectory = path.join(root, 'assets');
  const publicDirectory = path.join(root, 'public');
  const distDirectory = path.join(root, 'dist');

  for (const directory of REQUIRED_DIRECTORIES) {
    const fullPath = path.join(root, directory);
    if (!await pathExists(fullPath)) throw new Error(`Required directory is missing: ${fullPath}`);
  }

  const site = await readJson(path.join(root, 'site.config.json'));
  const files = await findMarkdownFiles(contentDirectory);
  const pages = [];
  const urls = new Map();

  for (const file of files) {
    const page = await loadPage(file, contentDirectory);
    if (urls.has(page.url)) {
      throw new Error(`Duplicate URL ${page.url}: ${urls.get(page.url)} and ${page.relativePath}`);
    }
    urls.set(page.url, page.relativePath);

    const templatePath = path.join(templatesDirectory, `${page.template}.njk`);
    if (!await pathExists(templatePath)) {
      throw new Error(`Template not found for ${page.relativePath}: ${page.template}.njk`);
    }
    pages.push(page);
  }

  const navigation = pages
    .filter((page) => page.navigation)
    .sort(sortNavigation)
    .map(({ title, url, order }) => ({ title, url, order }));
  const books = pages
    .filter((page) => page.relativePath.split(path.sep)[0] === 'books')
    .sort((a, b) => (a.seriesNumber ?? Number.MAX_SAFE_INTEGER) - (b.seriesNumber ?? Number.MAX_SAFE_INTEGER)
      || a.title.localeCompare(b.title, 'de'));
  const footerLinks = LEGAL_FOOTER_ROUTES
    .filter((url) => urls.has(url))
    .map((url) => {
      const page = pages.find((candidate) => candidate.url === url);
      return { title: page.title, url: page.url };
    });

  const environment = nunjucks.configure(templatesDirectory, {
    autoescape: true,
    noCache: true,
    throwOnUndefined: false
  });

  await fs.rm(distDirectory, { recursive: true, force: true });
  await fs.mkdir(distDirectory, { recursive: true });
  await copyDirectoryIfPresent(publicDirectory, distDirectory);
  await copyDirectoryIfPresent(assetsDirectory, path.join(distDirectory, 'assets'));

  for (const page of pages) {
    let output;
    try {
      output = environment.render(`${page.template}.njk`, {
        site,
        page,
        content: page.html,
        navigation,
        footerLinks,
        books,
        featuredBook: books.find((book) => book.cover) || books[0] || null,
        canonicalUrl: canonicalUrl(site.url, page.url)
      });
    } catch (error) {
      throw new Error(`Failed to render ${page.relativePath}: ${error.message}`);
    }

    const outputPath = urlToOutputPath(distDirectory, page.url);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, output, 'utf8');
  }

  return { pages, navigation, books, distDirectory };
}

async function run() {
  try {
    const result = await buildSite();
    console.log(`Built ${result.pages.length} pages in ${result.distDirectory}`);
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await run();
}
