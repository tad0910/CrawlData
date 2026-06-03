import { BaseScraper } from './BaseScraper.js';
import fs from 'fs';
import path from 'path';

export class BaseApiScraper extends BaseScraper {
  constructor(name) {
    super(name);
    this.requestCtx = null;
  }

  // Abstract methods to be implemented by child
  buildListUrl(pageNum) { throw new Error('Not implemented'); }
  buildDetailUrl(jobId) { throw new Error('Not implemented'); }
  extractItemsFromListRes(json) { return json; } // Default assumes root is array
  normalizeJob(listData, detailData) { throw new Error('Not implemented'); }

  async fetchWithRetry(url, maxRetries = 4) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const res = await this.requestCtx.get(url, { headers: this.config.headers, timeout: 60000 });
        if (res.ok()) return res;

        if (res.status() === 429) {
          const wait = 30000 + i * 15000;
          console.log(`\n    ⚠️ Rate limit (429), waiting ${wait/1000}s before retry ${i+1}/${maxRetries}...`);
          await this.sleep(wait);
        } else if (res.status() === 404 || res.status() === 401 || res.status() === 403) {
          console.log(`\n    ⚠️ HTTP ${res.status()} - No retry for client errors.`);
          throw new Error(`HTTP ${res.status()}`);
        } else {
          console.log(`\n    ⚠️ HTTP ${res.status()}, retrying ${i+1}/${maxRetries}...`);
          await this.sleep(5000);
        }
      } catch (err) {
        if (err.message.includes('HTTP 404') || err.message.includes('HTTP 401') || err.message.includes('HTTP 403')) {
          throw err;
        }
        const wait = 5000 * (i + 1);
        console.log(`\n    ⚠️ Connection error: ${err.message}. Waiting ${wait/1000}s... (retry ${i+1}/${maxRetries})`);
        await this.sleep(wait);
      }
    }
    throw new Error(`Failed after ${maxRetries} retries fetching ${url}`);
  }

  async fetchJobsPage(pageNum) {
    const url = this.buildListUrl(pageNum);
    const res = await this.fetchWithRetry(url);
    const json = await res.json();
    return this.extractItemsFromListRes(json) || [];
  }

  async fetchJobDetail(jobId) {
    if (!this.buildDetailUrl) return {};
    try {
      const url = this.buildDetailUrl(jobId);
      if (!url) return {};
      const res = await this.fetchWithRetry(url, 2);
      const json = await res.json();
      
      const scratchDir = path.join(process.cwd(), 'scratch');
      if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir);
      fs.writeFileSync(path.join(scratchDir, `${this.name}_last_detail.json`), JSON.stringify(json, null, 2));

      return json.success ? json.data : (json.data || json); // Handle topcv/mbbank diff
    } catch (err) {
      return null;
    }
  }

  async fetchDetailsInParallel(items) {
    const results = [];
    const queue = [...items];
    const total = items.length;
    let count = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        try {
          count++;
          process.stdout.write(`\r    ⚡ Detail progress: ${count}/${total} jobs...`);
          const detail = await this.fetchJobDetail(item.id);
          results.push(this.normalizeJob(item, detail || {}));
        } catch (err) {
          results.push(this.normalizeJob(item, {}));
        }
        await this.sleep(this.config.detailDelayMs[0], this.config.detailDelayMs[1]);
      }
    };

    await Promise.all(Array(this.config.concurrency || 3).fill(null).map(worker));
    process.stdout.write('\n');
    return results;
  }

  async execute() {
    const context = await this.setupBrowser();
    this.requestCtx = context.request;

    let pageNum = Math.max(0, this.state.lastCheckedPage > 0 ? this.state.lastCheckedPage : (this.config.startPage || 1));

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
            throw new Error('AUTO_HEAL_REQUIRED: 0 jobs found on page 1. API structure might have changed.');
          }
          console.log(`  ✓ Page ${pageNum} is empty. Finished scraping!`);
          this.state.isFinished = true;
          break;
        }

        let newItems = items.filter(item => !this.state.jobsById[item.id]);

        if (process.env.TEST_MODE === 'true') {
          console.log('\n  🧪 [TEST MODE] Giới hạn số lượng cào chi tiết: 2 jobs để phản hồi nhanh chóng.');
          newItems = newItems.slice(0, 2);
        }

        if (items.length > 0 && newItems.length === 0) {
          console.log(`  ✓ Trang ${pageNum} toàn bộ là job cũ. DỪNG CÀO DANH SÁCH (Early Exit)!`);
          this.state.completedPages.push(pageNum);
          this.state.isFinished = true;
          break;
        }

        if (newItems.length > 0) {
          const detailedJobs = await this.fetchDetailsInParallel(newItems);
          for (const job of detailedJobs) {
            this.state.jobsById[job.id] = job;
          }
          console.log(`  ✓ +${detailedJobs.length} jobs (total unique: ${Object.keys(this.state.jobsById).length})`);
        } else {
          console.log(`  ✓ All ${items.length} jobs already in state, skipping.`);
        }

        this.state.completedPages.push(pageNum);
        this.state.lastCheckedPage = pageNum;
        this.saveState();
        console.log('  💾 State saved.');

        if (process.env.TEST_MODE === 'true') {
          console.log('\n  🧪 [TEST MODE] Đã chạy xong 1 trang. Dừng Test.');
          break;
        }

        if (items.length < (this.config.pageSize || 10)) {
          console.log(`  ✓ Page ${pageNum} has less than max items. Finished scraping!`);
          this.state.isFinished = true;
          break;
        }

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
