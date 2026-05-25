import { BaseMapper } from './BaseMapper.js';

export class LinkedInMapper extends BaseMapper {
    map(job) {
        const raw = job.raw_data || {};
        let salaryMin = parseFloat(raw.SALARY_MIN) || 0;
        let salaryMax = parseFloat(raw.SALARY_MAX) || 0;
        let currency = raw.CURRENCY || 'VND';
        let is_negotiable = false;

        if (currency === 'USD') {
            salaryMin *= 25500;
            salaryMax *= 25500;
            currency = 'VND';
        }

        if (salaryMin === 0 && salaryMax === 0) {
            is_negotiable = true;
        }

        let original_id = "";
        if (raw.JOB_URL) {
            const idMatch = raw.JOB_URL.match(/\/view\/(\d+)/);
            if (idMatch) original_id = idMatch[1];
        }

        let tags = raw.SKILLS ? raw.SKILLS.split(',').map(s=>s.trim()) : [];
        if (raw.JOB_FUNCTION) tags.push(...raw.JOB_FUNCTION.split(',').map(s=>s.trim()));
        if (raw.INDUSTRY) tags.push(...raw.INDUSTRY.split(',').map(s=>s.trim()));
        tags = Array.from(new Set(tags)).filter(Boolean); // Unique tags

        let raw_description = raw.DESCRIPTION || "";
        let raw_requirements = "";
        let raw_experience_text = raw.EXPERIENCE || "";
        let raw_benefits = "";

        // Experience Entity Extraction
        if (!raw_experience_text) {
            const expRegex = /(?:minimum|min|at least|tối thiểu|ít nhất|trên|hơn|over|more than)?\s*(\d+)(?:\s*-\s*|\s*to\s*|\s*đến\s*)?(\d+)?\s*(?:\+)?\s*(?:years?|yrs?|năm)(?:\s*of\s*(?:progressive\s*)?(?:professional\s*)?(?:experience|exp)|\s*kinh nghiệm)?/i;
            const expMatch = raw_description.match(expRegex);
            if (expMatch) {
                raw_experience_text = expMatch[0].trim();
            }
        }

        // Smart Text Segmentation
        const reqRegex = /(?:^|\n)[ \t]*\*?\*?(?:What You Will Need|Requirements?|Qualifications?|Key Capabilities|What you bring|Who you are|Ideal Candidate|What you'll need|What you need|Your background|Yêu cầu(?: công việc)?|Kỹ năng(?: yêu cầu)?|Hồ sơ(?: yêu cầu)?)\*?\*?[ \t]*(?:[:\n]|$)/i;
        const splitMatch = raw_description.match(reqRegex);
        if (splitMatch) {
            raw_requirements = raw_description.substring(splitMatch.index).trim();
            raw_description = raw_description.substring(0, splitMatch.index).trim();
        }

        // Trim Boilerplate and assign to benefits
        const boilerplateRegex = /(?:^|\n)[ \t]*\*?\*?(?:About\s+[a-zA-Z]|Why join us|You’ll achieve more when you join|Commitment to diversity|Issued by|Đãi ngộ|Quyền lợi|Phúc lợi|What we offer|Perks|Benefits?|Tại sao bạn nên|Cơ hội)\*?\*?[ \t]*(?:[:\n]|$)|(?:^|\n)[ \t]*(?:https?:\/\/|www\.)/i;
        
        // We check raw_requirements first, then raw_description
        const bpMatchReq = raw_requirements.match(boilerplateRegex);
        if (bpMatchReq) {
            raw_benefits = raw_requirements.substring(bpMatchReq.index).trim();
            raw_requirements = raw_requirements.substring(0, bpMatchReq.index).trim();
        } else {
            const bpMatchDesc = raw_description.match(boilerplateRegex);
            if (bpMatchDesc) {
                raw_benefits = raw_description.substring(bpMatchDesc.index).trim();
                raw_description = raw_description.substring(0, bpMatchDesc.index).trim();
            }
        }

        // Location Parsing (Country Extraction)
        let country = this.detectCountry(null, raw.LOCATION, "");
        if (!country && raw.LOCATION) {
            const parts = raw.LOCATION.split(',');
            country = parts[parts.length - 1].trim();
        }

        return {
            internal_job_id: this.generateDeterministicId("LINKEDIN", original_id),
            source_metadata: {
                provider: "LINKEDIN",
                original_id,
                original_url: raw.JOB_URL || "",
                slug: ""
            },
            company_info: {
                name: raw.COMPANY || "",
                slug: "",
                logo_url: "",
                profile_url: raw.COMPANY_URL || "",
                type: "",
                industries: raw.INDUSTRY ? [raw.INDUSTRY] : [],
                size: "",
                address: "",
                country: country,
                description: ""
            },
            basic_info: {
                raw_title: raw.TITLE || "",
                normalized_title: "",
                position: "",
                career_levels: raw.JOB_LEVEL ? [raw.JOB_LEVEL] : [],
                contract_types: raw.JOB_TYPE ? [raw.JOB_TYPE] : [],
                working_modes: [],
                locations: raw.LOCATION ? [raw.LOCATION] : [],
                quantity_required: "",
                gender_required: "",
                raw_experience_text,
                tags
            },
            working_conditions: {
                working_time_text: "",
                working_days: "",
                overtime_policy: "",
                salary_min: Math.round(salaryMin),
                salary_max: Math.round(salaryMax),
                salary_currency: currency,
                salary_period: "MONTH",
                salary_raw_text: "",
                is_negotiable
            },
            display_content: {
                raw_description,
                raw_requirements,
                raw_benefits,
                raw_reasons: "",
                media_urls: []
            },
            contact_info: { contact_name: "", contact_email: "", contact_phone: "" },
            timestamps: {
                posted_at: raw.POSTED_AT || null,
                updated_at: null,
                deadline_at: null,
                crawled_at: job.ingested_at || new Date().toISOString(),
                status: "ACTIVE"
            }
        };
    }
}
