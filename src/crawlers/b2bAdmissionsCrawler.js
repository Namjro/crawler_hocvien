/**
 * BỘ MÁY CRAWLER CƠ SỞ B2B TỪ CÁC KÊNH TUYỂN SINH & CHIÊU SINH (B2B ADMISSIONS ENGINE v1.0)
 * Chuyên quét các Cơ sở Thể thao (CLB Dân vũ, Võ đường, Studio Yoga, Phòng Gym/Fitness, Trung tâm TDTT)
 * đang chủ động chiêu sinh / tuyển sinh học viên mới trên Facebook Fanpage, Cổng thông tin Tuyển sinh,
 * Website đào tạo, Zalo OA/Group và YouTube/TikTok.
 */

const cheerio = require('cheerio');
const {
  extractPhonesFromText,
  extractEmailsFromText,
  unwrapSearchRedirectUrl,
  verifyPlatformDomain,
  parseSocialIdentity,
  validateLeadRelevance,
  classifyEvidenceType,
  detectSportCategory,
  detectLeadIntent
} = require('../utils/phoneParser');

/**
 * Danh sách bộ từ khóa tuyển sinh tự nhiên cho từng bộ môn VTC
 * Tuyệt đối không dùng toán tử OR phức tạp làm hỏng bộ phân tích của Yahoo/Bing
 */
const B2B_ADMISSION_KEYWORDS = {
  gym: {
    coreFacility: 'Phòng gym Fitness',
    queries: [
      'site:facebook.com chiêu sinh phòng gym',
      'site:facebook.com tuyển sinh trung tâm fitness',
      'site:facebook.com khai giảng lớp gym thể hình',
      'chiêu sinh lớp fitness trung tâm hotline',
      'tuyển sinh học viên gym phòng tập zalo'
    ]
  },
  yoga: {
    coreFacility: 'Studio Yoga Pilates',
    queries: [
      'site:facebook.com chiêu sinh lớp yoga',
      'site:facebook.com tuyển sinh studio yoga',
      'site:facebook.com thông báo mở lớp yoga trị liệu',
      'chiêu sinh lớp yoga trung tâm hotline',
      'khai giảng khóa yoga studio zalo'
    ]
  },
  dance: {
    coreFacility: 'CLB Dân vũ Zumba Dance',
    queries: [
      'site:facebook.com chiêu sinh clb dân vũ',
      'site:facebook.com tuyển sinh lớp nhảy zumba',
      'site:facebook.com chiêu sinh câu lạc bộ khiêu vũ',
      'site:facebook.com khai giảng lớp shuffle dance',
      'chiêu sinh clb dân vũ thể thao hotline',
      'tuyển sinh lớp zumba vũ đoàn zalo'
    ]
  },
  martial_arts: {
    coreFacility: 'Võ đường CLB Võ cổ truyền',
    queries: [
      'site:facebook.com chiêu sinh lớp võ cổ truyền',
      'site:facebook.com tuyển sinh võ sinh võ đường',
      'site:facebook.com chiêu sinh clb võ thuật',
      'site:facebook.com tuyển sinh kickfit boxing',
      'chiêu sinh võ đường võ cổ truyền hotline',
      'thông báo mở lớp võ sinh clb zalo'
    ]
  }
};

/**
 * Xây dựng danh sách truy vấn tìm kiếm cơ sở tuyển sinh theo bộ môn và tỉnh thành
 */
