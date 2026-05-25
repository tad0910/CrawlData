import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { scrapers, getPaths } from '../config.js';
import { saveData } from '../outputManager.js';

chromium.use(stealth());

const STATE_VERSION = 1;
const sleep = (min, max = min) => new Promise(r => setTimeout(r, min + Math.random() * (max - min)));

function decodeEntities(s) {
  if (!s) return '';
  return s.replace(/&nbsp;/g, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

async function fetchWithRetry(requestCtx, url, headers, maxRetries = 4) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await requestCtx.get(url, { headers, timeout: 60000 });
      if (res.ok()) return res;

      if (res.status() === 429) {
        const wait = 30000 + i * 15000;
        console.log(`\n    ⚠️ Rate limit (429), waiting ${wait/1000}s before retry ${i+1}/${maxRetries}...`);
        await sleep(wait);
      } else {
        console.log(`\n    ⚠️ HTTP ${res.status()}, retrying ${i+1}/${maxRetries}...`);
        await sleep(5000);
      }
    } catch (err) {
      const isEconnReset = err.message.includes('ECONNRESET');
      const wait = isEconnReset ? 15000 * (i + 1) : 5000 * (i + 1);
      console.log(`\n    ⚠️ ${isEconnReset ? 'ECONNRESET' : 'Connection error'}, waiting ${wait/1000}s... (retry ${i+1}/${maxRetries})`);
      await sleep(wait);
    }
  }
  throw new Error(`Failed after ${maxRetries} retries`);
}

async function fetchJobsPage(requestCtx, pageNum, CONFIG) {
  const url = `${CONFIG.apiBase}?page=${pageNum}&per_page=${CONFIG.pageSize}`;
  const res = await fetchWithRetry(requestCtx, url, CONFIG.headers);
  const json = await res.json();
  return json.data;
}

async function fetchJobDetail(requestCtx, jobId, CONFIG) {
  const url = `${CONFIG.detailApiBase}${jobId}`;
  try {
    const res = await fetchWithRetry(requestCtx, url, CONFIG.headers, 2);
    const json = await res.json();
    return json.success ? json.data : null;
  } catch (err) {
    return null;
  }
}

function normalizeJob(listData, detailData = {}) {
  const job = detailData.id ? detailData : listData;
  return {
    id: job.id,
    title: job.title,
    url: job.url,
    company: job.company?.name || '',
    companyUrl: job.company?.url || '',
    companyLogo: job.company?.logo || '',
    companySize: job.company?.size || '',
    companyAddress: job.company?.address || '',
    salary: job.salary?.text || 'Thỏa thuận',
    salaryRange: {
      min: job.salary?.from || 0,
      max: job.salary?.to || 0,
      currency: job.salary?.currency || 'VND'
    },
    location: (job.locations || job.workLocation || []).join(', '),
    workingTime: (job.workingTime || []).join(', '),
    type: job.type || '',
    quantity: job.quantity || '',
    gender: job.gender || '',
    position: job.position || '',
    experience: job.experience || '',
    deadline: job.deadline || '',
    postedTime: listData.publish || listData.updatedAt || job.updatedAt || '',
    isDiamond: job.isDiamond || false,
    isHot: job.isHot || false,
    isJobFlashActive: job.isJobFlashActive || false,
    isTopCvJob: job.isTopCvJob || false,
    description: decodeEntities(job.description || ''),
    requirements: decodeEntities(job.requirement || ''),
    benefits: decodeEntities(job.benefit || ''),
    media: (job.media || []).map(m => m.link),
    applyReasons: job.applyReasons || [],
    scrapedAt: new Date().toISOString(),
  };
}

async function fetchDetailsInParallel(requestCtx, items, concurrency, CONFIG) {
  const results = [];
  const queue = [...items];
  const total = items.length;
  let count = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      try {
        count++;
        process.stdout.write(`\r    ⚡ Detail progress: ${count}/${total} jobs...`);
        const detail = await fetchJobDetail(requestCtx, item.id, CONFIG);
        results.push(normalizeJob(item, detail || {}));
      } catch (err) {
        results.push(normalizeJob(item, {}));
      }
      await sleep(CONFIG.detailDelayMs[0], CONFIG.detailDelayMs[1]);
    }
  }

  await Promise.all(Array(concurrency).fill(null).map(worker));
  process.stdout.write('\n');
  return results;
}

function saveState(CONFIG, state) {
  const tmp = CONFIG.stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, CONFIG.stateFile);
}

