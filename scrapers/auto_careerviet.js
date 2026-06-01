import { BaseHtmlScraper } from './base/BaseHtmlScraper.js';
import * as cheerio from 'cheerio';

class GeneratedHtmlScraper extends BaseHtmlScraper {
  constructor() {
    super('auto_careerviet');
    this.config = {
      ...this.config,
      headless: false,
      concurrency: 3,
      pageDelayMs: [1000, 2000],
      detailDelayMs: [500, 1000],
      startPage: 1
    };
  }

  buildListUrl(pageNum) {
    const baseUrl = 'https://careerviet.vn/viec-lam/tat-ca-viec-lam-vi.html?page=';
    return baseUrl + pageNum;
  }

  async parseJobList(html) {
    const $ = cheerio.load(html);
    try {
      const jobs = [];
      $('.job-item').each((i, el) => {
        const $el = $(el);
        const link = $el.find('a.job_link');
        
        const id = link.attr('data-id');
        const urlAttr = link.attr('href');
        const title = link.attr('title');
        
        if (id && urlAttr && title) {
          const absoluteUrl = urlAttr.startsWith('http') ? urlAttr : `https://careerviet.vn${urlAttr}`;
          let company = $el.find('.company-name').text().trim();
          if (!company) {
             const companyLink = $el.find('.figcaption a[target="_blank"]').not('.job_link').first();
             company = companyLink.text().trim();
          }
          const salary = $el.find('.salary').text().replace('Lương:', '').trim();
          const location = $el.find('.location').text().replace(/\\n/g, ' ').trim();
          const updatedAtFull = $el.find('.time, .date').text().trim();
          
          let updated_at = updatedAtFull;
          const updatedMatch = updatedAtFull.match(/Cập nhật:\s*([\d-]+)/);
          if (updatedMatch) updated_at = updatedMatch[1];

          jobs.push({
            id: id,
            url: absoluteUrl,
            title: title,
            company_name: company,
            salary: salary,
            location: location,
            updated_at: updated_at
          });
        }
      });
      return jobs;
    } catch (err) {
      console.error('Error parsing list:', err);
      return [];
    }
  }

  async parseJobDetail(html, baseData) {
    const $ = cheerio.load(html);
    try {
      const description = $('.detail-row').html() || $('.job-detail-content').html() || '';
      
      const requirements = ''; 
      const benefits = ''; 

      return {
        ...baseData,
        description: description ? description.trim() : null,
        requirements: requirements ? requirements.trim() : null,
        benefits: benefits ? benefits.trim() : null,
      };
    } catch (error) {
      console.error(`\n    ❌ Error parsing detail for ${baseData.url}:`, error.message);
      return baseData;
    }
  }
}

export const runScraper = () => new GeneratedHtmlScraper().run();
