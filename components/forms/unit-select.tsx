"use client";

import { useState } from "react";

import { SELECT_CLASS } from "@/components/forms/form-classes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const OTHER_VALUE = "__other__";

export function UnitSelect({
  id,
  label,
  options,
  value,
  onChange,
  onBlur,
  error,
  placeholder = "Select a unit…",
  disabled,
  className,
}: {
  id: string;
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const isListed = options.includes(value);
  const [otherChosen, setOtherChosen] = useState(value !== "" && !isListed);
  const [emittedValue, setEmittedValue] = useState(value);
  const [previousValue, setPreviousValue] = useState(value);

  // Values set from outside (quick-pick defaults, form reset) decide the mode again.
  if (value !== previousValue) {
    setPreviousValue(value);
    if (value !== emittedValue) setOtherChosen(value !== "" && !isListed);
  }

  const isOther = otherChosen || (value !== "" && !isListed);
  const errorId = `${id}-error`;
  const otherId = `${id}-other`;

  const emit = (next: string) => {
    setEmittedValue(next);
    onChange(next);
  };

  return (
    <div className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={SELECT_CLASS}
        value={isOther ? OTHER_VALUE : value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onBlur={onBlur}
        onChange={(event) => {
          const next = event.target.value;
          if (next === OTHER_VALUE) {
            setOtherChosen(true);
            emit(isListed ? "" : value);
          } else {
            setOtherChosen(false);
            emit(next);
          }
        }}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        <option value={OTHER_VALUE}>Other</option>
      </select>
      {isOther && (
        <>
          <Label htmlFor={otherId} className="text-xs text-muted-foreground">
            Other {label.toLowerCase()}
          </Label>
          <Input
            id={otherId}
            maxLength={50}
            value={value}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onBlur={onBlur}
            onChange={(event) => emit(event.target.value)}
          />
        </>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
