import { runScraper as runITViec } from './scrapers/itviec.js';
import { runScraper as runTopCV } from './scrapers/topcv.js';
import { runScraper as runTopDev } from './scrapers/topdev.js';
import { runScraper as runMBBank } from './scrapers/mbbank.js';
import { spawn } from 'child_process';
import { outputDir } from './config.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { saveData } from './outputManager.js';
import { startBackupWorker } from './backupWorker.js';
// Code Generator: Removes need for dynamic config and dynamic scraper classes

async function runScraperSafely(name, runFn, fallbackUrl = null) {
  console.log(`\n======================================================================`);
  console.log(`▶️ Starting ${name.toUpperCase()} Scraper...`);
  console.log(`======================================================================`);
  try {
    await runFn();
    console.log(`\n🟢 ${name.toUpperCase()} Scraper finished successfully.`);
  } catch (err) {
    console.error(`\n🔴 ${name.toUpperCase()} Scraper failed:`, err.message);
    if (err.message && err.message.includes('AUTO_HEAL_REQUIRED') && fallbackUrl) {
      console.log(`\n🛠️ [Auto-Healing] Kích hoạt tiến trình tự vá lỗi cho ${name}...`);
      console.log(`   URL Gốc: ${fallbackUrl}`);
      try {
        const { sniffApi } = await import('./scrapers/apiSniffer.js');
        const config = await sniffApi(fallbackUrl);
        console.log(`\n🤖 [Auto-Healing] AI đã sinh xong file Code mới. Đang nạp và chạy file tự sinh...`);
        // Import file vừa sinh và chạy
        const scriptPath = path.join(process.cwd(), config.file);
        const module = await import(`file://${scriptPath}?t=${Date.now()}`); // cache bust
        await module.runScraper();
        console.log(`\n🟢 [Auto-Healing] Hoàn tất vá lỗi và cào xong dữ liệu!`);
      } catch (healErr) {
        console.error(`\n🔴 [Auto-Healing] Vá lỗi thất bại:`, healErr.message);
      }
    }
  }
}



function showHelp() {
  console.log(`
Usage:
  node index.js [scraper_name] | [options]

Options:
  --all        Run all scrapers sequentially (ITViec, TopCV, TopDev, MB Bank, LinkedIn)
  --help, -h   Show this help message

Scrapers:
  itviec       Run ITViec scraper (Node.js)
  topcv        Run TopCV scraper (Node.js)
  topdev       Run TopDev scraper (Node.js)
  mbbank       Run MB Bank scraper (Node.js)

If run without arguments, an interactive menu will be displayed.
  `);
}

