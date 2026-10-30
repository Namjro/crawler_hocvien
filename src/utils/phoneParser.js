/**
 * Bộ xử lý, chuẩn hóa Số Điện Thoại Việt Nam, nhận diện Nền tảng Mạng Xã Hội (FB, TikTok, IG, X, Telegram),
 * phân loại Khách hàng Cá nhân (B2C) vs Cơ sở (B2B) và chấm điểm Tiềm năng (Lead Scoring)
 */

const VIETNAMESE_MOBILE_PREFIXES = [
  // Viettel
  '086', '096', '097', '098', '032', '033', '034', '035', '036', '037', '038', '039',
  // Vinaphone
  '088', '091', '094', '083', '084', '085', '081', '082',
  // Mobifone
  '089', '090', '093', '070', '079', '077', '076', '078',
  // Vietnamobile & Gmobile
  '092', '056', '058', '099', '059', '087', '055'
];

/**
 * Chuẩn hóa số điện thoại về dạng 10 chữ số (VD: 0987654321) hoặc số máy bàn
 */
function normalizePhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  let cleaned = rawPhone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && (cleaned.length === 11 || cleaned.length === 12)) {
    cleaned = '0' + cleaned.slice(2);
  }

  if (!/^0\d{9,10}$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Kiểm tra xem SĐT có phải số di động (dùng được Zalo) hay không
 */
function isMobilePhone(phone) {
  const norm = normalizePhone(phone);
  if (!norm || norm.length !== 10) return false;
  const prefix = norm.slice(0, 3);
  return VIETNAMESE_MOBILE_PREFIXES.includes(prefix);
}

/**
 * Trích xuất tất cả số điện thoại Việt Nam từ một đoạn văn bản bất kỳ (Bio TikTok, IG, FB, Telegram...)
 */
function extractPhonesFromText(text) {
  if (!text || typeof text !== 'string') return [];

  const regex = /(?:\+?84|0)(?:[\s.\-_]*\d){8,10}/g;
  const matches = text.match(regex) || [];

  const uniquePhones = new Set();
  for (const m of matches) {
    const norm = normalizePhone(m);
    if (norm) {
      uniquePhones.add(norm);
    }
  }

  return Array.from(uniquePhones).sort((a, b) => {
    const aMob = isMobilePhone(a) ? 1 : 0;
    const bMob = isMobilePhone(b) ? 1 : 0;
    return bMob - aMob;
  });
}

/**
 * Trích xuất Email từ văn bản
 */
function extractEmailsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(regex) || [];
  const filtered = matches.filter(e => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e));
  return Array.from(new Set(filtered.map(e => e.toLowerCase())));
}

/**
 * Nhận diện Nền tảng Mạng xã hội và trích xuất @handle / username từ URL hoặc văn bản
 */
