<?php

namespace Tests\Feature;

use App\Services\ResourceSearchService;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Sleep;
use Tests\TestCase;

class ResourceSearchServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config(['services.anthropic.api_key' => 'test-key']);
    }

    private function fakeToolUseResponse(array $resources): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [
                    ['type' => 'server_tool_use', 'name' => 'web_search'],
                    ['type' => 'web_search_tool_result'],
                    [
                        'type' => 'tool_use',
                        'name' => 'report_resources',
                        'input' => ['resources' => $resources],
                    ],
                ],
                'usage' => ['input_tokens' => 100],
            ]),
        ]);
    }

    public function test_returns_empty_when_api_key_not_configured(): void
    {
        config(['services.anthropic.api_key' => null]);
        Http::fake();

        $result = app(ResourceSearchService::class)->search('Some step', 'Some description');

        $this->assertSame([], $result);
        Http::assertNothingSent();
    }

    public function test_returns_parsed_resources_from_tool_use_response(): void
    {
        $this->fakeToolUseResponse([
            [
                'url' => 'https://example.com/article',
                'title' => 'A Great Article',
                'source' => 'Example Site',
                'description' => 'Explains exactly this step.',
            ],
        ]);

        $result = app(ResourceSearchService::class)->search('Learn X', 'Do the thing');

        $this->assertCount(1, $result);
        $this->assertSame('https://example.com/article', $result[0]['url']);
        $this->assertSame('A Great Article', $result[0]['title']);
        $this->assertSame('Example Site', $result[0]['source']);
        $this->assertSame('Explains exactly this step.', $result[0]['description']);
    }

    public function test_drops_candidates_missing_url_or_title(): void
    {
        $this->fakeToolUseResponse([
            ['url' => 'https://example.com/good', 'title' => 'Good'],
            ['url' => '', 'title' => 'Missing URL'],
            ['title' => 'No URL Key At All'],
        ]);

        $result = app(ResourceSearchService::class)->search('Learn X', 'Do the thing');

        $this->assertCount(1, $result);
        $this->assertSame('https://example.com/good', $result[0]['url']);
    }

    public function test_returns_empty_when_no_tool_use_in_response(): void
    {
        Http::fake([
            'api.anthropic.com/*' => Http::response([
                'content' => [['type' => 'text', 'text' => "I couldn't find anything."]],
                'usage' => ['input_tokens' => 50],
            ]),
        ]);

        $result = app(ResourceSearchService::class)->search('Learn X', 'Do the thing');

        $this->assertSame([], $result);
    }

    public function test_defaults_to_one_result_when_max_not_configured(): void
    {
        config(['services.resources.max_per_step' => null]);
        $this->fakeToolUseResponse([
            ['url' => 'https://example.com/a', 'title' => 'A'],
            ['url' => 'https://example.com/b', 'title' => 'B'],
            ['url' => 'https://example.com/c', 'title' => 'C'],
        ]);

        $result = app(ResourceSearchService::class)->search('Learn X', 'Do the thing');

        $this->assertCount(1, $result);
        $this->assertSame('https://example.com/a', $result[0]['url']);
    }

    public function test_respects_max_resources_per_step_config(): void
    {
        config(['services.resources.max_per_step' => 2]);
        $this->fakeToolUseResponse([
            ['url' => 'https://example.com/a', 'title' => 'A'],
            ['url' => 'https://example.com/b', 'title' => 'B'],
            ['url' => 'https://example.com/c', 'title' => 'C'],
        ]);

        $result = app(ResourceSearchService::class)->search('Learn X', 'Do the thing');

        $this->assertCount(2, $result);

        Http::assertSent(function ($request) {
            $tool = collect($request->data()['tools'])->firstWhere('name', 'report_resources');

            return $tool['input_schema']['properties']['resources']['maxItems'] === 2;
        });
    }

    public function test_throws_when_request_fails(): void
    {
        Sleep::fake();
        Http::fake([
            'api.anthropic.com/*' => Http::response(['error' => 'boom'], 500),
        ]);

        // ->retry() throws its own RequestException once retries are
        // exhausted, before the service's own $response->failed() check
        // would run.
        $this->expectException(RequestException::class);

        app(ResourceSearchService::class)->search('Learn X', 'Do the thing');
    }
}
