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
import { gradePassSemantic, passesAgreeSemantic } from './gradeSemantic.js';
import type {
  BenchConfig,
  BenchReport,
  FixtureRunResult,
  PassMetrics,
  ReferenceGraph,
} from './types.js';

/**
 * BENCH_GRADER=semantic switches to the semantic-equivalence grader
 * (gradeSemantic.ts), which (a) collapses near-synonym edge types into
 * families and (b) tolerates "defensible extras" — extracted edges whose
 * endpoints are source-grounded but not in the reference. Also adds an
 * edgeRecall metric. Default is the original strict grader.
 */
const GRADER = (process.env.BENCH_GRADER ?? 'strict').toLowerCase();
const USE_SEMANTIC = GRADER === 'semantic';
const gradePassFn = USE_SEMANTIC ? gradePassSemantic : gradePass;
const passesAgreeFn = USE_SEMANTIC ? passesAgreeSemantic : passesAgree;

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
  const filter = (process.env.BENCH_ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const out: { id: string; text: string; ref: ReferenceGraph }[] = [];
  for (const f of refFiles) {
    const ref = JSON.parse(readFileSync(join(REFERENCES_DIR, f), 'utf8')) as ReferenceGraph;
    if (filter.length > 0 && !filter.some((p) => ref.fixtureId.includes(p))) continue;
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
          aggregate: { avgNodeRecall: 0, avgEdgePrecision: 0, schemaValidRate: 0, avgDurationMs: 0, avgSpanCoverage: -1 },
          deterministic: false,
          error: `HTTP ${res.status}: ${body.slice(0, 200)}`,
        };
      }
      const json = (await res.json()) as { graph: import('@heybeaux/inos-types').InosGraph };
      if (process.env.BENCH_DUMP_GRAPHS === '1') {
        const dumpPath = join(BENCH_DIR, `dump-${fixture.id}-p${p}.json`);
        writeFileSync(dumpPath, JSON.stringify({ graph: json.graph }, null, 2));
      }
      perPass.push(gradePassFn(p, durationMs, json.graph, fixture.ref, fixture.text));
    } catch (err) {
      return {
        fixtureId: fixture.id,
        passes,
        perPassMetrics: perPass,
        aggregate: { avgNodeRecall: 0, avgEdgePrecision: 0, schemaValidRate: 0, avgDurationMs: 0, avgSpanCoverage: -1 },
        deterministic: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const avgNodeRecall = perPass.reduce((a, b) => a + b.nodeRecall, 0) / perPass.length;
  const avgEdgePrecision = perPass.reduce((a, b) => a + b.edgePrecision, 0) / perPass.length;
  const schemaValidRate = perPass.filter((p) => p.schemaValid).length / perPass.length;
  const avgDurationMs = perPass.reduce((a, b) => a + b.durationMs, 0) / perPass.length;
  const coverageSamples = perPass.map((p) => p.spanCoverage).filter((c) => c >= 0);
  const avgSpanCoverage = coverageSamples.length === 0
    ? -1
    : coverageSamples.reduce((a, b) => a + b, 0) / coverageSamples.length;
  const recallSamples = perPass
    .map((p) => p.edgeRecall)
    .filter((r): r is number => typeof r === 'number');
  const avgEdgeRecall =
    recallSamples.length === 0
      ? undefined
      : recallSamples.reduce((a, b) => a + b, 0) / recallSamples.length;

  let deterministic = true;
  for (let i = 1; i < perPass.length; i++) {
    if (!passesAgreeFn(perPass[0], perPass[i])) {
      deterministic = false;
      break;
    }
  }

  return {
    fixtureId: fixture.id,
    passes,
    perPassMetrics: perPass,
    aggregate: {
      avgNodeRecall,
      avgEdgePrecision,
      schemaValidRate,
      avgDurationMs,
      avgSpanCoverage,
      ...(avgEdgeRecall !== undefined ? { avgEdgeRecall } : {}),
    },
    deterministic,
  };
}

function summarize(report: BenchReport): void {
  console.log('\n=== Inos ingestion bench ===');
  console.log(`API: ${report.config.apiUrl}`);
  console.log(`Passes/fixture: ${report.config.passes}`);
  console.log(`Grader: ${USE_SEMANTIC ? 'semantic (edge families + defensible extras + edgeRecall)' : 'strict'}`);
  console.log(`Thresholds: recall≥${report.config.thresholds.nodeRecall}, precision≥${report.config.thresholds.edgePrecision}, schemaValid≥${report.config.thresholds.schemaValidRate}`);
  console.log('');
  for (const r of report.results) {
    if (r.error) {
      console.log(`  [FAIL] ${r.fixtureId}: ${r.error}`);
      continue;
    }
    const a = r.aggregate;
    const cov = a.avgSpanCoverage < 0 ? 'n/a' : a.avgSpanCoverage.toFixed(2);
    const edgeRecallStr =
      a.avgEdgeRecall !== undefined ? ` eRec=${a.avgEdgeRecall.toFixed(2)}` : '';
    console.log(
      `  ${r.fixtureId.padEnd(28)} recall=${a.avgNodeRecall.toFixed(2)} prec=${a.avgEdgePrecision.toFixed(2)}${edgeRecallStr} schema=${a.schemaValidRate.toFixed(2)} spanCov=${cov} det=${r.deterministic ? 'Y' : 'N'} avgMs=${a.avgDurationMs.toFixed(0)}`,
    );
  }

  // Span-coverage spotlight (Phase 1: log prominently, don't fail).
  console.log('');
  console.log('--- source-span coverage (matched nodes, verified verbatim) ---');
  for (const r of report.results) {
    if (r.error) continue;
    const cov = r.aggregate.avgSpanCoverage;
    const tag = cov < 0
      ? 'NO MATCHED NODES'
      : cov < 0.5
        ? '!! LOW'
        : cov < 0.85
          ? '!  moderate'
          : 'ok';
    const covStr = cov < 0 ? '   n/a' : cov.toFixed(3);
    console.log(`  ${r.fixtureId.padEnd(28)} spanCoverage=${covStr}  ${tag}`);
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
