import { paymentMethodLabels, paymentMethodSchema } from '@financas/shared';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Radix Select has no empty value: "Nenhum" stands for no method.
const NONE = 'NONE';

/**
 * "Meio de pagamento" / "Meio de recebimento" (ADR 0054): the fixed list, plus "Nenhum". The value
 * is a method or '' for none. Inside `FormField`, which passes the id and the error's aria props.
 */
export function PaymentMethodSelect({
  value,
  onChange,
  id,
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  return (
    <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? '' : next)}>
      <SelectTrigger
        id={id}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className="w-full"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectItem value={NONE}>Nenhum</SelectItem>
        {paymentMethodSchema.options.map((method) => (
          <SelectItem key={method} value={method}>
            {paymentMethodLabels[method]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
