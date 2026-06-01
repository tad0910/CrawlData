import { BaseScraper } from './base/BaseScraper.js';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import * as cheerio from 'cheerio';
import fs from 'fs';

chromium.use(stealth());

class ITViecScraper extends BaseScraper {
  constructor() {
    super('itviec');
    this.stateVersion = 1;
  }

  loadState() {
    let state = {
      version: this.stateVersion,
      phase: 'list',
      totalPages: 0,
      allJobs: [],
      completedPages: [],
      detailed: {},
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isFinished: false
    };
    if (fs.existsSync(this.stateFile)) {
      try {
        const s = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        if (s.version === this.stateVersion) {
          state = s;
          const detailDone = Object.keys(state.detailed).length;
          console.log(
            `📂 Resuming ITViec: phase=${state.phase}, ` +
            `list ${state.completedPages.length}/${state.totalPages || '?'}, ` +
            `detail ${detailDone}/${state.allJobs.length}`
          );
        }
      } catch (err) {}
    }
    return state;
  }

  async ensureLogin() {
    let hasCookies = fs.existsSync(this.config.cookiesFile);
    let needLogin = !hasCookies;

    const contextOptions = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'vi-VN',
      timezoneId: 'Asia/Ho_Chi_Minh',
    };

    if (hasCookies) {
      console.log('🔍 Kiểm tra hiệu lực của cookies ITViec...');
      const checkBrowser = await chromium.launch({ headless: this.config.headless, args: ['--disable-blink-features=AutomationControlled'] });
      try {
        const checkContext = await checkBrowser.newContext({ ...contextOptions, storageState: this.config.cookiesFile });
        const checkPage = await checkContext.newPage();
        await checkPage.goto(`${this.config.baseUrl}?page=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
        const loggedIn = await checkPage.evaluate(() => {
          return !document.querySelector('.sign-in-view-salary') && !!document.querySelector('a[href*="/sign_out"], .user-avatar');
        });
        if (!loggedIn) {
          console.log('⚠️ Cookies ITViec đã hết hạn.');
          needLogin = true;
        } else {
          console.log('✅ Cookies ITViec vẫn hoạt động tốt.');
        }
        await checkPage.close();
        await checkContext.close();
      } catch (err) {
        needLogin = true;
      } finally {
        await checkBrowser.close();
      }
    }

    if (needLogin) {
      console.log('\n======================================================================');
      console.log('🔑 ITViec: YÊU CẦU ĐĂNG NHẬP ĐỂ XEM MỨC LƯƠNG');
      console.log('======================================================================\n');
      
      const loginBrowser = await chromium.launch({ headless: false, channel: 'chrome', args: ['--disable-blink-features=AutomationControlled'] }).catch(async () => {
        return await chromium.launch({ headless: false, args: ['--disable-blink-features=AutomationControlled'] });
      });

      try {
        const loginContext = await loginBrowser.newContext(contextOptions);
        const loginPage = await loginContext.newPage();
        await loginPage.goto('https://itviec.com/sign_in', { waitUntil: 'domcontentloaded', timeout: 60000 });
        
        console.log('⌛ Đang đợi bạn đăng nhập trên giao diện...');
        let loggedIn = false;
        for (let i = 0; i < 150; i++) {
          try {
            if (loginPage.url().includes('itviec.com')) {
              loggedIn = await loginPage.evaluate(() => !!document.querySelector('a[href*="/sign_out"], .user-avatar'));
              if (loggedIn) break;
            }
          } catch (e) {}
          await this.sleep(2000);
        }

        if (loggedIn) {
          console.log('🎉 Đăng nhập ITViec thành công!');
          await this.sleep(2000);
          await loginContext.storageState({ path: this.config.cookiesFile });
        }
        await loginContext.close();
      } finally {
        await loginBrowser.close();
      }
    }
  }

  async setupBrowser() {
    this.browser = await chromium.launch({
      headless: this.config.headless,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });

    const contextOptions = {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
    };

    if (fs.existsSync(this.config.cookiesFile)) {
      contextOptions.storageState = this.config.cookiesFile;
    }

    this.context = await this.browser.newContext(contextOptions);
    return this.context;
  }

  async bypassCloudflare(page) {
    const title = await page.title();
    if (title.includes('Just a moment') || title.includes('Cloudflare')) {
      console.log('🛑 Cloudflare challenge, đợi 15s...');
      await this.sleep(15000);
    }
  }

  parseJobList(html) {
    const $ = cheerio.load(html);
    const jobs = [];
    $('.job-card').each((_, el) => {
      const $el = $(el);
      const slug = $el.attr('data-search--job-selection-job-slug-value');
      const jobKey = $el.attr('data-job-key');
      if (!slug) return;
      jobs.push({
        jobKey, slug,
        title: $el.find('h3[data-search--job-selection-target="jobTitle"]').first().text().trim(),
        url: `https://itviec.com/it-jobs/${slug}`,
        company: $el.find('a[href*="/companies/"]').last().text().trim(),
        salary: $el.find('.salary').first().text().replace(/\s+/g, ' ').trim() || $el.find('.sign-in-view-salary').first().text().trim() || 'Sign in to view salary',
        location: $el.find('.text-rich-grey').map((_, n) => $(n).text().trim()).get().find(t => /Ho Chi Minh|Ha Noi|Da Nang/i.test(t)) || '',
        tags: $el.find('a.itag').map((_, t) => $(t).text().trim()).get().filter(t => t && !/^\+\d+$/.test(t)),
        postedTime: $el.find('.small-text.text-dark-grey').first().text().replace(/\s+/g, ' ').trim(),
      });
    });
    return jobs;
  }

  parseJobDetail(html, baseData) {
    const $ = cheerio.load(html);
    const $scope = $('.col-xl-8.im-0').first().length ? $('.col-xl-8.im-0').first() : $.root();
    const sectionMap = {};
    $scope.find('h2').each((_, h) => {
      const heading = $(h).text().trim();
      let sib = $(h).next();
      const chunks = [];
      while (sib.length && sib[0].tagName !== 'h2') {
        const lis = sib.find('li');
        if (lis.length) chunks.push(lis.map((_, li) => '- ' + $(li).text().trim().replace(/\s+/g, ' ')).get().join('\n'));
        else chunks.push(sib.text().trim().replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n'));
        sib = sib.next();
      }
      sectionMap[heading] = chunks.join('\n\n').trim();
    });

    return {
      ...baseData,
      reasons: sectionMap['Top 3 reasons to join us'] || '',
      jobDescription: sectionMap['Job description'] || '',
      requirements: sectionMap['Your skills and experience'] || '',
      benefits: sectionMap["Why you'll love working here"] || '',
      scrapedAt: new Date().toISOString(),
    };
  }

  async execute() {
    await this.ensureLogin();
    await this.setupBrowser();

    if (this.state.isFinished || this.state.phase === 'done') {
      console.log(`\n🔄 Chế độ Incremental Crawl (Delta Crawl) được kích hoạt cho ITViec.`);
      this.state.phase = 'list';
      this.state.completedPages = [];
      this.state.allJobs = [];
      this.state.detailed = {};
      this.state.isFinished = false;
      this.saveState();
    }

    const page = await this.context.newPage();

    // PHASE 1: LIST
    if (this.state.phase === 'list') {
      console.log('\n--- PHASE 1: Cào danh sách URL ---');
      await page.goto(`${this.config.baseUrl}?page=1`);
      await this.bypassCloudflare(page);
      
      this.state.totalPages = await page.evaluate(() => {
        let max = 1;
        document.querySelectorAll('a[href*="page="]').forEach(l => {
          const m = l.href.match(/page=(\d+)/);
          if (m) max = Math.max(max, parseInt(m[1]));
        });
        return max;
      });

      let pageNum = 1;
      while (pageNum <= this.state.totalPages && !this.shuttingDown) {
        if (!this.state.completedPages.includes(pageNum)) {
          console.log(`📦 Fetching List Page ${pageNum}/${this.state.totalPages}...`);
          await page.goto(`${this.config.baseUrl}?page=${pageNum}`);
          await this.bypassCloudflare(page);
          const jobs = this.parseJobList(await page.content());
          
          if (pageNum === 1 && jobs.length === 0) {
              throw new Error('AUTO_HEAL_REQUIRED: 0 jobs found on page 1. Layout might have changed.');
          }

          const newJobs = jobs.filter(j => !this.state.allJobs.find(exist => exist.jobKey === j.jobKey));
          if (jobs.length > 0 && newJobs.length === 0) {
            console.log(`  ✓ Trang ${pageNum} toàn job cũ, dừng cào danh sách.`);
            this.state.totalPages = pageNum;
            break;
          }
          this.state.allJobs.push(...newJobs);
          this.state.completedPages.push(pageNum);
          this.saveState();
        }
        pageNum++;
      }
      this.state.phase = 'detail';
      this.saveState();
    }

    // PHASE 2: DETAIL
    if (this.state.phase === 'detail') {
      console.log('\n--- PHASE 2: Cào chi tiết từng Job ---');
      const pendingJobs = this.state.allJobs.filter(j => !this.state.detailed[j.jobKey]);
      
      for (let i = 0; i < pendingJobs.length; i++) {
        if (this.shuttingDown) break;
        const job = pendingJobs[i];
        console.log(`⚡ Detail [${i+1}/${pendingJobs.length}]: ${job.title.substring(0,40)}...`);
        try {
          await page.goto(job.url, { timeout: 45000 });
          await this.bypassCloudflare(page);
          this.state.detailed[job.jobKey] = this.parseJobDetail(await page.content(), job);
          this.state.jobsById = this.state.detailed; // Map cho output manager
          this.saveState();
        } catch (err) {
          console.error(`  ❌ Lỗi lấy chi tiết ${job.url}: ${err.message}`);
        }
        await this.sleep(this.config.pageDelayMs[0], this.config.pageDelayMs[1]);
      }
      this.state.phase = 'done';
      this.state.isFinished = true;
      this.saveState();
    }
  }
}

export const runScraper = () => new ITViecScraper().run();
