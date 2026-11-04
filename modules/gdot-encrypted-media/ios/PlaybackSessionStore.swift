import Foundation

final class PlaybackSession {
  let attachmentId: String
  let filePath: String
  var key: Data
  var noncePrefix: Data
  let plainSize: Int64
  let chunkSize: Int
  let chunkCount: Int
  let mimeType: String
  let format: GencFormat
  let packedOffsets: [Int64]?
  let packedLengths: [Int]?

  init(
    attachmentId: String,
    filePath: String,
    key: Data,
    noncePrefix: Data,
    plainSize: Int64,
    chunkSize: Int,
    chunkCount: Int,
    mimeType: String,
    format: GencFormat,
    packedOffsets: [Int64]?,
    packedLengths: [Int]?
  ) {
    self.attachmentId = attachmentId
    self.filePath = filePath
    self.key = key
    self.noncePrefix = noncePrefix
    self.plainSize = plainSize
    self.chunkSize = chunkSize
    self.chunkCount = chunkCount
    self.mimeType = mimeType
    self.format = format
    self.packedOffsets = packedOffsets
    self.packedLengths = packedLengths
  }

  func clearKeys() {
    GencCrypto.zero(&key)
    GencCrypto.zero(&noncePrefix)
    key = Data()
    noncePrefix = Data()
  }
}

final class PlaybackSessionStore {
  static let shared = PlaybackSessionStore()
  private var sessions: [String: PlaybackSession] = [:]
  private let lock = NSLock()

  func register(
    attachmentId: String,
    fileUri: String,
    keyBase64: String,
    noncePrefixBase64: String,
    plainSize: Int64,
    chunkSize: Int,
    chunkCount: Int,
    mimeType: String,
    format: String
  ) throws {
    clear(attachmentId)
    let path = Self.stripFileScheme(fileUri)
    guard let key = Data(base64Encoded: keyBase64), key.count == GencCrypto.keyBytes else {
      throw GencCryptoError.badKey
    }
    guard let nonce = Data(base64Encoded: noncePrefixBase64), nonce.count == GencCrypto.noncePrefixBytes else {
      throw GencCryptoError.badNonce
    }
    let fmt = GencFormat(rawValue: format) ?? .fixedSlot
    var packedOffsets: [Int64]? = nil
    var packedLengths: [Int]? = nil
    if fmt == .packed {
      let index = try Self.buildPackedIndex(path: path, expectedCount: chunkCount)
      packedOffsets = index.0
      packedLengths = index.1
    }
    let session = PlaybackSession(
      attachmentId: attachmentId,
      filePath: path,
      key: key,
      noncePrefix: nonce,
      plainSize: plainSize,
      chunkSize: chunkSize,
      chunkCount: chunkCount,
      mimeType: mimeType,
      format: fmt,
      packedOffsets: packedOffsets,
      packedLengths: packedLengths
    )
    lock.lock()
    sessions[attachmentId] = session
    lock.unlock()
  }

  func get(_ attachmentId: String) -> PlaybackSession? {
    lock.lock(); defer { lock.unlock() }
    return sessions[attachmentId]
  }

  func clear(_ attachmentId: String) {
    lock.lock()
    let s = sessions.removeValue(forKey: attachmentId)
    lock.unlock()
    s?.clearKeys()
  }

  func clearAll() {
    lock.lock()
    let all = Array(sessions.values)
    sessions.removeAll()
    lock.unlock()
    for s in all { s.clearKeys() }
  }

  func count() -> Int {
    lock.lock(); defer { lock.unlock() }
    return sessions.count
  }

  private static func stripFileScheme(_ uri: String) -> String {
    if uri.hasPrefix("file://") {
      return String(uri.dropFirst("file://".count))
    }
    return uri
  }

  private static func buildPackedIndex(path: String, expectedCount: Int) throws -> ([Int64], [Int]) {
    guard let handle = FileHandle(forReadingAtPath: path) else { throw GencCryptoError.io }
    defer { try? handle.close() }
    let countData = handle.readData(ofLength: 4)
    guard countData.count == 4 else { throw GencCryptoError.io }
    let count = Int(GencCrypto.readUint32Be(countData, offset: 0))
    guard count == expectedCount else { throw GencCryptoError.io }
    var offsets = [Int64](repeating: 0, count: count)
    var lengths = [Int](repeating: 0, count: count)
    var pos: Int64 = 4
    for i in 0..<count {
      handle.seek(toFileOffset: UInt64(pos))
      let lenData = handle.readData(ofLength: 4)
      guard lenData.count == 4 else { throw GencCryptoError.io }
      let len = Int(GencCrypto.readUint32Be(lenData, offset: 0))
      pos += 4
      offsets[i] = pos
      lengths[i] = len
      pos += Int64(len)
    }
    return (offsets, lengths)
  }
}
