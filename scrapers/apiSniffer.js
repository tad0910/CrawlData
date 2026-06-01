import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import fs from 'fs';
import path from 'path';

chromium.use(stealth());

// CONFIG_FILE and JSON saving removed in favor of JS Generation
const AI_MODEL = 'gpt-4o-mini';
const GEMINI_MODEL = 'gemini-2.5-flash';

async function callOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set in .env');

  const url = `https://api.openai.com/v1/chat/completions`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI API error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  let text = json.choices?.[0]?.message?.content || '{}';
  
  // Clean markdown backticks if returned in response text
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  }
  
  try {
    return JSON.parse(text.trim());
  } catch (parseError) {
    console.error('[Sniffer] JSON parse error of AI response:', parseError);
    console.error('[Sniffer] Raw response text:', text);
    throw parseError;
  }
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in .env');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  let text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  
  text = text.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  }
  
  try {
    return JSON.parse(text.trim());
  } catch (parseError) {
    console.error('[Sniffer] JSON parse error of AI response:', parseError);
    console.error('[Sniffer] Raw response text:', text);
    throw parseError;
  }
}

async function callAI(prompt, aiProvider) {
  if (aiProvider === 'gemini') {
    return await callGemini(prompt);
  } else {
    return await callOpenAI(prompt);
  }
}

const API_PROMPT = `
You are an expert Javascript Data Engineer.
I intercepted a JSON API response from a job recruitment website. I need to map it to my standard schema.
Here is the JSON response:
{API_RESPONSE}

Write a Javascript function body (NO wrapper function, just the code that goes INSIDE the function) that takes two arguments: 'listData' (the job object from the list API) and 'detailData' (the job object from the detail API, if available, otherwise it's empty).
Return an object matching exactly this schema:
{
  id: string,
  title: string,
  company: string,
  salary: string,
  location: string,
  description: string,
  requirements: string,
  benefits: string,
  tags: array of strings
}
Use detailData if the field exists there, otherwise use listData. Clean up HTML tags if necessary using a simple regex.

IMPORTANT: Return ONLY a valid JSON object with a single key "code" containing the raw javascript string. Example:
{ "code": "const raw = detailData.id ? detailData : listData; return { id: raw.id, title: raw.name ... };" }
`;

const HTML_PROMPT = `
You are an expert Javascript Web Scraper using Cheerio.
This job recruitment website does NOT have a public API. We must scrape its HTML.
Here is a simplified version of its HTML DOM:
{HTML_CONTENT}

Write TWO Javascript function bodies (NO wrapper function). 
1. listParserCode: takes '$' (cheerio) and returns an array of job objects (must have at least 'id', 'url', and 'title'). 
   - CRITICAL: Read the HTML carefully! Do NOT hallucinate classes like '.job-card' or '.job-title' if they do not exist in the HTML provided!
   - Often jobs are just <a> tags with '/job/' or '/career/' in their href. If so, parse those <a> tags.
   - Example: $('a[href*=\"/job/\"]').each(...)
2. detailParserCode: takes '$' (cheerio) and 'baseData', returns a complete job object combining baseData with scraped details (description, requirements, etc.).

Return ONLY a valid JSON object:
{
  "listParserCode": "const jobs = []; $('.job-card').each(...); return jobs;",
  "detailParserCode": "const desc = $('.desc').text(); return { ...baseData, description: desc };"
}
`;

