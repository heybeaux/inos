#!/usr/bin/env tsx
/**
 * Inos ingestion bench harness.
 *
 * Reads fixtures from bench/fixtures/, reference graphs from bench/references/,
 * calls POST {apiUrl}/api/ingest N times per fixture, grades each pass against
 * the reference, and writes a report.
 *
 * Failure semantics: exit 1 if aggregate metrics fall below configured thresholds.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradePass, passesAgree } from './grade.js';
import type {
  BenchConfig,
  BenchReport,
  FixtureRunResult,
  PassMetrics,
  ReferenceGraph,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const BENCH_DIR = resolve(__dirname, '..');
const FIXTURES_DIR = join(BENCH_DIR, 'fixtures');
const REFERENCES_DIR = join(BENCH_DIR, 'references');

function loadConfig(): BenchConfig {
  return {
    apiUrl: process.env.BENCH_API_URL ?? 'http://localhost:4000',
    passes: Number(process.env.BENCH_PASSES ?? '3'),
    thresholds: {
      nodeRecall: Number(process.env.BENCH_RECALL ?? '0.85'),
      edgePrecision: Number(process.env.BENCH_PRECISION ?? '0.80'),
      schemaValidRate: Number(process.env.BENCH_SCHEMA ?? '1.0'),
    },
  };
}

function loadFixtures(): { id: string; text: string; ref: ReferenceGraph }[] {
  const refFiles = readdirSync(REFERENCES_DIR).filter((f) => f.endsWith('.json'));
  const out: { id: string; text: string; ref: ReferenceGraph }[] = [];
  for (const f of refFiles) {
    const ref = JSON.parse(readFileSync(join(REFERENCES_DIR, f), 'utf8')) as ReferenceGraph;
    const fixturePath = join(FIXTURES_DIR, `${ref.fixtureId}.txt`);
    const text = readFileSync(fixturePath, 'utf8');
    out.push({ id: ref.fixtureId, text, ref });
  }
  return out;
}

async function runFixture(
  apiUrl: string,
  fixture: { id: string; text: string; ref: ReferenceGraph },
  passes: number,
): Promise<FixtureRunResult> {
  const perPass: PassMetrics[] = [];

  for (let p = 1; p <= passes; p++) {
    const started = Date.now();
    try {
      const res = await fetch(`${apiUrl}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fixture.text,
          format: fixture.ref.format,
          topic: fixture.ref.topic,
        }),
      });
      const durationMs = Date.now() - started;
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return {
          fixtureId: fixture.id,
          passes,
          perPassMetrics: perPass,
          aggregate: { avgNodeRecall: 0, avgEdgePrecision: 0, schemaValidRate: 0, avgDurationMs: 0 },
          deterministic: false,
          error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        };
      }
      const json = (await res.json()) as { graph: import('@heybeaux/inos-types').InosGraph };
      perPass.push(gradePass(p, durationMs, json.graph, fixture.ref));
    } catch (err) {
      return {
        fixtureId: fixture.id,
        passes,
        perPassMetrics: perPass,
        aggregate: { avgNodeRecall: 0, avgEdgePrecision: 0, schemaValidRate: 0, avgDurationMs: 0 },
        deterministic: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const avgNodeRecall = perPass.reduce((a, b) => a + b.nodeRecall, 0) / perPass.length;
  const avgEdgePrecision = perPass.reduce((a, b) => a + b.edgePrecision, 0) / perPass.length;
  const schemaValidRate = perPass.filter((p) => p.schemaValid).length / perPass.length;
  const avgDurationMs = perPass.reduce((a, b) => a + b.durationMs, 0) / perPass.length;

  let deterministic = true;
  for (let i = 1; i < perPass.length; i++) {
    if (!passesAgree(perPass[0], perPass[i])) {
      deterministic = false;
      break;
    }
  }

  return {
    fixtureId: fixture.id,
    passes,
    perPassMetrics: perPass,
    aggregate: { avgNodeRecall, avgEdgePrecision, schemaValidRate, avgDurationMs },
    deterministic,
  };
}

function summarize(report: BenchReport): void {
  console.log('\n=== Inos ingestion bench ===');
  console.log(`API: ${report.config.apiUrl}`);
  console.log(`Passes/fixture: ${report.config.passes}`);
  console.log(`Thresholds: recall≥${report.config.thresholds.nodeRecall}, precision≥${report.config.thresholds.edgePrecision}, schemaValid≥${report.config.thresholds.schemaValidRate}`);
  console.log('');
  for (const r of report.results) {
    if (r.error) {
      console.log(`  [FAIL] ${r.fixtureId}: ${r.error}`);
      continue;
    }
    const a = r.aggregate;
    console.log(
      `  ${r.fixtureId.padEnd(28)} recall=${a.avgNodeRecall.toFixed(2)} prec=${a.avgEdgePrecision.toFixed(2)} schema=${a.schemaValidRate.toFixed(2)} det=${r.deterministic ? 'Y' : 'N'} avgMs=${a.avgDurationMs.toFixed(0)}`,
    );
  }
  console.log('');
  if (report.passed) console.log('PASSED');
  else {
    console.log('FAILED');
    for (const f of report.failures) console.log(`  - ${f}`);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const fixtures = loadFixtures();
  if (fixtures.length === 0) {
    console.error('No fixtures found in', REFERENCES_DIR);
    process.exit(2);
  }

  const startedAt = new Date().toISOString();
  const results: FixtureRunResult[] = [];
  for (const fx of fixtures) {
    process.stdout.write(`  running ${fx.id}…`);
    const r = await runFixture(config.apiUrl, fx, config.passes);
    process.stdout.write(' done\n');
    results.push(r);
  }
  const finishedAt = new Date().toISOString();

  const failures: string[] = [];
  for (const r of results) {
    if (r.error) {
      failures.push(`${r.fixtureId}: ${r.error}`);
      continue;
    }
    if (r.aggregate.avgNodeRecall < config.thresholds.nodeRecall) {
      failures.push(`${r.fixtureId}: nodeRecall ${r.aggregate.avgNodeRecall.toFixed(3)} < ${config.thresholds.nodeRecall}`);
    }
    if (r.aggregate.avgEdgePrecision < config.thresholds.edgePrecision) {
      failures.push(`${r.fixtureId}: edgePrecision ${r.aggregate.avgEdgePrecision.toFixed(3)} < ${config.thresholds.edgePrecision}`);
    }
    if (r.aggregate.schemaValidRate < config.thresholds.schemaValidRate) {
      failures.push(`${r.fixtureId}: schemaValidRate ${r.aggregate.schemaValidRate.toFixed(3)} < ${config.thresholds.schemaValidRate}`);
    }
  }

  const report: BenchReport = {
    startedAt,
    finishedAt,
    config,
    results,
    passed: failures.length === 0,
    failures,
  };

  const reportPath = join(BENCH_DIR, 'last-run.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  summarize(report);
  console.log(`\nReport: ${reportPath}`);

  process.exit(report.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
