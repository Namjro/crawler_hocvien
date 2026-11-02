/**
 * BỘ XỬ LÝ SĐT CHUẨN 10 SỐ, GIẢI MÃ URL GỐC (BING/DDG UNWRAPPER),
 * NHẬN DIỆN 9 NỀN TẢNG MXH & BỘ KIỂM DUYỆT CÁ NHÂN 4 TẦNG (4-LAYER B2C PRECISION ENGINE v3.0)
 * Hỗ trợ đầy đủ chuẩn Unicode Tiếng Việt có dấu (không bị lỗi \b của JS RegExp)
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

const LANDLINE_PREFIXES = ['024', '028'];

/**
 * Bản đồ tên miền chuẩn xác cho từng nền tảng mạng xã hội (Chặn trường hợp Bing trả về trang khác rồi gắn mác sai)
 */
const PLATFORM_DOMAIN_MAP = {
  facebook: ['facebook.com', 'fb.com'],
  zalo: ['zalo.me', 'chat.zalo.me'],
  threads: ['threads.net', 'threads.com'],
  tiktok: ['tiktok.com'],
  instagram: ['instagram.com'],
  telegram: ['t.me', 'telegram.me'],
  x: ['x.com', 'twitter.com'],
  youtube: ['youtube.com', 'youtu.be'],
  linkedin: ['linkedin.com']
};

const ALLOWED_SOCIAL_DOMAINS = Object.values(PLATFORM_DOMAIN_MAP).flat();

/**
 * Các tên miền RÁC / BÁO CHÍ / BÁN VÉ / ỨNG DỤNG / HỌC TẬP bị cấm tuyệt đối trong Phân hệ B2C
 */
const BLOCKED_DOMAINS = [
  'play.google.com',
  'support.google.com',
  'accounts.google.com',
  'apps.apple.com',
  'canva.com',
  'ticketbox.vn',
  'cticket.vn',
  'cticket.net.vn',
  'me-ticket.com',
  'candlelightexperience.com',
  'bluestar.org.vn',
  'tinhn.com',
  'olm.vn',
  'vietjack.com',
  'loigiaihay.com',
  'hoc247.net',
  'vndoc.com',
  'wikipedia.org',
  'bongda24h.vn',
  'tienphong.vn',
  'vnexpress.net',
  'dantri.com.vn',
  'vietnamnet.vn',
  'tuoitre.vn',
  'thanhnien.vn',
  '24h.com.vn',
  'kenh14.vn',
  'cafef.vn',
  'baomoii.com',
  'baomoi.com',
  'shopee.vn',
  'lazada.vn',
  'tiki.vn',
  'topcv.vn',
  'vietnamworks.com',
  'careerviet.vn',
  'glints.com',
  'tinhte.vn',
  'audio.tinhte.vn',
  'thegioididong.com',
  'fptshop.com.vn',
  'cellphones.com.vn',
  'miniapp.zaloplatforms.com',
  'zaloplatforms.com',
  'zaloapp.com',
  'help.zalo.me',
  'oa.zalo.me',
  'developers.zalo.me'
];

/**
 * Danh sách TỪ KHÓA CẤM TUYỆT ĐỐI (Sử dụng so khớp chuẩn Unicode tiếng Việt, không dùng \b lỗi)
 */
