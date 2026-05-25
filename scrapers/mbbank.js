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
  const url = `${CONFIG.apiBase}?size=${CONFIG.pageSize}&page=${pageNum}`;
  const res = await fetchWithRetry(requestCtx, url, CONFIG.headers);
  const json = await res.json();
  return json;
}

async function fetchJobDetail(requestCtx, jobId, CONFIG) {
  const url = `${CONFIG.detailApiBase}${jobId}`;
  try {
    const res = await fetchWithRetry(requestCtx, url, CONFIG.headers, 2);
    const json = await res.json();
    return json;
  } catch (err) {
    return null;
  }
}

function normalizeJob(listData, detailData = {}) {
  const job = detailData.id ? detailData : listData;
  return {
    id: job.id,
    jobId: job.recruitmentNewId || '',
    jobCode: job.newCode || '',
    title: job.name || '',
    company: 'MB Bank',
    branchCode: job.branchCode || '',
    branchName: job.branchName || '',
    rankName: job.rankName || '',
    workGroupId: job.workGroupId || '',
    workGroupName: job.workGroupName || '',
    workGroupParentId: job.workGroupParentId || null,
    location: job.provinceName || job.province || job.city || '',
    regionCode: job.regionCode || '',
    regionName: job.regionName || '',
    subRegion: job.subRegion || '',
    provinceCode: job.provinceCode || '',
    experienceRequired: job.experienceRequired || '',
    experienceDescription: decodeEntities(job.experienceDescription || ''),
    graduationClassification: job.graduationClassification || null,
    level: job.level || [],
    major: job.major || [],
    skillTags: job.skillTags || [],
    relatedFields: job.relatedFields || [],
    foreignLanguage: job.foreignLanguage || null,
    certificate: job.certificate || null,
    otherRequirements: decodeEntities(job.otherRequirements || ''),
    languageDescription: decodeEntities(job.languageDescription || ''),
    jobDescriptionVn: decodeEntities(job.jobDescriptionVn || ''),
    jobDescriptionEn: decodeEntities(job.jobDescriptionEn || ''),
    missionContent: decodeEntities(job.missionContent || ''),
    welfare: job.welfare || '',
    deadline: job.toDate || '',
    minSalary: job.minSalary || null,
    maxSalary: job.maxSalary || null,
    flagStatus: job.flagStatus !== undefined ? job.flagStatus : null,
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
  console.time('⏱️ Total time MB Bank');

  // Resolve config and paths
  const configOverrides = scrapers.mbbank;
  const paths = getPaths('mbbank');
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

  let state = { version: STATE_VERSION, completedPages: [], jobsById: {}, lastCheckedPage: -1, isFinished: false };
  if (fs.existsSync(CONFIG.stateFile)) {
    state = JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
    const done = state.completedPages.length;
    console.log(`📂 Resuming MB Bank: ${done} pages done, ${Object.keys(state.jobsById).length} jobs in state`);
  }

  let shuttingDown = false;
  const gracefulExit = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n⚠️ MB Bank graceful shutdown, saving state...`);
    try {
      saveState(CONFIG, state);
      const jobs = Object.values(state.jobsById);
      await saveData('mbbank', jobs, CONFIG.outputFile);
    } catch (err) {
      console.error('State save fail:', err.message);
    }
    try { await browser.close(); } catch {}
  };

  console.log('🚀 Starting MB Bank Scraper (Parallel, concurrency=' + CONFIG.concurrency + ')...');

  if (state.isFinished) {
    console.log(`\n🔄 Chế độ Incremental Crawl (Delta Crawl) được kích hoạt cho MB Bank.`);
    state.isFinished = false;
    state.completedPages = [];
    state.lastCheckedPage = -1;
    saveState(CONFIG, state);
  }
  let pageNum = Math.max(0, state.lastCheckedPage);

  while (!shuttingDown) {
    if (state.completedPages.includes(pageNum)) {
      pageNum++;
      continue;
    }

    console.log(`\n📦 Fetching Page ${pageNum}...`);
    try {
      const pageData = await fetchJobsPage(request, pageNum, CONFIG);
      const items = pageData.content || [];

      if (items.length === 0) {
        console.log(`  ✓ Page ${pageNum} is empty. Finished scraping all pages!`);
        state.isFinished = true;
        saveState(CONFIG, state);
        break;
      }

      const newItems = items.filter(item => !state.jobsById[item.id]);

      if (items.length > 0 && newItems.length === 0) {
        console.log(`  ✓ Trang ${pageNum} toàn bộ là job cũ. DỪNG CÀO DANH SÁCH (Early Exit)!`);
        state.completedPages.push(pageNum);
        state.isFinished = true; // Dừng cào các trang sau
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
        const dupIds = items.map(i => i.id).slice(0, 5);
        console.log(`  ✓ All ${items.length} jobs already in state, skipping. (sample IDs: ${dupIds.join(', ')})`);
      }

      state.completedPages.push(pageNum);
      state.lastCheckedPage = pageNum;
      saveState(CONFIG, state);
      console.log('  💾 State saved.');

      if (items.length < CONFIG.pageSize) {
        console.log(`  ✓ Page ${pageNum} has less than ${CONFIG.pageSize} items. Finished scraping!`);
        state.isFinished = true;
        saveState(CONFIG, state);
        break;
      }

      pageNum++;
    } catch (err) {
      console.error(`  ❌ Page ${pageNum} failed: ${err.message}`);
      break;
    }

    if (!shuttingDown) {
      await sleep(CONFIG.pageDelayMs[0], CONFIG.pageDelayMs[1]);
    }
  }

  const finalJobs = Object.values(state.jobsById);
  await saveData('mbbank', finalJobs, CONFIG.outputFile);
  saveState(CONFIG, state);
  console.log(`\n✅ Done MB Bank scraper!`);
  console.timeEnd('⏱️ Total time MB Bank');
  await browser.close();
}
