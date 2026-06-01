import { BaseApiScraper } from './base/BaseApiScraper.js';

class CongViecLamHanoiScraper extends BaseApiScraper {
  constructor() {
    super('congvieclam_hanoi');
    this.config = {
      ...this.config,
      headless: true,
      concurrency: 3,
      pageDelayMs: [2000, 4000],
      detailDelayMs: [1000, 2000],
      startPage: 1
    };
  }

  buildListUrl(pageNum) {
    return `https://gateway-congvieclam.hanoi.gov.vn/api/CongBoNguoiSdLaoDong/TatCa?Code=&NganhKinhDoanh=&TrinhDoHocVan=&XaPhuongId=&TrinhDoCMKT=&MucLuong=&TinhChatCongViec=&HanNopFrom=&HanNopTo=&TenCongViec=&PageIndex=${pageNum}&PageSize=10`;
  }

  buildDetailUrl(jobId) {
    return `https://gateway-congvieclam.hanoi.gov.vn/api/CongBoNguoiSdLaoDong/GetbyId?id=${jobId}`;
  }

  extractItemsFromListRes(json) {
    if (Array.isArray(json)) return json;
    if (json && json.data && Array.isArray(json.data)) return json.data;
    
    // Fallback search
    const searchArray = (obj) => {
      if (Array.isArray(obj)) return obj;
      if (obj && typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
          if (Array.isArray(obj[key]) && obj[key].length > 0) return obj[key];
        }
      }
      return [];
    };
    return searchArray(json);
  }

  normalizeJob(listData, detailData = {}) {
    // API chi tiết trả về bọc trong key 'nguoiSdLaoDong'
    const detail = detailData.nguoiSdLaoDong || detailData || {};

    const title = detail.tenCongViec || listData.tenCongViec || 'Không rõ chức danh';
    const company = detail.ten || listData.ten || 'Không rõ công ty';
    const description = detail.nhiemVu || listData.nhiemVu || '';
    const requirements = detail.trachNhiem || listData.trachNhiem || '';
    const benefits = detail.quyenHan || listData.quyenHan || '';
    
    // Mức lương (Thường trả về mã số, ví dụ 3, 5, 6...)
    // Hoặc lấy trực tiếp nếu là text
    let salary = (detail.mucLuong || listData.mucLuong || '').toString();
    
    // Địa điểm làm việc
    let location = detail.diaChiChiTietFull || detail.diaChi || listData.xaPhuong || '';
    
    // Kinh nghiệm
    const experience = detail.kinhNghiem || listData.kinhNghiem || '';
    
    // Hạn nộp
    const deadline = detail.ngayHetHan || listData.ngayHetHan || '';

    // Lấy thông tin liên hệ từ trang chi tiết
    const contact_person = detail.daiDien || '';
    const contact_email = detail.email || detail.emailLh || '';
    const contact_phone = detail.sdt || detail.sdtLh || '';
    
    let contactInfo = contact_person;
    if (contact_phone) contactInfo += ` - ${contact_phone}`;
    if (contact_email) contactInfo += ` - ${contact_email}`;

    return {
      id: (detail.id || listData.id || `job_${Math.random().toString(36).substr(2, 9)}`).toString(),
      url: `https://congvieclam.hanoi.gov.vn/viec-tim-nguoi/chi-tiet/${detail.id || listData.id}`,
      job_title: title,
      company_name: company,
      description: description,
      requirements: requirements,
      benefits: benefits,
      salary: salary,
      experience: experience,
      location: location,
      deadline: deadline,
      contact_person: contactInfo.trim(),
      industries: [detail.sanPham || listData.nganhKinhDoanh].filter(Boolean),
      scrapedAt: new Date().toISOString()
    };
  }
}

export const runScraper = () => new CongViecLamHanoiScraper().run();
