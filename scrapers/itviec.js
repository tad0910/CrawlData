import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import pLimit from 'p-limit';
import { scrapers, getPaths } from '../config.js';
import { saveData } from '../outputManager.js';

chromium.use(stealth());

const sleep = (min, max = min) => new Promise(r =>
  setTimeout(r, min + Math.random() * (max - min))
);

// ============ PARSE HTML FUNCTIONS ============
function parseJobList(html) {
  const $ = cheerio.load(html);
  const jobs = [];

  $('.job-card').each((_, el) => {
    const $el = $(el);

    const slug = $el.attr('data-search--job-selection-job-slug-value');
    const jobKey = $el.attr('data-job-key');
    if (!slug) return;

    const $h3 = $el.find('h3[data-search--job-selection-target="jobTitle"]').first();
    const title = $h3.text().trim();
    const url = `https://itviec.com/it-jobs/${slug}`;

    const $companyA = $el.find('a[href*="/companies/"]').last();
    const company = $companyA.text().trim();
    const companySlug = ($companyA.attr('href') || '').match(/\/companies\/([^?]+)/)?.[1] || '';

    let salary = $el.find('.salary').first().text().replace(/\s+/g, ' ').trim();
    if (!salary) {
      const signInText = $el.find('.sign-in-view-salary').first().text().trim();
      salary = signInText || '';
    }

    const infoTexts = $el.find('.text-rich-grey').map((_, n) => $(n).text().trim()).get()
      .filter(t => t && t.length < 80);
    const infoFiltered = infoTexts.filter(t => t !== company);
    const workingMode = infoFiltered.find(t => /office|remote|hybrid/i.test(t)) || '';
    const location = infoFiltered.find(t =>
      /Ho Chi Minh|Ha Noi|Hanoi|Da Nang|Can Tho|Hai Phong|Others/i.test(t)
    ) || '';

    const tags = $el.find('a.itag').map((_, t) => $(t).text().trim()).get()
      .filter(t => t && !/^\+\d+$/.test(t));

    const postedTime = $el.find('.small-text.text-dark-grey').first().text()
      .replace(/\s+/g, ' ').trim();

    const label = $el.find('.ilabel').first().text().trim();

    jobs.push({
      jobKey,
      slug,
      title,
      url,
      company,
      companySlug,
      salary: salary || 'Sign in to view salary',
      workingMode,
      location,
      tags,
      postedTime,
      label,
    });
  });

  return jobs;
}

function parseJobDetail(html, baseData) {
  const $ = cheerio.load(html);
  const $mainCol = $('.col-xl-8.im-0').first();
  const $scope = $mainCol.length ? $mainCol : $.root();

  const title = $('h1').first().text().trim() || baseData.title;

  const salary = $('.job-header-info .salary').first().text().replace(/\s+/g, ' ').trim()
    || baseData.salary || '';

  const sectionMap = {};
  $scope.find('h2').each((_, h) => {
    const heading = $(h).text().trim();
    if (!heading) return;
    if (/^(More jobs|Make Your|Feedback)/i.test(heading)) return;

    let sib = $(h).next();
    const chunks = [];
    while (sib.length && sib[0].tagName !== 'h2') {
      const lis = sib.find('li');
      if (lis.length) {
        chunks.push(lis.map((_, li) => '- ' + $(li).text().trim().replace(/\s+/g, ' ')).get().join('\n'));
      } else {
        const t = sib.text().trim().replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
        if (t) chunks.push(t);
      }
      sib = sib.next();
    }
    sectionMap[heading] = chunks.join('\n\n').trim();
  });

  const companyInfo = { name: baseData.company };
  const labels = ['Company type', 'Company industry', 'Company size', 'Country', 'Working days', 'Overtime policy'];
  $('div.col').each((_, col) => {
    const text = $(col).text().trim().replace(/\s+/g, ' ');
    if (labels.includes(text)) {
      const val = $(col).next('.col').text().trim().replace(/\s+/g, ' ');
      if (val) companyInfo[text] = val;
    }
  });

  const mainSkills = $scope.find('a.itag').map((_, t) => $(t).text().trim()).get();
  const skills = [...new Set([...(baseData.tags || []), ...mainSkills])]
    .filter(s => s && !/^\+\d+$/.test(s));

  return {
    ...baseData,
    title,
    salary,
    skills,
    reasons: sectionMap['Top 3 reasons to join us'] || '',
    jobDescription: sectionMap['Job description'] || '',
    requirements: sectionMap['Your skills and experience'] || '',
    benefits: sectionMap["Why you'll love working here"] || '',
    companyInfo,
    scrapedAt: new Date().toISOString(),
  };
}

