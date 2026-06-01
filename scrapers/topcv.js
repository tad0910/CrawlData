import { BaseApiScraper } from './base/BaseApiScraper.js';

function decodeEntities(s) {
  if (!s) return '';
  return s.replace(/&nbsp;/g, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

class TopCVScraper extends BaseApiScraper {
  constructor() {
    super('topcv');
  }

  buildListUrl(pageNum) {
    return `${this.config.apiBase}?page=${pageNum}&per_page=${this.config.pageSize}`;
  }

  buildDetailUrl(jobId) {
    return `${this.config.detailApiBase}${jobId}`;
  }

  extractItemsFromListRes(json) {
    return json.data || [];
  }

  normalizeJob(listData, detailData = {}) {
    const job = detailData.id ? detailData : listData;
    return {
      id: job.id,
      title: job.title,
      url: job.url,
      company: job.company?.name || '',
      companyUrl: job.company?.url || '',
      companyLogo: job.company?.logo || '',
      companySize: job.company?.size || '',
      companyAddress: job.company?.address || '',
      salary: job.salary?.text || 'Thỏa thuận',
      salaryRange: {
        min: job.salary?.from || 0,
        max: job.salary?.to || 0,
        currency: job.salary?.currency || 'VND'
      },
      location: (job.locations || job.workLocation || []).join(', '),
      workingTime: (job.workingTime || []).join(', '),
      type: job.type || '',
      quantity: job.quantity || '',
      gender: job.gender || '',
      position: job.position || '',
      experience: job.experience || '',
      deadline: job.deadline || '',
      postedTime: listData.publish || listData.updatedAt || job.updatedAt || '',
      isDiamond: job.isDiamond || false,
      isHot: job.isHot || false,
      isJobFlashActive: job.isJobFlashActive || false,
      isTopCvJob: job.isTopCvJob || false,
      description: decodeEntities(job.description || ''),
      requirements: decodeEntities(job.requirement || ''),
      benefits: decodeEntities(job.benefit || ''),
      media: (job.media || []).map(m => m.link),
      applyReasons: job.applyReasons || [],
      scrapedAt: new Date().toISOString(),
    };
  }
}

export const runScraper = () => new TopCVScraper().run();
