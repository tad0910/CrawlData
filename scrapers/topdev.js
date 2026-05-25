import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { scrapers, getPaths } from '../config.js';
import { saveData } from '../outputManager.js';

chromium.use(stealth());

const STATE_VERSION = 2;

const sleep = (min, max = min) => new Promise(r =>
  setTimeout(r, min + Math.random() * (max - min))
);

// ============ HTML CLEANUP ============
const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&#39;': "'",
  '&nbsp;': ' ',
  '&Agrave;': 'À', '&Aacute;': 'Á', '&Acirc;': 'Â', '&Atilde;': 'Ã',
  '&Auml;': 'Ä', '&Aring;': 'Å', '&AElig;': 'Æ', '&Ccedil;': 'Ç',
  '&Egrave;': 'È', '&Eacute;': 'É', '&Ecirc;': 'Ê', '&Euml;': 'Ë',
  '&Igrave;': 'Ì', '&Iacute;': 'Í', '&Icirc;': 'Î', '&Iuml;': 'Ï',
  '&ETH;': 'Ð', '&Ntilde;': 'Ñ',
  '&Ograve;': 'Ò', '&Oacute;': 'Ó', '&Ocirc;': 'Ô', '&Otilde;': 'Õ',
  '&Ouml;': 'Ö', '&Oslash;': 'Ø',
  '&Ugrave;': 'Ù', '&Uacute;': 'Ú', '&Ucirc;': 'Û', '&Uuml;': 'Ü',
  '&Yacute;': 'Ý', '&THORN;': 'Þ', '&szlig;': 'ß',
  '&agrave;': 'à', '&aacute;': 'á', '&acirc;': 'â', '&atilde;': 'ã',
  '&auml;': 'ä', '&aring;': 'å', '&aelig;': 'æ', '&ccedil;': 'ç',
  '&egrave;': 'è', '&eacute;': 'é', '&ecirc;': 'ê', '&euml;': 'ë',
  '&igrave;': 'ì', '&iacute;': 'í', '&icirc;': 'î', '&iuml;': 'ï',
  '&eth;': 'ð', '&ntilde;': 'ñ',
  '&ograve;': 'ò', '&oacute;': 'ó', '&ocirc;': 'ô', '&otilde;': 'õ',
  '&ouml;': 'ö', '&oslash;': 'ø',
  '&ugrave;': 'ù', '&uacute;': 'ú', '&ucirc;': 'û', '&uuml;': 'ü',
  '&yacute;': 'ý', '&thousand;': 'þ', '&yuml;': 'ÿ',
  '&ndash;': '–', '&mdash;': '—', '&hellip;': '…',
  '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”',
  '&bull;': '•', '&middot;': '·', '&trade;': '™', '&copy;': '©', '&reg;': '®',
  '&deg;': '°', '&plusmn;': '±', '&times;': '×', '&divide;': '÷',
  '&laquo;': '«', '&raquo;': '»', '&iexcl;': '¡', '&iquest;': '¿',
  '&sect;': '§', '&para;': '¶', '&euro;': '€', '&pound;': '£', '&yen;': '¥', '&cent;': '¢',
  '&larr;': '←', '&rarr;': '→', '&uarr;': '↑', '&darr;': '↓', '&harr;': '↔',
  '&lArr;': '⇐', '&rArr;': '⇒', '&uArr;': '⇑', '&dArr;': '⇓', '&hArr;': '⇔',
  '&check;': '✓', '&cross;': '✗',
  '&le;': '≤', '&ge;': '≥', '&ne;': '≠', '&asymp;': '≈', '&infin;': '∞',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[A-Za-z]+;/g, m => HTML_ENTITIES[m] ?? m);
}

function htmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  const items = [];
  const liMatches = html.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  if (liMatches && liMatches.length) {
    for (const li of liMatches) {
      const inner = li.replace(/<li[^>]*>|<\/li>/gi, '');
      const txt = decodeEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (txt) items.push('- ' + txt);
    }
    return items.join('\n');
  }
  const txt = decodeEntities(html.replace(/<\/?(p|div|br)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ''));
  return txt.split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

// ============ API ============
function buildApiUrl(pageNum, CONFIG) {
  const params = new URLSearchParams();
  params.set('page', String(pageNum));
  params.set('page_size', String(CONFIG.pageSize));
  params.set('fields[job]', CONFIG.apiFields.job);
  params.set('fields[company]', CONFIG.apiFields.company);
  params.set('locale', CONFIG.locale);
  return `${CONFIG.apiBase}?${params.toString()}`;
}

async function fetchJobsPage(requestCtx, pageNum, CONFIG) {
  const url = buildApiUrl(pageNum, CONFIG);
  const res = await requestCtx.get(url, {
    headers: {
      Accept: 'application/json',
      Origin: 'https://topdev.vn',
      Referer: CONFIG.referer,
    },
    timeout: 90000,
  });
  if (!res.ok()) {
    throw new Error(`API HTTP ${res.status()} for page ${pageNum}`);
  }
  const json = await res.json();
  if (!json || !Array.isArray(json.data)) {
    throw new Error(`API response missing data[] for page ${pageNum}`);
  }
  return json;
}