// ============ SCRAPE FLOW ============
async function checkLoginState(page) {
  try {
    try {
      await page.waitForSelector('.job-card, .sign-in-view-salary, a[href*="/sign_in"], a[href*="/sign_out"]', { timeout: 8000 });
    } catch (e) {
      // Ignore timeout if it's a generic page or taking longer
    }

    return await page.evaluate(() => {
      // If we see job cards, check if any require sign-in to view salary
      const jobCards = document.querySelectorAll('.job-card');
      if (jobCards.length > 0) {
        const hasSignInToView = !!document.querySelector('.sign-in-view-salary');
        return !hasSignInToView;
      }
      
      // Check for logout links or user avatar indicators
      const hasSignOut = !!document.querySelector('a[href*="/sign_out"], a[href*="/logout"]');
      const hasAvatar = !!document.querySelector('.dropdown-avatar, .user-avatar, img[src*="avatar"]');
      
      if (hasSignOut || hasAvatar) {
        return true;
      }
      
      // If we see sign-in links and no logout indicators, we are not logged in
      const hasSignIn = !!document.querySelector('a[href*="/sign_in"], a[href*="/login"]');
      if (hasSignIn) {
        return false;
      }
      
      // Default to false if we are on a login/sign-in page and not sure
      const url = window.location.href;
      if (url.includes('/sign_in') || url.includes('/login')) {
        return false;
      }
      
      return true;
    });
  } catch (err) {
    console.error('⚠️ Lỗi kiểm tra trạng thái đăng nhập:', err.message);
    return false;
  }
}

