const crc32cTable = createCrc32cTable();

export function crc32cBase64(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crc >>> 8) ^ crc32cTable[(crc ^ byte) & 0xff];
  }
  const digest = Buffer.alloc(4);
  digest.writeUInt32BE((~crc) >>> 0);
  return digest.toString('base64');
}

function createCrc32cTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) ? (0x82f63b78 ^ (crc >>> 1)) : (crc >>> 1);
    }
    table[index] = crc >>> 0;
  }
  return table;
}
