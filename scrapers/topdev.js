import { BaseApiScraper } from './base/BaseApiScraper.js';

const HTML_ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
  '&nbsp;': ' ', '&ndash;': '–', '&mdash;': '—', '&bull;': '•',
};

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&[A-Za-z]+;/g, m => HTML_ENTITIES[m] ?? m);
}

function htmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  const items = [];
  const liMatches = html.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  if (liMatches && liMatches.length) {
    for (const li of liMatches) {
      const inner = li.replace(/<li[^>]*>|<\/li>/gi, '');
      const txt = decodeEntities(inner.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      if (txt) items.push('- ' + txt);
    }
    return items.join('\n');
  }
  const txt = decodeEntities(html.replace(/<\/?(p|div|br)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ''));
  return txt.split(/\n+/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

class TopDevScraper extends BaseApiScraper {
  constructor() {
    super('topdev');
  }

  buildListUrl(pageNum) {
    const params = new URLSearchParams();
    params.set('page', String(pageNum));
    params.set('page_size', String(this.config.pageSize));
    params.set('fields[job]', this.config.apiFields.job);
    params.set('fields[company]', this.config.apiFields.company);
    params.set('locale', this.config.locale);
    return `${this.config.apiBase}?${params.toString()}`;
  }

  buildDetailUrl(jobId) {
    return null; // TopDev trả về toàn bộ dữ liệu ở API danh sách nên không cần gọi API chi tiết
  }

  extractItemsFromListRes(json) {
    return json.data || [];
  }

  normalizeJob(listData, detailData = {}) {
    const raw = detailData.id ? detailData : listData;
    const salary = raw.salary || {};
    const salaryStr = salary.is_negotiable === '1' || salary.is_negotiable === 1
      ? 'Negotiable'
      : (salary.value || '').replace(/\s+/g, ' ').trim();

    const addr = raw.addresses || {};
    const locations = Array.isArray(addr.address_region_array) ? addr.address_region_array : [];
    const tags = [];
    if (Array.isArray(raw.skills_arr)) tags.push(...raw.skills_arr.filter(Boolean));
    if (!tags.length && raw.skills_str) {
      tags.push(...raw.skills_str.split(/[,;]/).map(s => s.trim()).filter(Boolean));
    }

    const responsibilities = htmlToText(raw.responsibilities_original || raw.content || '');
    const requirements = htmlToText(raw.requirements_original || '');
    const benefitsParts = [];
    if (Array.isArray(raw.benefits_v2)) {
      for (const b of raw.benefits_v2) {
        const piece = htmlToText(b?.description || '');
        if (piece) benefitsParts.push(b?.name ? `${b.name}:\n${piece}` : piece);
      }
    }
    if (!benefitsParts.length && raw.benefits_original) {
      benefitsParts.push(htmlToText(raw.benefits_original));
    }

    return {
      id: raw.id,
      jobId: raw.job_id || raw.id || '',
      title: raw.title || '',
      url: raw.detail_url || '',
      company: raw.company?.display_name || '',
      companyUrl: raw.company?.detail_url || '',
      companyLogo: raw.company?.image_logo || '',
      salary: salaryStr,
      salaryRange: {
        min: salary.num_min || 0,
        max: salary.num_max || 0,
        currency: salary.currency || 'VND'
      },
      location: locations.join(', '),
      workingTime: '',
      type: raw.job_types_str || '',
      quantity: '',
      gender: '',
      position: raw.job_levels_str || '',
      experience: raw.yoe ? `${raw.yoe} year(s)` : '',
      deadline: '',
      postedTime: raw.published_timestamp ? new Date(raw.published_timestamp).toISOString() : '',
      isDiamond: false,
      isHot: false,
      isJobFlashActive: false,
      isTopCvJob: false,
      description: responsibilities,
      requirements: requirements,
      benefits: benefitsParts.join('\n\n'),
      media: [],
      applyReasons: [],
      scrapedAt: new Date().toISOString(),
    };
  }
}

export const runScraper = () => new TopDevScraper().run();
