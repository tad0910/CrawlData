import { BaseApiScraper } from './base/BaseApiScraper.js';

function decodeEntities(s) {
  if (!s) return '';
  return s.replace(/&nbsp;/g, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

class MBBankScraper extends BaseApiScraper {
  constructor() {
    super('mbbank');
  }

  buildListUrl(pageNum) {
    return `${this.config.apiBase}?size=${this.config.pageSize}&page=${pageNum}`;
  }

  buildDetailUrl(jobId) {
    return `${this.config.detailApiBase}${jobId}`;
  }

  extractItemsFromListRes(json) {
    return json.content || [];
  }

  normalizeJob(listData, detailData = {}) {
    const job = detailData.id ? detailData : listData;
    return {
      id: job.id,
      jobId: job.recruitmentNewId || '',
      jobCode: job.newCode || '',
      title: job.name || '',
      company: 'MB Bank',
      branchCode: job.branchCode || '',
      branchName: job.branchName || '',
      rankName: job.rankName || '',
      workGroupId: job.workGroupId || '',
      workGroupName: job.workGroupName || '',
      workGroupParentId: job.workGroupParentId || null,
      location: job.provinceName || job.province || job.city || '',
      regionCode: job.regionCode || '',
      regionName: job.regionName || '',
      subRegion: job.subRegion || '',
      provinceCode: job.provinceCode || '',
      experienceRequired: job.experienceRequired || '',
      experienceDescription: decodeEntities(job.experienceDescription || ''),
      graduationClassification: job.graduationClassification || null,
      level: job.level || [],
      major: job.major || [],
      skillTags: job.skillTags || [],
      relatedFields: job.relatedFields || [],
      foreignLanguage: job.foreignLanguage || null,
      certificate: job.certificate || null,
      otherRequirements: decodeEntities(job.otherRequirements || ''),
      languageDescription: decodeEntities(job.languageDescription || ''),
      jobDescriptionVn: decodeEntities(job.jobDescriptionVn || ''),
      jobDescriptionEn: decodeEntities(job.jobDescriptionEn || ''),
      missionContent: decodeEntities(job.missionContent || ''),
      welfare: job.welfare || '',
      deadline: job.toDate || '',
      minSalary: job.minSalary || null,
      maxSalary: job.maxSalary || null,
      flagStatus: job.flagStatus !== undefined ? job.flagStatus : null,
      scrapedAt: new Date().toISOString(),
      url: `${this.config.publicDetailUrlBase}${job.id}`
    };
  }
}

export const runScraper = () => new MBBankScraper().run();
