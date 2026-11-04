const subtle = {
  importKey: async () => ({}) as CryptoKey,
  encrypt: async () => new ArrayBuffer(0),
  decrypt: async () => new ArrayBuffer(0),
  sign: async () => new ArrayBuffer(0),
  digest: async () => new ArrayBuffer(0),
} as unknown as SubtleCrypto;

export { subtle };
export default { subtle };
