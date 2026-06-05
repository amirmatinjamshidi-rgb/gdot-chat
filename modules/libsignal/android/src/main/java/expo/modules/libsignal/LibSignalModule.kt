package expo.modules.libsignal

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Native shell; cryptographic operations use the TypeScript Signal engine. */
class LibSignalModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LibSignalModule")
    Function("isNativeShell") {
      true
    }
  }
}
