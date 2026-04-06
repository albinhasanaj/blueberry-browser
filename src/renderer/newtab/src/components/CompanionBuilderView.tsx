import React, { useEffect, useMemo, useState } from "react";
import { AssistantMessage } from "@common/components/chat";
import { cn } from "@common/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import type {
  BuilderMessage,
  BuilderPatch,
  CompanionDraft,
  CompanionToolName,
} from "../../../../shared/companionMarketplace";
import { TaskComposer } from "./TaskComposer";

/* ── Tool presets matching the runtime (tooling.ts) ── */

const ALL_TOOLS: CompanionToolName[] = [
  "read_page",
  "get_page_text",
  "find",
  "navigate",
  "screenshot",
  "open_tab",
  "javascript",
  "click",
  "type",
  "press_key",
];

const RESEARCH_SET = new Set<CompanionToolName>([
  "read_page",
  "get_page_text",
  "find",
  "navigate",
  "screenshot",
  "open_tab",
  "javascript",
]);

const INTERACTIVE_SET = new Set<CompanionToolName>(ALL_TOOLS);

const TOOL_INFO: Record<
  CompanionToolName,
  { label: string; group: "read" | "interact" }
> = {
  read_page: { label: "Read page", group: "read" },
  get_page_text: { label: "Get text", group: "read" },
  find: { label: "Find", group: "read" },
  navigate: { label: "Navigate", group: "read" },
  screenshot: { label: "Screenshot", group: "read" },
  open_tab: { label: "Open tab", group: "read" },
  javascript: { label: "JavaScript", group: "read" },
  click: { label: "Click", group: "interact" },
  type: { label: "Type", group: "interact" },
  press_key: { label: "Keys", group: "interact" },
};

type Preset = "research" | "interactive" | "custom";

function detectPreset(tools: CompanionToolName[]): Preset {
  const s = new Set(tools);
  if (
    s.size === INTERACTIVE_SET.size &&
    [...INTERACTIVE_SET].every((t) => s.has(t))
  )
    return "interactive";
  if (
    s.size === RESEARCH_SET.size &&
    [...RESEARCH_SET].every((t) => s.has(t))
  )
    return "research";
  return "custom";
}

/* ── Sub-components ── */

