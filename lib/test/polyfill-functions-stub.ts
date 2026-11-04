export function polyfillGlobal<T>(name: string, getValue: () => T): void {
  Object.defineProperty(globalThis, name, {
    value: getValue(),
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

export function polyfillObjectProperty<T>(
  object: object,
  name: string,
  getValue: () => T,
): void {
  Object.defineProperty(object, name, {
    value: getValue(),
    configurable: true,
    writable: true,
    enumerable: true,
  });
}
