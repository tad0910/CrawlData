import { BaseHtmlScraper } from './base/BaseHtmlScraper.js';
import * as cheerio from 'cheerio';

class GeneratedHtmlScraper extends BaseHtmlScraper {
  constructor() {
    super('auto_iconicjob_1780022995740');
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
    const baseUrl = 'https://iconicjob.vn/viec-lam/tim-viec-lam?page=';
    return baseUrl + pageNum;
  }

  async parseJobList(html) {
    const $ = cheerio.load(html);
    try {
      const jobs = [];
      // Look for <a> tags that link to specific job pages.
      // Based on the search form action URL "https://iconicjob.vn/viec-lam/tim-viec-lam",
      // individual job listings are likely under "/viec-lam/" but not the search page itself,
      // and probably not internal anchor links (#).
      $('a[href*="/viec-lam/"]').each((i, el) => {
        const url = $(el).attr('href');
        // Ensure it's a specific job URL, not the search page, an anchor link, or a general category link.
        // A typical job URL would be like /viec-lam/ten-cong-viec-12345
        if (url && !url.includes('/tim-viec-lam') && !url.includes('#') && url !== '/viec-lam/') {
          const absoluteUrl = url.startsWith('http') ? url : `https://iconicjob.vn${url}`;
          const title = $(el).text().trim();
          // Attempt to extract a numeric ID from the URL, assuming a pattern like /job-slug-12345 or /job-slug/12345
          const idMatch = absoluteUrl.match(/-(\d+)$/) || absoluteUrl.match(/\/(\d+)$/);
          const id = idMatch ? idMatch[1] : null;
      
          // Only add to jobs if we have a valid title and URL, and the link looks like a job link
          // (e.g., it's not just a parent category link like /viec-lam/ itself)
          // This logic relies on the assumption that specific job links will have unique titles
          // and often an ID in the URL structure, differing from simple navigation links.
          // Without actual job listing HTML, this is an educated guess based on common job board structures.
          if (title && absoluteUrl.length > 'https://iconicjob.vn/viec-lam/'.length && !['Tìm việc làm', 'Việc làm tiếng Nhật', 'Việc làm mới nhất', 'Việc làm lương cao'].includes(title)) {
            jobs.push({
              id: id,
              url: absoluteUrl,
              title: title
            });
          }
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
      // Xóa các thẻ rác gây nhiễu
      $('script, style, link, meta, noscript, svg, header, footer, nav, img, iframe').remove();
      const textContent = $('body').text().replace(/\s+/g, ' ').trim();
      const cleanHtml = $('body').html();
      return { ...baseData, textContent: textContent, cleanHtml: cleanHtml };
    } catch (err) {
      console.error('Error parsing detail:', err);
      return baseData;
    }
  }
}

export const runScraper = () => new GeneratedHtmlScraper().run();
