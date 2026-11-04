package expo.modules.gdotencryptedmedia

import android.util.Base64
import java.io.RandomAccessFile
import java.util.concurrent.ConcurrentHashMap

/** In-memory playback sessions; keys live only while unlocked + actively registered. */
object PlaybackSessionStore {
  private val sessions = ConcurrentHashMap<String, PlaybackSession>()

  fun register(
    attachmentId: String,
    fileUri: String,
    keyBase64: String,
    noncePrefixBase64: String,
    plainSize: Long,
    chunkSize: Int,
    chunkCount: Int,
    mimeType: String,
    format: String,
  ) {
    clear(attachmentId)
    val path = stripFileScheme(fileUri)
    val key = Base64.decode(keyBase64, Base64.DEFAULT)
    val nonce = Base64.decode(noncePrefixBase64, Base64.DEFAULT)
    require(key.size == GencCrypto.KEY_BYTES) { "bad key length" }
    require(nonce.size == GencCrypto.NONCE_PREFIX_BYTES) { "bad nonce length" }

    val fmt = when (format) {
      "packed" -> GencFormat.PACKED
      else -> GencFormat.FIXED_SLOT
    }

    var packedOffsets: LongArray? = null
    var packedLengths: IntArray? = null
    if (fmt == GencFormat.PACKED) {
      val index = buildPackedIndex(path, chunkCount)
      packedOffsets = index.first
      packedLengths = index.second
    }

    sessions[attachmentId] = PlaybackSession(
      attachmentId = attachmentId,
      filePath = path,
      key = key,
      noncePrefix = nonce,
      plainSize = plainSize,
      chunkSize = chunkSize,
      chunkCount = chunkCount,
      mimeType = mimeType,
      format = fmt,
      packedOffsets = packedOffsets,
      packedLengths = packedLengths,
    )
  }

  fun get(attachmentId: String): PlaybackSession? = sessions[attachmentId]

  fun clear(attachmentId: String) {
    sessions.remove(attachmentId)?.clearKeys()
  }

  fun clearAll() {
    val ids = sessions.keys.toList()
    for (id in ids) clear(id)
  }

  fun size(): Int = sessions.size

  private fun stripFileScheme(uri: String): String {
    return when {
      uri.startsWith("file://") -> uri.removePrefix("file://")
      else -> uri
    }
  }

  private fun buildPackedIndex(path: String, expectedCount: Int): Pair<LongArray, IntArray> {
    RandomAccessFile(path, "r").use { raf ->
      val countBuf = ByteArray(4)
      raf.readFully(countBuf)
      val count = GencCrypto.readUint32Be(countBuf, 0)
      require(count == expectedCount) { "packed chunk count mismatch" }
      val offsets = LongArray(count)
      val lengths = IntArray(count)
      var pos = 4L
      for (i in 0 until count) {
        raf.seek(pos)
        val lenBuf = ByteArray(4)
        raf.readFully(lenBuf)
        val len = GencCrypto.readUint32Be(lenBuf, 0)
        pos += 4
        offsets[i] = pos
        lengths[i] = len
        pos += len.toLong()
      }
      return offsets to lengths
    }
  }
}
