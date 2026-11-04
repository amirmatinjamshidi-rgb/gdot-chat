import Foundation
import CryptoKit

enum GencAesGcm {
  static func decrypt(key: Data, nonce: Data, aad: Data, ciphertextAndTag: Data) throws -> Data {
    guard key.count == 32, nonce.count == 12, ciphertextAndTag.count >= 16 else {
      throw GencCryptoError.authFailed
    }
    let symmetricKey = SymmetricKey(data: key)
    let nonceObj = try AES.GCM.Nonce(data: nonce)
    let tag = ciphertextAndTag.suffix(16)
    let cipher = ciphertextAndTag.prefix(ciphertextAndTag.count - 16)
    let box = try AES.GCM.SealedBox(nonce: nonceObj, ciphertext: cipher, tag: tag)
    do {
      return try AES.GCM.open(box, using: symmetricKey, authenticating: aad)
    } catch {
      throw GencCryptoError.authFailed
    }
  }
}
