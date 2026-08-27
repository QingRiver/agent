import { Checkbox } from '@components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@components/ui/popover'
import { SkillStore } from '@stores/skill-store'
import { useAtomValue } from 'jotai'
import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo } from 'react'

const SKILL_CODES_MAX = 32

interface AgentLabSkillPickerProps {
  value: string[]
  onChange: (codes: string[]) => void
}

export function AgentLabSkillPicker({ value, onChange }: AgentLabSkillPickerProps) {
  const skills = useAtomValue(SkillStore.skillsAtom)
  const selected = useMemo(() => new Set(value), [value])

  useEffect(() => {
    void SkillStore.refresh()
  }, [])

  const options = useMemo(() => {
    const known = new Set(skills.map(s => s.code))
    const orphans = value.filter(code => !known.has(code)).map(code => ({
      code,
      dirName: null as string | null,
    }))
    return [
      ...skills.map(s => ({ code: s.code, dirName: s.dirName })),
      ...orphans,
    ]
  }, [skills, value])

  function toggle(code: string) {
    if (selected.has(code)) {
      onChange(value.filter(c => c !== code))
      return
    }
    if (value.length >= SKILL_CODES_MAX)
      return
    onChange([...value, code])
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          id="lab-skills"
          className="flex min-h-9 w-full items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-left text-sm outline-none hover:bg-accent/40"
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {value.length === 0
              ? (
                  <span className="text-muted-foreground">选择要绑定的 Skill</span>
                )
              : value.map(code => (
                  <span
                    key={code}
                    className="inline-flex max-w-full items-center rounded-md bg-muted px-1.5 py-0.5 text-xs text-foreground"
                  >
                    <span className="truncate">{code}</span>
                  </span>
                ))}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) p-1">
        <div className="max-h-56 overflow-y-auto py-0.5">
          {options.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              还没有 Skill。先在项目管理里把文件夹升级为 Skill。
            </p>
          )}
          {options.map((opt) => {
            const on = selected.has(opt.code)
            const atCap = !on && value.length >= SKILL_CODES_MAX
            return (
              <label
                key={opt.code}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-accent"
              >
                <Checkbox
                  checked={on}
                  disabled={atCap}
                  onCheckedChange={() => toggle(opt.code)}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{opt.code}</span>
                {opt.dirName != null && opt.dirName !== opt.code && (
                  <span className="shrink-0 text-xs text-muted-foreground">{opt.dirName}</span>
                )}
                {opt.dirName == null && (
                  <span className="shrink-0 text-xs text-muted-foreground">已删除</span>
                )}
              </label>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