// ============ TRANSFORM ============
const VI_UNIT_TO_EN = {
  'phút': 'minutes', 'giờ': 'hours', 'ngày': 'days',
  'tuần': 'weeks', 'tháng': 'months', 'năm': 'years',
};

function viRelativeToEn(s) {
  if (!s || typeof s !== 'string') return '';
  const m = s.match(/^(\d+)\s+(phút|giờ|ngày|tuần|tháng|năm)\s+trước/i);
  if (!m) return s;
  return `${m[1]} ${VI_UNIT_TO_EN[m[2].toLowerCase()]} ago`;
}

function normalizeJob(raw) {
  const url = raw.detail_url || (raw.slug ? `https://topdev.vn/detail-jobs/${raw.slug}-${raw.id}` : '');

  const salary = raw.salary || {};
  const salaryStr = salary.is_negotiable === '1' || salary.is_negotiable === 1
    ? 'Negotiable'
    : (salary.value || '').replace(/\s+/g, ' ').trim();

  const addr = raw.addresses || {};
  const locations = Array.isArray(addr.address_region_array) ? addr.address_region_array : [];
  const streets = Array.isArray(addr.collection_addresses)
    ? addr.collection_addresses.map(a => a?.street).filter(Boolean)
    : [];

  const tags = [];
  if (Array.isArray(raw.skills_arr)) tags.push(...raw.skills_arr.filter(Boolean));
  if (!tags.length && raw.skills_str) {
    tags.push(...raw.skills_str.split(/[,;]/).map(s => s.trim()).filter(Boolean));
  }

  const responsibilities = htmlToText(raw.responsibilities_original || raw.content || '');
  const requirements = htmlToText(raw.requirements_original || '');
  const benefitsParts = [];
  if (Array.isArray(raw.benefits_v2)) {
    for (const b of raw.benefits_v2) {
      const piece = htmlToText(b?.description || '');
      if (piece) benefitsParts.push(b?.name ? `${b.name}:\n${piece}` : piece);
    }
  }
  if (!benefitsParts.length && raw.benefits_original) {
    benefitsParts.push(htmlToText(raw.benefits_original));
  }

  return {
    id: raw.id,
    slug: raw.slug || '',
    title: (raw.title || '').trim(),
    url,
    company: raw.company?.display_name || '',
    companyUrl: raw.company?.detail_url || '',
    companySize: raw.company?.company_size || '',
    salary: salaryStr,
    salaryRange: {
      min: salary.min_filter ?? null,
      max: salary.max_filter ?? null,
      currency: salary.currency || '',
      unit: salary.unit || '',
    },
    locations,
    addresses: streets,
    jobTypes: raw.job_types_str || '',
    jobLevels: raw.job_levels_str || '',
    experience: raw.experiences_str || '',
    contractTypes: raw.contract_types_str || '',
    tags,
    industries: raw.company?.industries_arr || [],
    jobDescription: responsibilities,
    requirements,
    benefits: benefitsParts.join('\n\n').trim(),
    published: raw.published || '',
    refreshed: raw.refreshed || '',
    location: locations.join(', '),
    workingMode: raw.job_types_str || '',
    postedTime: viRelativeToEn(raw.refreshed?.since || raw.published?.since || ''),
    skills: tags,
    expires: raw.expires || '',
    scrapedAt: new Date().toISOString(),
  };
}

