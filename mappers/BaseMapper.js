import crypto from 'crypto';

export class BaseMapper {
    /**
     * Map a raw job payload to the standardized structure.
     * Must be overridden by subclasses.
     * @param {Object} rawJob 
     * @returns {Object} Standardized job object
     */
    map(rawJob) {
        throw new Error("Method 'map(rawJob)' must be implemented.");
    }

    /**
     * Generate deterministic UUID based on provider and original ID.
     */
    generateDeterministicId(provider, originalId) {
        if (!originalId) {
            return crypto.randomUUID();
        }
        const hash = crypto.createHash('sha256').update(`${provider}_${originalId}`).digest('hex');
        return `${hash.substr(0,8)}-${hash.substr(8,4)}-${hash.substr(12,4)}-${hash.substr(16,4)}-${hash.substr(20,12)}`;
    }

    /**
     * Parse salary string to numeric ranges and currency/negotiable flags.
     * @param {string} salaryStr 
     * @returns {Object} { salary_min, salary_max, salary_currency, is_negotiable }
     */
    parseSalary(salaryStr) {
        let salary_min = 0;
        let salary_max = 0;
        let salary_currency = 'VND';
        let is_negotiable = false;

        if (!salaryStr || typeof salaryStr !== 'string') {
            return { salary_min, salary_max, salary_currency, is_negotiable };
        }

        const lower = salaryStr.toLowerCase();
        if (lower.includes('thỏa thuận') || lower.includes('thoả thuận') || lower.includes('negotiable') || lower.includes('love it') || lower.includes('cạnh tranh')) {
            is_negotiable = true;
            return { salary_min, salary_max, salary_currency, is_negotiable };
        }

        // Clean up stars: replace * with 0
        let cleanStr = salaryStr.replace(/\*/g, '0');

        // Detect currency
        let isUSD = false;
        if (cleanStr.toUpperCase().includes('USD') || cleanStr.includes('$')) {
            isUSD = true;
        }

        // Remove thousand separators
        let normalized = cleanStr.replace(/(\d),(\d{3})/g, '$1$2'); // "2,500" -> "2500"
        
        // Find all numbers (including decimals like 16.5)
        const matches = normalized.match(/\d+(\.\d+)?/g);
        if (matches && matches.length > 0) {
            let nums = matches.map(Number);
            
            if (nums.length === 1) {
                if (lower.includes('lên tới') || lower.includes('tới') || lower.includes('up to') || lower.includes('max')) {
                    salary_max = nums[0];
                } else {
                    salary_min = nums[0];
                }
            } else if (nums.length >= 2) {
                salary_min = nums[0];
                salary_max = nums[1];
            }

            // Handle "triệu" multiplier
            if (lower.includes('triệu') || lower.includes('tr')) {
                salary_min *= 1000000;
                salary_max *= 1000000;
            }

            // Convert USD to VND
            if (isUSD) {
                salary_min *= 25500;
                salary_max *= 25500;
            }
        }

        return {
            salary_min: Math.round(salary_min),
            salary_max: Math.round(salary_max),
            salary_currency,
            is_negotiable
        };
    }

    /**
     * Detect country from addresses or location strings.
     * @param {Array|string} addresses 
     * @param {Array|string} locations 
     * @param {string} defaultCountry 
     * @returns {string} Country name
     */
    detectCountry(addresses, locations, defaultCountry = "Vietnam") {
        const arr = [];
        if (Array.isArray(addresses)) arr.push(...addresses);
        else if (typeof addresses === 'string' && addresses) arr.push(addresses);
        
        if (Array.isArray(locations)) arr.push(...locations);
        else if (typeof locations === 'string' && locations) arr.push(locations);

        const text = arr.join(' ').toLowerCase();
        
        if (text.includes('singapore')) return 'Singapore';
        if (text.includes('japan') || text.includes('nhật bản') || text.includes('tokyo')) return 'Japan';
        if (text.includes('korea') || text.includes('hàn quốc') || text.includes('seoul')) return 'South Korea';
        if (text.includes('usa') || text.includes('united states') || text.includes('mỹ') || text.includes('america')) return 'USA';
        if (text.includes('australia') || text.includes('úc') || text.includes('sydney') || text.includes('melbourne')) return 'Australia';
        if (text.includes('germany') || text.includes('đức') || text.includes('berlin')) return 'Germany';
        if (text.includes('canada') || text.includes('toronto')) return 'Canada';
        if (text.includes('uk') || text.includes('united kingdom') || text.includes('anh quốc') || text.includes('london')) return 'UK';
        if (text.includes('taiwan') || text.includes('đài loan') || text.includes('taipei')) return 'Taiwan';
        if (text.includes('china') || text.includes('trung quốc') || text.includes('beijing') || text.includes('shanghai')) return 'China';
        if (text.includes('france') || text.includes('pháp') || text.includes('paris')) return 'France';
        
        return defaultCountry;
    }
}
