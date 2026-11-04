import Foundation

enum GencFormat: String {
  case fixedSlot = "fixed-slot"
  case packed = "packed"
}

enum GencCryptoError: Error {
  case badKey
  case badNonce
  case authFailed
  case range
  case io
}

enum GencCrypto {
  static let tagBytes = 16
  static let keyBytes = 32
  static let noncePrefixBytes = 8
  static let nonceBytes = 12
  private static let aadLabel = Array("gdot-media-v1".utf8)
  private static let aadSep: UInt8 = 0x1f

  static func plainChunkLength(plainSize: Int64, chunkSize: Int, chunkIndex: Int, chunkCount: Int) throws -> Int {
    guard chunkIndex >= 0 && chunkIndex < chunkCount else { throw GencCryptoError.range }
    if chunkIndex < chunkCount - 1 { return chunkSize }
    return Int(plainSize - Int64(chunkSize) * Int64(chunkCount - 1))
  }

  static func expectedCiphertextLength(_ plainChunkBytes: Int) -> Int {
    plainChunkBytes + tagBytes
  }

  static func cipherChunkOffset(plainSize: Int64, chunkSize: Int, chunkCount: Int, chunkIndex: Int) throws -> Int64 {
    var o: Int64 = 0
    for i in 0..<chunkIndex {
      o += Int64(expectedCiphertextLength(try plainChunkLength(plainSize: plainSize, chunkSize: chunkSize, chunkIndex: i, chunkCount: chunkCount)))
    }
    return o
  }

  static func cipherChunkByteLength(plainSize: Int64, chunkSize: Int, chunkCount: Int, chunkIndex: Int) throws -> Int {
    expectedCiphertextLength(try plainChunkLength(plainSize: plainSize, chunkSize: chunkSize, chunkIndex: chunkIndex, chunkCount: chunkCount))
  }

  static func chunkNonce(noncePrefix: Data, chunkIndex: Int) throws -> Data {
    guard noncePrefix.count == noncePrefixBytes else { throw GencCryptoError.badNonce }
    var nonce = Data(count: nonceBytes)
    nonce.replaceSubrange(0..<noncePrefixBytes, with: noncePrefix)
    writeUint32Be(&nonce, offset: 8, value: UInt32(chunkIndex))
    return nonce
  }

  static func buildChunkAad(attachmentId: String, chunkIndex: Int, chunkCount: Int, plaintextSize: Int64) -> Data {
    let idBytes = Array(attachmentId.utf8)
    var aad = Data()
    aad.append(contentsOf: aadLabel)
    aad.append(aadSep)
    aad.append(contentsOf: idBytes)
    aad.append(aadSep)
    var idx = Data(count: 4); writeUint32Be(&idx, offset: 0, value: UInt32(chunkIndex)); aad.append(idx)
    var cnt = Data(count: 4); writeUint32Be(&cnt, offset: 0, value: UInt32(chunkCount)); aad.append(cnt)
    var sz = Data(count: 8); writeUint64Be(&sz, offset: 0, value: UInt64(bitPattern: plaintextSize)); aad.append(sz)
    return aad
  }

  static func decryptChunk(
    key: Data,
    noncePrefix: Data,
    attachmentId: String,
    chunkIndex: Int,
    chunkCount: Int,
    plaintextSize: Int64,
    ciphertext: Data
  ) throws -> Data {
    guard key.count == keyBytes else { throw GencCryptoError.badKey }
    guard ciphertext.count >= tagBytes else { throw GencCryptoError.authFailed }
    var nonce = try chunkNonce(noncePrefix: noncePrefix, chunkIndex: chunkIndex)
    var aad = buildChunkAad(attachmentId: attachmentId, chunkIndex: chunkIndex, chunkCount: chunkCount, plaintextSize: plaintextSize)
    defer {
      zero(&nonce)
      zero(&aad)
    }
    return try GencAesGcm.decrypt(key: key, nonce: nonce, aad: aad, ciphertextAndTag: ciphertext)
  }

  static func zero(_ data: inout Data) {
    data.resetBytes(in: 0..<data.count)
  }

  static func writeUint32Be(_ data: inout Data, offset: Int, value: UInt32) {
    data[offset] = UInt8((value >> 24) & 0xff)
    data[offset + 1] = UInt8((value >> 16) & 0xff)
    data[offset + 2] = UInt8((value >> 8) & 0xff)
    data[offset + 3] = UInt8(value & 0xff)
  }

  static func writeUint64Be(_ data: inout Data, offset: Int, value: UInt64) {
    writeUint32Be(&data, offset: offset, value: UInt32(value >> 32))
    writeUint32Be(&data, offset: offset + 4, value: UInt32(value & 0xffffffff))
  }

  static func readUint32Be(_ data: Data, offset: Int) -> UInt32 {
    (UInt32(data[offset]) << 24) | (UInt32(data[offset + 1]) << 16) | (UInt32(data[offset + 2]) << 8) | UInt32(data[offset + 3])
  }
}
