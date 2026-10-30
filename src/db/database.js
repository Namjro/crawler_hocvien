const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const {
  normalizePhone,
  isMobilePhone,
  parseSocialIdentity,
  detectSportCategory,
  detectLeadType,
  detectLeadIntent,
  calculatePotentialScore,
  estimateStudentsCount
} = require('../utils/phoneParser');

const DATA_DIR = path.join(__dirname, '../../data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const DB_PATH = path.join(DATA_DIR, 'vtc_sport_crm.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

/**
 * Khởi tạo & Nâng cấp (Migrate) cấu trúc bảng lưu trữ lâu dài
 */
function initDatabase() {
  db.exec(`
    -- 1. Bảng Cơ sở Thể thao & Học viên Cá nhân Tiềm năng (Leads)
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      lead_type TEXT DEFAULT 'B2B', -- 'B2C' (Cá nhân HLV/PT/Giáo viên/Học viên) hoặc 'B2B' (Cơ sở/Phòng tập/CLB)
      lead_intent TEXT DEFAULT 'facility', -- 'cert_hunter' (Cần học bằng), 'freelance_coach' (HLV tự do), 'job_seeker' (Tìm việc PT), 'facility' (Cơ sở B2B)
      sport_category TEXT DEFAULT 'gym', -- 'gym', 'yoga', 'dance', 'martial_arts'
      platform TEXT DEFAULT 'google_maps', -- 'facebook', 'tiktok', 'instagram', 'x', 'telegram', 'youtube', 'google_maps', 'web'
      social_handle TEXT DEFAULT '', -- VD: '@coach_nam', 't.me/yogaviet'
      social_url TEXT DEFAULT '', -- Link trực tiếp đến trang cá nhân / bài đăng trên FB, TikTok, IG, X, Telegram
      phone TEXT, -- Số điện thoại chính đã chuẩn hóa (10 số)
      secondary_phones TEXT DEFAULT '',
      is_mobile INTEGER DEFAULT 0,
      zalo_url TEXT DEFAULT '',
      email TEXT DEFAULT '',
      facebook_url TEXT DEFAULT '',
      website TEXT DEFAULT '',
      google_maps_url TEXT DEFAULT '',
      address TEXT DEFAULT '',
      province TEXT DEFAULT '',
      district TEXT DEFAULT '',
      rating REAL DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      potential_score INTEGER DEFAULT 50,
      expected_students INTEGER DEFAULT 1,
      status TEXT DEFAULT 'new', -- 'new', 'contacted', 'interested', 'follow_up', 'closed_won', 'closed_lost'
      source TEXT DEFAULT 'google_maps',
      contact_person TEXT DEFAULT '',
      outreach_count INTEGER DEFAULT 0,
      last_contacted_at TEXT,
      next_follow_up_at TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 2. Bảng Lịch sử Tiếp cận (Outreach Logs)
    CREATE TABLE IF NOT EXISTS outreach_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER NOT NULL,
      channel TEXT NOT NULL, -- 'zalo', 'call', 'tiktok_dm', 'instagram_dm', 'facebook_msg', 'telegram_msg', 'sms'
      outcome TEXT NOT NULL,
      message_sent TEXT DEFAULT '',
      note TEXT DEFAULT '',
      next_follow_up_date TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
    );

    -- 3. Bảng Học viên Đã Chốt Đăng ký (Enrolled Students) - Phục vụ KPI 100 Học viên / Tháng
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id INTEGER,
      full_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      cccd_number TEXT DEFAULT '',
      sport_course TEXT NOT NULL,
      batch_month TEXT NOT NULL,
      tuition_fee INTEGER DEFAULT 6500000,
      discount_amount INTEGER DEFAULT 0,
      paid_amount INTEGER DEFAULT 0,
      payment_status TEXT DEFAULT 'deposit',
      doc_cccd INTEGER DEFAULT 0,
      doc_diploma INTEGER DEFAULT 0,
      doc_photo INTEGER DEFAULT 0,
      doc_form INTEGER DEFAULT 0,
      exam_status TEXT DEFAULT 'waiting',
      notes TEXT DEFAULT '',
      enrolled_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
    );

    -- 4. Bảng Lịch sử Chiến dịch Quét Dữ liệu
    CREATE TABLE IF NOT EXISTS crawl_campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      province TEXT NOT NULL,
      sport_category TEXT NOT NULL,
      source TEXT NOT NULL,
      total_found INTEGER DEFAULT 0,
      new_inserted INTEGER DEFAULT 0,
      duplicates_skipped INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running',
      log_summary TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      completed_at TEXT
    );

    -- 5. Bảng Kịch bản Chốt đơn của Học viện Thể thao VTC
    CREATE TABLE IF NOT EXISTS script_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      sport_category TEXT NOT NULL,
      target_type TEXT NOT NULL, -- 'B2B', 'B2C', 'FOLLOW_UP'
      stage TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );
  `);

  // Safe migration nếu bảng leads đã được tạo từ phiên bản trước
  const existingCols = db.prepare("PRAGMA table_info(leads)").all().map(c => c.name);
  const migrations = [
    { col: 'lead_intent', sql: "ALTER TABLE leads ADD COLUMN lead_intent TEXT DEFAULT 'facility'" },
    { col: 'platform', sql: "ALTER TABLE leads ADD COLUMN platform TEXT DEFAULT 'google_maps'" },
    { col: 'social_handle', sql: "ALTER TABLE leads ADD COLUMN social_handle TEXT DEFAULT ''" },
    { col: 'social_url', sql: "ALTER TABLE leads ADD COLUMN social_url TEXT DEFAULT ''" }
  ];
  for (const m of migrations) {
    if (!existingCols.includes(m.col)) {
      db.exec(m.sql);
    }
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_sport ON leads(sport_category);
    CREATE INDEX IF NOT EXISTS idx_leads_platform ON leads(platform);
    CREATE INDEX IF NOT EXISTS idx_leads_type ON leads(lead_type);
    CREATE INDEX IF NOT EXISTS idx_leads_social_url ON leads(social_url);
  `);

  seedDefaultScripts();
  seedSampleDataIfEmpty();
}

/**
 * Nạp Bộ Kịch bản Chốt đơn cho cả Khách hàng Cá nhân (B2C trên TikTok/IG/FB/Telegram) & Chủ cơ sở (B2B)
 */
function seedDefaultScripts() {
  const b2cCheck = db.prepare("SELECT COUNT(*) as cnt FROM script_templates WHERE target_type = 'B2C'").get().cnt;
  if (b2cCheck > 0) return;

  const insert = db.prepare(`
    INSERT INTO script_templates (title, sport_category, target_type, stage, content)
    VALUES (?, ?, ?, ?, ?)
  `);

  const scripts = [
    // --- NHÓM KỊCH BẢN CÁ NHÂN (B2C - DÙNG CHO TIKTOK / INSTAGRAM / FACEBOOK / TELEGRAM / ZALO) ---
    {
      title: '[B2C Cá nhân - PT Gym Tự do / TikTok & IG Creator] Nhắn tin DM hoặc Zalo tư vấn Chứng chỉ Cục TDTT',
      sport_category: 'gym',
      target_type: 'B2C',
      stage: 'first_touch',
      content: `Chào Coach / PT {{name}} ({{handle}}) ạ! 👋
Mình tình cờ theo dõi kênh chia sẻ kiến thức tập luyện của bạn tại {{province}}, thấy chuyên môn của bạn rất tốt!
Mình liên hệ từ bộ phận Tuyển sinh của Học viện Thể thao VTC (https://hocvienthethao.vtcedu.vn/).

Hiện tại Cục Thể dục Thể thao Việt Nam phối hợp cùng Học viện VTC đang mở lớp Tập huấn cấp "Giấy chứng nhận chuyên môn Huấn luyện viên Thể dục Thể hình & Fitness" (QĐ 3843/QĐ-BVHTTDL):
✅ Văn bằng chính thống do CỤC THỂ DỤC THỂ THAO VIỆT NAM cấp (giá trị toàn quốc & vô thời hạn — điều kiện bắt buộc để PT hành nghề hợp pháp, xin vào các hệ thống Gym lớn hoặc tự mở Private Studio riêng).
✅ Học Lý thuyết ONLINE từ xa cực kỳ tiện lợi, không làm gián đoạn lịch dạy khách 1:1 hàng ngày của bạn.

Không biết {{name}} đã có chứng chỉ của Cục TDTT chưa để mình gửi lịch khai giảng và chính sách ưu đãi học phí khóa gần nhất cho bạn tham khảo nhé?`
    },
    {
      title: '[B2C Cá nhân - Cô giáo / HLV Yoga trên TikTok, IG, FB] Chuẩn hóa Chứng nhận Cục TDTT Việt Nam',
      sport_category: 'yoga',
      target_type: 'B2C',
      stage: 'first_touch',
      content: `Chào cô giáo / HLV Yoga {{name}} ({{handle}}) ạ! 🧘‍♀️
Mình theo dõi trang cá nhân của bạn tại {{province}} và rất ấn tượng với các bài hướng dẫn Yoga của bạn.
Mình bên bộ phận Tuyển sinh của Học viện Thể thao VTC (https://hocvienthethao.vtcedu.vn/).

Hiện nay nhiều HLV Yoga đã có chứng chỉ 200h/300h của các trung tâm hoặc Yoga Alliance, nhưng theo Luật Thể dục Thể thao (Nghị định 36/2019/NĐ-CP) khi đứng lớp giảng dạy hoặc mở phòng tập tại Việt Nam vẫn bắt buộc phải có "Giấy chứng nhận tập huấn chuyên môn Yoga do Cục Thể dục Thể thao Việt Nam cấp".

Đợt này VTC phối hợp cùng Cục TDTT tổ chức lớp Tập huấn chuyên môn HLV Yoga:
- Học Lý thuyết ONLINE tại nhà + chỉ tập trung ngắn ngày kiểm tra thực hành.
- Chứng nhận do CỤC THỂ DỤC THỂ THAO VIỆT NAM cấp (giá trị toàn quốc).

Mình gửi thông tin khóa học và hồ sơ đăng ký qua đây (hoặc Zalo) để {{name}} tham khảo bổ sung văn bằng Nhà nước nhé ạ!`
    },
    {
      title: '[B2C Cá nhân - Giáo viên Zumba / Shuffle Dance / Dân vũ] Nhắn TikTok/FB/Zalo cấp Chứng chỉ QĐ 557',
      sport_category: 'dance',
      target_type: 'B2C',
      stage: 'first_touch',
      content: `Chào HLV / Giáo viên {{name}} ({{handle}}) ạ! 💃
Mình thấy các video dạy nhảy Zumba / Shuffle Dance / Dân vũ của bạn trên mạng xã hội rất năng lượng và thu hút nhiều học viên!
Mình liên hệ từ Học viện Thể thao VTC (https://hocvienthethao.vtcedu.vn/).

Hiện Bộ VHTTDL đã ban hành Quyết định 557/QĐ-BVHTTDL chính thức cấp chứng chỉ hành nghề cho môn "Dân vũ thể thao & Vũ đạo thể thao giải trí" (Zumba, Shuffle Dance, Hip hop, Aerobic, Khiêu vũ, Dân vũ...).
Khi sở hữu Giấy chứng nhận do CỤC THỂ DỤC THỂ THAO VIỆT NAM cấp qua khóa tập huấn của VTC:
- Bạn hoàn toàn đủ pháp lý tự mở lớp thu học phí, mở CLB hoặc ký hợp đồng dạy tại các Trung tâm, Trường học, Nhà văn hóa trên toàn quốc.
- Học lý thuyết Online buổi tối rất linh hoạt.

Mình gửi {{name}} lịch khai giảng khóa Dân vũ & Vũ đạo sắp tới của VTC để bạn tham khảo nhé!`
    },
    {
      title: '[B2C Cá nhân - HLV Võ cổ truyền / Võ thuật] Tư vấn Chứng nhận Huấn luyện viên Cục TDTT',
      sport_category: 'martial_arts',
      target_type: 'B2C',
      stage: 'first_touch',
      content: `Chào Thầy / HLV {{name}} ({{handle}}) ạ! 🥋
Em liên hệ từ bộ phận Tuyển sinh Học viện Thể thao VTC (https://hocvienthethao.vtcedu.vn/) phối hợp cùng Cục Thể dục Thể thao Việt Nam.
Hiện Học viện đang mở khóa Tập huấn chuyên môn Người hướng dẫn tập luyện môn Võ cổ truyền (theo Thông tư 07/2021/TT-BVHTTDL), cấp Giấy chứng nhận trực tiếp bởi CỤC THỂ DỤC THỂ THAO VIỆT NAM (giá trị toàn quốc để đứng lớp tại các điểm tập, trường học, CLB).
Khóa học kết hợp Lý thuyết Online từ xa rất thuận tiện. Em xin phép gửi thông tin chi tiết để {{name}} tham khảo ạ!`
    },
    // --- NHÓM KỊCH BẢN CƠ SỞ / CÂU LẠC BỘ (B2B) ---
    {
      title: '[B2B Chủ Phòng Gym/CLB] Tiếp cận Chủ cơ sở chuẩn hóa Pháp lý & Đội ngũ PT (Chốt sỉ 3-5 HV)',
      sport_category: 'gym',
      target_type: 'B2B',
      stage: 'first_touch',
      content: `Chào anh/chị Quản lý {{name}} tại {{province}} ạ!
Em liên hệ từ bộ phận Tuyển sinh của Học viện Thể thao VTC (https://hocvienthethao.vtcedu.vn/).
Hiện Cục Thể dục Thể thao Việt Nam phối hợp cùng VTC đang mở đợt Tập huấn cấp "Giấy chứng nhận chuyên môn HLV Thể dục Thể hình & Fitness" (QĐ 3843/QĐ-BVHTTDL).
- Chứng nhận do CỤC TDTT VIỆT NAM cấp — điều kiện bắt buộc theo Nghị định 36/2019/NĐ-CP khi đoàn kiểm tra cơ sở hoặc xin giấy phép.
- Học Lý thuyết ONLINE từ xa, PT không phải nghỉ làm. Có ưu đãi giảm học phí khi đăng ký theo nhóm phòng tập.
Hiện bên phòng mình có mấy bạn PT chưa có chứng chỉ Cục TDTT để em gửi báo giá ưu đãi nhóm qua Zalo ạ?`
    },
    {
      title: '[Follow-up Chốt Đơn Cá nhân & Cơ sở] Nhắc hạn chốt danh sách hồ sơ khóa gần nhất',
      sport_category: 'all',
      target_type: 'FOLLOW_UP',
      stage: 'follow_up',
      content: `Chào bạn {{name}} ạ! Hôm trước mình có gửi thông tin khóa Tập huấn cấp Chứng chỉ chuyên môn của Cục Thể dục Thể thao Việt Nam (tổ chức bởi Học viện Thể thao VTC).
Hiện tại danh sách lớp tháng này đang chốt chỉ tiêu cuối để Cục TDTT duyệt danh sách học viên vào học Lý thuyết Online.
Hồ sơ đăng ký giữ suất ưu đãi ban đầu chỉ cần chụp ảnh CCCD + ảnh thẻ 3x4 gửi trước, hồ sơ giấy bổ sung sau.
Bạn đăng ký tham gia đợt này luôn để mình lên danh sách giữ suất ưu đãi học phí cho bạn nhé?`
    }
  ];

  for (const s of scripts) {
    insert.run(s.title, s.sport_category, s.target_type, s.stage, s.content);
  }
}

/**
 * Nạp dữ liệu mẫu bao gồm cả Khách hàng Cá nhân (B2C trên TikTok, IG, FB, Telegram, X) và Cơ sở (B2B)
 */
function seedSampleDataIfEmpty() {
  const b2cCount = db.prepare("SELECT COUNT(*) as cnt FROM leads WHERE lead_type = 'B2C'").get().cnt;
  if (b2cCount > 0) return;

  const sampleLeads = [
    {
      name: 'PT Hoàng Minh - Personal Trainer Kèm 1:1',
      lead_type: 'B2C',
      lead_intent: 'freelance_coach',
      sport_category: 'gym',
      platform: 'tiktok',
      social_handle: '@pt_hoangminh.fitness',
      social_url: 'https://www.tiktok.com/@pt_hoangminh.fitness',
      phone: '0968112233',
      address: 'Quận Đống Đa, Hà Nội',
      province: 'Hà Nội',
      status: 'new',
      source: 'tiktok_b2c',
      contact_person: 'Hoàng Minh (PT Tự do)',
      expected_students: 1,
      notes: '[TikTok Bio] PT tự do nhận kèm 1:1 giảm mỡ tăng cơ tại Hà Nội. Chưa có chứng chỉ Cục TDTT.'
    },
    {
      name: 'Cô Giáo Thảo - Yoga & Trị Liệu Cổ Vai Gáy',
      lead_type: 'B2C',
      lead_intent: 'freelance_coach',
      sport_category: 'yoga',
      platform: 'instagram',
      social_handle: '@thaoyoga.official',
      social_url: 'https://www.instagram.com/thaoyoga.official',
      phone: '0934556677',
      address: 'Quận Cầu Giấy, Hà Nội',
      province: 'Hà Nội',
      status: 'new',
      source: 'instagram_b2c',
      contact_person: 'Thảo Yoga',
      expected_students: 1,
      notes: '[Instagram Bio] Giáo viên Yoga dạy kèm tại nhà & Online. Mới có bằng 200h tư nhân, rất cần chứng nhận Cục TDTT.'
    },
    {
      name: 'HLV Ngọc Linh - Shuffle Dance & Zumba',
      lead_type: 'B2C',
      lead_intent: 'freelance_coach',
      sport_category: 'dance',
      platform: 'tiktok',
      social_handle: '@linhshuffle.dance',
      social_url: 'https://www.tiktok.com/@linhshuffle.dance',
      phone: '0979223344',
      address: 'TP. Hải Phòng',
      province: 'Hải Phòng',
      status: 'interested',
      source: 'tiktok_b2c',
      contact_person: 'Ngọc Linh',
      expected_students: 1,
      next_follow_up_at: new Date().toISOString().slice(0, 10),
      notes: '[TikTok Creator] Đang mở 3 lớp Shuffle Dance buổi tối thu học phí, muốn học lấy bằng Dân vũ & Vũ đạo QĐ 557 của Cục TDTT.'
    },
    {
      name: 'Trần Quốc Tuấn - Tìm Việc PT Gym / Kickfit',
      lead_type: 'B2C',
      lead_intent: 'job_seeker',
      sport_category: 'gym',
      platform: 'facebook',
      social_handle: 'fb/tranquoctuan.pt',
      social_url: 'https://www.facebook.com/tranquoctuan.pt',
      phone: '0389445566',
      address: 'Quận Thanh Xuân, Hà Nội',
      province: 'Hà Nội',
      status: 'new',
      source: 'facebook_b2c',
      contact_person: 'Quốc Tuấn',
      expected_students: 1,
      notes: '[Bài đăng Group Tuyển dụng PT] Em có 2 năm kinh nghiệm tập luyện cần tìm việc PT ca chiều tối, chưa có chứng chỉ hành nghề.'
    },
    {
      name: 'Cộng Đồng HLV Thể Hình & Yoga Việt Nam (Telegram)',
      lead_type: 'B2C',
      lead_intent: 'cert_hunter',
      sport_category: 'gym',
      platform: 'telegram',
      social_handle: '@pt_fitness_vn',
      social_url: 'https://t.me/pt_fitness_vn',
      phone: '',
      address: 'Toàn quốc',
      province: 'Hà Nội',
      status: 'new',
      source: 'telegram_b2c',
      contact_person: 'Admin / Member @pt_fitness_vn',
      expected_students: 1,
      notes: '[Telegram Channel/Group] Nhóm trao đổi việc làm PT & hỏi đáp thi chứng chỉ HLV Cục TDTT (Liên hệ qua Telegram DM).'
    }
  ];

  for (const item of sampleLeads) {
    upsertLead(item);
  }
}

/**
 * Thêm mới hoặc Cập nhật thông tin Khách hàng Cá nhân (B2C) / Cơ sở (B2B)
 * Chống trùng lặp tuyệt đối theo:
 * 1. Số điện thoại (nếu có)
 * 2. Hoặc Link Profile Mạng Xã Hội (`social_url`) / `@social_handle` (đối với khách cá nhân trên TikTok, IG, FB, X, Telegram ẩn SĐT)
 */
function upsertLead(rawLead) {
  const normPhone = normalizePhone(rawLead.phone);
  const socialIdentity = parseSocialIdentity(
    rawLead.social_url || rawLead.facebook_url || rawLead.website || '',
    `${rawLead.name || ''} ${rawLead.notes || ''}`
  );

  const platform = rawLead.platform || socialIdentity.platform || 'web';
  const socialHandle = rawLead.social_handle || socialIdentity.handle || '';
  const socialUrl = rawLead.social_url || socialIdentity.socialUrl || rawLead.facebook_url || '';

  const sportCategory = rawLead.sport_category || detectSportCategory(`${rawLead.name} ${rawLead.notes || ''}`);
  const leadType = rawLead.lead_type || detectLeadType(rawLead.name, rawLead.notes, socialUrl);
  const leadIntent = rawLead.lead_intent || detectLeadIntent(rawLead.name, rawLead.notes, leadType);

  const mobileFlag = normPhone && isMobilePhone(normPhone) ? 1 : 0;
  const zaloUrl = mobileFlag ? `https://zalo.me/${normPhone}` : '';

  // Kiểm tra trùng lặp:
  // Bước 1: Kiểm tra theo SĐT
  let existing = null;
  if (normPhone) {
    existing = db.prepare('SELECT * FROM leads WHERE phone = ?').get(normPhone);
  }
  // Bước 2: Kiểm tra theo social_url hoặc social_handle (dành cho cá nhân TikTok/IG/FB/Telegram/X)
  if (!existing && socialUrl && socialUrl.length > 12) {
    existing = db.prepare('SELECT * FROM leads WHERE lower(social_url) = lower(?)').get(socialUrl);
  }
  if (!existing && socialHandle && socialHandle.length > 3) {
    existing = db.prepare('SELECT * FROM leads WHERE lower(social_handle) = lower(?) AND platform = ?')
      .get(socialHandle, platform);
  }
  // Bước 3: Kiểm tra theo Tên + Tỉnh
  if (!existing && rawLead.name && rawLead.province) {
    existing = db.prepare('SELECT * FROM leads WHERE lower(name) = lower(?) AND lower(province) = lower(?)')
      .get(rawLead.name.trim(), rawLead.province.trim());
  }

  const score = calculatePotentialScore({
    phone: normPhone,
    social_handle: socialHandle,
    social_url: socialUrl,
    facebook_url: rawLead.facebook_url,
    website: rawLead.website,
    review_count: rawLead.review_count,
    address: rawLead.address,
    lead_intent: leadIntent
  });

  const expectedStudents = rawLead.expected_students || estimateStudentsCount(leadType, sportCategory);

  if (existing) {
    const updatedFb = existing.facebook_url || rawLead.facebook_url || (platform === 'facebook' ? socialUrl : '');
    const updatedSocialUrl = existing.social_url || socialUrl || '';
    const updatedHandle = existing.social_handle || socialHandle || '';
    const updatedPhone = existing.phone || normPhone || null;
    const updatedZalo = existing.zalo_url || zaloUrl || '';

    db.prepare(`
      UPDATE leads
      SET facebook_url = ?, social_url = ?, social_handle = ?, phone = ?, zalo_url = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(updatedFb, updatedSocialUrl, updatedHandle, updatedPhone, updatedZalo, existing.id);

    return { action: 'skipped_duplicate', leadId: existing.id, existingStatus: existing.status };
  }

  const stmt = db.prepare(`
    INSERT INTO leads (
      name, lead_type, lead_intent, sport_category, platform, social_handle, social_url,
      phone, secondary_phones, is_mobile, zalo_url,
      email, facebook_url, website, google_maps_url, address, province, district,
      rating, review_count, potential_score, expected_students, status, source,
      contact_person, next_follow_up_at, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    (rawLead.name || socialHandle || 'Học viên Tiềm năng').trim(),
    leadType,
    leadIntent,
    sportCategory,
    platform,
    socialHandle,
    socialUrl,
    normPhone || null,
    rawLead.secondary_phones || '',
    mobileFlag,
    zaloUrl,
    rawLead.email || '',
    rawLead.facebook_url || (platform === 'facebook' ? socialUrl : ''),
    rawLead.website || '',
    rawLead.google_maps_url || '',
    rawLead.address || '',
    rawLead.province || '',
    rawLead.district || '',
    Number(rawLead.rating || 0),
    Number(rawLead.review_count || 0),
    score,
    expectedStudents,
    rawLead.status || 'new',
    rawLead.source || platform,
    rawLead.contact_person || socialHandle || '',
    rawLead.next_follow_up_at || null,
    rawLead.notes || ''
  );

  return { action: 'inserted', leadId: Number(result.lastInsertRowid) };
}

/**
 * Ghi nhận Lịch sử Tiếp cận (Outreach Log)
 */
function addOutreachLog({ lead_id, channel, outcome, message_sent = '', note = '', next_follow_up_date = null, new_status = null }) {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
  if (!lead) throw new Error('Không tìm thấy cơ sở/học viên tiềm năng');

  db.prepare(`
    INSERT INTO outreach_logs (lead_id, channel, outcome, message_sent, note, next_follow_up_date)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(lead_id, channel, outcome, message_sent, note, next_follow_up_date || null);

  let statusToSet = new_status || lead.status;
  if (!new_status) {
    if (outcome === 'enrolled') statusToSet = 'closed_won';
    else if (outcome === 'already_certified' || outcome === 'rejected') statusToSet = 'closed_lost';
    else if (outcome === 'answered_interested') statusToSet = 'interested';
    else if (outcome === 'callback_later') statusToSet = 'follow_up';
    else if (lead.status === 'new') statusToSet = 'contacted';
  }

  const followUpToSet = next_follow_up_date !== undefined ? next_follow_up_date : lead.next_follow_up_at;

  db.prepare(`
    UPDATE leads
    SET status = ?,
        outreach_count = outreach_count + 1,
        last_contacted_at = datetime('now', 'localtime'),
        next_follow_up_at = ?,
        notes = CASE WHEN ? != '' THEN ? ELSE notes END,
        updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(statusToSet, followUpToSet || null, note, note, lead_id);

  return db.prepare('SELECT * FROM leads WHERE id = ?').get(lead_id);
}

/**
 * Sao lưu Database định kỳ
 */
function backupDatabase() {
  const dateStr = new Date().toISOString().slice(0, 10);
  const backupFile = path.join(BACKUP_DIR, `vtc_sport_crm_backup_${dateStr}.sqlite`);
  try {
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupFile);
    }
    return backupFile;
  } catch (err) {
    console.error('Backup warning:', err.message);
    return null;
  }
}

initDatabase();

module.exports = {
  db,
  upsertLead,
  addOutreachLog,
  backupDatabase,
  DB_PATH
};
