// Vendored coss design-system primitives (Base UI + Tailwind v4), scoped to the
// dev portal. Public site keeps its shadcn/Radix components in @/components/ui.
// Source: github.com/cosscom/coss (MIT). Imports rewritten to this repo.

export { Button, buttonVariants, type ButtonProps } from "./button";
export { Badge, badgeVariants, type BadgeProps } from "./badge";
export { Spinner } from "./spinner";
export { Input, InputPrimitive, type InputProps } from "./input";
export { Textarea, type TextareaProps } from "./textarea";
export { Label } from "./label";
export { Checkbox, CheckboxPrimitive } from "./checkbox";
export { Separator, SeparatorPrimitive } from "./separator";
export { Skeleton } from "./skeleton";
export { Kbd, KbdGroup } from "./kbd";

export {
  Card,
  CardFrame,
  CardFrameHeader,
  CardFrameTitle,
  CardFrameDescription,
  CardFrameAction,
  CardFrameFooter,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardPanel,
  CardContent,
  CardFooter,
} from "./card";

export {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "./empty";

export {
  Field,
  FieldLabel,
  FieldItem,
  FieldDescription,
  FieldError,
  FieldControl,
  FieldValidity,
  FieldPrimitive,
} from "./field";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  type TableVariant,
  type TableProps,
} from "./table";

export {
  Tabs,
  TabsList,
  TabsTab,
  TabsPanel,
  TabsTrigger,
  TabsContent,
  TabsPrimitive,
  type TabsVariant,
} from "./tabs";

export {
  Select,
  SelectButton,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectGroup,
  SelectLabel,
  SelectGroupLabel,
  SelectPrimitive,
  selectTriggerVariants,
  selectTriggerIconClassName,
} from "./select";

export {
  Dialog,
  DialogPortal,
  DialogTrigger,
  DialogClose,
  DialogBackdrop,
  DialogViewport,
  DialogPopup,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogOverlay,
  DialogContent,
  DialogCreateHandle,
  DialogPrimitive,
} from "./dialog";

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogTrigger,
  AlertDialogBackdrop,
  AlertDialogViewport,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogCreateHandle,
  AlertDialogPrimitive,
} from "./alert-dialog";

export {
  Menu,
  MenuPortal,
  MenuTrigger,
  MenuPopup,
  MenuGroup,
  MenuItem,
  MenuLinkItem,
  MenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroupLabel,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  MenuCreateHandle,
  MenuPrimitive,
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuCreateHandle,
} from "./menu";

export {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
  TooltipContent,
  TooltipCreateHandle,
  TooltipPrimitive,
} from "./tooltip";

export { ScrollArea, ScrollBar, ScrollAreaPrimitive } from "./scroll-area";
