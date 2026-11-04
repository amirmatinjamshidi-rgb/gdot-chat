package expo.modules.gdotencryptedmedia

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import java.io.RandomAccessFile
import kotlin.math.min

/**
 * Media3 DataSource that maps requested plaintext byte ranges onto .genc AEAD
 * chunks, decrypts in memory, and never writes plaintext to disk.
 */
@androidx.media3.common.util.UnstableApi
class GencDataSource(
  private val session: PlaybackSession,
) : BaseDataSource(/* isNetwork= */ false) {

  private var raf: RandomAccessFile? = null
  private var bytesRemaining: Long = 0
  private var plainPosition: Long = 0
  private var opened = false

  // One decrypted chunk cache to avoid re-decrypt on sequential reads.
  private var cachedChunkIndex: Int = -1
  private var cachedPlain: ByteArray? = null

  override fun open(dataSpec: DataSpec): Long {
    transferInitializing(dataSpec)
    val rafLocal = RandomAccessFile(session.filePath, "r")
    raf = rafLocal
    plainPosition = dataSpec.position
    bytesRemaining = if (dataSpec.length != C.LENGTH_UNSET.toLong()) {
      dataSpec.length
    } else {
      session.plainSize - plainPosition
    }
    if (bytesRemaining < 0) bytesRemaining = 0
    opened = true
    transferStarted(dataSpec)
    return bytesRemaining
  }

  override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
    if (length == 0) return 0
    if (bytesRemaining == 0L) return C.RESULT_END_OF_INPUT

    val toRead = min(length.toLong(), bytesRemaining).toInt()
    var written = 0
    while (written < toRead) {
      val chunkIndex = (plainPosition / session.chunkSize).toInt()
      val plain = decryptChunkCached(chunkIndex)
      val offsetInChunk = (plainPosition - chunkIndex.toLong() * session.chunkSize).toInt()
      val n = min(plain.size - offsetInChunk, toRead - written)
      System.arraycopy(plain, offsetInChunk, buffer, offset + written, n)
      plainPosition += n
      bytesRemaining -= n
      written += n
      bytesTransferred(n)
    }
    return written
  }

  override fun getUri(): Uri? = Uri.parse("gdotenc://${session.attachmentId}")

  override fun close() {
    clearChunkCache()
    try {
      raf?.close()
    } catch (_: Exception) {
    }
    raf = null
    if (opened) {
      opened = false
      transferEnded()
    }
  }

  private fun decryptChunkCached(chunkIndex: Int): ByteArray {
    if (chunkIndex == cachedChunkIndex && cachedPlain != null) {
      return cachedPlain!!
    }
    clearChunkCache()
    val cipher = readCipherChunk(chunkIndex)
    val plain = GencCrypto.decryptChunk(
      key = session.key,
      noncePrefix = session.noncePrefix,
      attachmentId = session.attachmentId,
      chunkIndex = chunkIndex,
      chunkCount = session.chunkCount,
      plaintextSize = session.plainSize,
      ciphertext = cipher,
    )
    GencCrypto.zero(cipher)
    cachedChunkIndex = chunkIndex
    cachedPlain = plain
    return plain
  }

  private fun readCipherChunk(chunkIndex: Int): ByteArray {
    val rafLocal = raf ?: throw IllegalStateException("not open")
    val (off, len) = when (session.format) {
      GencFormat.FIXED_SLOT -> {
        val o = GencCrypto.cipherChunkOffset(
          session.plainSize, session.chunkSize, session.chunkCount, chunkIndex,
        )
        val l = GencCrypto.cipherChunkByteLength(
          session.plainSize, session.chunkSize, session.chunkCount, chunkIndex,
        )
        o to l
      }
      GencFormat.PACKED -> {
        val o = session.packedOffsets?.get(chunkIndex)
          ?: throw IllegalStateException("missing packed offset")
        val l = session.packedLengths?.get(chunkIndex)
          ?: throw IllegalStateException("missing packed length")
        o to l
      }
    }
    val buf = ByteArray(len)
    rafLocal.seek(off)
    rafLocal.readFully(buf)
    return buf
  }

  private fun clearChunkCache() {
    GencCrypto.zero(cachedPlain)
    cachedPlain = null
    cachedChunkIndex = -1
  }

  class Factory(private val session: PlaybackSession) : DataSource.Factory {
    override fun createDataSource(): DataSource = GencDataSource(session)
  }
}
