import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';
import { scrapers, getPaths } from '../../config.js';
import { saveData } from '../../outputManager.js';

chromium.use(stealth());

export class BaseScraper {
  constructor(name) {
    this.name = name;
    this.config = { ...scrapers[name], ...getPaths(name) };
    this.stateFile = this.config.stateFile;
    this.outputFile = this.config.outputFile;
    this.stateVersion = 1;
    this.state = this.loadState();
    this.browser = null;
    this.context = null;
    this.shuttingDown = false;
  }

  sleep(min, max = min) {
    return new Promise(r => setTimeout(r, min + Math.random() * (max - min)));
  }

  loadState() {
    let state = { version: this.stateVersion, completedPages: [], jobsById: {}, lastCheckedPage: -1, isFinished: false };
    if (fs.existsSync(this.stateFile)) {
      try {
        state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        const done = state.completedPages.length;
        console.log(`📂 Resuming ${this.name.toUpperCase()}: ${done} pages done, ${Object.keys(state.jobsById).length} jobs in state`);
      } catch (err) {
        console.error(`Error loading state for ${this.name}:`, err);
      }
    }
    return state;
  }

  saveState() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    const tmp = this.stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    fs.renameSync(tmp, this.stateFile);
  }

  async setupBrowser() {
    const userDataDir = path.join(process.cwd(), `browser_data_${this.name}`);
    this.context = await chromium.launchPersistentContext(userDataDir, {
      headless: this.config.headless,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true
    });
    return this.context;
  }

  async closeBrowser() {
    if (this.context) {
      try { await this.context.close(); } catch {}
    }
  }

  async gracefulExit() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    console.log(`\n⚠️ ${this.name.toUpperCase()} graceful shutdown, saving state...`);
    this.saveState();
    const jobs = Object.values(this.state.jobsById);
    await saveData(this.name, jobs, this.outputFile);
    await this.closeBrowser();
  }

  async run() {
    console.time(`⏱️ Total time ${this.name.toUpperCase()}`);
    console.log(`🚀 Starting ${this.name.toUpperCase()} Scraper...`);

    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });

    if (this.state.isFinished) {
      console.log(`\n🔄 Chế độ Incremental Crawl (Delta Crawl) được kích hoạt cho ${this.name.toUpperCase()}.`);
      this.state.isFinished = false;
      this.state.completedPages = [];
      this.state.lastCheckedPage = -1;
      this.saveState();
    }

    try {
      await this.execute();
    } catch (err) {
      console.error(`❌ Error in ${this.name} scraper:`, err);
    } finally {
      if (!this.shuttingDown) {
        await this.gracefulExit();
      }
      console.timeEnd(`⏱️ Total time ${this.name.toUpperCase()}`);
    }
  }

  // To be implemented by subclasses
  async execute() {
    throw new Error('execute() must be implemented by subclass');
  }
}