function buildB2BAdmissionQueries({ sportCategory = 'gym', keyword = '', province = 'Hà Nội' }) {
  const preset = B2B_ADMISSION_KEYWORDS[sportCategory] || B2B_ADMISSION_KEYWORDS.gym;
  const queries = [];

  const cleanCustomKw = (keyword || '').replace(/["()]/g, '').trim();
  if (cleanCustomKw && cleanCustomKw.length >= 3) {
    queries.push({
      platform: 'facebook',
      q: `site:facebook.com chiêu sinh ${cleanCustomKw} ${province}`
    });
    queries.push({
      platform: 'web',
      q: `tuyển sinh chiêu sinh "${cleanCustomKw}" ${province} hotline`
    });
  }

  for (const template of preset.queries) {
    const isFb = template.startsWith('site:facebook.com');
    queries.push({
      platform: isFb ? 'facebook' : 'web',
      q: `${template} ${province}`
    });
  }

  return queries;
}

/**
 * Làm sạch và trích xuất Tên Cơ sở / CLB / Võ đường / Trung tâm từ tiêu đề bài viết tuyển sinh
 */
function extractFacilityName(rawTitle = '', snippet = '') {
  let title = String(rawTitle || '')
    .replace(/\s*-\s*Facebook.*$/i, '')
    .replace(/\s*\|\s*Facebook.*$/i, '')
    .replace(/\s*•\s*Instagram.*$/i, '')
    .replace(/\s*\|\s*TikTok.*$/i, '')
    .replace(/\s*-\s*YouTube.*$/i, '')
    .replace(/\s*\|\s*LinkedIn.*$/i, '')
    .replace(/^Thông báo\s*(chiêu sinh|tuyển sinh)\s*[:-]?\s*/i, '')
    .replace(/^(Tuyển sinh|Chiêu sinh|Khai giảng lớp|Thông báo mở lớp)\s*[:-]?\s*/i, '')
    .trim();

  // Nhận diện mẫu tên cơ sở chuẩn có tiền tố (CLB, Câu Lạc Bộ, Võ Đường, Trung Tâm, Studio, Học Viện, Phòng Tập...)
  const facilityRegex = /(?:CLB|Câu lạc bộ|Trung tâm|Võ đường|Studio|Học viện|Phòng tập|Fitness|Center|Vũ đoàn|Môn phái)\s+[^-,|:—\n]+/i;
  const matchInTitle = title.match(facilityRegex);
  if (matchInTitle && matchInTitle[0].length >= 5 && matchInTitle[0].length <= 60) {
    return matchInTitle[0].trim();
  }

  const matchInSnippet = (snippet || '').match(facilityRegex);
  if (matchInSnippet && matchInSnippet[0].length >= 5 && matchInSnippet[0].length <= 60) {
    return matchInSnippet[0].trim();
  }

  // Cắt bỏ phần sau dấu gạch ngang nếu là bài đăng
  const parts = title.split(/\s*[-–|:—]\s*/);
  if (parts.length > 1) {
    // Ưu tiên vế có chứa từ khóa cơ sở
    const facilityPart = parts.find(p => /(?:clb|câu lạc bộ|võ đường|trung tâm|studio|học viện|phòng|fitness|gym|yoga|zumba)/i.test(p));
    if (facilityPart && facilityPart.trim().length >= 4) {
      return facilityPart.trim().slice(0, 65);
    }
    return parts[0].trim().slice(0, 65);
  }

  return title.slice(0, 65) || 'Cơ sở Thể thao Tuyển sinh';
}

/**
 * Quét kết quả tìm kiếm từ Yahoo Search VN và Bing Search với cơ chế chống chặn
 */
async function scrapeSearchForAdmissions(page, queryStr) {
  const combinedRaw = [];

  const engines = [
    {
      name: 'yahoo',
      url: `https://vn.search.yahoo.com/search?p=${encodeURIComponent(queryStr)}&n=20`
    },
    {
      name: 'bing',
      url: `https://www.bing.com/search?q=${encodeURIComponent(queryStr)}&count=20&setlang=vi`
    }
  ];

  for (const eng of engines) {
    try {
      await page.goto(eng.url, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(1100);

      let items = [];
      try {
        items = await page.evaluate((engineName) => {
          const list = [];
          if (engineName === 'yahoo') {
            document.querySelectorAll('div.algo, div.dd.algo, div.Sr').forEach((el) => {
              const a = el.querySelector('h3 a, .compTitle a, a');
              const p = el.querySelector('.compText, p');
              if (a && a.href && !a.href.includes('yahoo.com/preferences')) {
                const cleanTitle = (a.innerText || '').replace(/\n+/g, ' ').trim();
                list.push({
                  title: cleanTitle,
                  url: a.href,
                  snippet: p ? p.innerText.trim() : el.innerText.trim()
                });
              }
            });
          } else {
            const noResultEl = document.querySelector('.b_no, .b_requery');
            if (noResultEl) return [];

            document.querySelectorAll('li.b_algo').forEach((el) => {
              const a = el.querySelector('h2 a');
              const p = el.querySelector('.b_caption p, .b_lineclamp2, .b_lineclamp3, .b_lineclamp4');
              if (a && a.href) {
                list.push({
                  title: a.innerText.trim(),
                  url: a.href,
                  snippet: p ? p.innerText.trim() : el.innerText.trim()
                });
              }
            });
          }
          return list;
        }, eng.name);
      } catch (_) {
        await page.waitForTimeout(1000);
        items = await page.evaluate(() => {
          const list = [];
          document.querySelectorAll('li.b_algo, div.algo').forEach((el) => {
            const a = el.querySelector('h2 a, h3 a, .compTitle a');
            const p = el.querySelector('.b_caption p, .compText, p');
            if (a && a.href) {
              list.push({
                title: a.innerText.trim(),
                url: a.href,
                snippet: p ? p.innerText.trim() : ''
              });
            }
          });
          return list;
        }).catch(() => []);
      }

      if (items.length > 0) {
        combinedRaw.push(...items);
      }
    } catch (_) {}
  }

  return combinedRaw;
}

/**
 * Trích xuất thêm thông tin liên hệ từ trang web/fanpage công khai
 */
async function tryEnrichAdmissionsPage(page, url) {
  const out = { phones: [], emails: [], address: '', desc: '' };
  if (!url || !url.startsWith('http')) return out;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(800);
    const html = await page.content();
    const $ = cheerio.load(html);

    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const bodyText = ($('body').text() || '').slice(0, 5000);
    const combined = `${metaDesc} ${ogDesc} ${bodyText}`;

    out.phones = extractPhonesFromText(combined);
    out.emails = extractEmailsFromText(combined);

    // Tìm địa chỉ
    const addrMatch = combined.match(/(?:Địa chỉ|Cơ sở|Địa điểm tập|Tại|Đ\/c)\s*:\s*([^.\n;]{10,120})/i);
    if (addrMatch) {
      out.address = addrMatch[1].trim();
    }
    out.desc = (metaDesc || ogDesc).slice(0, 300);
  } catch (_) {}
  return out;
}

/**
 * THỰC THI QUÉT CƠ SỞ B2B TỪ CÁC KÊNH TUYỂN SINH & CHIÊU SINH
 */
async function crawlB2BAdmissions(page, {
  keyword = '',
  province = 'Hà Nội',
  sportCategory = 'gym',
  maxResults = 25,
  onLog = () => {},
  onReject = () => {}
}) {
  const queries = buildB2BAdmissionQueries({ sportCategory, keyword, province });
  const collected = [];
  const seenUrls = new Set();
  const seenNames = new Set();

  onLog(`📢 [B2B TUYỂN SINH] Bắt đầu quét các kênh tuyển sinh bộ môn [${sportCategory.toUpperCase()}] tại [${province}]...`);

  for (const item of queries) {
    if (collected.length >= maxResults) break;

    onLog(`🔎 [KÊNH TUYỂN SINH] Đang tìm kiếm: "${item.q}"`);
    const rawItems = await scrapeSearchForAdmissions(page, item.q);

    for (const r of rawItems) {
      if (collected.length >= maxResults) break;

      const realUrl = unwrapSearchRedirectUrl(r.url);
      if (!realUrl || !realUrl.startsWith('http') || seenUrls.has(realUrl)) continue;
      seenUrls.add(realUrl);

      const combinedText = `${r.title} ${r.snippet}`;

      // BỘ LỌC KIỂM DUYỆT B2B: Bắt buộc đúng bộ môn thể thao và không dính từ khóa nhiễu
      const relevance = validateLeadRelevance({
        name: r.title,
        text: r.snippet,
        url: realUrl,
        leadType: 'B2B',
        sportCategory
      });

      if (!relevance.isValid) {
        onReject(r.title, relevance.reason);
        continue;
      }

      // Kiểm tra tín hiệu Tuyển sinh / Chiêu sinh thực thụ
      const isAdmissionsSignal = /(?:chiêu sinh|tuyển sinh|khai giảng|mở lớp|chiêu mộ|ghi danh|học phí|lớp học|lịch tập|ca tập|học viên)/i.test(combinedText);
      if (!isAdmissionsSignal) {
        onReject(r.title, 'Không chứa tín hiệu tuyển sinh/chiêu sinh mở lớp');
        continue;
      }

      const facilityName = extractFacilityName(r.title, r.snippet);
      const nameKey = facilityName.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);

      let phones = extractPhonesFromText(combinedText);
      let emails = extractEmailsFromText(combinedText);
      let addressFound = '';
      let evidenceSnippet = (r.snippet || r.title || '').trim();

      // Nếu thiếu SĐT, thử mở trang để quét thêm hotline và địa chỉ chi nhánh
      if (phones.length === 0 && (realUrl.includes('facebook.com') || !realUrl.includes('facebook.com'))) {
        const enriched = await tryEnrichAdmissionsPage(page, realUrl);
        if (enriched.phones.length > 0) phones = enriched.phones;
        if (enriched.emails.length > 0) emails = enriched.emails;
        if (enriched.address) addressFound = enriched.address;
        if (enriched.desc && evidenceSnippet.length < 30) evidenceSnippet = enriched.desc;
      }

      const primaryPhone = phones[0] || '';
      const identity = parseSocialIdentity(realUrl, combinedText);
      const detectedPlatform = realUrl.includes('facebook.com')
        ? 'facebook'
        : (identity.platform !== 'web' ? identity.platform : 'web');

      const isFb = detectedPlatform === 'facebook' || realUrl.includes('facebook.com');
      const facebookUrl = isFb ? realUrl : (identity.socialUrl || '');
      const website = !isFb ? realUrl : '';

      collected.push({
        name: facilityName,
        lead_type: 'B2B',
        lead_intent: 'admissions',
        sport_category: relevance.detectedSport || sportCategory,
        platform: detectedPlatform,
        social_handle: identity.handle || '',
        social_url: realUrl,
        evidence_type: 'admissions_announcement',
        evidence_snippet: evidenceSnippet.slice(0, 380),
        evidence_url: realUrl,
        phone: primaryPhone,
        secondary_phones: phones.slice(1, 3).join(', '),
        email: emails[0] || '',
        facebook_url: facebookUrl,
        website: website,
        address: addressFound || province,
        province,
        rating: 5.0,
        review_count: 0,
        potential_score: 85,
        expected_students: 4,
        source: `admissions_${detectedPlatform}`,
        contact_person: 'Quản lý Tuyển sinh / Chủ cơ sở',
        notes: `[Kênh Tuyển Sinh: ${detectedPlatform.toUpperCase()}] ${evidenceSnippet.slice(0, 220)}`
      });

      onLog(`📢 + [PHÁT HIỆN CƠ SỞ TUYỂN SINH B2B] ${facilityName} (${primaryPhone ? 'Hotline: ' + primaryPhone : 'Link: ' + realUrl})`);
    }
  }

  onLog(`✅ [B2B TUYỂN SINH] Hoàn tất quét! Thu thập được ${collected.length} cơ sở đang chiêu sinh.`);
  return collected;
}

module.exports = {
  B2B_ADMISSION_KEYWORDS,
  buildB2BAdmissionQueries,
  extractFacilityName,
  crawlB2BAdmissions
};
