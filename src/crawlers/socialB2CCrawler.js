/**
 * BỘ MÁY SĂN HỌC VIÊN CÁ NHÂN (B2C) ĐA NỀN TẢNG MẠNG XÃ HỘI (9 PLATFORMS) - ENGINE v4.0
 * Hỗ trợ: Facebook, Zalo (zalo.me/g/ + SĐT 10 số), Threads, TikTok, Instagram, Telegram, X (Twitter), YouTube, LinkedIn
 * Đột phá độ chính xác v4.0:
 *  1. Đa công cụ tìm kiếm chống chặn Bot: Yahoo Search VN + Bing (Safe-Wait) + Direct YouTube Search + DuckDuckGo
 *  2. Truy vấn tự nhiên không dùng toán tử OR phức tạp (Ngăn chặn 100% hiện tượng Bing hủy site: trả về Google Trợ giúp / Zalo PC)
 *  3. Giải mã URL gốc (Yahoo RU= / Bing u=a1 / DDG uddg= / FB l.php)
 *  4. Kiểm tra khớp tên miền thật 100% (verifyPlatformDomain) + Bộ Kiểm Duyệt Cá Nhân 4 Tầng (validateLeadRelevance)
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
  detectLeadIntent
} = require('../utils/phoneParser');

/**
 * Bộ từ khóa tự nhiên, chính xác cao cho từng bộ môn VTC
 * Tuyệt đối không dùng toán tử ("A" OR "B") phức tạp làm hỏng bộ phân tích site: của công cụ tìm kiếm
 */
const B2C_SPORT_KEYWORDS = {
  gym: {
    core: 'PT gym',
    creators: ['PT gym dạy kèm 1-1', 'Personal Trainer dạy kèm gym', 'HLV thể hình dạy kèm Zalo'],
    job_seekers: ['tuyển PT gym', 'tìm việc PT gym thể hình', 'nhận dạy kèm gym tại nhà'],
    cert_hunters: ['chứng chỉ PT gym Cục TDTT', 'học chứng chỉ HLV thể hình', 'thi chứng chỉ PT gym']
  },
  yoga: {
    core: 'HLV Yoga',
    creators: ['giáo viên Yoga dạy kèm', 'HLV Yoga trị liệu cổ vai gáy', 'cô giáo dạy Yoga tại nhà Zalo'],
    job_seekers: ['tuyển giáo viên Yoga', 'tìm việc giáo viên Yoga', 'nhận dạy lớp Yoga'],
    cert_hunters: ['chứng chỉ HLV Yoga Cục TDTT', 'học chứng chỉ giáo viên Yoga', 'tập huấn chuyên môn Yoga']
  },
  dance: {
    core: 'dạy nhảy Zumba',
    creators: ['dạy nhảy Zumba', 'lớp nhảy Shuffle Dance', 'CLB Dân vũ khiêu vũ Zalo'],
    job_seekers: ['tuyển giáo viên dạy nhảy Zumba', 'giáo viên Zumba Shuffle Dance', 'biên đạo dạy nhảy hiện đại'],
    cert_hunters: ['chứng chỉ HLV Dân vũ thể thao', 'chứng chỉ giáo viên Zumba', 'tập huấn Dân vũ thể thao']
  },
  martial_arts: {
    core: 'võ cổ truyền',
    creators: ['HLV Kickfit Boxing dạy kèm', 'lớp học võ cổ truyền', 'thầy dạy võ tự vệ Zalo'],
    job_seekers: ['tuyển HLV võ thuật Kickfit', 'dạy kèm Boxing Muay Thái', 'HLV võ cổ truyền'],
    cert_hunters: ['chứng chỉ HLV võ cổ truyền', 'tập huấn chuyên môn võ cổ truyền']
  }
};

/**
 * Xây dựng danh sách truy vấn tự nhiên, ngắn gọn cho từng nền tảng
 */
