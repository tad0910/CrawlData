import { BaseMapper } from './BaseMapper.js';

export class DynamicMapper extends BaseMapper {
    constructor(provider) {
        super();
        this.provider = provider || 'DYNAMIC';
    }

    map(job) {
        const originalId = job.id?.toString() || job.jobId?.toString() || '';
        const salaryInfo = this.parseSalary(job.salary);

        return {
            internal_job_id: this.generateDeterministicId(this.provider, originalId),
            source_metadata: {
                provider: this.provider,
                original_id: originalId,
                original_url: job.url || job.original_url || "",
                raw_data: job // SAVE ALL RAW FIELDS IN DB!
            },
            company_info: {
                name: job.company || job.companyName || job.groupName || "",
                slug: "",
                logo_url: job.companyLogo || job.company?.logo || "",
                profile_url: job.companyUrl || "",
                type: "",
                industries: job.industries || [],
                size: job.companySize || "",
                address: job.companyAddress || job.address || "",
                country: this.detectCountry(job.companyAddress || job.address, job.location, "Vietnam"),
                description: ""
            },
            basic_info: {
                raw_title: job.title || job.name || "",
                normalized_title: "",
                position: job.position || "",
                career_levels: job.jobLevels || [],
                contract_types: job.type ? [job.type] : [],
                working_modes: job.workingMode ? [job.workingMode] : [],
                locations: job.locations || (job.location ? [job.location] : []),
                quantity_required: job.quantity?.toString() || "",
                gender_required: job.gender || "",
                raw_experience_text: job.experience || "",
                tags: job.tags || job.skills || []
            },
            working_conditions: {
                working_time_text: job.workingTime || "",
                working_days: "",
                overtime_policy: "",
                salary_min: salaryInfo.salary_min || 0,
                salary_max: salaryInfo.salary_max || 0,
                salary_currency: salaryInfo.salary_currency,
                salary_period: "MONTH",
                salary_raw_text: job.salary || "",
                is_negotiable: salaryInfo.is_negotiable
            },
            display_content: {
                raw_description: job.description || job.content || "",
                raw_requirements: job.requirements || "",
                raw_benefits: job.benefits || "",
                raw_reasons: Array.isArray(job.applyReasons) ? job.applyReasons.join('\n') : (job.applyReasons || ""),
                media_urls: Array.isArray(job.media) ? job.media : []
            },
            contact_info: { contact_name: "", contact_email: "", contact_phone: "" },
            timestamps: {
                posted_at: job.postedAt || job.createdTime || null,
                updated_at: job.updatedAt || null,
                deadline_at: job.deadlineAt || job.deadline || null,
                crawled_at: job.scrapedAt || new Date().toISOString(),
                status: "ACTIVE"
            }
        };
    }
}
