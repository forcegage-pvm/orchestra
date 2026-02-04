/**
 * LoadingState Component
 *
 * Skeleton placeholder screen shown during initial panel load before session data arrives.
 * Uses skeleton screens pattern to prevent layout shift by matching actual content dimensions.
 *
 * Specification: specs/011-agent-panel-rework/spec.md Section 3.9 Loading States
 */

/**
 * LoadingState - Initial load skeleton with header + 3 event card placeholders
 *
 * Displays skeleton placeholders that visually match the layout dimensions of actual
 * content (header height, card structure) to prevent layout shift when loading completes.
 * Uses Tailwind's animate-pulse for shimmer effect.
 *
 * Visual layout:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ [████████████████░░░░░░░░░░░░░░░░░░░░░░] (header skeleton)      │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ [█████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] (card skeleton)        │
 * │ [████████████████░░░░░░░░░░░░░░░░░░░░░░]                        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ [█████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] (card skeleton)        │
 * │ [████████████████░░░░░░░░░░░░░░░░░░░░░░]                        │
 * ├─────────────────────────────────────────────────────────────────┤
 * │ [█████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] (card skeleton)        │
 * │ [████████████████░░░░░░░░░░░░░░░░░░░░░░]                        │
 * └─────────────────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <Show when={!loading} fallback={<LoadingState />}>
 *   <ActualContent />
 * </Show>
 * ```
 */
export function LoadingState() {
  return (
    <div class="p-4 space-y-3">
      {/* Header Skeleton - matches typical header dimensions */}
      <div class="h-16 bg-gray-800 rounded-lg animate-pulse" />

      {/* Card Skeleton 1 */}
      <div class="bg-zinc-900 border border-gray-700 rounded-lg p-4 animate-pulse">
        <div class="flex items-start gap-3">
          {/* Icon placeholder */}
          <div class="w-5 h-5 bg-gray-700 rounded flex-shrink-0" />
          <div class="flex-1 space-y-2">
            {/* Title line */}
            <div class="h-4 bg-gray-700 rounded w-24" />
            {/* Content lines */}
            <div class="h-3 bg-gray-800 rounded w-full" />
            <div class="h-3 bg-gray-800 rounded w-3/4" />
          </div>
        </div>
      </div>

      {/* Card Skeleton 2 */}
      <div class="bg-zinc-900 border border-gray-700 rounded-lg p-4 animate-pulse">
        <div class="flex items-start gap-3">
          {/* Icon placeholder */}
          <div class="w-5 h-5 bg-gray-700 rounded flex-shrink-0" />
          <div class="flex-1 space-y-2">
            {/* Title line */}
            <div class="h-4 bg-gray-700 rounded w-32" />
            {/* Content lines */}
            <div class="h-3 bg-gray-800 rounded w-full" />
            <div class="h-3 bg-gray-800 rounded w-5/6" />
          </div>
        </div>
      </div>

      {/* Card Skeleton 3 */}
      <div class="bg-zinc-900 border border-gray-700 rounded-lg p-4 animate-pulse">
        <div class="flex items-start gap-3">
          {/* Icon placeholder */}
          <div class="w-5 h-5 bg-gray-700 rounded flex-shrink-0" />
          <div class="flex-1 space-y-2">
            {/* Title line */}
            <div class="h-4 bg-gray-700 rounded w-28" />
            {/* Content lines */}
            <div class="h-3 bg-gray-800 rounded w-full" />
            <div class="h-3 bg-gray-800 rounded w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}