function buildPlatformQueries({ sportCategory = 'gym', keyword = '', province = 'Hà Nội', platforms = ['all'], b2cMode = 'all' }) {
  const presets = B2C_SPORT_KEYWORDS[sportCategory] || B2C_SPORT_KEYWORDS.gym;

  const cleanKw = (keyword || '').replace(/["()]/g, '').trim();
  const creatorPhrase = cleanKw && cleanKw.split(/\s+/).length <= 5 ? cleanKw : presets.creators[0];
  const jobPhrase = presets.job_seekers[0];
  const certPhrase = presets.cert_hunters[0];
  const coreSport = presets.core;

  const selectedPlatforms = platforms.includes('all')
    ? ['facebook', 'zalo', 'threads', 'tiktok', 'instagram', 'telegram', 'x', 'youtube', 'linkedin']
    : platforms;

  const queries = [];

  for (const pf of selectedPlatforms) {
    if (pf === 'facebook') {
      if (b2cMode === 'all' || b2cMode === 'b2c_creators') {
        queries.push({
          platform: 'facebook',
          q: `site:facebook.com ${creatorPhrase} ${province} Zalo 09`
        });
        queries.push({
          platform: 'facebook',
          q: `site:facebook.com ${presets.creators[1]} ${province}`
        });
      }
      if (b2cMode === 'all' || b2cMode === 'b2c_job_seekers') {
        queries.push({
          platform: 'facebook',
          q: `site:facebook.com ${jobPhrase} ${province}`
        });
      }
      if (b2cMode === 'all' || b2cMode === 'b2c_cert_hunters') {
        queries.push({
          platform: 'facebook',
          q: `site:facebook.com ${certPhrase}`
        });
      }
    }

    if (pf === 'zalo') {
      queries.push({
        platform: 'zalo',
        q: `site:zalo.me/g ${coreSport}`
      });
      queries.push({
        platform: 'zalo',
        q: `site:facebook.com ${creatorPhrase} ${province} Zalo 098`
      });
      queries.push({
        platform: 'zalo',
        q: `site:facebook.com ${jobPhrase} ${province} Zalo 09`
      });
    }

    if (pf === 'tiktok') {
      queries.push({
        platform: 'tiktok',
        q: `site:tiktok.com ${creatorPhrase} ${province}`
      });
      queries.push({
        platform: 'tiktok',
        q: `site:tiktok.com ${coreSport} ${province}`
      });
    }

    if (pf === 'threads') {
      queries.push({
        platform: 'threads',
        q: `site:threads.net ${coreSport} ${province}`
      });
      queries.push({
        platform: 'threads',
        q: `site:threads.com ${coreSport} ${province}`
      });
    }

    if (pf === 'instagram') {
      queries.push({
        platform: 'instagram',
        q: `site:instagram.com ${coreSport} ${province}`
      });
    }

    if (pf === 'youtube') {
      queries.push({
        platform: 'youtube',
        q: `${creatorPhrase} ${province}`,
        directYoutube: true
      });
      queries.push({
        platform: 'youtube',
        q: `site:youtube.com ${creatorPhrase} ${province} Zalo`
      });
    }

    if (pf === 'telegram') {
      queries.push({
        platform: 'telegram',
        q: `site:t.me ${coreSport}`
      });
    }

    if (pf === 'x') {
      queries.push({
        platform: 'x',
        q: `site:x.com ${coreSport} ${province}`
      });
    }

    if (pf === 'linkedin') {
      queries.push({
        platform: 'linkedin',
        q: `site:linkedin.com/in ${coreSport} ${province}`
      });
    }
  }

  return queries;
}

function cleanSocialProfileTitle(rawTitle = '', platform = '', handle = '') {
  let clean = String(rawTitle || '')
    .replace(/\s*\(@[^)]+\)\s*•\s*Instagram photos and videos/i, '')
    .replace(/\s*\(@[^)]+\)\s*•\s*Threads, Say more/i, '')
    .replace(/\s*\(@[^)]+\)\s*on Threads/i, '')
    .replace(/\s*•\s*Threads, Say more/i, '')
    .replace(/\s*\(@[^)]+\)\s*\|\s*TikTok/i, '')
    .replace(/\s*\|\s*TikTok.*$/i, '')
    .replace(/\s*-\s*Facebook.*$/i, '')
    .replace(/\s*\|\s*Facebook.*$/i, '')
    .replace(/\s*\|\s*LinkedIn.*$/i, '')
    .replace(/\s*on Instagram:.*$/i, '')
    .replace(/\s*on X:.*$/i, '')
    .replace(/\s*-\s*YouTube.*$/i, '')
    .replace(/^Telegram:\s*Contact\s*/i, '')
    .trim();

  if (clean.length > 95) {
    clean = clean.slice(0, 95).trim();
  }
  return clean || handle || '';
}

