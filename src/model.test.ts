import { declareModel } from "./model"

// Return a promise that resolves the value instantly.
function resolveValue(value: number): Promise<{ value: number }> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ value }), 0)
  })
}

/* createNodes return nodes that form a tree of this structure:

                    ┌─────┐
           ┌───────▶│  0  │◀───────┐
           │        └─────┘        │
           │                       │
           │                       │
           │                       │
           │                       │
        ┌─────┐                 ┌─────┐
   ┌───▶│  1  │◀──┐             │  2  │
   │    └─────┘   │             └─────┘
   │              │                ▲
   │              │                │
┌─────┐        ┌─────┐          ┌─────┐
│  3  │        │  4  │     ┌───▶│  5  │◀───┐
└─────┘        └─────┘     │    └─────┘    │
                           │               │
                           │               │
                        ┌─────┐         ┌─────┐
                        │  6  │         │  7  │
                        └─────┘         └─────┘

*/
function createNodes() {
  const nodeZero = { name: "zero" as const, run: (x: number) => resolveValue(x) }
  const nodeOne = { name: "one" as const, parent: nodeZero, run: (_: number) => resolveValue(1) }
  const nodeTwo = { name: "two" as const, parent: nodeZero, run: (_: number) => resolveValue(2) }
  const nodeThree = { name: "three" as const, parent: nodeOne, run: (_: number) => resolveValue(3) }
  const nodeFour = { name: "four" as const, parent: nodeOne, run: (_: number) => resolveValue(4) }
  const nodeFive = { name: "five" as const, parent: nodeTwo, run: (_: number) => resolveValue(5) }
  const nodeSix = { name: "six" as const, parent: nodeFive, run: (_: number) => resolveValue(6) }
  const nodeSeven = { name: "seven" as const, parent: nodeFive, run: (_: number) => resolveValue(7) }
  return [nodeZero, nodeOne, nodeTwo, nodeThree, nodeFour, nodeFive, nodeSix, nodeSeven] as const
}

function assertNodeInvocations(nodes: ReturnType<typeof createNodes>, indexArgs: Array<[number, number]>) {
  nodes.forEach((node, i) => {
    const idxArg = indexArgs.find(([index]) => index === i)
    if (idxArg) {
      expect(node.run).toBeCalledTimes(1)
      expect(node.run).toBeCalledWith(idxArg[0] == 0 ? idxArg[1] : { value: idxArg[1] })
    } else {
      expect(node.run).toBeCalledTimes(0)
    }
  })
}

// Used to flush out the promises from the layer above.
async function flushNumOfParentNodes(numberOfNodes: number) {
  for (let i = 0; i < numberOfNodes; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve()
  }
}

describe("declareModel", () => {
  it("processes the tree layer by layer into a model", async () => {
    const nodes = createNodes()
    const modelBuilder = declareModel(...nodes)

    // Enable fake timers. We'll want to assert that the tree is processed layer
    // by layer. We'll also attach spies to the run function of every node.
    jest.useFakeTimers()
    nodes.forEach((node) => jest.spyOn(node, "run"))

    // We are going to select a subset from the entire domain model by
    // picking node 3 and 7. Initially, we won't await this call. This
    // will enable us to to make assertions on the traversal.
    const modelPromise = modelBuilder.withThree().withSeven().compile(20)

    // Layer 1 should only call the run function of the root
    // node with the value passed to the compile function.
    assertNodeInvocations(nodes, [[0, 20]])

    // Proceed to layer 2 by advancing time and flushing the root node promise.
    jest.advanceTimersByTime(0)
    await flushNumOfParentNodes(1)

    // Layer 2 is expected to invoke the 'run' function for nodes 1 and 2, passing
    // in the values that have been resolved from each node's direct parent.
    assertNodeInvocations(nodes, [
      [0, 20],
      [1, 20],
      [2, 20],
    ])

    // Proceed to layer 3 by advancing time and flushing the promises from layer 2.
    jest.advanceTimersByTime(0)
    await flushNumOfParentNodes(2)

    // At this point, we're experiencing diminishing returns from continuously
    // asserting that each subsequent layer wasn't called. However, this is a
    // fairly small tree, so I think the extra assertions are justified.
    assertNodeInvocations(nodes, [
      [0, 20],
      [1, 20],
      [2, 20],
      [3, 1],
      [5, 2],
    ])

    // Proceed to layer 4 by advancing time and flushing promises.
    jest.advanceTimersByTime(0)
    await flushNumOfParentNodes(3)

    // Now we should have invoked the run method of node 7 which is our last node.
    assertNodeInvocations(nodes, [
      [0, 20],
      [1, 20],
      [2, 20],
      [3, 1],
      [5, 2],
      [7, 5],
    ])

    // Advancing one more time here will allow the modelPromise to resolve.
    jest.advanceTimersByTime(0)

    // We can now await the modelPromise and assert the structure.
    const model = await modelPromise

    // The root value is going to be whatever we used to start the tree traversal.
    expect(model.value).toBe(20)
    expect(model.three.value).toBe(3)
    expect(model.seven.value).toBe(7)
  })
})