const NEGATIVE_NOISE_PHRASES = [
  // 1. Hòa nhạc, Concert, Mua bán vé sự kiện, Dàn nhạc giao hưởng, K-pop, Phim kịch
  'hòa nhạc', 'buổi hòa nhạc', 'concert', 'concerts', 'live music', 'dàn nhạc', 'giao hưởng',
  'symphony', 'vnso', 'mua vé', 'bán vé', 'vé sự kiện', 'vé chính thức', 'ticketbox', 'cticket',
  'me-ticket', 'candlelight', 'k-pop', 'nhạc sống', 'ca sĩ', 'phim rạp', 'kịch nói', 'jamr',
  // 2. Bida / Billiards / Các môn không thuộc 4 môn VTC
  'bida', 'billiards', 'billiard', 'bi-a', 'snooker', 'pool club', 'clb bida',
  'bóng đá', 'đội tuyển', 'ngoại hạng anh', 'world cup', 'v-league', 'uefa', 'fifa',
  'kim sang sik', 'kim sang-sik', 'park hang seo', 'park hang-seo', 'troussier', 'klopp',
  'liverpool', 'manchester', 'arsenal', 'chelsea', 'real madrid', 'barcelona',
  // 3. Game bóng đá "HLV Online" / FC Online / FO4
  'hlv online', 'huấn luyện viên online', 'huấn luyện viên onlive', 'fc online', 'fifa online',
  'fo4', 'garena', 'cày thuê', 'liên quân', 'free fire',
  // 4. Ôn thi văn học / Ngữ pháp / Bằng lái xe (Trùng chữ "Câu" trong "Câu lạc bộ")
  'gplx', 'bằng lái xe', '600 câu hỏi', 'câu tiếng việt', 'các kiểu câu', 'câu đơn', 'câu ghép',
  'ngữ pháp', 'ngữ văn', 'tiếng việt lớp', 'từ điển', 'wikipedia', 'tra câu',
  // 5. Bất động sản, Tài chính, Cờ bạc, Dịch vụ khác & Trang hệ thống Zalo/Google
  'bất động sản', 'nhà đất', 'chung cư', 'vay vốn', 'tín dụng', 'xổ số', 'lô đề', 'casino',
  'bet88', 'nhà cái', 'quán nhậu', 'nhà hàng', 'khách sạn', 'karaoke', 'tiệm tóc', 'nha khoa',
  'ứng dụng trên google play', 'app store', 'zalo mini app', 'tải zalo', 'zalo pc', 'đăng nhập zalo',
  'google trợ giúp', 'trợ lý google', 'dịch lời nói', 'reallocated sector', 'google one'
];

/**
 * Từ khóa BẮT BUỘC PHẢI CÓ theo từng bộ môn của Học viện Thể thao VTC (So khớp chuẩn Unicode)
 */
const SPORT_STRICT_KEYWORDS = {
  gym: [
    'gym', 'fitness', 'thể hình', 'personal trainer', 'pt gym', 'pt thể hình', 'pt tự do',
    'hlv thể hình', 'huấn luyện viên thể hình', 'dạy kèm gym', 'kèm 1:1', 'kèm 1-1',
    'tăng cơ', 'giảm mỡ', 'calisthenics', 'crossfit', 'bodybuilding', 'private gym', 'phòng gym'
  ],
  yoga: [
    'yoga', 'pilates', 'hlv yoga', 'giáo viên yoga', 'cô giáo yoga', 'huấn luyện viên yoga',
    'yoga trị liệu', 'trị liệu cổ vai gáy', 'inside flow', 'ashtanga', 'hatha yoga',
    'vinyasa', 'yogini', 'yoga bầu', 'yoga bay', 'aerial yoga', 'định tuyến yoga', 'lớp yoga'
  ],
  dance: [
    'zumba', 'shuffle dance', 'shuffle', 'dân vũ', 'aerobic', 'aerobics', 'khiêu vũ',
    'dance fitness', 'dạy nhảy', 'lớp nhảy', 'giáo viên dạy nhảy', 'hlv dân vũ',
    'hlv zumba', 'vũ đạo', 'choreo', 'choreography', 'hip hop dance', 'hiphop dance',
    'jumping fitness', 'line dance', 'múa đương đại', 'sexy dance', 'modern dance'
  ],
  martial_arts: [
    'võ cổ truyền', 'võ đường', 'võ thuật', 'kickfit', 'kickboxing', 'boxing', 'muay thái',
    'muay thai', 'vovinam', 'karate', 'taekwondo', 'hlv võ', 'thầy dạy võ', 'tự vệ',
    'võ nhạc', 'vịnh xuân', 'thiếu lâm', 'wushu', 'pencak silat', 'aikido', 'judo', 'mma'
  ]
};

/**
 * Từ khóa TÍN HIỆU CÁ NHÂN B2C (Chứng minh đây là HLV / PT / Giáo viên / Người tìm việc / Người cần bằng, không phải bài viết chung chung)
 */
const B2C_PERSONAL_SIGNALS = [
  'pt', 'personal trainer', 'hlv', 'huấn luyện viên', 'giáo viên', 'cô giáo', 'thầy dạy',
  'coach', 'instructor', 'trainer', 'dạy kèm', 'kèm 1:1', 'kèm 1-1', 'kèm riêng',
  'nhận học viên', 'tuyển học viên', 'mở lớp', 'nhận lớp', 'nhận dạy', 'lớp học',
  'tại nhà', 'online 1:1', 'tìm việc', 'xin việc', 'ứng tuyển', 'tuyển pt', 'tuyển hlv',
  'tuyển giáo viên', 'việc làm pt', 'việc làm hlv', 'chứng chỉ', 'bằng hlv', 'bằng pt',
  'tập huấn', 'cục tdtt', 'cục thể dục thể thao', 'hành nghề', 'zalo', 'liên hệ', 'inbox', 'sđt', 'hotline'
];

