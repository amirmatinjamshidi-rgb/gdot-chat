package expo.modules.gdotencryptedmedia

import android.content.Context
import android.widget.FrameLayout
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

@UnstableApi
class EncryptedVideoView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onProgress by EventDispatcher()
  private val onEnd by EventDispatcher()
  private val onError by EventDispatcher()
  private val onStatus by EventDispatcher()

  private val playerView = PlayerView(context).apply {
    useController = false
    resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
    layoutParams = FrameLayout.LayoutParams(
      FrameLayout.LayoutParams.MATCH_PARENT,
      FrameLayout.LayoutParams.MATCH_PARENT,
    )
  }

  private var player: ExoPlayer? = null
  private var attachmentId: String? = null
  private var preparedFor: String? = null

  init {
    addView(playerView)
  }

  fun setAttachmentId(id: String?) {
    if (id == attachmentId) return
    attachmentId = id
    releasePlayer()
    if (id != null) prepare(id)
  }

  fun setContentFit(fit: String?) {
    playerView.resizeMode = when (fit) {
      "contain" -> AspectRatioFrameLayout.RESIZE_MODE_FIT
      else -> AspectRatioFrameLayout.RESIZE_MODE_ZOOM
    }
  }

  fun setNativeControls(enabled: Boolean) {
    playerView.useController = enabled
  }

  fun play() {
    ensurePrepared()
    player?.play()
  }

  fun pause() {
    player?.pause()
  }

  fun seekTo(seconds: Double) {
    player?.seekTo((seconds * 1000).toLong())
  }

  fun getCurrentTime(): Double = (player?.currentPosition ?: 0L) / 1000.0

  fun getDuration(): Double {
    val d = player?.duration ?: 0L
    return if (d > 0) d / 1000.0 else 0.0
  }

  fun isPlaying(): Boolean = player?.isPlaying == true

  private fun ensurePrepared() {
    val id = attachmentId ?: return
    if (preparedFor != id) prepare(id)
  }

  private fun prepare(id: String) {
    val session = PlaybackSessionStore.get(id) ?: run {
      onError(mapOf("message" to "no playback session for $id"))
      return
    }
    releasePlayer()
    val exo = ExoPlayer.Builder(context).build()
    val mediaSource = ProgressiveMediaSource.Factory(GencDataSource.Factory(session))
      .createMediaSource(MediaItem.fromUri("gdotenc://$id"))
    exo.setMediaSource(mediaSource)
    exo.prepare()
    exo.addListener(object : Player.Listener {
      override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_ENDED) {
          onEnd(mapOf("attachmentId" to id))
        }
        emitStatus()
      }

      override fun onIsPlayingChanged(isPlaying: Boolean) {
        emitStatus()
      }

      override fun onPlayerError(error: PlaybackException) {
        onError(mapOf("message" to (error.message ?: "playback error")))
      }
    })
    player = exo
    playerView.player = exo
    preparedFor = id
  }

  fun emitProgress() {
    onProgress(
      mapOf(
        "currentTime" to getCurrentTime(),
        "duration" to getDuration(),
        "playing" to isPlaying(),
      ),
    )
  }

  private fun emitStatus() {
    onStatus(
      mapOf(
        "currentTime" to getCurrentTime(),
        "duration" to getDuration(),
        "playing" to isPlaying(),
      ),
    )
  }

  private fun releasePlayer() {
    playerView.player = null
    player?.release()
    player = null
    preparedFor = null
  }

  override fun onDetachedFromWindow() {
    releasePlayer()
    super.onDetachedFromWindow()
  }
}
