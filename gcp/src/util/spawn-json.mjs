import { execFile } from 'node:child_process';

export function spawnFileText(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${file} ${args.join(' ')} failed\n${stdout}${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });
}

export function spawnFileJson(file, args, { allowEmpty = false } = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${file} ${args.join(' ')} failed\n${stdout}${stderr}`));
        return;
      }
      const text = stdout.trim();
      if (!text && allowEmpty) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(text || 'null'));
      } catch (parseError) {
        reject(new Error(`${file} ${args.join(' ')} did not return JSON\n${stdout}${stderr}\n${parseError.message}`));
      }
    });
  });
}
