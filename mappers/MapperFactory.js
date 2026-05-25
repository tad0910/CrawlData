import { ITViecMapper } from './ITViecMapper.js';
import { TopCVMapper } from './TopCVMapper.js';
import { TopDevMapper } from './TopDevMapper.js';
import { LinkedInMapper } from './LinkedInMapper.js';
import { MBBankMapper } from './MBBankMapper.js';

export class MapperFactory {
    /**
     * Get mapper instance based on provider name or file name.
     * Supports both format: code name (e.g. 'itviec') or JSON filename (e.g. 'itviec-jobs.json')
     * @param {string} scraperName 
     * @returns {BaseMapper} Concrete mapper instance
     */
    static getMapper(scraperName) {
        if (!scraperName || typeof scraperName !== 'string') {
            throw new Error(`Tên scraper không hợp lệ: ${scraperName}`);
        }

        const name = scraperName.toLowerCase().trim();

        if (name.includes('itviec')) {
            return new ITViecMapper();
        }
        if (name.includes('topcv')) {
            return new TopCVMapper();
        }
        if (name.includes('topdev')) {
            return new TopDevMapper();
        }
        if (name.includes('linkedin')) {
            return new LinkedInMapper();
        }
        if (name.includes('mbbank')) {
            return new MBBankMapper();
        }

        throw new Error(`Không tìm thấy mapper tương ứng cho nguồn: ${scraperName}`);
    }
}
