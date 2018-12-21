/* eslint-env mocha */
/* @flow */

const Promise = require('bluebird')
const _ = require('lodash')
const should = require('should')
const sinon = require('sinon')
const Buffer = require('../../../../core/local/steps/buffer')

/*::
import type { AtomWatcherEvent } from '../../../../core/local/steps/event'
*/

let _randomBatchNumber = 1

function atomWatcherEventBatch (batchNumber /*: ?number */) /*: AtomWatcherEvent[] */ {
  const batchName = batchNumber
    ? `batch-${batchNumber}`
    : `random-batch-${_randomBatchNumber++}`
  return [
    {action: 'created', kind: 'file', path: `file-from-${batchName}`},
    {action: 'deleted', kind: 'directory', path: `dir-from-${batchName}`}
  ]
}

async function flush (buffer /*: Buffer */) /*: Promise<AtomWatcherEvent[]> */ {
  const batches = []
  while (true) {
    try {
      batches.push(await buffer.pop().timeout(10))
    } catch (err) {
      if (err instanceof Promise.TimeoutError) {
        return batches
      } else {
        throw err
      }
    }
  }
}

should.Assertion.add('pending', function () {
  this.params = {operator: 'be pending'}
  this.obj.isPending().should.be.true()
})

describe('core/local/steps/Buffer', function () {
  this.timeout(100)

  let buffer

  beforeEach(() => {
    buffer = new Buffer()
  })

  describe('#push()', () => {
    it('inserts the given Batch into the Buffer so it may be retrieved with #pop()', async () => {
      const batch = atomWatcherEventBatch()

      buffer.push(batch)

      await should(buffer.pop()).be.fulfilledWith(batch)
    })
  })

  describe('#pop()', () => {
    it('successively resolves with each Batch in insertion order', async () => {
      const batches = _.times(3, () => atomWatcherEventBatch())

      batches.forEach(batch => buffer.push(batch))

      should(await flush(buffer)).deepEqual(batches)
    })

    describe('when all Batches were already popped', () => {
      beforeEach(async () => {
        buffer.push(atomWatcherEventBatch())
        await buffer.pop()
      })

      it('awaits for the next Batch', async () => {
        const nextBatchPromise = buffer.pop()
        const nextBatch = atomWatcherEventBatch()

        buffer.push(nextBatch)

        await should(nextBatchPromise).be.fulfilledWith(nextBatch)
      })
    })

    describe('when Buffer was never pushed anything', () => {
      it('awaits for the next Batch', async () => {
        const nextBatchPromise = buffer.pop()
        const nextBatch = atomWatcherEventBatch()

        buffer.push(nextBatch)

        await should(nextBatchPromise).be.fulfilledWith(nextBatch)
      })
    })

    describe('when called more than once on an empty Buffer (DO NOT DO THIS)', () => {
      it('only resolves the last Promise with the next Batch', async () => {
        const popPromise1 = buffer.pop()
        const popPromise2 = buffer.pop()
        const batch1 = atomWatcherEventBatch(1)
        const batch2 = atomWatcherEventBatch(2)

        buffer.push(batch1)
        buffer.push(batch2)

        await should(popPromise2).be.fulfilledWith(batch1)
        should(popPromise1).be.pending()
      })
    })
  })

  describe('#forEach()', () => {
    it.skip('is dead code')
  })

  describe('#asyncForEach()', () => {
    it('calls the given callback with each Batch pushed into the Buffer', async () => {
      const callback = sinon.stub()
      const batch1 = atomWatcherEventBatch(1)
      const batch2 = atomWatcherEventBatch(2)

      buffer.asyncForEach(callback)
      await Promise.delay(1)
      should(callback.args).deepEqual([])

      buffer.push(batch1)
      await Promise.delay(1)
      should(callback.args).deepEqual([
        [batch1]
      ])

      buffer.push(batch2)
      await Promise.delay(1)
      should(callback.args).deepEqual([
        [batch1],
        [batch2]
      ])
    })
  })

  describe('#doMap()', () => {
    it.skip('is only used internally in #map()')
  })

  describe('#map()', () => {
    it('returns a new Buffer', () => {
      const result = buffer.map(_.identity)

      should(result).be.an.instanceof(Buffer).not.equal(buffer)
    })

    it('is initially empty when the original was', async () => {
      const newBuffer = buffer.map(_.identity)

      should(await flush(newBuffer)).deepEqual([])
    })

    it('initially contains Batches from the original Buffer in same order transformed with the given function', async () => {
      const transform = batch => _.map(batch, 'path')
      const batch1 = atomWatcherEventBatch(1)
      const batch2 = atomWatcherEventBatch(2)

      buffer.push(batch1)
      buffer.push(batch2)

      const newBuffer = buffer.map(transform)

      should(await flush(newBuffer)).deepEqual([
        transform(batch1),
        transform(batch2)
      ])
    })

    it('indefinitely pops subsequent Batches from source Buffer and pushes them to the new one', async () => {
      const transform = batch => _.map(batch, 'path')
      const newBuffer = buffer.map(transform)
      const batch1 = atomWatcherEventBatch(1)

      buffer.push(batch1)

      should(await flush(newBuffer)).deepEqual([transform(batch1)])

      const batch2 = atomWatcherEventBatch(2)
      const batch3 = atomWatcherEventBatch(3)

      buffer.push(batch2)
      buffer.push(batch3)

      should(await flush(newBuffer)).deepEqual([
        transform(batch2),
        transform(batch3)
      ])
    })

    describe('not awaiting a previous #pop() call (DO NOT DO THIS)', () => {
      it('will prevent it from being ever fulfilled in case Buffer was empty', async () => {
        const popPromise = buffer.pop()
        const newBuffer = buffer.map(_.identity)
        const batch = atomWatcherEventBatch()

        buffer.push(batch)

        should(await flush(newBuffer)).deepEqual([batch])
        should(popPromise).be.pending()
      })
    })
  })

  describe('#doAsyncMap()', () => {
    it.skip('is only used internally in #asyncMap()')
  })

  describe('#asyncMap()', () => {
    it('does the same as #map() awaiting each transform to preserve order', async () => {
      const batch1 = atomWatcherEventBatch(1)
      const batch2 = atomWatcherEventBatch(2)
      let resolveTransform1 = (batch) => { throw new Error('resolveTransform1 not set') }
      let resolveTransform2 = (batch) => { throw new Error('resolveTransform2 not set') }
      const transformPromise1 = new Promise(resolve => { resolveTransform1 = resolve })
      await Promise.delay(1)
      const transformPromise2 = new Promise(resolve => { resolveTransform2 = resolve })
      await Promise.delay(1)
      const transform = (batch) => {
        if (batch === batch1) return transformPromise1
        if (batch === batch2) return transformPromise2
        return Promise.reject(new Error('Unknown batch'))
      }
      const newBuffer = buffer.asyncMap(transform)

      buffer.push(batch1)
      await Promise.delay(1)

      should(await flush(newBuffer)).deepEqual([])

      buffer.push(batch2)
      await Promise.delay(1)

      should(await flush(newBuffer)).deepEqual([])

      resolveTransform2('bar')
      await Promise.delay(1)

      should(await flush(newBuffer)).deepEqual([])

      resolveTransform1('foo')
      await Promise.delay(1)

      should(await flush(newBuffer)).deepEqual([
        'foo', // FIXME: randomly missing
        'bar'
      ])
    })
  })

  it('does not care about Batch equality', async () => {
    const batch = atomWatcherEventBatch()

    buffer.push(batch)
    buffer.push(batch)

    await should(buffer.pop()).be.fulfilledWith(batch)
    await should(buffer.pop()).be.fulfilledWith(batch)
  })
})
