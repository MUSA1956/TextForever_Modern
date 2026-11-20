/* sorter.js —— 从文件名解析章节号，并按「章节自然序」排序
 *
 * 为什么不能只按拼音排：「第十章」(di shi zhang) 会排在「第二章」(di er zhang) 前面。
 * 所以主键是数值化的章节号，拼音只在同号或没有章节号时用。
 *
 * 排序键（从大到小比较）：
 *   1. 卷号（第X卷 / 部 / 集），没有就当 0
 *   2. 章节号（第X章 / 回 / 节 / 话 / 篇，或 001、12-3 这类前缀）
 *      没有章节号：序/楔子/引子/前言 → -1；后记/番外/尾声等 → 排在最后
 *   3. 拼音比较（Intl.Collator，中文按拼音）
 *   4. 原始文件名（保证结果唯一、可复现）
 */
(function (global) {
  'use strict';

  const TF = global.TF = global.TF || {};

  const CN_DIGITS = {
    '零': 0, '〇': 0,
    '一': 1, '壹': 1,
    '二': 2, '两': 2, '贰': 2,
    '三': 3, '叁': 3,
    '四': 4, '肆': 4,
    '五': 5, '伍': 5,
    '六': 6, '陆': 6,
    '七': 7, '柒': 7,
    '八': 8, '捌': 8,
    '九': 9, '玖': 9
  };

  const CN_UNITS = {
    '十': 10, '拾': 10,
    '百': 100, '佰': 100,
    '千': 1000, '仟': 1000,
    '万': 10000, '萬': 10000,
    '亿': 100000000
  };

  const NUM_CHARS = '[0-9零〇一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟萬]+';

  const PREFACE = ['序章', '序言', '楔子', '引子', '前言', '开篇', '卷首'];
  const TAIL = ['后记', '尾声', '番外', '附录', '外传', '作者的话'];

  const MAX = Number.MAX_SAFE_INTEGER;

  /* 全角数字转半角，免得 ０１２ 这种写法漏掉 */
  function toHalfWidth(s) {
    return s.replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    });
  }

  /* 中文数字 → 阿拉伯数字。支持「二十一」「一百零五」「两千」「一万二千」「十二」 */
  function cnToNumber(str) {
    if (!str) return NaN;
    const s = toHalfWidth(String(str).trim());
    if (/^\d+$/.test(s)) return parseInt(s, 10);

    let total = 0;   // 已经结算的「万 / 亿」段
    let section = 0; // 当前段内累加
    let number = 0;  // 刚读到的数字

    for (const ch of s) {
      if (ch in CN_DIGITS) {
        number = CN_DIGITS[ch];
      } else if (ch in CN_UNITS) {
        const unit = CN_UNITS[ch];
        if (unit >= 10000) {
          total = (total + section + number) * unit;
          section = 0;
          number = 0;
        } else {
          if (number === 0) number = 1; // 「十一」的十前面没有数字，按 1 算
          section += number * unit;
          number = 0;
        }
      } else if (/[\s\u3000]/.test(ch)) {
        continue;
      } else {
        return NaN;
      }
    }
    return total + section + number;
  }

  /* 解析一个文件名，返回 { base, volume, chapter }；解析不出来的是 null */
  function parse(rawName) {
    const base = toHalfWidth(String(rawName || '').replace(/\.txt$/i, '')).trim();

    let volume = null;
    let chapter = null;

    let m = base.match(new RegExp('第\\s*(' + NUM_CHARS + ')\\s*[卷部集]'));
    if (m) volume = cnToNumber(m[1]);

    m = base.match(new RegExp('第\\s*(' + NUM_CHARS + ')\\s*[章回节话篇]'));
    if (m) chapter = cnToNumber(m[1]);

    if (chapter === null) {
      m = base.match(/^(?:chapter|ch\.?)\s*(\d{1,6})\b/i);
      if (m) chapter = parseInt(m[1], 10);
    }

    if (chapter === null) {
      // 001 xxx / 12-3 xxx / 7.标题 / 3_番外
      m = base.match(/^(\d{1,6})(?=[\s\-_.、·．:：]|$)/);
      if (m) chapter = parseInt(m[1], 10);
    }

    if (volume !== null && !Number.isFinite(volume)) volume = null;
    if (chapter !== null && !Number.isFinite(chapter)) chapter = null;

    if (chapter === null) {
      if (base === '序' || PREFACE.some(function (p) { return base.startsWith(p); })) {
        chapter = -1;
      } else if (TAIL.some(function (p) { return base.startsWith(p); })) {
        chapter = MAX;
      }
    }

    return {
      base: base,
      volume: volume === null ? 0 : volume,
      chapter: chapter === null ? MAX : chapter,
      hasChapter: chapter !== null
    };
  }

  let collator = null;
  function getCollator() {
    if (collator) return collator;
    try {
      // zh-u-co-pinyin：中文按拼音排；numeric 让 2 < 10
      collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', { numeric: true, sensitivity: 'variant' });
    } catch (e) {
      collator = new Intl.Collator('zh-Hans-CN', { numeric: true });
    }
    return collator;
  }

  function compareByPinyin(a, b) {
    const c = getCollator().compare(a.base, b.base);
    if (c !== 0) return c;
    if (a.base === b.base) return 0;
    return a.base < b.base ? -1 : 1;
  }

  /* 把字符串切成「文字」与「数字」两种块：数字块按数值比，文字块按拼音比。
     这样「其零 / 其一 / 其二 / 其三」会按 0、1、2、3 排，而不是按拼音 er/ling/san/yi 排。 */
  const NUM_TOKEN = /([0-9]+|[零〇一二三四五六七八九十百千万亿两壹贰叁肆伍陆柒捌玖拾佰仟萬]+)/g;

  function tokenize(str) {
    const parts = [];
    let last = 0;
    let m;
    NUM_TOKEN.lastIndex = 0;
    while ((m = NUM_TOKEN.exec(str)) !== null) {
      if (m.index > last) parts.push({ text: str.slice(last, m.index), num: null });
      const value = cnToNumber(m[1]);
      parts.push({ text: m[1], num: Number.isFinite(value) ? value : null });
      last = m.index + m[1].length;
    }
    if (last < str.length) parts.push({ text: str.slice(last), num: null });
    return parts;
  }

  function compareNumericAware(a, b) {
    const ta = tokenize(a);
    const tb = tokenize(b);
    const len = Math.max(ta.length, tb.length);

    for (let i = 0; i < len; i++) {
      const x = ta[i];
      const y = tb[i];
      if (!x) return -1;
      if (!y) return 1;

      if (x.num !== null && y.num !== null) {
        if (x.num !== y.num) return x.num - y.num;
        continue;
      }
      if (x.text !== y.text) {
        const c = getCollator().compare(x.text, y.text);
        if (c !== 0) return c;
      }
    }
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }

  function compareNatural(a, b) {
    if (a.volume !== b.volume) return a.volume - b.volume;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return compareNumericAware(a.base, b.base);
  }

  function compareName(a, b) {
    return compareNumericAware(a.base, b.base);
  }

  /* 给界面用的简短描述 */
  function describe(rawName) {
    const p = parse(rawName);
    const parts = [];
    if (p.volume) parts.push('第 ' + p.volume + ' 卷');
    if (p.chapter === -1) parts.push('前置');
    else if (p.chapter === MAX) parts.push('无编号');
    else parts.push('第 ' + p.chapter + ' 章');
    return parts.join(' · ');
  }

  /* 排序入口：items 里每个元素至少有 name 字段；不修改原数组 */
  function sortBy(items, rule, desc) {
    const prepared = items.map(function (item) {
      return { item: item, key: parse(item.name) };
    });

    const cmp = rule === 'pinyin' ? compareByPinyin
      : rule === 'name' ? compareName
        : compareNatural;

    prepared.sort(function (a, b) { return cmp(a.key, b.key); });

    const out = prepared.map(function (p) { return p.item; });
    if (desc) out.reverse();
    return out;
  }

  TF.sorter = {
    parse: parse,
    describe: describe,
    cnToNumber: cnToNumber,
    sortBy: sortBy
  };

})(globalThis);
