export interface XmlNode {
  name: string;
  text: string;
  children: XmlNode[];
}
export class XmlError extends Error {}
export function parseXml(source: string, options?: { maxBytes?: number; maxDepth?: number; maxNodes?: number }): XmlNode;
export function childOf(node: XmlNode | null | undefined, name: string): XmlNode | null;
export function childrenOf(node: XmlNode | null | undefined, name: string): XmlNode[];
export function textOf(node: XmlNode | null | undefined, name: string): string;
export function textsOf(node: XmlNode | null | undefined, name: string): string[];
export function leafObjectOf(node: XmlNode | null | undefined): Record<string, string>;
