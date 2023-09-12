import { declareModel } from "./model"

function fetchSeries(id: number) {
  return Promise.resolve({
    id,
    name: "name of the series",
    seasonIds: ["1", "2", "3"],
  })
}

function fetchMovie(id: number) {
  return Promise.resolve({
    id,
    name: "name of the movie",
  })
}

function fetchProgress<T extends { id: number }>(obj: T) {
  return Promise.resolve({ percentageWatched: `${obj.id * 2}%` })
}

const seriesRoot = { name: "series" as const, run: fetchSeries }
const seriesProgress = { name: "progress" as const, parent: seriesRoot, run: fetchProgress }

const movieRoot = { name: "movie" as const, run: fetchMovie }
const movieProgress = { name: "progress" as const, parent: movieRoot, run: fetchProgress }

// The code above creates two separate linear trees. However, by extracting
// the progress fetching into a generic function, we can conceptually
// think of the two trees above as a directed acyclic graph:
//
// ┌────────┐        ┌────────┐
// │ Series │        │ Movie  │
// └────────┘        └────────┘
//      ▲                 ▲
//      │                 │
//      │                 │
//      │                 │
//      │   ┌────────┐    │
//      └───│Progress│────┘
//          └────────┘
//
// We can reuse all the code from the fetchProgress function
// to decorate both of our models with additional data.

async function printModels() {
  const seriesBuilder = declareModel(seriesRoot, seriesProgress)
  const movieBuilder = declareModel(movieRoot, movieProgress)

  const series = await seriesBuilder.withProgress().compile(14)
  console.log(series.progress.percentageWatched) // 28%

  const movie = await movieBuilder.withProgress().compile(8)
  console.log(movie.progress.percentageWatched) // 16%
}

printModels()
