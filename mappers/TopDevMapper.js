import { BaseMapper } from './BaseMapper.js';

export class TopDevMapper extends BaseMapper {
    map(job) {
        const salaryInfo = this.parseSalary(job.salary);
        return {
            internal_job_id: this.generateDeterministicId("TOPDEV", job.id?.toString() || ""),
            source_metadata: {
                provider: "TOPDEV",
                original_id: job.id?.toString() || "",
                original_url: job.url || "",
                slug: job.slug || ""
            },
            company_info: {
                name: job.company?.name || job.company || "",
                slug: "",
                logo_url: job.company?.logo || "",
                profile_url: job.companyUrl || "",
                type: "",
                industries: job.industries || [],
                size: job.companySize || "",
                address: job.addresses ? job.addresses.join(', ') : "",
                country: this.detectCountry(job.addresses, job.location ? [job.location] : job.locations, "Vietnam"),
                description: ""
            },
            basic_info: {
                raw_title: job.title || "",
                normalized_title: "",
                position: "",
                career_levels: job.jobLevels || [],
                contract_types: job.contractTypes || [],
                working_modes: job.workingMode ? [job.workingMode] : [],
                locations: job.locations || (job.location ? [job.location] : []),
                quantity_required: "",
                gender_required: "",
                raw_experience_text: job.experience || "",
                tags: job.tags || job.skills || []
            },
            working_conditions: {
                working_time_text: "",
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
                raw_description: job.jobDescription || "",
                raw_requirements: job.requirements || "",
                raw_benefits: job.benefits || "",
                raw_reasons: "",
                media_urls: []
            },
            contact_info: { contact_name: "", contact_email: "", contact_phone: "" },
            timestamps: {
                posted_at: job.published || job.postedTime || null,
                updated_at: job.refreshed || null,
                deadline_at: job.expires || null,
                crawled_at: job.scrapedAt || new Date().toISOString(),
                status: "ACTIVE"
            }
        };
    }
}
