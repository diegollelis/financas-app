import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';

/**
 * A choice between a few options as large segments, instead of small radio dots: 44px targets
 * on the phone (ADR 0036). It is a radio group: arrows move between options, and each option is
 * a `radio` with its label as the accessible name.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  /** Accessible name of the group (e.g. "Tipo"); the segments' own text names each option. */
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <RadioGroupPrimitive.Root
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const option = options.find((item) => item.value === next);
        if (option) onChange(option.value);
      }}
      className="bg-muted grid auto-cols-fr grid-flow-col gap-1 rounded-lg p-1"
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          className="text-muted-foreground focus-visible:ring-ring/50 data-[state=checked]:bg-background data-[state=checked]:text-foreground h-11 rounded-md px-2 font-medium outline-none focus-visible:ring-3 data-[state=checked]:shadow-sm md:h-8"
        >
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
