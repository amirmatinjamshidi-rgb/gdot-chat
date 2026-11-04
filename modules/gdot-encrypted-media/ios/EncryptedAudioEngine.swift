import AVFoundation
import Foundation

final class EncryptedAudioEngine {
  static let shared = EncryptedAudioEngine()

  private var players: [String: AVPlayer] = [:]
  private var loaders: [String: GencResourceLoader] = [:]
  private var finished: [String: Bool] = [:]
  private var endObservers: [String: NSObjectProtocol] = [:]

  func play(attachmentId: String) throws {
    finished[attachmentId] = false
    let player = try obtain(attachmentId)
    player.play()
  }

  func pause(attachmentId: String) {
    players[attachmentId]?.pause()
  }

  func seekTo(attachmentId: String, seconds: Double) {
    let t = CMTime(seconds: seconds, preferredTimescale: 600)
    players[attachmentId]?.seek(to: t)
  }

  func release(attachmentId: String) {
    if let obs = endObservers.removeValue(forKey: attachmentId) {
      NotificationCenter.default.removeObserver(obs)
    }
    players[attachmentId]?.pause()
    players.removeValue(forKey: attachmentId)
    loaders.removeValue(forKey: attachmentId)
    finished.removeValue(forKey: attachmentId)
  }

  func releaseAll() {
    for id in Array(players.keys) { release(attachmentId: id) }
  }

  func status(attachmentId: String) -> [String: Any] {
    let p = players[attachmentId]
    let current = p?.currentTime().seconds ?? 0
    let dur = p?.currentItem?.duration.seconds ?? 0
    let playing = (p?.rate ?? 0) > 0
    return [
      "playing": playing,
      "currentTime": current.isFinite ? current : 0,
      "duration": dur.isFinite ? dur : 0,
      "didJustFinish": finished[attachmentId] ?? false,
    ]
  }

  private func obtain(_ attachmentId: String) throws -> AVPlayer {
    if let existing = players[attachmentId] { return existing }
    guard let session = PlaybackSessionStore.shared.get(attachmentId) else {
      throw GencCryptoError.io
    }
    let loader = try GencResourceLoader(session: session)
    guard let url = URL(string: "gdotenc://\(attachmentId)") else { throw GencCryptoError.io }
    let asset = AVURLAsset(url: url)
    asset.resourceLoader.setDelegate(loader, queue: DispatchQueue.global(qos: .userInitiated))
    let item = AVPlayerItem(asset: asset)
    let player = AVPlayer(playerItem: item)
    let obs = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime,
      object: item,
      queue: .main
    ) { [weak self] _ in
      self?.finished[attachmentId] = true
    }
    endObservers[attachmentId] = obs
    loaders[attachmentId] = loader
    players[attachmentId] = player
    return player
  }
}
