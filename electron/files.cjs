const fs = require('node:fs/promises');
async function renameWithRetry(from, to, { rename = fs.rename, platform = process.platform, delays = [30, 80, 160, 320, 500] } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await rename(from, to); }
    catch (error) {
      // Windows indexers/sync clients can briefly lock a just-written file. Preserve the old target.
      if (platform !== 'win32' || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= delays.length) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[attempt]));
    }
  }
}
module.exports = { renameWithRetry };
