/* merger.js —— 拼装最终文本
 *
 * 输出格式（每章）：
 *   章节名（文件名去掉 .txt）
 *   空行
 *   正文
 *   空行
 * 下一章接着来。章名既当标题，也当章节分隔符。
 */
(function (global) {
  'use strict';

  const TF = global.TF = global.TF || {};

  /* 统一换行、去掉首尾空白，正文内部一行不动 */
  function normalize(text) {
    return String(text || '')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n?/g, '\n')
      .replace(/^\s+/, '')
      .replace(/\s+$/, '');
  }

  function squeeze(s) {
    return s.replace(/[\s\u3000]+/g, '');
  }

  /* 取一章的标题与正文；dedupe 时，若首行就是标题（很多章节 txt 会自带），就去掉这一行 */
  function prepare(item, opts) {
    const title = String(item.name || '').replace(/\.txt$/i, '').trim();
    let body = normalize(item.text);

    if (opts.dedupeTitle && body) {
      const lines = body.split('\n');
      const first = squeeze(lines[0]);
      const t = squeeze(title);
      if (first && (first === t || first === t + '正文' || first === t + '（正文）')) {
        lines.shift();
        body = normalize(lines.join('\n'));
      }
    }
    return { title: title, body: body };
  }

  /* items: [{ name, text }]
   * opts: { addTitle, blankLine, dedupeTitle, lineEnding }
   *   addTitle   是否在每章开头加文件名当标题（默认 true）
   *   blankLine  章节之间是否空一行（默认 true）；只在开标题时，标题与正文之间也跟着变
   */
  function build(items, opts) {
    const options = opts || {};
    const nl = options.lineEnding === '\n' ? '\n' : '\r\n';
    const addTitle = options.addTitle !== false;
    const blankLine = options.blankLine !== false;
    const sep = blankLine ? nl + nl : nl;

    const blocks = [];
    let chars = 0;

    for (const item of items) {
      const chapter = prepare(item, {
        dedupeTitle: addTitle && options.dedupeTitle
      });
      const body = chapter.body ? chapter.body.replace(/\n/g, nl) : '';

      // 不加标题时，空文件不产生任何内容
      if (!addTitle && !body) continue;

      blocks.push({ title: chapter.title, body: body });
      chars += (addTitle ? chapter.title.length : 0) + chapter.body.length;
    }

    const text = blocks.map(function (b) {
      if (!addTitle) return b.body;
      return b.body ? b.title + sep + b.body : b.title;
    }).join(sep) + nl;

    return { text: text, chapters: blocks.length, chars: chars };
  }

  TF.merger = { build: build };

})(globalThis);
