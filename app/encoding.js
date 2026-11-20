/* encoding.js —— 编码检测、解码与导出编码
 *
 * 依赖：浏览器原生的 TextDecoder / TextEncoder / Blob，无第三方库。
 * 读取顺序：BOM → UTF-8 严格校验 → GB18030 → 兜底 UTF-8（容错）。
 * 导出：UTF-8（无 BOM / 带 BOM）、GB18030。
 *   GB18030 的「写」没有浏览器 API，这里用「反向建表」解决：
 *   把 GB18030 所有双字节组合逐个解出来，反过来得到 字符 → 字节 的映射（约 2.4 万项，只在第一次导出时构建）。
 */
(function (global) {
  'use strict';

  const TF = global.TF = global.TF || {};

  const LABELS = {
    'utf-8': 'UTF-8',
    'utf-8-bom': 'UTF-8 (BOM)',
    'gb18030': 'GB18030',
    'utf-16le': 'UTF-16 LE',
    'utf-16be': 'UTF-16 BE'
  };

  function label(key) {
    return LABELS[key] || key || '未知';
  }

  /* 下拉框用的选项：第一项是「自动」，其余是手动指定 */
  function optionList() {
    return [
      { value: 'auto', label: '自动' },
      { value: 'utf-8', label: LABELS['utf-8'] },
      { value: 'utf-8-bom', label: LABELS['utf-8-bom'] },
      { value: 'gb18030', label: LABELS.gb18030 },
      { value: 'utf-16le', label: LABELS['utf-16le'] },
      { value: 'utf-16be', label: LABELS['utf-16be'] }
    ];
  }

  function hasDecoder(name) {
    try {
      new TextDecoder(name);
      return true;
    } catch (e) {
      return false;
    }
  }

  function isValidUtf8(u8) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(u8);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 探测编码，返回 LABELS 里的键名 */
  function detect(buffer) {
    const u8 = new Uint8Array(buffer);

    if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return 'utf-8-bom';
    if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) return 'utf-16le';
    if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) return 'utf-16be';

    if (isValidUtf8(u8)) return 'utf-8';

    if (hasDecoder('gb18030')) {
      try {
        new TextDecoder('gb18030', { fatal: true }).decode(u8);
        return 'gb18030';
      } catch (e) {
        /* 不是合法的 GB18030，落到兜底 */
      }
    }
    return 'utf-8';
  }

  /* 按指定编码解码；encoding 传 'auto' 或空则先探测 */
  function decode(buffer, encoding) {
    const enc = (!encoding || encoding === 'auto') ? detect(buffer) : encoding;
    try {
      let u8 = new Uint8Array(buffer);
      if (enc === 'utf-8-bom') u8 = u8.subarray(3);
      if (enc === 'utf-16le' || enc === 'utf-16be') u8 = u8.subarray(2);

      const name = enc === 'utf-8-bom' ? 'utf-8' : enc;
      const text = new TextDecoder(name, { fatal: false }).decode(u8);
      return { text: text.replace(/^\uFEFF/, ''), encoding: enc, error: '' };
    } catch (e) {
      return { text: '', encoding: enc, error: '解码失败：' + e.message };
    }
  }

  /* ---------------- GB18030 编码（反向建表） ---------------- */

  let gbkMap = null;

  function buildGbkMap() {
    if (gbkMap) return gbkMap;
    const map = new Map();
    const dec = new TextDecoder('gb18030');
    const pair = new Uint8Array(2);

    for (let lead = 0x81; lead <= 0xFE; lead++) {
      for (let trail = 0x40; trail <= 0xFE; trail++) {
        if (trail === 0x7F) continue;
        pair[0] = lead;
        pair[1] = trail;
        const ch = dec.decode(pair);
        // 只收「正好一个字符且不是替换符」的组合；重复的字符保留第一次出现的编码
        if (ch.length === 1 && ch !== '\uFFFD' && !map.has(ch)) {
          map.set(ch, [lead, trail]);
        }
      }
    }
    gbkMap = map;
    return map;
  }

  function encodeGb18030(text) {
    if (!hasDecoder('gb18030')) throw new Error('当前浏览器不支持 GB18030');
    const map = buildGbkMap();
    // 最坏情况每个字符占 2 字节；先分配再截取，避免超大数组
    const buf = new Uint8Array(text.length * 2 + 4);
    let p = 0;
    let missing = 0;

    for (const ch of text) {
      const code = ch.codePointAt(0);
      if (code < 0x80) {
        buf[p++] = code;
        continue;
      }
      const pair = map.get(ch);
      if (pair) {
        buf[p++] = pair[0];
        buf[p++] = pair[1];
      } else {
        // 超出 GB18030 双字节区（例如 emoji）——替换为 ?，并在返回里报数量
        missing++;
        buf[p++] = 0x3F;
      }
    }
    return { bytes: buf.subarray(0, p), missing: missing };
  }

  /* 生成导出用的 Blob。返回 { blob, missing }，missing 是 GB18030 下无法表示的字符数 */
  function encodeToBlob(text, encoding) {
    if (encoding === 'gb18030') {
      const res = encodeGb18030(text);
      return { blob: new Blob([res.bytes], { type: 'text/plain' }), missing: res.missing };
    }

    const bytes = new TextEncoder().encode(text); // 统一用 UTF-8 编码
    if (encoding === 'utf-8-bom') {
      const out = new Uint8Array(bytes.length + 3);
      out[0] = 0xEF; out[1] = 0xBB; out[2] = 0xBF;
      out.set(bytes, 3);
      return { blob: new Blob([out], { type: 'text/plain' }), missing: 0 };
    }
    return { blob: new Blob([bytes], { type: 'text/plain' }), missing: 0 };
  }

  TF.encoding = {
    label: label,
    optionList: optionList,
    detect: detect,
    decode: decode,
    encodeToBlob: encodeToBlob
  };

})(globalThis);