async function ensureLogin(CONFIG) {
  let hasCookies = fs.existsSync(CONFIG.cookiesFile);
  let needLogin = !hasCookies;

  const contextOptions = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    extraHTTPHeaders: {
      'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    },
  };

  if (hasCookies) {
    console.log('🔍 Kiểm tra hiệu lực của cookies ITViec...');
    const checkBrowser = await chromium.launch({
      headless: CONFIG.headless,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
    
    try {
      const checkContext = await checkBrowser.newContext({
        ...contextOptions,
        storageState: CONFIG.cookiesFile,
      });
      const checkPage = await checkContext.newPage();
      
      // Đi tới trang chủ hoặc trang list để check
      await checkPage.goto(`${CONFIG.baseUrl}?page=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await bypassCloudflare(checkPage);
      
      const loggedIn = await checkLoginState(checkPage);
      if (!loggedIn) {
        console.log('⚠️ Cookies ITViec đã hết hạn hoặc không còn hiệu lực.');
        needLogin = true;
      } else {
        console.log('✅ Cookies ITViec vẫn hoạt động tốt.');
      }
      await checkPage.close();
      await checkContext.close();
    } catch (err) {
      console.log('⚠️ Lỗi khi tải trang kiểm tra ITViec, chuyển sang luồng đăng nhập:', err.message);
      needLogin = true;
    } finally {
      await checkBrowser.close();
    }
  }

  if (needLogin) {
    console.log('\n======================================================================');
    console.log('🔑 ITViec: YÊU CẦU ĐĂNG NHẬP ĐỂ XEM MỨC LƯƠNG');
    console.log('======================================================================');
    console.log('👉 Trình duyệt sẽ mở ở chế độ nổi (headful) để bạn thực hiện đăng nhập.');
    console.log('👉 Vui lòng đăng nhập qua Email/Mật khẩu hoặc Google OAuth.');
    console.log('👉 Sau khi đăng nhập thành công, trình duyệt sẽ tự động đóng lại.');
    console.log('======================================================================\n');

    let loginBrowser;
    try {
      loginBrowser = await chromium.launch({
        headless: false,
        channel: 'chrome', // Dùng Google Chrome chính thức để bypass Google OAuth block
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      });
    } catch (e) {
      console.log('⚠️ Không tìm thấy Google Chrome chính thức, sử dụng Chromium mặc định...');
      loginBrowser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
      });
    }

    try {
      const loginContext = await loginBrowser.newContext(contextOptions);
      const loginPage = await loginContext.newPage();

      await loginPage.goto('https://itviec.com/sign_in', { waitUntil: 'domcontentloaded', timeout: 60000 });
      await bypassCloudflare(loginPage);

      console.log('⌛ Đang đợi bạn đăng nhập trên giao diện...');

      let loggedIn = false;
      // Chờ tối đa 5 phút
      for (let i = 0; i < 150; i++) {
        try {
          const url = loginPage.url();
          if (url.includes('itviec.com')) {
            const isUserLoggedIn = await loginPage.evaluate(() => {
              return !!document.querySelector('a[href*="/sign_out"], a[href*="/logout"], .user-avatar, .dropdown-avatar, img[src*="avatar"]');
            });
            if (isUserLoggedIn) {
              loggedIn = true;
              break;
            }
          }
        } catch (err) {
          // Bỏ qua lỗi cross-origin khi redirect
        }
        await sleep(2000);
      }

      if (loggedIn) {
        console.log('🎉 Đăng nhập ITViec thành công!');
        await sleep(2000); // Chờ thiết lập cookie hoàn chỉnh
        await loginContext.storageState({ path: CONFIG.cookiesFile });
        console.log(`💾 Đã lưu cookies mới vào: ${CONFIG.cookiesFile}`);
      } else {
        console.log('❌ Quá thời gian chờ đăng nhập (5 phút). Sẽ tiếp tục ở chế độ không đăng nhập.');
      }
      
      await loginPage.close();
      await loginContext.close();
    } catch (err) {
      console.error('❌ Lỗi trong luồng đăng nhập:', err.message);
    } finally {
      await loginBrowser.close();
    }
  }
}

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

async function bypassCloudflare(page) {
  const title = await page.title();
  if (title.includes('Just a moment') || title.includes('Cloudflare')) {
    console.log('🛑 Cloudflare challenge, đợi 15s...');
    await sleep(15000);
    try {
      await page.waitForFunction(
        () => !document.title.includes('Just a moment'),
        { timeout: 30000 }
      );
    } catch {
      console.log('⚠️ Cloudflare challenge chưa qua, nhưng tiếp tục...');
    }
  }
}

async function detectTotalPages(page, CONFIG) {
  const total = await page.evaluate(() => {
    const links = document.querySelectorAll('a[href*="page="]');
    let max = 1;
    for (const link of links) {
      const match = link.href.match(/page=(\d+)/);
      if (match) max = Math.max(max, parseInt(match[1]));
    }
    return max;
  });
  return total;
}

async function scrapeListPage(page, pageNum, CONFIG) {
  const url = `${CONFIG.baseUrl}?page=${pageNum}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await bypassCloudflare(page);

  try {
    await page.waitForSelector('h3, [class*="job"]', { timeout: 10000 });
  } catch { }

  const html = await page.content();
  return parseJobList(html);
}

async function scrapeJobDetail(context, job) {
  const page = await context.newPage();
  try {
    await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await bypassCloudflare(page);
    await page.waitForSelector('.col-xl-8.im-0 h1', { timeout: 15000 });
    const html = await page.content();
    return parseJobDetail(html, job);
  } finally {
    await page.close();
  }
}

function createInitialState(STATE_VERSION) {
  return {
    version: STATE_VERSION,
    phase: 'list',
    totalPages: 0,
    allJobs: [],
    completedPages: [],
    detailed: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function loadState(CONFIG, STATE_VERSION) {
  if (!fs.existsSync(CONFIG.stateFile)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
    if (s.version !== STATE_VERSION) {
      console.log(`⚠️ State file version mismatch (${s.version} ≠ ${STATE_VERSION}), bắt đầu lại`);
      return null;
    }
    return s;
  } catch (err) {
    console.log(`⚠️ State file corrupt (${err.message}), bắt đầu lại`);
    return null;
  }
}

function saveState(CONFIG, state) {
  state.updatedAt = new Date().toISOString();
  const tmp = CONFIG.stateFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, CONFIG.stateFile);
}

export async function runScraper() {
  console.time('⏱️ Total time ITViec');
  const STATE_VERSION = 1;

  // Resolve config and paths
  const configOverrides = scrapers.itviec;
  const paths = getPaths('itviec');
  const CONFIG = {
    ...configOverrides,
    ...paths,
  };

  // Ensure directories exist
  fs.mkdirSync(path.dirname(CONFIG.stateFile), { recursive: true });
  fs.mkdirSync(path.dirname(CONFIG.cookiesFile), { recursive: true });
  fs.mkdirSync(path.dirname(CONFIG.outputFile), { recursive: true });

  let state = loadState(CONFIG, STATE_VERSION);
  const resuming = !!state;
  if (resuming) {
    const detailDone = Object.keys(state.detailed).length;
    console.log(
      `📂 Resuming ITViec: phase=${state.phase}, ` +
      `list ${state.completedPages.length}/${state.totalPages || '?'}, ` +
      `detail ${detailDone}/${state.allJobs.length}`
    );
  } else {
    state = createInitialState(STATE_VERSION);
    console.log('🆕 Bắt đầu scrape mới ITViec');
  }

  if (state.phase === 'done') {
    console.log(`\n🔄 Chế độ Incremental Crawl (Delta Crawl) được kích hoạt cho ITViec.`);
    state.phase = 'list';
    state.completedPages = [];
    state.totalPages = 0;
    // GIỮ NGUYÊN state.allJobs và state.detailed để dùng cho việc lọc job cũ
    saveState(CONFIG, state);
  }

  // Ensure we are logged in before starting the main scraper flow
  await ensureLogin(CONFIG);

  const { browser, context } = await setupBrowser(CONFIG);

  let shuttingDown = false;
  const gracefulExit = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n⚠️ ITViec graceful shutdown, saving state...`);
    try { saveState(CONFIG, state); } catch (err) { console.error('State save fail:', err.message); }
    try { await context.storageState({ path: CONFIG.cookiesFile }); } catch { }
    try { await browser.close(); } catch { }
    console.log('💾 State saved.');
  };

  const page = await context.newPage();

  if (!resuming) {
    console.log('🏠 Visiting homepage...');
    await page.goto('https://itviec.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await bypassCloudflare(page);
    await sleep(2000, 4000);
  }

  if (!state.totalPages) {
    console.log('📊 Detecting total pages...');
    await page.goto(`${CONFIG.baseUrl}?page=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await bypassCloudflare(page);

    let totalPages = await detectTotalPages(page, CONFIG);
    if (CONFIG.maxPages) totalPages = Math.min(totalPages, CONFIG.maxPages);
    state.totalPages = totalPages;
    saveState(CONFIG, state);
  }
  console.log(`📊 Total pages: ${state.totalPages}`);

  if (state.phase === 'list') {
    const completedSet = new Set(state.completedPages);
    const seenUrls = new Set(state.allJobs.map(j => j.url));

    for (let p = 1; p <= state.totalPages; p++) {
      if (shuttingDown) break;
      if (completedSet.has(p)) continue;

      console.log(`\n📄 Page ${p}/${state.totalPages}`);
      try {
        const jobs = await scrapeListPage(page, p, CONFIG);
        const newJobs = jobs.filter(j => !seenUrls.has(j.url));
        
        if (jobs.length > 0 && newJobs.length === 0) {
          console.log(`  ✓ Trang ${p} toàn bộ là job cũ. DỪNG CÀO DANH SÁCH (Early Exit)!`);
          state.completedPages.push(p);
          state.totalPages = p; // Dừng cào các trang sau
          saveState(CONFIG, state);
          break;
        }

        newJobs.forEach(j => seenUrls.add(j.url));
        state.allJobs.push(...newJobs);
        state.completedPages.push(p);
        saveState(CONFIG, state);
        console.log(`  ✓ Got ${jobs.length} jobs (${newJobs.length} new, total: ${state.allJobs.length})`);
      } catch (err) {
        console.error(`  ❌ Page ${p} failed: ${err.message}`);
      }

      if (p % 5 === 0) {
        try { await context.storageState({ path: CONFIG.cookiesFile }); } catch {}
      }
      await sleep(1500, 3500);
    }

    const doneSet = new Set(state.completedPages);
    const failed = [];
    for (let p = 1; p <= state.totalPages; p++) {
      if (!doneSet.has(p)) failed.push(p);
    }
    if (failed.length) {
      console.log(`\n⚠️ ${failed.length} page(s) failed. Chạy lại để retry.`);
      await page.close();
      await context.storageState({ path: CONFIG.cookiesFile });
      await browser.close();
      console.timeEnd('⏱️ Total time ITViec');
      return;
    }

    state.phase = 'detail';
    saveState(CONFIG, state);
  }

  await page.close();
  console.log(`\n📊 Total jobs collected: ${state.allJobs.length}`);

  if (state.phase === 'detail') {
    const todo = state.allJobs.filter(j => !state.detailed[j.url]);
    const alreadyDone = state.allJobs.length - todo.length;
    console.log(`\n🔍 Scraping ${todo.length} details (${alreadyDone} done)`);

    const limit = pLimit(CONFIG.detailConcurrency);
    let done = 0;
    let lastSaveAt = 0;

    const tasks = todo.map(job => limit(async () => {
      if (shuttingDown) return;
      try {
        await sleep(500, 1500);
        const detail = await scrapeJobDetail(context, job);
        state.detailed[job.url] = detail;
      } catch (err) {
        console.error(`  ❌ ${job.title.slice(0, 40)}: ${err.message}`);
        state.detailed[job.url] = job;
      }
      done++;
      if (done - lastSaveAt >= CONFIG.saveEvery) {
        saveState(CONFIG, state);
        lastSaveAt = done;
      }
      if (done % 10 === 0) {
        console.log(`  Progress: ${done}/${todo.length} (total: ${Object.keys(state.detailed).length}/${state.allJobs.length})`);
      }
    }));

    await Promise.all(tasks);
    saveState(CONFIG, state);

    state.phase = 'done';
    saveState(CONFIG, state);
  }

  try { await context.storageState({ path: CONFIG.cookiesFile }); } catch {}
  await browser.close();

  const finalJobs = Object.values(state.detailed);
  await saveData('itviec', finalJobs, CONFIG.outputFile);
  console.log(`\n✅ ITViec scraper completed.`);
  console.timeEnd('⏱️ Total time ITViec');
}
