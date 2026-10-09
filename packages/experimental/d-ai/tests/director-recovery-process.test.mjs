/** POSIX abrupt-process acceptance against the ordinary built D_AI entry. */
import assert from 'node:assert/strict'
import { fork } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const fixture = fileURLToPath(new URL('./fixtures/director-recovery-process.mjs', import.meta.url))

test('an interrupted task resumes with a new fence after SIGKILL releases native ownership', {
  timeout: 60000,
  skip: process.platform === 'win32' ? 'Requires POSIX SIGKILL and native writer ownership release' : false,
}, async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'd-ai-process-crash-'))
  const children = []
  t.after(async () => {
    for (const { child, exited } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
      await exited
    }
    await rm(root, { recursive: true, force: true })
  })
  function start(mode) {
    const env = { NODE_USE_ENV_PROXY: '0' }
    for (const key of ['PATH', 'SystemRoot', 'TMPDIR', 'TEMP', 'TMP']) {
      if (process.env[key] !== undefined) env[key] = process.env[key]
    }
    const child = fork(fixture, [mode, root], {
      execArgv: ['--experimental-transform-types'], env, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    let log = ''
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log = (log + chunk).slice(-16000) })
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })))
    children.push({ child, exited })
    const ready = new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        child.kill('SIGKILL')
        reject(new Error(mode + ' readiness timed out: ' + log))
      }, 25000)
      child.once('message', message => { clearTimeout(deadline); resolve(message) })
      child.once('error', error => { clearTimeout(deadline); reject(error) })
      child.once('exit', (code, signal) => {
        clearTimeout(deadline)
        reject(new Error(mode + ' exited before readiness: ' + code + '/' + signal + '\n' + log))
      })
    })
    return { child, exited, ready }
  }
  const initial = start('running')
  const running = await initial.ready
  assert.equal(running.stage, 'running')
  assert.equal(running.task.state, 'RUNNING')
  assert.equal(running.leases[0].fence, 1)
  assert.equal(running.requests, 5)
  assert.equal(initial.child.kill('SIGKILL'), true)
  assert.deepEqual(await initial.exited, { code: null, signal: 'SIGKILL' })

  const restarted = start('recover')
  const recovered = await restarted.ready
  assert.equal(recovered.stage, 'recovered')
  assert.equal(recovered.task.state, 'COMPLETED')
  assert.deepEqual(recovered.leases.map(lease => lease.fence), [1, 2])
  assert.ok(recovered.leases.every(lease => lease.releasedAt !== undefined))
  assert.equal(recovered.schedule.lastCycle.outcome, 'EXECUTED')
  assert.equal(recovered.requests, 1)
  assert.deepEqual(await restarted.exited, { code: 0, signal: null })
})
