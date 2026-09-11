import type { D3Elem } from './d3-group'
import { cn } from '@lib/utils'
import { D3_ELEMS, D3_LABEL, mul } from './d3-group'

interface CayleyTableProps {
  highlight?: D3Elem | null
  className?: string
}

/** D₃ 凯莱表：行 · 列 */
export function CayleyTable({ highlight = null, className }: CayleyTableProps) {
  return (
    <div className={cn('overflow-auto rounded-lg border border-border bg-card', className)}>
      <div className="border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">凯莱表 · 行 ∘ 列</h2>
        <p className="text-[11px] text-muted-foreground">aᵢ · bⱼ（行在前）</p>
      </div>
      <table className="w-full border-collapse text-center text-xs">
        <thead>
          <tr>
            <th className="border-b border-border bg-muted/50 px-1.5 py-1.5 font-medium text-muted-foreground">·</th>
            {D3_ELEMS.map(col => (
              <th
                key={col}
                className={cn(
                  'border-b border-border bg-muted/50 px-1.5 py-1.5 font-medium text-muted-foreground',
                  highlight === col && 'text-foreground',
                )}
              >
                {D3_LABEL[col]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {D3_ELEMS.map(row => (
            <tr key={row}>
              <th className="border-b border-border/60 bg-muted/40 px-1.5 py-1.5 font-medium text-muted-foreground">
                {D3_LABEL[row]}
              </th>
              {D3_ELEMS.map((col) => {
                const res = mul(row, col)
                const lit = highlight != null && res === highlight
                return (
                  <td
                    key={col}
                    className={cn(
                      'border-b border-border/60 px-1.5 py-1.5 font-semibold tabular-nums',
                      lit ? 'bg-primary/15 text-primary' : 'text-foreground',
                    )}
                  >
                    {D3_LABEL[res]}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
