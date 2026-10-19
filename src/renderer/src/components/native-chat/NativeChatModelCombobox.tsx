import { useRef } from 'react'
import { Check } from 'lucide-react'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { translate } from '@/i18n/i18n'
import type { SessionOptionSelectChoice } from '../../../../shared/native-chat-session-options'
import { nativeChatSessionChoiceLabel } from './native-chat-session-option-labels'
import { NativeChatSessionOptionChoiceBody } from './NativeChatSessionOptionChoiceBody'
import { NativeChatSessionOptionWriteGroup } from './NativeChatSessionOptionWriteGroup'

type NativeChatModelComboboxProps = {
  choices: readonly SessionOptionSelectChoice[]
  currentValue: string | undefined
  /** Choices stay listed and searchable, but cannot be picked. */
  readOnly: boolean
  readOnlyReason: string | null
  /** A write is in flight; the rows take no pick until it settles, and the search stays usable. */
  busy: boolean
  /** Called for a model other than the current one; the list stays as it is. */
  onSelect: (value: string) => void
}

// Why not cmdk's scorer: it matches scattered letters and reorders the host's list.
function modelChoiceFilter(value: string, search: string, keywords?: string[]): number {
  const haystack = [value, ...(keywords ?? [])].join(' ').toLowerCase()
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean)
  return terms.every((term) => haystack.includes(term)) ? 1 : 0
}

/** The searchable model list of the session picker. */
export function NativeChatModelCombobox({
  choices,
  currentValue,
  readOnly,
  readOnlyReason,
  busy,
  onSelect
}: NativeChatModelComboboxProps): React.JSX.Element {
  const searchLabel = translate('components.native-chat.composer.searchModels', 'Search models…')
  const search = useRef<HTMLInputElement>(null)
  const groups = new Map<
    string,
    { provider?: SessionOptionSelectChoice['provider']; choices: SessionOptionSelectChoice[] }
  >()
  for (const choice of choices) {
    const key = choice.provider?.id ?? ''
    const group = groups.get(key)
    if (group) {
      group.choices.push(choice)
    } else {
      groups.set(key, { provider: choice.provider, choices: [choice] })
    }
  }
  return (
    <Command
      surface="inline"
      density="menu"
      label={searchLabel}
      filter={modelChoiceFilter}
      defaultValue={currentValue}
    >
      <CommandInput ref={search} placeholder={searchLabel} />
      {readOnly && readOnlyReason ? (
        <div className="px-3 py-1.5 text-xs text-muted-foreground">{readOnlyReason}</div>
      ) : null}
      <CommandList
        animateHeight
        // Why here as well: cmdk writes aria-disabled="false" on every row, which outranks the
        // group's, so the list itself is what tells assistive tech the rows are waiting.
        aria-busy={busy}
        // Why: a row is not a focus target. The search takes focus instead, so typing still filters
        // after a click and focus is never left on an option the picked model switches off or removes.
        onMouseDown={(event) => {
          event.preventDefault()
          search.current?.focus()
        }}
      >
        <CommandEmpty>
          {translate(
            'components.native-chat.composer.noModelsMatch',
            'No models match your search.'
          )}
        </CommandEmpty>
        <NativeChatSessionOptionWriteGroup busy={busy}>
          {[...groups.entries()].map(([id, group]) => (
            <CommandGroup key={id} heading={group.provider?.label}>
              {group.choices.map((choice) => {
                const label = nativeChatSessionChoiceLabel(choice)
                const current = choice.value === currentValue
                return (
                  <CommandItem
                    key={choice.value}
                    value={choice.value}
                    keywords={[label, choice.description ?? '', group.provider?.label ?? '']}
                    selection="palette"
                    disabled={readOnly}
                    aria-current={current || undefined}
                    onSelect={() => {
                      if (!current) {
                        onSelect(choice.value)
                      }
                    }}
                  >
                    <NativeChatSessionOptionChoiceBody
                      label={label}
                      description={choice.description}
                    />
                    {/* Why always there: a row that gains the check must not re-wrap its text while
                    the picker is open. */}
                    <span className="ml-auto flex size-3.5 shrink-0 items-center justify-center">
                      {current ? <Check className="size-3.5 text-muted-foreground" /> : null}
                    </span>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          ))}
        </NativeChatSessionOptionWriteGroup>
      </CommandList>
    </Command>
  )
}
