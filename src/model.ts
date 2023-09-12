type Func<TIn = any, TOut = any> = (arg: TIn) => Promise<TOut>

interface RootNode<N extends string = string, TIn = any, TOut = any> {
  name: N
  run: Func<TIn, TOut>
}

interface ChildNode<N extends string = string, TIn = any, TOut = any> extends RootNode<N, TIn, TOut> {
  parent: TreeNode
}

type TreeNode<N extends string = string, TIn = any, TOut = any> = RootNode<N, TIn, TOut> | ChildNode<N, TIn, TOut>

type IsChildNode<T> = "parent" extends keyof T ? true : false

type EnsureNodeArray<T> = T extends TreeNode[] ? T : never

type FindRootNode<T extends TreeNode[]> = T extends [infer First, ...infer Rest]
  ? IsChildNode<First> extends true
    ? FindRootNode<EnsureNodeArray<Rest>>
    : First
  : never

type ExtractNode<M extends TreeNode[], N extends string> = Extract<M[number], { name: N }>

type NodeName<M> = M extends TreeNode<infer N>[] ? N : never

type RemoveFuncPrefix<T extends string> = T extends `with${infer U}` ? Uncapitalize<U> : never
type AddFuncPrefix<T extends string> = `with${Capitalize<T>}`

type Model<T, M extends TreeNode[]> = Omit<
  {
    [K in AddFuncPrefix<NodeName<M>>]: K extends string
      ? () => Model<T & Record<RemoveFuncPrefix<K>, Awaited<ReturnType<ExtractNode<M, RemoveFuncPrefix<K>>["run"]>>>, M>
      : never
  },
  FindRootNode<M> extends { name: string } ? AddFuncPrefix<FindRootNode<M>["name"]> : never
> & {
  compile: (
    ...args: FindRootNode<M> extends { run: (...args: any) => any } ? Parameters<FindRootNode<M>["run"]> : never
  ) => Promise<T> &
    (FindRootNode<M> extends { run: (...args: any) => any } ? ReturnType<FindRootNode<M>["run"]> : never)
}

function extractRootNode<M extends TreeNode[]>(nodes: M) {
  const rootNodes = nodes.filter((x) => !("parent" in x))

  if (rootNodes.length === 0) {
    throw new Error("No root node found")
  }

  if (rootNodes.length > 1) {
    throw new Error("You can only have one root node")
  }

  return rootNodes[0] as RootNode
}

function addFunctionPrefix(name: string) {
  return `with${name.charAt(0).toUpperCase() + name.slice(1)}`
}

export function declareModel<T, M extends TreeNode<any, any, any>[]>(...nodes: M): Model<T, M> {
  const rootNode = extractRootNode(nodes)
  const parentChildrenToVisit = new Map<TreeNode, Set<TreeNode>>()
  const builder: any = {}

  const addNodeToVisit = (node: M[number]) => {
    // Break the recursion if we've reached the root.
    if (!("parent" in node)) {
      return
    }

    // Register that we want to visit this node after our parent node has been processed.
    // Remember, a sibling node might already have added itself to the set.
    const siblings = parentChildrenToVisit.get(node.parent)
    if (siblings) {
      siblings.add(node)
    } else {
      parentChildrenToVisit.set(node.parent, new Set([node]))
    }

    // This could be a leaf node with no direct connection to the root.
    // Therefore, we need to walk up its ancestry path until we reach the
    // top, which is going to serve as the starting point of the traversal.
    addNodeToVisit(node.parent)
  }

  // Add functions that, when invoked, marks a node for visitation
  nodes.forEach((node) => {
    if ("parent" in node) {
      builder[addFunctionPrefix(node.name)] = function () {
        addNodeToVisit(node)
        return builder
      }
    }
  })

  builder.compile = async (...args: any[]) => {
    // Base the model on the return type of the root node.
    let model = await (rootNode as any).run(...args)
    // Exit early if we don't have any child nodes to visit.
    if (parentChildrenToVisit.size === 0) {
      return model
    }

    // We'll slice the tree layer by layer. Here, we'll start with
    // nodes that are direct descendants of the root node.
    const children = parentChildrenToVisit.get(rootNode)
    // The queue will contain tuples: the first value represents
    // the node to execute, and the second is the resolved value
    // from its parent node, used as input for the "run" function.
    const queue = [...(children ?? [])].map((c) => [c, model])

    // Continuiously add properties to the model with each layer of nodes.
    while (queue.length > 0) {
      const nodesWithArgs = queue.splice(0, queue.length)
      // These nodes carry their required input in the tuple and can run concurrently.
      const promises = nodesWithArgs.map(([node, arg]) => node.run(arg))
      const responses = await Promise.all(promises)

      // Decorate the model with fields from this layer
      model = responses.reduce((acc, cur, i) => ({ ...acc, [nodesWithArgs[i][0].name]: cur }), model)

      // Loop through the nodes to see if we have any child nodes marked
      // for visitation. If found, we add them to the queue along with
      // the node's resolved value, which serves as their input.
      for (let i = 0; i < nodesWithArgs.length; i++) {
        const childrenToVisit = parentChildrenToVisit.get(nodesWithArgs[i][0])
        if (!childrenToVisit) {
          continue
        }
        queue.push(...[...childrenToVisit].map((x) => [x, responses[i]]))
      }
    }
    return model
  }

  return builder
}