function parseSocialIdentity(url = '', text = '') {
  const cleanUrl = (url || '').trim();
  const lowerUrl = cleanUrl.toLowerCase();

  let platform = 'web';
  let handle = '';

  if (lowerUrl.includes('tiktok.com')) {
    platform = 'tiktok';
    const m = cleanUrl.match(/tiktok\.com\/(@[a-zA-Z0-9._-]+)/i);
    if (m) handle = m[1];
  } else if (lowerUrl.includes('instagram.com') || lowerUrl.includes('threads.net')) {
    platform = 'instagram';
    const m = cleanUrl.match(/(?:instagram\.com|threads\.net)\/(@?[a-zA-Z0-9._-]+)/i);
    if (m && !['p', 'reel', 'reels', 'explore', 'stories', 'tv'].includes(m[1].toLowerCase())) {
      handle = m[1].startsWith('@') ? m[1] : `@${m[1]}`;
    }
  } else if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.com')) {
    platform = 'facebook';
    const m = cleanUrl.match(/facebook\.com\/(?:groups\/([^/?#]+)|profile\.php\?id=(\d+)|([^/?#]+))/i);
    if (m) {
      const seg = m[1] || m[2] || m[3] || '';
      if (seg && !['watch', 'reel', 'share', 'sharer', 'posts', 'permalink.php'].includes(seg.toLowerCase())) {
        handle = `fb/${seg}`;
      }
    }
  } else if (lowerUrl.includes('t.me/') || lowerUrl.includes('telegram.me/') || lowerUrl.includes('telegram.org')) {
    platform = 'telegram';
    const m = cleanUrl.match(/(?:t\.me|telegram\.me)\/(?:s\/)?([a-zA-Z0-9_]+)/i);
    if (m) handle = `@${m[1]}`;
  } else if (lowerUrl.includes('x.com/') || lowerUrl.includes('twitter.com/')) {
    platform = 'x';
    const m = cleanUrl.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]+)/i);
    if (m && !['search', 'hashtag', 'i', 'intent', 'home', 'explore'].includes(m[1].toLowerCase())) {
      handle = `@${m[1]}`;
    }
  } else if (lowerUrl.includes('youtube.com/') || lowerUrl.includes('youtu.be/')) {
    platform = 'youtube';
    const m = cleanUrl.match(/youtube\.com\/(@[a-zA-Z0-9._-]+)/i);
    if (m) handle = m[1];
  } else if (lowerUrl.includes('google.com/maps')) {
    platform = 'google_maps';
  }

  // Nếu chưa bắt được handle từ URL, thử tìm @handle hoặc t.me/ trong văn bản Bio
  if (!handle && text) {
    const tgMatch = text.match(/t\.me\/([a-zA-Z0-9_]{4,32})/i);
    if (tgMatch) {
      handle = `@${tgMatch[1]}`;
      if (platform === 'web') platform = 'telegram';
    } else {
      const atMatch = text.match(/(?:^|\s)(@[a-zA-Z0-9._]{3,30})(?:\s|$)/);
      if (atMatch && !atMatch[1].includes('.com')) {
        handle = atMatch[1];
      }
    }
  }

  return { platform, handle, socialUrl: cleanUrl };
}

/**
 * Tự động phân loại Bộ môn đào tạo của Học viện Thể thao VTC dựa vào tên/từ khóa
 */
function detectSportCategory(text = '', defaultCategory = 'gym') {
  const lower = text.toLowerCase();

  if (/yoga|pilates|thiền|ashtanga|hatha|inside flow/i.test(lower)) {
    return 'yoga';
  }
  if (/dân vũ|zumba|shuffle|dance|nhảy|khiêu vũ|aerobic|vũ đạo|hip\s*hop|flashmob|jumping|choreo/i.test(lower)) {
    return 'dance';
  }
  if (/võ cổ truyền|võ thuật|võ đường|vovinam|karate|taekwondo|muay|kickfit|boxing|võ nhạc/i.test(lower)) {
    return 'martial_arts';
  }
  if (/gym|fitness|thể hình|pt\b|personal trainer|workout|calisthenics|crossfit|coach/i.test(lower)) {
    return 'gym';
  }

  return defaultCategory || 'gym';
}

/**
 * Nhận diện Loại khách hàng (B2C Cá nhân vs B2B Cơ sở)
 */
function detectLeadType(name = '', notes = '', url = '') {
  const combined = `${name} ${notes}`.toLowerCase();
  const lowerUrl = (url || '').toLowerCase();

  // Nếu là tài khoản TikTok @, Instagram, X, Telegram cá nhân hoặc có từ khóa cá nhân rõ rệt -> B2C
  if (
    lowerUrl.includes('tiktok.com/@') ||
    lowerUrl.includes('x.com/') ||
    lowerUrl.includes('twitter.com/') ||
    /pt tự do|freelance|nhận dạy kèm|kèm 1-1|1:1|cô giáo|thầy dạy|hlv cá nhân|personal trainer|tìm việc|ứng tuyển|học chứng chỉ|thi chứng chỉ|cần bằng/i.test(combined)
  ) {
    // Trừ trường hợp tên ghi rõ là Trung tâm / Phòng tập lớn
    if (!/trung tâm|công ty|hệ thống phòng tập|federation|liên đoàn/i.test(name.toLowerCase())) {
      return 'B2C';
    }
  }

  if (/phòng tập|phòng gym|studio|clb|câu lạc bộ|center|trung tâm|võ đường|academy|học viện/i.test(name.toLowerCase())) {
    return 'B2B';
  }

  // Mặc định trên MXH nếu không có chữ CLB/Phòng tập/Studio ở tên thì ưu tiên là Cá nhân B2C
  if (
    lowerUrl.includes('instagram.com') ||
    lowerUrl.includes('facebook.com') ||
    lowerUrl.includes('t.me/')
  ) {
    return 'B2C';
  }

  return 'B2B';
}

