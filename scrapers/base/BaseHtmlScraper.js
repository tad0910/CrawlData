import { BaseScraper } from './BaseScraper.js';
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

chromium.use(stealth());

export class BaseHtmlScraper extends BaseScraper {
  constructor(name) {
    super(name);
    this.page = null;
  }

  // Abstract methods
  buildListUrl(pageNum) { throw new Error('Not implemented'); }
  async parseJobList(html) { throw new Error('Not implemented'); }
  async parseJobDetail(html, baseData) { throw new Error('Not implemented'); }

  async navigateWithRetry(url, maxRetries = 4) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        if (response && !response.ok() && response.status() >= 500) {
          throw new Error(`Server returned HTTP ${response.status()}`);
        }
        // Handle Cloudflare check if needed
        const isCloudflare = await this.page.$('text=cloudflare').catch(() => null);
        if (isCloudflare) {
          console.log('\n    ⚠️ Cloudflare detected, waiting 15s...');
          await this.sleep(15000);
        }
        await this.sleep(3000); // Wait for client-side rendering (React/Vue)
        return await this.page.content();
      } catch (err) {
        console.log(`\n    ⚠️ Navigation error to ${url}, retrying ${i+1}/${maxRetries}...`);
        await this.sleep(5000 * (i + 1));
      }
    }
    throw new Error(`Failed to navigate to ${url}`);
  }

  async fetchJobsPage(pageNum) {
    const url = this.buildListUrl(pageNum);
    const html = await this.navigateWithRetry(url);
    return await this.parseJobList(html);
  }

  async fetchDetailsInParallel(items) {
    // For HTML scraping, to avoid being blocked easily, we might want to do it sequentially 
    // or with very low concurrency using new pages.
    const results = [];
    const queue = [...items];
    const total = items.length;
    let count = 0;

    const worker = async () => {
      const detailPage = await this.context.newPage();
      while (queue.length > 0) {
        const item = queue.shift();
        try {
          count++;
          process.stdout.write(`\r    ⚡ Detail progress: ${count}/${total} jobs...`);
          
          let detail = null;
          for (let i = 0; i < 3; i++) {
            try {
              let detailUrl = item.url;
              if (detailUrl && detailUrl.startsWith('/')) {
                 const currentUrl = new URL(this.page.url());
                 detailUrl = currentUrl.origin + detailUrl;
              } else if (detailUrl && detailUrl.startsWith('//')) {
                 detailUrl = 'https:' + detailUrl;
              }
              item.url = detailUrl; // Lưu lại URL hoàn chỉnh

              await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
              const html = await detailPage.content();
              detail = await this.parseJobDetail(html, item);
              break;
            } catch (err) {
              await this.sleep(5000);
            }
          }
          results.push(detail || item);
        } catch (err) {
          results.push(item);
        }
        await this.sleep(this.config.detailDelayMs[0], this.config.detailDelayMs[1]);
      }
      await detailPage.close();
    };

    await Promise.all(Array(this.config.concurrency || 2).fill(null).map(worker));
    process.stdout.write('\n');
    return results;
  }

  async execute() {
    await this.setupBrowser();
    this.page = await this.context.newPage();

    let pageNum = Math.max(0, this.state.lastCheckedPage > 0 ? this.state.lastCheckedPage : (this.config.startPage || 1));
    let consecutiveOldPages = 0;

    while (!this.shuttingDown) {
      if (this.state.completedPages.includes(pageNum)) {
        pageNum++;
        continue;
      }

      console.log(`\n📦 Fetching Page ${pageNum}...`);
      try {
        const items = await this.fetchJobsPage(pageNum);

        if (items.length === 0) {
          if (pageNum === (this.config.startPage || 1)) {
            throw new Error('AUTO_HEAL_REQUIRED: 0 jobs found on page 1. Layout might have changed.');
          }
          console.log(`  ✓ Page ${pageNum} is empty. Finished scraping!`);
          this.state.isFinished = true;
          break;
        }

        const newItems = items.filter(item => !this.state.jobsById[item.id || item.jobKey]);

        if (items.length > 0 && newItems.length === 0) {
          consecutiveOldPages++;
          console.log(`  ✓ Trang ${pageNum} toàn bộ là job cũ (hoặc trùng lặp). (${consecutiveOldPages}/3)`);
          this.state.completedPages.push(pageNum);
          if (consecutiveOldPages >= 3) {
            console.log(`  🛑 Đã gặp 3 trang liên tiếp toàn job cũ. DỪNG CÀO!`);
            this.state.isFinished = true;
            break;
          }
        } else {
          consecutiveOldPages = 0;
        }

        if (newItems.length > 0) {
          const detailedJobs = await this.fetchDetailsInParallel(newItems);
          for (const job of detailedJobs) {
            this.state.jobsById[job.id || job.jobKey] = job;
          }
          console.log(`  ✓ +${detailedJobs.length} jobs (total unique: ${Object.keys(this.state.jobsById).length})`);
        } else {
          console.log(`  ✓ All ${items.length} jobs already in state, skipping.`);
        }

        this.state.completedPages.push(pageNum);
        this.state.lastCheckedPage = pageNum;
        this.saveState();
        console.log('  💾 State saved.');

        pageNum++;
      } catch (err) {
        console.error(`  ❌ Page ${pageNum} failed: ${err.message}`);
        break;
      }

      if (!this.shuttingDown) {
        await this.sleep(this.config.pageDelayMs[0], this.config.pageDelayMs[1]);
      }
    }
  }
}
