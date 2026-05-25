import { BaseMapper } from './BaseMapper.js';

export class TopCVMapper extends BaseMapper {
    map(job) {
        const salaryInfo = this.parseSalary(job.salary);
        return {
            internal_job_id: this.generateDeterministicId("TOPCV", job.id?.toString() || ""),
            source_metadata: {
                provider: "TOPCV",
                original_id: job.id?.toString() || "",
                original_url: job.url || "",
                slug: ""
            },
            company_info: {
                name: job.company || "",
                slug: "",
                logo_url: job.companyLogo || "",
                profile_url: job.companyUrl || "",
                type: "",
                industries: [],
                size: job.companySize || "",
                address: job.companyAddress || "",
                country: this.detectCountry(job.companyAddress, job.location, "Vietnam"),
                description: ""
            },
            basic_info: {
                raw_title: job.title || "",
                normalized_title: "",
                position: job.position || "",
                career_levels: [],
                contract_types: job.type ? [job.type] : [],
                working_modes: [],
                locations: job.location ? [job.location] : [],
                quantity_required: job.quantity?.toString() || "",
                gender_required: job.gender || "",
                raw_experience_text: job.experience || "",
                tags: []
            },
            working_conditions: {
                working_time_text: job.workingTime || "",
                working_days: "",
                overtime_policy: "",
                salary_min: salaryInfo.salary_min || job.salaryRange?.min || 0,
                salary_max: salaryInfo.salary_max || job.salaryRange?.max || 0,
                salary_currency: salaryInfo.salary_currency,
                salary_period: "MONTH",
                salary_raw_text: job.salary || "",
                is_negotiable: salaryInfo.is_negotiable
            },
            display_content: {
                raw_description: job.description || "",
                raw_requirements: job.requirements || "",
                raw_benefits: job.benefits || "",
                raw_reasons: Array.isArray(job.applyReasons) ? job.applyReasons.join('\n') : (job.applyReasons || ""),
                media_urls: Array.isArray(job.media) ? job.media : []
            },
            contact_info: { contact_name: "", contact_email: "", contact_phone: "" },
            timestamps: {
                posted_at: job.postedTime || null,
                updated_at: job.postedTime || null,
                deadline_at: job.deadline || null,
                crawled_at: job.scrapedAt || new Date().toISOString(),
                status: "ACTIVE"
            }
        };
    }
}
