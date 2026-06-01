import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scrapers = ['auto_careerlink_1779981038508', 'auto_careerviet'];

console.log('🚀 Starting FULL crawl for CareerLink and CareerViet...');

scrapers.forEach(name => {
  console.log(`Starting ${name}...`);
  const child = exec(`node index.js ${name}`, { cwd: __dirname });
  
  child.stdout.on('data', data => {
    // Only print summary lines to avoid spam
    if (data.includes('✓ +') || data.includes('Fetching Page') || data.includes('Saved')) {
      process.stdout.write(`[${name}] ${data}`);
    }
  });
  
  child.stderr.on('data', data => {
    process.stderr.write(`[${name} ERR] ${data}`);
  });
  
  child.on('close', code => {
    console.log(`✅ [${name}] exited with code ${code}`);
  });
});