function getApiScore(json) {
  let bestArray = null;
  let bestScore = -1;

  const scoreArray = (arr) => {
    if (!Array.isArray(arr) || arr.length === 0 || typeof arr[0] !== 'object' || arr[0] === null) return 0;
    const sample = arr[0];
    const keys = Object.keys(sample).map(k => k.toLowerCase());
    let score = 0;

    const jobIndicators = [
      'salary', 'minsalary', 'maxsalary', 'salaryshowtype', 'mucluong', 'luong',
      'workingaddresses', 'address_detail', 'location', 'noilamviec', 'diachi', 'xaphuong',
      'requirement', 'requirements', 'experience', 'workexperience', 'kinhnghiem', 'yeucau', 'trachnhiem',
      'benefit', 'benefits', 'jobdescription', 'desc', 'mota', 'nhiemvu', 'quyenhan', 'phucloi',
      'companyname', 'companyid', 'doanhnghiep', 'hannop', 'ngayhethan'
    ];
    
    const hasTitle = keys.some(k => k.includes('title') || k.includes('name') || k.includes('position') || k.includes('tencongviec') || k.includes('tieude') || k.includes('chucdanh'));
    const hasCompany = keys.some(k => k.includes('company') || k.includes('employer') || k.includes('congty') || k.includes('doanhnghiep') || k === 'ten');
    
    // Bắt buộc phải có title hoặc name
    if (!hasTitle) return 0;
    
    let indicatorCount = 0;
    for (const ind of jobIndicators) {
      if (keys.some(k => k.includes(ind))) {
        indicatorCount++;
      }
    }

    // Nếu không có company và cũng không có bất kỳ field đặc thù nào của Job -> Loại (Score = 0)
    if (!hasCompany && indicatorCount === 0) return 0;

    score += indicatorCount * 5;
    if (hasTitle) score += 5;
    if (hasCompany) score += 10;

    score += Math.min(arr.length, 10);
    return score;
  };

  if (Array.isArray(json)) {
    const score = scoreArray(json);
    if (score > bestScore) {
      bestScore = score;
      bestArray = json;
    }
  } else if (typeof json === 'object' && json !== null) {
    for (const key of Object.keys(json)) {
      if (Array.isArray(json[key])) {
        const score = scoreArray(json[key]);
        if (score > bestScore) {
          bestScore = score;
          bestArray = json[key];
        }
      }
    }
  }

  return { score: bestScore, array: bestArray };
}

