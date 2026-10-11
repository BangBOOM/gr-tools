/** Native text descriptors store UTF-16 length including NUL in one byte. */
export function validCameraName(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 254 || /[\x00-\x1f\x7f]/.test(value)) return false;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}
