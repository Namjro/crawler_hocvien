/**
 * BỘ MÁY SĂN HỌC VIÊN CÁ NHÂN (B2C) ĐA NỀN TẢNG MẠNG XÃ HỘI
 * Hỗ trợ: Facebook, TikTok, Instagram, X (Twitter), Telegram, YouTube
 */

const cheerio = require('cheerio');
const {
  extractPhonesFromText,
  extractEmailsFromText,
  parseSocialIdentity,
  detectSportCategory,
  detectLeadType,
  detectLeadIntent
} = require('../utils/phoneParser');

/**
 * Từ khóa mẫu chuyên biệt cho Khách hàng Cá nhân (B2C) theo từng Bộ môn VTC
 */
const B2C_SPORT_KEYWORDS = {
  gym: {
    creators: ['PT tự do nhận dạy kèm 1:1', 'Personal Trainer Gym Fitness', 'HLV thể hình cá nhân'],
    job_seekers: ['Tìm việc PT Gym', 'Ứng tuyển huấn luyện viên thể hình', 'Nhận kèm PT 1-1'],
    cert_hunters: ['Học chứng chỉ PT ở đâu', 'Thi chứng chỉ HLV thể hình Cục TDTT', 'Lớp chứng chỉ hành nghề PT']
  },
  yoga: {
    creators: ['Cô giáo Yoga dạy kèm', 'HLV Yoga trị liệu cá nhân', 'Yoga Instructor Vietnam'],
    job_seekers: ['Tìm việc giáo viên Yoga', 'Nhận dạy lớp Yoga tại nhà', 'Ứng tuyển HLV Yoga'],
    cert_hunters: ['Thi chứng chỉ HLV Yoga Cục TDTT', 'Chứng chỉ hành nghề giáo viên Yoga', 'Lớp tập huấn chuyên môn Yoga']
  },
  dance: {
    creators: ['Giáo viên dạy nhảy Zumba Shuffle Dance', 'HLV Dân vũ thể thao', 'Hướng dẫn nhảy Shuffle Dance Aerobic'],
    job_seekers: ['Nhận dạy lớp Zumba Shuffle Dance', 'Tìm việc giáo viên dạy nhảy', 'Biên đạo hướng dẫn dân vũ'],
    cert_hunters: ['Chứng chỉ HLV Dân vũ thể thao', 'Chứng chỉ dạy Zumba Shuffle Dance Cục TDTT', 'Tập huấn chuyên môn vũ đạo']
  },
  martial_arts: {
    creators: ['HLV Võ cổ truyền Kickfit', 'Thầy dạy võ tự vệ cá nhân', 'Hướng dẫn võ cổ truyền'],
    job_seekers: ['Nhận dạy kèm võ thuật Kickfit', 'Tìm việc HLV võ thuật'],
    cert_hunters: ['Chứng chỉ HLV Võ cổ truyền Cục TDTT', 'Tập huấn chuyên môn võ cổ truyền']
  }
};

/**
 * Xây dựng danh sách truy vấn tìm kiếm sâu (Social Dorks) theo từng Nền tảng MXH và Chế độ B2C
 */
