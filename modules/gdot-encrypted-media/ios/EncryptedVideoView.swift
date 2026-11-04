import AVFoundation
import ExpoModulesCore
import UIKit

class EncryptedVideoView: ExpoView {
  let onProgress = EventDispatcher()
  let onEnd = EventDispatcher()
  let onError = EventDispatcher()
  let onStatus = EventDispatcher()

  private let playerViewController = AVPlayerViewController()
  private var player: AVPlayer?
  private var loader: GencResourceLoader?
  private var attachmentId: String?
  private var endObserver: NSObjectProtocol?
  private var timeObserver: Any?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    playerViewController.showsPlaybackControls = false
    playerViewController.videoGravity = .resizeAspectFill
    addSubview(playerViewController.view)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    playerViewController.view.frame = bounds
  }

  func setAttachmentId(_ id: String?) {
    if id == attachmentId { return }
    attachmentId = id
    releasePlayer()
    if let id { prepare(id) }
  }

  func setContentFit(_ fit: String?) {
    playerViewController.videoGravity = (fit == "contain") ? .resizeAspect : .resizeAspectFill
  }

  func setNativeControls(_ enabled: Bool) {
    playerViewController.showsPlaybackControls = enabled
  }

  func play() {
    player?.play()
  }

  func pause() {
    player?.pause()
  }

  func seekTo(_ seconds: Double) {
    let t = CMTime(seconds: seconds, preferredTimescale: 600)
    player?.seek(to: t)
  }

  func currentTime() -> Double {
    player?.currentTime().seconds ?? 0
  }

  func duration() -> Double {
    player?.currentItem?.duration.seconds ?? 0
  }

  func isPlaying() -> Bool {
    player?.rate ?? 0 > 0
  }

  private func prepare(_ id: String) {
    guard let session = PlaybackSessionStore.shared.get(id) else {
      onError(["message": "no playback session for \(id)"])
      return
    }
    do {
      let resourceLoader = try GencResourceLoader(session: session)
      self.loader = resourceLoader
      guard let url = URL(string: "gdotenc://\(id)") else {
        onError(["message": "bad url"])
        return
      }
      let asset = AVURLAsset(url: url)
      asset.resourceLoader.setDelegate(resourceLoader, queue: DispatchQueue.global(qos: .userInitiated))
      let item = AVPlayerItem(asset: asset)
      let p = AVPlayer(playerItem: item)
      player = p
      playerViewController.player = p
      endObserver = NotificationCenter.default.addObserver(
        forName: .AVPlayerItemDidPlayToEndTime,
        object: item,
        queue: .main
      ) { [weak self] _ in
        self?.onEnd(["attachmentId": id])
        self?.emitStatus()
      }
      timeObserver = p.addPeriodicTimeObserver(
        forInterval: CMTime(seconds: 0.05, preferredTimescale: 600),
        queue: .main
      ) { [weak self] _ in
        self?.emitProgress()
      }
    } catch {
      onError(["message": error.localizedDescription])
    }
  }

  private func emitProgress() {
    onProgress([
      "currentTime": currentTime(),
      "duration": duration(),
      "playing": isPlaying(),
    ])
  }

  private func emitStatus() {
    onStatus([
      "currentTime": currentTime(),
      "duration": duration(),
      "playing": isPlaying(),
    ])
  }

  private func releasePlayer() {
    if let obs = endObserver {
      NotificationCenter.default.removeObserver(obs)
      endObserver = nil
    }
    if let t = timeObserver, let p = player {
      p.removeTimeObserver(t)
      timeObserver = nil
    }
    player?.pause()
    playerViewController.player = nil
    player = nil
    loader = nil
  }

  deinit {
    releasePlayer()
  }
}