// ============ BROWSER ============
async function setupBrowser(CONFIG) {
  const browser = await chromium.launch({
    headless: CONFIG.headless,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    extraHTTPHeaders: {
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    },
  };

  if (fs.existsSync(CONFIG.cookiesFile)) {
    contextOptions.storageState = CONFIG.cookiesFile;
    console.log('📂 Loaded cookies từ file');
  }

  const context = await browser.newContext(contextOptions);
  return { browser, context };
}

async function warmUp(context) {
  const page = await context.newPage();
  try {
    await page.goto('https://topdev.vn/jobs/search', { waitUntil: 'domcontentloaded', timeout: 60000 });
    const title = await page.title();
    if (title.includes('Just a moment') || title.includes('Cloudflare')) {
      console.log('🛑 Cloudflare challenge, đợi 15s...');
      await sleep(15000);
      try {
        await page.waitForFunction(() => !document.title.includes('Just a moment'), { timeout: 30000 });
      } catch {
        console.log('⚠️ Cloudflare vẫn chưa qua, API call có thể fail');
      }
    }
    await sleep(1500, 2500);
  } finally {
    await page.close();
  }
}

// ============ STATE ============
function createInitialState() {
  return {
    version: STATE_VERSION,
    totalPages: 0,
    total: 0,
    perPage: 0,
    completedPages: [],
    jobsById: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadState(CONFIG) {
  if (!fs.existsSync(CONFIG.stateFile)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
    if (s.version !== STATE_VERSION) {
      console.log(`⚠️ State version mismatch (${s.version} vs ${STATE_VERSION}), start fresh`);
      return null;
    }
    return s;
  } catch (err) {
    console.log(`⚠️ State file corrupt (${err.message}), start fresh`);
    return null;
  }
}

function saveState(CONFIG, state) {
  state.updatedAt = new Date().toISOString();
  const tmp = CONFIG.stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, CONFIG.stateFile);
}

// ============ MAIN ============
export async function runScraper() {
  console.time('⏱️ Total time TopDev');

  // Resolve config and paths
  const configOverrides = scrapers.topdev;
  const paths = getPaths('topdev');
  const CONFIG = {
    ...configOverrides,
    ...paths,
  };

  // Ensure directories exist
  fs.mkdirSync(path.dirname(CONFIG.stateFile), { recursive: true });
  fs.mkdirSync(path.dirname(CONFIG.cookiesFile), { recursive: true });
  fs.mkdirSync(path.dirname(CONFIG.outputFile), { recursive: true });

  let state = loadState(CONFIG);
  const resuming = !!state;
  if (resuming) {
    console.log(`📂 Resuming TopDev: ${state.completedPages.length}/${state.totalPages || '?'} pages, ${Object.keys(state.jobsById).length} jobs`);
  } else {
    state = createInitialState();
    console.log('🆕 Fresh scrape (no state file) TopDev');
  }

  const { browser, context } = await setupBrowser(CONFIG);

  let shuttingDown = false;
  const gracefulExit = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n⚠️ TopDev graceful shutdown, saving state...`);
    try { saveState(CONFIG, state); } catch (err) { console.error('State save fail:', err.message); }
    try { await context.storageState({ path: CONFIG.cookiesFile }); } catch {}
    try { await browser.close(); } catch {}
    console.log('💾 State saved.');
  };

  console.log('🏠 Warming up browser (Cloudflare + cookies)...');
  await warmUp(context);

  if (state.totalPages > 0 && state.completedPages.length >= state.totalPages) {
    console.log(`\n🔄 Chế độ Incremental Crawl (Delta Crawl) được kích hoạt cho TopDev.`);
    state.completedPages = [];
    state.totalPages = 0;
    saveState(CONFIG, state);
  }

  if (!state.totalPages) {
    console.log('📊 Fetching page 1 metadata...');
    const first = await fetchJobsPage(context.request, 1, CONFIG);
    state.total = first.meta?.total || 0;
    state.perPage = first.meta?.per_page || first.data.length;
    state.totalPages = first.meta?.last_page || 1;
    if (CONFIG.maxPages) state.totalPages = Math.min(state.totalPages, CONFIG.maxPages);
    
    for (const raw of first.data) {
      const job = normalizeJob(raw);
      if (job.id != null) state.jobsById[job.id] = job;
    }
    state.completedPages.push(1);
    saveState(CONFIG, state);
    console.log(`📊 Total: ${state.total} jobs across ${state.totalPages} pages (${state.perPage}/page)`);
    console.log(`  ✓ Page 1: got ${first.data.length} jobs`);
  }

  const completedSet = new Set(state.completedPages);
  let pagesSinceSave = 0;

  for (let p = 2; p <= state.totalPages; p++) {
    if (shuttingDown) break;
    if (completedSet.has(p)) continue;

    try {
      const resp = await fetchJobsPage(context.request, p, CONFIG);
      let newCount = 0;
      for (const raw of resp.data) {
        const job = normalizeJob(raw);
        if (job.id != null) {
          if (!state.jobsById[job.id]) newCount++;
          state.jobsById[job.id] = job;
        }
      }

      if (resp.data.length > 0 && newCount === 0) {
        console.log(`  ✓ Trang ${p} toàn bộ là job cũ. DỪNG CÀO DANH SÁCH (Early Exit)!`);
        state.completedPages.push(p);
        state.totalPages = p; // Dừng cào các trang sau
        saveState(CONFIG, state);
        break;
      }

      state.completedPages.push(p);
      pagesSinceSave++;
      console.log(`  ✓ Page ${p}/${state.totalPages}: got ${resp.data.length} (total unique: ${Object.keys(state.jobsById).length})`);
    } catch (err) {
      console.error(`  ❌ Page ${p} failed: ${err.message}`);
    }

    if (pagesSinceSave >= CONFIG.saveEvery) {
      saveState(CONFIG, state);
      pagesSinceSave = 0;
    }
    if (p % 20 === 0) {
      try { await context.storageState({ path: CONFIG.cookiesFile }); } catch {}
    }
    await sleep(CONFIG.pageDelayMs[0], CONFIG.pageDelayMs[1]);
  }

  saveState(CONFIG, state);

  const doneSet = new Set(state.completedPages);
  const failed = [];
  for (let p = 1; p <= state.totalPages; p++) if (!doneSet.has(p)) failed.push(p);
  if (failed.length) {
    console.log(`\n⚠️ ${failed.length} page(s) not finished. Run again to retry.`);
  }

  try { await context.storageState({ path: CONFIG.cookiesFile }); } catch {}
  await browser.close();

  const jobs = Object.values(state.jobsById);
  await saveData('topdev', jobs, CONFIG.outputFile);
  console.log(`\n✅ Done TopDev scraper!`);
  console.timeEnd('⏱️ Total time TopDev');
}
