import ExpoModulesCore

/// Native shell for the libsignal Expo module. Crypto runs in the TS layer (Hermes).
public class LibSignalModule: Module {
  public func definition() -> ModuleDefinition {
    Name("LibSignalModule")
    Function("isNativeShell") { () -> Bool in
      true
    }
  }
}
