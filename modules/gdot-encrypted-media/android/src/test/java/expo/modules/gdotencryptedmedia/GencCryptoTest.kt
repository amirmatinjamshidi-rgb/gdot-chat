package expo.modules.gdotencryptedmedia

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.nio.charset.StandardCharsets
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Vectors mirror lib/crypto/media-aead.ts (A256GCM-CHUNKED-V1).
 * Ciphertext produced with the same AAD / nonce construction.
 */
class GencCryptoTest {
  @Test
  fun plainChunkLength_lastChunkShorter() {
    assertEquals(2048, GencCrypto.plainChunkLength(5000, 2048, 0, 3))
    assertEquals(2048, GencCrypto.plainChunkLength(5000, 2048, 1, 3))
    assertEquals(904, GencCrypto.plainChunkLength(5000, 2048, 2, 3))
  }

  @Test
  fun chunkRangeForPlainBytes_crossesBoundary() {
    val range = GencCrypto.chunkRangeForPlainBytes(2990, 20, 3000, 4, 10000)
    assertEquals(0, range.first)
    assertEquals(1, range.last)
  }

  @Test
  fun decryptChunk_roundTripMatchesJsAead() {
    val key = ByteArray(32) { it.toByte() }
    val noncePrefix = ByteArray(8) { (it + 10).toByte() }
    val attachmentId = "att-android-vector"
    val plainSize = 64L
    val chunkSize = 32
    val chunkCount = 2
    val plain0 = ByteArray(32) { (it * 3).toByte() }

    val ciphertext = encryptLikeJs(
      key, noncePrefix, attachmentId, 0, chunkCount, plainSize, plain0,
    )
    val out = GencCrypto.decryptChunk(
      key, noncePrefix, attachmentId, 0, chunkCount, plainSize, ciphertext,
    )
    assertArrayEquals(plain0, out)
  }

  @Test
  fun decryptChunk_failsClosedOnTamper() {
    val key = ByteArray(32) { 1 }
    val noncePrefix = ByteArray(8) { 2 }
    val plain = ByteArray(16) { 7 }
    val ct = encryptLikeJs(key, noncePrefix, "x", 0, 1, 16, plain)
    ct[0] = (ct[0].toInt() xor 0xff).toByte()
    var failed = false
    try {
      GencCrypto.decryptChunk(key, noncePrefix, "x", 0, 1, 16, ct)
    } catch (e: GencAuthException) {
      failed = true
    }
    assertTrue(failed)
  }

  @Test
  fun fixedSlotOffsets_deterministic() {
    val plainSize = 5000L
    val chunkSize = 2048
    val chunkCount = 3
    var expected = 0L
    for (i in 0 until chunkCount) {
      assertEquals(expected, GencCrypto.cipherChunkOffset(plainSize, chunkSize, chunkCount, i))
      expected += GencCrypto.cipherChunkByteLength(plainSize, chunkSize, chunkCount, i).toLong()
    }
  }

  private fun encryptLikeJs(
    key: ByteArray,
    noncePrefix: ByteArray,
    attachmentId: String,
    chunkIndex: Int,
    chunkCount: Int,
    plaintextSize: Long,
    plaintext: ByteArray,
  ): ByteArray {
    val nonce = GencCrypto.chunkNonce(noncePrefix, chunkIndex)
    val aad = GencCrypto.buildChunkAad(attachmentId, chunkIndex, chunkCount, plaintextSize)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding")
    cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
    cipher.updateAAD(aad)
    return cipher.doFinal(plaintext)
  }
}
