import React, { useEffect, useMemo, useState } from "react";
import { AssistantMessage } from "@common/components/chat";
import { cn } from "@common/lib/utils";
import { AlertCircle, ArrowUpRight, Bot } from "lucide-react";
import type {
  BuilderMessage,
  BuilderPatch,
  CompanionDraft,
  CompanionToolName,
} from "../../../../shared/companionMarketplace";
import { TaskComposer } from "./TaskComposer";

type BuilderTab = "create" | "configure";

function BuilderThread({
  messages,
  emptyLabel,
}: {
  messages: BuilderMessage[];
  emptyLabel: string;
}) {
  if (messages.length === 0) {
    return (
      <div className="rounded-[22px] border border-dashed border-white/10 bg-black/[0.10] px-5 py-6 text-sm leading-6 text-white/46">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            "rounded-[24px] px-5 py-4 text-sm leading-6",
            message.role === "user"
              ? "ml-auto max-w-[86%] bg-black/[0.12] text-white/86"
              : "max-w-[90%] border border-white/8 bg-white/[0.03] text-white/78",
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

function SectionLabel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/36">
        {title}
      </div>
      {description && (
        <div className="mt-1 text-xs leading-5 text-white/38">{description}</div>
      )}
    </div>
  );
}

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

const TOOL_TOGGLES: Array<{
  tool: CompanionToolName;
  label: string;
  description: string;
}> = [
  {
    tool: "click",
    label: "Click",
    description: "Allow the companion to click buttons and links.",
  },
  {
    tool: "type",
    label: "Type",
    description: "Allow the companion to type into inputs and textareas.",
  },
  {
    tool: "press_key",
    label: "Press keys",
    description: "Allow keyboard-style interactions like Enter or Escape.",
  },
];

export const CompanionBuilderView: React.FC<CompanionBuilderViewProps> = ({
  drafts,
  selectedDraft,
  builderMessages,
  previewMessages,
  isBuilderBusy,
  isPreviewBusy,
  isPublishing,
  statusMessage,
  onSelectDraft,
  onCreateDraft,
  onBuilderSend,
  onPreviewSend,
  onPublish,
  onSavePatch,
}) => {
  const [activeTab, setActiveTab] = useState<BuilderTab>("create");
  const [form, setForm] = useState<CompanionDraft | null>(selectedDraft);

  useEffect(() => {
    setForm(selectedDraft);
  }, [selectedDraft]);

  const tagValue = useMemo(() => form?.tags.join(", ") ?? "", [form?.tags]);
  const starterValue = useMemo(
    () => form?.conversationStarters.join("\n") ?? "",
    [form?.conversationStarters],
  );

  const commitPatch = async (patch: BuilderPatch): Promise<void> => {
    if (!selectedDraft) return;
    await onSavePatch(patch);
  };

  const toggleTool = async (tool: CompanionToolName): Promise<void> => {
    if (!form) return;

    const nextTools = form.tools.includes(tool)
      ? form.tools.filter((value) => value !== tool)
      : [...form.tools, tool];
    setForm({ ...form, tools: nextTools });
    await commitPatch({ tools: nextTools });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1240px] px-8 pb-10 pt-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/38">
              Companion Builder
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[#f5f1e9]">
              Create, configure, and publish a local companion.
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {statusMessage && (
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/[0.12] px-4 py-2 text-xs text-white/56">
                <AlertCircle className="size-3.5" />
                {statusMessage}
              </div>
            )}
            <button
              type="button"
              onClick={() => void onPublish()}
              disabled={!selectedDraft || isPublishing}
              className="rounded-full bg-lime-300 px-5 py-3 text-sm font-medium text-[#1c2611] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPublishing ? "Publishing..." : "Publish"}
            </button>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {drafts.map((draft) => (
            <button
              key={draft.id}
              type="button"
              onClick={() => onSelectDraft(draft.id)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm transition-colors",
                selectedDraft?.id === draft.id
                  ? "border-lime-300/35 bg-lime-300/[0.10] text-lime-100"
                  : "border-white/8 bg-white/[0.03] text-white/58 hover:text-white/88",
              )}
            >
              {draft.name.trim() || "Untitled draft"}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void onCreateDraft()}
            className="rounded-full border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-white/72 transition-colors hover:bg-white/[0.05]"
          >
            New draft
          </button>
        </div>

        {selectedDraft && form ? (
          <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,460px)]">
            <section className="rounded-[32px] border border-white/8 bg-[#2e2d2b] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between gap-4 border-b border-white/8 pb-5">
                <div className="inline-flex rounded-[18px] bg-black/[0.16] p-1">
                  {(["create", "configure"] as BuilderTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "rounded-[14px] px-6 py-2.5 text-sm font-medium transition-colors",
                        activeTab === tab
                          ? "bg-white/[0.08] text-white"
                          : "text-white/46 hover:text-white/80",
                      )}
                    >
                      {tab === "create" ? "Create" : "Configure"}
                    </button>
                  ))}
                </div>

                <div className="inline-flex items-center gap-3 rounded-[20px] border border-white/8 bg-black/[0.14] px-4 py-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl border border-white/8 bg-[#262523] text-xs font-semibold tracking-[0.16em] text-[#f5f1e9]">
                    {selectedDraft.avatarLabel}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white/90">
                      {selectedDraft.name.trim() || "Untitled draft"}
                    </div>
                    <div className="text-xs text-white/40">
                      {selectedDraft.status}
                    </div>
                  </div>
                </div>
              </div>

              {activeTab === "create" ? (
                <div className="mt-6">
                  <BuilderThread
                    messages={builderMessages}
                    emptyLabel="Describe the companion you want to make. The builder will turn that into instructions, positioning, and configuration."
                  />

                  <div className="mt-6">
                    <TaskComposer
                      disabled={isBuilderBusy}
                      onSend={onBuilderSend}
                      placeholder="Describe the companion you want to build..."
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-6 grid gap-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <SectionLabel title="Name" />
                      <input
                        value={form.name}
                        onChange={(event) =>
                          setForm({ ...form, name: event.target.value })
                        }
                        onBlur={() => void commitPatch({ name: form.name })}
                        className="mt-2 w-full rounded-[18px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm text-white/90 outline-none"
                      />
                    </div>
                    <div>
                      <SectionLabel title="Description" />
                      <input
                        value={form.description}
                        onChange={(event) =>
                          setForm({ ...form, description: event.target.value })
                        }
                        onBlur={() =>
                          void commitPatch({ description: form.description })
                        }
                        className="mt-2 w-full rounded-[18px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm text-white/90 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <SectionLabel
                      title="Best For"
                      description="A short summary the orchestrator and marketplace can search against."
                    />
                    <textarea
                      value={form.bestFor}
                      onChange={(event) =>
                        setForm({ ...form, bestFor: event.target.value })
                      }
                      onBlur={() => void commitPatch({ bestFor: form.bestFor })}
                      rows={3}
                      className="mt-2 w-full rounded-[20px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm leading-6 text-white/90 outline-none"
                    />
                  </div>

                  <div>
                    <SectionLabel title="Instructions" />
                    <textarea
                      value={form.instructions}
                      onChange={(event) =>
                        setForm({ ...form, instructions: event.target.value })
                      }
                      onBlur={() =>
                        void commitPatch({ instructions: form.instructions })
                      }
                      rows={9}
                      className="mt-2 w-full rounded-[22px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm leading-6 text-white/90 outline-none"
                    />
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <SectionLabel title="Tags" description="Comma-separated keywords." />
                      <input
                        value={tagValue}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            tags: event.target.value
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                        onBlur={() => void commitPatch({ tags: form.tags })}
                        className="mt-2 w-full rounded-[18px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm text-white/90 outline-none"
                      />
                    </div>
                    <div>
                      <SectionLabel
                        title="Conversation Starters"
                        description="One per line."
                      />
                      <textarea
                        value={starterValue}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            conversationStarters: event.target.value
                              .split("\n")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                        onBlur={() =>
                          void commitPatch({
                            conversationStarters: form.conversationStarters,
                          })
                        }
                        rows={4}
                        className="mt-2 w-full rounded-[18px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm leading-6 text-white/90 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-3">
                    <div>
                      <SectionLabel title="Tool Profile" />
                      <select
                        value={form.toolProfile}
                        onChange={(event) => {
                          const toolProfile = event.target.value as CompanionDraft["toolProfile"];
                          setForm({
                            ...form,
                            toolProfile,
                          });
                          void commitPatch({ toolProfile });
                        }}
                        className="mt-2 w-full rounded-[18px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm text-white/90 outline-none"
                      >
                        <option value="research">Research</option>
                        <option value="interactive">Interactive</option>
                      </select>
                    </div>
                    <div>
                      <SectionLabel title="Temperature" />
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.temperature}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            temperature: Number(event.target.value),
                          })
                        }
                        onBlur={() =>
                          void commitPatch({ temperature: form.temperature })
                        }
                        className="mt-2 w-full rounded-[18px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm text-white/90 outline-none"
                      />
                    </div>
                    <div>
                      <SectionLabel title="Max Steps" />
                      <input
                        type="number"
                        min={10}
                        max={250}
                        step={5}
                        value={form.maxSteps}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            maxSteps: Number(event.target.value),
                          })
                        }
                        onBlur={() => void commitPatch({ maxSteps: form.maxSteps })}
                        className="mt-2 w-full rounded-[18px] border border-white/10 bg-black/[0.12] px-4 py-3 text-sm text-white/90 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <SectionLabel
                      title="Advanced Tool Toggles"
                      description="Add direct interaction only when the companion truly needs it."
                    />
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      {TOOL_TOGGLES.map((toggle) => (
                        <label
                          key={toggle.tool}
                          className="flex items-start gap-3 rounded-[18px] border border-white/8 bg-black/[0.10] px-4 py-4"
                        >
                          <input
                            type="checkbox"
                            checked={form.tools.includes(toggle.tool)}
                            onChange={() => void toggleTool(toggle.tool)}
                            className="mt-1"
                          />
                          <div>
                            <div className="text-sm font-medium text-white/82">
                              {toggle.label}
                            </div>
                            <div className="mt-1 text-xs leading-5 text-white/42">
                              {toggle.description}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="rounded-[32px] border border-white/8 bg-[#2a2927] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
              <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-2xl border border-white/8 bg-[#232220] text-xs font-semibold tracking-[0.16em] text-[#f5f1e9]">
                    {selectedDraft.avatarLabel}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white/90">
                      Preview
                    </div>
                    <div className="text-xs text-white/38">
                      Dry-run this companion without browser tools.
                    </div>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/[0.10] px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-white/44">
                  <Bot className="size-3.5" />
                  Model preview
                </div>
              </div>

              <div className="mt-5 rounded-[24px] bg-black/[0.12] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 items-center justify-center rounded-2xl bg-lime-300/[0.10] text-sm font-semibold tracking-[0.16em] text-lime-100">
                    {selectedDraft.avatarLabel}
                  </div>
                  <div>
                    <div className="text-base font-medium text-white/88">
                      {selectedDraft.name.trim() || "Untitled draft"}
                    </div>
                    <div className="mt-2 text-sm leading-6 text-white/50">
                      {selectedDraft.description || "No description yet."}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-[18px] bg-white/[0.03] px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-white/34">
                    Best for
                  </div>
                  <div className="mt-2 text-sm leading-6 text-white/72">
                    {selectedDraft.bestFor ||
                      "The builder will fill this in as you refine the draft."}
                  </div>
                </div>

                {selectedDraft.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedDraft.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-white/58"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <BuilderThread
                  messages={previewMessages}
                  emptyLabel="Ask the preview how it would behave. This uses the draft prompt only, without live browser tools."
                />
              </div>

              <div className="mt-6">
                <TaskComposer
                  disabled={isPreviewBusy}
                  onSend={onPreviewSend}
                  placeholder="Try the preview..."
                />
              </div>

              <button
                type="button"
                onClick={() => setActiveTab("configure")}
                className="mt-6 inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/82"
              >
                Fine-tune fields in Configure
                <ArrowUpRight className="size-4" />
              </button>
            </section>
          </div>
        ) : (
          <div className="mt-8 rounded-[32px] border border-dashed border-white/10 bg-black/[0.10] px-8 py-10 text-sm text-white/46">
            No draft selected yet. Create a new companion draft to start building.
          </div>
        )}
      </div>
    </div>
  );
};