function BuilderThread({ messages }: { messages: BuilderMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="py-14 text-center">
        <p className="text-sm leading-6 text-white/30">
          Tell the builder what this worker should specialize in,
          <br />
          what sites it works on, and how it should behave.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-6",
            message.role === "user"
              ? "ml-auto max-w-[80%] bg-white/[0.05] text-white/80"
              : "max-w-[90%] text-white/65",
          )}
        >
          {message.role === "assistant" ? (
            <AssistantMessage content={message.content} isStreaming={false} />
          ) : (
            <div style={{ whiteSpace: "pre-wrap" }}>{message.content}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function ToolChip({
  tool,
  active,
  onToggle,
}: {
  tool: CompanionToolName;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-all",
        active
          ? "border-lime-300/20 bg-lime-300/[0.07] text-lime-200"
          : "border-white/[0.04] text-white/25 hover:border-white/[0.08] hover:text-white/45",
      )}
    >
      <span
        className={cn(
          "flex size-3.5 items-center justify-center rounded border transition-colors",
          active
            ? "border-lime-300/30 bg-lime-300/20"
            : "border-white/10 bg-white/[0.03]",
        )}
      >
        {active && <Check className="size-2.5" />}
      </span>
      {TOOL_INFO[tool].label}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5">
        <span className="text-xs font-medium text-white/55">{label}</span>
        {hint && (
          <span className="ml-2 text-[11px] text-white/25">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/* ── Props ── */

interface CompanionBuilderViewProps {
  drafts: CompanionDraft[];
  selectedDraft: CompanionDraft | null;
  builderMessages: BuilderMessage[];
  previewMessages: BuilderMessage[];
  isBuilderBusy: boolean;
  isPreviewBusy: boolean;
  isPublishing: boolean;
  statusMessage: string | null;
  onSelectDraft: (draftId: string) => void;
  onCreateDraft: () => Promise<void>;
  onBuilderSend: (message: string) => Promise<void>;
  onPreviewSend: (message: string) => Promise<void>;
  onPublish: () => Promise<void>;
  onSavePatch: (patch: BuilderPatch) => Promise<void>;
}

const INPUT =
  "mt-1 w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 text-sm text-white/85 outline-none transition-colors focus:border-white/12 focus:bg-white/[0.04] placeholder:text-white/20";

/* ── Main component ── */

export const CompanionBuilderView: React.FC<CompanionBuilderViewProps> = ({
  selectedDraft,
  builderMessages,
  isBuilderBusy,
  isPublishing,
  statusMessage,
  onBuilderSend,
  onPublish,
  onSavePatch,
}) => {
  const [showTools, setShowTools] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [form, setForm] = useState<CompanionDraft | null>(selectedDraft);

  useEffect(() => {
    setForm(selectedDraft);
  }, [selectedDraft]);

  const tagValue = useMemo(() => form?.tags.join(", ") ?? "", [form?.tags]);
  const starterValue = useMemo(
    () => form?.conversationStarters.join("\n") ?? "",
    [form?.conversationStarters],
  );

  const activePreset = useMemo(
    () => (form ? detectPreset(form.tools) : "research"),
    [form?.tools],
  );

  const commitPatch = async (patch: BuilderPatch): Promise<void> => {
    if (!selectedDraft) return;
    await onSavePatch(patch);
  };

  const toggleTool = async (tool: CompanionToolName): Promise<void> => {
    if (!form) return;
    const next = form.tools.includes(tool)
      ? form.tools.filter((t) => t !== tool)
      : [...form.tools, tool];
    setForm({ ...form, tools: next });
    await commitPatch({ tools: next });
  };

  const applyPreset = async (preset: Preset): Promise<void> => {
    if (!form) return;
    if (preset === "custom") return; // just opens the tools, no change
    const tools = [...(preset === "interactive" ? INTERACTIVE_SET : RESEARCH_SET)];
    const toolProfile = preset;
    setForm({ ...form, tools, toolProfile });
    await commitPatch({ tools, toolProfile });
  };

  const readTools = ALL_TOOLS.filter((t) => TOOL_INFO[t].group === "read");
  const interactTools = ALL_TOOLS.filter(
    (t) => TOOL_INFO[t].group === "interact",
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[620px] px-6 pb-16 pt-14">
        {/* Header */}
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#f5f1e9]">
              New worker companion
            </h1>
            <p className="mt-1.5 text-sm text-white/35">
              A specialist the orchestrator can delegate browser tasks to.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {statusMessage && (
              <span className="text-xs text-white/40">{statusMessage}</span>
            )}
            <button
              type="button"
              onClick={() => void onPublish()}
              disabled={!selectedDraft || isPublishing}
              className="rounded-full bg-lime-300 px-4 py-2 text-[13px] font-medium text-[#1c2611] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPublishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>

        {/* Builder conversation */}
        <div className="mt-10">
          <BuilderThread messages={builderMessages} />
        </div>

        <div className="mt-6">
          <TaskComposer
            disabled={isBuilderBusy}
            onSend={onBuilderSend}
            placeholder="e.g. A companion that researches SaaS pricing pages and extracts plan details..."
          />
        </div>

        {/* ── Collapsible sections ── */}
        {selectedDraft && form && (
          <>
            <div className="mt-10 border-t border-white/[0.04] pt-5">
              <button
                type="button"
                onClick={() => setShowTools((v) => !v)}
                className="flex items-center gap-2 text-xs font-medium text-white/35 transition-colors hover:text-white/55"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    showTools && "rotate-180",
                  )}
                />
                Browser tools
              </button>

              {showTools && (
              <div className="mt-3">
              {/* Presets */}
              <div className="flex gap-2">
                {(
                  [
                    { key: "research", label: "Research", desc: "Read-only browsing" },
                    { key: "interactive", label: "Interactive", desc: "Can click & type" },
                    { key: "custom", label: "Custom", desc: "Pick individually" },
                  ] as const
                ).map(({ key, label, desc }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => void applyPreset(key)}
                    className={cn(
                      "flex-1 rounded-xl border px-3 py-2.5 text-left transition-all",
                      activePreset === key
                        ? "border-lime-300/15 bg-lime-300/[0.04]"
                        : "border-white/[0.04] hover:border-white/[0.08]",
                    )}
                  >
                    <span
                      className={cn(
                        "block text-[13px] font-medium",
                        activePreset === key
                          ? "text-lime-200"
                          : "text-white/50",
                      )}
                    >
                      {label}
                    </span>
                    <span className="block text-[11px] text-white/25">
                      {desc}
                    </span>
                  </button>
                ))}
              </div>

              {/* Individual tool toggles */}
              <div className="mt-4 space-y-2.5">
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/20">
                    Read
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {readTools.map((tool) => (
                      <ToolChip
                        key={tool}
                        tool={tool}
                        active={form.tools.includes(tool)}
                        onToggle={() => void toggleTool(tool)}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1.5 text-[10px] uppercase tracking-wider text-white/20">
                    Interact
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {interactTools.map((tool) => (
                      <ToolChip
                        key={tool}
                        tool={tool}
                        active={form.tools.includes(tool)}
                        onToggle={() => void toggleTool(tool)}
                      />
                    ))}
                  </div>
                </div>
              </div>
              </div>
              )}
            </div>

            {/* ── Collapsible details ── */}
            <div className="mt-4 border-t border-white/[0.04] pt-5">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                className="flex items-center gap-2 text-xs font-medium text-white/35 transition-colors hover:text-white/55"
              >
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    showDetails && "rotate-180",
                  )}
                />
                Identity, instructions & tuning
              </button>

              {showDetails && (
                <div className="mt-5 space-y-5">
                  {/* Identity */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" hint="Roster display name">
                      <input
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                        onBlur={() => void commitPatch({ name: form.name })}
                        placeholder="e.g. PricingBot"
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Description" hint="One-liner">
                      <input
                        value={form.description}
                        onChange={(e) =>
                          setForm({ ...form, description: e.target.value })
                        }
                        onBlur={() =>
                          void commitPatch({ description: form.description })
                        }
                        placeholder="e.g. Extracts SaaS pricing tiers"
                        className={INPUT}
                      />
                    </Field>
                  </div>

                  {/* Role */}
                  <Field label="Best for" hint="When should the orchestrator pick this worker?">
                    <textarea
                      value={form.bestFor}
                      onChange={(e) =>
                        setForm({ ...form, bestFor: e.target.value })
                      }
                      onBlur={() =>
                        void commitPatch({ bestFor: form.bestFor })
                      }
                      rows={2}
                      placeholder="e.g. Pricing page analysis, plan comparison, feature matrix extraction"
                      className={INPUT + " resize-none"}
                    />
                  </Field>

                  <Field label="Instructions" hint="System prompt — behavior, strategy, output">
                    <textarea
                      value={form.instructions}
                      onChange={(e) =>
                        setForm({ ...form, instructions: e.target.value })
                      }
                      onBlur={() =>
                        void commitPatch({ instructions: form.instructions })
                      }
                      rows={6}
                      placeholder="You are a pricing research specialist..."
                      className={INPUT + " resize-none leading-6"}
                    />
                  </Field>

                  {/* Tags & starters */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Tags" hint="Comma-separated">
                      <input
                        value={tagValue}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            tags: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        onBlur={() => void commitPatch({ tags: form.tags })}
                        placeholder="pricing, saas, extraction"
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Starters" hint="One per line">
                      <textarea
                        value={starterValue}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            conversationStarters: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        onBlur={() =>
                          void commitPatch({
                            conversationStarters: form.conversationStarters,
                          })
                        }
                        rows={2}
                        className={INPUT + " resize-none leading-6"}
                      />
                    </Field>
                  </div>

                  {/* Execution tuning */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Temperature" hint="0 = focused, 1 = creative">
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.temperature}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            temperature: Number(e.target.value),
                          })
                        }
                        onBlur={() =>
                          void commitPatch({ temperature: form.temperature })
                        }
                        className={INPUT}
                      />
                    </Field>
                    <Field label="Max steps" hint="Browser actions before stop">
                      <input
                        type="number"
                        min={10}
                        max={250}
                        step={5}
                        value={form.maxSteps}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            maxSteps: Number(e.target.value),
                          })
                        }
                        onBlur={() =>
                          void commitPatch({ maxSteps: form.maxSteps })
                        }
                        className={INPUT}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