export async function runScraper() {
  console.time('⏱️ Total time TopCV');
  
  // Resolve config and paths
  const configOverrides = scrapers.topcv;
  const paths = getPaths('topcv');
  const CONFIG = {
    ...configOverrides,
    ...paths,
  };

  // Ensure directories exist
  fs.mkdirSync(path.dirname(CONFIG.stateFile), { recursive: true });
  fs.mkdirSync(path.dirname(CONFIG.outputFile), { recursive: true });

  const browser = await chromium.launch({ headless: CONFIG.headless });
  const context = await browser.newContext();
  const request = context.request;

  let state = { version: STATE_VERSION, totalPages: 0, completedPages: [], jobsById: {} };
  if (fs.existsSync(CONFIG.stateFile)) {
    state = JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
    const done = state.completedPages.length;
    console.log(`📂 Resuming TopCV: ${done} pages done, ${Object.keys(state.jobsById).length} jobs in state`);
  }

  let shuttingDown = false;
  const gracefulExit = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n⚠️ TopCV graceful shutdown, saving state...`);
    try {
      saveState(CONFIG, state);
      const jobs = Object.values(state.jobsById);
      await saveData('topcv', jobs, CONFIG.outputFile);
    } catch (err) {
      console.error('State save fail:', err.message);
    }
    try { await browser.close(); } catch {}
  };

  console.log('🚀 Starting TopCV Scraper (Parallel, concurrency=' + CONFIG.concurrency + ')...');

  if (state.totalPages > 0 && state.completedPages.length >= state.totalPages) {
    console.log(`\n🔄 Chế độ Incremental Crawl (Delta Crawl) được kích hoạt cho TopCV.`);
    state.completedPages = [];
    state.totalPages = 0;
    saveState(CONFIG, state);
  }

  if (!state.totalPages) {
    const firstPage = await fetchJobsPage(request, 1, CONFIG);
    state.totalPages = CONFIG.maxPages || firstPage.totalPage;
    
    const newItems = firstPage.data.filter(item => !state.jobsById[item.id]);
    if (newItems.length > 0) {
      const detailedJobs = await fetchDetailsInParallel(request, newItems, CONFIG.concurrency, CONFIG);
      for (const job of detailedJobs) state.jobsById[job.id] = job;
    }
    state.completedPages.push(1);
    saveState(CONFIG, state);
    console.log(`📊 Total: ~${state.totalPages * CONFIG.pageSize} jobs across ${state.totalPages} pages (${CONFIG.pageSize}/page)`);
  } else {
    console.log(`📊 Total pages: ${state.totalPages} (${CONFIG.pageSize} jobs/page)`);
  }

  for (let p = 1; p <= state.totalPages; p++) {
    if (shuttingDown) break;
    if (state.completedPages.includes(p)) continue;

    console.log(`\n📦 Fetching Page ${p}/${state.totalPages}...`);
    try {
      const pageData = await fetchJobsPage(request, p, CONFIG);
      const newItems = pageData.data.filter(item => !state.jobsById[item.id]);

      if (pageData.data.length > 0 && newItems.length === 0) {
        console.log(`  ✓ Trang ${p} toàn bộ là job cũ. DỪNG CÀO DANH SÁCH (Early Exit)!`);
        state.completedPages.push(p);
        state.totalPages = p; // Dừng cào các trang sau
        saveState(CONFIG, state);
        break;
      }

      if (newItems.length > 0) {
        const detailedJobs = await fetchDetailsInParallel(request, newItems, CONFIG.concurrency, CONFIG);
        for (const job of detailedJobs) {
          state.jobsById[job.id] = job;
        }
        console.log(`  ✓ +${detailedJobs.length} jobs (total unique: ${Object.keys(state.jobsById).length})`);
      } else {
        const dupIds = pageData.data.map(i => i.id).slice(0, 5);
        console.log(`  ✓ All ${pageData.data.length} jobs already in state, skipping. (sample IDs: ${dupIds.join(', ')})`);
      }

      state.completedPages.push(p);
      saveState(CONFIG, state);
      console.log('  💾 State saved.');
    } catch (err) {
      console.error(`  ❌ Page ${p} failed: ${err.message}`);
    }

    if (!shuttingDown) {
      await sleep(CONFIG.pageDelayMs[0], CONFIG.pageDelayMs[1]);
    }
  }

  const finalJobs = Object.values(state.jobsById);
  await saveData('topcv', finalJobs, CONFIG.outputFile);
  saveState(CONFIG, state);
  console.log(`\n✅ Done TopCV scraper!`);
  console.timeEnd('⏱️ Total time TopCV');
  await browser.close();
}