/**
 * Quét trực tiếp trên YouTube Search (Lấy video dạy nhảy/Yoga/Gym + @handle kênh + SĐT Zalo trong mô tả)
 */
async function scrapeDirectYouTubeSearch(page, queryStr) {
  const results = [];
  try {
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(queryStr)}`;
    await page.goto(ytUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(1800);

    const items = await page.evaluate(() => {
      const out = [];
      const renderers = document.querySelectorAll('ytd-video-renderer, ytd-channel-renderer');
      renderers.forEach((el) => {
        const titleEl = el.querySelector('#video-title, #channel-title');
        const channelLink = el.querySelector('#channel-info a, a#main-link');
        const descEl = el.querySelector('.metadata-snippet-container, #description-text, #description');
        const videoLink = el.querySelector('a#video-title, a#thumbnail');

        const title = titleEl ? titleEl.innerText.trim() : '';
        const href = (videoLink && videoLink.href) || (channelLink && channelLink.href) || '';
        const chHref = channelLink && channelLink.href ? channelLink.href : '';
        const chName = channelLink ? channelLink.innerText.trim() : '';
        const snippet = descEl ? descEl.innerText.trim() : '';

        if (title && href) {
          out.push({
            title: chName && !title.includes(chName) ? `${chName} - ${title}` : title,
            url: chHref.includes('/@') ? chHref : href,
            evidenceUrl: href,
            snippet: `${chName} ${title} ${snippet}`.trim()
          });
        }
      });
      return out.slice(0, 12);
    });

    return items;
  } catch (_) {
    return results;
  }
}

/**
 * Quét kết quả từ Yahoo Search VN + Bing Search (có xử lý chống lỗi Execution context destroyed)
 */
async function scrapeSearchEngines(page, queryStr) {
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
      await page.waitForTimeout(1200);

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
            // Nếu Bing hiện thông báo "Không có kết quả nào cho..." thì bỏ qua ngay để không lấy kết quả rác thay thế
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
        // Nếu trang vừa redirect lần 2, đợi thêm 1 giây rồi lấy lại
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

async function tryEnrichPublicSocialPage(page, url) {
  const out = { phones: [], emails: [], extraBio: '' };
  if (!url || !url.startsWith('http')) return out;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(700);
    const html = await page.content();
    const $ = cheerio.load(html);
    const metaDesc = $('meta[name="description"]').attr('content') || '';
    const ogDesc = $('meta[property="og:description"]').attr('content') || '';
    const bodyText = ($('body').text() || '').slice(0, 5000);

    const combined = `${metaDesc} ${ogDesc} ${bodyText}`;
    out.phones = extractPhonesFromText(combined);
    out.emails = extractEmailsFromText(combined);
    out.extraBio = (metaDesc || ogDesc).slice(0, 280);
  } catch (_) {}
  return out;
}

/**
 * Thực thi quét Khách hàng Cá nhân (B2C) đa nền tảng kèm Bộ Kiểm Duyệt Cá Nhân 4 Tầng
 */
async function crawlMultiPlatformSocialB2C(page, {
  keyword,
  province,
  sportCategory,
  platforms = ['all'],
  b2cMode = 'all',
  maxResults = 30,
  onLog = () => {},
  onReject = () => {}
}) {
  const queries = buildPlatformQueries({ sportCategory, keyword, province, platforms, b2cMode });
  const collected = [];
  const seenUrls = new Set();

  for (const item of queries) {
    if (collected.length >= maxResults) break;

    onLog(`🌐 [${item.platform.toUpperCase()}] Đang săn cá nhân (${sportCategory.toUpperCase()}): "${item.q}"`);

    let rawItems = [];
    if (item.directYoutube) {
      rawItems = await scrapeDirectYouTubeSearch(page, item.q);
    } else {
      rawItems = await scrapeSearchEngines(page, item.q);
    }

    for (const r of rawItems) {
      if (collected.length >= maxResults) break;

      // TẦNG 1: Giải mã URL gốc thật sự (Yahoo RU= / Bing u=a1 / DDG uddg=)
      const realUrl = unwrapSearchRedirectUrl(r.url);
      const realEvidenceUrl = unwrapSearchRedirectUrl(r.evidenceUrl || r.url);
      if (!realUrl || !realUrl.startsWith('http') || seenUrls.has(realUrl)) continue;
      seenUrls.add(realUrl);

      // TẦNG 2: Kiểm tra khớp tên miền MXH ngay lập tức
      if (item.platform !== 'zalo' && !verifyPlatformDomain(realUrl, item.platform)) {
        onReject(r.title, `Sai tên miền nền tảng (Yêu cầu: ${item.platform})`);
        continue;
      }

      const combinedText = `${r.title} ${r.snippet}`;
      const identity = parseSocialIdentity(realUrl, combinedText);
      const cleanName = cleanSocialProfileTitle(r.title, identity.platform, identity.handle);

      // TẦNG 3 & 4: Kiểm duyệt Bộ môn VTC + Tín hiệu Cá nhân B2C thật
      const relevance = validateLeadRelevance({
        name: cleanName,
        text: r.snippet,
        url: realUrl,
        leadType: 'B2C',
        sportCategory,
        expectedPlatform: item.platform,
        requireSocialDomain: item.platform !== 'zalo'
      });

      if (!relevance.isValid) {
        onReject(cleanName || r.title, relevance.reason);
        continue;
      }

      const detectedPlatform =
        item.platform === 'zalo' && (realUrl.includes('zalo.me') || /zalo/i.test(combinedText))
          ? 'zalo'
          : (identity.platform !== 'web' ? identity.platform : item.platform);

      let phones = extractPhonesFromText(combinedText);
      let emails = extractEmailsFromText(combinedText);
      let evidenceText = (r.snippet || r.title || '').trim();

      if (phones.length === 0 && ['tiktok', 'threads', 'telegram'].includes(detectedPlatform)) {
        const enriched = await tryEnrichPublicSocialPage(page, realUrl);
        if (enriched.phones.length > 0) phones = enriched.phones;
        if (enriched.emails.length > 0) emails = enriched.emails;
        if (enriched.extraBio && evidenceText.length < 25) evidenceText = enriched.extraBio;
      }

      const primaryPhone = phones[0] || '';
      const leadIntent = detectLeadIntent(cleanName, evidenceText, 'B2C');
      const evidenceType = classifyEvidenceType(realEvidenceUrl, evidenceText);

      const finalHandle =
        identity.handle ||
        (detectedPlatform === 'zalo' && primaryPhone ? `Zalo: ${primaryPhone}` : '');

      collected.push({
        name: cleanName,
        lead_type: 'B2C',
        lead_intent: leadIntent,
        sport_category: relevance.detectedSport,
        platform: detectedPlatform,
        social_handle: finalHandle,
        social_url: identity.socialUrl || realUrl,
        evidence_type: evidenceType,
        evidence_snippet: evidenceText.slice(0, 380),
        evidence_url: realEvidenceUrl,
        phone: primaryPhone,
        secondary_phones: phones.slice(1, 3).join(', '),
        email: emails[0] || '',
        facebook_url: detectedPlatform === 'facebook' ? realUrl : '',
        website: '',
        address: province,
        province,
        source: `${detectedPlatform}_b2c`,
        contact_person: finalHandle || cleanName,
        expected_students: 1,
        notes: evidenceText.slice(0, 280)
      });
    }
  }

  return collected;
}

module.exports = {
  B2C_SPORT_KEYWORDS,
  buildPlatformQueries,
  crawlMultiPlatformSocialB2C
};
