/**
 * Metro prefers `voice-waveform-skia.native.tsx` / `voice-waveform-skia.web.tsx`
 * over this file at runtime. This shim exists so TypeScript and ESLint resolve
 * `@/components/voice-waveform-skia` reliably (see `moduleSuffixes` in tsconfig).
 */
export { VoiceWaveformSkia } from "./voice-waveform-skia.native";
