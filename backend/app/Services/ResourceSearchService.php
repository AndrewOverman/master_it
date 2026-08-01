<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Finds a handful of relevant articles/web pages for a plan step's topic.
 *
 * Unlike YouTubeVideoSearchService (a plain REST search + local scoring),
 * this asks Claude to use its built-in web-search tool and report back a
 * short, ranked list of resources with a one-line note on why each one is
 * useful — search and summarization in a single model call.
 */
class ResourceSearchService
{
    public function isConfigured(): bool
    {
        return filled(config('services.anthropic.api_key'));
    }

    /**
     * How many resources to search for per step. Configurable via
     * MAX_RESOURCES_PER_STEP so it can be dialed up or down without a
     * code change — resource search runs on every first step view, so
     * this is the main lever on that cost.
     */
    private function maxResults(): int
    {
        return max(1, (int) config('services.resources.max_per_step', 1));
    }

    private function systemPrompt(int $max): string
    {
        $resultPhrase = $max === 1
            ? 'the single best result you found'
            : "up to {$max} of the best results you found";

        return <<<PROMPT
            You help learners find good supplementary reading for a single step
            in their learning plan. You have a web_search tool — use it to find
            real, currently-accessible articles or web pages about the step's
            specific topic (not videos, and not generic pages about the overall
            goal — the step's specific topic).

            Prefer:
            - Official documentation or reputable, well-known publications and
              tutorial sites over obscure or low-quality pages
            - Pages that are freely readable, not obviously paywalled
            - Content specific to the step's actual topic, not generic
              "getting started" pages unrelated to it

            After searching, call the report_resources tool with {$resultPhrase}.
            For each one, write a single sentence explaining specifically why
            it helps with this step — not a generic description of the page.

            If you can't find anything genuinely useful and relevant, call
            report_resources with an empty resources array rather than include a
            weak or tangential result.
            PROMPT;
    }

    /**
     * @return array<int, array{url: string, title: string, source: ?string, description: ?string}>
     */
    public function search(string $stepTitle, string $stepDescription): array
    {
        if (! $this->isConfigured()) {
            return [];
        }

        $maxResults = $this->maxResults();

        $response = Http::withHeaders([
            'x-api-key' => config('services.anthropic.api_key'),
            'anthropic-version' => '2023-06-01',
        ])
            ->timeout(60)
            ->retry(2, 1000)
            ->post('https://api.anthropic.com/v1/messages', [
                'model' => config('services.anthropic.model'),
                'max_tokens' => 1536,
                'system' => $this->systemPrompt($maxResults),
                'tools' => [
                    [
                        'type' => 'web_search_20250305',
                        'name' => 'web_search',
                        'max_uses' => 3,
                    ],
                    [
                        'name' => 'report_resources',
                        'description' => 'Report the best web resources found for this step.',
                        'input_schema' => [
                            'type' => 'object',
                            'properties' => [
                                'resources' => [
                                    'type' => 'array',
                                    'maxItems' => $maxResults,
                                    'items' => [
                                        'type' => 'object',
                                        'properties' => [
                                            'url' => ['type' => 'string'],
                                            'title' => ['type' => 'string'],
                                            'source' => [
                                                'type' => 'string',
                                                'description' => 'Site or publication name, e.g. "MDN" or "freeCodeCamp".',
                                            ],
                                            'description' => [
                                                'type' => 'string',
                                                'description' => 'One sentence on why this specifically helps with this step.',
                                            ],
                                        ],
                                        'required' => ['url', 'title'],
                                    ],
                                ],
                            ],
                            'required' => ['resources'],
                        ],
                    ],
                ],
                'messages' => [
                    [
                        'role' => 'user',
                        'content' => "Step: \"{$stepTitle}\"\nDetails: {$stepDescription}",
                    ],
                ],
            ]);

        if ($response->failed()) {
            throw new RuntimeException('Anthropic API request failed: '.$response->body());
        }

        $usage = $response->json('usage', []);
        Log::info('ResourceSearchService: Anthropic usage', [
            'step_title' => $stepTitle,
            'server_tool_use' => $usage['server_tool_use'] ?? null,
            'input_tokens' => $usage['input_tokens'] ?? null,
        ]);

        $toolUse = collect($response->json('content'))->firstWhere('type', 'tool_use');
        $resources = $toolUse['input']['resources'] ?? null;

        // Claude occasionally returns nested tool input fields as a
        // JSON-encoded string instead of a native array; decode defensively.
        if (is_string($resources)) {
            $resources = json_decode($resources, true);
        }

        if (! is_array($resources)) {
            return [];
        }

        return collect($resources)
            ->filter(fn ($resource) => is_array($resource) && filled($resource['url'] ?? null) && filled($resource['title'] ?? null))
            ->map(fn (array $resource) => [
                'url' => $resource['url'],
                'title' => $resource['title'],
                'source' => $resource['source'] ?? null,
                'description' => $resource['description'] ?? null,
            ])
            ->take($maxResults)
            ->values()
            ->all();
    }
}
