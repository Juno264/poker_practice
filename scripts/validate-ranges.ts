/**
 * CI/local shell around validateChart.ts. See docs/domain-contracts.md §5.
 *
 * Reads every data/ranges/*.json (relative to this script's own location,
 * not the current working directory), validates each with validateChart(),
 * and reports duplicate-id across files. Prints errors/warnings grouped by
 * file. Exits 1 if there is at least one error, 0 otherwise. An empty or
 * missing data/ranges/ is not a failure — it just means no charts have been
 * entered yet.
 */

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateChart, type ValidationIssue } from '../src/domain/validateChart';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rangesDir = join(scriptDir, '..', 'data', 'ranges');

type FileReport = { fileName: string; issues: ValidationIssue[] };

async function listJsonFiles(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch (e) {
    if (isNodeError(e) && e.code === 'ENOENT') {
      return [];
    }
    throw e;
  }
  return entries.filter((name) => name.endsWith('.json')).sort();
}

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
  return e instanceof Error && 'code' in e;
}

async function loadAndValidate(fileName: string): Promise<FileReport> {
  const filePath = join(rangesDir, fileName);
  const text = await readFile(filePath, 'utf-8');

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      fileName,
      issues: [{ level: 'error', code: 'bad-schema', message: `${fileName}: invalid JSON (${message})` }],
    };
  }

  return { fileName, issues: validateChart(raw, fileName) };
}

function extractId(raw: unknown): string | null {
  if (typeof raw === 'object' && raw !== null && 'id' in raw) {
    const id = (raw as Record<string, unknown>).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function printReport(reports: FileReport[]): { errorCount: number; warnCount: number } {
  let errorCount = 0;
  let warnCount = 0;

  for (const { fileName, issues } of reports) {
    if (issues.length === 0) continue;

    console.log(`\n${fileName}`);
    console.log('-'.repeat(fileName.length));
    for (const issue of issues) {
      const tag = issue.level === 'error' ? 'ERROR' : 'WARN ';
      const handSuffix = issue.hand !== undefined ? ` [hand=${issue.hand}]` : '';
      console.log(`  ${tag} (${issue.code})${handSuffix} ${issue.message}`);
      if (issue.level === 'error') errorCount++;
      else warnCount++;
    }
  }

  return { errorCount, warnCount };
}

async function main(): Promise<void> {
  const fileNames = await listJsonFiles(rangesDir);

  if (fileNames.length === 0) {
    console.log('No range charts found in data/ranges/ — nothing has been entered yet. Nothing to validate.');
    process.exit(0);
  }

  const reports: FileReport[] = [];
  const idsByFile = new Map<string, string>();

  for (const fileName of fileNames) {
    const report = await loadAndValidate(fileName);
    reports.push(report);

    const filePath = join(rangesDir, fileName);
    try {
      const text = await readFile(filePath, 'utf-8');
      const raw: unknown = JSON.parse(text);
      const id = extractId(raw);
      if (id !== null) idsByFile.set(fileName, id);
    } catch {
      // Already reported as bad-schema above; skip duplicate-id detection for this file.
    }
  }

  // Cross-file duplicate-id check.
  const filesById = new Map<string, string[]>();
  for (const [fileName, id] of idsByFile) {
    const list = filesById.get(id) ?? [];
    list.push(fileName);
    filesById.set(id, list);
  }

  for (const [id, files] of filesById) {
    if (files.length <= 1) continue;
    for (const fileName of files) {
      const report = reports.find((r) => r.fileName === fileName);
      if (report === undefined) continue;
      report.issues.push({
        level: 'error',
        code: 'duplicate-id',
        message: `${fileName}: id "${id}" is also used by ${files.filter((f) => f !== fileName).join(', ')}`,
      });
    }
  }

  const { errorCount, warnCount } = printReport(reports);

  console.log(
    `\n${fileNames.length} chart(s) checked — ${errorCount} error(s), ${warnCount} warning(s).`,
  );

  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error('validate-ranges: unexpected failure');
  console.error(e);
  process.exit(1);
});
