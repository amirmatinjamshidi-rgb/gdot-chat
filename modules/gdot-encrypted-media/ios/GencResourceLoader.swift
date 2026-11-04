import AVFoundation
import Foundation

/// Serves decrypted plaintext bytes for a custom gdotenc:// URL scheme.
final class GencResourceLoader: NSObject, AVAssetResourceLoaderDelegate {
  private let session: PlaybackSession
  private let handle: FileHandle
  private var cachedChunkIndex: Int = -1
  private var cachedPlain: Data?

  init(session: PlaybackSession) throws {
    self.session = session
    guard let h = FileHandle(forReadingAtPath: session.filePath) else {
      throw GencCryptoError.io
    }
    self.handle = h
    super.init()
  }

  deinit {
    clearCache()
    try? handle.close()
  }

  func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    shouldWaitForLoadingOf requestedResource: AVAssetResourceLoadingRequest
  ) -> Bool {
    if let content = requestedResource.contentInformationRequest {
      content.contentType = session.mimeType
      content.contentLength = session.plainSize
      content.isByteRangeAccessSupported = true
    }
    if let dataRequest = requestedResource.dataRequest {
      do {
        try fulfill(dataRequest)
        requestedResource.finishLoading()
      } catch {
        requestedResource.finishLoading(with: error)
      }
    } else {
      requestedResource.finishLoading()
    }
    return true
  }

  private func fulfill(_ dataRequest: AVAssetResourceLoadingDataRequest) throws {
    var position = dataRequest.requestedOffset
    if dataRequest.currentOffset > 0 {
      position = dataRequest.currentOffset
    }
    var remaining = dataRequest.requestedLength
    if dataRequest.requestsAllDataToEndOfResource {
      remaining = Int(session.plainSize - position)
    }
    while remaining > 0 && position < session.plainSize {
      let chunkIndex = Int(position / Int64(session.chunkSize))
      let plain = try decryptChunkCached(chunkIndex)
      let offsetInChunk = Int(position - Int64(chunkIndex * session.chunkSize))
      let n = min(plain.count - offsetInChunk, remaining)
      let slice = plain.subdata(in: offsetInChunk..<(offsetInChunk + n))
      dataRequest.respond(with: slice)
      position += Int64(n)
      remaining -= n
    }
  }

  private func decryptChunkCached(_ chunkIndex: Int) throws -> Data {
    if chunkIndex == cachedChunkIndex, let cached = cachedPlain {
      return cached
    }
    clearCache()
    let cipher = try readCipherChunk(chunkIndex)
    let plain = try GencCrypto.decryptChunk(
      key: session.key,
      noncePrefix: session.noncePrefix,
      attachmentId: session.attachmentId,
      chunkIndex: chunkIndex,
      chunkCount: session.chunkCount,
      plaintextSize: session.plainSize,
      ciphertext: cipher
    )
    cachedChunkIndex = chunkIndex
    cachedPlain = plain
    return plain
  }

  private func readCipherChunk(_ chunkIndex: Int) throws -> Data {
    let off: Int64
    let len: Int
    switch session.format {
    case .fixedSlot:
      off = try GencCrypto.cipherChunkOffset(
        plainSize: session.plainSize,
        chunkSize: session.chunkSize,
        chunkCount: session.chunkCount,
        chunkIndex: chunkIndex
      )
      len = try GencCrypto.cipherChunkByteLength(
        plainSize: session.plainSize,
        chunkSize: session.chunkSize,
        chunkCount: session.chunkCount,
        chunkIndex: chunkIndex
      )
    case .packed:
      guard let offsets = session.packedOffsets, let lengths = session.packedLengths else {
        throw GencCryptoError.io
      }
      off = offsets[chunkIndex]
      len = lengths[chunkIndex]
    }
    handle.seek(toFileOffset: UInt64(off))
    let data = handle.readData(ofLength: len)
    guard data.count == len else { throw GencCryptoError.io }
    return data
  }

  private func clearCache() {
    if var c = cachedPlain {
      GencCrypto.zero(&c)
    }
    cachedPlain = nil
    cachedChunkIndex = -1
  }
}
