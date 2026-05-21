import { runScraper as runITViec } from './scrapers/itviec.js';
import { runScraper as runTopCV } from './scrapers/topcv.js';
import { runScraper as runTopDev } from './scrapers/topdev.js';
import { runScraper as runMBBank } from './scrapers/mbbank.js';
import { spawn } from 'child_process';
import { pipelinesDir, outputDir } from './config.js';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

async function runScraperSafely(name, runFn) {
  console.log(`\n======================================================================`);
  console.log(`▶️ Starting ${name.toUpperCase()} Scraper...`);
  console.log(`======================================================================`);
  try {
    await runFn();
    console.log(`\n🟢 ${name.toUpperCase()} Scraper finished successfully.`);
  } catch (err) {
    console.error(`\n🔴 ${name.toUpperCase()} Scraper failed:`, err);
  }
}

async function runLinkedInScraper() {
  console.log(`\n======================================================================`);
  console.log(`▶️ Starting LINKEDIN Scraper (Python)...`);
  console.log(`======================================================================`);

  return new Promise((resolve) => {
    console.log(`📂 Working Directory: ${pipelinesDir}`);
    console.log(`⚡ Command: py -m app.pipelines.jobs.run_all --stages bronze --sources linkedin`);

    const pyProcess = spawn('py', ['-m', 'app.pipelines.jobs.run_all', '--stages', 'bronze', '--sources', 'linkedin'], {
      cwd: pipelinesDir,
      shell: true,
      stdio: 'inherit'
    });

    pyProcess.on('close', (code) => {
      if (code === 0) {
        console.log(`\n🟢 LINKEDIN Python crawler completed successfully.`);
        try {
          const todayUTC = new Date().toISOString().split('T')[0];
          const sourceFile = path.join(pipelinesDir, 'data', 'bronze', 'jobs', `dt=${todayUTC}`, 'linkedin.json');
          const destFile = path.join(outputDir, 'linkedin.json');

          if (fs.existsSync(sourceFile)) {
            fs.mkdirSync(path.dirname(destFile), { recursive: true });
            fs.copyFileSync(sourceFile, destFile);
            console.log(`🔄 [linkedin] Synced output file successfully:`);
            console.log(`   From: ${sourceFile}`);
            console.log(`   To:   ${destFile}`);
          } else {
            console.warn(`⚠️ [linkedin] Warning: Output file not found at ${sourceFile}`);
          }
        } catch (err) {
          console.error(`❌ [linkedin] Error syncing output file:`, err.message);
        }
      } else {
        console.error(`\n🔴 LINKEDIN Python crawler exited with code ${code}`);
      }
      resolve();
    });

    pyProcess.on('error', (err) => {
      console.error(`\n🔴 Failed to start Python process:`, err.message);
      console.log(`ℹ️ Hãy kiểm tra xem Python đã được cấu hình trong PATH và cài đặt thư viện 'jobspy' chưa.`);
      resolve();
    });
  });
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
  linkedin     Run LinkedIn scraper (Python)

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
6. LinkedIn Scraper (Python)
7. Exit
======================================================================`);

    const choice = await question('Choose an option (1-7): ');
    console.log('');

    switch (choice.trim()) {
      case '1':
        console.log('🏁 Starting Run All sequence...');
        await runScraperSafely('itviec', runITViec);
        await runScraperSafely('topcv', runTopCV);
        await runScraperSafely('topdev', runTopDev);
        await runScraperSafely('mbbank', runMBBank);
        await runLinkedInScraper();
        console.log('\n🏁 Run All sequence completed!');
        break;
      case '2':
        await runScraperSafely('itviec', runITViec);
        break;
      case '3':
        await runScraperSafely('topcv', runTopCV);
        break;
      case '4':
        await runScraperSafely('topdev', runTopDev);
        break;
      case '5':
        await runScraperSafely('mbbank', runMBBank);
        break;
      case '6':
        await runLinkedInScraper();
        break;
      case '7':
        console.log('Goodbye!');
        rl.close();
        return;
      default:
        console.log('❌ Invalid option, please choose between 1 and 7.');
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await startInteractiveMenu();
    return;
  }

  const arg = args[0].toLowerCase();

  switch (arg) {
    case '--all':
      console.log('🏁 Starting Run All sequence...');
      await runScraperSafely('itviec', runITViec);
      await runScraperSafely('topcv', runTopCV);
      await runScraperSafely('topdev', runTopDev);
      await runScraperSafely('mbbank', runMBBank);
      await runLinkedInScraper();
      console.log('\n🏁 Run All sequence completed!');
      break;
    case 'itviec':
      await runScraperSafely('itviec', runITViec);
      break;
    case 'topcv':
      await runScraperSafely('topcv', runTopCV);
      break;
    case 'topdev':
      await runScraperSafely('topdev', runTopDev);
      break;
    case 'mbbank':
      await runScraperSafely('mbbank', runMBBank);
      break;
    case 'linkedin':
      await runLinkedInScraper();
      break;
    case '--help':
    case '-h':
      showHelp();
      break;
    default:
      console.log(`Unknown argument: ${args[0]}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('💥 Fatal error in main runner:', err);
  process.exit(1);
});
