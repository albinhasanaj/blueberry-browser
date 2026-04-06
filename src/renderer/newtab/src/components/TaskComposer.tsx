import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Bot, Plus, X } from "lucide-react";

interface TaskComposerProps {
  disabled: boolean;
  onSend: (message: string) => Promise<void>;
  placeholder: string;
}

const MIN_HEIGHT = 24;
const MAX_HEIGHT = 140;

export const TaskComposer: React.FC<TaskComposerProps> = ({
  disabled,
  onSend,
  placeholder,
}) => {
  const [value, setValue] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [companionMode, setCompanionMode] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = `${MIN_HEIGHT}px`;
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      MAX_HEIGHT,
    )}px`;
  }, [value]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const submit = async (): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    const message = companionMode ? `[BUILD_COMPANION] ${trimmed}` : trimmed;
    await onSend(message);
    setValue("");
    if (companionMode) setCompanionMode(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = `${MIN_HEIGHT}px`;
    }
  };

  return (
    <div className="rounded-[24px] border border-white/10 bg-[#2a2928] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={
          companionMode
            ? "Describe the companion you want to build..."
            : placeholder
        }
        rows={1}
        disabled={disabled}
        className="min-h-[24px] w-full resize-none bg-transparent text-base leading-7 text-[#f4eee4] outline-none placeholder:text-white/40 disabled:opacity-50"
      />

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              disabled={disabled}
              className="flex size-8 items-center justify-center rounded-full text-white/78 transition-colors hover:bg-white/[0.06] disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>

            {menuOpen && (
              <div className="absolute bottom-10 left-0 z-30 min-w-[200px] rounded-xl border border-white/10 bg-[#2a2928] p-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.5)]">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setCompanionMode(true);
                    textareaRef.current?.focus();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-white/85 transition-colors hover:bg-white/[0.06]"
                >
                  <Bot className="size-4 text-lime-300/80" />
                  Build companion
                </button>
              </div>
            )}
          </div>

          {companionMode && (
            <button
              type="button"
              onClick={() => setCompanionMode(false)}
              className="flex items-center gap-1.5 rounded-full bg-lime-300/[0.12] px-2.5 py-1 text-xs font-medium text-lime-300 transition-colors hover:bg-lime-300/[0.18]"
            >
              <Bot className="size-3.5" />
              Build companion
              <X className="size-3 text-lime-300/60" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || !value.trim()}
          className="flex size-8 items-center justify-center rounded-full bg-lime-300 text-[#1c2611] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
};
