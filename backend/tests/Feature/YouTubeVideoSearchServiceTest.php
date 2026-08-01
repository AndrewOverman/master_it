<?php

namespace Tests\Feature;

use App\Services\YouTubeVideoSearchService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class YouTubeVideoSearchServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['services.youtube.api_key' => 'test-key']);
    }

    private function fakeSearchAndVideos(array $searchIds, array $videoItems): void
    {
        Http::fake([
            'googleapis.com/youtube/v3/search*' => Http::response([
                'items' => array_map(
                    fn (string $id) => ['id' => ['videoId' => $id]],
                    $searchIds
                ),
            ]),
            'googleapis.com/youtube/v3/videos*' => Http::response([
                'items' => $videoItems,
            ]),
        ]);
    }

    private function videoItem(string $id, int $viewCount, string $duration, string $publishedAt, string $title = 'Title', string $channel = 'Channel'): array
    {
        return [
            'id' => $id,
            'snippet' => [
                'title' => $title,
                'channelTitle' => $channel,
                'publishedAt' => $publishedAt,
            ],
            'statistics' => ['viewCount' => (string) $viewCount],
            'contentDetails' => ['duration' => $duration],
        ];
    }

    public function test_returns_null_when_api_key_not_configured(): void
    {
        config(['services.youtube.api_key' => null]);
        Http::fake();

        $result = app(YouTubeVideoSearchService::class)->search('anything');

        $this->assertNull($result);
        Http::assertNothingSent();
    }

    public function test_filters_out_low_view_count_and_out_of_range_duration(): void
    {
        $this->fakeSearchAndVideos(['aaa', 'bbb', 'ccc'], [
            // Below the view-count floor.
            $this->videoItem('aaa', 500, 'PT10M', now()->subMonth()->toIso8601String()),
            // A 30-minute stream, above the duration ceiling.
            $this->videoItem('bbb', 2_000_000, 'PT30M', now()->subMonth()->toIso8601String()),
            // The only candidate that survives both filters.
            $this->videoItem('ccc', 50_000, 'PT10M', now()->subMonth()->toIso8601String(), 'Good Tutorial', 'Good Channel'),
        ]);

        $result = app(YouTubeVideoSearchService::class)->search('some query');

        $this->assertNotNull($result);
        $this->assertSame('https://www.youtube.com/watch?v=ccc', $result['url']);
        $this->assertSame('Good Tutorial', $result['title']);
        $this->assertSame('Good Channel', $result['channel']);
    }

    public function test_relevance_outweighs_a_much_larger_popularity_advantage(): void
    {
        // Six candidates so the relevance-rank gap between first and last
        // is wide; the most relevant one has far fewer views than the
        // least relevant one, but should still win.
        $this->fakeSearchAndVideos(
            ['most_relevant', 'b', 'c', 'd', 'e', 'least_relevant'],
            [
                $this->videoItem('most_relevant', 5_000, 'PT8M', now()->subYear()->toIso8601String(), 'On Topic'),
                $this->videoItem('b', 5_000, 'PT8M', now()->subYear()->toIso8601String()),
                $this->videoItem('c', 5_000, 'PT8M', now()->subYear()->toIso8601String()),
                $this->videoItem('d', 5_000, 'PT8M', now()->subYear()->toIso8601String()),
                $this->videoItem('e', 5_000, 'PT8M', now()->subYear()->toIso8601String()),
                $this->videoItem('least_relevant', 5_000_000, 'PT8M', now()->subYear()->toIso8601String(), 'Off Topic'),
            ]
        );

        $result = app(YouTubeVideoSearchService::class)->search('some query');

        $this->assertSame('https://www.youtube.com/watch?v=most_relevant', $result['url']);
    }

    public function test_recency_cannot_overcome_even_a_small_relevance_disadvantage(): void
    {
        // Adjacent relevance ranks, identical view counts — recency is the
        // only thing that differs, and it's not enough to flip the result.
        $this->fakeSearchAndVideos(['more_relevant_but_old', 'less_relevant_but_new'], [
            $this->videoItem('more_relevant_but_old', 100_000, 'PT8M', now()->subYears(6)->toIso8601String()),
            $this->videoItem('less_relevant_but_new', 100_000, 'PT8M', now()->toIso8601String()),
        ]);

        $result = app(YouTubeVideoSearchService::class)->search('some query');

        $this->assertSame('https://www.youtube.com/watch?v=more_relevant_but_old', $result['url']);
    }

    public function test_returns_null_when_no_candidates_survive_filtering(): void
    {
        $this->fakeSearchAndVideos(['aaa'], [
            $this->videoItem('aaa', 10, 'PT10M', now()->toIso8601String()),
        ]);

        $result = app(YouTubeVideoSearchService::class)->search('some query');

        $this->assertNull($result);
    }
}
