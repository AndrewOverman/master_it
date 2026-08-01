<?php

namespace App\Services;

use Carbon\Carbon;
use Illuminate\Support\Facades\Http;

/**
 * Finds a single best-fit YouTube video for a plan step's topic.
 *
 * Uses the YouTube Data API v3: `search.list` to get topically-relevant
 * candidates, then `videos.list` to enrich them with view counts, publish
 * dates, and durations so candidates can be scored on popularity and
 * recency, not just YouTube's relevance ordering alone.
 */
class YouTubeVideoSearchService
{
    private const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

    private const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

    private const MAX_CANDIDATES = 15;

    private const MIN_VIEW_COUNT = 1000;

    private const MIN_DURATION_SECONDS = 90; // 1.5 min — skip Shorts/clips

    private const MAX_DURATION_SECONDS = 1500; // 25 min — skip long streams

    public function isConfigured(): bool
    {
        return filled(config('services.youtube.api_key'));
    }

    /**
     * @return array{url: string, title: string, channel: string, view_count: int, published_at: Carbon}|null
     */
    public function search(string $query): ?array
    {
        if (! $this->isConfigured()) {
            return null;
        }

        $ids = $this->searchCandidateIds($query);

        if (empty($ids)) {
            return null;
        }

        $candidates = $this->enrichCandidates($ids);

        $best = collect($candidates)
            ->filter(fn (array $c) => $c['view_count'] >= self::MIN_VIEW_COUNT
                && $c['duration_seconds'] >= self::MIN_DURATION_SECONDS
                && $c['duration_seconds'] <= self::MAX_DURATION_SECONDS)
            ->sortByDesc(fn (array $c) => $c['score'])
            ->first();

        if (! $best) {
            return null;
        }

        return [
            'url' => "https://www.youtube.com/watch?v={$best['id']}",
            'title' => $best['title'],
            'channel' => $best['channel'],
            'view_count' => $best['view_count'],
            'published_at' => $best['published_at'],
        ];
    }

    /**
     * @return array<int, string> video ids, in YouTube's relevance order
     */
    private function searchCandidateIds(string $query): array
    {
        $response = Http::get(self::SEARCH_URL, [
            'key' => config('services.youtube.api_key'),
            'q' => $query,
            'part' => 'id',
            'type' => 'video',
            'order' => 'relevance',
            'relevanceLanguage' => 'en',
            'safeSearch' => 'strict',
            'videoEmbeddable' => 'true',
            'maxResults' => self::MAX_CANDIDATES,
        ]);

        if ($response->failed()) {
            return [];
        }

        return collect($response->json('items', []))
            ->pluck('id.videoId')
            ->filter()
            ->values()
            ->all();
    }

    /**
     * Fetches stats/details for candidate ids and scores each one.
     *
     * Score blends three signals, weighted so a video actually about the
     * step's topic always wins over one that's merely popular or new:
     *   - relevance: position in the search results (earlier = more
     *     relevant), weighted heavily — this is the primary signal
     *   - popularity: log10(view count), weighted secondary; a 10M-view
     *     video doesn't completely drown out a solid 50K-view tutorial,
     *     but still can't outrank a clearly more on-topic result
     *   - recency: linear bonus that fades out over ~6 years, weighted
     *     lightly — a tiebreaker between otherwise-similar candidates,
     *     not something that should override relevance or popularity;
     *     older evergreen tutorials aren't excluded, just no longer boosted
     *
     * @param  array<int, string>  $ids
     * @return array<int, array{id: string, title: string, channel: string, view_count: int, published_at: Carbon, duration_seconds: int, score: float}>
     */
    private function enrichCandidates(array $ids): array
    {
        $response = Http::get(self::VIDEOS_URL, [
            'key' => config('services.youtube.api_key'),
            'id' => implode(',', $ids),
            'part' => 'snippet,statistics,contentDetails',
        ]);

        if ($response->failed()) {
            return [];
        }

        $rank = array_flip($ids); // id => original relevance position
        $count = count($ids);

        return collect($response->json('items', []))
            ->map(function (array $item) use ($rank, $count) {
                $id = $item['id'];
                $viewCount = (int) ($item['statistics']['viewCount'] ?? 0);
                $publishedAt = Carbon::parse($item['snippet']['publishedAt']);
                $ageYears = $publishedAt->diffInDays(now()) / 365;

                $relevanceScore = $count - ($rank[$id] ?? $count);
                $popularityScore = log10(max($viewCount, 1));
                $recencyScore = max(0, 3 - $ageYears * 0.5);

                return [
                    'id' => $id,
                    'title' => $item['snippet']['title'],
                    'channel' => $item['snippet']['channelTitle'],
                    'view_count' => $viewCount,
                    'published_at' => $publishedAt,
                    'duration_seconds' => $this->parseDuration($item['contentDetails']['duration']),
                    'score' => ($relevanceScore * 3) + $popularityScore + ($recencyScore * 0.25),
                ];
            })
            ->all();
    }

    private function parseDuration(string $iso8601): int
    {
        preg_match('/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/', $iso8601, $matches);

        $hours = (int) ($matches[1] ?? 0);
        $minutes = (int) ($matches[2] ?? 0);
        $seconds = (int) ($matches[3] ?? 0);

        return $hours * 3600 + $minutes * 60 + $seconds;
    }
}
