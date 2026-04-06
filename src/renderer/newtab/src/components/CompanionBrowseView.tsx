import React from "react";
import { Compass, Search, Sparkles } from "lucide-react";
import { cn } from "@common/lib/utils";
import type {
  CompanionSearchResult,
  PublishedCompanion,
} from "../../../../shared/companionMarketplace";

function SourcePill({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "highlight";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em]",
        tone === "highlight"
          ? "border-lime-300/30 bg-lime-300/[0.09] text-lime-100"
          : "border-white/8 bg-white/[0.04] text-white/48",
      )}
    >
      {children}
    </span>
  );
}

function CompanionCard({
  companion,
  matchReason,
  score,
}: {
  companion: PublishedCompanion;
  matchReason?: string;
  score?: number;
}) {
  return (
    <article className="rounded-[28px] border border-white/8 bg-[#2e2d2b] p-5 shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/8 bg-[#262523] text-sm font-semibold tracking-[0.16em] text-[#f5f1e8]">
            {companion.avatarLabel}
          </div>
          <div>
            <div className="text-base font-semibold text-white/92">
              {companion.name}
            </div>
            <div className="mt-1 text-sm text-white/45">
              {companion.description}
            </div>
          </div>
        </div>

        <SourcePill tone={companion.source === "community" ? "highlight" : "default"}>
          {companion.source === "community" ? "Community" : "Core"}
        </SourcePill>
      </div>

      <div className="mt-5 rounded-[22px] bg-black/[0.12] p-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-white/34">
          Best for
        </div>
        <p className="mt-2 text-sm leading-6 text-white/78">{companion.bestFor}</p>
      </div>

      {companion.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {companion.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white/[0.04] px-3 py-1 text-xs text-white/58"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {(matchReason || score != null) && (
        <div className="mt-4 rounded-[18px] border border-cyan-300/12 bg-cyan-300/[0.05] px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.16em] text-cyan-100/62">
            Match
          </div>
          <div className="mt-1 text-sm text-cyan-50/80">
            {matchReason ?? "Matched in community search."}
          </div>
          {score != null && (
            <div className="mt-1 text-xs text-cyan-100/45">
              score {score.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </article>
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
  const communityCards: Array<{
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
      <div className="mx-auto max-w-[1120px] px-8 pb-14 pt-10">
        <section className="rounded-[36px] border border-white/8 bg-[linear-gradient(140deg,rgba(17,17,16,0.42),rgba(53,63,37,0.28)_55%,rgba(30,29,27,0.58))] p-8 shadow-[0_30px_90px_rgba(0,0,0,0.24)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-[540px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white/52">
                <Compass className="size-3.5" />
                Local Marketplace
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.03em] text-[#f5f1e9]">
                Browse companions built for specific jobs.
              </h1>
              <p className="mt-4 text-base leading-7 text-white/56">
                Core companions stay built-in. Community companions are local,
                publishable, and searchable with both keywords and semantic recall.
              </p>
            </div>

            <button
              type="button"
              onClick={onOpenBuilder}
              className="inline-flex items-center gap-2 self-start rounded-full bg-lime-300 px-5 py-3 text-sm font-medium text-[#1c2611] transition hover:brightness-110"
            >
              <Sparkles className="size-4" />
              Build a companion
            </button>
          </div>

          <label className="mt-8 flex items-center gap-3 rounded-[22px] border border-white/10 bg-black/[0.16] px-4 py-4">
            <Search className="size-4 text-white/36" />
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search community companions by use case, domain, or intent"
              className="w-full bg-transparent text-sm text-white/90 outline-none placeholder:text-white/30"
            />
            {isSearching && (
              <span className="text-[11px] uppercase tracking-[0.16em] text-white/32">
                searching
              </span>
            )}
          </label>
        </section>

        <section className="mt-10">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/42">
              Core Team
            </h2>
            <p className="mt-2 text-sm text-white/45">
              Built-in companions are read-only and always available.
            </p>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {coreCompanions.map((companion) => (
              <CompanionCard key={companion.id} companion={companion} />
            ))}
          </div>
        </section>

        <section className="mt-12">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/42">
                Community Companions
              </h2>
              <p className="mt-2 text-sm text-white/45">
                {hasQuery
                  ? "Hybrid search blends keyword and semantic matching."
                  : "Publish from the builder to add companions here."}
              </p>
            </div>
            <SourcePill tone="highlight">
              {hasQuery
                ? `${searchResults.length} results`
                : `${communityCompanions.length} published`}
            </SourcePill>
          </div>

          {communityCards.length > 0 ? (
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {communityCards.map(({ companion, matchReason, score }) => (
                <CompanionCard
                  key={companion.id}
                  companion={companion}
                  matchReason={matchReason}
                  score={score}
                />
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-[28px] border border-dashed border-white/10 bg-black/[0.10] px-6 py-8 text-sm text-white/48">
              {hasQuery
                ? "No community companions matched that search yet."
                : "No community companions published yet. Build the first one from the builder."}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
