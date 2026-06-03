import { BaseHtmlScraper } from './base/BaseHtmlScraper.js';
import * as cheerio from 'cheerio';

class GeneratedHtmlScraper extends BaseHtmlScraper {
  constructor() {
    super('auto_careerviet');
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
          const location = $el.find('.location').text().replace(/\n/g, ' ').trim();
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
      // Refactored getDetailSectionContent for robustness in finding sibling content elements
      const getDetailSectionContent = ($, titleMatches, contentSelectors) => {
        let sectionContentHtml = null;
        const lowerCaseTitleMatches = titleMatches.map(m => m.toLowerCase());

        $('h2.detail-title').each((i, h2El) => { // Added .detail-title to target specific H2s
          const $h2 = $(h2El);
          const h2Text = $h2.text().trim();

          if (lowerCaseTitleMatches.some(match => h2Text.toLowerCase().includes(match))) {
            // Found a matching H2. Now try to find its content using the provided selectors.
            for (const selector of contentSelectors) {
              let $contentEl = $h2.next(selector); // Try immediate next sibling
              
              if ($contentEl.length === 0) {
                $contentEl = $h2.nextAll(selector).first(); // Try subsequent siblings
              }

              if ($contentEl.length > 0) {
                const htmlContent = $contentEl.html();
                if (htmlContent) {
                  const textContent = cheerio.load(htmlContent).text().trim();
                  // Content must be substantial to be considered valid
                  if (textContent.length > 20) { 
                    sectionContentHtml = htmlContent;
                    return false; // Found meaningful content, stop iterating h2s
                  }
                }
              }
            }
          }
        });
        return sectionContentHtml;
      };

      // Apply the refactored function with appropriate titles and content selectors
      const description = getDetailSectionContent($, 
        ['Mô tả Công việc', 'Mô tả'], 
        ['div'] // Changed to 'div' as per HTML structure
      );
      const requirements = getDetailSectionContent($, 
        ['Yêu Cầu Công Việc', 'Yêu cầu'], 
        ['div'] // Changed to 'div' as per HTML structure
      );
      const benefits = getDetailSectionContent($, 
        ['Phúc lợi', 'Quyền lợi', 'Thông tin khác'], 
        ['ul.welfare-list'] // Changed to 'ul.welfare-list' as per HTML structure
      );

      return {
        ...baseData,
        description: description ? description.trim() : null,
        requirements: requirements ? requirements.trim() : null,
        benefits: benefits ? benefits.trim() : null
      };
    } catch (error) {
      console.error(`\n    ❌ Error parsing detail for ${baseData.url}:`, error.message);
      return baseData;
    }
  }
}

export const runScraper = () => new GeneratedHtmlScraper().run();