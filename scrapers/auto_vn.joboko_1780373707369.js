import { BaseHtmlScraper } from './base/BaseHtmlScraper.js';
import * as cheerio from 'cheerio';

class GeneratedHtmlScraper extends BaseHtmlScraper {
  constructor() {
    super('auto_vn.joboko_1780373707369');
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
    const baseUrl = 'https://vn.joboko.com/tim-viec-lam?page=';
    return baseUrl + pageNum;
  }

  async parseJobList(html) {
    const $ = cheerio.load(html);
    try {
      const jobs = [];
      
      $('a[href*="/viec-lam-"][href*="-xvi"]').each((i, el) => {
          const $link = $(el);
          let jobUrl = $link.attr('href');
          let title = '';
      
          // Attempt to extract title, removing the 'HOT' span if present
          const innerSpan = $link.find('span.fz-15.fw-semi-bold.line-clamp-2');
          if (innerSpan.length) {
              title = innerSpan.clone().find('span.hot').remove().end().text().trim();
          } else {
              // Fallback for titles directly in the <a> tag (like in nw-grid-job-list)
              title = $link.text().trim();
          }
      
          // Remove any remaining 'HOT' text that might not have been in a span
          title = title.replace(/HOT\s*/g, '').trim();
      
          // Attempt to get ID from data-jid on parent .item
          let id = $link.closest('div.item').attr('data-jid');
      
          // If not found, extract from URL
          if (!id && jobUrl) {
              const match = jobUrl.match(/-xvi(\d+)$/);
              id = match ? match[1] : null;
          }
      
          if (id && jobUrl && title) {
              jobs.push({ id: id, url: jobUrl, title: title });
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
      const job_title_raw = $('h1.nw-company-hero__title').text().trim();
      const job_title = job_title_raw.replace(/ - \[.*?\]$/, '').trim(); // Remove bracketed info like [Long An Cũ - Tây Ninh Mới]
      const company_name_raw = $('h2 a.nw-company-hero__text').text().trim();
      const company_name = company_name_raw.replace('Xác thực cấp độ 2', '').trim(); // Remove verify button text
      
      const company_logo = $('.nw-company-hero__logo img').attr('src') || null;
      
      // Locations
      const locations = $('.nw-company-hero__address a').map((i, el) => $(el).text().trim()).get();
      
      // Deadline (ISO 8601 format)
      const deadline = $('.nw-company-hero__date em.item-date').attr('data-value') || null;
      
      // Salary
      const salary = $('.block-entry .item:contains("Thu nhập:") .item-content span.fw-bold').text().trim() || null;
      
      // Job Type
      const job_type = $('.block-entry .item:contains("Loại hình:") .item-content span.fw-bold').text().trim() || null;
      
      // Level (Chức vụ)
      const level = $('.block-entry .item:contains("Chức vụ:") .item-content span.fw-bold').text().trim() || null;
      
      // Keywords/Tags
      const keywords = $('.block-tags a').map((i, el) => $(el).text().trim()).get();
      
      // Description (HTML content)
      const description_html = $('.block-text h3:contains("Mô tả công việc")').next('.job-desc').html() || null;
      
      // Requirements (HTML content)
      const requirements_html = $('.block-text h3:contains("Yêu cầu")').next('.job-requirement').html() || null;
      
      // Benefits (HTML content, job-specific)
      const benefits_html = $('.block-text h3:contains("Quyền lợi")').next('.job-benefit').html() || null;
      
      // Company Introduction (HTML content)
      const company_introduction_html = $('#gioi-thieu-cong-ty .nw-job-detail__text').html() || null;
      
      // Company Size
      const company_size = $('#gioi-thieu-cong-ty .nw-job-detail__heading:contains("Quy mô công ty")').next('.nw-job-detail__text').text().trim() || null;
      
      // Company Address (from sidebar)
      const company_address = $('.nw-sidebar-company__address span').text().replace('Địa chỉ công ty:', '').trim() || null;
      
      // Company Perks/Benefits (from sidebar, general company benefits)
      const company_sidebar_benefits = $('.nw-sidebar-company__benefit .scroll-box li .item-content span').map((i, el) => $(el).text().trim()).get();
      
      // Fields not directly available as separate structured elements, often embedded in description/requirements
      const experience = null; // Often found within job-requirement text
      const education = null; // Often found within job-requirement text
      const gender = null;
      const age = null;
      const industries = null; // Keywords provide some industry context, but no single 'industry' field.
      
      return {
          ...baseData,
          job_title,
          company_name,
          company_logo,
          locations,
          deadline,
          salary,
          job_type,
          level,
          keywords,
          description: description_html,
          requirements: requirements_html,
          benefits: benefits_html,
          company_introduction: company_introduction_html,
          company_size,
          company_address,
          company_sidebar_benefits,
          experience,
          education,
          gender,
          age,
          industries
      };
    } catch (err) {
      console.error('Error parsing detail:', err);
      return baseData;
    }
  }
}

export const runScraper = () => new GeneratedHtmlScraper().run();
