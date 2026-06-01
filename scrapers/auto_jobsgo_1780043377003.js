import { BaseHtmlScraper } from './base/BaseHtmlScraper.js';
import * as cheerio from 'cheerio';

class GeneratedHtmlScraper extends BaseHtmlScraper {
  constructor() {
    super('auto_jobsgo_1780043377003');
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
    const baseUrl = 'https://jobsgo.vn/viec-lam-tai-ha-noi.html?page=';
    return baseUrl + pageNum;
  }

  async parseJobList(html) {
    const $ = cheerio.load(html);
    try {
      const jobs = [];
      $('.job-list .job-card').each((index, element) => {
        const $element = $(element);
        const jobLink = $element.find('.job-title a');
        const locationSalaryDiv = $element.find('.mt-1.text-primary.fw-semibold.small');
        const badgeContainer = $element.find('.d-flex.flex-wrap.gap-1.small');
      
        const id = $element.data('id');
        const title = jobLink.text().trim();
        const url = jobLink.attr('href');
        const company_name = $element.find('.company-title').text().trim();
        const salary = locationSalaryDiv.find('span:nth-of-type(1)').text().trim();
        const location = locationSalaryDiv.find('span:nth-of-type(3)').text().trim();
        const job_type = badgeContainer.find('span[title="Loại hình"]').text().trim();
        const experience = badgeContainer.find('span[title="Yêu cầu kinh nghiệm"]').text().trim();
        const updated_at = badgeContainer.find('span[title="Thời gian cập nhật"]').text().trim();
      
        jobs.push({
          id: id,
          url: url,
          title: title,
          company_name: company_name,
          salary: salary,
          location: location,
          job_type: job_type,
          experience: experience,
          updated_at: updated_at
        });
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
      const isCloudflareBlocked = $('#cf-wrapper').length > 0 && $('h1[data-translate="block_headline"]').text().trim() === 'Sorry, you have been blocked';
      
      if (isCloudflareBlocked) {
        const cloudflareRayId = $('.cf-error-footer strong.font-semibold').text().trim();
        // The IP address is often revealed by a user action, but we can still try to extract if present in the HTML
        const yourIp = $('#cf-footer-ip').text().trim();
        const blockReasonHeadline = $('h2[data-translate="blocked_why_headline"]').text().trim();
        const blockReasonDetail = $('p[data-translate="blocked_why_detail"]').text().trim();
      
        return {
          ...baseData,
          isBlocked: true,
          blockSource: "Cloudflare",
          blockHeadline: $('h1[data-translate="block_headline"]').text().trim(),
          blockSubheadline: $('.cf-subheadline').text().trim(),
          cloudflareRayId: cloudflareRayId,
          yourIp: yourIp,
          blockReasonHeadline: blockReasonHeadline,
          blockReasonDetail: blockReasonDetail
        };
      }
      
      // If not blocked, proceed to extract job details
      const job_title = $('.job-detail-title').text().trim() || $('h1.title').text().trim() || $('.job-overview h2').text().trim();
      const company_name = $('.company-name').text().trim() || $('.employer-info .name').text().trim() || $('.company-profile h3').text().trim();
      const location = $('.job-location').text().trim() || $('.job-address').text().trim() || $('.location-info').text().trim();
      const salary = $('.job-salary').text().trim() || $('.salary-range').text().trim() || $('.job-info-salary').text().trim();
      const experience = $('.job-experience').text().trim() || $('.experience-required').text().trim() || $('.job-criteria .experience').text().trim();
      const education = $('.job-education').text().trim() || $('.education-level').text().trim() || $('.job-criteria .education').text().trim();
      const job_type = $('.job-type').text().trim() || $('.job-employment-type').text().trim() || $('.job-info-type').text().trim();
      const level = $('.job-level').text().trim() || $('.career-level').text().trim() || $('.job-criteria .level').text().trim();
      const deadline = $('.job-deadline').text().trim() || $('.application-deadline').text().trim() || $('.job-info-deadline').text().trim();
      const company_size = $('.company-size').text().trim() || $('.company-profile .size').text().trim();
      const gender = $('.job-gender').text().trim() || $('.job-criteria .gender').text().trim();
      const age = $('.job-age').text().trim() || $('.job-criteria .age').text().trim();
      
      // Description, Requirements, Benefits - often multi-line HTML content
      // Returning raw HTML as cleaning often requires specific rules beyond simple text extraction
      const description = $('#job-description').html() || $('.description-content').html() || $('.job-details-description').html();
      const requirements = $('#job-requirements').html() || $('.requirements-content').html() || $('.job-details-requirements').html();
      const benefits = $('#job-benefits').html() || $('.benefits-content').html() || $('.job-details-benefits').html();
      
      // Industries - could be a list or single text
      let industries = [];
      $('.job-industries .industry-item, .job-industries li').each((i, el) => {
        const industryText = $(el).text().trim();
        if (industryText) industries.push(industryText);
      });
      // Fallback for single industry text directly in the container
      if (industries.length === 0) {
          const singleIndustry = $('.job-industries').text().trim();
          if (singleIndustry) industries.push(singleIndustry);
      }
      
      // Any other useful metadata - e.g., published date, views
      const published_date = $('.job-published-date').text().trim() || $('.job-post-date').text().trim();
      const views_count = $('.job-views-count').text().trim() || $('.job-stats .views').text().trim();
      const applicants_count = $('.job-applicants-count').text().trim() || $('.job-stats .applicants').text().trim();
      const contact_person = $('.contact-person').text().trim();
      
      return {
        ...baseData,
        job_title,
        company_name,
        description,
        requirements,
        benefits,
        location,
        salary,
        experience,
        education,
        job_type,
        level,
        industries: industries.length > 0 ? industries : null, // Store as array or null if empty
        deadline,
        company_size,
        gender,
        age,
        published_date,
        views_count,
        applicants_count,
        contact_person,
        isBlocked: false // Explicitly state not blocked if it reached this part
      };
      
    } catch (err) {
      console.error('Error parsing detail:', err);
      return baseData;
    }
  }
}

export const runScraper = () => new GeneratedHtmlScraper().run();
