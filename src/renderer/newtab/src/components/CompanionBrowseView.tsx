import React from "react";
import { Plus, Search } from "lucide-react";
import { cn } from "@common/lib/utils";
import type {
  CompanionSearchResult,
  PublishedCompanion,
} from "../../../../shared/companionMarketplace";

function CompanionRow({
  companion,
  matchReason,
  score,
}: {
  companion: PublishedCompanion;
  matchReason?: string;
  score?: number;
}) {
  return (
    <div className="group flex items-start gap-4 rounded-xl px-4 py-4 transition-colors hover:bg-white/[0.03]">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-[11px] font-semibold tracking-wider text-white/60">
        {companion.avatarLabel}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5">
          <span className="text-[15px] font-medium text-white/88">
            {companion.name}
          </span>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] uppercase tracking-wider",
              companion.source === "community"
                ? "bg-lime-300/[0.08] text-lime-200/70"
                : "bg-white/[0.04] text-white/30",
            )}
          >
            {companion.source === "community" ? "community" : "core"}
          </span>
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-white/40">
          {companion.description}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-white/55">
          {companion.bestFor}
        </p>

        {companion.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {companion.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/35"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {matchReason && (
          <p className="mt-2 text-xs text-cyan-200/50">
            {matchReason}
            {score != null && (
              <span className="ml-2 text-cyan-200/30">
                {score.toFixed(2)}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

interface CompanionBrowseViewProps {
  coreCompanions: PublishedCompanion[];
  communityCompanions: PublishedCompanion[];
  searchQuery: string;
  searchResults: CompanionSearchResult[];
  isSearching: boolean;
  onSearchQueryChange: (value: string) => void;
  onOpenBuilder: () => void;
}

export const CompanionBrowseView: React.FC<CompanionBrowseViewProps> = ({
  coreCompanions,
  communityCompanions,
  searchQuery,
  searchResults,
  isSearching,
  onSearchQueryChange,
  onOpenBuilder,
}) => {
  const hasQuery = searchQuery.trim().length > 0;
  const communityRows: Array<{
    companion: PublishedCompanion;
    matchReason?: string;
    score?: number;
  }> = hasQuery
    ? searchResults.map((result) => ({
        companion: result.companion,
        matchReason: result.matchReason,
        score: result.score,
      }))
    : communityCompanions.map((companion) => ({ companion }));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[680px] px-6 pb-16 pt-14">
        {/* Header */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#f5f1e9]">
              Companions
            </h1>
            <p className="mt-1.5 text-sm text-white/38">
              Built-in and community companions for specialized tasks.
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenBuilder}
            className="inline-flex items-center gap-1.5 rounded-full bg-lime-300 px-4 py-2 text-[13px] font-medium text-[#1c2611] transition hover:brightness-110"
          >
            <Plus className="size-3.5" />
            Build
          </button>
        </div>

        {/* Search */}
        <label className="mt-6 flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
          <Search className="size-4 text-white/25" />
          <input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search by use case or intent..."
            className="w-full bg-transparent text-sm text-white/85 outline-none placeholder:text-white/25"
          />
          {isSearching && (
            <span className="shrink-0 text-[11px] text-white/25">...</span>
          )}
        </label>

        {/* Core */}
        <section className="mt-10">
          <h2 className="text-xs font-medium uppercase tracking-wider text-white/30">
            Core
          </h2>

          <div className="mt-3 divide-y divide-white/[0.04]">
            {coreCompanions.map((companion) => (
              <CompanionRow key={companion.id} companion={companion} />
            ))}
          </div>
        </section>

        {/* Community */}
        <section className="mt-10">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-medium uppercase tracking-wider text-white/30">
              Community
            </h2>
            <span className="text-xs text-white/25">
              {hasQuery
                ? `${searchResults.length} results`
                : `${communityCompanions.length} published`}
            </span>
          </div>

          {communityRows.length > 0 ? (
            <div className="mt-3 divide-y divide-white/[0.04]">
              {communityRows.map(({ companion, matchReason, score }) => (
                <CompanionRow
                  key={companion.id}
                  companion={companion}
                  matchReason={matchReason}
                  score={score}
                />
              ))}
            </div>
          ) : (
            <p className="mt-6 text-center text-sm text-white/30">
              {hasQuery
                ? "No companions matched that search."
                : "No community companions yet. Build the first one."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
};
