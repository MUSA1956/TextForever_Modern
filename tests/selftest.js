/* tests/selftest.js —— 开发期自测（只校验纯逻辑，不启动浏览器）
 * 运行：node tests/selftest.js
 * 不参与网页运行，打包带走时留着也没影响。
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

['encoding.js', 'sorter.js', 'files.js', 'merger.js'].forEach(function (file) {
  const full = path.join(__dirname, '..', 'app', file);
  vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: file });
});

const TF = context.TF;
let failed = 0;

function check(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log('  ok   ' + label);
  } else {
    failed++;
    console.log('  FAIL ' + label + '\n       expected ' + e + '\n       actual   ' + a);
  }
}

console.log('\n[1] 中文数字解析');
[
  ['一', 1], ['十', 10], ['十二', 12], ['二十一', 21], ['一百零五', 105],
  ['两百', 200], ['一千零一', 1001], ['一万二千三百四十五', 12345], ['０１２', 12]
].forEach(function (pair) {
  check('cnToNumber("' + pair[0] + '")', TF.sorter.cnToNumber(pair[0]), pair[1]);
});

console.log('\n[2] 章节号识别');
[
  ['第一章 初入江湖.txt', 1],
  ['第001章.txt', 1],
  ['第一百零一章.txt', 101],
  ['第三章 归来.TXT', 3],
  ['12-3 风波.txt', 12],
  ['chapter 7.txt', 7],
  ['楔子.txt', -1],
  ['番外一.txt', Number.MAX_SAFE_INTEGER]
].forEach(function (pair) {
  check('parse("' + pair[0] + '").chapter', TF.sorter.parse(pair[0]).chapter, pair[1]);
});

console.log('\n[3] 自然序排序');
const names = [
  '第十章.txt', '第二章.txt', '第一章.txt', '第一百章.txt',
  '楔子.txt', '番外一.txt', '第001章.txt', '序章.txt', '3-番外.txt'
].map(function (n) { return { name: n }; });
const sorted = TF.sorter.sortBy(names, 'natural', false).map(function (x) {
  return TF.sorter.parse(x.name).chapter;
});
check('排序结果', sorted, [-1, -1, 1, 1, 2, 3, 10, 100, Number.MAX_SAFE_INTEGER]);
check('倒序首位', TF.sorter.parse(TF.sorter.sortBy(names, 'natural', true)[0].name).chapter, Number.MAX_SAFE_INTEGER);

console.log('\n[3b] 系列序号（其零 / 其一 / 其二 / 其三）');
const series = ['不要共情 其零', '不要共情 其一', '不要共情 其二', '不要共情 其三']
  .map(function (n) { return { name: n + '.txt' }; });
const seriesOrder = ['不要共情 其零.txt', '不要共情 其一.txt', '不要共情 其二.txt', '不要共情 其三.txt'];
check('自然序', TF.sorter.sortBy(series, 'natural', false).map(function (x) { return x.name; }), seriesOrder);
check('文件名序', TF.sorter.sortBy(series, 'name', false).map(function (x) { return x.name; }), seriesOrder);

console.log('\n[4] 合并输出');
const merged = TF.merger.build([
  { name: '第一章.txt', text: '第一章\r\n\r\n正文一\n\n' },
  { name: '第二章.txt', text: '正文二' }
], { dedupeTitle: true, lineEnding: '\r\n' });
check('合并文本', merged.text, '第一章\r\n\r\n正文一\r\n\r\n第二章\r\n\r\n正文二\r\n');
check('章节数', merged.chapters, 2);

const noDedupe = TF.merger.build([
  { name: '第一章.txt', text: '第一章\n正文一' }
], { dedupeTitle: false, lineEnding: '\n' });
check('关掉去重后保留首行', noDedupe.text, '第一章\n\n第一章\n正文一\n');

console.log('\n[4b] 「加标题 / 空行」两个开关');
const two = [
  { name: '第一章.txt', text: '正文一' },
  { name: '第二章.txt', text: '正文二' }
];
const opts = { lineEnding: '\n', dedupeTitle: true };
check('加标题 + 空行', TF.merger.build(two, Object.assign({ addTitle: true, blankLine: true }, opts)).text,
  '第一章\n\n正文一\n\n第二章\n\n正文二\n');
check('加标题 + 不空行', TF.merger.build(two, Object.assign({ addTitle: true, blankLine: false }, opts)).text,
  '第一章\n正文一\n第二章\n正文二\n');
check('不加标题 + 空行', TF.merger.build(two, Object.assign({ addTitle: false, blankLine: true }, opts)).text,
  '正文一\n\n正文二\n');
check('不加标题 + 不空行', TF.merger.build(two, Object.assign({ addTitle: false, blankLine: false }, opts)).text,
  '正文一\n正文二\n');
check('不加标题时忽略去重', TF.merger.build(
  [{ name: '第一章.txt', text: '第一章\n正文一' }],
  Object.assign({ addTitle: false, blankLine: true }, opts)
).text, '第一章\n正文一\n');

console.log('\n[5] 编码检测');
const utf8 = new TextEncoder().encode('中文正文');
check('UTF-8 检测', TF.encoding.detect(utf8.buffer), 'utf-8');

const gbk = new Uint8Array([0xD6, 0xD0, 0xCE, 0xC4]); // “中文”的 GB18030 编码
check('GB18030 检测', TF.encoding.detect(gbk.buffer), 'gb18030');
check('GB18030 解码', TF.encoding.decode(gbk.buffer, 'auto').text, '中文');

const bom = new Uint8Array([0xEF, 0xBB, 0xBF].concat(Array.from(utf8)));
check('UTF-8 BOM 检测', TF.encoding.detect(bom.buffer), 'utf-8-bom');
check('BOM 已剥离', TF.encoding.decode(bom.buffer, 'auto').text.startsWith('\uFEFF'), false);

console.log('\n[6] GB18030 反向建表编码');
(async function () {
  const res = TF.encoding.encodeToBlob('中文A', 'gb18030');
  const bytes = Array.from(new Uint8Array(await res.blob.arrayBuffer()));
  check('GB18030 编码字节', bytes, [0xD6, 0xD0, 0xCE, 0xC4, 0x41]);
  check('无缺失字符', res.missing, 0);

  const emoji = TF.encoding.encodeToBlob('😀', 'gb18030');
  check('emoji 计入缺失', emoji.missing, 1);

  console.log('\n[7] 拖放收集文件（DataTransferItemList 不是可迭代对象）');
  const fakeDt = {
    items: {
      length: 2,
      0: { kind: 'file', getAsFile: function () { return { name: 'a.txt' }; }, webkitGetAsEntry: function () { return null; } },
      1: { kind: 'file', getAsFile: function () { return { name: 'b.txt' }; }, webkitGetAsEntry: function () { return null; } }
    },
    files: []
  };
  const dropped = await TF.files.fromDataTransfer(fakeDt);
  check('按下标遍历，不依赖 Symbol.iterator', dropped.map(function (e) { return e.file.name; }), ['a.txt', 'b.txt']);

  const fallback = await TF.files.fromDataTransfer({ items: { length: 0 }, files: [{ name: 'c.txt' }] });
  check('没有 items 时退回 files', fallback.map(function (e) { return e.file.name; }), ['c.txt']);

  // 复现 Tabbit 里的报错：webkitGetAsEntry / getAsFile 直接抛错
  const throwingDt = {
    items: {
      length: 1,
      0: {
        kind: 'file',
        webkitGetAsEntry: function () { throw new Error('A URI supplied to the API was malformed'); },
        getAsFile: function () { throw new Error('A URI supplied to the API was malformed'); }
      }
    },
    files: [{ name: 'd.txt' }]
  };
  const rescued = await TF.files.fromDataTransfer(throwingDt);
  check('entry API 抛错时退回 files', rescued.map(function (e) { return e.file.name; }), ['d.txt']);

  const brokenEntry = {
    items: {
      length: 1,
      0: {
        kind: 'file',
        webkitGetAsEntry: function () {
          return { isFile: true, file: function (ok, fail) { fail(new Error('bad entry')); } };
        },
        getAsFile: function () { return null; }
      }
    },
    files: []
  };
  const skipped = await TF.files.fromDataTransfer(brokenEntry);
  check('单个坏条目被跳过而不是整体失败', skipped.length, 0);

  console.log('\n' + (failed === 0 ? '全部通过' : failed + ' 项失败'));
  process.exit(failed === 0 ? 0 : 1);
})();
