import {
  textDecode,
  textEncode,
  type SupportedEncoding,
} from "@borewit/text-codec";
import { Platform } from "react-native";
import { polyfillGlobal } from "react-native/Libraries/Utilities/PolyfillFunctions";

/** Hermes lacks utf-16le/latin1 TextDecoder — required by libsignal-protocol-typescript. */
if (Platform.OS !== "web") {
  const NativeTextDecoder = globalThis.TextDecoder;
  const NativeTextEncoder = globalThis.TextEncoder;

  class PolyfillTextDecoder {
    private readonly encoding: SupportedEncoding;

    constructor(encoding = "utf-8") {
      this.encoding = encoding.toLowerCase() as SupportedEncoding;
    }

    decode(input: ArrayBuffer | ArrayBufferView): string {
      const bytes =
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);

      if (this.encoding === "utf-8" || this.encoding === "utf8") {
        return new NativeTextDecoder("utf-8").decode(bytes);
      }

      return textDecode(bytes, this.encoding);
    }
  }

  class PolyfillTextEncoder {
    encode(input = ""): Uint8Array {
      if (NativeTextEncoder) {
        return new NativeTextEncoder().encode(input);
      }

      return textEncode(input, "utf-8");
    }
  }

  polyfillGlobal("TextDecoder", () => PolyfillTextDecoder);
  polyfillGlobal("TextEncoder", () => PolyfillTextEncoder);
}
