// A deliberately small, dependency-free XML reader for the official Work24 (고용24) Open API.
// It never expands DTDs or external entities, ignores attributes, and bounds input size, tag
// depth and node count so a malformed or hostile upstream response cannot exhaust the server.
// The result is an inert tree of `{ name, text, children }` plus a few lookup helpers. Callers
// must convert any text to plain text before display; this module never interprets markup.

export class XmlError extends Error {}

const NAMED_ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" });
const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g;
const BARE_AMPERSTAND = /&(?!(?:#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);)/;

function decodeEntities(value) {
  if (BARE_AMPERSTAND.test(value)) throw new XmlError('XML에 올바르지 않은 & 문자가 있어요.');
  return value.replace(ENTITY_PATTERN, (match, body) => {
    if (body[0] === '#') {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = hex ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      if (!Number.isInteger(code) || code < 1 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) throw new XmlError('XML 문자 참조가 올바르지 않아요.');
      return String.fromCodePoint(code);
    }
    if (!Object.hasOwn(NAMED_ENTITIES, body)) throw new XmlError('알 수 없는 XML 엔터티가 있어요.');
    return NAMED_ENTITIES[body];
  });
}

/** Index of the closing `>` for a start tag, ignoring `>` inside quoted attribute values. */
function findTagEnd(source, start) {
  let quote = '';
  for (let index = start + 1; index < source.length; index++) {
    const character = source[index];
    if (quote) { if (character === quote) quote = ''; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === '>') return index;
  }
  return -1;
}

const TEXT_LIMIT = 400_000;

function appendText(stack, raw, { literal = false } = {}) {
  if (!raw) return;
  const parent = stack[stack.length - 1];
  parent.text += literal ? raw : decodeEntities(raw);
  if (parent.text.length > TEXT_LIMIT) throw new XmlError('XML 텍스트가 처리 가능한 크기를 넘었어요.');
}

/**
 * Parse a bounded XML document into inert nodes. Returns the single root element.
 * Rejects DOCTYPE/ENTITY declarations outright so no external or recursive expansion runs.
 */
export function parseXml(source, { maxBytes = 2_000_000, maxDepth = 40, maxNodes = 20_000 } = {}) {
  if (typeof source !== 'string') throw new XmlError('XML 문자열이 필요해요.');
  if (Buffer.byteLength(source, 'utf8') > maxBytes) throw new XmlError('XML 응답이 처리 가능한 크기를 넘었어요.');
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new XmlError('안전하지 않은 XML 선언이 포함되어 있어요.');
  const document = { name: '#document', text: '', children: [] };
  const stack = [document];
  let nodeCount = 0;
  let index = 0;
  const length = source.length;
  while (index < length) {
    if (source[index] !== '<') {
      const next = source.indexOf('<', index);
      const end = next < 0 ? length : next;
      appendText(stack, source.slice(index, end));
      index = end;
      continue;
    }
    if (source.startsWith('<!--', index)) {
      const end = source.indexOf('-->', index + 4);
      if (end < 0) throw new XmlError('닫히지 않은 XML 주석이 있어요.');
      index = end + 3; continue;
    }
    if (source.startsWith('<![CDATA[', index)) {
      const end = source.indexOf(']]>', index + 9);
      if (end < 0) throw new XmlError('닫히지 않은 CDATA 구간이 있어요.');
      appendText(stack, source.slice(index + 9, end), { literal: true });
      index = end + 3; continue;
    }
    if (source.startsWith('<!', index)) throw new XmlError('지원하지 않는 XML 선언이에요.');
    if (source.startsWith('<?', index)) {
      const end = source.indexOf('?>', index + 2);
      if (end < 0) throw new XmlError('닫히지 않은 XML 처리 명령이 있어요.');
      index = end + 2; continue;
    }
    if (source.startsWith('</', index)) {
      const end = source.indexOf('>', index + 2);
      if (end < 0) throw new XmlError('닫히지 않은 XML 종료 태그가 있어요.');
      const name = source.slice(index + 2, end).trim();
      const open = stack.pop();
      if (!open || open === document || open.name !== name) throw new XmlError('XML 태그 짝이 맞지 않아요.');
      index = end + 1; continue;
    }
    const end = findTagEnd(source, index);
    if (end < 0) throw new XmlError('닫히지 않은 XML 시작 태그가 있어요.');
    let inner = source.slice(index + 1, end);
    const selfClosing = inner.endsWith('/');
    if (selfClosing) inner = inner.slice(0, -1);
    const match = /^([^\s/>]+)/.exec(inner);
    if (!match) throw new XmlError('XML 태그 이름을 읽지 못했어요.');
    if (++nodeCount > maxNodes) throw new XmlError('XML 항목 수가 처리 가능한 범위를 넘었어요.');
    if (stack.length > maxDepth) throw new XmlError('XML 깊이가 처리 가능한 범위를 넘었어요.');
    const node = { name: match[1], text: '', children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
    index = end + 1;
  }
  if (stack.length !== 1) throw new XmlError('닫히지 않은 XML 태그가 있어요.');
  if (document.children.length !== 1) throw new XmlError('XML 최상위 요소가 하나가 아니에요.');
  return document.children[0];
}

/** Direct child element with the given name, if present. */
export function childOf(node, name) {
  return node?.children.find(child => child.name === name) ?? null;
}

/** All direct child elements with the given name. */
export function childrenOf(node, name) {
  return node?.children.filter(child => child.name === name) ?? [];
}

/** Trimmed text of the first direct child element with the given name. */
export function textOf(node, name) {
  const child = childOf(node, name);
  return child ? child.text.trim() : '';
}

/** Trimmed text of every direct child element with the given name. */
export function textsOf(node, name) {
  return childrenOf(node, name).map(child => child.text.trim()).filter(Boolean);
}

/** Convert a leaf-only element into a plain object of direct child text values. */
export function leafObjectOf(node) {
  const output = {};
  for (const child of node?.children ?? []) {
    if (child.children.length || Object.hasOwn(output, child.name)) continue;
    output[child.name] = child.text.trim();
  }
  return output;
}