/**
 * Danh sách các tên mặc định / vô nghĩa bị cấm tạo hồ sơ B2C
 */
const INVALID_PLACEHOLDER_NAMES = [
  /^học viên\s+(zalo|threads|tiktok|facebook|instagram|telegram|x|youtube|linkedin)$/i,
  /^zalo\s*user/i,
  /^zalo\s*oa/i,
  /^trang chủ$/i,
  /^đăng nhập/i,
  /^log\s*in/i,
  /^sign\s*in/i,
  /^discover\s+/i,
  /^explore\s*/i,
  /^google\s+play/i,
  /^canva/i
];

/**
 * Hàm chuẩn hóa chuỗi Unicode NFC và kiểm tra cụm từ chính xác theo biên từ Unicode (\p{L}\p{N})
 * Khắc phục triệt để lỗi \b của JavaScript không nhận diện được chữ Tiếng Việt có dấu
 */
function normalizeUnicodeText(str = '') {
  return String(str || '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAnyKeyword(rawText = '', keywordList = []) {
  const normText = normalizeUnicodeText(rawText);
  if (!normText || !Array.isArray(keywordList) || keywordList.length === 0) return false;

  for (const kw of keywordList) {
    const normKw = normalizeUnicodeText(kw);
    if (!normKw) continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(normKw)}(?![\\p{L}\\p{N}])`, 'iu');
    if (pattern.test(normText)) {
      return true;
    }
  }
  return false;
}

/**
 * Giải mã URL chuyển hướng của Bing (`bing.com/ck/a?...&u=a1...`), DuckDuckGo (`uddg=...`), Facebook (`l.php?u=`)
 * về đúng đường dẫn gốc thực sự
 */
function unwrapSearchRedirectUrl(rawUrl = '') {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let url = rawUrl.trim();

  try {
    // 1. Giải mã Bing redirect URL: https://www.bing.com/ck/a?!&&p=...&u=a1aHR0cHM6Ly9...
    if (url.includes('bing.com/ck/a')) {
      const parsed = new URL(url);
      const uParam = parsed.searchParams.get('u');
      if (uParam && uParam.startsWith('a1')) {
        const b64 = uParam.slice(2).replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(b64, 'base64').toString('utf8').replace(/\0/g, '').trim();
        if (decoded.startsWith('http')) {
          url = decoded;
        }
      }
    }

    // 2. Giải mã DuckDuckGo redirect URL: //duckduckgo.com/l/?uddg=https%3A%2F%2F...
    if (url.includes('uddg=')) {
      const parsed = new URL(url, 'https://duckduckgo.com');
      const uddg = parsed.searchParams.get('uddg');
      if (uddg && uddg.startsWith('http')) {
        url = decodeURIComponent(uddg);
      }
    }

    // 3. Giải mã Facebook external redirect: l.facebook.com/l.php?u=...
    if (url.includes('facebook.com/l.php')) {
      const parsed = new URL(url);
      const u = parsed.searchParams.get('u');
      if (u && u.startsWith('http')) {
        url = decodeURIComponent(u);
      }
    }

    // 4. Giải mã Yahoo Search redirect URL: .../RU=https%3a%2f%2f.../RK=...
    if (url.includes('/RU=http')) {
      const m = url.match(/\/RU=([^/]+)\/RK=/i);
      if (m && m[1]) {
        const decoded = decodeURIComponent(m[1]);
        if (decoded.startsWith('http')) {
          url = decoded;
        }
      }
    }
  } catch (_) {}

  return url;
}

/**
 * Kiểm tra URL thật có khớp với nền tảng MXH đang quét hay không
 */
function verifyPlatformDomain(rawUrl = '', expectedPlatform = '') {
  const cleanUrl = unwrapSearchRedirectUrl(rawUrl).toLowerCase();
  if (!cleanUrl || !cleanUrl.startsWith('http')) return false;

  try {
    const hostname = new URL(cleanUrl).hostname.toLowerCase();
    if (BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
      return false;
    }

    if (!expectedPlatform || expectedPlatform === 'all' || expectedPlatform === 'web') {
      return ALLOWED_SOCIAL_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
    }

    const allowedForPlatform = PLATFORM_DOMAIN_MAP[expectedPlatform];
    if (!allowedForPlatform) return true;

    return allowedForPlatform.some(d => hostname === d || hostname.endsWith(`.${d}`));
  } catch (_) {
    return false;
  }
}

/**
 * Chuẩn hóa Số Điện Thoại Việt Nam Nghiêm Ngặt:
 * - Số di động bắt buộc ĐÚNG 10 CHỮ SỐ và thuộc đầu số nhà mạng thật (09, 03, 08, 07, 05)
 * - Loại bỏ hoàn toàn các dãy số 11 số ảo như 02610220100, 07629215003
 */
function normalizePhone(rawPhone) {
  if (!rawPhone || typeof rawPhone !== 'string') return null;

  let cleaned = rawPhone.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+84')) {
    cleaned = '0' + cleaned.slice(3);
  } else if (cleaned.startsWith('84') && cleaned.length === 11) {
    cleaned = '0' + cleaned.slice(2);
  }

  if (!cleaned.startsWith('0')) return null;

  if (/^0(\d)\1{8,9}$/.test(cleaned) || cleaned === '0123456789' || cleaned === '0987654321') {
    return null;
  }

  const prefix3 = cleaned.slice(0, 3);

  if (VIETNAMESE_MOBILE_PREFIXES.includes(prefix3)) {
    return cleaned.length === 10 ? cleaned : null;
  }

  if (LANDLINE_PREFIXES.includes(prefix3)) {
    return (cleaned.length === 10 || (cleaned.length === 11 && /^02[48][23678]/.test(cleaned))) ? cleaned : null;
  }

  return null;
}

function isMobilePhone(phone) {
  const norm = normalizePhone(phone);
  if (!norm || norm.length !== 10) return false;
  return VIETNAMESE_MOBILE_PREFIXES.includes(norm.slice(0, 3));
}

function extractPhonesFromText(text) {
  if (!text || typeof text !== 'string') return [];

  const textWithoutUrls = text
    .replace(/https?:\/\/[^\s"'<>]+/gi, ' ')
    .replace(/[a-zA-Z0-9_-]{15,}/g, ' ');

  const regex = /(?:^|[^\d])(\+?84|0)(?:[\s.\-]*\d){9,10}(?!\d)/g;
  const uniquePhones = new Set();
  let match;

  while ((match = regex.exec(textWithoutUrls)) !== null) {
    const norm = normalizePhone(match[0]);
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

function extractEmailsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(regex) || [];
  const filtered = matches.filter(e => !/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(e));
  return Array.from(new Set(filtered.map(e => e.toLowerCase())));
}

/**
 * Nhận diện 9 Nền tảng Mạng xã hội sau khi đã giải mã URL thật
 * Không tự sinh handle giả như 'Zalo User/Group' nếu không có thật
 */
function parseSocialIdentity(rawUrl = '', text = '') {
  const cleanUrl = unwrapSearchRedirectUrl(rawUrl);
  const lowerUrl = cleanUrl.toLowerCase();

  let platform = 'web';
  let handle = '';
  let profileUrl = cleanUrl;

  if (lowerUrl.includes('tiktok.com')) {
    platform = 'tiktok';
    const m = cleanUrl.match(/tiktok\.com\/(@[a-zA-Z0-9._-]+)/i);
    if (m) {
      handle = m[1];
      profileUrl = `https://www.tiktok.com/${handle}`;
    }
  } else if (lowerUrl.includes('threads.net') || lowerUrl.includes('threads.com')) {
    platform = 'threads';
    const m = cleanUrl.match(/threads\.(?:net|com)\/(@?[a-zA-Z0-9._-]+)/i);
    if (m && !['t', 'search', 'login', 'post', 'intent', 'explore'].includes(m[1].toLowerCase())) {
      handle = m[1].startsWith('@') ? m[1] : `@${m[1]}`;
      profileUrl = `https://www.threads.net/${handle}`;
    }
  } else if (lowerUrl.includes('zalo.me') || lowerUrl.includes('chat.zalo.me')) {
    platform = 'zalo';
    const mGroup = cleanUrl.match(/zalo\.me\/g\/([a-zA-Z0-9_-]{4,30})/i);
    const mPhone = cleanUrl.match(/zalo\.me\/(0\d{9})/i);
    if (mGroup) {
      handle = `zalo.me/g/${mGroup[1]}`;
      profileUrl = `https://zalo.me/g/${mGroup[1]}`;
    } else if (mPhone && isMobilePhone(mPhone[1])) {
      handle = `zalo/${mPhone[1]}`;
      profileUrl = `https://zalo.me/${mPhone[1]}`;
    }
  } else if (lowerUrl.includes('instagram.com')) {
    platform = 'instagram';
    const m = cleanUrl.match(/instagram\.com\/(@?[a-zA-Z0-9._-]+)/i);
    if (m && !['p', 'reel', 'reels', 'explore', 'stories', 'tv', 'accounts'].includes(m[1].toLowerCase())) {
      handle = m[1].startsWith('@') ? m[1] : `@${m[1]}`;
      profileUrl = `https://www.instagram.com/${handle.replace(/^@/, '')}`;
    }
  } else if (lowerUrl.includes('facebook.com') || lowerUrl.includes('fb.com')) {
    platform = 'facebook';
    const m = cleanUrl.match(/facebook\.com\/(?:groups\/([^/?#]+)|profile\.php\?id=(\d+)|people\/([^/?#]+)|([^/?#]+))/i);
    if (m) {
      const seg = m[1] || m[2] || m[3] || m[4] || '';
      if (seg && !['watch', 'reel', 'share', 'sharer', 'posts', 'permalink.php', 'hashtag', 'login', 'events', 'marketplace', 'public', 'search', 'gaming'].includes(seg.toLowerCase())) {
        handle = m[1] ? `fb/groups/${m[1]}` : `fb/${seg}`;
      }
    }
  } else if (lowerUrl.includes('t.me/') || lowerUrl.includes('telegram.me/')) {
    platform = 'telegram';
    const m = cleanUrl.match(/(?:t\.me|telegram\.me)\/(?:s\/)?([a-zA-Z0-9_]{4,32})/i);
    if (m && !['share', 'joinchat', 'addstickers', 'iv'].includes(m[1].toLowerCase())) {
      handle = `@${m[1]}`;
      profileUrl = `https://t.me/${m[1]}`;
    }
  } else if (lowerUrl.includes('x.com/') || lowerUrl.includes('twitter.com/')) {
    platform = 'x';
    const m = cleanUrl.match(/(?:x\.com|twitter\.com)\/([a-zA-Z0-9_]{2,30})/i);
    if (m && !['search', 'hashtag', 'i', 'intent', 'home', 'explore', 'login'].includes(m[1].toLowerCase())) {
      handle = `@${m[1]}`;
      profileUrl = `https://x.com/${m[1]}`;
    }
  } else if (lowerUrl.includes('youtube.com/') || lowerUrl.includes('youtu.be/')) {
    platform = 'youtube';
    const m = cleanUrl.match(/youtube\.com\/(@[a-zA-Z0-9._-]+)/i);
    if (m) {
      handle = m[1];
      profileUrl = `https://www.youtube.com/${handle}`;
    }
  } else if (lowerUrl.includes('linkedin.com/')) {
    platform = 'linkedin';
    const m = cleanUrl.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
    if (m) {
      handle = `in/${m[1]}`;
      profileUrl = `https://www.linkedin.com/in/${m[1]}`;
    }
  } else if (lowerUrl.includes('google.com/maps')) {
    platform = 'google_maps';
  }

  // Bóc tách thêm từ văn bản nếu có link nhóm Zalo hoặc Telegram thật
  if (!handle && text) {
    const zgMatch = text.match(/zalo\.me\/g\/([a-zA-Z0-9_-]{4,30})/i);
    if (zgMatch) {
      handle = `zalo.me/g/${zgMatch[1]}`;
      profileUrl = `https://zalo.me/g/${zgMatch[1]}`;
      if (platform === 'web') platform = 'zalo';
    } else {
      const tgMatch = text.match(/t\.me\/([a-zA-Z0-9_]{4,32})/i);
      if (tgMatch) {
        handle = `@${tgMatch[1]}`;
        profileUrl = `https://t.me/${tgMatch[1]}`;
        if (platform === 'web') platform = 'telegram';
      }
    }
  }

  return { platform, handle, socialUrl: profileUrl, rawEvidenceUrl: cleanUrl };
}

/**
 * BỘ KIỂM DUYỆT ĐỘ CHÍNH XÁC 4 TẦNG (4-LAYER B2C & B2B STRICT RELEVANCE VALIDATOR v3.0)
 * Đảm bảo 100% CLB (B2B) và Khách hàng Cá nhân (B2C) phải đúng bộ môn VTC và có định danh thật
 */
function validateLeadRelevance({
  name = '',
  text = '',
  url = '',
  leadType = 'B2C',
  sportCategory = 'gym',
  expectedPlatform = '',
  requireSocialDomain = false
}) {
  const realUrl = unwrapSearchRedirectUrl(url);
  const lowerUrl = realUrl.toLowerCase();
  const cleanName = String(name || '').trim();
  const combinedText = `${cleanName} ${text || ''}`.trim();

  // TẦNG 1: Chặn tên quá ngắn hoặc các tên mặc định vô nghĩa ("Học viên ZALO", "Zalo User/OA"...)
  if (!cleanName || cleanName.length < 3) {
    return { isValid: false, valid: false, reason: 'Tên quá ngắn hoặc rỗng' };
  }

  for (const invalidPattern of INVALID_PLACEHOLDER_NAMES) {
    if (invalidPattern.test(cleanName)) {
      return { isValid: false, valid: false, reason: `Tên mặc định không có cá nhân thật (${cleanName})` };
    }
  }

  // Kiểm tra tên miền bị cấm tuyệt đối (Google Play, Ticketbox, CTicket, OLM, Canva, Báo chí...)
  if (realUrl && realUrl.startsWith('http')) {
    try {
      const hostname = new URL(realUrl).hostname.toLowerCase();
      if (BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`))) {
        return { isValid: false, valid: false, reason: `Tên miền bị chặn (${hostname})` };
      }
    } catch (_) {}
  }

  // TẦNG 2: Chặn tuyệt đối các cụm từ nhiễu (Hòa nhạc, Concert, Mua vé, Bida, Bóng đá, Game FIFA, Ngữ pháp...)
  if (matchesAnyKeyword(combinedText, NEGATIVE_NOISE_PHRASES) || matchesAnyKeyword(lowerUrl, NEGATIVE_NOISE_PHRASES)) {
    return { isValid: false, valid: false, reason: 'Chứa từ khóa nhiễu ngoài phạm vi VTC (Hòa nhạc / Bán vé / Bida / Bóng đá / Game / Ngữ pháp)' };
  }

  // Kiểm tra khớp tên miền nền tảng MXH nếu yêu cầu
  const phones = extractPhonesFromText(combinedText);
  const hasValidMobile = phones.some(p => isMobilePhone(p));
  const hasRealZaloGroup = /zalo\.me\/g\/[a-zA-Z0-9_-]{4,30}/i.test(`${realUrl} ${combinedText}`);

  if (expectedPlatform && expectedPlatform !== 'all' && expectedPlatform !== 'zalo') {
    if (realUrl && !verifyPlatformDomain(realUrl, expectedPlatform)) {
      return { isValid: false, valid: false, reason: `URL thật không thuộc nền tảng ${expectedPlatform}` };
    }
  } else if (expectedPlatform === 'zalo') {
    const isSocialOrZalo = verifyPlatformDomain(realUrl, 'all');
    if (!hasValidMobile && !hasRealZaloGroup) {
      return { isValid: false, valid: false, reason: 'Kết quả Zalo không có SĐT di động 10 số thật và không có link nhóm zalo.me/g/' };
    }
    if (realUrl && !isSocialOrZalo && !hasValidMobile) {
      return { isValid: false, valid: false, reason: 'URL Zalo không hợp lệ' };
    }
  } else if (requireSocialDomain && realUrl) {
    const isAllowedSocial = verifyPlatformDomain(realUrl, 'all');
    if (!isAllowedSocial && !hasValidMobile && !hasRealZaloGroup) {
      return { isValid: false, valid: false, reason: 'URL không phải trang Mạng xã hội và không có SĐT di động 10 số' };
    }
  }

  // TẦNG 3: Bắt buộc phải chứa từ khóa chuyên môn ĐÚNG VỚI BỘ MÔN ĐANG CHỌN
  const targetKeywords = SPORT_STRICT_KEYWORDS[sportCategory] || SPORT_STRICT_KEYWORDS.gym;
  const matchesTargetSport = matchesAnyKeyword(combinedText, targetKeywords);

  if (!matchesTargetSport) {
    return {
      isValid: false,
      valid: false,
      reason: `Không chứa từ khóa chuyên môn của bộ môn [${sportCategory.toUpperCase()}]`
    };
  }
  const detectedSport = sportCategory;

  // TẦNG 4: Kiểm tra chuyên biệt cho từng Phân hệ (B2B vs B2C)
  if (leadType === 'B2B') {
    if (matchesAnyKeyword(cleanName, ['tìm việc làm', 'xin việc', 'cần tìm việc', 'tìm việc', 'xin việc làm'])) {
      return { isValid: false, valid: false, reason: 'Bài tìm việc cá nhân, không phải Cơ sở B2B' };
    }
    if (matchesAnyKeyword(cleanName, ['muốn tìm lớp', 'cần tìm lớp', 'xin review', 'ai biết chỗ dạy', 'ở đâu dạy'])) {
      return { isValid: false, valid: false, reason: 'Nhu cầu hỏi tìm lớp của học viên, không phải Cơ sở B2B' };
    }
  }

  if (leadType === 'B2C') {
    // Chặn các trang fanpage tổ chức phi thể thao / dàn nhạc / công ty bán vé
    if (matchesAnyKeyword(cleanName, ['dàn nhạc', 'công ty tnhh', 'tập đoàn', 'liên đoàn', 'báo điện tử', 'tạp chí'])) {
      return { isValid: false, valid: false, reason: 'Tổ chức/Đơn vị không phải Khách hàng Cá nhân B2C' };
    }

    const identity = parseSocialIdentity(realUrl, combinedText);
    const hasPersonalKeyword = matchesAnyKeyword(combinedText, B2C_PERSONAL_SIGNALS);

    // Bắt buộc Cá nhân B2C phải có:
    // (1) SĐT di động 10 số thật HOẶC Link nhóm Zalo thật, HOẶC
    // (2) Có từ khóa cá nhân (PT, HLV, giáo viên, cô giáo, dạy kèm, mở lớp, tìm việc, chứng chỉ...) VÀ (có @handle hoặc URL MXH hợp lệ)
    const isStrongPersonalLead =
      hasValidMobile ||
      hasRealZaloGroup ||
      (hasPersonalKeyword && (Boolean(identity.handle) || verifyPlatformDomain(realUrl, 'all')));

    if (!isStrongPersonalLead) {
      return {
        isValid: false,
        valid: false,
        reason: 'Không đủ bằng chứng Khách hàng Cá nhân B2C (Thiếu SĐT 10 số / @handle cá nhân / từ khóa HLV, dạy kèm, tìm việc, chứng chỉ)'
      };
    }

    // Nếu không có SĐT và cũng không có @handle và snippet quá ngắn -> Loại bỏ để tránh hồ sơ rỗng
    if (!hasValidMobile && !identity.handle && String(text || '').trim().length < 25) {
      return {
        isValid: false,
        valid: false,
        reason: 'Hồ sơ rỗng (Không có SĐT, không có @handle và không có trích dẫn bài viết)'
      };
    }
  }

  return {
    isValid: true,
    valid: true,
    cleanUrl: realUrl,
    detectedSport
  };
}

function classifyEvidenceType(url = '', text = '') {
  const combined = `${url} ${text}`;

  if (matchesAnyKeyword(combined, ['chiêu sinh', 'tuyển sinh', 'khai giảng khóa', 'thông báo mở lớp', 'tuyển học viên', 'chiêu mộ'])) {
    return 'admissions_announcement';
  }
  if (matchesAnyKeyword(combined, ['chứng chỉ', 'bằng hlv', 'bằng pt', 'tập huấn chuyên môn', 'cục tdtt', 'thi chứng chỉ', 'cấp bằng'])) {
    return 'post_asking_cert';
  }
  if (matchesAnyKeyword(combined, ['tìm việc', 'xin việc', 'ứng tuyển', 'cần việc', 'tuyển pt', 'tuyển hlv', 'tuyển giáo viên'])) {
    return 'post_job_seeking';
  }
  if (url.toLowerCase().includes('zalo.me/g/') || matchesAnyKeyword(combined, ['nhóm zalo', 'link zalo', 'zalo.me/g'])) {
    return 'zalo_community';
  }
  if (
    /video|reel|watch|post|status|threads\.net\/@[^/]+\/post/i.test(url.toLowerCase()) ||
    matchesAnyKeyword(combined, ['nhận dạy kèm', 'dạy kèm', 'kèm 1-1', 'kèm 1:1', 'mở lớp', 'lịch tập', 'học viên', 'ca tập', 'giảm mỡ', 'trị liệu'])
  ) {
    return 'post_teaching';
  }
  return 'profile_bio';
}

function detectSportCategory(text = '', defaultCategory = 'gym') {
  if (matchesAnyKeyword(text, SPORT_STRICT_KEYWORDS.yoga)) return 'yoga';
  if (matchesAnyKeyword(text, SPORT_STRICT_KEYWORDS.dance)) return 'dance';
  if (matchesAnyKeyword(text, SPORT_STRICT_KEYWORDS.martial_arts)) return 'martial_arts';
  if (matchesAnyKeyword(text, SPORT_STRICT_KEYWORDS.gym)) return 'gym';
  return defaultCategory || 'gym';
}

function detectLeadType(name = '', notes = '', url = '') {
  const combined = `${name} ${notes}`;
  const lowerUrl = unwrapSearchRedirectUrl(url).toLowerCase();

  if (lowerUrl.includes('google.com/maps')) {
    return 'B2B';
  }

  if (
    lowerUrl.includes('tiktok.com/@') ||
    lowerUrl.includes('threads.net') ||
    lowerUrl.includes('x.com/') ||
    lowerUrl.includes('twitter.com/') ||
    lowerUrl.includes('linkedin.com/in/') ||
    matchesAnyKeyword(combined, ['pt tự do', 'nhận dạy kèm', 'kèm 1-1', 'kèm 1:1', 'cô giáo', 'thầy dạy', 'personal trainer', 'tìm việc', 'ứng tuyển', 'chứng chỉ'])
  ) {
    return 'B2C';
  }

  if (matchesAnyKeyword(name, ['phòng tập', 'phòng gym', 'studio', 'clb', 'câu lạc bộ', 'center', 'trung tâm', 'võ đường', 'học viện'])) {
    return 'B2B';
  }

  return 'B2C';
}

function detectLeadIntent(name = '', notes = '', leadType = 'B2C') {
  const combined = `${name} ${notes}`;

  if (matchesAnyKeyword(combined, ['chứng chỉ', 'bằng hlv', 'bằng pt', 'tập huấn', 'cục tdtt', 'thi chứng chỉ'])) {
    return 'cert_hunter';
  }
  if (matchesAnyKeyword(combined, ['tìm việc', 'xin việc', 'ứng tuyển', 'nhận lớp', 'tuyển pt', 'tuyển hlv', 'tuyển giáo viên'])) {
    return 'job_seeker';
  }
  if (matchesAnyKeyword(combined, ['chiêu sinh', 'tuyển sinh', 'khai giảng', 'mở lớp', 'chiêu mộ'])) {
    return leadType === 'B2B' ? 'admissions' : 'freelance_coach';
  }
  if (leadType === 'B2C') {
    return 'freelance_coach';
  }
  return 'facility';
}

function calculatePotentialScore(lead) {
  let score = 45;

  if (lead.phone) {
    if (isMobilePhone(lead.phone)) {
      score += 30;
    } else {
      score += 10;
    }
  }

  if (lead.social_handle || lead.social_url || lead.facebook_url) {
    score += 12;
  }

  if (lead.evidence_snippet && lead.evidence_snippet.length > 20) {
    score += 10;
  }

  if (lead.lead_intent === 'cert_hunter' || lead.evidence_type === 'post_asking_cert') {
    score += 20;
  } else if (lead.lead_intent === 'admissions' || lead.evidence_type === 'admissions_announcement') {
    score += 22; // Cơ sở đang chủ động chiêu sinh học viên có nhu cầu hợp thức hóa chứng chỉ HLV cực cao
  } else if (lead.lead_intent === 'freelance_coach' || lead.lead_intent === 'job_seeker') {
    score += 10;
  } else if (Number(lead.review_count || 0) >= 1 && Number(lead.review_count || 0) <= 100) {
    score += 12;
  }

  return Math.min(100, score);
}

function estimateStudentsCount(leadType, sportCategory) {
  if (leadType === 'B2C') return 1;
  if (sportCategory === 'dance' || sportCategory === 'gym') return 4;
  return 3;
}

module.exports = {
  normalizePhone,
  isMobilePhone,
  extractPhonesFromText,
  extractEmailsFromText,
  unwrapSearchRedirectUrl,
  verifyPlatformDomain,
  matchesAnyKeyword,
  parseSocialIdentity,
  validateLeadRelevance,
  classifyEvidenceType,
  detectSportCategory,
  detectLeadType,
  detectLeadIntent,
  calculatePotentialScore,
  estimateStudentsCount
};
