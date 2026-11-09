/* ==========================================================================
   Reparo — Sistema de diseño (`import { … } from '@/ui'`)
   ========================================================================== */

// Acciones
export { Button, IconButton, type ButtonProps, type IconButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Spinner, type SpinnerProps } from './Spinner';
export { Kbd, KbdGroup, type KbdProps } from './Kbd';
export { Tooltip, type TooltipProps } from './Tooltip';
export { DropdownMenu, type DropdownMenuProps, type MenuItem } from './DropdownMenu';
export { Popover, FloatingPanel, type PopoverProps, type FloatingPanelProps } from './Popover';

// Formularios
export { Field, type FieldProps } from './Field';
export { Input, setNativeValue, type InputProps } from './Input';
export { Textarea, type TextareaProps } from './Textarea';
export { MoneyInput, type MoneyInputProps } from './MoneyInput';
export { NumberStepper, type NumberStepperProps } from './NumberStepper';
export { Select, type SelectProps, type SelectOption } from './Select';
export { Combobox, type ComboboxProps, type ComboboxOption } from './Combobox';
export { DateTimeInput, formatDateTimeLabel, type DateTimeInputProps } from './DateTimeInput';
export { Calendar, type CalendarProps } from './Calendar';
export { SegmentedControl, type SegmentedControlProps, type SegmentOption } from './SegmentedControl';
export { Tabs, tabPanelProps, type TabsProps, type TabItem } from './Tabs';
export { Switch, type SwitchProps } from './Switch';
export { Checkbox, type CheckboxProps } from './Checkbox';
export { RadioCards, type RadioCardsProps, type RadioCardOption } from './RadioCards';
export { SearchField, type SearchFieldProps } from './SearchField';
export { FilterChips, type FilterChipsProps, type FilterChipOption } from './FilterChips';
export { FormGrid, FormSection, type FormGridProps, type FormSectionProps } from './Form';

// Datos y visualización
export { Badge, StatusBadge, type BadgeProps, type BadgeTone, type StatusBadgeProps } from './Badge';
export { Card, type CardProps } from './Card';
export { KpiCard, formatDelta, type KpiCardProps, type KpiTone } from './KpiCard';
export { AnimatedNumber, type AnimatedNumberProps } from './AnimatedNumber';
export { MoneyText, type MoneyTextProps, type MoneyTone } from './MoneyText';
export { DateTimeText, fullDateTime, type DateTimeTextProps, type DateTimeVariant } from './DateTimeText';
export { DataTable, type DataTableProps, type Column, type SortState, type SortDir } from './DataTable';
export { ProgressBar, type ProgressBarProps } from './ProgressBar';
export { Avatar, type AvatarProps } from './Avatar';
export { Highlight, type HighlightProps } from './Highlight';

// Estructura
export { PageHeader, type PageHeaderProps, type Crumb } from './PageHeader';
export { Section, type SectionProps } from './Section';
export { Toolbar, ToolbarSpacer, type ToolbarProps } from './Toolbar';
export { Divider, type DividerProps } from './Divider';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Skeleton, type SkeletonProps } from './Skeleton';

// Capas
export { Sheet, SHEET_SIDE_QUERY, type SheetProps } from './Sheet';
export { Dialog, type DialogProps, type DialogTone } from './Dialog';
export { confirm, type ConfirmOptions } from './confirm';
export { Toaster } from './Toaster';
export { toast, type ToastOptions, type ToastTone } from './toast';
export { Portal } from './Portal';

// Utilidades y hooks
export { cx, fold, splitMatches, initials, isTypingTarget, MOD_KEY_LABEL, isApple } from './utils';
export {
  useMediaQuery,
  useIsMobile,
  usePrefersReducedMotion,
  useNow,
  useHotkey,
  useControllable,
  useScrollLock,
  useLocalState,
  readLocal,
  writeLocal,
  MOBILE_QUERY,
} from './hooks';
export { useFocusTrap } from './focusTrap';
export { useLayer, hasOpenLayer } from './layers';
export { focusSlashTarget, registerSlashTarget } from './slashTarget';
