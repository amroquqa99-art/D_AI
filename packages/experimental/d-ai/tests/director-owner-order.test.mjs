/** Dependency-free scheduling checks use the production TypeScript module. */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { orderDirectorOwnersForFairness } from '../src/director-owner-order.ts'

const owners = Object.freeze([
  Object.freeze({ id: 'c' }),
  Object.freeze({ id: 'a' }),
  Object.freeze({ id: 'b' }),
])
const ids = ordered => ordered.map(owner => owner.id)

test('initial ordering is independent of registry insertion order', () => {
  assert.deepEqual(ids(orderDirectorOwnersForFairness(owners)), ['a', 'b', 'c'])
  assert.deepEqual(ids(owners), ['c', 'a', 'b'])
  assert.equal(Object.isFrozen(orderDirectorOwnersForFairness(owners)), true)
  assert.equal(orderDirectorOwnersForFairness(owners)[0], owners[1])
})

test('capacity one serves every continuously eligible owner before repeating', () => {
  let cursor
  const served = []
  for (let scan = 0; scan < 300; scan += 1) {
    const next = orderDirectorOwnersForFairness(owners, cursor)[0]
    served.push(next.id)
    cursor = next.id
  }
  for (let offset = 0; offset < served.length; offset += 3) {
    assert.deepEqual(served.slice(offset, offset + 3), ['a', 'b', 'c'])
  }
})

test('more than one slot continues from the last admission in the next scan', () => {
  const firstWave = orderDirectorOwnersForFairness(owners).slice(0, 2)
  const secondWave = orderDirectorOwnersForFairness(owners, firstWave.at(-1).id).slice(0, 2)
  assert.deepEqual(ids(firstWave), ['a', 'b'])
  assert.deepEqual(ids(secondWave), ['c', 'a'])
})

test('a removed owner retains its cursor position', () => {
  assert.deepEqual(ids(orderDirectorOwnersForFairness([owners[0], owners[1]], 'b')), ['c', 'a'])
})

test('a newly live owner joins without resetting the cycle', () => {
  assert.deepEqual(ids(orderDirectorOwnersForFairness([...owners, { id: 'bb' }], 'b')), ['bb', 'c', 'a', 'b'])
})

test('empty registries and cursors beyond the last identity wrap safely', () => {
  assert.deepEqual(orderDirectorOwnersForFairness([], 'z'), [])
  assert.deepEqual(ids(orderDirectorOwnersForFairness(owners, 'z')), ['a', 'b', 'c'])
  assert.deepEqual(ids(orderDirectorOwnersForFairness([{ id: 'only' }], 'only')), ['only'])
})

test('failed admission leaves the same owner first until the caller advances', () => {
  assert.deepEqual(ids(orderDirectorOwnersForFairness(owners, 'a')), ['b', 'c', 'a'])
  assert.deepEqual(ids(orderDirectorOwnersForFairness(owners, 'a')), ['b', 'c', 'a'])
})

test('busy owners can be skipped without blocking the next eligible owner', () => {
  const eligible = orderDirectorOwnersForFairness(owners, 'a').filter(owner => owner.id !== 'b')
  const next = eligible[0]
  assert.equal(next.id, 'c')
  assert.deepEqual(ids(orderDirectorOwnersForFairness(owners, next.id)), ['a', 'b', 'c'])
})
