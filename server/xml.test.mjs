import test from 'node:test';
import assert from 'node:assert/strict';
import { parseXml, childOf, childrenOf, textOf, textsOf, leafObjectOf, XmlError } from './xml.mjs';

test('the reader returns an inert tree and never interprets markup as HTML', () => {
  const root = parseXml(`<?xml version='1.0' encoding='UTF-8'?><wantedRoot><total>2</total><wanted><title>개발 &amp; 운영 &lt;b&gt;아님</title></wanted></wantedRoot>`);
  assert.equal(root.name, 'wantedRoot'); assert.equal(textOf(root, 'total'), '2');
  const wanted = childOf(root, 'wanted');
  assert.equal(textOf(wanted, 'title'), '개발 & 운영 <b>아님');
  assert.equal(wanted.text, '');
  assert.deepEqual(leafObjectOf(wanted), { title: '개발 & 운영 <b>아님' });
});

test('attributes, comments, CDATA and self-closing tags are handled', () => {
  const root = parseXml(`<a foo="1 &amp; 2" bar='3'><b/><!-- note --><c><![CDATA[x < y & z]]></c><d>  spaced  </d></a>`);
  assert.deepEqual(root.children.map(child => child.name), ['b', 'c', 'd']);
  assert.equal(textOf(root, 'c'), 'x < y & z');
  assert.equal(textOf(root, 'd'), 'spaced');
  assert.equal(childOf(root, 'b').children.length, 0);
});

test('repeated elements stay separate and helper lookups are bounded to direct children', () => {
  const root = parseXml('<r><keyword>가</keyword><keyword>나</keyword><wrap><keyword>깊이</keyword></wrap></r>');
  assert.deepEqual(textsOf(root, 'keyword'), ['가', '나']);
  assert.equal(childrenOf(root, 'keyword').length, 2);
  assert.equal(textOf(childOf(root, 'keyword'), 'keyword'), '');
  assert.deepEqual(Object.keys(leafObjectOf(root)), ['keyword']);
});

test('malformed, oversized and unsafe documents are rejected instead of partially parsed', () => {
  for (const source of [
    '<a><b></a>', '<a>', '<a><b></b>', '', 'plain text', '<a>&unknown;</a>', '<a>&#xD800;</a>',
    '<!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>', '<!ENTITY x "y"><r/>',
    `<a>${'x'.repeat(400_001)}</a>`,
  ]) assert.throws(() => parseXml(source), XmlError, `expected rejection for ${source.slice(0, 30)}`);
  assert.throws(() => parseXml('<a><b><c></c></b></a>', { maxDepth: 2 }), XmlError);
  assert.throws(() => parseXml(`<r>${'<i/>'.repeat(30)}</r>`, { maxNodes: 10 }), XmlError);
  assert.throws(() => parseXml('<r>a</r>', { maxBytes: 2 }), XmlError);
  assert.throws(() => parseXml(null), XmlError);
});
