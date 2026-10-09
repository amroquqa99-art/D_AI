/** Tests command ordering and failure propagation, not the commands' implementations. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')
const expected = [
  ['node', '--test', 'docker/tests/check-runner.test.mjs'],
  ['node', '--test', 'packages/experimental/d-ai/tests/director-owner-order.test.mjs'],
  ['pnpm', 'run', 'verify-persistence-catalog'],
  ['pnpm', 'exec', 'tsc', '-b', 'packages/experimental/d-ai/tsconfig.json', '--pretty', 'false'],
  ['pnpm', 'run', 'build'],
  ['node', '--experimental-transform-types', '--test', 'packages/experimental/d-ai/tests/director-scheduler-coordinator.test.mjs', 'packages/experimental/d-ai/tests/director-recovery-process.test.mjs'],
  ['pnpm', 'exec', 'vitest', 'run',
    'packages/llm/llm-pi-ai/tests/small-context-budget.spec.ts',
    'packages/llm/llm-pi-ai/tests/adapter.spec.ts', '--maxWorkers=4'],
  ['pnpm', 'exec', 'vitest', 'run', 'packages/experimental/d-ai/tests', '--maxWorkers=4'],
]

function run(failAt) {
  const directory = mkdtempSync(join(tmpdir(), 'dai-check-runner-'))
  const log = join(directory, 'commands.jsonl')
  try {
    for (const name of ['node', 'pnpm']) {
      const path = join(directory, name)
      writeFileSync(path, `#!${process.execPath}
import { appendFileSync } from 'node:fs'
const args = [${JSON.stringify(name)}, ...process.argv.slice(2)]
appendFileSync(process.env.DAI_RUNNER_LOG, JSON.stringify({ args, cwd: process.cwd(), proxy: process.env.NODE_USE_ENV_PROXY }) + '\\n')
if (JSON.stringify(args) === process.env.DAI_RUNNER_FAIL_AT) process.exit(37)
`)
      chmodSync(path, 0o755)
    }
    const result = spawnSync('bash', [join(root, 'docker/check.sh')], {
      cwd: directory,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        NODE_USE_ENV_PROXY: '1',
        DAI_RUNNER_LOG: log,
        DAI_RUNNER_FAIL_AT: JSON.stringify(failAt),
      },
      encoding: 'utf8',
      timeout: 10_000,
    })
    assert.equal(result.error, undefined, result.stderr)
    assert.equal(result.signal, null, result.stderr)
    const commands = readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    return { status: result.status, commands }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('runs current-source checks before normal built coordinator resolution', () => {
  const result = run()
  assert.equal(result.status, 0)
  assert.deepEqual(result.commands.map(command => command.args), expected)
  assert.ok(result.commands.every(command => command.cwd === root))
  assert.deepEqual(result.commands.map(command => command.proxy), ['1', '1', '1', '1', '1', '1', '0', '0'])
})

for (const index of [0, 2, 3, 4, 5, 6, 7]) {
  test(`stops and retains exit status when ${expected[index].join(' ')} fails`, () => {
    const result = run(expected[index])
    assert.equal(result.status, 37)
    assert.deepEqual(result.commands.map(command => command.args), expected.slice(0, index + 1))
  })
}
