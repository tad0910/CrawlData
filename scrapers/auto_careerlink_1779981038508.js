import { BaseHtmlScraper } from './base/BaseHtmlScraper.js';
import * as cheerio from 'cheerio';

class GeneratedHtmlScraper extends BaseHtmlScraper {
  constructor() {
    super('auto_careerlink_1779981038508');
    this.config = {
      ...this.config,
      headless: true,
      concurrency: 5,
      pageDelayMs: [1000, 2000],
      detailDelayMs: [500, 1000],
      startPage: 1
    };
  }

  buildListUrl(pageNum) {
    const baseUrl = 'https://www.careerlink.vn/viec-lam/cntt-phan-mem/19?page=';
    return baseUrl + pageNum;
  }

  async parseJobList(html) {
    const $ = cheerio.load(html);
    try {
      const jobs = [];
      $('li.list-group-item.job-item').each((index, element) => {
        const $el = $(element);
        const jobLink = $el.find('a.job-link');
        const jobId = $el.find('button.save-btn').data('job-id');
        const title = jobLink.attr('title') ? jobLink.attr('title').trim() : $el.find('h5.job-name').text().trim();
        const url = jobLink.attr('href');
        const company = $el.find('a.job-company').text().trim();

        const locations = [];
        $el.find('div.job-location .list-with-comma a.text-reset').each((i, locEl) => {
          locations.push($(locEl).attr('title').trim());
        });

        const salary = $el.find('span.job-salary').text().trim();
        const updatedTime = $el.find('.job-update-time span.cl-datetime').text().trim();
        const positionLevel = $el.find('a.job-position').text().trim();

        jobs.push({
          id: jobId ? jobId.toString() : null,
          url: url,
          title: title,
          company: company,
          locations: locations,
          salary: salary,
          updatedTime: updatedTime,
          positionLevel: positionLevel
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
      const result = { ...baseData };

      // Job Title
      result.job_title = $('#job-title').text().trim();

      // Company Name
      result.company_name = $('.org-name a span').text().trim();

      // Description
      const descriptionElement = $('#section-job-description .rich-text-content');
      result.description = descriptionElement.length ? descriptionElement.html().trim() : null;

      // Requirements
      const requirementsElement = $('#section-job-skills .rich-text-content');
      result.requirements = requirementsElement.length ? requirementsElement.html().trim() : null;

      // Benefits
      const benefits = [];
      $('#section-job-benefits .job-benefit-item span').each((i, el) => {
        const benefitText = $(el).text().trim();
        if (benefitText) {
          benefits.push(benefitText);
        }
      });
      result.benefits = benefits.length ? benefits.join('; ') : null;

      // Location
      const locationElement = $('#job-location');
      result.location = locationElement.length ? locationElement.text().trim() : null;

      // Salary
      const salaryElement = $('#job-salary .text-primary');
      result.salary = salaryElement.length ? salaryElement.text().trim() : null;

      // Experience
      const experienceElement = $('.job-overview .cli-suitcase-simple').parent().find('span');
      result.experience = experienceElement.length ? experienceElement.text().trim() : null;

      // Job Type
      const jobTypeElement = $('#job-summary .job-summary-item:has(.fa-inbox) .font-weight-bolder');
      result.job_type = jobTypeElement.length ? jobTypeElement.text().trim() : null;

      // Level
      const levelElement = $('#job-summary .job-summary-item:has(.fa-layer-group) .font-weight-bolder');
      result.level = levelElement.length ? levelElement.text().trim() : null;

      // Education
      const educationElement = $('#job-summary .job-summary-item:contains("Học vấn") .font-weight-bolder');
      result.education = educationElement.length ? educationElement.text().trim() : null;

      // Gender
      const genderElement = $('#job-summary .job-summary-item:has(.fa-venus-mars) .font-weight-bolder');
      result.gender = genderElement.length ? genderElement.text().trim() : null;

      // Industries/Categories
      const industries = [];
      $('#job-summary .job-summary-item:contains("Ngành nghề") .font-weight-bolder, #job-summary .job-summary-item:contains("Ngành nghề") .font-weight-bolder a').each((i, el) => {
        const industryName = $(el).text().trim();
        if (industryName) {
          industries.push(industryName);
        }
      });
      result.industries = industries.length ? industries : null;

      // Date Posted
      let datePostedText = null;
      const datePostedSpan = $('#job-date .date-from span.d-flex');
      if (datePostedSpan.length) {
        datePostedText = datePostedSpan.clone().children('.d-none.d-md-block.mr-1').remove().end().text().trim();
      }
      result.date_posted = datePostedText;

      // Expiration Date (calculated from "Hết hạn trong: X Ngày" and date_posted)
      const expiryTextElement = $('#job-date .day-expired b');
      let expires_in_days = null;
      if (expiryTextElement.length) {
        const text = expiryTextElement.text().trim();
        const match = text.match(/(\d+)\s*Ngày/);
        if (match && match[1]) {
          expires_in_days = parseInt(match[1], 10);
        }
      }
      result.expires_in_days = expires_in_days;

      // Contact Person
      const contactPersonElement = $('#section-job-contact-information .contact-person .person-name');
      result.contact_person = contactPersonElement.length ? contactPersonElement.text().trim() : null;

      // Contact Address
      const contactAddressParts = [];
      $('#section-job-contact-information .contact-person li:eq(1) span').each((i, el) => {
        const part = $(el).text().trim();
        if (part) contactAddressParts.push(part);
      });
      result.contact_address = contactAddressParts.length ? contactAddressParts.join(', ') : null;

      // Company size
      const companySizeElement = $('#section-about-company .list-company-info .cli-users').parent().find('span');
      result.company_size = companySizeElement.length ? companySizeElement.text().trim() : null;

      // Company Website
      const companyWebsiteElement = $('#section-about-company .list-company-info a[target="_blank"]');
      result.company_website = companyWebsiteElement.length ? companyWebsiteElement.attr('href') : null;

      // Company Profile
      const companyProfileElement = $('#section-about-company .company-profile .rich-text-content');
      result.company_profile = companyProfileElement.length ? companyProfileElement.html().trim() : null;

      // Keywords/Tags
      const keywords = [];
      $('.tags-container .chip').each((i, el) => {
        const keyword = $(el).text().trim();
        if (keyword) {
          keywords.push(keyword);
        }
      });
      result.keywords = keywords.length ? keywords : null;

      return result;
    } catch (err) {
      console.error('Error parsing detail:', err);
      return baseData;
    }
  }
}

export const runScraper = () => new GeneratedHtmlScraper().run();
