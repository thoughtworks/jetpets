# Agile Australia game

## Getting set up

Install Node.js version `0.10.x` ([homebrew](http://mxcl.github.io/homebrew/) is recommended for OSX), then run

```
npm install -g grunt-cli
npm install
```

## Build time!

We use [grunt](http://gruntjs.com).
This builds all assets into `build`, and watches for any changes:

```
grunt
```

To run the unit tests:
```
grunt test
```

## Running the game

```
npm start
```

This also restarts the server

- if something goes wrong
- when any server-side code changes

## Deploying to an external server (ex: Raspberry PI)

The game needs to be built locally first, and the server will just:

- run the server code (`/src`)
- serve static assets & files (`/builtAssets`)

Just run `make deploy` to build & copy all the required files over SSH.
The server will need to run `npm install --production` to get all the runtime dependencies.

## Attribution

Thanks to http://www.freesfx.co.uk for the free sound effects
