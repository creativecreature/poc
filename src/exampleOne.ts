import { declareModel } from "./model"

// This file includes a somewhat realistic example of how to divide a tree into branches.

// The `fetchMovie` function embodies the typical use case where data must be aggregated
// from multiple microservices to construct a comprehensive model that accurately
// represents a movie within our domain. No single source of data is enough on its own.
async function fetchFullMovie(id: number) {
  const metadataRequest = Promise.resolve({ id, title: "Movie title", rating: 4.5 })
  const imagesRequest = Promise.resolve([{ src: "https://example.com/image.jpg" }])
  const progressRequest = Promise.resolve({ watched: 0.5 })
  const [metadata, images, progress] = await Promise.all([metadataRequest, imagesRequest, progressRequest])
  return { id, metadata, images, progress }
}

// This should be the starting point of every tree. We are going to create a
// builder from a single root node that represents the entire domain model.
const fullMovieRoot = { name: "movie" as const, run: fetchFullMovie }
async function printFullMovieModel() {
  const builder = declareModel(fullMovieRoot)
  const movie = await builder.compile(1)
  console.log(movie)
}
printFullMovieModel()

// Now, let's say upon monitoring the application it becomes evident that the
// progress data is personalized, complicating caching. In some instances, we've
// also observed that we hydrate this model without even utilizing this field.
// Therefore, to improve the performance of our application by not fetching more
// data than we actually need, we'll proceed by dividing this node into two.
// NOTE: For the sake of simplicity, I've created our current tree with a single
// node. However, the process of splitting a node, and adding new branches, is
// going to look the same regardless of its position within any given tree.

// To be able to divide the two nodes, we'll start by separating the fetchers:
async function fetchMovie(id: number) {
  const metadataRequest = Promise.resolve({ title: "Movie title", rating: 4.5 })
  const imagesRequest = Promise.resolve([{ src: "https://example.com/image.jpg" }])
  const [metadata, images] = await Promise.all([metadataRequest, imagesRequest])
  return { id, ...metadata, images }
}

async function fetchProgress<T extends { id: number }>(obj: T) {
  // I'm just using the id here for demonstration purposes
  return Promise.resolve({ watched: `${obj.id * 2}%` })
}

const rootNode = { name: "movie" as const, run: fetchMovie }
const progressNode = { name: "progress" as const, parent: rootNode, run: fetchProgress }

async function printMovie() {
  const builder = declareModel(rootNode, progressNode)

  // Now we're able to
  const movieWithoutProgress = await builder.compile(5)
  console.log(movieWithoutProgress.id) // 10

  // Create a model that has the metadata and progress
  const movieWithProgress = await builder.withProgress().compile(10)
  console.log(movieWithProgress.id) // 10
  console.log(movieWithProgress.progress.watched) // 20%
}
printMovie()

// Using the above code, we've constructed the following linear tree:
// ┌────────┐
// │ Movie  │
// └────────┘
//      ▲
//      │
//      │
// ┌────────┐
// │Progress│
// └────────┘
//
// This approach might be acceptable if the movie data is heavily cached. Yet, fetching
// progress does not depend on the movie request. As demonstrated in the fetchFullMovie
// function, we can invoke our "microservices" in parallel, provided we have the ID.

// To remove the dependency between our Movie and Progress node, we can create a new root node
// that immediately resolves a promise with the id. The nodes will then become siblings on the
// same layer in our tree, which enables them to be processed in parallel:
//
//            ┌────────┐
//      ┌────▶│   Id   │◀─────┐
//      │     └────────┘      │
//      │                     │
//      │                     │
//      │                     │
// ┌────────┐            ┌────────┐
// │Progress│            │ Movie  │
// └────────┘            └────────┘

const newRootNode = { name: "id" as const, run: (id: number) => Promise.resolve({ id }) }
const newMetadataNode = { name: "metadata" as const, parent: newRootNode, run: fetchMovie }
const newProgressNode = { name: "progress" as const, parent: newRootNode, run: fetchProgress }

async function printParallelProcessing() {
  const builder = declareModel(newRootNode, newMetadataNode, newProgressNode)

  // Create a model with just the progress
  const onlyProgress = await builder.withProgress().compile(5)
  console.log(onlyProgress.progress.watched)

  // Create a model with just the metadata
  const onlyMetadata = await builder.withMetadata().compile(10)
  console.log(onlyMetadata.metadata.rating)

  // Create a full model with all data
  const fullMovie = await builder.withMetadata().withProgress().compile(15)
  console.log(fullMovie.progress.watched)
  console.log(fullMovie.metadata.rating)
  console.log(onlyMetadata.metadata.rating)
}

printParallelProcessing()
