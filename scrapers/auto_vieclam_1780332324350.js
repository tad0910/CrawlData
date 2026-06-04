import { BaseHtmlScraper } from './base/BaseHtmlScraper.js';
import * as cheerio from 'cheerio';

class GeneratedHtmlScraper extends BaseHtmlScraper {
  constructor() {
    super('auto_vieclam_1780332324350');
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
    const baseUrl = 'https://vieclam.net/tuyen-dung?page=';
    return baseUrl + pageNum;
  }

  async parseJobList(html) {
    const $ = cheerio.load(html);
    try {
      const jobs = [];
      // FIX: Changed selector to remove the border-color constraint, now selects all direct div children.
      $('div.relative.w-full.mx-auto.overflow-visible > div.relative').each((i, el) => {
          const card = $(el);
          const linkElement = card.find('a[aria-label="link detail"]');
          const relativeUrl = linkElement.attr('href');
          const fullUrl = relativeUrl ? `https://vieclam.net${relativeUrl}` : '';
          
          let id = '';
          if (relativeUrl) {
              const idMatch = relativeUrl.match(/id(\d+)$/);
              if (idMatch) {
                  id = idMatch[1];
              }
          }
      
          // Get the title element and remove any "Hot", "Gấp" spans within it that might prepend the title text
          const titleElement = card.find('h3.font-bold');
          titleElement.find('span').remove(); // Remove nested spans like "Hot", "Gấp" from the h3 element itself
          let title = titleElement.text().trim();
      
          const salary = card.find('p.font-bold').text().trim();
      
          // Location - find span after location icon
          const location = card.find('img[src*="location-black.svg"]').next('span.truncate').text().trim();
      
          // Posted Time - find span after lock icon
          const postedTime = card.find('img[src*="lock-black.svg"]').next('span').text().trim();
      
          let companyName = '';
          // Company name typically has 'truncate' and 'font-normal' classes, differentiating it from bold titles/salaries.
          // It's usually within the main flex column div for job details, before the salary.
          const potentialCompanyNameSpan = card.find('div.flex.flex-col.gap-[8px] span.truncate.font-normal');
          if (potentialCompanyNameSpan.length > 0) {
              companyName = potentialCompanyNameSpan.text().trim();
          }
      
          const tags = [];
          card.find('div.flex.items-center.gap-2.flex-wrap.mt-2 span.inline-flex.items-center').each((j, tagEl) => {
              tags.push($(tagEl).text().trim());
          });
          
          jobs.push({
              id: id,
              url: fullUrl,
              title: title,
              salary: salary,
              location: location,
              postedTime: postedTime,
              companyName: companyName,
              tags: tags
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
      result.job_title = $('h1.sc-37bcaf11-15.cQjayK').text().trim();
      
      // Salary from main header (e.g., "16 - 18 triệu/tháng")
      result.salary = $('div.sc-37bcaf11-16.czjBpq').text().trim();
      
      // Location and Updated At
      const locationItems = $('div.sc-37bcaf11-13.hPRFVj .item');
      if (locationItems.length > 0) {
          result.location = $(locationItems[0]).find('span').text().trim();
      }
      if (locationItems.length > 1) {
          result.updated_at = $(locationItems[1]).find('span').text().trim();
      }
      
      // Basic Information section
      const basicInfoRows = $('div.sc-37bcaf11-23.cpekrG');
      basicInfoRows.each((i, el) => {
          const label = $(el).find('.label').text().trim();
          const value = $(el).find('.value, .link').text().trim(); // .link for industries
      
          switch (label) {
              case 'Nhà tuyển dụng':
                  result.company_name = value;
                  break;
              case 'Ngành nghề':
                  result.industries = value;
                  break;
              case 'Loại hình công việc':
                  result.job_type = value;
                  break;
              case 'Hình thức trả lương':
                  result.salary_payment_type = value;
                  break;
              case 'Lương tối thiểu':
                  result.min_salary = parseFloat(value.replace(/[^0-9.]/g, '')); // Extract numbers
                  break;
              case 'Lương tối đa':
                  result.max_salary = parseFloat(value.replace(/[^0-9.]/g, '')); // Extract numbers
                  break;
              case 'Kinh nghiệm':
                  result.experience = value;
                  break;
              case 'Giới tính':
                  result.gender = value;
                  break;
              case 'Số lượng tuyển dụng':
                  result.num_hires = parseInt(value.replace(/[^0-9]/g, '')); // Extract numbers
                  break;
              case 'Học vấn tối thiểu':
                  result.education = value;
                  break;
          }
      });
      
      // Description, Requirements, Benefits
      const descriptionBlock = $('div.sc-37bcaf11-27.jJIQHg');
      let fullContentHtml = descriptionBlock.html() || '';
      
      // Clean up phone wrappers inside description before processing text
      fullContentHtml = fullContentHtml.replace(/<div class="phone-wrapper">.*?<\/div>/g, '');
      
      let fullContentText = fullContentHtml.replace(/<br>/g, '\n').trim();
      
      let descriptionText = '';
      let requirementsText = '';
      let benefitsText = '';
      let currentSection = 'description';
      
      const lines = fullContentText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      
      for (const line of lines) {
          if (line.toLowerCase().includes('yêu cầu:')) {
              currentSection = 'requirements';
              requirementsText += line + '\n'; // Include the header line
              continue; 
          }
          if (line.toLowerCase().includes('lương, thưởng, phụ cấp:')) {
              currentSection = 'benefits';
              benefitsText += line + '\n'; // Include the header line
              continue; 
          }
      
          if (currentSection === 'description') {
              descriptionText += line + '\n';
          } else if (currentSection === 'requirements') {
              requirementsText += line + '\n';
          } else if (currentSection === 'benefits') {
              benefitsText += line + '\n';
          }
      }
      
      result.description = descriptionText.trim();
      result.requirements = requirementsText.trim();
      result.benefits = benefitsText.trim();
      
      // Additional details from the "Thông tin người đăng" and "Tên dịch vụ" sections
      const companyNameFromCreator = $('div.creator .sc-37bcaf11-28.eTUUO span').text().trim();
      if (companyNameFromCreator && (!result.company_name || result.company_name.includes('Cá nhân đăng tuyển'))) { 
          result.company_name = companyNameFromCreator;
      }
      
      const serviceInfoRows = $('div.sc-37bcaf11-36.hwZbAQ div');
      serviceInfoRows.each((i, el) => {
          const label = $(el).find('.label').text().trim();
          const value = $(el).find('.value').text().trim();
          switch (label) {
              case 'Ngày hết hạn':
                  result.posting_expiry_date = value;
                  break;
              case 'Mã tin':
                  result.job_id = value;
                  break;
          }
      });
      
      // Phone Numbers (from description block, but extracted explicitly here)
      const phoneNumbers = [];
      $('div.sc-37bcaf11-27.jJIQHg div.phone-wrapper span.phone-hidden').each((i, el) => {
          const phone = $(el).attr('data-phone');
          if (phone) {
              phoneNumbers.push(phone);
          }
      });
      result.phone_numbers = phoneNumbers;
      
      // Handle age requirement, often found in description (e.g., "Tuổi: từ 45 trở xuống")
      const ageMatch = fullContentText.match(/Tuổi:\s*(từ\s*\d+\s*trở (xuống|lên)|(\d+)\s*-\s*(\d+)|(\d+)\+)/i);
      if (ageMatch) {
          result.age = ageMatch[0].replace('Tuổi:', '').trim();
      }
      
      // Ensure all requested keys are present, even if null/empty
      const allExpectedFields = {
          job_title: '',
          description: '',
          requirements: '',
          benefits: '',
          location: '',
          salary: '',
          experience: '',
          education: '',
          job_type: '',
          level: null,          
          industries: '',
          deadline: null,       
          company_name: '',
          company_size: null,   
          gender: '',
          age: null,            
          updated_at: '',
          salary_payment_type: '',
          min_salary: null,
          max_salary: null,
          num_hires: null,
          phone_numbers: [],
          job_id: null,
          posting_expiry_date: null 
      };
      
      for (const key in allExpectedFields) {
          if (result[key] === undefined || result[key] === null || (typeof result[key] === 'string' && result[key].trim() === '') || (Array.isArray(result[key]) && result[key].length === 0)) {
              if (key === 'deadline' && result.posting_expiry_date) {
                  result[key] = result.posting_expiry_date;
              } else {
                  result[key] = allExpectedFields[key];
              }
          }
      }
      
      // Ensure min_salary, max_salary, num_hires are numbers, not NaN if parsing failed
      if (isNaN(result.min_salary)) result.min_salary = null;
      if (isNaN(result.max_salary)) result.max_salary = null;
      if (isNaN(result.num_hires)) result.num_hires = null;
      
      return result;
    } catch (err) {
      console.error('Error parsing detail:', err);
      return baseData;
    }
  }
}

export const runScraper = () => new GeneratedHtmlScraper().run();