function buildPlatformQueries({ sportCategory = 'gym', keyword = '', province = 'Hà Nội', platforms = ['all'], b2cMode = 'all' }) {
  const presets = B2C_SPORT_KEYWORDS[sportCategory] || B2C_SPORT_KEYWORDS.gym;
  const baseKw = keyword && keyword.trim() ? keyword.trim() : presets.creators[0];

  const selectedPlatforms = platforms.includes('all')
    ? ['tiktok', 'facebook', 'instagram', 'telegram', 'x', 'youtube']
    : platforms;

  const queries = [];

  for (const pf of selectedPlatforms) {
    if (pf === 'tiktok') {
      queries.push({
        platform: 'tiktok',
        q: `site:tiktok.com/@ ${baseKw} ${province}`
      });
      if (b2cMode === 'all' || b2cMode === 'b2c_creators') {
        queries.push({
          platform: 'tiktok',
          q: `site:tiktok.com ${presets.creators[0]} ${province} "09" OR "03" OR "08" OR "zalo"`
        });
      }
    }

    if (pf === 'facebook') {
      if (b2cMode === 'all' || b2cMode === 'b2c_creators') {
        queries.push({
          platform: 'facebook',
          q: `site:facebook.com "${baseKw}" ${province} "09" OR "03" OR "08"`
        });
      }
      if (b2cMode === 'all' || b2cMode === 'b2c_job_seekers') {
        queries.push({
          platform: 'facebook',
          q: `site:facebook.com ${presets.job_seekers[0]} ${province}`
        });
      }
      if (b2cMode === 'all' || b2cMode === 'b2c_cert_hunters') {
        queries.push({
          platform: 'facebook',
          q: `site:facebook.com ${presets.cert_hunters[0]}`
        });
      }
    }

    if (pf === 'instagram') {
      queries.push({
        platform: 'instagram',
        q: `site:instagram.com ${baseKw} ${province}`
      });
      queries.push({
        platform: 'instagram',
        q: `site:instagram.com ${presets.creators[1] || baseKw} "09" OR "03" OR "zalo" OR "DM"`
      });
    }

    if (pf === 'telegram') {
      queries.push({
        platform: 'telegram',
        q: `site:t.me ${baseKw} OR "fitness" OR "yoga" OR "gym" Việt Nam`
      });
    }

    if (pf === 'x') {
      queries.push({
        platform: 'x',
        q: `(site:x.com OR site:twitter.com) ${baseKw} ${province}`
      });
    }

    if (pf === 'youtube') {
      queries.push({
        platform: 'youtube',
        q: `site:youtube.com/@ ${baseKw} ${province} "09" OR "03" OR "zalo"`
      });
    }
  }

  return queries;
}

/**
 * Làm sạch Tiêu đề kết quả MXH thành Tên Cá Nhân / Tên Kênh đẹp mắt
 */
function cleanSocialProfileTitle(rawTitle = '', platform = '', handle = '') {
  let clean = rawTitle
    .replace(/\s*\(@[^)]+\)\s*•\s*Instagram photos and videos/i, '')
    .replace(/\s*\(@[^)]+\)\s*\|\s*TikTok/i, '')
    .replace(/\s*\|\s*TikTok.*$/i, '')
    .replace(/\s*-\s*Facebook.*$/i, '')
    .replace(/\s*\|\s*Facebook.*$/i, '')
    .replace(/\s*on Instagram:.*$/i, '')
    .replace(/\s*on X:.*$/i, '')
    .replace(/\s*-\s*YouTube.*$/i, '')
    .replace(/^Telegram:\s*Contact\s*/i, '')
    .trim();

  if (clean.length > 95) {
    clean = clean.slice(0, 95).trim();
  }
  return clean || handle || `Học viên ${platform.toUpperCase()}`;
}

/**
 * Thử truy cập trang cá nhân công khai / Bio link để bóc tách thêm SĐT/Zalo nếu snippet chưa có
 */
async function tryEnrichPublicSocialPage(page, url) {
  const out = { phones: [], emails: [], extraBio: '' };
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
    out.extraBio = (metaDesc || ogDesc).slice(0, 240);
  } catch (_) {
    // Bỏ qua nếu nền tảng yêu cầu đăng nhập hoặc timeout
  }
  return out;
}

/**
 * Thực thi quét Khách hàng Cá nhân (B2C) đa nền tảng mạng xã hội
 */
