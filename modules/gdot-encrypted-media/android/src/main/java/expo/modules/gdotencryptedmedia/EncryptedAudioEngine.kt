package expo.modules.gdotencryptedmedia

import android.content.Context
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import java.util.concurrent.ConcurrentHashMap

@UnstableApi
object EncryptedAudioEngine {
  private val players = ConcurrentHashMap<String, ExoPlayer>()
  private val finished = ConcurrentHashMap<String, Boolean>()

  fun play(context: Context, attachmentId: String) {
    val player = obtain(context, attachmentId)
    finished[attachmentId] = false
    player.play()
  }

  fun pause(attachmentId: String) {
    players[attachmentId]?.pause()
  }

  fun seekTo(attachmentId: String, seconds: Double) {
    players[attachmentId]?.seekTo((seconds * 1000).toLong())
  }

  fun release(attachmentId: String) {
    players.remove(attachmentId)?.release()
    finished.remove(attachmentId)
  }

  fun releaseAll() {
    val ids = players.keys.toList()
    for (id in ids) release(id)
  }

  fun status(attachmentId: String): Map<String, Any?> {
    val p = players[attachmentId]
    val durationMs = p?.duration ?: 0L
    val didFinish = finished[attachmentId] == true
    return mapOf(
      "playing" to (p?.isPlaying == true),
      "currentTime" to ((p?.currentPosition ?: 0L) / 1000.0),
      "duration" to (if (durationMs > 0) durationMs / 1000.0 else 0.0),
      "didJustFinish" to didFinish,
    )
  }

  private fun obtain(context: Context, attachmentId: String): ExoPlayer {
    players[attachmentId]?.let { return it }
    val session = PlaybackSessionStore.get(attachmentId)
      ?: throw IllegalStateException("no playback session for $attachmentId")
    val exo = ExoPlayer.Builder(context.applicationContext).build()
    val mediaSource = ProgressiveMediaSource.Factory(GencDataSource.Factory(session))
      .createMediaSource(MediaItem.fromUri("gdotenc://$attachmentId"))
    exo.setMediaSource(mediaSource)
    exo.prepare()
    exo.addListener(object : Player.Listener {
      override fun onPlaybackStateChanged(playbackState: Int) {
        if (playbackState == Player.STATE_ENDED) {
          finished[attachmentId] = true
        }
      }
    })
    players[attachmentId] = exo
    return exo
  }
}