async function sniffApi(url, skipLoginCheck = false, aiProvider = 'openai', forceLogin = false) {
  const context = await chromium.launchPersistentContext(path.resolve(process.cwd(), 'browser_data'), { 
    headless: !forceLogin, 
    args: ['--disable-blink-features=AutomationControlled'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true
  });
  const page = context.pages()[0] || await context.newPage();

  const interceptedApis = [];

  page.on('response', async (response) => {
    try {
      if (response.request().method() === 'OPTIONS') return;
      const contentType = response.headers()['content-type'] || '';
      
      if (contentType.includes('application/json')) {
        const json = await response.json().catch(() => null);
        if (!json) return;

        const { score, array } = getApiScore(json);
        if (score > 5) {
          interceptedApis.push({
            url: response.request().url(),
            method: response.request().method(),
            headers: response.request().headers(),
            sampleJson: json,
            score: score
          });
        }
      }
    } catch (e) {}
  });

  console.log(`[Sniffer] Navigating to ${url}...`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  
  // Wait a bit more for SPA to load
  await new Promise(r => setTimeout(r, 5000));

  // SPA Fallback (Smart Wait)
  let bodyTextLength = await page.evaluate(() => document.body.innerText.length);
  if (bodyTextLength < 1000) {
      console.log(`[Sniffer] ⚠️ Content very short (${bodyTextLength} chars). Detected potential SPA lazy load. Forcing scroll and wait...`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 5000));
  }

  let resultType = 'HTML';
  let bestApi = null;
  let pageContent = '';

  if (interceptedApis.length > 0) {
    resultType = 'API';
    // Sort by score descending, tie break by totalRecords
    interceptedApis.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        
        const getTotal = (json) => {
            if (!json) return 0;
            let obj = Array.isArray(json) ? json[0] : json;
            if (!obj) return 0;
            return obj.totalRecords || obj.TotalRecords || obj.total || obj.Total || obj.count || obj.Count || 0;
        };
        
        return getTotal(b.sampleJson) - getTotal(a.sampleJson);
    });
    bestApi = interceptedApis[0];
    console.log(`[Sniffer] 🎉 Found valid JSON API: ${bestApi.url} (Score: ${bestApi.score})`);
  } else {
    console.log(`[Sniffer] ⚠️ No API found. Falling back to HTML mode.`);
    pageContent = await page.evaluate(() => document.body.innerHTML);
    // Strict DOM Minification to save tokens and improve AI accuracy
    pageContent = pageContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    pageContent = pageContent.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    pageContent = pageContent.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
    pageContent = pageContent.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
    pageContent = pageContent.replace(/<!--[\s\S]*?-->/g, ''); // Remove comments
    // Take a substring if too large (GPT-4o-mini max is 128k tokens ~ 500k chars)
    if (pageContent.length > 400000) pageContent = pageContent.substring(0, 400000);
    
    // Auto-Login Detection
    if (!skipLoginCheck) {
        const innerText = await page.evaluate(() => document.body.innerText.toLowerCase());
        const loginKeywords = [
            'đăng nhập để xem', 
            'login to view', 
            'sign in to see', 
            'vui lòng đăng nhập', 
            'đăng nhập để ứng tuyển'
        ];
        
        if (forceLogin || loginKeywords.some(kw => innerText.includes(kw))) {
            if (forceLogin) {
                console.log(`[Sniffer] ⚠️ Người dùng yêu cầu bắt buộc đăng nhập!`);
            } else {
                console.log(`[Sniffer] ⚠️ Phát hiện trang web yêu cầu đăng nhập để xem thông tin chi tiết!`);
            }
            console.log(`[Sniffer] 🚀 Đang khởi động cửa sổ Đăng nhập Tự động...`);
            
            await context.close();
            
            const loginContext = await chromium.launchPersistentContext(path.resolve(process.cwd(), 'browser_data'), { 
                headless: false,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 },
                ignoreHTTPSErrors: true
            });
            const loginPage = loginContext.pages()[0] || await loginContext.newPage();
            await loginPage.goto(url);
            
            // Inject floating UI
            await loginPage.evaluate(() => {
                const div = document.createElement('div');
                div.innerHTML = `
                    <div style="position: fixed; top: 0; left: 0; width: 100%; padding: 20px; background: #ff4757; color: white; text-align: center; z-index: 9999999; font-family: sans-serif; font-size: 18px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
                        Hệ thống AI phát hiện trang web này yêu cầu đăng nhập. 
                        <br>Vui lòng đăng nhập tài khoản của bạn. Sau khi đăng nhập thành công, hãy bấm vào nút bên dưới:
                        <br><br>
                        <button id="ai-login-done" style="padding: 10px 24px; font-size: 20px; font-weight: bold; cursor: pointer; background: white; color: #ff4757; border: none; border-radius: 8px;">TÔI ĐÃ ĐĂNG NHẬP XONG</button>
                    </div>
                `;
                document.body.appendChild(div);
                
                document.getElementById('ai-login-done').addEventListener('click', () => {
                    window.aiLoginCompleted = true;
                    div.innerHTML = '<h2 style="color: white; margin:0; padding: 20px;">Đang xử lý tiếp tục... Vui lòng chờ!</h2>';
                });
            });
            
            console.log(`[Sniffer] ⏳ Đang chờ bạn đăng nhập và bấm nút xác nhận trên trình duyệt... (Tối đa 5 phút)`);
            try {
                await loginPage.waitForFunction('window.aiLoginCompleted === true', { timeout: 300000 });
                console.log(`[Sniffer] ✅ Đăng nhập thành công! Đã lưu Session.`);
            } catch (err) {
                console.log(`[Sniffer] ❌ Quá giờ (Timeout) hoặc bị lỗi. Sẽ thử cào ẩn danh...`);
            }
            
            await loginContext.close();
            
            // Restart sniffApi with skipLoginCheck = true
            console.log(`[Sniffer] 🔄 Đang tự động quét lại trang bằng phiên đăng nhập mới...`);
            return await sniffApi(url, true);
        }
    }
  }

  const domain = new URL(url).hostname.replace('www.', '').replace(/\.[^/.]+$/, "");
  const scraperId = `auto_${domain}_${Date.now()}`;

  const model = null; // replaced by callOpenAI()
  
  if (resultType === 'API') {
    console.log(`[Sniffer] 🧠 API Scraper selected. Asking AI to generate JSON Mapper for Vietnamese fields...`);

    const listUrlUrl = new URL(bestApi.url);
    for (const [key, val] of listUrlUrl.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('size') || lowerKey.includes('limit') || lowerKey.includes('offset')) continue;
      if (val === '1' || val === '0' || lowerKey === 'page' || lowerKey === 'p' || lowerKey === 'pageindex' || lowerKey === 'pagenumber') {
        listUrlUrl.searchParams.set(key, '{page}');
      }
    }

    // Lấy một item mẫu từ JSON
    let sampleItem = bestApi.sampleJson;
    if (Array.isArray(sampleItem) && sampleItem.length > 0) sampleItem = sampleItem[0];
    else if (typeof sampleItem === 'object') {
        for (const k of Object.keys(sampleItem)) {
            if (Array.isArray(sampleItem[k]) && sampleItem[k].length > 0) {
                sampleItem = sampleItem[k][0];
                break;
            }
        }
    }

    const API_PROMPT = `
You are an expert Javascript Web Scraper.
We intercepted a JSON response from a Job List API (The keys are likely in Vietnamese).
API URL: ${bestApi.url}
Sample Job JSON:
${JSON.stringify(sampleItem).substring(0, 3000)}

Your task is to generate Javascript code for two functions:
1. 'normalizeJobCode': A function body that takes 'listData' (a job object from the JSON above) and 'detailData' (if fetched later). It must return an object with standard English keys: 'job_title', 'company_name', 'description', 'requirements', 'benefits', 'salary', 'experience', 'location', 'deadline'. You MUST map the Vietnamese keys (like tenCongViec, nhiemVu, mucLuong...) to these English keys! Include an 'id' and 'url' if you can infer them.
2. 'buildDetailUrlCode': A function body that takes 'jobId' and returns the URL string for the detail API. ONLY write this if you are 100% certain based on standard REST patterns (like /api/jobs -> /api/jobs/{id}). For custom/non-standard URLs (like /CongBoNguoiSdLaoDong/TatCa), DO NOT GUESS. You MUST return "return null;" to prevent 404 errors.

CRITICAL: Output ONLY a valid JSON object with the keys "normalizeJobCode" and "buildDetailUrlCode". NO markdown!
Example JSON:
{
  "normalizeJobCode": "const title = listData.tenCongViec || listData.title || '';\\nreturn { ...listData, job_title: title };",
  "buildDetailUrlCode": "return \`https://api.example.com/jobs/\${jobId}\`;"
}
`;

    let aiResult;
    try {
        console.log(`[Sniffer] 🤖 Requesting AI for API Mapper...`);
        aiResult = await callAI(API_PROMPT, aiProvider);
    } catch (e) {
        console.error(`[Sniffer] ⚠️ AI Failed to generate API Mapper: ${e.message}. Using fallback.`);
        aiResult = {
            normalizeJobCode: "return { ...listData, ...detailData, id: detailData.id || listData.id || `job_${Math.random().toString(36).substr(2, 9)}`, scrapedAt: new Date().toISOString() };",
            buildDetailUrlCode: "return null;"
        };
    }

    const scriptContent = `import { BaseApiScraper } from './base/BaseApiScraper.js';

class GeneratedApiScraper extends BaseApiScraper {
  constructor() {
    super('${scraperId}');
    this.config = {
      ...this.config,
      headless: true,
      concurrency: 3,
      pageDelayMs: [2000, 4000],
      detailDelayMs: [1000, 2000],
      startPage: 1
    };
  }

  buildListUrl(pageNum) {
    return \`${listUrlUrl.toString().replace(/%7Bpage%7D|{page}/gi, '${pageNum}')}\`;
  }

  buildDetailUrl(jobId) {
    ${aiResult.buildDetailUrlCode || 'return null;'}
  }

  extractItemsFromListRes(json) {
    const searchArray = (obj) => {
      if (Array.isArray(obj)) return obj;
      if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          if (Array.isArray(obj[key]) && obj[key].length > 0) return obj[key];
        }
      }
      return [];
    };
    return searchArray(json);
  }

  normalizeJob(listData, detailData = {}) {
    ${aiResult.normalizeJobCode}
  }
}

export const runScraper = () => new GeneratedApiScraper().run();
`;
    fs.writeFileSync(path.join(process.cwd(), 'scrapers', `${scraperId}.js`), scriptContent);
    console.log(`[Sniffer] 💾 Saved new API Scraper Script: scrapers/${scraperId}.js`);
    
    await context.close().catch(()=>{});
    return { id: scraperId, type: 'API', file: `scrapers/${scraperId}.js` };

  } else {
    console.log(`[Sniffer] 🧠 HTML Scraper selected. Asking AI to generate HTML Parsers (List Only) with Self-Correction...`);
    
    let listParserCode = null;
    let detailParserCode = null;
    
    let attempt = 0;
    const maxAttempts = 3;
    const cheerio = await import('cheerio');
    let currentPrompt = HTML_PROMPT.replace('{HTML_CONTENT}', pageContent);
    
    while (attempt < maxAttempts) {
        attempt++;
        console.log(`[Sniffer] 🤖 Requesting AI (Attempt ${attempt}/${maxAttempts}) using provider: ${aiProvider}...`);
        try {
            const aiResponse = await callAI(currentPrompt, aiProvider);
            listParserCode = aiResponse.listParserCode;

            console.log(`[Sniffer] 🕵️ Testing listParserCode locally...`);
            const $ = cheerio.load(pageContent);
            const listFn = new Function('$', 'cheerio', listParserCode);
            const jobs = listFn($, cheerio);
            
            // Strict Validation
            let isValid = true;
            let validationError = "";
            if (!Array.isArray(jobs) || jobs.length === 0) {
                isValid = false;
                validationError = "Code trả về mảng rỗng hoặc không phải là mảng.";
            } else {
                for (let i = 0; i < jobs.length; i++) {
                    const job = jobs[i];
                    if (!job.url || !job.title) {
                        isValid = false;
                        validationError = `Phần tử thứ ${i} thiếu thuộc tính bắt buộc (url hoặc title). Object: ${JSON.stringify(job)}`;
                        break;
                    }
                }
            }
            
            if (isValid) {
                console.log(`[Sniffer] ✅ listParserCode success & validated! Found ${jobs.length} jobs.`);
                
                // Navigate to detail page
                let detailUrl = jobs[0].url;
                if (detailUrl.startsWith('/')) {
                    const urlObj = new URL(url);
                    detailUrl = urlObj.origin + detailUrl;
                } else if (detailUrl.startsWith('//')) {
                    detailUrl = 'https:' + detailUrl;
                }
                
                console.log(`[Sniffer] 🌐 Navigating to detail page: ${detailUrl}`);
                const detailPage = await context.newPage();
                await detailPage.goto(detailUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
                await new Promise(r => setTimeout(r, 3000));
                
                let detailHtml = await detailPage.evaluate(() => document.body.innerHTML).catch(() => '');
                
                let isBlocked = detailHtml.includes('cf-wrapper') || detailHtml.includes('cloudflare-') || (detailHtml.includes('Just a moment') && detailHtml.includes('challenge'));
                
                // Thử đợi Cloudflare tự giải quyết (JS Challenge) trong 15s
                if (isBlocked) {
                    console.log(`[Sniffer] ⏳ Phát hiện Cloudflare. Đang chờ hệ thống tự động giải quyết (tối đa 15s)...`);
                    await detailPage.waitForFunction(() => {
                        const html = document.body.innerHTML;
                        return !(html.includes('cf-wrapper') || html.includes('cloudflare-') || (html.includes('Just a moment') && html.includes('challenge')));
                    }, { timeout: 15000 }).catch(() => {});
                    
                    detailHtml = await detailPage.evaluate(() => document.body.innerHTML).catch(() => '');
                    isBlocked = detailHtml.includes('cf-wrapper') || detailHtml.includes('cloudflare-') || (detailHtml.includes('Just a moment') && detailHtml.includes('challenge'));
                }
                
                if (isBlocked && forceLogin) {
                    console.log(`[Sniffer] ⚠️ Trang chi tiết bị Cloudflare chặn! Đang chờ bạn giải quyết Captcha trên trình duyệt... (Tối đa 30s)`);
                    await detailPage.waitForFunction(() => {
                        const html = document.body.innerHTML;
                        return !(html.includes('cf-wrapper') || html.includes('cloudflare-') || (html.includes('Just a moment') && html.includes('challenge')));
                    }, { timeout: 30000 }).catch(() => {});
                    detailHtml = await detailPage.evaluate(() => document.body.innerHTML).catch(() => '');
                    isBlocked = detailHtml.includes('cf-wrapper') || detailHtml.includes('cloudflare-') || (detailHtml.includes('Just a moment') && detailHtml.includes('challenge'));
                }
                
                if (isBlocked) {
                    await detailPage.close();
                    throw new Error("Trang chi tiết bị Cloudflare chặn trong quá trình AI phân tích! Hãy thử lại và tích chọn 'Bắt buộc Đăng nhập trước khi AI quét' để giải quyết Captcha.");
                }
                
                await detailPage.close();

                detailHtml = detailHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
                detailHtml = detailHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
                detailHtml = detailHtml.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '');
                detailHtml = detailHtml.replace(/<!--[\s\S]*?-->/g, '');
                if (detailHtml.length > 400000) detailHtml = detailHtml.substring(0, 400000);
                
                const DETAIL_PROMPT = `
You are an expert Javascript Web Scraper using Cheerio.
I have scraped the HTML of a job detail page from a recruitment website.
HTML:
${detailHtml}

Write a Javascript function body (NO wrapper function, just the code inside) that takes '$' (cheerio) and 'baseData' (object from list page).
It should aggressively extract as many job details as possible from the page. This includes but is not limited to:
'description', 'requirements', 'benefits', 'location', 'salary', 'experience', 'education', 'job_type', 'level', 'industries', 'deadline', 'company_name', 'company_size', 'gender', 'age', and any other useful metadata.
Clean the HTML of description/requirements/benefits before extracting if necessary. Return a combined object.
CRITICAL: You are generating Javascript code. You must output the code as a string value for the key "detailParserCode" in the JSON response.

Example:
const job_title = $('.title').text().trim();
const company_name = $('.company').text().trim();
const desc = $('.job-description').html();
const reqs = $('.requirements').html();
const benefits = $('.benefits').html();
const salary = $('.salary').text().trim();
const experience = $('.experience').text().trim();
const location = $('.location').text().trim();
const deadline = $('.deadline').text().trim();
return { ...baseData, job_title, company_name, description: desc, requirements: reqs, benefits, salary, experience, location, deadline };

Return ONLY a valid JSON object:
{ "detailParserCode": "..." }`;
                console.log(`[Sniffer] 🧠 Asking AI to generate HTML Parsers (Detail Only)...`);
                try {
                    const detailAiResponse = await callAI(DETAIL_PROMPT, aiProvider);
                    if (detailAiResponse && detailAiResponse.detailParserCode) {
                        detailParserCode = detailAiResponse.detailParserCode;
                        console.log(`[Sniffer] 🎉 Successfully generated detailParserCode from actual detail page!`);
                    } else {
                        throw new Error(`AI response missing detailParserCode. Response: ${JSON.stringify(detailAiResponse)}`);
                    }
                } catch (detailErr) {
                    console.error(`[Sniffer] ⚠️ Error generating detailParserCode: ${detailErr.message}`);
                    throw new Error(`AI Failed to generate Detail Parser: ${detailErr.message}`);
                }
                break; // Escape while loop on success
            } else {
                console.log(`[Sniffer] ⚠️ Validation Failed: ${validationError}. Asking AI to try again...`);
                currentPrompt += `\\n\\nCRITICAL ERROR IN PREVIOUS ATTEMPT: Your previous listParserCode failed strict validation: ${validationError}. Please fix your logic to return an array of {title, url} objects.`;
            }
        } catch (err) {
            console.error(`[Sniffer] ⚠️ Error during Attempt ${attempt}: ${err.message}. Retrying...`);
            if (err.message.includes('429') && attempt < maxAttempts) {
                console.log(`[Sniffer] ⏳ Rate limit hit! Waiting 20 seconds before retrying...`);
                await new Promise(r => setTimeout(r, 20000));
            }
            currentPrompt += `\\n\\nCRITICAL ERROR IN PREVIOUS ATTEMPT: Your previous code threw this error: ${err.message}. Please fix it.`;
        }
    }
    
    if (!listParserCode || !detailParserCode) {
        throw new Error("AI failed to generate valid List or Detail parsers after " + maxAttempts + " attempts.");
    }

    const scriptContent = `import { BaseHtmlScraper } from './base/BaseHtmlScraper.js';
import * as cheerio from 'cheerio';

class GeneratedHtmlScraper extends BaseHtmlScraper {
  constructor() {
    super('${scraperId}');
    this.config = {
      ...this.config,
      headless: true,
      concurrency: 3,
      pageDelayMs: [1000, 2000],
      detailDelayMs: [500, 1000],
      startPage: 1
    };
  }

  buildListUrl(pageNum) {
    const baseUrl = '${url.includes('?') ? url + '&page=' : url + '?page='}';
    return baseUrl + pageNum;
  }

  async parseJobList(html) {
    const $ = cheerio.load(html);
    try {
      ${listParserCode.split('\n').join('\n      ')}
    } catch (err) {
      console.error('Error parsing list:', err);
      return [];
    }
  }

  async parseJobDetail(html, baseData) {
    const $ = cheerio.load(html);
    try {
      ${detailParserCode.split('\n').join('\n      ')}
    } catch (err) {
      console.error('Error parsing detail:', err);
      return baseData;
    }
  }
}

export const runScraper = () => new GeneratedHtmlScraper().run();
`;
    fs.writeFileSync(path.join(process.cwd(), 'scrapers', `${scraperId}.js`), scriptContent);
    console.log(`[Sniffer] 💾 Saved new HTML Scraper Script: scrapers/${scraperId}.js`);

    await context.close();
    return { id: scraperId, type: 'HTML', file: `scrapers/${scraperId}.js` };
  }
}

export { sniffApi };
