import { BaseMapper } from './BaseMapper.js';

export class MBBankMapper extends BaseMapper {
    parseMBDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return null;
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            if (parts[0].length === 4) {
                return `${parts[0]}-${parts[1]}-${parts[2]}T00:00:00.000Z`;
            }
            const day = parts[0];
            const month = parts[1];
            const year = parts[2];
            return `${year}-${month}-${day}T00:00:00.000Z`;
        }
        return dateStr;
    }

    map(job) {
        let salaryMin = 0;
        let salaryMax = 0;
        let is_negotiable = true;
        
        if (job.minSalary) {
            salaryMin = Math.round(parseFloat(job.minSalary.replace(/\./g, '')) || 0);
            is_negotiable = false;
        }
        if (job.maxSalary) {
            salaryMax = Math.round(parseFloat(job.maxSalary.replace(/\./g, '')) || 0);
            is_negotiable = false;
        }

        return {
            internal_job_id: this.generateDeterministicId("MBBANK", job.jobId?.toString() || job.id || ""),
            source_metadata: {
                provider: "MBBANK",
                original_id: job.jobId?.toString() || job.id || "",
                original_url: job.jobId ? `https://careers.mbbank.com.vn/viec-lam/chi-tiet-tin-tuyen-dung?jobId=${job.jobId}` : "https://careers.mbbank.com.vn/viec-lam",
                slug: job.jobCode || ""
            },
            company_info: {
                name: job.company || "MB Bank",
                slug: "mbbank",
                logo_url: "https://careers.mbbank.com.vn/assets/images/logo.png",
                profile_url: "https://careers.mbbank.com.vn/",
                type: "Ngân hàng",
                industries: ["Ngân hàng"],
                size: "Hơn 10000",
                address: job.branchName || "",
                country: "Vietnam",
                description: "Ngân hàng Thương mại Cổ phần Quân đội"
            },
            basic_info: {
                raw_title: job.title || "",
                normalized_title: "",
                position: job.rankName || "",
                career_levels: job.rankName ? [job.rankName] : [],
                contract_types: ["Fulltime"],
                working_modes: ["In Office"],
                locations: job.location ? [job.location] : [],
                quantity_required: "",
                gender_required: "",
                raw_experience_text: job.experienceRequired || "",
                tags: Array.isArray(job.skillTags) ? job.skillTags : []
            },
            working_conditions: {
                working_time_text: "",
                working_days: "",
                overtime_policy: "",
                salary_min: salaryMin,
                salary_max: salaryMax,
                salary_currency: "VND",
                salary_period: "MONTH",
                salary_raw_text: job.minSalary || job.maxSalary ? `${job.minSalary || '0'} - ${job.maxSalary || '0'} VND` : "Thỏa thuận",
                is_negotiable
            },
            display_content: {
                raw_description: job.jobDescriptionVn || job.jobDescriptionEn || "",
                raw_requirements: [
                    job.experienceDescription ? `Yêu cầu kinh nghiệm:\n${job.experienceDescription}` : "",
                    job.foreignLanguage ? `Yêu cầu ngoại ngữ:\n${job.foreignLanguage}` : "",
                    job.certificate ? `Yêu cầu bằng cấp/chứng chỉ:\n${job.certificate}` : "",
                    job.otherRequirements ? `Yêu cầu khác:\n${job.otherRequirements}` : ""
                ].filter(Boolean).join('\n\n'),
                raw_benefits: job.welfare || "",
                raw_reasons: job.missionContent || "",
                media_urls: []
            },
            contact_info: { contact_name: "", contact_email: "", contact_phone: "" },
            timestamps: {
                posted_at: null,
                updated_at: null,
                deadline_at: job.deadline ? this.parseMBDate(job.deadline) : null,
                crawled_at: job.scrapedAt || new Date().toISOString(),
                status: "ACTIVE"
            }
        };
    }
}