/**
 * Phân loại Nhu cầu / Hành vi cụ thể của Khách hàng Cá nhân (B2C Intent)
 * - 'cert_hunter': Đang chủ động hỏi học/thi chứng chỉ HLV (Hot Lead!)
 * - 'job_seeker': Đang tìm việc PT / HLV / Giáo viên (Rất cần bằng Cục TDTT để nộp hồ sơ)
 * - 'freelance_coach': PT tự do / Giáo viên Yoga / Trưởng nhóm Dance đang dạy học viên trên MXH
 * - 'facility': Chủ phòng tập / CLB (B2B)
 */
function detectLeadIntent(name = '', notes = '', leadType = 'B2C') {
  const combined = `${name} ${notes}`.toLowerCase();

  if (/chứng chỉ|bằng hlv|bằng pt|tập huấn chuyên môn|cục tdtt|học pt ở đâu|thi chứng chỉ|cấp bằng/i.test(combined)) {
    return 'cert_hunter';
  }
  if (/tìm việc|xin việc|ứng tuyển|cần việc|nhận lớp|tuyển pt|tuyển hlv|tuyển giáo viên/i.test(combined)) {
    return 'job_seeker';
  }
  if (leadType === 'B2C') {
    return 'freelance_coach';
  }
  return 'facility';
}

/**
 * Chấm điểm tiềm năng (0 - 100 điểm) cho cả Cá nhân B2C và Cơ sở B2B
 */
function calculatePotentialScore(lead) {
  let score = 45;

  // 1. Có SĐT di động kết bạn được Zalo (+30 điểm)
  if (lead.phone) {
    if (isMobilePhone(lead.phone)) {
      score += 30;
    } else {
      score += 10;
    }
  }

  // 2. Có định danh Mạng xã hội rõ ràng (@handle hoặc link trang cá nhân TikTok/IG/FB/Telegram) (+15 điểm)
  if (lead.social_handle || lead.social_url || lead.facebook_url) {
    score += 15;
  }

  // 3. Điểm cộng theo Độ nóng của Nhu cầu (Intent)
  if (lead.lead_intent === 'cert_hunter') {
    score += 20; // Đang hỏi mua/học chứng chỉ -> Ưu tiên số 1
  } else if (lead.lead_intent === 'freelance_coach' || lead.lead_intent === 'job_seeker') {
    score += 12; // HLV tự do / Người tìm việc PT
  } else if (Number(lead.review_count || 0) >= 1 && Number(lead.review_count || 0) <= 100) {
    score += 12; // Cơ sở tư nhân vừa và nhỏ
  }

  return Math.min(100, score);
}

/**
 * Ước tính số lượng học viên tiềm năng có thể chốt từ 1 Lead
 */
function estimateStudentsCount(leadType, sportCategory) {
  if (leadType === 'B2C') return 1;
  if (sportCategory === 'dance' || sportCategory === 'gym') return 3;
  return 2;
}

module.exports = {
  normalizePhone,
  isMobilePhone,
  extractPhonesFromText,
  extractEmailsFromText,
  parseSocialIdentity,
  detectSportCategory,
  detectLeadType,
  detectLeadIntent,
  calculatePotentialScore,
  estimateStudentsCount
};
