import ExpoModulesCore

public class GdotEncryptedMediaModule: Module {
  public func definition() -> ModuleDefinition {
    Name("GdotEncryptedMedia")

    Function("registerSession") { (params: [String: Any]) in
      guard
        let attachmentId = params["attachmentId"] as? String,
        let fileUri = params["fileUri"] as? String,
        let keyBase64 = params["keyBase64"] as? String,
        let noncePrefixBase64 = params["noncePrefixBase64"] as? String,
        let plainSizeNum = params["plainSize"] as? NSNumber,
        let chunkSizeNum = params["chunkSize"] as? NSNumber,
        let chunkCountNum = params["chunkCount"] as? NSNumber
      else {
        throw Exception(name: "InvalidParams", description: "missing session params")
      }
      try PlaybackSessionStore.shared.register(
        attachmentId: attachmentId,
        fileUri: fileUri,
        keyBase64: keyBase64,
        noncePrefixBase64: noncePrefixBase64,
        plainSize: plainSizeNum.int64Value,
        chunkSize: chunkSizeNum.intValue,
        chunkCount: chunkCountNum.intValue,
        mimeType: (params["mimeType"] as? String) ?? "application/octet-stream",
        format: (params["format"] as? String) ?? "fixed-slot"
      )
    }

    Function("unregisterSession") { (attachmentId: String) in
      EncryptedAudioEngine.shared.release(attachmentId: attachmentId)
      PlaybackSessionStore.shared.clear(attachmentId)
    }

    Function("clearAll") {
      EncryptedAudioEngine.shared.releaseAll()
      PlaybackSessionStore.shared.clearAll()
    }

    Function("sessionCount") { () -> Int in
      PlaybackSessionStore.shared.count()
    }

    AsyncFunction("audioPlay") { (attachmentId: String) in
      try EncryptedAudioEngine.shared.play(attachmentId: attachmentId)
    }

    AsyncFunction("audioPause") { (attachmentId: String) in
      EncryptedAudioEngine.shared.pause(attachmentId: attachmentId)
    }

    AsyncFunction("audioSeekTo") { (attachmentId: String, seconds: Double) in
      EncryptedAudioEngine.shared.seekTo(attachmentId: attachmentId, seconds: seconds)
    }

    AsyncFunction("audioRelease") { (attachmentId: String) in
      EncryptedAudioEngine.shared.release(attachmentId: attachmentId)
    }

    AsyncFunction("audioStatus") { (attachmentId: String) -> [String: Any] in
      EncryptedAudioEngine.shared.status(attachmentId: attachmentId)
    }

    View(EncryptedVideoView.self) {
      Prop("attachmentId") { (view: EncryptedVideoView, id: String?) in
        view.setAttachmentId(id)
      }
      Prop("contentFit") { (view: EncryptedVideoView, fit: String?) in
        view.setContentFit(fit)
      }
      Prop("nativeControls") { (view: EncryptedVideoView, enabled: Bool?) in
        view.setNativeControls(enabled ?? false)
      }
      Prop("playing") { (view: EncryptedVideoView, playing: Bool?) in
        if playing == true { view.play() } else { view.pause() }
      }
      Events("onProgress", "onEnd", "onError", "onStatus")
      AsyncFunction("play") { (view: EncryptedVideoView) in view.play() }
      AsyncFunction("pause") { (view: EncryptedVideoView) in view.pause() }
      AsyncFunction("seekTo") { (view: EncryptedVideoView, seconds: Double) in view.seekTo(seconds) }
      AsyncFunction("getStatus") { (view: EncryptedVideoView) -> [String: Any] in
        [
          "currentTime": view.currentTime(),
          "duration": view.duration(),
          "playing": view.isPlaying(),
        ]
      }
    }
  }
}
