import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'

/**
 * 富文本扩展。
 * markdown-it 会把 GFM 表格渲成 `<table>`。没有 table 节点时，ProseMirror 会丢掉表格结构，
 * 把单元格文本拼成一行，再经 getMarkdown() 写回草稿。
 */
export function createKbRichExtensions() {
  return [
    StarterKit,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Markdown.configure({
      html: false,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ]
}
