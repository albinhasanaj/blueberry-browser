import React, { useState, useRef, useEffect } from "react";
import { ArrowUp } from "lucide-react";
import { cn } from "../../lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  placeholder?: string;
  /** Compact = no border/shadow, for embedding in landing pages */
  variant?: "default" | "compact";
}

export const ChatInput: React.FC<ChatInputProps> = ({
  onSend,
  disabled,
  placeholder = "Send a message...",
  variant = "default",
}) => {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [value]);

  const handleSubmit = () => {
    if (value.trim() && !disabled) {
      onSend(value.trim());
      setValue("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "24px";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className={cn(
        "w-full rounded-3xl outline-none transition-all duration-200",
        variant === "default" && [
          "border p-3 bg-background dark:bg-secondary shadow-chat animate-spring-scale",
          isFocused
            ? "border-primary/20 dark:border-primary/30"
            : "border-border",
        ],
        variant === "compact" && "p-3",
      )}
    >
      <div className="w-full px-3 py-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full resize-none outline-none bg-transparent 
            text-foreground placeholder:text-muted-foreground
            min-h-[24px] max-h-[200px]"
          rows={1}
          style={{ lineHeight: "24px" }}
        />
      </div>

      <div className="w-full flex items-center gap-1.5 px-1 mt-2 mb-1">
        <div className="flex-1" />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className={cn(
            "size-9 rounded-full flex items-center justify-center",
            "transition-all duration-200",
            "bg-primary text-primary-foreground",
            "hover:opacity-80 disabled:opacity-50",
          )}
        >
          <ArrowUp className="size-5" />
        </button>
      </div>
    </div>
  );
};