async function crawlMultiPlatformSocialB2C(page, {
  keyword,
  province,
  sportCategory,
  platforms = ['all'],
  b2cMode = 'all',
  maxResults = 30,
  onLog = () => {}
}) {
  const queries = buildPlatformQueries({ sportCategory, keyword, province, platforms, b2cMode });
  const collected = [];
  const seenUrls = new Set();

  for (const item of queries) {
    if (collected.length >= maxResults) break;

    onLog(`🌐 [${item.platform.toUpperCase()}] Đang săn học viên cá nhân: "${item.q}"...`);

    // Kết hợp tìm kiếm trên cả Bing và DuckDuckGo HTML để tối đa lượng Profile cá nhân thu về
    const searchEngines = [
      `https://www.bing.com/search?q=${encodeURIComponent(item.q)}&count=20`,
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(item.q)}`
    ];

    for (const engineUrl of searchEngines) {
      if (collected.length >= maxResults) break;

      try {
        await page.goto(engineUrl, { waitUntil: 'domcontentloaded', timeout: 16000 });
        await page.waitForTimeout(1000);

        const rawItems = await page.evaluate(() => {
          const list = [];
          // Bing selectors
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
          // DuckDuckGo HTML selectors
          document.querySelectorAll('.result').forEach((el) => {
            const a = el.querySelector('a.result__a');
            const p = el.querySelector('.result__snippet');
            if (a && a.href) {
              list.push({
                title: a.innerText.trim(),
                url: a.href,
                snippet: p ? p.innerText.trim() : ''
              });
            }
          });
          return list;
        });

        for (const r of rawItems) {
          if (collected.length >= maxResults) break;

          // Giải mã link redirect nếu từ DuckDuckGo
          let targetUrl = r.url;
          if (targetUrl.includes('uddg=')) {
            try {
              const u = new URL(targetUrl, 'https://duckduckgo.com');
              targetUrl = decodeURIComponent(u.searchParams.get('uddg') || targetUrl);
            } catch (_) {}
          }

          if (!targetUrl.startsWith('http') || seenUrls.has(targetUrl)) continue;
          seenUrls.add(targetUrl);

          const combinedText = `${r.title} ${r.snippet}`;
          const identity = parseSocialIdentity(targetUrl, combinedText);
          const detectedPlatform = identity.platform !== 'web' ? identity.platform : item.platform;

          let phones = extractPhonesFromText(combinedText);
          let emails = extractEmailsFromText(combinedText);
          let bioNote = r.snippet;

          // Nếu chưa có SĐT trong snippet và là trang cá nhân TikTok/Telegram/Web, thử vào lấy thêm
          if (phones.length === 0 && ['tiktok', 'telegram', 'youtube'].includes(detectedPlatform)) {
            const enriched = await tryEnrichPublicSocialPage(page, targetUrl);
            if (enriched.phones.length > 0) phones = enriched.phones;
            if (enriched.emails.length > 0) emails = enriched.emails;
            if (enriched.extraBio && !bioNote) bioNote = enriched.extraBio;
          }

          const primaryPhone = phones[0] || '';
          const cleanName = cleanSocialProfileTitle(r.title, detectedPlatform, identity.handle);
          const leadType = detectLeadType(cleanName, bioNote, targetUrl);
          const leadIntent = detectLeadIntent(cleanName, bioNote, 'B2C');

          // Với chế độ quét Cá nhân MXH: Lưu tất cả cá nhân có SĐT HOẶC có Link Profile/Handle hợp lệ để nhắn DM
          collected.push({
            name: cleanName,
            lead_type: b2cMode.startsWith('b2c') ? 'B2C' : leadType,
            lead_intent: leadIntent,
            sport_category: detectSportCategory(`${cleanName} ${bioNote} ${keyword}`, sportCategory),
            platform: detectedPlatform,
            social_handle: identity.handle || '',
            social_url: targetUrl,
            phone: primaryPhone,
            secondary_phones: phones.slice(1, 3).join(', '),
            email: emails[0] || '',
            facebook_url: detectedPlatform === 'facebook' ? targetUrl : '',
            website: detectedPlatform === 'web' ? targetUrl : '',
            address: province,
            province,
            source: `${detectedPlatform}_b2c`,
            contact_person: identity.handle || cleanName,
            expected_students: 1,
            notes: `[${detectedPlatform.toUpperCase()}${identity.handle ? ' ' + identity.handle : ''}] ${bioNote.slice(0, 260)}`
          });
        }
      } catch (err) {
        onLog(`⚠️ Cảnh báo trên ${item.platform}: ${err.message}`);
      }
    }
  }

  return collected;
}

module.exports = {
  B2C_SPORT_KEYWORDS,
  buildPlatformQueries,
  crawlMultiPlatformSocialB2C
};
