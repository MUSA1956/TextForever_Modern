/* main.js —— 应用状态与流程编排（把各模块接起来） */
(function (global) {
  'use strict';

  const TF = global.TF;
  const state = {
    items: [],       // { id, file, name, path, size, encDetected, encOverride, text, error }
    nextId: 1
  };

  const dom = {
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    btnPickDir: document.getElementById('btnPickDir'),
    btnPickFiles: document.getElementById('btnPickFiles'),
    btnClear: document.getElementById('btnClear'),
    sortRule: document.getElementById('sortRule'),
    sortDesc: document.getElementById('sortDesc'),
    btnResort: document.getElementById('btnResort'),
    dedupeTitle: document.getElementById('dedupeTitle'),
    addTitle: document.getElementById('addTitle'),
    blankLine: document.getElementById('blankLine'),
    outEncoding: document.getElementById('outEncoding'),
    lineEnding: document.getElementById('lineEnding'),
    btnExport: document.getElementById('btnExport')
  };

  /* ---------------- 状态 → 界面 ---------------- */

  function refresh() {
    TF.ui.renderTable(state.items, {
      onMove: moveItem,
      onRemove: removeItem,
      onEncChange: changeEncoding
    });

    if (!state.items.length) {
      TF.ui.renderPreview('', '');
      return;
    }

    const merged = buildMerged('\n');
    TF.ui.renderPreview(
      merged.text,
      merged.chapters + ' 章 · ' + merged.chars.toLocaleString() + ' 字符'
    );
  }

  function buildMerged(lineEnding) {
    return TF.merger.build(state.items, {
      addTitle: dom.addTitle.checked,
      dedupeTitle: dom.dedupeTitle.checked,
      blankLine: dom.blankLine.checked,
      lineEnding: lineEnding
    });
  }

  /* ---------------- 读文件 ---------------- */

  async function addEntries(entries) {
    if (!entries.length) {
      TF.ui.toast('没有拿到文件（可能拖进了链接或快捷方式），请改用「选择文件夹」', 6000);
      return;
    }

    const txt = TF.files.sortByPath(entries).filter(function (e) {
      return TF.files.isTxt(e.file.name);
    });

    if (!txt.length) {
      const sample = entries.slice(0, 6).map(function (e) {
        return e.file.name || '(无文件名)';
      }).join('、');
      const more = entries.length > 6 ? ' 等 ' + entries.length + ' 个' : '';
      TF.ui.toast('这 ' + entries.length + ' 个文件不是 .txt：' + sample + more, 10000);
      TF.ui.setStatus('未识别为 txt（共 ' + entries.length + ' 个）：' + sample + more);
      return;
    }

    const skipped = entries.length - txt.length;
    let done = 0;

    for (const entry of txt) {
      const file = entry.file;
      const path = entry.path || file.name;

      // 同一个文件（同路径同大小）不重复添加
      const exists = state.items.some(function (it) {
        return it.path === path && it.size === file.size;
      });
      if (exists) continue;

      try {
        const buffer = await file.arrayBuffer();
        const detected = TF.encoding.detect(buffer);
        const decoded = TF.encoding.decode(buffer, detected);

        state.items.push({
          id: state.nextId++,
          file: file,
          name: file.name,
          path: path,
          size: file.size,
          encDetected: detected,
          encOverride: null,
          text: decoded.text,
          error: decoded.error
        });
      } catch (e) {
        state.items.push({
          id: state.nextId++,
          file: file,
          name: file.name,
          path: path,
          size: file.size,
          encDetected: 'utf-8',
          encOverride: null,
          text: '',
          error: '读取失败：' + e.message
        });
      }

      done++;
      if (done % 5 === 0 || done === txt.length) {
        TF.ui.setStatus('正在读取 ' + done + ' / ' + txt.length + ' …');
      }
    }

    TF.ui.setStatus(
      '已读取 ' + done + ' 个文件' +
      (skipped > 0 ? '，跳过 ' + skipped + ' 个非 txt 文件' : '')
    );

    resort();
  }

  /* ---------------- 排序与调整 ---------------- */

  function resort() {
    state.items = TF.sorter.sortBy(state.items, dom.sortRule.value, dom.sortDesc.checked);
    refresh();
  }

  function moveItem(id, delta) {
    const from = state.items.findIndex(function (it) { return it.id === id; });
    const to = from + delta;
    if (from < 0 || to < 0 || to >= state.items.length) return;

    const moved = state.items.splice(from, 1)[0];
    state.items.splice(to, 0, moved);
    refresh();
  }

  function removeItem(id) {
    const i = state.items.findIndex(function (it) { return it.id === id; });
    if (i < 0) return;
    state.items.splice(i, 1);
    refresh();
  }

  async function changeEncoding(id, value) {
    const item = state.items.find(function (it) { return it.id === id; });
    if (!item) return;

    try {
      const buffer = await item.file.arrayBuffer();
      const decoded = TF.encoding.decode(buffer, value);
      item.text = decoded.text;
      item.error = decoded.error;
      item.encOverride = value === 'auto' ? null : value;
      if (value === 'auto') item.encDetected = decoded.encoding;
      refresh();
    } catch (e) {
      TF.ui.toast('重新解码失败：' + e.message);
    }
  }

  /* ---------------- 导出 ---------------- */

  function suggestedName() {
    const d = new Date();
    const p = function (n) { return String(n).padStart(2, '0'); };
    return '合并_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      '_' + p(d.getHours()) + p(d.getMinutes()) + '.txt';
  }

  async function saveBlob(blob, filename) {
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: '文本文件', accept: { 'text/plain': ['.txt'] } }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
        /* 其他情况（比如浏览器禁用）退回下载 */
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    return true;
  }

  async function exportMerged() {
    if (!state.items.length) {
      TF.ui.toast('还没有文件');
      return;
    }

    const lineEnding = dom.lineEnding.value === 'lf' ? '\n' : '\r\n';
    const encoding = dom.outEncoding.value;
    const merged = buildMerged(lineEnding);

    let result;
    try {
      result = TF.encoding.encodeToBlob(merged.text, encoding);
    } catch (e) {
      TF.ui.toast('导出失败：' + e.message, 4000);
      return;
    }

    const filename = suggestedName();
    const saved = await saveBlob(result.blob, filename);
    if (!saved) return;

    if (result.missing > 0) {
      TF.ui.toast(
        '已导出 ' + filename + '，但有 ' + result.missing +
        ' 个字符 GB18030 无法表示，已替换为 ?（建议改用 UTF-8）', 8000
      );
    } else {
      TF.ui.toast('已导出 ' + filename + ' · ' + TF.ui.formatSize(result.blob.size));
    }
  }

  /* ---------------- 事件绑定 ---------------- */

  function pickFolder() {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.webkitdirectory = true;
    input.addEventListener('change', function () {
      addEntries(TF.files.fromFileList(input.files));
    });
    input.click();
  }

  dom.btnPickDir.addEventListener('click', pickFolder);

  dom.btnPickFiles.addEventListener('click', function () {
    dom.fileInput.click();
  });

  dom.fileInput.addEventListener('change', function () {
    addEntries(TF.files.fromFileList(dom.fileInput.files));
    dom.fileInput.value = '';
  });

  dom.btnClear.addEventListener('click', function () {
    if (!state.items.length) return;
    state.items = [];
    TF.ui.setStatus('');
    refresh();
  });

  /* 不加标题时，「去重」没有意义——禁用掉，避免误解 */
  function syncDedupeState() {
    dom.dedupeTitle.disabled = !dom.addTitle.checked;
    dom.dedupeTitle.parentElement.classList.toggle('disabled', !dom.addTitle.checked);
  }

  dom.sortRule.addEventListener('change', resort);
  dom.sortDesc.addEventListener('change', resort);
  dom.btnResort.addEventListener('click', resort);
  dom.addTitle.addEventListener('change', function () {
    syncDedupeState();
    refresh();
  });
  dom.blankLine.addEventListener('change', refresh);
  dom.dedupeTitle.addEventListener('change', refresh);
  dom.btnExport.addEventListener('click', exportMerged);

  ['dragenter', 'dragover'].forEach(function (type) {
    dom.dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      dom.dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'dragend'].forEach(function (type) {
    dom.dropzone.addEventListener(type, function () {
      dom.dropzone.classList.remove('dragover');
    });
  });

  dom.dropzone.addEventListener('drop', async function (e) {
    e.preventDefault();
    dom.dropzone.classList.remove('dragover');
    try {
      const entries = await TF.files.fromDataTransfer(e.dataTransfer);
      await addEntries(entries);
    } catch (err) {
      TF.ui.toast('拖放失败：' + (err && err.message ? err.message : err), 6000);
    }
  });

  /* 页面上任何未捕获的脚本错误都弹出来，别让功能"静默失效" */
  window.addEventListener('error', function (e) {
    TF.ui.toast('脚本出错：' + (e.message || e.error), 8000);
  });

  /* 双击打开时是 file://：个别浏览器（如 Tabbit）会限制拖放，提前说明 */
  if (location.protocol === 'file:') {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.style.margin = '0 0 12px';
    hint.textContent = '当前为本地文件模式（file://）：部分浏览器会限制拖放。拖不进来时请改用「选择文件夹」，或双击同目录的「启动.bat」以网页服务方式打开。';
    document.querySelector('main').prepend(hint);
  }

  refresh();
  syncDedupeState();

})(globalThis);
