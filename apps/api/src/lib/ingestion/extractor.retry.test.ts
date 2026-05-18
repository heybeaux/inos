/**
 * Retry/backoff/timeout unit tests for the LLM call wrapper (#13).
 *
 * We inject a mock fetch via `__setFetchForTests` so we never touch the
 * network, then exercise the public `extractAndBuildGraph` for the failure
 * surfaces and a private retry through `rawOpenRouterCall` indirectly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __setFetchForTests,
  extractAndBuildGraph,
  IngestionConfigError,
} from './extractor.js';

const ORIGINAL_KEY = process.env.OPENROUTER_API_KEY;

function mockOkResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockErrResponse(status: number, body = 'upstream error'): Response {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain' },
  });
}

/**
 * Minimal "happy" extraction payload — one spine claim, no support,
 * no edges. Lets us return the same body for every pass and still get
 * a valid (if tiny) graph out.
 */
function spinePayload() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({
            canvasName: 'Test',
            summary: 'Test summary',
            nodes: [
              {
                id: 'n1',
                type: 'claim',
                title: 'Sample claim',
                content: 'Sample content',
                author: 'Author',
              },
            ],
          }),
        },
        finish_reason: 'stop',
      },
    ],
  };
}

function emptyNodesPayload() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({ nodes: [] }),
        },
        finish_reason: 'stop',
      },
    ],
  };
}

function emptyEdgesPayload() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({ edges: [] }),
        },
        finish_reason: 'stop',
      },
    ],
  };
}

function emptyMissedPayload() {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify({ missedNodes: [] }),
        },
        finish_reason: 'stop',
      },
    ],
  };
}

describe('LLM retry + backoff (#13)', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = 'sk-test';
  });

  afterEach(() => {
    __setFetchForTests(null);
    if (ORIGINAL_KEY === undefined) {
      delete process.env.OPENROUTER_API_KEY;
    } else {
      process.env.OPENROUTER_API_KEY = ORIGINAL_KEY;
    }
  });

  it('throws IngestionConfigError when OPENROUTER_API_KEY is missing', async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      extractAndBuildGraph({ text: 'Just one short claim sentence.' }),
    ).rejects.toBeInstanceOf(IngestionConfigError);
  });

  it('retries on 429 then succeeds', async () => {
    // Sequence per OpenRouter call: 429, then 200. The extractor makes
    // multiple LLM calls (spine/support/edges/recovery), so we set up
    // a fetch mock that returns 429 on the FIRST call then 200 for the
    // rest. That proves the retry path engages without slowing the test
    // with multiple-pass simulation.
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      // Pass 1 (spine) — first call 429
      .mockResolvedValueOnce(mockErrResponse(429, 'rate limited'))
      // Pass 1 retry — succeeds
      .mockResolvedValueOnce(mockOkResponse(spinePayload()))
      // Pass 2 support
      .mockResolvedValueOnce(mockOkResponse(emptyNodesPayload()))
      // Pass 3 edges
      .mockResolvedValueOnce(mockOkResponse(emptyEdgesPayload()))
      // Pass 4 recovery
      .mockResolvedValueOnce(mockOkResponse(emptyMissedPayload()));
    __setFetchForTests(fetchMock as unknown as typeof fetch);

    const { graph, stats } = await extractAndBuildGraph({
      text: 'Just one short claim sentence.',
    });

    expect(fetchMock).toHaveBeenCalled();
    // We expect at least one retry, i.e. >= 5 total calls
    // (spine ×2, support, edges, recovery).
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5);
    expect(graph.nodes.length).toBe(1);
    expect(stats.parseWarnings ?? []).toEqual([]);
  }, 30_000);

  it('gives up after RETRY_MAX_ATTEMPTS and surfaces the error', async () => {
    // Persistent 500 — every spine call (initial + retries) returns 500.
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValue(mockErrResponse(500, 'upstream broken'));
    __setFetchForTests(fetchMock as unknown as typeof fetch);

    await expect(
      extractAndBuildGraph({ text: 'Just one short claim sentence.' }),
    ).rejects.toThrow(/LLM call failed \(500\)/);

    // 3 attempts total per the configured RETRY_MAX_ATTEMPTS.
    expect(fetchMock.mock.calls.length).toBe(3);
  }, 30_000);

  it('does NOT retry permanent 4xx (e.g. 400 invalid model)', async () => {
    const fetchMock: ReturnType<typeof vi.fn> = vi
      .fn()
      .mockResolvedValueOnce(mockErrResponse(400, 'invalid model'));
    __setFetchForTests(fetchMock as unknown as typeof fetch);

    await expect(
      extractAndBuildGraph({ text: 'Just one short claim sentence.' }),
    ).rejects.toThrow(/LLM call failed \(400\)/);
    // Exactly one attempt — no retries on permanent client errors.
    expect(fetchMock.mock.calls.length).toBe(1);
  });
});
