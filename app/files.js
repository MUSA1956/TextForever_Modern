/* files.js —— 收集文件：文件夹选择、多选、拖放（含递归子文件夹）
 *
 * 浏览器只给「文件」，不给真实磁盘路径；为了在列表里区分同名章节，
 * 这里自己拼一条相对路径：webkitRelativePath 或拖放时用目录项拼。
 */
(function (global) {
  'use strict';

  const TF = global.TF = global.TF || {};

  function isTxt(name) {
    return /\.txt$/i.test(name || '');
  }

  /* <input type="file"> 或 <input webkitdirectory> 的结果 */
  function fromFileList(list) {
    const out = [];
    for (const file of list) {
      out.push({ file: file, path: file.webkitRelativePath || file.name });
    }
    return out;
  }

  /* 拖放：优先走 webkitGetAsEntry，能递归目录；拿不到就退回 DataTransfer.files
     ⚠️ 有的浏览器 / 拖放来源会让 webkitGetAsEntry() 或 getAsFile() 直接抛错
     （例如 "A URI supplied to the API was malformed"）——必须逐项兜底，不能让它中断整个拖放。 */
  async function fromDataTransfer(dt) {
    const files = [];
    if (dt.files) {
      for (let i = 0; i < dt.files.length; i++) files.push(dt.files[i]);
    }

    const entries = [];
    if (dt.items && dt.items.length) {
      // 注意：DataTransferItemList 不是可迭代对象，不能 for...of，只能按下标取
      for (let i = 0; i < dt.items.length; i++) {
        let item = null;
        try { item = dt.items[i]; } catch (e) { item = null; }
        if (!item || item.kind !== 'file') continue;

        let entry = null;
        try {
          entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
        } catch (e) {
          entry = null;
        }
        if (entry) {
          entries.push(entry);
          continue;
        }

        let file = null;
        try {
          file = item.getAsFile ? item.getAsFile() : null;
        } catch (e) {
          file = null;
        }
        if (file) entries.push({ isFile: true, __file: file });
      }
    }

    if (!entries.length) return fromFileList(files);

    const out = [];

    async function walk(entry, parentPath) {
      if (!entry) return;

      if (entry.isFile) {
        let file = entry.__file;
        if (!file && typeof entry.file === 'function') {
          try {
            file = await new Promise(function (resolve, reject) {
              entry.file(resolve, reject);
            });
          } catch (e) {
            file = null; // 这一个是坏的，跳过，不影响其他文件
          }
        }
        if (file) out.push({ file: file, path: parentPath + file.name });
        return;
      }

      if (entry.isDirectory) {
        const reader = entry.createReader();
        const dirPath = parentPath + entry.name + '/';
        let batch;
        do {
          try {
            batch = await new Promise(function (resolve, reject) {
              reader.readEntries(resolve, reject);
            });
          } catch (e) {
            batch = []; // 目录读不动就停，别整个拖放失败
          }
          for (const child of batch) {
            await walk(child, dirPath);
          }
        } while (batch.length > 0);
      }
    }

    for (const entry of entries) {
      await walk(entry, '');
    }
    return out.length ? out : fromFileList(files);
  }

  /* 把收集结果排成稳定顺序（按路径），保证首次加载的结果可复现 */
  function sortByPath(entries) {
    return entries.slice().sort(function (a, b) {
      return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    });
  }

  TF.files = {
    isTxt: isTxt,
    fromFileList: fromFileList,
    fromDataTransfer: fromDataTransfer,
    sortByPath: sortByPath
  };

})(globalThis);
