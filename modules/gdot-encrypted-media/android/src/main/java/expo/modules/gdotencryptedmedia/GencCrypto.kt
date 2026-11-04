package expo.modules.gdotencryptedmedia

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.math.min

/**
 * AES-GCM chunk crypto matching lib/crypto/media-aead.ts
 * (A256GCM-CHUNKED-V1, AAD "gdot-media-v1").
 */
object GencCrypto {
  const val TAG_BYTES = 16
  const val KEY_BYTES = 32
  const val NONCE_PREFIX_BYTES = 8
  const val NONCE_BYTES = 12
  private val AAD_LABEL = "gdot-media-v1".toByteArray(StandardCharsets.UTF_8)
  private const val AAD_SEP: Byte = 0x1f

  fun plainChunkLength(plainSize: Long, chunkSize: Int, chunkIndex: Int, chunkCount: Int): Int {
    require(chunkIndex in 0 until chunkCount) { "chunkIndex out of range" }
    if (chunkIndex < chunkCount - 1) return chunkSize
    return (plainSize - chunkSize.toLong() * (chunkCount - 1)).toInt()
  }

  fun expectedCiphertextLength(plainChunkBytes: Int): Int = plainChunkBytes + TAG_BYTES

  fun cipherChunkOffset(plainSize: Long, chunkSize: Int, chunkCount: Int, chunkIndex: Int): Long {
    var o = 0L
    for (i in 0 until chunkIndex) {
      o += expectedCiphertextLength(plainChunkLength(plainSize, chunkSize, i, chunkCount)).toLong()
    }
    return o
  }

  fun cipherChunkByteLength(plainSize: Long, chunkSize: Int, chunkCount: Int, chunkIndex: Int): Int {
    return expectedCiphertextLength(plainChunkLength(plainSize, chunkSize, chunkIndex, chunkCount))
  }

  fun chunkNonce(noncePrefix: ByteArray, chunkIndex: Int): ByteArray {
    require(noncePrefix.size == NONCE_PREFIX_BYTES) { "noncePrefix must be 8 bytes" }
    val nonce = ByteArray(NONCE_BYTES)
    System.arraycopy(noncePrefix, 0, nonce, 0, NONCE_PREFIX_BYTES)
    writeUint32Be(nonce, 8, chunkIndex)
    return nonce
  }

  fun buildChunkAad(
    attachmentId: String,
    chunkIndex: Int,
    chunkCount: Int,
    plaintextSize: Long,
  ): ByteArray {
    val idBytes = attachmentId.toByteArray(StandardCharsets.UTF_8)
    val aad = ByteArray(AAD_LABEL.size + 1 + idBytes.size + 1 + 4 + 4 + 8)
    var o = 0
    System.arraycopy(AAD_LABEL, 0, aad, o, AAD_LABEL.size)
    o += AAD_LABEL.size
    aad[o++] = AAD_SEP
    System.arraycopy(idBytes, 0, aad, o, idBytes.size)
    o += idBytes.size
    aad[o++] = AAD_SEP
    writeUint32Be(aad, o, chunkIndex)
    o += 4
    writeUint32Be(aad, o, chunkCount)
    o += 4
    writeUint64Be(aad, o, plaintextSize)
    return aad
  }

  /** Decrypt one chunk; fails closed on auth error. Caller must zero returned buffer when done. */
  fun decryptChunk(
    key: ByteArray,
    noncePrefix: ByteArray,
    attachmentId: String,
    chunkIndex: Int,
    chunkCount: Int,
    plaintextSize: Long,
    ciphertext: ByteArray,
  ): ByteArray {
    require(key.size == KEY_BYTES) { "media key must be 32 bytes" }
    require(ciphertext.size >= TAG_BYTES) { "ciphertext too short" }
    val nonce = chunkNonce(noncePrefix, chunkIndex)
    val aad = buildChunkAad(attachmentId, chunkIndex, chunkCount, plaintextSize)
    return try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(
        Cipher.DECRYPT_MODE,
        SecretKeySpec(key, "AES"),
        GCMParameterSpec(TAG_BYTES * 8, nonce),
      )
      cipher.updateAAD(aad)
      cipher.doFinal(ciphertext)
    } catch (e: Exception) {
      throw GencAuthException("authentication failed", e)
    } finally {
      zero(nonce)
      zero(aad)
    }
  }

  fun zero(buf: ByteArray?) {
    if (buf == null) return
    for (i in buf.indices) buf[i] = 0
  }

  fun writeUint32Be(buf: ByteArray, offset: Int, value: Int) {
    buf[offset] = ((value ushr 24) and 0xff).toByte()
    buf[offset + 1] = ((value ushr 16) and 0xff).toByte()
    buf[offset + 2] = ((value ushr 8) and 0xff).toByte()
    buf[offset + 3] = (value and 0xff).toByte()
  }

  fun writeUint64Be(buf: ByteArray, offset: Int, value: Long) {
    val hi = (value ushr 32).toInt()
    val lo = (value and 0xffffffffL).toInt()
    writeUint32Be(buf, offset, hi)
    writeUint32Be(buf, offset + 4, lo)
  }

  fun readUint32Be(buf: ByteArray, offset: Int): Int {
    return ((buf[offset].toInt() and 0xff) shl 24) or
      ((buf[offset + 1].toInt() and 0xff) shl 16) or
      ((buf[offset + 2].toInt() and 0xff) shl 8) or
      (buf[offset + 3].toInt() and 0xff)
  }

  /** Map plaintext byte range [start, start+length) to inclusive chunk indices. */
  fun chunkRangeForPlainBytes(
    start: Long,
    length: Int,
    chunkSize: Int,
    chunkCount: Int,
    plainSize: Long,
  ): IntRange {
    require(start >= 0 && length >= 0) { "invalid range" }
    if (length == 0 || start >= plainSize) return IntRange.EMPTY
    val end = min(start + length, plainSize)
    val first = (start / chunkSize).toInt()
    val last = ((end - 1) / chunkSize).toInt()
    require(first in 0 until chunkCount && last in 0 until chunkCount) { "range out of chunks" }
    return first..last
  }
}

class GencAuthException(message: String, cause: Throwable? = null) : Exception(message, cause)

enum class GencFormat { FIXED_SLOT, PACKED }

data class PlaybackSession(
  val attachmentId: String,
  val filePath: String,
  var key: ByteArray,
  var noncePrefix: ByteArray,
  val plainSize: Long,
  val chunkSize: Int,
  val chunkCount: Int,
  val mimeType: String,
  val format: GencFormat,
  /** For PACKED: absolute file offsets of each cipher chunk. */
  val packedOffsets: LongArray? = null,
  val packedLengths: IntArray? = null,
) {
  fun clearKeys() {
    GencCrypto.zero(key)
    GencCrypto.zero(noncePrefix)
    key = ByteArray(0)
    noncePrefix = ByteArray(0)
  }
}
