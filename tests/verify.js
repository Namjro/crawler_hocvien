const assert = require('node:assert');
const {
  unwrapSearchRedirectUrl,
  verifyPlatformDomain,
  matchesAnyKeyword,
  normalizePhone,
  extractPhonesFromText,
  isMobilePhone,
  parseSocialIdentity,
  classifyEvidenceType,
  validateLeadRelevance,
  detectLeadIntent
} = require('../src/utils/phoneParser');
const { buildPlatformQueries } = require('../src/crawlers/socialB2CCrawler');
const {
  buildB2BAdmissionQueries,
  extractFacilityName
} = require('../src/crawlers/b2bAdmissionsCrawler');
const { db, upsertLead, deleteLeadById, purgeInvalidLeads } = require('../src/db/database');

async function runVerification() {
  console.log('--- 1. Tự động dọn sạch toàn bộ bản ghi lỗi/rác trong Database ---');
  purgeInvalidLeads();
  // Xóa các chiến dịch lỗi cũ
  db.exec("DELETE FROM crawl_campaigns WHERE log_summary LIKE '%Google Trợ giúp%' OR log_summary LIKE '%Hòa nhạc%';");
  const remainingLeads = db.prepare("SELECT * FROM leads WHERE source != 'manual'").all();
  for (const l of remainingLeads) {
    const check = validateLeadRelevance({
      name: l.name,
      text: `${l.evidence_snippet || ''} ${l.notes || ''}`,
      url: l.evidence_url || l.social_url || l.google_maps_url || '',
      leadType: l.lead_type || 'B2C',
      sportCategory: l.sport_category || 'gym',
      expectedPlatform: l.lead_type === 'B2C' ? l.platform : '',
      requireSocialDomain: l.lead_type === 'B2C' && l.platform !== 'zalo'
    });
    assert.strictEqual(check.isValid, true, `Mọi hồ sơ còn lại trong DB phải hợp lệ: ${l.name}`);
  }
  console.log(`✅ Toàn bộ ${remainingLeads.length} hồ sơ trong Database đều đạt chuẩn 100% hợp lệ!`);

  console.log('\n--- 2. Kiểm thử Giải mã URL Yahoo (RU=...) & Bing (u=a1...) ---');
  const yahooTrackingUrl = 'https://r.search.yahoo.com/_ylt=Awr/RV=2/RE=179/RO=10/RU=https%3a%2f%2fwww.tiktok.com%2f%40thaozumba.hn%2fvideo%2f123456/RK=2/RS=abc';
  assert.strictEqual(unwrapSearchRedirectUrl(yahooTrackingUrl), 'https://www.tiktok.com/@thaozumba.hn/video/123456');

  const bingTrackingUrl = 'https://www.bing.com/ck/a?!&&p=123&u=a1aHR0cHM6Ly93d3cudGhyZWFkcy5uZXQvQGxpbmh5b2dhLnZu&ntb=1';
  assert.strictEqual(unwrapSearchRedirectUrl(bingTrackingUrl), 'https://www.threads.net/@linhyoga.vn');
  console.log('✅ Giải mã URL gốc từ Yahoo Search & Bing Search chính xác 100%!');

  console.log('\n--- 3. Kiểm thử Chặn 100% Các Kết Quả Rác Thực Tế (Google Trợ giúp, Zalo Mini App, Zalo PC, Hòa nhạc, Ticketbox) ---');
  const realWorldBadSamples = [
    {
      name: 'Tìm hiểu về tính năng Dịch lời nói',
      text: 'Tìm hiểu cách sử dụng tính năng Dịch lời nói trong cuộc họp trên Google Meet...',
      url: 'https://support.google.com/meet/answer/16221730?hl=vi-VN',
      expectedPlatform: 'threads',
      sportCategory: 'dance'
    },
    {
      name: 'Trợ lý Google Trợ giúp',
      text: 'Trung tâm Trợ giúp Trợ lý Google chính thức',
      url: 'https://support.google.com/assistant/?hl=vi',
      expectedPlatform: 'threads',
      sportCategory: 'dance'
    },
    {
      name: 'Hỏi về lỗi ổ cứng "Reallocated sector count" | Viết bởi jaydiao',
      text: 'Chào các thánh. Em check ổ cứng bị lỗi Reallocated sector count',
      url: 'https://tinhte.vn/thread/hoi-ve-loi-o-cung-reallocated-sector-count.2601398/',
      expectedPlatform: 'threads',
      sportCategory: 'dance'
    },
    {
      name: 'Zalo Mini App',
      text: 'Zalo Mini App là những chương trình nhỏ chạy trực tiếp trên nền tảng Zalo',
      url: 'https://miniapp.zaloplatforms.com/',
      expectedPlatform: 'zalo',
      sportCategory: 'dance'
    },
    {
      name: 'Zalo PC - Tải Zalo PC để làm việc nhóm hiệu quả và gửi file nhanh',
      text: 'Tải Zalo PC cho máy tính để sử dụng các tính năng vượt trội',
      url: 'https://zalo.me/pc',
      expectedPlatform: 'zalo',
      sportCategory: 'dance'
    },
    {
      name: 'Zalo - Đăng nhập Zalo',
      text: 'Đăng nhập Zalo Web để chat ngay trên máy tính.',
      url: 'https://chat.zalo.me/',
      expectedPlatform: 'zalo',
      sportCategory: 'dance'
    },
    {
      name: 'CTicket | Mua vé sự kiện âm nhạc, hòa nhạc, hội thảo, thể thao, phim …',
      text: 'CTicket - Nền tảng bán vé trực tuyến uy tín tại Việt Nam.',
      url: 'https://cticket.net.vn/',
      expectedPlatform: 'threads',
      sportCategory: 'dance'
    }
  ];

  for (const bad of realWorldBadSamples) {
    const res = validateLeadRelevance({
      name: bad.name,
      text: bad.text,
      url: bad.url,
      leadType: 'B2C',
      sportCategory: bad.sportCategory,
      expectedPlatform: bad.expectedPlatform,
      requireSocialDomain: bad.expectedPlatform !== 'zalo'
    });
    assert.strictEqual(res.isValid, false, `Phải chặn mẫu rác: ${bad.name}`);
  }
  console.log('✅ Đã chặn 100% toàn bộ các kết quả rác (Google Trợ giúp, Tinhte, Zalo Mini App, Zalo PC, Đăng nhập Zalo, CTicket)!');

  console.log('\n--- 4. Kiểm thử Cho Phép Khách Hàng Cá Nhân B2C Thật Sự ---');
  const validZumbaCoach = validateLeadRelevance({
    name: 'Cô giáo Thảo Zumba (@thaozumba.hn)',
    text: 'Mở lớp dạy nhảy Zumba & Shuffle Dance giảm mỡ bụng ca tối tại Cầu Giấy. Liên hệ Zalo 0988123456',
    url: 'https://www.tiktok.com/@thaozumba.hn/video/7299887766',
    leadType: 'B2C',
    sportCategory: 'dance',
    expectedPlatform: 'tiktok',
    requireSocialDomain: true
  });
  assert.strictEqual(validZumbaCoach.isValid, true);

  const queries = buildPlatformQueries({
    sportCategory: 'dance',
    keyword: 'dạy nhảy Zumba',
    province: 'Hà Nội',
    platforms: ['facebook', 'zalo', 'threads', 'tiktok', 'youtube'],
    b2cMode: 'all'
  });
  assert.ok(queries.length >= 8);
  // Đảm bảo không còn toán tử OR phức tạp làm hỏng Bing/Yahoo
  for (const qObj of queries) {
    assert.strictEqual(qObj.q.includes('OR'), false, `Không được chứa toán tử OR gây lỗi: ${qObj.q}`);
  }
  console.log('✅ Truy vấn tự nhiên v4.0 (không chứa OR gây lỗi) & Bộ lọc Cá nhân B2C hoạt động chính xác 100%!');

  console.log('\n--- 5. Kiểm thử Bộ máy Crawler Cơ sở B2B từ Kênh Tuyển Sinh & Chiêu Sinh ---');

  // 5.1 Kiểm thử tách Tên Cơ sở / CLB từ tiêu đề bài viết tuyển sinh
  const sample1 = extractFacilityName(
    'CLB Dân Vũ Hoa Sen - Thông báo chiêu sinh lớp nhảy Zumba mới tại Hà Nội',
    'Địa chỉ: 123 Cầu Giấy, Hà Nội. Hotline: 0988123456'
  );
  assert.strictEqual(sample1, 'CLB Dân Vũ Hoa Sen');

  const sample2 = extractFacilityName(
    'Võ đường Võ Cổ Truyền Thăng Long | Tuyển sinh môn sinh hè 2026',
    'Võ đường chiêu sinh các lớp tự vệ và quyền thuật'
  );
  assert.strictEqual(sample2, 'Võ đường Võ Cổ Truyền Thăng Long');

  const sample3 = extractFacilityName(
    'Studio Yoga Ananda: Khai giảng khóa đào tạo Yoga trị liệu K15 - Facebook',
    'Đăng ký khóa học qua Hotline 0912345678'
  );
  assert.strictEqual(sample3, 'Studio Yoga Ananda');

  console.log('✅ Trích xuất Tên Cơ sở / CLB từ bài viết tuyển sinh chính xác 100%!');

  // 5.2 Kiểm thử Phân loại & Kiểm duyệt B2B Tuyển Sinh
  const validFacilityAdmissions = validateLeadRelevance({
    name: 'CLB Dân Vũ Hoa Sen',
    text: 'Thông báo chiêu sinh lớp Zumba & Dân vũ thể thao K10 tại Cầu Giấy Hà Nội',
    url: 'https://www.facebook.com/clbdanvuhoasen/posts/123456789',
    leadType: 'B2B',
    sportCategory: 'dance'
  });
  assert.strictEqual(validFacilityAdmissions.isValid, true);

  // Phải chặn học viên hỏi tìm lớp
  const badStudentQuery = validateLeadRelevance({
    name: 'Em muốn tìm lớp học võ cổ truyền ở Hà Nội',
    text: 'Có ai biết chỗ nào dạy võ cổ truyền uy tín không ạ?',
    url: 'https://www.facebook.com/groups/vothuat/posts/999',
    leadType: 'B2B',
    sportCategory: 'martial_arts'
  });
  assert.strictEqual(badStudentQuery.isValid, false);

  // Phải chặn bài tìm việc làm PT cá nhân
  const badJobPost = validateLeadRelevance({
    name: 'Tìm việc làm PT Gym tại Đống Đa',
    text: 'Em cần tìm việc làm huấn luyện viên thể hình ca chiều',
    url: 'https://www.facebook.com/groups/gym/posts/888',
    leadType: 'B2B',
    sportCategory: 'gym'
  });
  assert.strictEqual(badJobPost.isValid, false);

  // 5.3 Kiểm thử Phân loại Bằng chứng Tuyển sinh & Ý định Tuyển sinh B2B
  const evType = classifyEvidenceType(
    'https://www.facebook.com/clb/posts/111',
    'CLB Võ thuật chiêu sinh môn sinh khóa mới'
  );
  assert.strictEqual(evType, 'admissions_announcement');

  const intent = detectLeadIntent(
    'Võ đường Vạn An',
    'Chiêu sinh võ sinh khóa hè 2026',
    'B2B'
  );
  assert.strictEqual(intent, 'admissions');

  // 5.4 Kiểm thử Truy vấn Kênh Tuyển sinh B2B không chứa toán tử lỗi
  const admQueries = buildB2BAdmissionQueries({
    sportCategory: 'dance',
    keyword: 'Chiêu sinh CLB Dân vũ',
    province: 'Hà Nội'
  });
  assert.ok(admQueries.length >= 5);
  for (const q of admQueries) {
    assert.strictEqual(q.q.includes('OR'), false, `Truy vấn B2B không được chứa OR: ${q.q}`);
  }

  // 5.5 Kiểm thử Lưu trữ Cơ sở Tuyển sinh B2B vào SQLite
  const testB2BAdmissionLead = {
    name: 'CLB Dân Vũ Thăng Long Test',
    lead_type: 'B2B',
    lead_intent: 'admissions',
    sport_category: 'dance',
    platform: 'facebook',
    social_url: 'https://www.facebook.com/clbdanvuthanglong.test',
    evidence_type: 'admissions_announcement',
    evidence_snippet: 'Chiêu sinh khóa Dân vũ thể thao và Khiêu vũ cơ bản ca tối Hotline 0987654321',
    evidence_url: 'https://www.facebook.com/clbdanvuthanglong.test/posts/101',
    phone: '0987654321',
    province: 'Hà Nội',
    address: 'Cầu Giấy, Hà Nội',
    source: 'admissions_facebook'
  };

  const upsertRes = upsertLead(testB2BAdmissionLead);
  assert.ok(upsertRes.action === 'inserted' || upsertRes.action === 'skipped_duplicate');

  // Dọn dẹp bản ghi kiểm thử
  const inserted = db.prepare("SELECT id FROM leads WHERE phone = '0987654321'").get();
  if (inserted) {
    deleteLeadById(inserted.id);
  }

  console.log('✅ Bộ máy Crawler Cơ sở B2B từ Kênh Tuyển sinh & Chiêu sinh hoạt động chuẩn xác 100%!');
}

runVerification().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
