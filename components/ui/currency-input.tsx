"use client";

import { Input } from "@/components/ui/input";

// Formats a raw numeric string with thousand separators while typing
// ("10000" displays as "10,000"), while the value/onChange contract stays
// a plain numeric string underneath — so callers can keep doing
// `parseFloat(value)` exactly as before.
function formatWithCommas(raw: string): string {
  if (!raw) return "";
  const [intPart, decPart] = raw.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
}

interface CurrencyInputProps {
  value: string;
  onChange: (raw: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  id?: string;
}

export function CurrencyInput({
  value,
  onChange,
  placeholder,
  className,
  autoFocus,
  id,
}: CurrencyInputProps) {
  return (
    <Input
      id={id}
      type="text"
      inputMode="decimal"
      placeholder={placeholder}
      autoFocus={autoFocus}
      className={className}
      value={formatWithCommas(value)}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, "").replace(/[^0-9.]/g, "");
        onChange(raw);
      }}
    />
  );
}
