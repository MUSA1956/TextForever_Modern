/* tests/merge-dir.js —— 用真实目录跑一遍合并逻辑（只读，不写任何文件）
 * 运行：node tests/merge-dir.js "D:\某本小说"
 * 加载的是网页里同一份 app/ 模块，不是另写一套逻辑。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const context = {
  console: console,
  Intl: Intl,
  TextDecoder: TextDecoder,
  TextEncoder: TextEncoder,
  Blob: Blob
};
vm.createContext(context);

['encoding.js', 'sorter.js', 'merger.js'].forEach(function (file) {
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'app', file), 'utf8'),
    context,
    { filename: file }
  );
});

const TF = context.TF;

const dir = process.argv[2];
if (!dir) {
  console.error('用法: node tests/merge-dir.js <章节目录>');
  process.exit(1);
}
if (!fs.existsSync(dir)) {
  console.error('目录不存在: ' + dir);
  process.exit(1);
}

function walk(current, out) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.txt$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(dir, []);
const items = files.map(function (file) {
  const buffer = fs.readFileSync(file);
  const detected = TF.encoding.detect(buffer);
  const decoded = TF.encoding.decode(buffer, detected);
  return {
    name: path.basename(file),
    path: file,
    size: buffer.length,
    encDetected: detected,
    text: decoded.text,
    error: decoded.error
  };
});

const sorted = TF.sorter.sortBy(items, 'natural', false);

console.log('\n共 ' + sorted.length + ' 个 txt，按「章节自然序」排序后：\n');
console.log(String('序号').padEnd(5) + String('章节号').padEnd(10) + String('编码').padEnd(12) + '文件名');
console.log('-'.repeat(90));
sorted.forEach(function (item, i) {
  const p = TF.sorter.parse(item.name);
  const chapter = p.chapter === Number.MAX_SAFE_INTEGER ? '无编号'
    : p.chapter === -1 ? '前置' : String(p.chapter);
  console.log(
    String(i + 1).padEnd(5) +
    chapter.padEnd(10) +
    TF.encoding.label(item.encDetected).padEnd(12) +
    item.name
  );
});

// 重复章节号提示
const seen = new Map();
sorted.forEach(function (item) {
  const p = TF.sorter.parse(item.name);
  if (!p.hasChapter || p.chapter < 0) return;
  if (!seen.has(p.chapter)) seen.set(p.chapter, []);
  seen.get(p.chapter).push(item.name);
});
const dup = Array.from(seen.entries()).filter(function (e) { return e[1].length > 1; });
if (dup.length) {
  console.log('\n⚠ 章节号重复：');
  dup.forEach(function (e) {
    console.log('  第 ' + e[0] + ' 章 → ' + e[1].join(' ｜ '));
  });
}

const merged = TF.merger.build(sorted, { dedupeTitle: true, lineEnding: '\r\n' });
console.log('\n合并结果：' + merged.chapters + ' 章 · ' + merged.chars.toLocaleString() + ' 字符 · ' +
  (Buffer.byteLength(merged.text, 'utf8') / 1024 / 1024).toFixed(2) + ' MB (UTF-8)');
console.log('\n--- 前 600 个字符 ---\n');
console.log(merged.text.slice(0, 600));
console.log('\n--- 末尾 200 个字符 ---\n');
console.log(merged.text.slice(-200));
