// Packs a form into a URL-safe string, so a share link needs no server.
// Format: "1" + base64url( 4-byte FNV checksum | 4-byte length | LZW bit stream ).
// The LZW dictionary is primed with typical form JSON, which helps most on small forms,
// and the checksum catches links truncated by chat apps or email clients.
FL.codec = (function () {
  const VERSION = '1';
  const MAX_CODE = 65536;
  const MAX_OUTPUT = 4 * 1024 * 1024; // refuses a decompression bomb hidden in a crafted link

  const PRIMER = new TextEncoder().encode(
    '{"id":"f_","type":"short_text","label":"Email address","required":true,"options":["Yes","No"],' +
    '{"type":"long_text","label":"{"type":"email","label":"{"type":"single_choice","label":"How would you rate' +
    '{"type":"multi_choice","label":"{"type":"dropdown","label":"{"type":"rating","label":"{"type":"scale","label":"' +
    '{"type":"number","label":"{"type":"date","label":"{"type":"phone","label":"{"type":"file","label":"' +
    '{"type":"section","label":"","help":"What is your name?","validation":{"min":1,"max":10,"pattern":"","message":""},' +
    '"logic":{"match":"all","rules":[{"fieldId":"f_","op":"equals","value":""}]},"pages":[{"id":"p_","title":"Page 1",' +
    '"fields":[{"id":"f_","theme":{"accent":"#","background":"paper","font":"sans","corners":"soft","header":"plain",' +
    '"showProgress":true},"settings":{"submitLabel":"Submit","confirmTitle":"Thank you","confirmMessage":"' +
    'Your response has been recorded.","title":"","description":"'
  );

  function fnv1a(bytes) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
      hash ^= bytes[i];
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  const bitLength = (value) => 32 - Math.clz32(value);

  /** Walks the primer through the LZW loop, so both directions start from the same dictionary. */
  function primedDictionary() {
    const codes = new Map();
    const sequences = [];
    for (let i = 0; i < 256; i++) sequences.push([i]);
    let current = -1;
    PRIMER.forEach((byte) => {
      if (current < 0) { current = byte; return; }
      const key = current * 256 + byte;
      if (codes.has(key)) { current = codes.get(key); return; }
      codes.set(key, sequences.length);
      sequences.push(sequences[current].concat(byte));
      current = byte;
    });
    return { codes, sequences };
  }

  function createBitWriter() {
    const bytes = [];
    let buffer = 0;
    let filled = 0;
    return {
      write(code, width) {
        for (let bit = 0; bit < width; bit++) {
          buffer |= ((code >>> bit) & 1) << filled;
          filled++;
          if (filled === 8) { bytes.push(buffer); buffer = 0; filled = 0; }
        }
      },
      finish() {
        if (filled) bytes.push(buffer);
        return bytes;
      },
    };
  }

  function lzwCompress(input) {
    const { codes, sequences } = primedDictionary();
    let next = sequences.length;
    const writer = createBitWriter();
    let current = -1;
    input.forEach((byte) => {
      if (current < 0) { current = byte; return; }
      const key = current * 256 + byte;
      if (codes.has(key)) { current = codes.get(key); return; }
      writer.write(current, bitLength(next - 1));
      if (next < MAX_CODE) codes.set(key, next++);
      current = byte;
    });
    if (current >= 0) writer.write(current, bitLength(next - 1));
    return writer.finish();
  }

  function lzwDecompress(bytes, start, outputLength) {
    const { sequences } = primedDictionary();
    const output = [];
    const base = sequences.length;
    let bitPos = start * 8;
    const totalBits = bytes.length * 8;

    function read(width) {
      if (bitPos + width > totalBits) throw new Error('truncated');
      let code = 0;
      for (let bit = 0; bit < width; bit++) {
        code |= ((bytes[bitPos >> 3] >> (bitPos & 7)) & 1) << bit;
        bitPos++;
      }
      return code;
    }

    let previous = null;
    let emitted = 0; // the writer has added one entry for every code it wrote, which sets the width
    while (output.length < outputLength) {
      const writerNext = Math.min(base + emitted, MAX_CODE);
      const code = read(bitLength(writerNext - 1));
      let entry;
      if (code < sequences.length) entry = sequences[code];
      else if (previous && code === sequences.length) entry = previous.concat(previous[0]);
      else throw new Error('bad code');
      if (previous && sequences.length < MAX_CODE) sequences.push(previous.concat(entry[0]));
      for (let i = 0; i < entry.length; i++) output.push(entry[i]);
      previous = entry;
      emitted++;
    }
    return Uint8Array.from(output.slice(0, outputLength));
  }

  function toBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('bad characters');
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function writeUint32(target, offset, value) {
    for (let i = 0; i < 4; i++) target[offset + i] = (value >>> (8 * i)) & 255;
  }

  function readUint32(source, offset) {
    let value = 0;
    for (let i = 3; i >= 0; i--) value = value * 256 + source[offset + i];
    return value;
  }

  function pack(value) {
    const input = new TextEncoder().encode(JSON.stringify(value));
    const body = lzwCompress(input);
    const bytes = new Uint8Array(8 + body.length);
    writeUint32(bytes, 0, fnv1a(input));
    writeUint32(bytes, 4, input.length);
    bytes.set(body, 8);
    return VERSION + toBase64Url(bytes);
  }

  /** Returns the decoded value, or throws if the text is damaged. */
  function unpack(text) {
    if (typeof text !== 'string' || text[0] !== VERSION) throw new Error('unknown version');
    const bytes = fromBase64Url(text.slice(1));
    if (bytes.length < 8) throw new Error('too short');
    const length = readUint32(bytes, 4);
    if (length > MAX_OUTPUT) throw new Error('too large');
    const output = lzwDecompress(bytes, 8, length);
    if (fnv1a(output) !== readUint32(bytes, 0)) throw new Error('checksum mismatch');
    return JSON.parse(new TextDecoder().decode(output));
  }

  /** Drops values equal to a new field's defaults. Normalizing on the way back in restores them. */
  function pruneField(field) {
    const defaults = FL.fields.create(field.type);
    const pruned = { id: field.id, type: field.type };
    Object.keys(field).forEach((key) => {
      if (key !== 'id' && key !== 'type' && JSON.stringify(field[key]) !== JSON.stringify(defaults[key])) {
        pruned[key] = field[key];
      }
    });
    return pruned;
  }

  function encodeForm(form) {
    return pack({
      id: form.id,
      title: form.title,
      description: form.description,
      pages: form.pages.map((page) => ({ id: page.id, title: page.title, fields: page.fields.map(pruneField) })),
      theme: form.theme,
      settings: form.settings,
    });
  }

  /** Returns a normalized form, or null when the link is damaged or the data isn't a valid form. */
  function decodeForm(text) {
    try {
      return FL.schema.normalizeForm(unpack(text)).form;
    } catch (err) {
      return null;
    }
  }

  function encodeReply(formId, response) {
    return pack({ formId, response });
  }

  function decodeReply(text) {
    try {
      const data = unpack(text);
      const response = FL.schema.normalizeResponse(data.response);
      return response && typeof data.formId === 'string' ? { formId: data.formId, response } : null;
    } catch (err) {
      return null;
    }
  }

  return { pack, unpack, encodeForm, decodeForm, encodeReply, decodeReply };
})();
