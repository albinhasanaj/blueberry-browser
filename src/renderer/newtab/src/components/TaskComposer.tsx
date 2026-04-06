import React, { useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Plus } from "lucide-react";

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
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    if (!textareaRef.current) return;

    textareaRef.current.style.height = `${MIN_HEIGHT}px`;
    textareaRef.current.style.height = `${Math.min(
      textareaRef.current.scrollHeight,
      MAX_HEIGHT,
    )}px`;
  }, [value]);

  const submit = async (): Promise<void> => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    await onSend(trimmed);
    setValue("");

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
        placeholder={placeholder}
        rows={1}
        className="min-h-[24px] w-full resize-none bg-transparent text-base leading-7 text-[#f4eee4] outline-none placeholder:text-white/40"
      />

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          className="flex size-8 items-center justify-center rounded-full text-white/78 transition-colors hover:bg-white/[0.06]"
        >
          <Plus className="size-4" />
        </button>

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
