import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { createPythonFinder, probePython } from './research-python-finder.mjs'

const hasPython = spawnSync('python3', ['--version'], { stdio: 'ignore' }).status === 0

test('the finder asks each candidate for the modules it was made for', async () => {
  const asked = []
  const find = createPythonFinder({
    modules: ['numpy', 'matplotlib'],
    home: '/home/u',
    platform: 'linux',
    probe: async (candidate, modules) => {
      asked.push([candidate, modules.join(',')])
      return candidate === 'python'
    },
    listCondaPythons: async () => assert.fail('PATH had one')
  })
  assert.equal(await find(), 'python')
  assert.deepEqual(asked, [
    ['python3', 'numpy,matplotlib'],
    ['python', 'numpy,matplotlib']
  ])
  assert.equal(await find(), 'python')
  assert.equal(asked.length, 2)
})

test('Windows tries python before python3, and an explicit one first', async () => {
  const asked = []
  const find = createPythonFinder({
    modules: ['json'],
    platform: 'win32',
    probe: async (candidate) => {
      asked.push(candidate)
      return false
    },
    listCondaPythons: async () => []
  })
  assert.equal(await find('C:/py/python.exe'), null)
  assert.deepEqual(asked, ['C:/py/python.exe', 'python', 'python3'])
})

test(
  'a real probe accepts a Python that imports the modules and refuses a missing module',
  { skip: hasPython ? false : 'python3 is not installed' },
  async () => {
    assert.equal(await probePython('python3', ['json', 'math']), true)
    assert.equal(await probePython('python3', ['aster_no_such_module']), false)
    assert.equal(await probePython('/no/such/python', ['json']), false)
  }
)
