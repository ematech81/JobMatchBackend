// Multer's fileFilter only sees the client-supplied Content-Type header,
// which is trivially spoofable — a request can claim `application/pdf` for
// any bytes it wants. This checks the actual file content against each
// format's real magic-byte signature, run once the buffer is fully
// available (fileFilter fires too early in multer's stream processing for
// this — the buffer isn't populated yet at that point).
const SIGNATURES = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  // DOCX is a ZIP container (OOXML) — same signature as any ZIP.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]],
  // Legacy .doc — OLE Compound File Binary Format.
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]]
};

function matchesSignature(buffer, signature) {
  if (buffer.length < signature.length) return false;
  return signature.every((byte, i) => buffer[i] === byte);
}

/**
 * True if `buffer`'s actual leading bytes match a real signature for the
 * claimed `mimetype`. An unrecognized mimetype (shouldn't happen — multer's
 * fileFilter already restricts to the three above) fails closed.
 */
function isValidFileSignature(buffer, mimetype) {
  const signatures = SIGNATURES[mimetype];
  if (!signatures) return false;
  return signatures.some((sig) => matchesSignature(buffer, sig));
}

module.exports = { isValidFileSignature };
