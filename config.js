import path from 'path';

// Base configurations
export const outputDir = 'd:/DataCrawled';
export const stateDir = './state';
export const cookiesDir = './cookies';
export const pipelinesDir = 'C:/Users/Admin/Downloads/pipelines';

// Helper to resolve paths
export function getPaths(name) {
  return {
    outputFile: path.join(outputDir, `${name}-jobs.json`),
    stateFile: path.join(stateDir, `${name}-state.json`),
    cookiesFile: path.join(cookiesDir, `${name}-cookies.json`),
  };
}

export const scrapers = {
  itviec: {
    baseUrl: 'https://itviec.com/it-jobs',
    maxPages: null,        // null to scrape all
    headless: true,
    detailConcurrency: 3,
    saveEvery: 5,
  },
  topcv: {
    apiBase: 'https://job-api.topcv.vn/api/v1/topcv/jobs',
    detailApiBase: 'https://job-api.topcv.vn/api/v1/topcv/jobs/',
    headers: {
      'accept': '*/*',
      'accept-language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
      'hostname': 'jobportal.cmcu.edu.vn',
      'origin': 'https://jobportal.cmcu.edu.vn',
      'referer': 'https://jobportal.cmcu.edu.vn/',
      'user': 'cmc',
      'sec-ch-ua': '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': '"Android"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'cross-site',
      'user-agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36',
    },
    pageSize: 100,
    maxPages: null,
    headless: true,
    saveEvery: 1,
    pageDelayMs: [2000, 4000],
    detailDelayMs: [300, 700],
    concurrency: 5,
  },
  topdev: {
    apiBase: 'https://api.topdev.vn/td/v2/jobs/search/v2',
    apiFields: {
      job: 'id,title,salary,slug,company,expires,extra_skills,skills_str,skills_arr,skills_ids,job_types_str,job_levels_str,job_levels_arr,job_levels_ids,addresses,status_display,detail_url,job_url,salary,published,refreshed,applied,candidate,requirements_arr,packages,benefits,content,features,contract_types_ids,is_free,is_basic,is_basic_plus,is_distinction,level,contract_types_str,experiences_str,benefits_v2,services,job_category_id,responsibilities_original,requirements_original,benefits_original',
      company: 'tagline,addresses,skills_arr,industries_arr,industries_ids,industries_str,image_cover,image_galleries,num_job_openings,company_size,nationalities_str,skills_str,skills_ids,benefits,num_employees',
    },
    locale: 'vi_VN',
    referer: 'https://topdev.vn/jobs/search',
    pageSize: 1000,
    maxPages: null,
    headless: true,
    saveEvery: 5,
    pageDelayMs: [800, 2000],
  },
  mbbank: {
    apiBase: 'https://careers.mbbank.com.vn/libra-job-management/public/recruitment-news',
    detailApiBase: 'https://careers.mbbank.com.vn/libra-job-management/public/recruitment-news/',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'vi-VN,vi;q=0.9',
      'origin': 'https://careers.mbbank.com.vn',
      'referer': 'https://careers.mbbank.com.vn/viec-lam',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    },
    pageSize: 100,
    headless: true,
    pageDelayMs: [2000, 4000],
    detailDelayMs: [300, 700],
    concurrency: 5,
  }
};
