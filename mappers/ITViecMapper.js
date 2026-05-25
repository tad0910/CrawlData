import { BaseMapper } from './BaseMapper.js';

export class ITViecMapper extends BaseMapper {
    map(job) {
        const salaryInfo = this.parseSalary(job.salary);
        return {
            internal_job_id: this.generateDeterministicId("ITVIEC", job.jobKey || ""),
            source_metadata: {
                provider: "ITVIEC",
                original_id: job.jobKey || "",
                original_url: job.url || "",
                slug: job.slug || ""
            },
            company_info: {
                name: job.company || "",
                slug: job.companySlug || "",
                logo_url: job.companyInfo?.logo || "",
                profile_url: job.companySlug ? `https://itviec.com/companies/${job.companySlug}` : "",
                type: job.companyInfo?.["Company type"] || "",
                industries: job.companyInfo?.["Company industry"] ? [job.companyInfo["Company industry"]] : [],
                size: job.companyInfo?.["Company size"] || "",
                address: job.companyInfo?.address || "",
                country: job.companyInfo?.Country || "Vietnam",
                description: job.companyInfo?.description || ""
            },
            basic_info: {
                raw_title: job.title || "",
                normalized_title: "",
                position: "",
                career_levels: [],
                contract_types: [],
                working_modes: job.workingMode ? [job.workingMode] : [],
                locations: job.location ? job.location.split(',').map(l => l.trim()) : [],
                quantity_required: "",
                gender_required: "",
                raw_experience_text: "",
                tags: job.skills || job.tags || []
            },
            working_conditions: {
                working_time_text: job.companyInfo?.workingTime || "",
                working_days: job.companyInfo?.["Working days"] || "",
                overtime_policy: job.companyInfo?.["Overtime policy"] || "",
                salary_min: salaryInfo.salary_min,
                salary_max: salaryInfo.salary_max,
                salary_currency: salaryInfo.salary_currency,
                salary_period: "MONTH",
                salary_raw_text: job.salary || "Login to view salary",
                is_negotiable: salaryInfo.is_negotiable
            },
            display_content: {
                raw_description: job.jobDescription || "",
                raw_requirements: job.requirements || "",
                raw_benefits: job.benefits || "",
                raw_reasons: Array.isArray(job.reasons) ? job.reasons.join('\n') : (job.reasons || ""),
                media_urls: []
            },
            contact_info: { contact_name: "", contact_email: "", contact_phone: "" },
            timestamps: {
                posted_at: job.postedTime || null,
                updated_at: job.postedTime || null,
                deadline_at: null,
                crawled_at: job.scrapedAt || new Date().toISOString(),
                status: "ACTIVE"
            }
        };
    }
}
