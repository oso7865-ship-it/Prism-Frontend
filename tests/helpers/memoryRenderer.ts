import { createRenderer, h, nextTick, type Component } from 'vue'

type Node = { type: string; text: string; props: Record<string, any>; children: Node[]; parent: Node | null; focus: () => void }
const node = (type: string, text = ''): Node => ({ type, text, props: {}, children: [], parent: null, focus() {} })
/** Vue lifecycle/prop/event harness; no browser, network or HTML parser. */
export function mountStateful(component: Component, initial: Record<string, unknown>) {
  const renderer = createRenderer<Node, Node>({
    createElement: type => node(type), createText: text => node('#text', text), createComment: text => node('#comment', text),
    setText: (n, text) => { n.text = text }, setElementText: (n, text) => { n.text = text; n.children = [] },
    parentNode: n => n.parent, nextSibling: n => n.parent?.children[n.parent.children.indexOf(n) + 1] || null,
    patchProp: (n, key, _old, value) => { n.props[key] = value },
    insert(n, parent, anchor = null) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = parent; const at = anchor ? parent.children.indexOf(anchor) : -1; parent.children.splice(at < 0 ? parent.children.length : at, 0, n) },
    remove(n) { if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1); n.parent = null },
  })
  const root = node('root')
  let props = initial
  renderer.render(h(component, props), root)
  const all = (n: Node): Node[] => [n, ...n.children.flatMap(all)]
  const text = (n: Node): string => n.type === '#comment' ? '' : n.text + n.children.map(text).join(' ')
  return {
    text: () => text(root),
    find: (type: string, label: string) => all(root).find(n => n.type === type && text(n).includes(label))!,
    async update(values: Record<string, unknown>) { props = { ...props, ...values }; renderer.render(h(component, props), root); await nextTick() },
    async settle() { await new Promise(resolve => setImmediate(resolve)); await nextTick() },
    unmount() { renderer.render(null, root) },
  }
}