async function startInteractiveMenu() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query) => new Promise((resolve) => rl.question(query, resolve));

  while (true) {
    console.log(`
======================================================================
🚀 UNIFIED JOB SCRAPER HUB
======================================================================
1. Run All Scrapers (Sequentially)
2. ITViec Scraper (Node.js)
3. TopCV Scraper (Node.js)
4. TopDev Scraper (Node.js)
5. MB Bank Scraper (Node.js)
6. Run Dynamic Scraper (Auto-Discovered)
7. Clear State (Force Fresh Crawl)
8. Exit
======================================================================`);

    const choice = await question('Choose an option (1-8): ');
    console.log('');

    switch (choice.trim()) {
      case '1':
        console.log('🏁 Starting Run All sequence...');
        await runScraperSafely('itviec', runITViec, 'https://itviec.com/it-jobs');
        await runScraperSafely('topcv', runTopCV, 'https://www.topcv.vn/tim-viec-lam-moi-nhat');
        await runScraperSafely('topdev', runTopDev, 'https://topdev.vn/it-jobs');
        await runScraperSafely('mbbank', runMBBank, 'https://tuyendung.mbbank.com.vn/viec-lam');
        
        // Also run generated scrapers
        const scrapersDir1 = path.join(process.cwd(), 'scrapers');
        const files1 = fs.readdirSync(scrapersDir1).filter(f => f.endsWith('.js') && f.startsWith('auto_'));
        for (const f of files1) {
            const id = f.replace('.js', '');
            const module = await import(`file://${path.join(scrapersDir1, f)}`);
            if (module.runScraper) await runScraperSafely(id, module.runScraper);
        }
        console.log('\n🏁 Run All sequence completed!');
        break;
      case '2':
        await runScraperSafely('itviec', runITViec, 'https://itviec.com/it-jobs');
        break;
      case '3':
        await runScraperSafely('topcv', runTopCV, 'https://www.topcv.vn/tim-viec-lam-moi-nhat');
        break;
      case '4':
        await runScraperSafely('topdev', runTopDev, 'https://topdev.vn/it-jobs');
        break;
      case '5':
        await runScraperSafely('mbbank', runMBBank, 'https://tuyendung.mbbank.com.vn/viec-lam');
        break;
      case '6':
        const scrapersDir = path.join(process.cwd(), 'scrapers');
        const files = fs.readdirSync(scrapersDir).filter(f => f.endsWith('.js') && f.startsWith('auto_'));
        if (files.length === 0) {
            console.log('ℹ️ Chưa có Scraper tự động nào được sinh ra.');
        } else {
            console.log('\n--- CÁC SCRAPER TỰ ĐỘNG ---');
            files.forEach((f, idx) => console.log(`${idx + 1}. ${f.replace('.js', '')}`));
            const sChoice = await question('Chọn số để chạy (hoặc Enter để chạy tất cả): ');
            if (!sChoice.trim()) {
                for (const f of files) {
                    const id = f.replace('.js', '');
                    const module = await import(`file://${path.join(scrapersDir, f)}`);
                    if (module.runScraper) await runScraperSafely(id, module.runScraper);
                }
            } else {
                const selected = files[parseInt(sChoice) - 1];
                if (selected) {
                    const id = selected.replace('.js', '');
                    const module = await import(`file://${path.join(scrapersDir, selected)}`);
                    if (module.runScraper) await runScraperSafely(id, module.runScraper);
                } else {
                    console.log('❌ Lựa chọn không hợp lệ.');
                }
            }
        }
        break;
      case '7':
        console.log('\n🧹 Clearing state files to force fresh crawl...');
        const stateDir = path.join(process.cwd(), 'state');
        if (fs.existsSync(stateDir)) {
          fs.readdirSync(stateDir).forEach(f => fs.unlinkSync(path.join(stateDir, f)));
          console.log('✅ State cleared successfully! You can now start a fresh crawl.');
        } else {
          console.log('ℹ️ No state directory found. Already fresh.');
        }
        break;
      case '8':
        console.log('Goodbye!');
        rl.close();
        return;
      default:
        console.log('❌ Invalid option, please choose between 1 and 8.');
    }
  }
}

async function main() {
  startBackupWorker();
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await startInteractiveMenu();
    return;
  }

  const arg = args[0].toLowerCase();

  switch (arg) {
    case '--all':
      console.log('🏁 Starting Run All sequence...');
      await runScraperSafely('itviec', runITViec, 'https://itviec.com/it-jobs');
      await runScraperSafely('topcv', runTopCV, 'https://www.topcv.vn/tim-viec-lam-moi-nhat');
      await runScraperSafely('topdev', runTopDev, 'https://topdev.vn/it-jobs');
      await runScraperSafely('mbbank', runMBBank, 'https://tuyendung.mbbank.com.vn/viec-lam');
      console.log('\n🏁 Run All sequence completed!');
      break;
    case 'itviec':
      await runScraperSafely('itviec', runITViec, 'https://itviec.com/it-jobs');
      break;
    case 'topcv':
      await runScraperSafely('topcv', runTopCV, 'https://www.topcv.vn/tim-viec-lam-moi-nhat');
      break;
    case 'topdev':
      await runScraperSafely('topdev', runTopDev, 'https://topdev.vn/it-jobs');
      break;
    case 'mbbank':
      await runScraperSafely('mbbank', runMBBank, 'https://tuyendung.mbbank.com.vn/viec-lam');
      break;

    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      // Load dynamically generated script if it exists
      const scraperPath = path.join(process.cwd(), 'scrapers', `${args[0]}.js`);
      if (fs.existsSync(scraperPath)) {
        try {
          const module = await import(`file://${scraperPath}`);
          if (module.runScraper) {
             await runScraperSafely(args[0], module.runScraper);
             break;
          }
        } catch(err) {
          console.error(`Error loading ${scraperPath}:`, err.message);
        }
      }
      
      console.log(`Unknown argument: ${args[0]}`);
      showHelp();
      process.exit(1);
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('💥 Fatal error in main runner:', err);
  process.exit(1);
});
