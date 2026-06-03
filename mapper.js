import { v4 as uuidv4 } from 'uuid';

class GenericJobSegmenter {
    constructor() {
        const reqKws = [
            'requirements?', 'qualifications?', 'what you( will)? need', 
            'yêu cầu( công việc| ứng viên)?', 'kỹ năng', 'skills', 'who you are', 'about you'
        ];
        const benKws = [
            'benefits?', 'what we offer', 'perks', 'why join us', 
            'quyền lợi', 'phúc lợi'
        ];
        this.reqPattern = new RegExp(`^[*-]?\\s*(${reqKws.join('|')})\\s*:?\\s*$`, 'gim');
        this.benPattern = new RegExp(`^[*-]?\\s*(${benKws.join('|')})\\s*:?\\s*$`, 'gim');
    }

    segment(rawText) {
        if (!rawText) return { desc: "", req: "", ben: "" };

        let desc = rawText, req = "", ben = "";
        const reqMatches = [...rawText.matchAll(this.reqPattern)];
        const benMatches = [...rawText.matchAll(this.benPattern)];

        const reqIdx = reqMatches.length > 0 ? reqMatches[0].index : -1;
        const benIdx = benMatches.length > 0 ? benMatches[0].index : -1;

        if (reqIdx !== -1 && benIdx !== -1) {
            if (reqIdx < benIdx) {
                desc = rawText.substring(0, reqIdx).trim();
                req = rawText.substring(reqIdx, benIdx).trim();
                ben = rawText.substring(benIdx).trim();
            } else {
                desc = rawText.substring(0, benIdx).trim();
                ben = rawText.substring(benIdx, reqIdx).trim();
                req = rawText.substring(reqIdx).trim();
            }
        } else if (reqIdx !== -1) {
            desc = rawText.substring(0, reqIdx).trim();
            req = rawText.substring(reqIdx).trim();
        } else if (benIdx !== -1) {
            desc = rawText.substring(0, benIdx).trim();
            ben = rawText.substring(benIdx).trim();
        }

        return { desc, req, ben };
    }
}

class DataMapper {
    constructor() {
        this.segmenter = new GenericJobSegmenter();
    }

    getNested(data, key) {
        if (!key) return null;
        const keys = key.split('.');
        let val = data;
        for (const k of keys) {
            if (val && typeof val === 'object' && k in val) {
                val = val[k];
            } else {
                return null;
            }
        }
        return val;
    }

    resolveValue(rule, data) {
        if (!rule) return null;

        // Direct string mapping
        if (typeof rule === 'string') {
            return this.getNested(data, rule);
        }

        // Complex rule object
        if (typeof rule === 'object' && !Array.isArray(rule)) {
            const opType = rule.type;
            if (opType === 'array') {
                const val = this.getNested(data, rule.field);
                if (!val) return [];
                if (Array.isArray(val)) return val;
                if (typeof val === 'string') return val.split(',').map(s => s.trim());
                return [String(val)];
            }
            
            if (opType === 'concatenate') {
                const fields = rule.fields || [];
                const separator = rule.separator || '\n';
                const parts = [];
                for (const f of fields) {
                    const v = this.getNested(data, f);
                    if (v) parts.push(String(v));
                }
                return parts.join(separator);
            }

            if (opType === 'concatenate_arrays') {
                const fields = rule.fields || [];
                let combined = [];
                for (const f of fields) {
                    const v = this.getNested(data, f);
                    if (v) {
                        if (Array.isArray(v)) combined.push(...v);
                        else if (typeof v === 'string') combined.push(...v.split(',').map(s => s.trim()));
                    }
                }
                return [...new Set(combined)]; // Unique items
            }

            if (opType === 'salary_text') {
                const raw = this.getNested(data, rule.raw_field);
                return raw ? String(raw) : "";
            }

            if (['segment_desc', 'segment_req', 'segment_ben'].includes(opType)) {
                const raw = this.getNested(data, 'description') || this.getNested(data, 'jobDescription') || this.getNested(data, 'DESCRIPTION') || '';
                const { desc, req, ben } = this.segmenter.segment(raw);
                if (opType === 'segment_desc') return desc;
                if (opType === 'segment_req') return req;
                if (opType === 'segment_ben') return ben;
            }
            
            if (opType === 'constant') {
                return rule.value;
            }
        }
        return null;
    }

    mapJob(jobData, provider, mapping) {
        if (!mapping) {
            return this.emptySchema(jobData, provider);
        }

        const stdJob = {
            internal_job_id: uuidv4(),
            source_metadata: {},
            company_info: {},
            basic_info: {},
            working_conditions: {},
            display_content: {},
            timestamps: {}
        };

        for (const section in mapping) {
            if (section in stdJob) {
                for (const key in mapping[section]) {
                    const rule = mapping[section][key];
                    stdJob[section][key] = this.resolveValue(rule, jobData);
                }
            }
        }

        this.applySchemaDefaults(stdJob, provider);
        return stdJob;
    }

    applySchemaDefaults(stdJob, provider) {
        if (!stdJob.source_metadata.provider) {
            stdJob.source_metadata.provider = provider.toUpperCase();
        }

        // List defaults
        ['industries'].forEach(k => {
            if (stdJob.company_info[k] === null || stdJob.company_info[k] === undefined) stdJob.company_info[k] = [];
        });

        ['levels', 'contract_types', 'working_modes', 'locations', 'majors', 'tags'].forEach(k => {
            if (stdJob.basic_info[k] === null || stdJob.basic_info[k] === undefined) stdJob.basic_info[k] = [];
        });

        // String defaults
        if (!stdJob.timestamps.status) stdJob.timestamps.status = "ACTIVE";
        if (!stdJob.timestamps.crawled_at) stdJob.timestamps.crawled_at = new Date().toISOString();

        // Null strings cleanup
        const excludeNullFix = ['quantity', 'country', 'salary_min', 'salary_max', 'original_url', 'slug', 'logo_url', 'profile_url', 'industries', 'size', 'address'];
        for (const section of Object.keys(stdJob)) {
            if (section === 'internal_job_id') continue;
            for (const k in stdJob[section]) {
                if (stdJob[section][k] === null && !excludeNullFix.includes(k)) {
                    stdJob[section][k] = "";
                }
            }
        }
    }

    emptySchema(jobData, provider) {
        return {
            internal_job_id: uuidv4(),
            source_metadata: {
                provider: provider.toUpperCase(),
                original_id: jobData.id || '',
                original_url: "",
                slug: ""
            },
            company_info: {
                name: "", slug: "", logo_url: "", profile_url: "",
                industries: [], size: "", address: "", country: null
            },
            basic_info: {
                raw_title: "", position: "",
                levels: [], contract_types: [], working_modes: [],
                locations: [], quantity: null, gender: null,
                majors: [], tags: []
            },
            working_conditions: {
                working_time_text: "", working_days: "", overtime_policy: "",
                salary_min: null, salary_max: null, salary_raw_text: "",
                currency: "", is_negotiable: false
            },
            display_content: {
                raw_description: "", raw_requirements: "", raw_benefits: "",
                raw_experience_text: "", raw_reasons: ""
            },
            timestamps: {
                posted_at: "", updated_at: "", deadline_at: "",
                crawled_at: new Date().toISOString(), status: "ACTIVE"
            }
        };
    }
}

export default new DataMapper();
