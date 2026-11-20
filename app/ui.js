/* ui.js —— 只负责把状态画到页面上，不保存业务状态 */
(function (global) {
  'use strict';

  const TF = global.TF = global.TF || {};
  const UI = TF.ui = {};

  let toastTimer = null;

  UI.toast = function (message, duration) {
    const box = document.getElementById('toast');
    if (!box) return;
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      box.classList.remove('show');
    }, duration || 2600);
  };

  UI.setStatus = function (text) {
    const el = document.getElementById('status');
    if (el) el.textContent = text || '';
  };

  UI.formatSize = function (bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  function makeButton(text, title, onClick, extraClass) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.title = title;
    if (extraClass) b.className = extraClass;
    b.addEventListener('click', onClick);
    return b;
  }

  /* handlers: { onMove(id, delta), onRemove(id), onEncChange(id, value) } */
  UI.renderTable = function (items, handlers) {
    const tbody = document.querySelector('#fileTable tbody');
    const countEl = document.getElementById('fileCount');
    const emptyEl = document.getElementById('emptyHint');

    tbody.innerHTML = '';
    countEl.textContent = String(items.length);
    emptyEl.style.display = items.length ? 'none' : '';

    items.forEach(function (item, index) {
      const tr = document.createElement('tr');

      const tdIdx = document.createElement('td');
      tdIdx.className = 'col-idx';
      tdIdx.textContent = String(index + 1);

      const tdName = document.createElement('td');
      tdName.className = 'col-name';
      const nameEl = document.createElement('div');
      nameEl.className = 'file-name';
      nameEl.textContent = item.name;
      nameEl.title = item.path || item.name;
      tdName.appendChild(nameEl);

      if (item.path && item.path !== item.name) {
        const pathEl = document.createElement('div');
        pathEl.className = 'file-path';
        pathEl.textContent = item.path;
        tdName.appendChild(pathEl);
      }
      if (item.error) {
        const errEl = document.createElement('div');
        errEl.className = 'file-error';
        errEl.textContent = item.error;
        tdName.appendChild(errEl);
      }

      const tdChapter = document.createElement('td');
      tdChapter.className = 'col-chapter';
      tdChapter.textContent = TF.sorter.describe(item.name);

      const tdEnc = document.createElement('td');
      tdEnc.className = 'col-enc';
      const select = document.createElement('select');
      select.className = 'enc-select';
      TF.encoding.optionList().forEach(function (opt) {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.value === 'auto'
          ? '自动 · ' + TF.encoding.label(item.encDetected)
          : opt.label;
        select.appendChild(option);
      });
      select.value = item.encOverride || 'auto';
      select.addEventListener('change', function () {
        handlers.onEncChange(item.id, select.value);
      });
      tdEnc.appendChild(select);

      const tdSize = document.createElement('td');
      tdSize.className = 'col-size';
      tdSize.textContent = UI.formatSize(item.size);

      const tdOps = document.createElement('td');
      tdOps.className = 'col-ops';
      tdOps.appendChild(makeButton('↑', '上移', function () { handlers.onMove(item.id, -1); }));
      tdOps.appendChild(makeButton('↓', '下移', function () { handlers.onMove(item.id, 1); }));
      tdOps.appendChild(makeButton('✕', '移除', function () { handlers.onRemove(item.id); }, 'danger'));

      tr.appendChild(tdIdx);
      tr.appendChild(tdName);
      tr.appendChild(tdChapter);
      tr.appendChild(tdEnc);
      tr.appendChild(tdSize);
      tr.appendChild(tdOps);
      tbody.appendChild(tr);
    });
  };

  UI.renderPreview = function (text, stats) {
    const preview = document.getElementById('preview');
    const statsEl = document.getElementById('stats');
    const LIMIT = 4000;

    if (!text) {
      preview.textContent = '（还没有可预览的内容）';
    } else if (text.length > LIMIT) {
      preview.textContent = text.slice(0, LIMIT) + '\n…（预览只显示前 ' + LIMIT + ' 个字符）';
    } else {
      preview.textContent = text;
    }
    statsEl.textContent = stats || '';
  };

})(globalThis);
