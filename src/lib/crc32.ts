// CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320), as used by ZIP.

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

/** Continues a running CRC. Start with 0; the result is an unsigned 32-bit number. */
export const crc32Update = (crc: number, data: Uint8Array): number => {
  let value = ~crc >>> 0;
  for (let index = 0; index < data.length; index += 1) {
    value = (TABLE[(value ^ (data[index] as number)) & 0xff] as number) ^ (value >>> 8);
  }
  return ~value >>> 0;
};

export const crc32 = (data: Uint8Array | string): number =>
  crc32Update(0, typeof data === 'string' ? new TextEncoder().encode(data) : data);
