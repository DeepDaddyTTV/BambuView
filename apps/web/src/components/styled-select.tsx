import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export interface StyledSelectOption<TValue extends string> {
  description?: string;
  label: string;
  value: TValue;
}

export function StyledSelect<TValue extends string>({
  disabled = false,
  onChange,
  options,
  placeholder = "Select",
  value,
}: {
  disabled?: boolean;
  onChange: (next: TValue) => void;
  options: Array<StyledSelectOption<TValue>>;
  placeholder?: string;
  value: TValue | "";
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function moveSelection(direction: 1 | -1) {
    const currentIndex = Math.max(
      0,
      options.findIndex((option) => option.value === value),
    );
    const nextIndex =
      (currentIndex + direction + options.length) % options.length;
    const next = options[nextIndex];
    if (next) {
      onChange(next.value);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      moveSelection(1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      moveSelection(-1);
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="styled-select" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="styled-select__button"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
        type="button"
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div className="styled-select__menu" role="listbox">
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={`styled-select__option ${
                option.value === value ? "styled-select__option--active" : ""
              }`}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              role="option"
              type="button"
            >
              <span>{option.label}</span>
              {option.description ? <small>{option.description}</small> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
