package expo.modules.gdotencryptedmedia

import androidx.media3.common.util.UnstableApi
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

@UnstableApi
class GdotEncryptedMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("GdotEncryptedMedia")

    Function("registerSession") { params: Map<String, Any?> ->
      PlaybackSessionStore.register(
        attachmentId = params["attachmentId"] as String,
        fileUri = params["fileUri"] as String,
        keyBase64 = params["keyBase64"] as String,
        noncePrefixBase64 = params["noncePrefixBase64"] as String,
        plainSize = (params["plainSize"] as Number).toLong(),
        chunkSize = (params["chunkSize"] as Number).toInt(),
        chunkCount = (params["chunkCount"] as Number).toInt(),
        mimeType = (params["mimeType"] as? String) ?: "application/octet-stream",
        format = (params["format"] as? String) ?: "fixed-slot",
      )
      null
    }

    Function("unregisterSession") { attachmentId: String ->
      EncryptedAudioEngine.release(attachmentId)
      PlaybackSessionStore.clear(attachmentId)
      null
    }

    Function("clearAll") {
      EncryptedAudioEngine.releaseAll()
      PlaybackSessionStore.clearAll()
      null
    }

    Function("sessionCount") {
      PlaybackSessionStore.size()
    }

    AsyncFunction("audioPlay") { attachmentId: String ->
      val ctx = appContext.reactContext ?: throw IllegalStateException("no context")
      EncryptedAudioEngine.play(ctx, attachmentId)
    }

    AsyncFunction("audioPause") { attachmentId: String ->
      EncryptedAudioEngine.pause(attachmentId)
    }

    AsyncFunction("audioSeekTo") { attachmentId: String, seconds: Double ->
      EncryptedAudioEngine.seekTo(attachmentId, seconds)
    }

    AsyncFunction("audioRelease") { attachmentId: String ->
      EncryptedAudioEngine.release(attachmentId)
    }

    AsyncFunction("audioStatus") { attachmentId: String ->
      EncryptedAudioEngine.status(attachmentId)
    }

    View(EncryptedVideoView::class) {
      Prop("attachmentId") { view: EncryptedVideoView, id: String? ->
        view.setAttachmentId(id)
      }
      Prop("contentFit") { view: EncryptedVideoView, fit: String? ->
        view.setContentFit(fit)
      }
      Prop("nativeControls") { view: EncryptedVideoView, enabled: Boolean? ->
        view.setNativeControls(enabled == true)
      }
      Prop("playing") { view: EncryptedVideoView, playing: Boolean? ->
        if (playing == true) view.play() else view.pause()
      }
      Events("onProgress", "onEnd", "onError", "onStatus")
      AsyncFunction("play") { view: EncryptedVideoView -> view.play() }
      AsyncFunction("pause") { view: EncryptedVideoView -> view.pause() }
      AsyncFunction("seekTo") { view: EncryptedVideoView, seconds: Double -> view.seekTo(seconds) }
      AsyncFunction("getStatus") { view: EncryptedVideoView ->
        mapOf(
          "currentTime" to view.getCurrentTime(),
          "duration" to view.getDuration(),
          "playing" to view.isPlaying(),
        )
      }
    }
  }
}
