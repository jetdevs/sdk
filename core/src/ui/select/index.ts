/**
 * THE searchable dropdown (p90, 2026-09-27) — one compact picker for every
 * app: a type-to-filter box once the list has 8+ rows, sticky group headers,
 * full keyboard + ARIA combobox/listbox. Brand-agnostic; theme tokens only.
 *
 *   import { createSearchableSelect } from '@jetdevs/core/ui/select';
 *   import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
 *
 *   export const SearchableSelect = createSearchableSelect({ Popover, PopoverTrigger, PopoverContent });
 *
 *   <SearchableSelect value={v} onValueChange={setV}
 *     groups={[{ id: 'teams', label: 'Teams', options: [...] }]} />
 *
 * Consumers must let Tailwind scan this directory (source under `link:`,
 * `dist/ui/select` when installed) or the classes are purged.
 */

export {
  SEARCHABLE_SELECT_SEARCH_THRESHOLD,
  countSearchableOptions,
  createSearchableSelect,
  filterSearchableGroups,
  type SearchableSelectGroup,
  type SearchableSelectOption,
  type SearchableSelectProps,
  type SearchableSelectUIComponents,
} from './SearchableSelect';
