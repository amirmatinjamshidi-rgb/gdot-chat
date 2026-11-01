import {
  textDecode,
  textEncode,
  type SupportedEncoding,
} from "@borewit/text-codec";
import { getRandomBytes } from "expo-crypto";
import { Platform } from "react-native";
import { polyfillGlobal } from "react-native/Libraries/Utilities/PolyfillFunctions";

if (typeof globalThis.crypto?.getRandomValues !== "function") {
  const getRandomValues = <T extends ArrayBufferView>(typedArray: T): T => {
    const bytes = getRandomBytes(typedArray.byteLength);
    const view = new Uint8Array(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength,
    );
    view.set(bytes);
    return typedArray;
  };
  const cryptoObj =
    globalThis.crypto ??
    ({ getRandomValues } as Crypto);
  if (!globalThis.crypto) {
    polyfillGlobal("crypto", () => cryptoObj);
  } else {
    globalThis.crypto.getRandomValues = getRandomValues;
  }
}

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
